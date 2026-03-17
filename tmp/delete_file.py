import os
from google.cloud import storage
from dotenv import load_dotenv

# Load from backend/.env
load_dotenv("backend/.env")

project_id = os.getenv("PROJECT_ID")
bucket_name = os.getenv("GCS_BUCKET_NAME")

if not bucket_name:
    bucket_name = f"{project_id}-vault"

filename = "JMedLife-14-118.pdf"

print(f"Deleting {filename} from {bucket_name}...")

storage_client = storage.Client()
bucket = storage_client.bucket(bucket_name)

if not bucket.exists():
    print(f"Bucket {bucket_name} does not exist.")
else:
    blob = bucket.blob(filename)
    if blob.exists():
        blob.delete()
        print(f"Deleted {filename} successfully.")
    else:
        print(f"File {filename} not found in bucket.")
