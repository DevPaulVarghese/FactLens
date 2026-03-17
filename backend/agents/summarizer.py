"""
Summarization Agent.
Synthesizes fact-checking and bias results into a final trust assessment.
"""
from services.inference import LLMInferenceWrapper

class Summarizer:
    """
    Agent responsible for the final consolidation of findings.
    Calculates a Trust Score based on verification results and bias analysis.
    """
    def __init__(self, inference: LLMInferenceWrapper):
        self.inference = inference
        self.system_instruction = (
            "You are the Lead Editor of a premium fact-checking newsroom.\n"
            "Your task is to review all findings (claims, verdicts, bias) and provide a final authoritative summary.\n"
            "Grading Scale:\n"
            "A: All claims verified, neutral source.\n"
            "B: Mostly verified, slight bias.\n"
            "C: Significant unverified claims or notable bias.\n"
            "D: Multiple false claims or heavy manipulation.\n"
            "F: Egregious misinformation or propaganda.\n"
            "Format: Final Grade: [Grade]. Verdict: [1-sentence authoritative summary]."
        )

    async def summarize(self, claims_results: list, bias_result: str, model_config: dict = None) -> str:
        """
        Synthesizes results into a final user-facing verdict.
        
        Args:
            claims_results (list): Verification reports for all claims.
            bias_result (str): The result from the BiasDetector.
            
        Returns:
            str: Final Grade and Verdict.
        """
        results_str = "\n".join([f"- {r}" for r in claims_results])
        prompt = (
            f"Review these findings and provide a final grade and verdict.\n\n"
            f"BIAS ANALYSIS:\n{bias_result}\n\n"
            f"FACT-CHECKING RESULTS:\n{results_str}"
        )
        return await self.inference.generate_text(prompt, self.system_instruction, model_config=model_config)
