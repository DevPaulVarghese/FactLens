const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileList = document.getElementById('file-list');
const fileCount = document.getElementById('file-count');
const API_BASE = "http://127.0.0.1:8080";

// Handle drag and drop
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    handleFiles(files);
});

dropZone.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', () => {
    handleFiles(fileInput.files);
});

async function handleFiles(files) {
    for (const file of files) {
        await uploadFile(file);
    }
    loadFiles(); // Refresh list
}

async function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(`${API_BASE}/vault/upload`, {
            method: 'POST',
            body: formData
        });
        if (!response.ok) throw new Error('Upload failed');
        console.log(`Uploaded ${file.name}`);
    } catch (error) {
        console.error('Error uploading file:', error);
        alert(`Failed to upload ${file.name}: ${error.message}`);
    }
}

async function loadFiles() {
    try {
        const response = await fetch(`${API_BASE}/vault/list`);
        const data = await response.json();
        renderFileList(data.files);
        fileCount.textContent = `${data.files.length} Files`;
    } catch (error) {
        console.error('Error loading files:', error);
        fileList.innerHTML = '<div class="empty-state">Failed to load files. Is the backend running?</div>';
    }
}

function renderFileList(files) {
    if (files.length === 0) {
        fileList.innerHTML = '<div class="empty-state">Vault Empty — Upload documents to begin</div>';
        return;
    }

    fileList.innerHTML = files.map(file => {
        const ext = file.name.split('.').pop().toLowerCase();
        return `
            <div class="file-card">
                <div class="file-main">
                    <div class="file-icon-box">${ext}</div>
                    <div class="file-details">
                        <h4>${file.name}</h4>
                        <p>Size: ${formatBytes(file.size)} • Indexed</p>
                    </div>
                </div>
                <div class="file-actions">
                    <button class="btn-action btn-view" data-filename="${file.name}">View</button>
                    <button class="btn-action btn-delete" data-filename="${file.name}">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

// Event delegation for View/Delete buttons (CSP Compliance)
fileList.addEventListener('click', (e) => {
    console.log("Dashboard click detected:", e.target);
    const btn = e.target.closest('.btn-action');
    if (!btn) return;

    const fileName = btn.dataset.filename;
    console.log("Action button clicked for file:", fileName);
    if (btn.classList.contains('btn-view')) {
        viewFile(fileName);
    } else if (btn.classList.contains('btn-delete')) {
        deleteFile(fileName);
    }
});

async function deleteFile(fileName) {
    console.log("Vault: Initiating deletion for", fileName);
    // Explicitly using window.confirm as a fallback but console log first
    // if (!confirm(`Delete ${fileName}?`)) return; 

    try {
        const url = `${API_BASE}/vault/delete?filename=${encodeURIComponent(fileName)}`;
        console.log("Vault: Sending DELETE request to", url);
        const response = await fetch(url, {
            method: 'DELETE'
        });
        const result = await response.json();
        console.log("Vault: Delete response:", result);
        
        if (!response.ok) throw new Error(result.detail || 'Delete failed');
        console.log("Vault: Successfully deleted", fileName);
        loadFiles();
    } catch (error) {
        console.error('Vault: Error deleting file:', error);
        alert(`Failed to delete file: ${error.message}`);
    }
}

function viewFile(fileName) {
    const url = `${API_BASE}/vault/view?filename=${encodeURIComponent(fileName)}`;
    console.log("Opening view URL:", url);
    if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.create({ url });
    } else {
        window.open(url, '_blank');
    }
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Initial load
loadFiles();

// Expose functions to global scope for onclick handlers
window.deleteFile = deleteFile;
window.viewFile = viewFile;
