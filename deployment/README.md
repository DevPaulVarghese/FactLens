# 🚀 Deployment Templates

This directory contains production-grade infrastructure and CI/CD templates for FactLens.

## 📁 Directory Structure
- **`terraform/`**: Infrastructure as Code (GCP).
- **`../.github/workflows/`**: Continuous Integration & Deployment (GitHub Actions).

## 🛠️ Getting Started

### 1. Infrastructure Setup (Terraform)
1. Install [Terraform](https://www.terraform.io/downloads).
2. Update `variables.tf` with your `project_id`.
3. Initialize and apply:
   ```bash
   cd terraform
   terraform init
   terraform apply
   ```

### 2. CI/CD Setup (GitHub Actions)
1. Fork/Push this repo to GitHub.
2. In your repo settings, add the following **Secrets**:
   - `GCP_PROJECT_ID`: Your Google Cloud Project ID.
   - `GCP_SA_KEY`: The JSON key of a Service Account with `Cloud Run Admin` and `Artifact Registry Administrator` roles.
3. The workflow in `.github/workflows/deploy.yml` will automatically build and deploy on every push to the `main` branch.

## 🛡️ Production Hardening
- **Secrets**: Use GCP Secret Manager for sensitive API keys.
- **VPC**: For production databases, consider using a VPC Connector to keep traffic internal.
- **IAM**: Follow the principle of least privilege for the Cloud Run service identity.
