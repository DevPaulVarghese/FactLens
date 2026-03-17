import os
import requests
import json
import logging
import asyncio
from typing import AsyncGenerator, Optional, List, Dict
from google.auth import default
from vertexai.generative_models import GenerativeModel, Part
import vertexai

class LLMInferenceWrapper:
    """
    Abstraction layer over different LLM backends with production-grade retries.
    """
    def __init__(self):
        self.project_id = os.getenv("PROJECT_ID", "qwiklabs-asl-01-dee24014efed")
        self.location = os.getenv("LOCATION", "us-central1")
        logging.info(f"LLMInferenceWrapper initialized with location: {self.location}")
        self.engine = os.getenv("MODEL_INFERENCE_ENGINE", "VERTEX_AI")
        self.model_name = os.getenv("MODEL_NAME", "gemini-2.5-flash")
        self.vllm_service_url = os.getenv("VLLM_SERVICE_URL")
        self._vertex_initialized = False
        self.max_retries = 3
        self.retry_delay = 2 # seconds

    async def generate_text(self, prompt: str, system_instruction: Optional[str] = None, tools: Optional[List] = None, model_config: Optional[Dict] = None) -> str:
        """Generates text with exponential backoff on failure."""
        engine = model_config.get("engine", self.engine) if model_config else self.engine
        model_name = model_config.get("model_name", self.model_name) if model_config else self.model_name
        
        for attempt in range(self.max_retries):
            try:
                if engine == "VERTEX_AI":
                    return await self._generate_vertex(prompt, system_instruction, tools, model_name)
                elif engine == "MOCK":
                    return await self._generate_mock(prompt)
                else:
                    return await self._generate_vllm(prompt, system_instruction)
            except Exception as e:
                wait_time = self.retry_delay * (2 ** attempt)
                logging.warning(f"Inference attempt {attempt + 1} failed: {e}. Retrying in {wait_time}s...")
                await asyncio.sleep(wait_time)
        
        # Final fallback if all retries fail 
        raise Exception(f"Inference failed after {self.max_retries} attempts.")

    async def _generate_vertex(self, prompt: str, system_instruction: Optional[str], tools: Optional[List] = None, model_name: Optional[str] = None) -> str:
        if not self._vertex_initialized:
            try:
                creds, project = default()
                vertexai.init(project=self.project_id, location=self.location, credentials=creds)
                self._vertex_initialized = True
            except Exception as e:
                logging.error(f"Failed to initialize Vertex AI: {e}")
                raise e

        model = GenerativeModel(
            model_name or self.model_name, 
            system_instruction=[system_instruction] if system_instruction else None,
            tools=tools
        )
        
        response = await model.generate_content_async(prompt)
        try:
            return self._extract_text_from_candidate(response.candidates[0])
        except (IndexError, AttributeError):
            return "Error: No candidates returned from Vertex AI."

    async def generate_text_with_sources(self, prompt: str, system_instruction: Optional[str] = None, tools: Optional[List] = None, model_config: Optional[Dict] = None):
        """Generates text and also extracts grounding source URLs from Vertex AI metadata."""
        model_name = model_config.get("model_name", self.model_name) if model_config else self.model_name
        
        if not self._vertex_initialized:
            try:
                creds, project = default()
                vertexai.init(project=self.project_id, location=self.location, credentials=creds)
                self._vertex_initialized = True
            except Exception as e:
                logging.error(f"Failed to initialize Vertex AI: {e}")
                raise e

        model = GenerativeModel(
            model_name,
            system_instruction=[system_instruction] if system_instruction else None,
            tools=tools
        )

        response = await model.generate_content_async(prompt)
        
        # Safely extract text
        try:
            candidate = response.candidates[0]
            text = self._extract_text_from_candidate(candidate)
        except (IndexError, AttributeError):
            text = "Error: Model failed to provide a verification explanation."
            candidate = None

        # Extract source URLs from grounding metadata if available
        sources = []
        if candidate:
            try:
                grounding_meta = getattr(candidate, 'grounding_metadata', None)
                if grounding_meta:
                    chunks = getattr(grounding_meta, 'grounding_chunks', [])
                    logging.info(f"Inference found {len(chunks)} grounding chunks.")
                    for chunk in chunks:
                        web = getattr(chunk, 'web', None)
                        if web:
                            uri = getattr(web, 'uri', None)
                            title = getattr(web, 'title', None)
                            if uri:
                                sources.append({'url': uri, 'title': title or uri})
                else:
                    logging.info("No grounding metadata in candidate.")
            except Exception as e:
                logging.warning(f"Could not extract grounding sources: {e}")

        return text, sources

    def _extract_text_from_candidate(self, candidate) -> str:
        """Safely joins all text parts from a candidate, handling multi-part responses."""
        try:
            parts = candidate.content.parts
            text_parts = []
            for part in parts:
                if hasattr(part, 'text') and part.text:
                    text_parts.append(part.text)
            return "".join(text_parts).strip()
        except Exception as e:
            logging.error(f"Failed to extract text from candidate: {e}")
            return "Error: Could not parse model response."

    async def generate_text_stream_async(self, prompt: str, system_instruction: Optional[str] = None, tools: Optional[List] = None, model_config: Optional[Dict] = None) -> AsyncGenerator[str, None]:
        """Streams text chunks directly from Vertex AI, optionally with grounding tools."""
        model_name = model_config.get("model_name", self.model_name) if model_config else self.model_name
        
        if not self._vertex_initialized:
            try:
                creds, project = default()
                vertexai.init(project=self.project_id, location=self.location, credentials=creds)
                self._vertex_initialized = True
            except Exception as e:
                logging.error(f"Failed to initialize Vertex AI: {e}")
                raise e

        model = GenerativeModel(
            model_name, 
            system_instruction=[system_instruction] if system_instruction else None,
            tools=tools,
        )
        
        try:
            response_stream = await model.generate_content_async(prompt, stream=True)
            async for chunk in response_stream:
                try:
                    # In streaming, chunks usually have parts too
                    for part in chunk.candidates[0].content.parts:
                        if hasattr(part, 'text') and part.text:
                            yield part.text
                except (IndexError, AttributeError):
                    continue
        except Exception as e:
            logging.error(f"Streaming inference failed: {e}")
            raise e

    async def _generate_vllm(self, prompt: str, system_instruction: str) -> str:
        if not self.vllm_service_url:
            raise ValueError("VLLM_SERVICE_URL not configured")
        
        full_prompt = f"{system_instruction}\n\n{prompt}" if system_instruction else prompt
        payload = {
            "model": "meta-llama/Llama-3-8B-Instruct",
            "messages": [{"role": "user", "content": full_prompt}],
            "temperature": 0.2
        }
        
        response = requests.post(f"{self.vllm_service_url}/v1/chat/completions", json=payload, timeout=30)
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]

    async def _generate_mock(self, prompt: str) -> str:
        # Mock responses for testing
        return "MOCK: The system is operating in simulation mode."

