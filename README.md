# AI Chat Harvest - Chrome Extension

A powerful Chrome extension that archives conversations from Gemini, ChatGPT, and Claude in both HTML and JSON formats.

## 🎯 Key Features

- ✅ **Full Support for 3 Major AI Platforms**: Google Gemini, ChatGPT, and Claude AI.
- ✅ **Two Archiving Modes**:
    1. **Current Tab Archive**: Instantly save the conversation you are currently viewing.
    2. **Batch Archive**: Automatically save multiple shared links (URLs) sequentially in one go.
- ✅ **Dual HTML/JSON Output**: Saves a clean, readable HTML file along with a JSON dataset.
- ✅ **Smart Title Extraction**: Automatically analyzes the first user query to generate a relevant filename.
- ✅ **Customizable Settings**: Options for download paths, source page visibility, and auto-opening files.

## � Privacy & Security

- **100% Local & Private**: All processing happens entirely within your browser. Your data is **never** sent to any external server.
- **Direct Save**: Files are saved directly to your local machine's storage.

## �📦 Installation

1. Open `chrome://extensions/` in your Chrome browser.
2. Toggle the **"Developer mode"** switch in the top right corner.
3. Click the **"Load unpacked"** button.
4. Select the `ai_chat_harvest` (or project) directory.

## 🚀 Usage

### 1. Single Archive
1. Navigate to a chat page (or shared page) on Gemini, ChatGPT, or Claude.
2. Click the **AI Chat Harvest** icon in the browser toolbar.
3. Keep the text input **empty** and click the **"Archive"** button.
4. The current conversation will be scraped and downloaded.

### 2. Batch Archive
1. Click the **AI Chat Harvest** icon.
2. Paste the **Shared URLs** of the conversations you want to archive into the text area (one per line).
   - Example:
     ```
     https://gemini.google.com/share/...
     https://chatgpt.com/share/...
     https://claude.ai/share/...
     ```
3. Click the **"Archive"** button.
4. The extension will automatically open a new tab, visit each URL, save the conversation, and then close the tab.

### 3. Using Saved Data
- **View HTML**: Open the downloaded HTML file in your browser to view the conversation in a clean layout.
- **Extract JSON**:
    - Click the **"Download JSON"** button at the top right of the HTML file to save the raw data separately.
    - Alternatively, you can find the raw data inside the `<script id="conversation-data">` tag within the HTML source code.

## ⚙️ Options

Right-click the extension icon and select **"Options"** to configure the following:

- **Download Subdirectory**: Specify a subdirectory name within your Downloads folder to save files (e.g., `AIArchives`).
- **Archive History Count**: Set the number of recent archive logs to display in the popup (1-50).
- **Show Source Page**: If unchecked, the AI page will run in the background and close automatically during batch operations. (Check this if you want to watch the process).
- **Auto-open File After Download**: Automatically opens the saved file in the browser after the download completes.

## 📁 File Structure

```
ai_chat_harvest/
├── background.js       # Background logic (Download management, Tab control)
├── content.js          # Unified scraping engine (Gemini/ChatGPT/Claude detection & parsing)
├── popup.html/js       # User Interface (URL input & Status display)
├── options.html/js     # User Settings page
├── manifest.json       # Extension configuration file
├── style.css           # UI Styles
└── README.md           # Documentation
```

## 🤖 Acknowledgments

This project was developed with the assistance of **Google Gemini** and **Anthropic Claude**.

## ⚖️ License & Contact

This project is licensed under the **Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)**.

**Summary of Rights:**
- **Non-Commercial**: You may **not** use this software for commercial purposes (business use, paid services, etc.) without explicit permission.
- **ShareAlike**: If you modify and distribute this software, you must distribute it under the same CC BY-NC-SA 4.0 license.
- **Attribution**: You must give appropriate credit to the original author.

**Contact:**
- For bug reports, feature requests, or questions, please open an issue on the [GitHub Repository](https://github.com/thlee/AI-Chat-Harvest).

**Disclaimer:**
This software is provided "AS IS", without warranty of any kind. The author assumes no liability for any issues arising from its use. Users are responsible for compliance with the Terms of Service of the respective AI platforms.
