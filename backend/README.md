# 🚀 FactLens Backend

The core intelligence and API layer for the FactLens multi-agent system.

## 📁 Directory Structure

| Folder | Description |
|--------|-------------|
| **`agents/`** | Contains the specialized AI logic units (Extractor, Verifier, etc.). |
| **`services/`** | Infrastructure services (Orchestrator, Vault, Inference, Safety). |
| **`__pycache__/`** | Python bytecode cache (ignored by git). |

## 🛠️ Main Components
- **`main.py`**: The FastAPI application entry point. Handles routing and SSE streaming.
- **`Dockerfile`**: Production-ready container definition, optimized for Cloud Run.
- **`requirements.txt`**: Full dependency list including all necessary Google Cloud libraries.
- **`deploy.ps1/sh`**: Helper scripts for manual gcloud deployments.

## ⚙️ Configuration
Backend behavior is controlled via environment variables. See `.env.template` for a full list of required keys (Project ID, Locations, Data Store IDs, etc.).
