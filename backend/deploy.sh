#!/bin/bash

# Configuration
SERVICE_NAME="fastapi-backend"
REGION="us-central1"
PROJECT_ID="qwiklabs-asl-01-dee24014efed"

echo "Checking authentication..."
gcloud auth list --filter=status:ACTIVE --format="value(account)" || { echo "Not authenticated. Please run 'gcloud auth login'"; exit 1; }

echo "Setting project to $PROJECT_ID..."
gcloud config set project $PROJECT_ID

echo "Deploying $SERVICE_NAME to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --source . \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars "PROJECT_ID=$PROJECT_ID,LOCATION=$REGION,MODEL_INFERENCE_ENGINE=VERTEX_AI"

echo "Deployment complete!"
echo "Service URL:"
gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)'
