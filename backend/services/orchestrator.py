"""
Orchestration layer for the multi-agent fact-checking flow.
Coordinates claim extraction, verification, bias detection, and summarization.
"""
import asyncio
import json
import logging
from typing import List, Optional, Dict, Any, Tuple
from services.inference import LLMInferenceWrapper
from agents.extractor import ClaimExtractor
from agents.verifier import Verifier
from agents.bias_detector import BiasDetector
from agents.summarizer import Summarizer
from agents.researcher import Researcher

class FactCheckingOrchestrator:
    """
    Orchestrates the end-to-end fact-checking process.
    Main coordinator for robust execution with timeouts and agent failure recovery.
    """
    def __init__(self, db_service=None):
        """
        Initialize the orchestrator with its constituent agents.
        """
        self.inference = LLMInferenceWrapper()
        self.extractor = ClaimExtractor(self.inference)
        self.verifier = Verifier(self.inference)
        self.bias_detector = BiasDetector(self.inference)
        self.summarizer = Summarizer(self.inference)
        self.researcher = Researcher(self.inference)
        self.db_service = db_service
        self.db_service = db_service
        self.agent_timeout = 180  # Increased to 180s to handle large articles/extractions

    async def process(self, text: str, url: str, title: str = "", model_config: Optional[Dict] = None):
        """
        Process a fact-check request using the multi-agent pipeline with concurrent research.
        """
        try:
            # Shared state for parallel tasks
            claims = []
            verification_results = []
            bias_result = "Analysis pending..."
            similar_articles = []
            
            # --- PHASE 1: Concurrent Extraction, Bias Detection, and Research ---
            yield self._format_event("status", "Analyzing...")
            
            async def wrap_extraction():
                logging.info("Starting claim extraction...")
                res = await self.extractor.extract(text, model_config=model_config)
                logging.info(f"Extraction complete. Found {len(res)} claims.")
                return "claims", res

            async def wrap_bias():
                logging.info("Starting bias detection...")
                res = await self.bias_detector.detect(text, url, model_config=model_config)
                return "bias", res

            async def wrap_research():
                logging.info("Starting research for similar articles...")
                res = await self.researcher.find_similar(title or "Unknown Title", url, model_config=model_config)
                return "similar_articles", res

            pre_tasks = [wrap_extraction(), wrap_bias(), wrap_research()]
            
            # We use as_completed to yield bias/research results immediately while extraction is running
            for coro in asyncio.as_completed(pre_tasks, timeout=self.agent_timeout):
                event_type, data = await coro
                if event_type == "claims":
                    claims = data
                    yield self._format_event("claims", claims)
                elif event_type == "bias":
                    bias_result = data
                    yield self._format_event("bias", data)
                elif event_type == "similar_articles":
                    similar_articles = data
                    yield self._format_event("similar_articles", data)
                
                # Check if we should log the yielding
                if event_type != "claims": # Claims are already yielded
                    logging.info(f"Yielding initial {event_type} event")
            
            if not claims:
                yield self._format_event("error", "No verifiable claims identified.")
                return

            # --- PHASE 2: Parallel Claim Verification ---
            yield self._format_event("status", f"Verifying {len(claims)} claims...")
            
            verification_results: List[Optional[str]] = [None] * len(claims)
            semaphore = asyncio.Semaphore(10)
            
            async def wrap_verification(i, claim):
                async with semaphore:
                    try:
                        result = await self.verifier.verify(claim, model_config=model_config)
                        res_text, sources = result if isinstance(result, tuple) else (result, [])
                        return "verification", {"index": i, "claim": claim, "result": res_text, "sources": sources}
                    except Exception as e:
                        logging.error(f"Verification failed for claim '{claim}': {e}")
                        return "verification", {"index": i, "claim": claim, "result": "Verification unavailable.", "sources": []}

            v_tasks = [wrap_verification(i, c) for i, c in enumerate(claims)]
            
            try:
                # Dynamic timeout based on claim count
                loop_timeout = max(self.agent_timeout, len(claims) * 5)
                for coro in asyncio.as_completed(v_tasks, timeout=loop_timeout):
                    event_type, data = await coro
                    # verification results are processed as they arrive
                    v_text = data.get('result')
                    if not v_text or not v_text.strip():
                        data['result'] = "Inconclusive: No verification data returned from AI."
                    verification_results[data['index']] = data['result']
                    
                    yield self._format_event("verification", data)
            except asyncio.TimeoutError:
                logging.warning("Verification loop timed out. Filling missing results.")
                for i in range(len(claims)):
                    if verification_results[i] is None:
                        verification_results[i] = "Verification timed out."
                        yield self._format_event("verification", {"index": i, "claim": claims[i], "result": verification_results[i], "sources": []})

            # --- PHASE 3: Final Summary ---
            yield self._format_event("status", "Summarizing...")
            summary = await asyncio.wait_for(
                self.summarizer.summarize(verification_results, bias_result, model_config=model_config),
                timeout=self.agent_timeout
            )
            yield self._format_event("summary", summary)

            # --- PHASE 4: Persistence ---
            if self.db_service:
                try:
                    self.db_service.log_result(url, {
                        "claims": claims,
                        "verifications": verification_results,
                        "bias": bias_result,
                        "summary": summary
                    })
                except Exception as e:
                    logging.error(f"Failed to log results to database: {e}")

            yield self._format_event("status", "Ready")

        except asyncio.TimeoutError:
            yield self._format_event("error", "The analysis took too long. This usually happens with very long articles. Try a smaller section or retry later.")
        except Exception as e:
            logging.error(f"Orchestration failed: {e}")
            yield self._format_event("error", f"An unexpected error occurred: {str(e)}")

    def _format_event(self, event_type: str, data: any):
        """Formats data into a Server-Sent Event (SSE) string."""
        return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
