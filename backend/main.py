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
from typing import List
from dotenv import load_dotenv

load_dotenv() # Load environments from .env file

from services.inference import LLMInferenceWrapper
from services.orchestrator import FactCheckingOrchestrator
from services.model_armor import ModelArmorService
from services.database import DatabaseService
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
orchestrator = FactCheckingOrchestrator(db_service=db_service)
model_armor = ModelArmorService()

class ModelConfig(BaseModel):
    model_name: str
    engine: str

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
        
    prompt = f"Page Context:\n{request.context}\n\nChat History:\n{history_text}\nUser: {request.query}"
    
    async def event_generator():
        try:
            config = request.inference_config.dict() if request.inference_config else None
            async for chunk in llm_wrapper.generate_text_stream_async(prompt, sys_instruction, tools=search_tool, model_config=config):
                # We yield SSE formatted data
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8080)))
