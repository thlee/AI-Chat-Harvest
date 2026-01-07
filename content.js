/* content.js */
(function () {
    // Utility to wait for elements
    function waitForElement(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(selector)) {
                return resolve(document.querySelector(selector));
            }

            const observer = new MutationObserver(mutations => {
                if (document.querySelector(selector)) {
                    resolve(document.querySelector(selector));
                    observer.disconnect();
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Timeout waiting for ${selector}`));
            }, timeout);
        });
    }

    // Detect platform
    function detectPlatform() {
        const url = window.location.href;
        if (url.includes('gemini.google.com')) return 'gemini';
        if (url.includes('chatgpt.com')) return 'chatgpt';
        return 'unknown';
    }

    // Scrape ChatGPT conversation
    async function scrapeChatGPT() {
        console.log("AI Archiver: Scraping ChatGPT conversation...");

        // Wait for messages to load
        await waitForElement('[data-message-author-role]', 5000).catch(() => {
            console.warn("No messages found");
        });



        const turns = [];
        const messages = document.querySelectorAll('[data-message-author-role]');

        messages.forEach((msg) => {
            const role = msg.getAttribute('data-message-author-role'); // "user" or "assistant"
            const markdownEl = msg.querySelector('.markdown') || msg.querySelector('[class*="markdown"]');

            let content = '';
            if (markdownEl) {
                content = markdownEl.innerHTML;
            } else {
                // Fallback to innerText
                content = msg.innerText;
            }

            if (content.trim()) {
                turns.push({
                    role: role === 'assistant' ? 'model' : 'user', // Normalize to match Gemini format
                    content: content
                });
            }
        });

        // Extract title from first user message 
        let title = 'ChatGPT Conversation';
        const firstUserMessage = turns.find(t => t.role === 'user');
        if (firstUserMessage && firstUserMessage.content) {
            // Remove HTML tags and get plain text
            const plainText = firstUserMessage.content.replace(/<[^>]*>/g, '').trim();
            // Take first line only
            const firstLine = plainText.split('\n')[0];

            // Limit to 50 characters, but break at sentence punctuation if exists
            let limitedText = firstLine.substring(0, 50);

            // Find last occurrence of sentence-ending punctuation within limit
            const punctuationMatch = limitedText.match(/[.?!]/g);
            if (punctuationMatch) {
                const lastPunctIndex = limitedText.lastIndexOf(punctuationMatch[punctuationMatch.length - 1]);
                if (lastPunctIndex > 0) {
                    // Cut at the punctuation mark (but don't include it in title)
                    limitedText = limitedText.substring(0, lastPunctIndex);
                }
            } else if (firstLine.length > 50) {
                // No punctuation found, add ellipsis if truncated
                limitedText += '...';
            }

            // Remove any trailing punctuation marks for cleaner filenames
            title = limitedText.replace(/[.?!,;:]+$/, '').trim();
        }

        console.log("ChatGPT: Scraped", turns.length, "messages");
        console.log("ChatGPT: Title:", title);

        return {
            platform: 'chatgpt',
            title: title,
            url: window.location.href,
            scrapedAt: new Date().toISOString(),
            turns: turns
        };
    }

    // Scrape Gemini conversation
    async function scrapeGemini() {
        console.log("Gemini Archiver: Starting scrape...");
        try {
            // Wait strictly for the viewer
            const viewer = await waitForElement('share-turn-viewer', 5000).catch(e => {
                console.warn("View container not found immediately, checking legacy selectors...");
                return document.querySelector('.content-container');
            });

            if (!viewer) throw new Error("Could not find conversation container.");

            console.log("Gemini Archiver: Container found. Starting auto-scroll...");

            // Robust Auto-scroll 
            await new Promise((resolve) => {
                let lastScrollHeight = document.body.scrollHeight;
                let noChangeCount = 0;

                // Interval increased to 200ms to allow rendering time
                const scrollTimer = setInterval(() => {
                    window.scrollTo(0, document.body.scrollHeight);

                    const currentScrollHeight = document.body.scrollHeight;

                    if (currentScrollHeight === lastScrollHeight) {
                        noChangeCount++;
                        // Wait for 20 checks * 200ms = 4 seconds of no change before finishing
                        // This handles slow valid lazy loads better
                        if (noChangeCount >= 20) {
                            clearInterval(scrollTimer);
                            console.log("Gemini Archiver: Reached bottom of page (Stable).");
                            resolve();
                        }
                    } else {
                        // Height increased, content loaded. Reset counter.
                        lastScrollHeight = currentScrollHeight;
                        noChangeCount = 0;
                        console.log("Gemini Archiver: Scrolling / Loading more content...");
                    }
                }, 200);

                // Safety timeout: 15 seconds max scrolling
                setTimeout(() => {
                    clearInterval(scrollTimer);
                    console.log("Gemini Archiver: Scroll timeout reached. Proceeding...");
                    resolve();
                }, 15000);
            });

            // Final hydration wait
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Title Extraction
            let title = 'Gemini Conversation';
            const titleEl = document.querySelector('.share-title-section') || document.querySelector('h1');
            if (titleEl && titleEl.innerText.trim()) {
                // Get only the first line, remove newlines and extra whitespace
                const fullText = titleEl.innerText.trim();
                const firstLine = fullText.split('\n')[0].trim();
                title = firstLine || 'Gemini Conversation';
            }

            console.log("Gemini Archiver: Extracted title:", title);

            const turns = [];
            const turnElements = document.querySelectorAll('share-turn-viewer');

            turnElements.forEach((turn, index) => {
                // User Query extraction
                // Selector strategy: user-query -> .query-text-line or .query-text
                const userQueryElement = turn.querySelector('user-query');
                let userText = '';
                if (userQueryElement) {
                    // Try to get structured text lines first
                    const lines = userQueryElement.querySelectorAll('.query-text-line');
                    if (lines.length > 0) {
                        userText = Array.from(lines).map(line => line.innerText).join('\n');
                    } else {
                        // Fallback to raw text
                        userText = userQueryElement.innerText.trim();
                    }
                }

                // Model Response extraction
                // Try multiple selectors including Tag Names
                let modelText = '';
                const modelSelectors = [
                    'message-content', // Custom Element Tag
                    '.message-content .markdown',
                    'model-response',
                    '.model-response-text',
                    '.markdown'
                ];

                for (let selector of modelSelectors) {
                    const el = turn.querySelector(selector);
                    if (el && el.innerHTML.trim()) {
                        modelText = el.innerHTML;
                        break;
                    }
                }

                if (userText || modelText) {
                    turns.push({
                        role: 'user',
                        content: userText
                    });
                    turns.push({
                        role: 'model',
                        content: modelText
                    });
                }
            });

            console.log("Gemini Archiver: Scraping complete!");
            console.log("  - Title:", title);
            console.log("  - Turns found:", turns.length);
            console.log("  - Turn elements found:", turnElements.length);

            if (turns.length === 0) {
                console.warn("WARNING: No turns were scraped! Debugging info:");
                console.warn("  - First turn element:", turnElements[0]);
                if (turnElements[0]) {
                    console.warn("  - user-query in first turn:", turnElements[0].querySelector('user-query'));
                    console.warn("  - message-content in first turn:", turnElements[0].querySelector('message-content'));
                }
            }

            const result = {
                platform: 'gemini',
                title: title,
                url: window.location.href,
                scrapedAt: new Date().toISOString(),
                turns: turns
            };

            console.log("Gemini Archiver: Sending result to background...", result);
            return result;

        } catch (error) {
            console.error('Scraping error:', error);
            throw error;
        }
    }

    // Main scraping function - detects platform and calls appropriate scraper
    async function scrapeConversation() {
        const platform = detectPlatform();
        console.log("AI Archiver: Detected platform:", platform);

        if (platform === 'chatgpt') {
            return await scrapeChatGPT();
        } else if (platform === 'gemini') {
            return await scrapeGemini();
        } else {
            throw new Error("Unsupported platform: " + window.location.href);
        }
    }

    // Listener for messages from popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "scrape") {
            scrapeConversation()
                .then(data => sendResponse({ success: true, data: data }))
                .catch(err => sendResponse({ success: false, error: err.toString() }));
            return true; // Will respond asynchronously
        }
    });
})();
