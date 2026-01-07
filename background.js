// background.js

// Queue Management
let archiveQueue = [];
let isProcessing = false;

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Background: Received message:", request);

    if (request.action === "start_archive") {
        console.log("Background: Starting single archive for URL:", request.url);
        // Treat as a batch of 1 or special case
        // If url is empty, it means "current tab" -> handled immediately (not queued) to avoid complexity
        if (!request.url) {
            handleCurrentTabArchive();
            sendResponse({ status: "started" });
        } else {
            addToQueue([request.url]);
            sendResponse({ status: "queued" });
        }
    } else if (request.action === "batch_archive") {
        console.log("Background: Processing batch of", request.urls.length, "URLs");
        addToQueue(request.urls);
        sendResponse({ status: "queued", count: request.urls.length });
    }

    return true; // Keep channel open
});

function addToQueue(urls) {
    archiveQueue.push(...urls);
    processQueue();
}

async function processQueue() {
    if (isProcessing) return;
    if (archiveQueue.length === 0) return;

    isProcessing = true;
    console.log("Background: Queue processing started. Remaining:", archiveQueue.length);

    try {
        while (archiveQueue.length > 0) {
            const url = archiveQueue.shift();
            console.log("Background: Processing URL:", url);
            try {
                await processSingleUrl(url);
            } catch (err) {
                console.error("Background: Error processing URL:", url, err);
            }

            // Small delay between items to be safe
            await new Promise(r => setTimeout(r, 1000));
        }
    } finally {
        isProcessing = false;
        console.log("Background: Queue processing finished.");
    }
}

// Logic for Current Tab (Legacy/Interactive)
async function handleCurrentTabArchive() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return;

        if (tab.status === 'complete') {
            injectAndExecute(tab.id);
        } else {
            chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
                if (tabId === tab.id && info.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    injectAndExecute(tab.id);
                }
            });
        }
    } catch (err) {
        console.error("Current tab archive error:", err);
    }
}

// Logic for URL from Queue
function processSingleUrl(url) {
    return new Promise(async (resolve, reject) => {
        try {
            const settings = await chrome.storage.local.get({ showSourcePage: true });
            const showSource = settings.showSourcePage;

            // Create tab
            const tab = await chrome.tabs.create({ url: url, active: showSource });
            const tabId = tab.id;

            if (!showSource) {
                await chrome.storage.local.set({ backgroundTabId: tabId });
            }

            // Wait for load
            const onTabUpdated = (tid, info) => {
                if (tid === tabId && info.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(onTabUpdated);

                    // Inject
                    chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        files: ['content.js'],
                        world: 'ISOLATED'
                    }).then(() => {
                        // Wait for script init
                        setTimeout(() => {
                            // Send Scrape Message
                            chrome.tabs.sendMessage(tabId, { action: "scrape" }, (response) => {
                                if (chrome.runtime.lastError || !response) {
                                    console.error("Scrape failed:", chrome.runtime.lastError);
                                    // Close tab if failed and background
                                    if (!showSource) chrome.tabs.remove(tabId);
                                    reject(new Error("Scrape handshake failed"));
                                    return;
                                }

                                // Handle Response
                                handleScrapeResponse(response, () => {
                                    // On Success (Download started)
                                    // For background tabs, we wait for download to finish to close tab
                                    // But for queue progress, we can resolve now or wait a bit.
                                    // handleScrapeResponse is synchronous-ish but triggers download async.

                                    // We need to know when download is DONE to resolve this promise effectively?
                                    // Actually, let's resolve now, but maybe keep tab open until download finishes?
                                    // chrome.downloads.onChanged handles closing the background tab.
                                    resolve();
                                });
                            });
                        }, 500); // reduced delay
                    }).catch(err => {
                        console.error("Injection error:", err);
                        reject(err);
                    });
                }
            };
            chrome.tabs.onUpdated.addListener(onTabUpdated);

        } catch (e) {
            reject(e);
        }
    });
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
        setTimeout(() => sendMessageWithRetry(tabId, { action: "scrape" }, 0), 500);
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
        body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #1a1a1a; margin: 0 auto; padding: 20px; max-width: 800px; background: #fff; }
        header { border-bottom: 2px solid #f1f5f9; padding-bottom: 10px; margin-bottom: 30px; }
        h1 { font-size: 1.5em; margin: 0 0 5px 0; color: #0f172a; }
        .meta { color: #64748b; font-size: 0.9em; }
        .btn-download { display: none; }
        
        .turn { margin-bottom: 30px; }
        .role-label { font-size: 0.85em; font-weight: 700; margin-bottom: 8px; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; }
        
        .message-content { 
            white-space: pre-wrap; 
            font-size: 1rem; 
            line-height: 1.7;
        }

        /* 
           EXTREME MEASURE: Force enable interaction on everything inside the message content.
           This overrides any specific style attributes or classes from the scraped content.
        */
        .message-content, 
        .message-content * {
            user-select: text !important;
            -webkit-user-select: text !important;
            pointer-events: auto !important;
            cursor: auto !important;
        }
        
        /* Make User questions distinct but minimal */
        .user-message { 
            background-color: #f1f5f9; /* Slate 100 - Light Grey */
            padding: 15px 20px; 
            border-radius: 12px;
            color: #334155;
            font-weight: 500;
        } 
        
        .model-message { 
            background-color: #eff6ff; /* Blue 50 - Very Light Blue */
            padding: 15px 20px; 
            border-radius: 12px;
            color: #0f172a; 
            margin-top: 5px;
        }
        
        /* Code Block Styling */
        pre { background: #1e293b; color: #e2e8f0; padding: 15px; border-radius: 8px; overflow-x: auto; font-size: 0.9em; margin: 15px 0; }
        code { font-family: 'Consolas', 'Monaco', monospace; }
        .message-content code { background: #e2e8f0; color: #0f172a; padding: 2px 5px; border-radius: 4px; font-size: 0.9em; }
        .message-content pre code { background: none; color: inherit; padding: 0; }
        
        img { max-width: 100%; height: auto; border-radius: 8px; margin: 10px 0; }
        a { color: #2563eb; text-decoration: none; border-bottom: 1px solid transparent; }
        a:hover { border-bottom-color: #2563eb; }
        ul, ol { padding-left: 25px; margin: 10px 0; }
        li { margin-bottom: 5px; }
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

function handleScrapeResponse(response, callback) {
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
                platform: data.platform,
                filename: filename,
                date: new Date().toLocaleString()
                // No need to store fullData anymore for viewer
            });
            if (recents.length > 20) recents.pop(); // Increase history size since it's just metadata
            chrome.storage.local.set({ recents: recents });
        });

        // Sanitize content: Remove restrictive styles (User Request)
        if (data.turns && Array.isArray(data.turns)) {
            data.turns.forEach(turn => {
                if (turn.content) {
                    // Remove pointer-events: none (allows clicking/interaction)
                    turn.content = turn.content.replace(/pointer-events:\s*none;?/gi, '');
                    // Remove user-select: none (allows text selection)
                    turn.content = turn.content.replace(/user-select:\s*none;?/gi, '');
                    // Clean up potentially empty style attributes
                    turn.content = turn.content.replace(/style="\s*"/gi, '');
                }
            });
        }

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
                if (!error) {
                    activeDownloads.add(downloadId);
                }

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

                if (callback) callback();
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
// Track active downloads initiated by this extension
const activeDownloads = new Set();

// Listen for download completion
chrome.downloads.onChanged.addListener(async (delta) => {
    // Only handle state changes to 'complete'
    if (delta.state && delta.state.current === 'complete') {
        console.log("Download completed. ID:", delta.id);

        const settings = await chrome.storage.local.get({
            showSourcePage: true,
            backgroundTabId: null,
            autoOpenFile: true
        });

        // 1. Auto Open Logic (Applies to ALL modes if enabled and initiated by us)
        if (activeDownloads.has(delta.id)) {
            activeDownloads.delete(delta.id); // Remove from tracking

            if (settings.autoOpenFile) {
                // Check filename to be safe
                const downloads = await chrome.downloads.search({ id: delta.id });
                if (downloads.length > 0) {
                    const download = downloads[0];
                    if (download.filename && download.filename.endsWith('.html')) {
                        console.log("Auto-opening downloaded file:", download.filename);

                        // Construct file URL
                        // Note: Browsers usually require "Allow access to file URLs" for extensions to open file:// links
                        const path = download.filename.replace(/\\/g, '/');
                        const fileUrl = 'file:///' + path.split('/').map(encodeURIComponent).join('/');

                        chrome.tabs.create({ url: fileUrl }).catch(err => {
                            console.error("Failed to open file tab:", err);
                            // Fallback to show if tab creation fails (e.g. permission issues)
                            chrome.downloads.show(delta.id);
                        });
                    }
                }
            }
        }

        // 2. Background Tab Cleanup Logic (Only if background mode)
        if (!settings.showSourcePage && settings.backgroundTabId) {
            try {
                await chrome.tabs.remove(settings.backgroundTabId);
                console.log("Background tab closed for download:", delta.id);
                await chrome.storage.local.remove('backgroundTabId');
            } catch (e) {
                // Tab might be gone or already closed
            }
        }
    }
});
