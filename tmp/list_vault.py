import os
from google.cloud import storage
from dotenv import load_dotenv

# Load from backend/.env
load_dotenv("backend/.env")

project_id = os.getenv("PROJECT_ID")
bucket_name = os.getenv("GCS_BUCKET_NAME")

if not bucket_name:
    bucket_name = f"{project_id}-vault"

print(f"Checking bucket: {bucket_name}")

storage_client = storage.Client()
bucket = storage_client.bucket(bucket_name)

if not bucket.exists():
    print(f"Bucket {bucket_name} does not exist.")
else:
    blobs = list(bucket.list_blobs())
    print(f"Found {len(blobs)} files:")
    for blob in blobs:
        print(f" - {blob.name} (Size: {blob.size} bytes)")
