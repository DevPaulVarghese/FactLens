terraform {
  required_version = ">= 1.0.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# 1. Artifact Registry for Docker Images
resource "google_artifact_registry_repository" "repo" {
  location      = var.region
  repository_id = var.service_name
  description   = "Docker repository for FactLens backend"
  format        = "DOCKER"
}

# 2. GCS Bucket for Knowledge Vault
resource "google_storage_bucket" "vault_bucket" {
  name     = "${var.project_id}-factlens-vault"
  location = var.region
  force_destroy = false

  uniform_bucket_level_access = true
}

# 3. Cloud Run Service (Backend)
resource "google_cloud_run_v2_service" "backend" {
  name     = var.service_name
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.repo.name}/backend:latest"
      
      env {
        name  = "PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "LOCATION"
        value = var.region
      }
      env {
        name  = "VAULT_LOCATION"
        value = "global"
      }
      env {
        name  = "GCS_BUCKET_NAME"
        value = google_storage_bucket.vault_bucket.name
      }
      # Other variables will be set via Secret Manager in a true prod environment
    }
  }
}

# 4. IAM - Allow unauthenticated access (External API)
resource "google_cloud_run_service_iam_member" "public_access" {
  location = google_cloud_run_v2_service.backend.location
  service  = google_cloud_run_v2_service.backend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
