import os
import asyncio
from dotenv import load_dotenv
from backend.services.vault import VaultService

load_dotenv('backend/.env')

async def migrate_and_test():
    vault = VaultService()
    vault.location = "global" # Switch to global for search test
    
    # Check if secret_test.txt exists locally
    secret_file = 'secret_test.txt'
    if os.path.exists(secret_file):
        print(f"Uploading {secret_file} to the new bucket: {vault.bucket_name}...")
        with open(secret_file, 'rb') as f:
            content = f.read()
            vault.upload_file(content, secret_file)
        print("Upload successful.")
    else:
        print(f"Error: {secret_file} not found locally.")

    print(f"Testing search on Data Store: {vault.data_store_id}...")
    # Vertex AI Search can take a few minutes to index new files, 
    # so we'll just check if the search call itself succeeds (even if 0 results)
    try:
        results = await vault.search("Galactic Oranges")
        print(f"Search call successful. Found {len(results)} results.")
        for r in results:
            print(f" - {r['title']}: {r['snippet'][:50]}...")
    except Exception as e:
        print(f"Search call failed: {e}")

if __name__ == "__main__":
    asyncio.run(migrate_and_test())
