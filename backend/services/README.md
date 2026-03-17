# 🛠️ Backend Services

Core infrastructure and orchestration services for the FactLens backend.

## 📁 Services Index

| File | Purpose |
|------|---------|
| **`orchestrator.py`** | 🛡️ The Conductor. Manages the multi-agent lifecycle, handles concurrency, and streams results via SSE. |
| **`inference.py`** | 🧠 LLM Wrapper. Provides a unified interface for Gemini (Vertex AI) with streaming support and regional configuration. |
| **`vault.py`** | 🏦 Knowledge Vault Service. Manages GCS storage and semantic search via Vertex AI Search (Discovery Engine). |
| **`model_armor.py`** | 🛡️ Safety Layer. Uses Google Model Armor to filter PII and prevent prompt injections. |
| **`database.py`** | 📊 Persistence. Handles logging of analysis results to a database with local fallback. |

## 🏗️ Knowledge Vault Architecture
The Vault service implements a dual-layer retrieval system:
1. **Semantic Search**: Powered by Vertex AI Search for deep indexing.
2. **Direct Fallback**: A GCS download mechanism that ensures new or unindexed files are immediately available for AI grounding.
