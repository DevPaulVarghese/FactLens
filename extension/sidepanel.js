const analyzeBtn = document.getElementById('analyze-btn');
const resultsContainer = document.getElementById('results');
const statusBadge = document.getElementById('status');
const spinner = document.getElementById('spinner');

// Chat UI Elements
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const sttBtn = document.getElementById('stt-btn');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// State
let pageContextText = "";
let chatHistory = [];
let currentSynthesis = null;
let totalClaims = 0;
let validatedClaims = 0;
let gaugeTrue = 0;
let gaugeFalse = 0;
let gaugeOther = 0;

// API Base Configuration
let API_BASE = "http://127.0.0.1:8080";
chrome.storage.local.get(['apiBase'], (res) => {
    if (res.apiBase) {
        API_BASE = res.apiBase;
        console.log("App using custom API_BASE:", API_BASE);
        updateVaultStats(); // Re-fetch stats with new base
    }
});

// --- Settings UI Elements ---
const modelSelect = document.getElementById('model-select');
const vllmToggle = document.getElementById('vllm-toggle');
const vaultToggle = document.getElementById('vault-toggle');
const manageVaultBtn = document.getElementById('manage-vault-btn');
const apiBaseInput = document.getElementById('api-base-input');

// Load settings from storage
chrome.storage.local.get(['preferredModel', 'useVllm', 'useVault', 'apiBase'], (res) => {
    if (res.preferredModel) modelSelect.value = res.preferredModel;
    if (res.useVllm !== undefined) vllmToggle.checked = res.useVllm;
    if (res.useVault !== undefined) vaultToggle.checked = res.useVault;
    if (res.apiBase) apiBaseInput.value = res.apiBase;
});

// Save settings on change
modelSelect.addEventListener('change', () => {
    chrome.storage.local.set({ preferredModel: modelSelect.value });
});

vllmToggle.addEventListener('change', () => {
    chrome.storage.local.set({ useVllm: vllmToggle.checked });
});

vaultToggle.addEventListener('change', () => {
    chrome.storage.local.set({ useVault: vaultToggle.checked });
});

apiBaseInput.addEventListener('change', () => {
    const newBase = apiBaseInput.value.trim().replace(/\/$/, ""); // Remove trailing slash
    if (newBase) {
        chrome.storage.local.set({ apiBase: newBase });
        API_BASE = newBase;
        console.log("API_BASE updated to:", API_BASE);
        updateVaultStats();
    }
});

manageVaultBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'dashboard.html' });
});

async function updateVaultStats() {
    try {
        const response = await fetch(`${API_BASE}/vault/list`);
        const data = await response.json();
        const statEl = document.getElementById('vault-stats');
        if (statEl) {
            statEl.innerHTML = `<span class="stat-count">${data.files.length}</span> Files`;
        }
    } catch (e) {
        console.error("Failed to fetch vault stats:", e);
    }
}

// Initial stats load
updateVaultStats();

function getModelConfig() {
    return {
        model_name: modelSelect.value,
        engine: vllmToggle.checked ? "VLLM" : "VERTEX_AI",
        use_vault: vaultToggle.checked
    };
}

async function extractTextFromTab(tab) {
    try {
        return await chrome.tabs.sendMessage(tab.id, { action: "extractText" });
    } catch (e) {
        console.warn("Content script not found (likely extension was just reloaded). Injecting...", e);
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content_script.js']
            });
            return await chrome.tabs.sendMessage(tab.id, { action: "extractText" });
        } catch (injectError) {
            console.error("Failed to inject script:", injectError);
            throw new Error(`Could not read page content: ${injectError.message}. Ensure you are on a normal webpage (not a chrome:// page) and try refreshing the tab.`);
        }
    }
}

// --- Tab Navigation ---
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => {
            c.classList.remove('active');
            c.style.display = 'none';
        });
        
        btn.classList.add('active');
        const targetTab = document.getElementById(btn.dataset.tab);
        targetTab.classList.add('active');
        targetTab.style.display = btn.dataset.tab === 'chat-tab' ? 'flex' : 'block';

        if (btn.dataset.tab === 'vault-tab') {
            updateVaultStats();
        }
    });
});

// Configure Marked.js to use Highlight.js and open links in new tabs
const renderer = new marked.Renderer();
renderer.link = function(hrefOrToken, title, text) {
    // Handle both marked v3 (href, title, text) and v4+ (token object)
    let href, linkTitle, linkText;
    if (typeof hrefOrToken === 'object' && hrefOrToken !== null) {
        href = hrefOrToken.href || '#';
        linkTitle = hrefOrToken.title || '';
        linkText = hrefOrToken.text || href;
    } else {
        href = hrefOrToken || '#';
        linkTitle = title || '';
        linkText = text || href;
    }
    return `<a target="_blank" rel="noopener noreferrer" href="${href}" title="${linkTitle}" style="color: #818cf8; text-decoration: underline;">${linkText}</a>`;
};

marked.setOptions({
    renderer: renderer,
    highlight: function(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
            return hljs.highlight(code, { language: lang }).value;
        }
        return hljs.highlightAuto(code).value;
    },
    langPrefix: 'hljs language-'
});

// --- Fact Checking Analysis ---
analyzeBtn.addEventListener('click', async () => {
    // Clear slots
    document.getElementById('bias-slot').innerHTML = '';
    document.getElementById('verdict-slot').innerHTML = '';
    document.getElementById('claims-container').innerHTML = '';

    analyzeBtn.disabled = true;
    totalClaims = 0;
    validatedClaims = 0;
    gaugeTrue = 0;
    gaugeFalse = 0;
    
    // Hide & reset gauge
    const gaugeContainer = document.getElementById('trust-gauge-container');
    if (gaugeContainer) gaugeContainer.style.display = 'none';
    updateGauge();
    
    spinner.style.display = 'flex';
    document.querySelector('.spinner').style.display = 'block';
    const progressText = document.getElementById('progress-text');
    if (progressText) {
        progressText.style.display = 'none';
        progressText.innerText = '';
    }
    // Clear similar articles
    const similarContainer = document.getElementById('similar-articles-results');
    if (similarContainer) {
        similarContainer.innerHTML = '<div class="empty-state" style="text-align: center; color: var(--text-secondary); margin-top: 40px; font-size: 0.9rem;">Searching for similar articles...</div>';
    }

    updateStatus('Analyzing...', true);

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const response = await extractTextFromTab(tab);
        
        if (!response || !response.text) {
            throw new Error("Could not extract text from page.");
        }

        // Save context for chat
        pageContextText = response.text;

        const payload = JSON.stringify({
            text: response.text,
            url: response.url,
            title: response.title || "",
            inference_config: getModelConfig()
        });

        const fetchResponse = await fetch(`${API_BASE}/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload
        });

        const reader = fetchResponse.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split("\n\n");
            buffer = parts.pop();

            for (const part of parts) {
                handleAnalysisEvent(part);
            }
        }
        
        // Final buffer handling - process any remaining data after stream ends
        if (buffer.trim()) {
            handleAnalysisEvent(buffer);
        }
    } catch (err) {
        addCard("Error", err.message);
        console.error(err);
    } finally {
        analyzeBtn.disabled = false;
        
        // Final UI cleanup
        spinner.style.display = 'none';

        // Fail-safe for Similar Articles: if it still says "Searching...", clear it
        const similarContainer = document.getElementById('similar-articles-results');
        if (similarContainer && similarContainer.innerText.includes('Searching for similar articles...')) {
            similarContainer.innerHTML = '<div class="empty-state" style="text-align: center; color: var(--text-secondary); margin-top: 40px; font-size: 0.9rem;">No similar articles found.</div>';
        }
        
        // Signal completion to content script to show the TTS toggle (always show after analysis)
        chrome.tabs.query({ active: true }, (tabs) => {
            const activeTab = tabs.find(t => t.active);
            if (activeTab) {
                chrome.tabs.sendMessage(activeTab.id, { action: 'showTTSToggle' }).catch(() => {});
            }
        });
        updateStatus('Ready', false);
    }
});

// Gauge update helper
function updateGauge() {
    const total = totalClaims || 1;
    const trueW  = ((gaugeTrue  / total) * 100).toFixed(1);
    const falseW = ((gaugeFalse / total) * 100).toFixed(1);
    const otherW = ((gaugeOther / total) * 100).toFixed(1);
    const pendingCount = totalClaims - gaugeTrue - gaugeFalse - gaugeOther;

    const gTrue  = document.getElementById('gauge-true');
    const gFalse = document.getElementById('gauge-false');
    if (gTrue)  gTrue.style.width  = trueW + '%';
    if (gFalse) gFalse.style.width = falseW + '%';

    const pct = totalClaims > 0 ? Math.round((gaugeTrue / totalClaims) * 100) : 0;
    const gaugeLabel = document.getElementById('gauge-label');
    if (gaugeLabel) gaugeLabel.textContent = `${pct}% Accurate`;

    const tc = document.getElementById('gauge-true-count');
    const fc = document.getElementById('gauge-false-count');
    const pc = document.getElementById('gauge-pending-count');
    if (tc) tc.textContent = `${gaugeTrue} True`;
    if (fc) fc.textContent = `${gaugeFalse} False`;
    if (pc) pc.textContent = `${gaugeOther} Other / Inconclusive (${pendingCount} left)`;
}

// Listen for hover messages from the content script
chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'claimHovered') {
        const claim = message.claim;
        const cards = document.querySelectorAll('.claim-card');
        for (const card of cards) {
            const claimText = card.querySelector('.claim-text').innerText;
            // Match claim by content (fuzzy match first 50 chars to handle slight variations)
            if (claimText === claim || claimText.includes(claim.substring(0, 50))) {
                // Switch to analysis tab if needed
                const analysisTabBtn = document.querySelector('[data-tab="analysis-tab"]');
                if (analysisTabBtn && !analysisTabBtn.classList.contains('active')) {
                    analysisTabBtn.click();
                }
                // Remove existing highlights
                document.querySelectorAll('.claim-card.highlighted').forEach(c => c.classList.remove('highlighted'));
                // Scroll and highlight
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                card.classList.add('highlighted');
                setTimeout(() => card.classList.remove('highlighted'), 2500);
                break;
            }
        }
    }
});

function handleAnalysisEvent(eventString) {
    const lines = eventString.split("\n");
    let eventType = "";
    let data = null;

    for (const line of lines) {
        if (line.startsWith("event: ")) {
            eventType = line.replace("event: ", "").trim();
        } else if (line.startsWith("data: ")) {
            try {
                data = JSON.parse(line.replace("data: ", "").trim());
            } catch (e) {
                console.error("JSON parse error", e);
            }
        }
    }

    if (!eventType || data === null || data === undefined) {
        console.debug("Missing eventType or null data", { eventType, data });
        return;
    }
    
    console.debug(`Processing event: ${eventType}`, data);

    switch (eventType) {
        case "status":
            updateStatus(data, true);
            break;
        case "claims":
            addClaimsCard(data);
            break;
        case "verification":
            updateVerification(data);
            break;
        case "bias":
            addTopCard("Bias Analysis", data, "bias-slot");
            break;
        case "summary":
            addTopCard("Final Verdict", data, "verdict-slot");
            break;
        case "similar_articles":
            renderSimilarArticles(data);
            break;
        case "error":
            addCard("System Error", data);
            break;
    }
}

function renderSimilarArticles(articles) {
    const container = document.getElementById('similar-articles-results');
    if (!container) return;
    
    // Always clear processing state
    container.innerHTML = '';
    
    if (!articles || articles.length === 0) {
        container.innerHTML = '<div class="empty-state" style="text-align: center; color: var(--text-secondary); margin-top: 40px; font-size: 0.9rem;">No similar articles found.</div>';
        return;
    }

    articles.forEach(article => {
        const card = document.createElement('div');
        card.className = 'similar-card';
        
        let sourceDomain = article.domain;
        if (!sourceDomain) {
            sourceDomain = "Link";
            try {
                sourceDomain = new URL(article.url).hostname;
            } catch(e) {}
        }
        
        const summaryHtml = article.summary ? `<div class="similar-summary">${article.summary}</div>` : '';

        card.innerHTML = `
            <div class="similar-info">
                <div class="similar-title" title="${article.title}">${article.title}</div>
                ${summaryHtml}
                <div class="similar-meta">
                    <span class="similar-source">${article.source || sourceDomain}</span>
                    <a href="${article.url}" target="_blank" class="link-badge">Source</a>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

// --- Interactive Chat ---
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
    }
});

chatSendBtn.addEventListener('click', sendChatMessage);

async function sendChatMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    if (!pageContextText) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const response = await extractTextFromTab(tab);
            if (response && response.text) {
                pageContextText = response.text;
            }
        } catch (e) {
            console.warn("Could not extract context for chat automatically:", e);
        }
    }

    // Add User Message UI
    appendMessage('user', text);
    chatInput.value = '';
    chatInput.style.height = 'auto'; // Reset size
    chatSendBtn.disabled = true;

    // Prepare AI Message UI
    const aiMessageId = `msg-${Date.now()}`;
    const messageContainer = createAIMessageContainer(aiMessageId);
    let fullAiResponse = "";

    try {
        const payload = JSON.stringify({
            query: text,
            context: pageContextText || "No page context available.",
            history: chatHistory,
            inference_config: getModelConfig()
        });

        // Add user msg to history
        chatHistory.push({ role: "user", content: text });

        const fetchResponse = await fetch(`${API_BASE}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload
        });

        const reader = fetchResponse.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        
        const contentDiv = messageContainer.querySelector('.message-content');

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split("\n\n");
            buffer = parts.pop();

            for (const part of parts) {
                if (part.startsWith("data: ")) {
                    try {
                        const data = JSON.parse(part.replace("data: ", "").trim());
                        if (data.chunk) {
                            fullAiResponse += data.chunk;
                            // Parse markdown instantly
                            contentDiv.innerHTML = marked.parse(fullAiResponse);
                            chatMessages.scrollTop = chatMessages.scrollHeight;
                        } else if (data.error) {
                            contentDiv.innerHTML += `<br><span style="color:var(--accent-red)">Error: ${data.error}</span>`;
                        }
                    } catch (e) {
                        console.error("SSE parse error", e);
                    }
                }
            }
        }

        // Save AI response to history
        chatHistory.push({ role: "assistant", content: fullAiResponse });
        
        // Attach TTS Data to the button and reveal it
        const ttsBtn = messageContainer.querySelector('.tts-btn');
        ttsBtn.dataset.text = fullAiResponse;
        ttsBtn.style.display = 'flex';

    } catch (err) {
        const contentDiv = messageContainer.querySelector('.message-content');
        contentDiv.innerHTML = `<span style="color:#ef4444">Connection error. Please try again.</span>`;
        console.error(err);
    } finally {
        chatSendBtn.disabled = false;
        chatInput.focus();
    }
}

function appendMessage(role, content) {
    const div = document.createElement('div');
    div.className = `message ${role}-message`;
    div.innerText = content; // User text is raw, not markdown
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function createAIMessageContainer(id) {
    const div = document.createElement('div');
    div.className = 'message ai-message';
    div.id = id;
    div.innerHTML = `
        <div class="message-content">
            <div class="typing-indicator"><span></span><span></span><span></span></div>
        </div>
        <div class="message-actions">
            <button class="tts-btn" aria-label="Read aloud" style="display: none;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M11 5L6 9H2V15H6L11 19V5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                    <path d="M19.07 4.93C20.9447 6.80528 21.998 9.34836 21.998 12C21.998 14.6516 20.9447 17.1947 19.07 19.07M15.54 8.46C16.4774 9.39764 17.0039 10.6692 17.0039 11.995C17.0039 13.3208 16.4774 14.5924 15.54 15.53" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
            </button>
        </div>
    `;
    
    chatMessages.appendChild(div);
    
    // Setup TTS click handler
    const ttsBtn = div.querySelector('.tts-btn');
    ttsBtn.addEventListener('click', () => {
        playTTS(ttsBtn.dataset.text || "", ttsBtn);
    });

    return div;
}

// --- Text To Speech (TTS) ---
// Pre-load voices for TTS
let ttsVoices = [];
if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => {
        ttsVoices = window.speechSynthesis.getVoices();
    };
}

function playTTS(text, buttonElement) {
    if (!('speechSynthesis' in window)) {
        alert("Text-to-speech is not supported in this browser.");
        return;
    }

    // Stop if currently playing
    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        document.querySelectorAll('.tts-btn').forEach(b => b.classList.remove('playing'));
        if (currentSynthesis === buttonElement) {
            currentSynthesis = null;
            return; // Act explicitly as a toggle STOP
        }
    }

    // Clean markdown before speaking
    const cleanText = text.replace(/[*_#`~>]/g, '');

    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    if (ttsVoices.length === 0) {
        ttsVoices = window.speechSynthesis.getVoices();
    }
    
    // Select the best human-like voice available
    const preferredVoice = ttsVoices.find(v => v.name.includes("Google") && v.name.includes("Female") && v.lang.includes("en")) ||
                           ttsVoices.find(v => v.name.includes("Google") && v.lang.includes("en")) ||
                           ttsVoices.find(v => v.name.includes("Natural") && v.lang.includes("en")) ||
                           ttsVoices.find(v => v.lang.includes("en-US") || v.lang.includes("en-GB"));
                           
    if (preferredVoice) {
        utterance.voice = preferredVoice;
    } else {
        utterance.lang = 'en-US';
    }

    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
        buttonElement.classList.add('playing');
        currentSynthesis = buttonElement;
    };

    utterance.onend = () => {
        buttonElement.classList.remove('playing');
        currentSynthesis = null;
    };

    utterance.onerror = (e) => {
        console.error("TTS Error:", e);
        buttonElement.classList.remove('playing');
        currentSynthesis = null;
    };

    window.speechSynthesis.speak(utterance);
}

// Auto-resize chat textarea
chatInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
});

// --- Existing UI Helpers (Analysis) ---
function updateStatus(text, isActive) {
    statusBadge.innerText = text;
    if (isActive) statusBadge.classList.add('active');
    else statusBadge.classList.remove('active');
}

function addCard(title, content) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
        <div class="card-title">${title}</div>
        <div class="card-content">${content.replace(/\n/g, '<br>')}</div>
    `;
    document.getElementById('claims-container').appendChild(card);
    resultsContainer.scrollTop = resultsContainer.scrollHeight;
}

function addTopCard(title, content, slotId) {
    const slot = document.getElementById(slotId);
    if (!slot) return;
    
    const card = document.createElement('div');
    card.className = 'card top-priority-card';
    card.innerHTML = `
        <div class="card-title" style="color: var(--accent-indigo);">${title}</div>
        <div class="card-content">${content.replace(/\n/g, '<br>')}</div>
    `;
    slot.innerHTML = ''; // Clear previous if any
    slot.appendChild(card);
}


function addClaimsCard(claims) {
    totalClaims = claims.length;
    validatedClaims = 0;
    
    document.querySelector('.spinner').style.display = 'none';
    const progressText = document.getElementById('progress-text');
    if (progressText) {
        progressText.style.display = 'block';
        progressText.innerText = `0 of ${totalClaims} claims validated`;
    }

    claims.forEach((claim, i) => {
        const card = document.createElement('div');
        card.className = 'card claim-card';
        card.id = `claim-card-${i}`;
        const safeClaim = claim.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        
        card.innerHTML = `
            <div class="claim-text" style="margin-bottom: 8px; font-weight: 500;">${safeClaim}</div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="color: var(--text-secondary); font-size: 0.85rem;">Verdict:</span>
                <div class="verdict-tag" style="background: rgba(255, 255, 255, 0.05); color: #a0a0a0">⏳ Pending...</div>
            </div>
        `;
        
        // Add click listener for navigation
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => {
            chrome.tabs.query({ active: true }, (tabs) => {
                const activeTab = tabs.find(t => t.active);
                if (activeTab) {
                    chrome.tabs.sendMessage(activeTab.id, { 
                        action: 'scrollToClaim', 
                        claim: claim 
                    }).catch(() => {});
                }
            });
        });

        document.getElementById('claims-container').appendChild(card);
    });

    // Show gauge
    const gaugeContainer = document.getElementById('trust-gauge-container');
    if (gaugeContainer) gaugeContainer.style.display = 'block';
    updateGauge();

    // Highlight claim text in the page via content script
    chrome.tabs.query({ active: true }, (tabs) => {
        const activeTab = tabs.find(t => t.active);
        if (activeTab) {
            chrome.tabs.sendMessage(activeTab.id, { action: 'highlightClaims', claims }).catch(() => {});
        }
    });
}

function updateVerification(data) {
    validatedClaims++;
    const progressText = document.getElementById('progress-text');
    if (progressText) {
        progressText.innerText = `${validatedClaims} of ${totalClaims} claims validated`;
    }

    // Update gauge counts
    const resultLow = (data.result || '').toLowerCase();
    if (resultLow.includes('true'))  { gaugeTrue++;  }
    else if (resultLow.includes('false')) { gaugeFalse++; }
    else { gaugeOther++; }
    updateGauge();

    // Use index to find the card instead of string matching
    const card = document.getElementById(`claim-card-${data.index}`);
    if (card) {
        const resultLow = (data.result || '').toLowerCase();

            let verdictClass = 'verdict-tag';
            let verdictText = 'Analyzed';
            
            if (resultLow.includes("true")) {
                verdictClass = 'verdict-tag verdict-true';
                verdictText = 'True';
            } else if (resultLow.includes("false")) {
                verdictClass = 'verdict-tag verdict-false';
                verdictText = 'False';
            }
            
            let explanationText = data.result;
            
            // Clean up the verbosity from the AI response
            explanationText = explanationText.replace(/Verdict:\s*\[?[A-Za-z]+\]?\.?/i, '').trim();
            explanationText = explanationText.replace(/^Explanation:\s*/i, '').trim();
            
            // Strip all inline markdown links (shown as badges instead)
            explanationText = explanationText.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
            // Strip any trailing "References:" / "Sources:" section including bullet/star lists
            explanationText = explanationText.replace(/(References?|Sources?)[\s\S]*$/gi, '').trim();
            // Strip any remaining trailing star/dash bullet lists
            explanationText = explanationText.replace(/(\n\s*[*\-]\s+.+)+\s*$/g, '').trim();

            const safeClaim = data.claim.replace(/</g, "&lt;").replace(/>/g, "&gt;");

            // Build source badge pills from grounding metadata
            const sources = data.sources || [];
            let sourcesBadgesHTML = '';
            if (sources.length > 0) {
                const badgesHTML = sources.map((src, idx) => {
                    const icon = src.is_vault ? '🏦 ' : '';
                    return `<a href="${src.url}" target="_blank" rel="noopener noreferrer" class="source-badge">${icon}${src.title || 'Source ' + (idx + 1)}</a>`;
                }).join('');
                sourcesBadgesHTML = `
                    <div style="margin-top: 8px;">
                        <span style="color: var(--text-secondary); font-size: 0.75rem; font-weight: 600; display: block; margin-bottom: 4px;">Sources:</span>
                        <div class="source-badges">${badgesHTML}</div>
                    </div>
                `;
            }

            card.innerHTML = `
                <div class="claim-text" style="margin-bottom: 8px; font-weight: 500;">${safeClaim}</div>
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                    <span style="color: var(--text-secondary); font-size: 0.85rem;">Verdict:</span>
                    <div class="${verdictClass}">${verdictText}</div>
                </div>
                <div style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5; background: rgba(0,0,0,0.15); padding: 8px; border-radius: 6px; border: 1px solid var(--border-color);">
                    <div style="color: var(--text-primary); font-weight: 600; margin-bottom: 4px;">Explanation:</div>
                    <div>${explanationText}</div>
                    ${sourcesBadgesHTML}
                </div>
            `;

            // Update highlight color on page
            chrome.tabs.query({ active: true }, (tabs) => {
                const activeTab = tabs.find(t => t.active);
                if (activeTab) {
                    chrome.tabs.sendMessage(activeTab.id, { 
                        action: 'updateHighlightResult', 
                        claim: data.claim, 
                        result: data.result,
                        explanation: explanationText
                    }).catch(() => {});
                }
            });

            // If all claims are done, signal the toggle to appear immediately
            if (validatedClaims === totalClaims) {
                chrome.tabs.query({ active: true }, (tabs) => {
                    const activeTab = tabs.find(t => t.active);
                    if (activeTab) {
                        chrome.tabs.sendMessage(activeTab.id, { action: 'showTTSToggle' }).catch(() => {});
                    }
                });
            }
        }
}

// --- Speech To Text (STT) ---
let recognition = null;
if ('webkitSpeechRecognition' in window || 'speechRecognition' in window) {
    const SpeechRecognition = window.webkitSpeechRecognition || window.speechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
        sttBtn.classList.add('recording');
        updateStatus('Listening...', true);
    };

    recognition.onend = () => {
        sttBtn.classList.remove('recording');
        updateStatus('Ready', false);
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
            chatInput.value = (chatInput.value + " " + transcript).trim();
            // Trigger auto-resize
            chatInput.dispatchEvent(new Event('input'));
            chatInput.focus();
        }
    };

    recognition.onerror = (event) => {
        console.error("Speech Recognition Error:", event.error);
        sttBtn.classList.remove('recording');
        
        let errorMsg = 'Speech Error';
        if (event.error === 'not-allowed') {
            errorMsg = 'Mic Access Denied';
            alert("Microphone access was denied. Please check your browser settings and extension permissions.");
        } else if (event.error === 'no-speech') {
            errorMsg = 'No speech detected';
        } else if (event.error === 'network') {
            errorMsg = 'Network Error';
        }
        
        updateStatus(errorMsg, false);
    };
}

sttBtn.addEventListener('click', () => {
    window.focus(); // Ensure panel has focus for Speech API
    
    if (!recognition) {
        console.error("Recognition object not initialized.");
        updateStatus('Service Unsupported', false);
        alert("Speech-to-text is not supported in this browser environment.");
        return;
    }

    if (sttBtn.classList.contains('recording')) {
        recognition.stop();
    } else {
        updateStatus('Waking up mic...', true);
        try {
            recognition.start();
        } catch (err) {
            console.error("Failed to start recognition:", err);
            updateStatus('Start Error', false);
            // If already started, just toggle the class as a fallback
            if (err.name === 'InvalidStateError') {
                recognition.stop();
            }
        }
    }
});




