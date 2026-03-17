"""
Main entry point for the Multi-Agent Fact-Checking API.
This module defines the FastAPI application and its endpoints.
"""
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import os
import asyncio
import json
import logging
from typing import List
from dotenv import load_dotenv

load_dotenv() # Load environments from .env file

from services.inference import LLMInferenceWrapper
from services.orchestrator import FactCheckingOrchestrator
from services.model_armor import ModelArmorService
from services.database import DatabaseService
from services.vault import VaultService
from vertexai.generative_models import Tool

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Multi-Agent Fact-Checking API",
    description="An AI-powered system that analyzes text for bias, extracts claims, and verifies them using live search grounding."
)

# Enable CORS for local extension development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

db_service = DatabaseService()
vault_service = VaultService()
orchestrator = FactCheckingOrchestrator(db_service=db_service)
model_armor = ModelArmorService()

class ModelConfig(BaseModel):
    model_name: str
    engine: str
    use_vault: bool = False

class FactCheckRequest(BaseModel):
    text: str
    url: str
    title: str = ""
    inference_config: ModelConfig = None

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    query: str
    context: str
    history: List[ChatMessage] = []
    inference_config: ModelConfig = None
    use_vault: bool = False

llm_wrapper = LLMInferenceWrapper()

@app.get("/health")
async def health():
    """
    Health check endpoint to verify the service is running.
    """
    return {"status": "healthy"}

@app.post("/analyze")
async def analyze(request: FactCheckRequest):
    """
    Main endpoint for fact-checking analysis.
    Performs security screening via Model Armor and then orchestrates
    the multi-agent analysis flow, streaming results back via SSE.
    """
    # Initial security check
    is_safe = await model_armor.analyze_text(request.text)
    if not is_safe:
        raise HTTPException(status_code=400, detail="Potential security threat detected in input text.")
    
    # Start the orchestrator logic
    return StreamingResponse(
        orchestrator.process(request.text, request.url, request.title, request.inference_config.dict() if request.inference_config else None),
        media_type="text/event-stream"
    )

@app.post("/chat")
async def chat(request: ChatRequest):
    """
    Endpoint for interactive chat with the page context.
    Streams the response back via SSE.
    """
    sys_instruction = "You are FactLens, a highly intelligent and helpful AI assistant embedded in a web browser. Answer the user's questions utilizing the provided Page Context. Use Markdown for formatting and code blocks where appropriate. When possible, use Google Search to find latest information and cite your sources with markdown links like [Source Name](URL)."
    
    # Build google_search grounding tool
    search_tool = [Tool.from_dict({"google_search": {}})]
    
    # Format conversation history
    history_text = ""
    for msg in request.history:
        history_text += f"{msg.role.capitalize()}: {msg.content}\n"
        
    # Check Vault Grounding
    use_vault = request.use_vault or (request.inference_config and request.inference_config.use_vault)
    vault_context = ""
    if use_vault:
        logging.info(f"Searching vault for: {request.query}")
        vault_results = await vault_service.search(request.query)
        if vault_results:
            vault_context = "\n\nKnowledge Vault Context (Private Documents):\n" + \
                           "\n".join([f"Source: {r['title']}\nContent: {r['snippet']}" for r in vault_results])
            logging.info(f"Chat: Retrieved {len(vault_results)} snippets from vault.")

    prompt = f"Page Context:\n{request.context}\n{vault_context}\n\nChat History:\n{history_text}\nUser: {request.query}"
    
    # If vault was used, tell the AI to prioritize it
    if vault_context:
        sys_instruction += " Most importantly, you have access to the user's PRIVATE VAULT. If the answer is in the vault context, prioritize it and mention it is from the Knowledge Vault."
    
    async def event_generator():
        try:
            config = request.inference_config.dict() if request.inference_config else None
            async for chunk in llm_wrapper.generate_text_stream_async(prompt, sys_instruction, tools=search_tool, model_config=config):
                # We yield SSE formatted data
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.post("/vault/upload")
async def vault_upload(request: Request):
    form = await request.form()
    file = form.get("file")
    if not file:
        raise HTTPException(status_code=400, detail="No file uploaded")
    
    content = await file.read()
    vault_service.upload_file(content, file.filename)
    return {"status": "success", "filename": file.filename}

@app.get("/vault/list")
async def vault_list():
    files = vault_service.list_files()
    return {"files": files}

@app.delete("/vault/delete")
async def vault_delete(filename: str):
    success = vault_service.delete_file(filename)
    if success:
        return {"status": "success", "message": f"Deleted {filename}"}
    else:
        raise HTTPException(status_code=404, detail=f"File {filename} not found")

@app.get("/vault/view")
async def vault_view(filename: str):
    try:
        bucket = vault_service.storage_client.bucket(vault_service.bucket_name)
        blob = bucket.blob(filename)
        if not blob.exists():
            raise HTTPException(status_code=404, detail=f"File {filename} not found")
        
        content = blob.download_as_bytes()
        media_type = "application/pdf" if filename.lower().endswith(".pdf") else "text/plain"
        return StreamingResponse(
            iter([content]), 
            media_type=media_type,
            headers={
                "Content-Disposition": f"inline; filename={filename}",
                "Cache-Control": "no-cache"
            }
        )
    except Exception as e:
        import logging
        logging.error(f"Error viewing file {filename}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8080)))
