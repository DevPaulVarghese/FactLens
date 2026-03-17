import os
import logging
from typing import List, Dict, Any
from google.cloud import storage
from google.cloud import discoveryengine_v1 as discoveryengine
from google.protobuf.json_format import MessageToDict
from dotenv import load_dotenv
import json

load_dotenv()

class VaultService:
    """
    Service for managing the Knowledge Vault.
    Handles file storage in GCS and semantic search via Vertex AI Search.
    """
    def __init__(self):
        self.project_id = os.getenv("PROJECT_ID")
        self.location = os.getenv("VAULT_LOCATION", "global")
        self.bucket_name = os.getenv("GCS_BUCKET_NAME")
        self.data_store_id = os.getenv("DATA_STORE_ID")
        
        if not self.bucket_name:
            # Fallback for hackathon environment
            self.bucket_name = f"{self.project_id}-vault"
            
        self.storage_client = storage.Client()
        self.search_client = discoveryengine.SearchServiceClient()

    def upload_file(self, file_content: bytes, filename: str) -> str:
        """
        Uploads a file to the GCS bucket for indexing.
        """
        try:
            bucket = self.storage_client.bucket(self.bucket_name)
            # Create bucket if it doesn't exist
            if not bucket.exists():
                bucket = self.storage_client.create_bucket(self.bucket_name, location=self.location)
                logging.info(f"Created GCS bucket: {self.bucket_name}")
            
            blob = bucket.blob(filename)
            blob.upload_from_string(file_content)
            logging.info(f"Uploaded {filename} to {self.bucket_name}")
            return blob.public_url
        except Exception as e:
            logging.error(f"Failed to upload file to GCS: {e}")
            raise e

    def list_files(self) -> List[Dict[str, Any]]:
        """
        Lists files currently in the vault.
        """
        try:
            bucket = self.storage_client.bucket(self.bucket_name)
            if not bucket.exists():
                return []
            
            blobs = bucket.list_blobs()
            return [{"name": b.name, "size": b.size, "updated": b.updated} for b in blobs]
        except Exception as e:
            logging.error(f"Failed to list files in GCS: {e}")
            return []

    def delete_file(self, filename: str):
        """
        Deletes a file from the vault.
        """
        try:
            logging.info(f"VaultService: Attempting to delete {filename} from {self.bucket_name}")
            bucket = self.storage_client.bucket(self.bucket_name)
            blob = bucket.blob(filename)
            if not blob.exists():
                logging.warning(f"VaultService: File {filename} not found in bucket {self.bucket_name}")
                return False
            blob.delete()
            logging.info(f"VaultService: Successfully deleted {filename}")
            return True
        except Exception as e:
            logging.error(f"VaultService: Failed to delete file {filename}: {e}")
            raise e

    async def search(self, query: str) -> List[Dict[str, Any]]:
        """
        Performs semantic search across the vault using Vertex AI Search.
        """
        if not self.data_store_id:
            logging.warning("DATA_STORE_ID not set. Vault search is disabled.")
            return []

        try:
            serving_config = self.search_client.serving_config_path(
                project=self.project_id,
                location=self.location,
                data_store=self.data_store_id,
                serving_config="default_serving_config",
            )

            request = discoveryengine.SearchRequest(
                serving_config=serving_config,
                query=query,
                page_size=3,
            )

            response = self.search_client.search(request)
            
            results = []
            for result in response:
                doc = result.document
                # Convert Protobuf to Dict safely
                data = MessageToDict(doc._pb).get("derivedStructData", {})
                logging.info(f"Vault Search: Found document {doc.id}")
                
                # Check all possible content fields
                snippet = ""
                # 1. Extractive answers
                answers = data.get("extractive_answers", [])
                if answers:
                    snippet = answers[0].get("content", "")
                
                # 2. Snippets
                if not snippet:
                    snippets = data.get("snippets", [])
                    if snippets:
                        snippet = snippets[0].get("snippet", "")
                
                # 3. GCS Content Fallback (CRITICAL for small/new files)
                link = data.get("link", "")
                if not snippet and link.startswith("gs://"):
                    try:
                        logging.info(f"Vault Search: Snippet empty, falling back to direct GCS download for {link}")
                        # Parse gs://bucket/phi
                        path_parts = link.replace("gs://", "").split("/", 1)
                        if len(path_parts) == 2:
                            b_name, b_path = path_parts
                            bucket = self.storage_client.bucket(b_name)
                            blob = bucket.blob(b_path)
                            snippet = blob.download_as_text()
                            # Limit snippet size
                            if len(snippet) > 2000:
                                snippet = snippet[:2000] + "..."
                    except Exception as ge:
                        logging.error(f"Vault Search: GCS fallback failed for {link}: {ge}")

                # 4. Final last resort
                if not snippet:
                    snippet = f"Document found: {doc.id}"
                
                results.append({
                    "title": doc.id,
                    "snippet": snippet,
                    "link": link
                })
            return results
        except Exception as e:
            logging.error(f"Vertex AI Search failed: {e}")
            return []
