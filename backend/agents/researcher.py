"""
Researcher Agent.
Finds similar articles and related coverage using Gemini's Google Search tool.
"""
from typing import List, Dict
from services.inference import LLMInferenceWrapper
from vertexai.generative_models import Tool
import json
import logging
import re

class Researcher:
    """
    Agent responsible for finding related coverage and similar articles.
    Uses Google Search grounding to discover high-quality external links.
    """
    def __init__(self, inference: LLMInferenceWrapper):
        self.inference = inference
        self.tools = [Tool.from_dict({"google_search": {}})]
        self.system_instruction = (
            "You are a professional news researcher. Your task is to find similar news articles "
            "or related coverage from different publishers for a given story.\n"
            "Search for diverse sources and provide a list of search results with titles and URLs."
        )

    async def find_similar(self, title: str, url: str, model_config: dict = None) -> List[Dict]:
        """
        Finds related articles using Google Search grounding.
        Returns a list of dictionaries with 'url' and 'title'.
        """
        logging.info(f"Researcher searching for related coverage of: {title}")
        try:
            # Command-style prompt to force search grounding and a specific JSON structure
            prompt = (
                f"Search Google for news articles similar to: '{title}'.\n"
                f"Provide a list of 5-10 related articles from different publishers. "
                f"Original source: {url}\n\n"
                f"CRITICAL: You MUST output ONLY a valid JSON array of objects. "
                f"Each object must have these exactly 4 keys: 'title', 'url' (the direct link to the article), "
                f"'domain' (just the core website name, e.g. 'bbc.com'), and 'summary' (a 1-2 sentence description).\n"
                f"Example:\n"
                f"[\n"
                f"  {{\"title\": \"Example Title\", \"url\": \"https://example.com/article\", \"domain\": \"example.com\", \"summary\": \"A brief summary.\"}}\n"
                f"]\n"
            )
            
            logging.info(f"Researcher using prompt: {prompt}")
            
            # Use generate_text_with_sources to get the grounding metadata (if available)
            text, sources = await self.inference.generate_text_with_sources(
                prompt, 
                system_instruction=self.system_instruction, 
                tools=self.tools,
                model_config=model_config
            )
            
            logging.info(f"Researcher received text response: {text[:100]}...")
            
            parsed_articles = []
            
            # Additional extraction: try to parse structured JSON from text
            if text:
                try:
                    # Look for JSON array block
                    json_match = re.search(r'\[\s*{.*}\s*\]', text, re.DOTALL)
                    if json_match:
                        json_str = json_match.group(0)
                        articles_data = json.loads(json_str)
                        for item in articles_data:
                            if isinstance(item, dict) and 'url' in item and 'title' in item:
                                parsed_articles.append({
                                    'title': item.get('title', '').strip(),
                                    'url': item.get('url', '').strip(),
                                    'domain': item.get('domain', '').strip(),
                                    'summary': item.get('summary', '').strip()
                                })
                        logging.info(f"Extracted {len(parsed_articles)} articles via JSON parsing.")
                    else:
                        logging.warning("No JSON block matched in response.")
                except json.JSONDecodeError as e:
                    logging.error(f"Failed to parse JSON array from text: {e}")
            
            # Merge parsed articles with grounding sources (where grounding might only have title/url)
            # Grounding chunks (vertexaisearch) are less desirable now since we want domain & summary
            all_sources = []
            seen_urls = set()
            
            # Prioritize the detailed JSON articles first
            for item in parsed_articles:
                u = item['url']
                logging.info(f"Evaluating JSON source: {u}")
                
                if not u:
                    logging.info("Skipping source with no URL")
                    continue
                
                # Normalize URL for comparison (remove trailing slashes)
                norm_u = u.rstrip('/')
                norm_orig = url.rstrip('/')
                
                if norm_u in seen_urls:
                    logging.info(f"Skipping duplicate: {norm_u}")
                    continue
                if norm_u == norm_orig:
                    logging.info(f"Skipping original URL: {norm_u}")
                    continue
                
                # Basic filtering
                is_social = any(domain in u.lower() for domain in ['facebook.com', 'twitter.com', 'instagram.com', 'linkedin.com'])
                if is_social:
                    logging.info(f"Skipping social media: {u}")
                    continue
                
                seen_urls.add(norm_u)
                all_sources.append(item)
                logging.info(f"Accepted JSON source: {item['title']}")
                
            # Then add grounding sources if they aren't duplicates
            for src in sources:
                u = src.get('url')
                t = src.get('title')
                logging.info(f"Evaluating grounding source: {t} | {u}")
                
                if not u:
                    continue
                
                norm_u = u.rstrip('/')
                norm_orig = url.rstrip('/')
                
                if norm_u in seen_urls:
                    continue
                if norm_u == norm_orig:
                    continue
                
                is_social = any(domain in u.lower() for domain in ['facebook.com', 'twitter.com', 'instagram.com', 'linkedin.com'])
                if is_social:
                    continue
                
                seen_urls.add(norm_u)
                # Ensure it matches the expected dict structure for the frontend
                all_sources.append({
                    'title': t or 'Related Article',
                    'url': u,
                    'domain': u.split('/')[2] if '//' in u else 'Link',
                    'summary': ''
                })
                logging.info(f"Accepted grounding source: {t}")
            
            logging.info(f"Researcher returning {len(all_sources)} unique sources.")
            return all_sources[:10]
        except Exception as e:
            logging.error(f"Researcher failed: {e}")
            return []
