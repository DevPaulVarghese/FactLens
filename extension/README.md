# 💻 Chrome Extension UI

The frontend layer of FactLens, providing deep browser integration and a premium AI experience.

## 📁 Extension Index

| File | Role | Description |
|------|------|-------------|
| **`sidepanel.html/js`** | 🖥️ Main UI | The primary interface for chat, real-time analysis, and TTS controls. |
| **`dashboard.html/js`** | 🏦 Vault Manager | Full-page dashboard for managing your Knowledge Vault (Upload/Delete). |
| **`content_script.js`** | 💉 Page Injection | Handles text extraction, verdict highlighting, and the "Narrator" TTS overlay. |
| **`background.js`** | ⚙️ Service Worker | Manages extension lifecycle and state persistence. |
| **`manifest.json`** | 📜 Manifest | Defines permissions (tabs, storage, sidePanel) and resource mapping. |
| **`styles/`** | 🎨 UI System | Vanilla CSS implementation of the FactLens dark-mode design system. |

## ⚡ Key Features
- **SSE Streaming**: Results appear live as the AI agents think.
- **Narrator Mode**: Word-level synchronized TTS highlighting in the page.
- **Bi-directional Navigation**: Click a claim card to scroll to the text; hover over highlighted text to see the card.
