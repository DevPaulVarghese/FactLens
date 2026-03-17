variable "project_id" {
  description = "The Google Cloud project ID"
  type        = string
}

variable "region" {
  description = "The region to deploy resources to"
  type        = string
  default     = "us-central1"
}

variable "vault_location" {
  description = "Location for the Knowledge Vault (Discovery Engine)"
  type        = string
  default     = "global"
}

variable "max_instances" {
  description = "Maximum number of instances for scaling"
  type        = number
  default     = 8
}

variable "service_name" {
  description = "Name of the backend service"
  type        = string
  default     = "factlens-backend"
}

variable "gcs_bucket_name" {
  description = "Name of the GCS bucket for vault storage"
  type        = string
}

variable "data_store_id" {
  description = "ID for the Vertex AI Search data store"
  type        = string
}

variable "cpu_count" {
  description = "Number of CPUs for Cloud Run instances"
  type        = string
  default     = "2"
}

variable "memory_limit" {
  description = "Memory limit for Cloud Run instances (e.g., 4Gi)"
  type        = string
  default     = "4Gi"
}
