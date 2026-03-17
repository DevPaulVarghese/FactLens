# Deploy to Cloud Run (Windows PowerShell)

# Configuration
$SERVICE_NAME="fastapi-backend"
$REGION="us-central1"
$PROJECT_ID="qwiklabs-asl-01-dee24014efed"

Write-Host "Setting project to $PROJECT_ID..."
gcloud config set project $PROJECT_ID

Write-Host "Deploying $SERVICE_NAME to Cloud Run..."
gcloud run deploy $SERVICE_NAME `
  --source . `
  --region $REGION `
  --allow-unauthenticated `
  --set-env-vars "PROJECT_ID=$PROJECT_ID,LOCATION=$REGION,MODEL_INFERENCE_ENGINE=VERTEX_AI"

Write-Host "Deployment complete!"
$URL = gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)'
Write-Host "Service URL: $URL"
