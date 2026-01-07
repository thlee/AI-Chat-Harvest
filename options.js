document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);

function saveOptions() {
    const dir = document.getElementById('save-dir').value.trim();
    const showSource = document.getElementById('show-source').checked;
    const autoOpen = document.getElementById('auto-open').checked;
    const historyCount = parseInt(document.getElementById('history-count').value) || 5;

    // Validate history count
    const validHistoryCount = Math.max(1, Math.min(50, historyCount));

    // Remove leading/trailing slashes and illegal chars
    const sanitizedDir = dir.replace(/^[\\\/]+|[\\\/]+$/g, '').replace(/[^a-zA-Z0-9_\-\/]/g, '_');

    chrome.storage.local.set({
        downloadDirectory: sanitizedDir,
        showSourcePage: showSource,
        autoOpenFile: autoOpen,
        historyCount: validHistoryCount
    }, () => {
        const status = document.getElementById('status');
        status.style.display = 'block';
        setTimeout(() => {
            status.style.display = 'none';
        }, 2000);

        // Update input if sanitization changed it
        document.getElementById('save-dir').value = sanitizedDir;
        document.getElementById('history-count').value = validHistoryCount;
    });
}

function restoreOptions() {
    chrome.storage.local.get({
        downloadDirectory: '',
        showSourcePage: true,  // Default to true (show source page)
        autoOpenFile: true,      // Default to true (auto open downloaded file)
        historyCount: 5
    }, (items) => {
        document.getElementById('save-dir').value = items.downloadDirectory;
        document.getElementById('show-source').checked = items.showSourcePage;
        document.getElementById('auto-open').checked = items.autoOpenFile;
        document.getElementById('history-count').value = items.historyCount;
    });
}
