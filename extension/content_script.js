/*
 * FactLens Content Script
 * Responsibilities:
 *  1. Extract readable text from the current page.
 *  2. Highlight claim text in the DOM when instructed by the sidepanel.
 *  3. On hover of a highlighted claim, notify the sidepanel to navigate to that claim card.
 */

// ─── Text Extraction ───────────────────────────────────────────────────────────
// ─── Text Extraction ───────────────────────────────────────────────────────────
function getReadableNodes() {
    const selectorsToRemove = [
        'nav', 'footer', 'script', 'style', 'header', 'aside',
        '.nav', '.footer', '#nav', '#footer', '.ad', '.sidebar',
        '.cookie', '.consent', '.banner', '.popup', '.overlay',
        '.comments', '#comments', '.related', '.share', '.social',
        '.promo', '.widget', '.recommendations', '.newsletter', 
        '.subscribe', '.sponsor', '.author-bio', '[role="complementary"]'
    ];
    
    // 1. Find potential main containers
    const candidates = document.querySelectorAll('article, main, [role="main"], .article-content, .post-content, .entry-content, .content, #content, .post');
    let bestContainer = document.body;
    let maxScore = 0;

    candidates.forEach(container => {
        // Basic heuristic: total text length inside paragraph tags
        const pTags = container.querySelectorAll('p');
        let score = 0;
        pTags.forEach(p => score += p.textContent.length);
        
        // Give bonuses to semantic wrappers
        const tag = container.tagName.toLowerCase();
        if (tag === 'article') score *= 1.5;
        if (tag === 'main' || container.getAttribute('role') === 'main') score *= 1.2;

        if (score > maxScore && score > 200) {
            maxScore = score;
            bestContainer = container;
        }
    });

    const nodes = [];

    // 2. Walk only the best container to extract relevant text
    const walker = document.createTreeWalker(bestContainer, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            const tag = parent.tagName.toLowerCase();
            if (selectorsToRemove.some(s => parent.matches(s) || parent.closest(s))) return NodeFilter.FILTER_REJECT;
            if (['script', 'style', 'noscript', 'textarea', 'button'].includes(tag)) return NodeFilter.FILTER_REJECT;
            if (node.textContent.trim().length < 15) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        }
    });

    let node;
    while (node = walker.nextNode()) {
        const parent = node.parentElement;
        if (parent) {
            // Add a marker class and data attribute for Click-to-Read
            const index = nodes.length;
            parent.classList.add('factlens-read-target');
            parent.setAttribute('data-factlens-index', index);
            
            // Only add listener if not already added
            if (!parent.hasAttribute('data-factlens-listener')) {
                parent.addEventListener('click', handleSectionClick);
                parent.setAttribute('data-factlens-listener', 'true');
                parent.style.cursor = 'help'; // Visual cue
            }
        }
        nodes.push({ node, text: node.textContent }); // Use raw text to preserve indices
    }
    
    return nodes;
}

function handleSectionClick(e) {
    // Only trigger if clicking a readable part
    const target = e.currentTarget;
    const index = parseInt(target.getAttribute('data-factlens-index'));
    if (!isNaN(index)) {
        e.stopPropagation();
        startReadAloud(index);
    }
}

function extractCleanText() {
    return getReadableNodes().map(n => n.text).join('\n\n');
}

// ─── Claim Highlighting ────────────────────────────────────────────────────────
let highlightedMarks = [];

function clearHighlights() {
    highlightedMarks.forEach(mark => {
        const parent = mark.parentNode;
        if (parent) {
            parent.replaceChild(document.createTextNode(mark.textContent), mark);
            parent.normalize();
        }
    });
    highlightedMarks = [];
}

function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Highlights a claim in the DOM. 
 * Improved version: Searches for the longest possible verbatim match.
 */
function highlightClaimInDOM(claim) {
    if (!claim || claim.length < 10) return;

    // We try to find the full claim first.
    const searchString = claim.trim();
    
    // Use TreeWalker to find text nodes that containing portions of the claim
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode(node) {
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                const tag = parent.tagName.toLowerCase();
                if (['script', 'style', 'noscript', 'textarea'].includes(tag)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    let currentNode;
    const textNodes = [];
    while (currentNode = walker.nextNode()) {
        textNodes.push(currentNode);
    }

    // Join all text content to find where the claim exists globally
    const fullPageText = textNodes.map(n => n.textContent).join('');
    const matchIdx = fullPageText.toLowerCase().indexOf(searchString.toLowerCase());

    if (matchIdx === -1) {
        // Fallback: try matching a significant chunk (first 100 chars)
        const shorter = searchString.substring(0, 100);
        if (shorter.length < searchString.length) {
            return highlightClaimInDOM(shorter);
        }
        return;
    }

    // Map global index back to individual text nodes
    let currentGlobalIdx = 0;
    let startNode = null;
    let startOffset = 0;
    let endNode = null;
    let endOffset = 0;

    for (const node of textNodes) {
        const nodeLen = node.textContent.length;
        if (!startNode && currentGlobalIdx + nodeLen > matchIdx) {
            startNode = node;
            startOffset = matchIdx - currentGlobalIdx;
        }
        if (startNode && !endNode && currentGlobalIdx + nodeLen >= matchIdx + searchString.length) {
            endNode = node;
            endOffset = (matchIdx + searchString.length) - currentGlobalIdx;
            break;
        }
        currentGlobalIdx += nodeLen;
    }

    if (startNode && endNode) {
        const range = document.createRange();
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);

        const mark = document.createElement('mark');
        mark.className = 'factlens-highlight';
        mark.setAttribute('data-claim', claim);
        mark.style.cssText = `
            background-color: rgba(255, 235, 59, 0.4);
            border-bottom: 2px solid #fbc02d;
            border-radius: 2px;
            cursor: pointer;
            transition: all 0.2s ease;
        `;

        mark.addEventListener('mouseenter', () => {
            if (mark.dataset.color === 'green') {
                mark.style.backgroundColor = 'rgba(76, 175, 80, 0.7)';
            } else if (mark.dataset.color === 'red') {
                mark.style.backgroundColor = 'rgba(244, 67, 54, 0.7)';
            } else {
                mark.style.backgroundColor = 'rgba(255, 235, 59, 0.7)';
            }
            chrome.runtime.sendMessage({ action: 'claimHovered', claim: claim });
        });
        mark.addEventListener('mouseleave', () => {
            if (mark.dataset.color === 'green') {
                mark.style.backgroundColor = 'rgba(76, 175, 80, 0.4)';
            } else if (mark.dataset.color === 'red') {
                mark.style.backgroundColor = 'rgba(244, 67, 54, 0.4)';
            } else {
                mark.style.backgroundColor = 'rgba(255, 235, 59, 0.4)';
            }
        });
        try {
            range.surroundContents(mark);
            highlightedMarks.push(mark);
        } catch (e) {
            // If surroundContents fails (e.g. range spans different block elements), 
            // we wrap the individual parts manually or just fallback to the single node version
        }
    }
}

// Ensure highlight style exists
const ttsStyle = document.createElement('style');
ttsStyle.textContent = `
    .factlens-read-target:hover {
        background-color: rgba(0,0,0,0.03);
    }
    .factlens-reading-active {
        font-weight: bold !important;
        background-color: rgba(0,0,0,0.05);
        border-radius: 4px;
        transition: all 0.2s ease;
    }
`;
document.head.appendChild(ttsStyle);

// ─── Floating TTS Control ───────────────────────────────────────────────────
let isReading = false;
let currentUtterance = null;
let claimDataCache = {}; // Stores { claimText: { result, explanation } }
let floatingControl = null;

function createFloatingTTSControl() {
    if (floatingControl) return;

    floatingControl = document.createElement('div');
    floatingControl.id = 'factlens-tts-control';
    floatingControl.innerHTML = `
        <div id="factlens-drag-handle" title="Drag to move">⋮</div>
        <button id="factlens-play-pause" title="Read Aloud Page">
            <svg id="factlens-play-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"></path>
            </svg>
            <svg id="factlens-pause-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="display:none;">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path>
            </svg>
        </button>
    `;

    floatingControl.style.cssText = `
        position: fixed;
        left: 20px;
        top: 50%;
        transform: translateY(-50%);
        z-index: 100000;
        background: #1e1e1e;
        border: 1px solid #333;
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 4px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        color: white;
        user-select: none;
        transition: opacity 0.3s;
    `;
    floatingControl.style.display = 'none'; // Initially hidden

    const playPauseBtn = floatingControl.querySelector('#factlens-play-pause');
    const dragHandle = floatingControl.querySelector('#factlens-drag-handle');

    dragHandle.style.cssText = `
        cursor: grab;
        padding: 4px;
        font-size: 18px;
        color: #666;
        width: 100%;
        text-align: center;
    `;

    playPauseBtn.style.cssText = `
        background: #ffffff;
        border: 1px solid #000000;
        color: #000000;
        border-radius: 6px;
        width: 36px;
        height: 36px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-top: 4px;
        transition: all 0.2s;
    `;

    playPauseBtn.addEventListener('mouseenter', () => {
        playPauseBtn.style.background = '#000000';
        playPauseBtn.style.color = '#ffffff';
    });
    playPauseBtn.addEventListener('mouseleave', () => {
        playPauseBtn.style.background = '#ffffff';
        playPauseBtn.style.color = '#000000';
    });

    playPauseBtn.addEventListener('click', toggleReadAloud);

    document.body.appendChild(floatingControl);
    initDraggable(floatingControl, dragHandle);
    loadPosition();
}

function initDraggable(el, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    handle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
        handle.style.cursor = 'grabbing';
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        const newTop = el.offsetTop - pos2;
        const newLeft = el.offsetLeft - pos1;
        
        el.style.top = newTop + "px";
        el.style.left = newLeft + "px";
        el.style.transform = 'none'; // Remove centering transform once dragged
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
        handle.style.cursor = 'grab';
        savePosition();
    }
}

function savePosition() {
    chrome.storage.local.set({
        ttsPos: {
            top: floatingControl.style.top,
            left: floatingControl.style.left
        }
    });
}

function loadPosition() {
    chrome.storage.local.get(['ttsPos'], (res) => {
        if (res.ttsPos) {
            floatingControl.style.top = res.ttsPos.top;
            floatingControl.style.left = res.ttsPos.left;
            floatingControl.style.transform = 'none';
        }
    });
}

// ─── TTS Logic ───────────────────────────────────────────────────────────────
let voiceA = null; // For page content
let voiceB = null; // For claim explanations

function initVoices() {
    const voices = window.speechSynthesis.getVoices();
    // Prioritize natural sounding voices for Voice 1 (Narrator)
    voiceA = voices.find(v => v.name.includes('Natural') && v.lang.startsWith('en')) || 
             voices.find(v => v.name.includes('Online') && v.lang.startsWith('en')) || 
             voices.find(v => v.name.includes('Google') && v.lang.startsWith('en')) || 
             voices[0];
             
    // Voice 2 (Fact Checker) - already confirmed good
    voiceB = voices.find(v => v.name.includes('Female') || v.name.includes('Zira')) || voices[1] || voices[0];
}

async function toggleReadAloud() {
    if (isReading) {
        stopReadAloud();
    } else {
        startReadAloud(0);
    }
}

function stopReadAloud() {
    window.speechSynthesis.cancel();
    isReading = false;
    clearWordHighlight();
    updateUI(false);
}

// ─── TTS Highlighting ───────────────────────────────────────────────────────
function clearWordHighlight() {
    document.querySelectorAll('.factlens-reading-active').forEach(el => {
        el.classList.remove('factlens-reading-active');
    });
}

function highlightWord(node) {
    if (!node) return;
    const parent = node.parentElement;
    if (parent) {
        clearWordHighlight();
        parent.classList.add('factlens-reading-active');
        parent.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

async function startReadAloud(startIndex = 0) {
    if (isReading) stopReadAloud();
    
    isReading = true;
    updateUI(true);
    if (!voiceA) initVoices();

    const sections = getReadableNodes();
    for (let i = startIndex; i < sections.length; i++) {
        if (!isReading) break;
        const item = sections[i];

        // Check if this node is part of a highlighted claim
        const matchingClaim = Object.keys(claimDataCache).find(c => item.text.includes(c));

        if (matchingClaim && claimDataCache[matchingClaim].explanation) {
            // Read section first, but don't clear highlight yet
            await speak(item.text, voiceA, item.node, false);
            if (!isReading) break;
            
            // Read summary with Voice B and clear highlight after
            const summary = claimDataCache[matchingClaim].explanation.substring(0, 200) + "...";
            await speak(`Fact Check Verdict: ${summary}`, voiceB, item.node, true);
        } else {
            // Standard section: read and clear
            await speak(item.text, voiceA, item.node, true);
        }
    }
    if (isReading) stopReadAloud();
}

function speak(text, voice, node = null, clearAtEnd = true) {
    return new Promise((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = voice;
        
        utterance.onstart = () => {
            if (node) highlightWord(node);
        };

        const onFinish = () => {
            if (clearAtEnd) clearWordHighlight();
            resolve();
        };

        utterance.onend = onFinish;
        utterance.onerror = onFinish;
        
        currentUtterance = utterance;
        window.speechSynthesis.speak(utterance);
    });
}

function updateUI(reading) {
    const playIcon = document.getElementById('factlens-play-icon');
    const pauseIcon = document.getElementById('factlens-pause-icon');
    if (playIcon && pauseIcon) {
        playIcon.style.display = reading ? 'none' : 'block';
        pauseIcon.style.display = reading ? 'block' : 'none';
    }
}

// ─── Message Listener ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractText') {
        const text = extractCleanText();
        createFloatingTTSControl(); // Ensure UI exists on first extraction
        sendResponse({ text, url: window.location.href, title: document.title });
    }

    if (request.action === 'highlightClaims') {
        clearHighlights();
        (request.claims || []).forEach(claim => highlightClaimInDOM(claim));
    }

    if (request.action === 'updateHighlightResult') {
        const { claim, result, explanation, sources } = request;
        const resultLow = (result || '').toLowerCase();
        
        // Cache data for TTS
        claimDataCache[claim] = { result, explanation };
        
        const mark = highlightedMarks.find(m => m.getAttribute('data-claim') === claim);
        if (mark) {
            if (resultLow.includes('true')) {
                mark.style.backgroundColor = 'rgba(76, 175, 80, 0.4)';
                mark.style.borderBottom = '2px solid #2e7d32';
                mark.dataset.color = 'green';
            } else if (resultLow.includes('false')) {
                mark.style.backgroundColor = 'rgba(244, 67, 54, 0.4)';
                mark.style.borderBottom = '2px solid #c62828';
                mark.dataset.color = 'red';
            }
        }
    }

    if (request.action === 'showTTSToggle') {
        if (!floatingControl) createFloatingTTSControl();
        if (floatingControl) floatingControl.style.display = 'flex';
    }

    if (request.action === 'scrollToClaim') {
        const claim = request.claim;
        const mark = highlightedMarks.find(m => m.getAttribute('data-claim') === claim);
        if (mark) {
            mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const originalShadow = mark.style.boxShadow;
            mark.style.boxShadow = '0 0 15px rgba(129, 140, 248, 0.8)';
            setTimeout(() => {
                mark.style.boxShadow = originalShadow;
            }, 2000);
        }
    }
});

// Init voices on load if possible
if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = initVoices;
}
