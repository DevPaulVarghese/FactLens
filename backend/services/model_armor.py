"""
Model Armor Security Service.
Integrates with Google Cloud Model Armor to screen inputs for safety threats.
"""
import os
import logging
from google.cloud import modelarmor_v1

class ModelArmorService:
    """
    Service for content sanitization and safety filtering.
    Protects the system from prompt injection and sensitive data exposure.
    """
    def __init__(self):
        self.project_id = os.getenv("PROJECT_ID", "qwiklabs-asl-01-dee24014efed")
        self.location = os.getenv("LOCATION", "us-central1")
        self.client = None
        self.parent = f"projects/{self.project_id}/locations/{self.location}"

    async def analyze_text(self, text: str) -> bool:
        """
        Analyzes text for prompt injection, jailbreaks, and PII using the AsyncClient.
        """
        if self.client is None:
            try:
                self.client = modelarmor_v1.ModelArmorAsyncClient()
            except Exception as e:
                logging.warning(f"Could not initialize Model Armor async client: {e}. Running without security filter.")
                return True
        try:
            template_name = f"{self.parent}/templates/factmask-filter"
            
            request = modelarmor_v1.SanitizeUserPromptRequest(
                name=template_name,
                user_prompt_data=modelarmor_v1.DataItem(user_prompt_data=text),
            )
            
            # Using the async client method
            response = await self.client.sanitize_user_prompt(request=request)
            
            is_safe = response.sanitization_result.filter_match_state == modelarmor_v1.FilterMatchState.NO_MATCH
            
            if not is_safe:
                logging.warning(f"Model Armor: Security threat detected! Match state: {response.sanitization_result.filter_match_state}")
            
            return is_safe
        except Exception as e:
            logging.error(f"Model Armor analysis failed: {e}. Falling back to 'safe'.")
            return True 
