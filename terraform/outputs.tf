output "backend_url" {
  value = google_cloud_run_v2_service.backend.uri
}

output "vault_bucket_url" {
  value = google_storage_bucket.vault_bucket.url
}

output "project_number" {
  value = data.google_project.project.number
}
