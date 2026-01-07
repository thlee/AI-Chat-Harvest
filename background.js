// background.js

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Background: Received message:", request);
    if (request.action === "start_archive") {
        console.log("Background: Starting archive for URL:", request.url);
        handleArchiveRequest(request.url);
        sendResponse({ status: "started" });
    }



    return true; // Keep channel open for async response
});

async function handleArchiveRequest(url) {
    try {
        // Read settings
        const settings = await chrome.storage.local.get({ showSourcePage: true });
        const showSource = settings.showSourcePage;

        let targetTabId;

        if (url) {
            // Case 1: Open new tab (active based on setting)
            console.log("Opening tab for URL, active:", showSource);
            const tab = await chrome.tabs.create({ url: url, active: showSource });
            targetTabId = tab.id;

            // Store tab ID for cleanup if background mode
            if (!showSource) {
                await chrome.storage.local.set({ backgroundTabId: targetTabId });
            }

            // Wait for load
            chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
                if (tabId === targetTabId && info.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    injectAndExecute(targetTabId);
                }
            });

        } else {
            // Case 2: Use current active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) return;
            targetTabId = tab.id;

            if (tab.status === 'complete') {
                // Already loaded, proceed immediately
                injectAndExecute(targetTabId);
            } else {
                // Still loading, wait
                chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
                    if (tabId === targetTabId && info.status === 'complete') {
                        chrome.tabs.onUpdated.removeListener(listener);
                        injectAndExecute(targetTabId);
                    }
                });
            }
        }
    } catch (err) {
        console.error("Archive error:", err);
    }
}

function injectAndExecute(tabId) {
    console.log("Injecting content script into tab:", tabId);

    // Programmatic injection (not affected by page CSP)
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js'],
        world: 'ISOLATED' // Run in isolated world (extension context)
    }).then(() => {
        console.log("Content script injected successfully");
        // Wait for script to initialize
        setTimeout(() => sendMessageWithRetry(tabId, { action: "scrape" }, 0), 2000);
    }).catch(err => {
        console.error("Injection failed:", err);
    });
}

function sendMessageWithRetry(tabId, message, attempt) {
    if (attempt > 10) {
        console.error("Failed to contact content script after 10 attempts");
        return;
    }

    // Check if tab still exists
    chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError || !tab) {
            console.log("Tab closed, stopping retry");
            return;
        }

        chrome.tabs.sendMessage(tabId, message, (response) => {
            if (chrome.runtime.lastError || !response) {
                console.log(`Attempt ${attempt}: Waiting for content script... (${chrome.runtime.lastError ? chrome.runtime.lastError.message : 'no response'})`);
                setTimeout(() => sendMessageWithRetry(tabId, message, attempt + 1), 1000);
            } else {
                handleScrapeResponse(response);
            }
        });
    });
}

// HTML Template Generator
function generateHtml(data) {
    const jsonString = JSON.stringify(data);
    // Properly escape for embedding in HTML script tag
    // Must escape: \u003c \u003e & to prevent HTML parsing issues
    // JSON.stringify already handles quotes and backslashes correctly
    const safeJson = jsonString
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e');
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${data.title || 'Gemini Archive'}</title>
    <style>
        body { font-family: 'Segoe UI', system-ui, sans-serif; background-color: #0f172a; color: #e2e8f0; margin: 0; padding: 20px; line-height: 1.6; }
        .container { max-width: 800px; margin: 0 auto; }
        header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; border-bottom: 1px solid #334155; padding-bottom: 1rem; }
        h1 { font-size: 1.5rem; margin: 0; color: #f8fafc; }
        .meta { font-size: 0.9rem; color: #94a3b8; }
        .btn-download { background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; text-decoration: none; display: inline-block; }
        .btn-download:hover { background: #2563eb; }
        
        /* Conversation Styles */
        .turn { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 2rem; }
        .role-label { font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; font-weight: 700; margin-left: 4px; }
        .message-content { padding: 1rem; border-radius: 0.75rem; font-size: 1rem; }
        .user-message { align-self: flex-end; background-color: #334155; border-bottom-right-radius: 0.2rem; max-width: 85%; }
        .model-message { align-self: flex-start; background-color: #1e293b; border-bottom-left-radius: 0.2rem; max-width: 100%; width: 100%; box-sizing: border-box; }
        
        /* Markdown & Code */
        .message-content img { max-width: 100%; border-radius: 0.5rem; }
        .message-content pre { background-color: #020617; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; font-family: 'Consolas', monospace; border: 1px solid #1e293b; }
        .message-content code { background-color: rgba(0,0,0,0.3); padding: 0.2rem 0.4rem; border-radius: 0.3rem; font-family: 'Consolas', monospace; font-size: 0.9em; }
        .message-content pre code { background: none; padding: 0; }
        
        a { color: #60a5fa; }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div>
                <h1>${data.title || 'Conversation Archive'}</h1>
                <div class="meta">Archived on ${new Date().toLocaleString()}</div>
            </div>
            <button onclick="downloadJson()" class="btn-download">Download JSON</button>
        </header>

        <div id="conversation-body">
            <!-- Content will be rendered here -->
        </div>
    </div>

    <!-- Embedded Data -->
    <script id="conversation-data" type="application/json">
        ${safeJson}
    </script>

    <script>
        // Data Retrieval
        const dataScript = document.getElementById('conversation-data');
        const data = JSON.parse(dataScript.textContent);

        // Rendering Logic
        const container = document.getElementById('conversation-body');
        
        data.turns.forEach(turn => {
            const turnEl = document.createElement('div');
            turnEl.className = 'turn';

            const role = document.createElement('div');
            role.className = 'role-label';
            let modelName = 'Model';
            if (data.platform === 'chatgpt') modelName = 'ChatGPT';
            else if (data.platform === 'gemini') modelName = 'Gemini';
            else if (data.platform === 'claude') modelName = 'Claude';
            
            role.innerText = turn.role === 'user' ? 'You' : modelName;
            
            const content = document.createElement('div');
            content.className = 'message-content ' + (turn.role === 'user' ? 'user-message' : 'model-message');
            content.innerHTML = turn.content; 

            turnEl.appendChild(role);
            turnEl.appendChild(content);
            container.appendChild(turnEl);
        });

        // Download Function
        function downloadJson() {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            // Sanitize filename - cleaner approach
            let safeTitle = (data.title || "gemini_archive");
            // Remove newlines and tabs
            safeTitle = safeTitle.replace(/[\\r\\n\\t]/g, ' ');
            // Remove punctuation and illegal characters for cleaner filenames (User Request)
            // Replaces: . , ! ? ; : " ' ( ) [ ] { } < > | * / \
            safeTitle = safeTitle.replace(/[.,!?;:"'(){}\\[\\]<>|*\\/\\\\~]/g, ' ');
            
            // Collapse multiple spaces
            safeTitle = safeTitle.replace(/\s+/g, ' ').trim();
            // Collapse multiple spaces
            while (safeTitle.includes('  ')) {
                safeTitle = safeTitle.split('  ').join(' ');
            }
            safeTitle = safeTitle.trim();
            if (safeTitle.length > 100) safeTitle = safeTitle.substring(0, 100);
            
            a.download = safeTitle + '.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    </script>
</body>
</html>`;
}

function handleScrapeResponse(response) {
    if (response && response.success) {
        const data = response.data;
        console.log("Background: Processing scraped data, title:", data.title);

        // Sanitize filename: Remove invalid characters and punctuation (User Request for cleaner names)
        // Windows illegal: < > : " / \ | ? * 
        // Also removing common punctuation for aesthetics: . , ! ?
        let safeTitle = (data.title || "gemini_archive");

        // Remove newlines, tabs, carriage returns
        safeTitle = safeTitle.replace(/[\r\n\t]/g, ' ');

        // Remove punctuation and illegal filename characters, replacing with space
        safeTitle = safeTitle.replace(/[.,!?;:"'(){}\[\]<>|*\/\\~]/g, ' ');

        // Replace multiple spaces with single space


        safeTitle = safeTitle.replace(/\s+/g, ' ');

        // Trim and truncate
        safeTitle = safeTitle.trim();
        if (safeTitle.length > 100) safeTitle = safeTitle.substring(0, 100);

        // Ensure we have a valid filename
        if (!safeTitle || safeTitle === '') {
            safeTitle = 'gemini_archive';
        }

        const filename = `${safeTitle}.html`;
        console.log("Background: Safe filename:", filename);

        // Save to Recents (History only)
        chrome.storage.local.get({ recents: [] }, (result) => {
            const recents = result.recents;
            recents.unshift({
                title: data.title || "Untitled",
                filename: filename,
                date: new Date().toLocaleString()
                // No need to store fullData anymore for viewer
            });
            if (recents.length > 20) recents.pop(); // Increase history size since it's just metadata
            chrome.storage.local.set({ recents: recents });
        });

        // Generate HTML
        const htmlContent = generateHtml(data);

        // UTF-8 encoding for Data URI
        // Using encodeURIComponent matches common patterns for handling non-ASCII in data URIs without relying on deprecated unescape
        // but btoa requires binary string. 
        // Best approach for modern browsers is Blob, but chrome.downloads needs a URL.
        // We will stick to the unescape(encodeURIComponent) trick for btoa(utf8) compatibility
        const base64 = btoa(unescape(encodeURIComponent(htmlContent)));
        const dataUrl = `data:text/html;charset=utf-8;base64,${base64}`;

        // Read directory setting
        chrome.storage.local.get({ downloadDirectory: '' }, (settings) => {
            let finalFilename = filename;
            if (settings.downloadDirectory) {
                finalFilename = settings.downloadDirectory + '/' + filename;
            }

            // Attempt download
            chrome.downloads.download({
                url: dataUrl,
                filename: finalFilename,
                saveAs: false
            }, (downloadId) => {
                const error = chrome.runtime.lastError;
                if (error) {
                    console.error("Archive Download Failed:", error.message);

                    // Possible reason: Configured directory does not exist or permission denied.
                    // Retry saving to default downloads folder
                    if (settings.downloadDirectory) {
                        console.log("Retrying download to default folder...");
                        chrome.downloads.download({
                            url: dataUrl,
                            filename: filename, // Use simple filename without path
                            saveAs: false
                        }, (retryId) => {
                            if (chrome.runtime.lastError) {
                                console.error("Retry failed:", chrome.runtime.lastError.message);
                            } else {
                                console.log("Retry success, ID:", retryId);
                            }
                        });
                    }
                } else {
                    console.log("Archive saved successfully. ID:", downloadId);
                }
            });
        });
    } else {
        console.error("Scraping response failed or empty:", response);
    }

    if (response && response.data && response.data.turns && response.data.turns.length === 0) {
        console.warn("WARNING: Zero turns scraped. The selector logic might be failing or content was not loaded.");
    }
}

// Listen for download completion
chrome.downloads.onChanged.addListener(async (delta) => {
    // Only handle state changes to 'complete'
    if (delta.state && delta.state.current === 'complete') {
        console.log("Download completed:", delta.id);

        // Check if we should auto-open and close background tab
        const settings = await chrome.storage.local.get({
            showSourcePage: true,
            backgroundTabId: null,
            autoOpenFile: true
        });

        if (!settings.showSourcePage && settings.backgroundTabId) {
            // Get download info
            const downloads = await chrome.downloads.search({ id: delta.id });
            if (downloads.length > 0) {
                const download = downloads[0];
                console.log("Downloaded file:", download.filename);

                // Open the downloaded HTML file location if enabled
                if (settings.autoOpenFile && download.filename && download.filename.endsWith('.html')) {
                    // Chrome doesn't allow direct file:/// URLs from extensions
                    // We need to use chrome.downloads.show() or open Downloads page
                    // Best approach: open downloads page
                    await chrome.downloads.show(delta.id);
                }

                // Close the background tab
                try {
                    await chrome.tabs.remove(settings.backgroundTabId);
                    console.log("Background tab closed");
                } catch (e) {
                    console.log("Background tab already closed or not found");
                }

                // Clear stored tab ID
                await chrome.storage.local.remove('backgroundTabId');
            }
        }
    }
});
