"""
Verification Agent.
Verifies claims using live search grounding via Gemini's Google Search tool.
"""
from services.inference import LLMInferenceWrapper
from vertexai.generative_models import Tool

class Verifier:
    """
    Expert agent for factual verification.
    Uses multi-stage reasoning and live Google Search grounding.
    """
    def __init__(self, inference: LLMInferenceWrapper):
        self.inference = inference
        # Use google_search dict format as required by Vertex AI API
        self.tools = [Tool.from_dict({"google_search": {}})]
        self.system_instruction = (
            "You are a professional fact-checker. Your goal is to verify the accuracy of a specific claim.\n"
            "Process:\n"
            "1. Use Google Search to find credible sources (news, academic, official).\n"
            "2. Compare the search results with the claim.\n"
            "3. Determine a verdict: [TRUE], [FALSE], or [MISLEADING].\n"
            "4. Provide a concise 2-3 sentence explanation. Do NOT list or mention any references or sources in your explanation - they will be shown separately.\n"
            "5. IMPORTANT: If the verification is primarily based on information from the USER'S PRIVATE VAULT, append the tag [VAULT_GROUNDED] at the very end of your explanation.\n"
            "Format: Verdict: [Verdict]. Explanation: [Explanation]."
        )

    async def verify(self, claim: str, model_config: dict = None, context_extra: str = ""):
        """
        Verifies a claim using real-time search grounding and private vault context.
        """
        prompt = f"Verify this claim using live search data: {claim}"
        if context_extra:
            prompt += f"\n\nPRIORITY CONTEXT FROM USER'S PRIVATE VAULT:\n{context_extra}\n\nNote: Prioritize information found in the vault if it contradicts general search results."
        
        return await self.inference.generate_text_with_sources(
            prompt, 
            system_instruction=self.system_instruction, 
            tools=self.tools,
            model_config=model_config
        )
