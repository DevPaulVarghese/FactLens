# 🤖 AI Agents

This directory contains the core intelligence of FactLens. Each agent is a specialized logic unit powered by Gemini.

## 📁 Agents Index

| File | Role | Description |
|------|------|-------------|
| **`extractor.py`** | 🔍 The Extractor | Identifies atomic, verifiable claims from raw text as verbatim quotes. |
| **`verifier.py`** | ✅ The Verifier | Cross-references claims against **Vertex AI Grounding (Google Search)** and the **Knowledge Vault**. |
| **`bias_detector.py`** | ⚖️ The Bias Detector | Analyzes emotional framing, political leaning, and corporate interests. |
| **`summarizer.py`** | ✍️ The Summarizer | Synthesizes verification results and bias analysis into a final verdict. |
| **`researcher.py`** | 🌐 The Researcher | Finds similar articles on the web to provide broader context. |

## 🧩 Design Philosophy
FactLens agents are designed to be **atomic and decoupled**. They don't know about each other; they only know how to process input and return structured findings. Coordination is handled by the `FactCheckingOrchestrator` in `backend/services/`.
