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
        if (url.includes('claude.ai')) return 'claude';
        return 'unknown';
    }

    // Auto-scroll utility for lazy-loaded content (Active Apps)
    async function autoScroll() {
        console.log("Archiver: Starting auto-scroll...");
        await new Promise((resolve) => {
            let lastScrollHeight = document.body.scrollHeight;
            let noChangeCount = 0;
            const scrollTimer = setInterval(() => {
                window.scrollTo(0, document.body.scrollHeight);
                const currentScrollHeight = document.body.scrollHeight;
                if (currentScrollHeight === lastScrollHeight) {
                    noChangeCount++;
                    if (noChangeCount >= 10) { // ~2 seconds of stability
                        clearInterval(scrollTimer);
                        console.log("Archiver: Scrolling finished.");
                        resolve();
                    }
                } else {
                    lastScrollHeight = currentScrollHeight;
                    noChangeCount = 0;
                }
            }, 200);
            // hard timeout 15s
            setTimeout(() => { clearInterval(scrollTimer); resolve(); }, 15000);
        });
    }

    // Scrape Claude conversation
    async function scrapeClaude() {
        console.log("Claude Archiver: Scraping conversation (v4.6 - Robust Selectors & Skip Fix)...");

        // Ensure all messages are loaded
        await autoScroll();

        // Wait for content (messages)
        try {
            await waitForElement('[data-testid="user-message"], .font-claude-response', 5000);
        } catch (e) {
            console.warn("Claude: Timeout waiting for messages");
        }

        let turns = [];
        // Scope to the main chat area to avoid sidebars
        const chatRoot = document.querySelector('div[role="main"]') || document.body;

        // Claude Selectors - Robust Set (Backup for flaky class names)
        const userSelectors = ['[data-testid="user-message"]', '.font-user-message', '.user-message'];
        const modelSelectors = ['.font-claude-response', '[data-testid="content-block"]', '.claude-response'];

        // Gather all relevant nodes
        let userNodes = [];
        userSelectors.forEach(sel => {
            chatRoot.querySelectorAll(sel).forEach(el => userNodes.push(el));
        });

        let modelNodes = [];
        modelSelectors.forEach(sel => {
            chatRoot.querySelectorAll(sel).forEach(el => modelNodes.push(el));
        });

        // Deduplicate
        userNodes = [...new Set(userNodes)];
        modelNodes = [...new Set(modelNodes)];

        console.log(`Claude: Found ${userNodes.length} user messages and ${modelNodes.length} model messages`);

        // Combine and sort nodes by their position in the DOM to reconstruct the conversation flow
        const allNodes = [
            ...userNodes.map(node => ({ role: 'user', node })),
            ...modelNodes.map(node => ({ role: 'model', node }))
        ];

        // Sort by DOM order
        allNodes.sort((a, b) => {
            return (a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
        });

        allNodes.forEach(({ role, node }) => {
            // CRITICAL FIX: Skip "Thinking Process" blocks completely
            // These are identified by being inside a container with tabindex="-1"
            // Apply this MAINLY to model messages. User messages should NEVER be hidden by this.
            if (role === 'model' && node.closest('[tabindex="-1"]')) {
                return;
            }

            // Clone node to safely modify it
            const clone = node.cloneNode(true);

            // FALLBACK: If skip failed, try to check internal content for Thinking Process 
            // Method A: Remove by specific class 'font-ui' (Thinking Process container)
            const fontUiContainers = clone.querySelectorAll('.font-ui');
            fontUiContainers.forEach(el => {
                if (el.tagName === 'DIV') el.remove();
            });

            // Method B: Remove specific thought component markers
            const thoughtMarkers = clone.querySelectorAll('[data-testid="process-message-component"], .font-claude-thought-text');
            thoughtMarkers.forEach(el => el.remove());

            // 1. Remove UI Artifacts (Copy buttons, etc)
            const artifacts = clone.querySelectorAll('button, .contents-copy, .text-xs.select-none, .sticky.top-0, .sticky.top-2, .sticky.top-9');
            artifacts.forEach(el => el.remove());

            // 2. Unlock Text Selection (Remove pointer-events-none)
            if (clone.classList.contains('pointer-events-none')) clone.classList.remove('pointer-events-none');
            clone.querySelectorAll('.pointer-events-none').forEach(el => el.classList.remove('pointer-events-none'));

            // 3. Final Sanitization: Remove ALL inline styles and layout-affecting classes
            // This ensures no hidden masks or overlays block text selection
            clone.querySelectorAll('*').forEach(el => {
                el.removeAttribute('style'); // Kill inline styles like 'mask-image'

                // Remove specific Tailwind classes that might hide content or block interaction
                el.classList.forEach(cls => {
                    if (cls.includes('mask') || cls.includes('overflow') || cls.startsWith('h-') || cls.startsWith('max-h')) {
                        el.classList.remove(cls);
                    }
                });
            });

            let content = clone.innerHTML.trim();

            if (content) {
                turns.push({ role, content });
            }
        });

        let title = 'Claude Conversation';

        // Extract Title from H1 if present
        const h1 = document.querySelector('h1');
        if (h1 && h1.innerText) title = h1.innerText.trim();

        // Fallback title using first user message text
        if ((!title || title === 'Claude Conversation') && turns.length > 0) {
            const firstUser = turns.find(t => t.role === 'user');
            if (firstUser) {
                // Create a temp div to extracting text from HTML content
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = firstUser.content;
                // Get clean text for title
                const plainText = tempDiv.innerText.replace(/\s+/g, ' ').trim();
                title = plainText.substring(0, 50).trim();
            }
        }

        console.log(`Claude: Successfully scraped ${turns.length} turns`);

        return {
            platform: 'claude',
            title: title,
            url: window.location.href,
            scrapedAt: new Date().toISOString(),
            turns: turns
        };
    }


    // Scrape ChatGPT conversation
    async function scrapeChatGPT() {
        console.log("AI Archiver: Scraping ChatGPT conversation...");

        // Ensure all messages are loaded
        await autoScroll();

        // Wait for messages to load
        await waitForElement('[data-message-author-role]', 5000).catch(() => {
            console.warn("No messages found");
        });

        const turns = [];

        // Scope to Main Area to avoid sidebar
        const chatMain = document.querySelector('main, [role="main"]') || document.body;

        const messages = chatMain.querySelectorAll('[data-message-author-role]');

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

        // 1. Try to find the main scroll container to ensure we are on a valid page
        // Shared pages use 'share-turn-viewer', App uses 'infinite-scroller' or 'main'
        const container = await waitForElement('share-turn-viewer, .content-container, main, infinite-scroller', 5000)
            .catch(() => console.warn("Gemini: Main container not found standardly, proceeding anyway..."));

        // 2. Auto-scroll to load all lazy-loaded content
        await autoScroll();

        // 3. Extract Title
        let title = 'Gemini Conversation';
        const titleEl = document.querySelector('.share-title-section, h1[data-test-id="conversation-title"], .conversation-title');
        if (titleEl && titleEl.innerText.trim()) {
            title = titleEl.innerText.split('\n')[0].trim();
        }

        // 4. Scrape Turns (Dual Strategy: Shared vs App)
        let turns = [];

        // Strategy A: Custom Elements (Shared Page) via share-turn-viewer
        const shareTurns = document.querySelectorAll('share-turn-viewer');
        if (shareTurns.length > 0) {
            console.log("Gemini: Detected Shared Page structure.");
            shareTurns.forEach(turn => {
                const userText = turn.querySelector('user-query')?.innerText?.trim();
                const modelText = turn.querySelector('message-content, model-response')?.innerHTML?.trim();
                if (userText) turns.push({ role: 'user', content: userText });
                if (modelText) turns.push({ role: 'model', content: modelText });
            });
        }

        // Strategy B: DOM Position Sorting (App Page)
        // Targeted for Active App sessions, focusing on .structured-content-container
        if (turns.length === 0) {
            console.log("Gemini: Detected App Page. Focusing on .structured-content-container...");

            // Limit scope to the main chat container if possible
            const chatRoot = document.querySelector('.structured-content-container') || document.body;

            // Selectors for User messages
            const userSelectors = [
                'user-query',
                '.user-query',
                '.query-text',
                '[data-testid="user-query"]'
            ];

            // Selectors for Model messages
            // We focus on .markdown to get the actual text and avoid container UI (buttons, drafts, etc.)
            const modelSelectors = [
                '.markdown',
                '.message-content'
            ];

            // Collect all potential nodes within the chat root
            let userNodes = [];
            userSelectors.forEach(sel => {
                chatRoot.querySelectorAll(sel).forEach(el => {
                    if (el.innerText && el.innerText.trim().length > 0) userNodes.push(el);
                });
            });

            let modelNodes = [];
            modelSelectors.forEach(sel => {
                chatRoot.querySelectorAll(sel).forEach(el => {
                    // Filter out input areas, hidden elements, or UI artifacts
                    if (el.closest('textarea') || el.closest('[contenteditable]')) return;
                    if (el.innerText && el.innerText.trim().length > 0) modelNodes.push(el);
                });
            });

            // Deduplicate nodes
            userNodes = [...new Set(userNodes)];
            modelNodes = [...new Set(modelNodes)];

            // Filter out PARENT nodes if their children are also selected
            // (We want the most specific content, i.e., the child .markdown, not the wrapper)
            modelNodes = modelNodes.filter(node => {
                // If this node contains another node in the list, discard THIS node (it's a wrapper)
                const isWrapper = modelNodes.some(other => other !== node && node.contains(other));
                return !isWrapper;
            });

            console.log(`Gemini: Found ${userNodes.length} user nodes and ${modelNodes.length} model nodes (filtered).`);

            // Combine and sort by DOM position
            const allNodes = [
                ...userNodes.map(node => ({ role: 'user', node })),
                ...modelNodes.map(node => ({ role: 'model', node }))
            ];

            allNodes.sort((a, b) => {
                return (a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
            });

            // Extract content
            allNodes.forEach(({ role, node }) => {
                // For user, usually innerText is enough
                // For model, we want innerHTML for formatting
                const content = role === 'user' ? node.innerText.trim() : node.innerHTML.trim();

                // Avoid duplicates: check if this content is effectively same as last turn of same role
                const lastTurn = turns[turns.length - 1];
                if (lastTurn && lastTurn.role === role && lastTurn.content === content) return;

                turns.push({ role, content });
            });
        }

        console.log("Gemini Archiver: Scraping complete!");
        console.log("  - Title:", title);
        console.log("  - Turns found:", turns.length);

        if (turns.length === 0 && !title) {
            console.warn("Gemini: Failed to scrape any content.");
        }

        return {
            platform: 'gemini',
            title: title || 'Gemini Conversation',
            url: window.location.href,
            scrapedAt: new Date().toISOString(),
            turns: turns
        };
    }

    // Main scraping function - detects platform and calls appropriate scraper
    async function scrapeConversation() {
        const platform = detectPlatform();
        console.log("AI Archiver: Detected platform:", platform);

        if (platform === 'chatgpt') {
            return await scrapeChatGPT();
        } else if (platform === 'gemini') {
            return await scrapeGemini();
        } else if (platform === 'claude') {
            return await scrapeClaude();
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
