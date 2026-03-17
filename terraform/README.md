# 🏗️ Infrastructure as Code (Terraform)

This directory contains the Terraform configuration for a production-ready deployment of FactLens on Google Cloud Platform. It is optimized for **CPU-only** workloads.

## 📁 Files Index

| File | Role |
|------|------|
| **`main.tf`** | Deploys the core FastAPI backend to Cloud Run and creates the GCS Vault bucket. |
| **`variables.tf`** | Definies parameters for project ID, regions, and CPU/Memory limits. |
| **`vertex_ai_search.tf`** | Configures IAM permissions for the Knowledge Vault (Discovery Engine). |
| **`cpu_inference.tf`** | **(Optional)** Template for deploying a CPU-based vLLM inference node. |
| **`outputs.tf`** | Exports the final service URLs and resource identifiers. |

## 🚀 Getting Started

1. **Install Terraform**: Ensure you have the Terraform CLI installed.
2. **Authenticate**: `gcloud auth application-default login`
3. **Initialize**: `terraform init`
4. **Deploy**:
   ```bash
   terraform apply \
     -var="project_id=your-project-id" \
     -var="gcs_bucket_name=your-vault-bucket" \
     -var="data_store_id=your-data-store-id"
   ```

## ⚡ CPU Optimization Notes
- The default configuration uses **2 vCPUs and 4GiB RAM** for the backend.
- Scale-to-zero is enabled to minimize costs when the application is idle.
- For vLLM on CPU, we recommend increasing memory to **8GiB** to handle model weights.
