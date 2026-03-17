variable "project_id" {
  description = "The Google Cloud Project ID"
  type        = string
}

variable "region" {
  description = "The region to deploy resources in"
  type        = string
  default     = "us-central1"
}

variable "service_name" {
  description = "The name of the backend service"
  type        = string
  default     = "factlens-backend"
}

variable "data_store_id" {
  description = "The ID of the Vertex AI Search Data Store"
  type        = string
  default     = "factlens-vault"
}
