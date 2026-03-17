# --- Vertex AI Search (Discovery Engine) Placeholder ---
# NOTE: As of current Terraform Google Provider, Discovery Engine resources 
# often require manual creation or the 'google-beta' provider for advanced features.
# This template provides the IAM roles necessary for the service account to access Vertex Search.

resource "google_project_iam_member" "discovery_engine_admin" {
  project = var.project_id
  role    = "roles/discoveryengine.admin"
  member  = "serviceAccount:${data.google_project.project.number}-compute@developer.gserviceaccount.com"
}

data "google_project" "project" {}
