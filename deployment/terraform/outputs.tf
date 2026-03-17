output "backend_url" {
  description = "The URL of the deployed backend service"
  value       = google_cloud_run_v2_service.backend.uri
}

output "vault_bucket_name" {
  description = "The name of the GCS bucket created for the vault"
  value       = google_storage_bucket.vault_bucket.name
}

output "artifact_registry_repo" {
  description = "The Artifact Registry repository URI"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.repo.name}"
}
