document.addEventListener('DOMContentLoaded', () => {
    // Download Logic
    const btnArchive = document.getElementById('btn-archive');
    const urlInput = document.getElementById('url-input');
    const statusArea = document.getElementById('status-area');

    function showStatus(msg, type = 'info') {
        statusArea.innerText = msg;
        statusArea.className = `status-msg status-${type}`;
        statusArea.style.display = 'block';
    }

    // Load Recents with safety check
    if (chrome.storage) {
        chrome.storage.local.get({ recents: [], historyCount: 5 }, (result) => {
            const list = document.getElementById('recent-list');
            list.innerHTML = '';

            const maxCount = result.historyCount || 5;
            const recentItems = result.recents.slice(0, maxCount);

            if (recentItems.length === 0) {
                list.innerHTML = '<p style="font-size: 0.8rem; color: #64748b; font-style: italic;">No history yet.</p>';
            } else {
                recentItems.forEach(item => {
                    const div = document.createElement('div');
                    div.style.cssText = 'padding: 0.5rem 0.75rem; background: #334155; border-radius: 0.5rem; font-size: 0.85rem; margin-bottom: 0.5rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
                    div.title = item.title; // Show full title on hover
                    div.innerText = item.title;
                    list.appendChild(div);
                });
            }
        });
    } else {
        console.warn("chrome.storage is not available.");
        const list = document.getElementById('recent-list');
        if (list) list.innerHTML = '<p style="font-size: 0.8rem; color: #f87171;">Reload required.</p>';
    }

    btnArchive.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        showStatus('Processing...', 'info');
        btnArchive.disabled = true;

        chrome.runtime.sendMessage({ action: "start_archive", url: url }, (response) => {
            if (chrome.runtime.lastError) {
                showStatus('Error: ' + chrome.runtime.lastError.message, 'error');
                btnArchive.disabled = false;
            } else {
                showStatus('Done! HTML file downloaded.', 'success');
                setTimeout(() => window.close(), 2000);
            }
        });
    });
});
