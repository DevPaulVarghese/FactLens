"""
Bias Detection Agent.
Analyzes text and source URLs for political leaning, sentiment, and framing.
"""
from services.inference import LLMInferenceWrapper

class BiasDetector:
    """
    Agent for identifying media bias and emotional framing.
    Provides standardized metrics for leaning and sentiment.
    """
    def __init__(self, inference: LLMInferenceWrapper):
        self.inference = inference
        self.system_instruction = (
            "You are an expert media analyst. Analyze the provided text and URL for bias.\n"
            "Metrics:\n"
            "1. Political Leaning: (Left, Center-Left, Center, Center-Right, Right)\n"
            "2. Bias Score: (0-10, where 0 is neutral)\n"
            "3. Framing: Identify emotional or manipulative language.\n"
            "Format: Leaning: [Leaning]. Bias Score: [X/10]. Reasoning: [1-sentence explanation]."
        )

    async def detect(self, text: str, url: str, model_config: dict = None, context_extra: str = "") -> str:
        """
        Detects bias in the content, optionally grounded in vault context.
        """
        # Focus on the first 2000 characters for bias detection to save context
        sample_text = text[:2000]
        prompt = f"Analyze bias for this article (URL: {url}):\n\n{sample_text}"
        if context_extra:
            prompt += f"\n\nAdditional context from user's private vault:\n{context_extra}"
        return await self.inference.generate_text(prompt, self.system_instruction, model_config=model_config)
