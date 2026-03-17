# 📦 Extension Deployment Artifacts

This directory contains pre-built artifacts for distributing the FactLens Chrome Extension.

## 📁 Artifacts Index

| File | Purpose |
|------|---------|
| **`askFinz_FactLens.zip`** | Source code bundle for manual installation (Developer Mode). |
| **`askFinz_FactLens.crx`** | Packed extension for supported Chromium browsers. |
| **`extension_private_key.pem`** | Private key used for signing the extension (do not share). |

## 🚀 Installation Guide
1. Go to `chrome://extensions`.
2. Enable **Developer Mode**.
3. Drag and drop the `.zip` file or the folder into the browser.
4. Set your production **Server URL** in the extension settings to connect to Cloud Run.
