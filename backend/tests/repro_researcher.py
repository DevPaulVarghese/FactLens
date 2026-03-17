import os
import asyncio
import logging
from dotenv import load_dotenv

# Add the project root to sys.path
import sys
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from services.inference import LLMInferenceWrapper
from agents.researcher import Researcher

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

async def test_researcher():
    load_dotenv()
    
    title = "EXPERT REACTION: Could new coronavirus have come from snakes?"
    url = "https://www.sciencemediacentre.org/expert-reaction-could-new-coronavirus-have-come-from-snakes/"
    
    inference = LLMInferenceWrapper()
    researcher = Researcher(inference)
    
    print(f"\n--- Testing Researcher with title: {title} ---\n")
    
    # We'll try with the current logic first
    sources = await researcher.find_similar(title, url)
    
    print(f"\nFound {len(sources)} sources:")
    for src in sources:
        print(f" - {src.get('title')}: {src.get('url')}")
    
    if not sources:
        print("\n[!] No sources found. Retrying with a more aggressive prompt...\n")
        # Direct call to inference to see what's happening
        prompt = f"Search for and list 5 news articles from different sources that cover the same story as: '{title}'. You MUST provide URLs for each."
        text, debug_sources = await inference.generate_text_with_sources(
            prompt,
            system_instruction="You are an expert news librarian. Perform a Google Search and list citations with URLs.",
            tools=researcher.tools
        )
        print(f"Direct inference text response: {text[:200]}...")
        print(f"Direct inference sources found: {len(debug_sources)}")
        for src in debug_sources:
            print(f" - {src.get('title')}: {src.get('url')}")

if __name__ == "__main__":
    asyncio.run(test_researcher())
