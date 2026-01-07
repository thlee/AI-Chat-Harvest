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
                    // Use flexbox for layout: title on left, platform on right
                    div.style.cssText = 'padding: 0.5rem 0.75rem; background: #334155; border-radius: 0.5rem; font-size: 0.85rem; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;';
                    div.title = item.title; // Show full title on hover

                    const titleSpan = document.createElement('span');
                    titleSpan.style.cssText = 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 0.5rem; flex: 1;';
                    titleSpan.innerText = item.title;

                    const platformSpan = document.createElement('span');
                    platformSpan.style.cssText = 'font-size: 0.7rem; color: #94a3b8; background: #1e293b; padding: 2px 6px; border-radius: 4px; text-transform: capitalize;';
                    // Default to empty if not present (legacy items)
                    platformSpan.innerText = item.platform || 'Unknown';

                    div.appendChild(titleSpan);
                    div.appendChild(platformSpan);
                    list.appendChild(div);
                });
            }
        });
    } else {
        console.warn("chrome.storage is not available.");
        const list = document.getElementById('recent-list');
        if (list) list.innerHTML = '<p style="font-size: 0.8rem; color: #f87171;">Reload required.</p>';
    }

    // Help Modal Logic
    const helpModal = document.getElementById('help-modal');
    const btnHelp = document.getElementById('btn-help');
    const closeHelp = document.getElementById('close-help');

    btnHelp.addEventListener('click', () => {
        helpModal.style.display = "block";
    });

    closeHelp.addEventListener('click', () => {
        helpModal.style.display = "none";
    });

    window.addEventListener('click', (event) => {
        if (event.target === helpModal) {
            helpModal.style.display = "none";
        }
    });

    btnArchive.addEventListener('click', async () => {
        const inputVal = urlInput.value.trim();
        const urls = inputVal.split(/[\r\n]+/).map(u => u.trim()).filter(u => u.length > 0);

        if (urls.length === 0 && inputVal.length === 0) {
            // Case for archiving current tab (empty input)
            // Send empty list to signify "current tab"
            // Wait, previous logic was: if url empty -> current tab.
            // If user enters nothing, we pass empty list? Or specific flag?
            // Let's keep consistency: if input empty -> archive current tab
            chrome.runtime.sendMessage({ action: "start_archive", url: "" }, (response) => {
                if (chrome.runtime.lastError) {
                    showStatus('Error: ' + chrome.runtime.lastError.message, 'error');
                    btnArchive.disabled = false;
                } else {
                    showStatus('Archiving current tab...', 'success');
                    setTimeout(() => window.close(), 1000);
                }
            });
            return;
        }

        if (urls.length > 10) {
            const confirmed = confirm(`You are about to archive ${urls.length} URLs. This might take a while. Continue?`);
            if (!confirmed) {
                return;
            }
        }

        showStatus(`Queueing ${urls.length} URLs...`, 'info');
        btnArchive.disabled = true;

        chrome.runtime.sendMessage({ action: "batch_archive", urls: urls }, (response) => {
            if (chrome.runtime.lastError) {
                showStatus('Error: ' + chrome.runtime.lastError.message, 'error');
                btnArchive.disabled = false;
            } else {
                showStatus(`Started! Processing ${urls.length} archives in background.`, 'success');
                setTimeout(() => window.close(), 2000);
            }
        });
    });
});
