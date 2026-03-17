"""
Claim Extraction Agent.
Identifies atomic, verifiable factual claims from raw text as EXACT VERBATIM quotes.
"""
import json
import logging
import re
from typing import List
from services.inference import LLMInferenceWrapper

class ClaimExtractor:
    """
    Agent responsible for extracting atomic, verifiable claims from raw text.
    Claims are returned as exact verbatim quotes so they can be located in the page.
    """
    def __init__(self, inference: LLMInferenceWrapper):
        self.inference = inference
        self.system_instruction = (
            "You are a professional fact-checker's research assistant. "
            "Your task is to extract atomic, independently verifiable, significant factual claims from the provided text.\n"
            "CRITICAL RULES:\n"
            "1. Every claim MUST be an EXACT VERBATIM quote copied directly from the source text — character for character.\n"
            "2. Do NOT paraphrase, summarise, rewrite, or alter the wording in any way whatsoever.\n"
            "3. Only extract claims that appear word-for-word in the text. If you cannot find an exact sentence to copy, skip it.\n"
            "4. Ignore opinions, subjective statements, or vague generalizations.\n"
            "5. Each extracted claim must be a complete sentence exactly as it appears in the source.\n"
            "6. Return ONLY a valid JSON list of strings. Example: [\"Claim 1\", \"Claim 2\"]\n"
            "7. Do NOT include any explanation or commentary outside the JSON list."
        )

    async def extract(self, text: str, model_config: dict = None) -> List[str]:
        """
        Extracts factual claims from the provided text as exact verbatim quotes.

        Args:
            text (str): The raw text to process.

        Returns:
            List[str]: A list of verbatim factual claims copied from the source text.
        """
        prompt = (
            "Extract all significant verifiable claims from this text as EXACT VERBATIM quotes. "
            "Copy each claim word-for-word exactly as it appears in the source text below:\n\n"
            f"{text}"
        )
        response_text = await self.inference.generate_text(prompt, self.system_instruction, model_config=model_config)
        return self._parse_json_list(response_text)

    def _parse_json_list(self, text: str) -> List[str]:
        """Parses JSON list from response, using regex fallback if necessary."""
        try:
            # Clean possible markdown formatting
            clean_text = re.sub(r"```json\s*|\s*```", "", text).strip()
            return json.loads(clean_text)
        except Exception as e:
            logging.warning(f"JSON parsing failed, attempting regex fallback: {e}")
            # Fallback: extract strings inside quotes in a list-like structure
            claims = re.findall(r'"([^"]+)"', text)
            if claims:
                return [c for c in claims if len(c) > 10]
            return []
