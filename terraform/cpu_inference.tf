# --- CPU-Optimized vLLM Service (Optional) ---
# This deploys a secondary Cloud Run service specifically for vLLM on CPU.
# Note:Performance on CPU will be slower than GPU but significantly cheaper.

resource "google_cloud_run_v2_service" "vllm_cpu" {
  count    = 0 # Set to 1 to enable vLLM on CPU
  name     = "${var.service_name}-vllm"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    containers {
      image = "vllm/vllm-openai:latest" # Use a CPU-compatible image

      resources {
        limits = {
          cpu    = "4"
          memory = "8Gi"
        }
      }

      args = [
        "--model", "google/gemma-2b",
        "--device", "cpu"
      ]
      
      ports {
        container_port = 8000
      }
    }
    
    scaling {
      max_instance_count = 1
      min_instance_count = 0 # Scale to zero when not in use
    }
  }
}

output "vllm_service_url" {
  value = length(google_cloud_run_v2_service.vllm_cpu) > 0 ? google_cloud_run_v2_service.vllm_cpu[0].uri : "vLLM not deployed"
}
