terraform {
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

# --- Cloud Storage for Vault ---
resource "google_storage_bucket" "vault_bucket" {
  name          = var.gcs_bucket_name
  location      = var.region
  force_destroy = false

  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }
}

# --- Cloud Run Backend (CPU Optimized) ---
resource "google_cloud_run_v2_service" "backend" {
  name     = var.service_name
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    containers {
      image = "gcr.io/${var.project_id}/${var.service_name}:latest" # Built via CI/CD

      resources {
        limits = {
          cpu    = var.cpu_count
          memory = var.memory_limit
        }
      }

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
        value = var.vault_location
      }
      env {
        name  = "GCS_BUCKET_NAME"
        value = google_storage_bucket.vault_bucket.name
      }
      env {
        name  = "DATA_STORE_ID"
        value = var.data_store_id
      }
      env {
        name  = "MODEL_INFERENCE_ENGINE"
        value = "VERTEX_AI" # Default to Vertex AI
      }
    }
    
    scaling {
      max_instance_count = 10
      min_instance_count = 0
    }
  }
}

# --- IAM Policies ---
resource "google_cloud_run_v2_service_iam_member" "noauth" {
  location = google_cloud_run_v2_service.backend.location
  project  = google_cloud_run_v2_service.backend.project
  name     = google_cloud_run_v2_service.backend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
