import asyncio
import sys
import os

# Add parent directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from services.orchestrator import FactCheckingOrchestrator

async def main():
    print("Testing FactCheckingOrchestrator.process...")
    orch = FactCheckingOrchestrator()
    
    test_text = "The quick brown fox jumps over the lazy dog."
    test_url = "https://example.com"
    test_title = "Fox Jumps Over Dog"
    
    print(f"Analyzing: {test_title}")
    
    count = 0
    async for event in orch.process(test_text, test_url, test_title):
        count += 1
        if "similar_articles" in event:
            print("\nFOUND SIMILAR ARTICLES EVENT:")
            print(event)
        elif "status" in event:
            print(f"Status: {event.strip()}")
        else:
            # Print first 50 chars of other events
            print(f"Event: {event[:50]}...", end="\r")
            
    print(f"\nTotal events: {count}")

if __name__ == "__main__":
    asyncio.run(main())
