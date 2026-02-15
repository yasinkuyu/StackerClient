# ⚡ StackerClient

<p align="center">
  <img src="https://raw.githubusercontent.com/yasinkuyu/StackerClient/main/resources/icon.png" width="80" height="80" alt="StackerClient Logo">
</p>

<p align="center">
  <strong>Modern REST API Client for VS Code, Cursor & Antigravity IDE</strong>
</p>

 <p align="center">
    <img src="https://github.com/yasinkuyu/StackerClient/raw/main/media/screenshot.png" width="48%" alt="StackerClient light">
    <img src="https://github.com/yasinkuyu/StackerClient/raw/main/media/screenshot_dark.png" width="48%" alt="StackerClient dark">
 </p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.2.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/VS%20Code-%5E1.74.0-blue.svg" alt="VS Code">
  <img src="https://img.shields.io/badge/Cursor-Compatible-blue.svg" alt="Cursor">
  <img src="https://img.shields.io/badge/Antigravity-Compatible-blue.svg" alt="Antigravity">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License">
</p>

## 🌟 Features

- 🚀 **Send HTTP Requests** - Full support for **GET, POST, PUT, PATCH, DELETE, HEAD, and OPTIONS**.
- 🔁 **Repeat Request** - Automate your testing with customizable repeat intervals (3s, 10s, 1m up to 10m) and custom timers.
- 🛡️ **Tech Stack Detection** - Automatically identifies **100+ technologies** including Web Servers, CDNs, CMS, Frameworks (React, Next.js, Laravel), and Analytics.
- 🧪 **Advanced Testing (Extraction)** - Powerful data harvesting using **XPath, CSS Selectors, JSON Path (JSPath), and Regex**.
- 📋 **Extraction Templates** - Save your complex extraction patterns as reusable templates for recurring tasks.
- 📊 **Hex Viewer** - Deep-dive into binary responses (Images, PDF, ZIP) with a professional Hex/ASCII side-by-side view.
- 🌍 **Environment Management** - Define variables like `{{baseUrl}}` or `{{token}}` and switch between Production, Staging, and Dev environments instantly.
- 🏰 **Stealth Mode** - Bypass WAF/Cloudflare protection with built-in **User-Agent profiles** (Chrome, Safari, Mobile, Bots) and Referer spoofing.
- 🔐 **Pro Authentication** - Comprehensive support for **Bearer Tokens, Basic Auth, API Keys, Digest Auth, and OAuth 2.0**.
- 💾 **Saved Tokens** - Manage a library of authentication tokens for quick insertion into any request.
- 🔄 **Bidirectional Sync** - Real-time synchronization between the URL bar and the Query Parameters tab.
- 👁️ **HTML Preview** - Render and inspect HTML responses directly within the editor using a secure sandbox.
- 💾 **Request History** - Organized history with search, filtering, renaming, and persistent storage.
- 📥 **Import cURL** - Instantly convert regular cURL commands into StackerClient requests.
- 🔍 **Smart Autocomplete** - Intelligent header and variable suggestions as you type.
- 📜 **Word Wrap** - Toggle text wrapping for better readability of long responses.
- 🎨 **Modern & Premium UI** - A clean, high-performance interface with native VS Code theme support and categorized layouts.

---

## ⌨️ Quick Start

### Open StackerClient
Press `Ctrl+Shift+R` (Mac: `Cmd+Shift+R`) to open the main panel instantly.

### Quick Access Menu
Click the `⚡ StackerClient` button in your VS Code status bar for a quick access menu.

---

## 📖 Usage

### 🔁 Repeat Request (Automation)
1. Next to the **Send** button, click the dropdown arrow.
2. Select a predefined interval (e.g., 5 Seconds) or set a **Custom Interval**.
3. StackerClient will show a real-time countdown and automatically resend the request.

### 🧪 Advanced Extraction (Diagnostic Tools)
1. Use the **Tests** tab in the response panel.
2. Choose your tool: **XPath** (for XML/HTML), **JS Path** (for JSON), **CSS**, or **Regex**.
3. **Filter**: Highlights the matches in the response view.
4. **Extract**: Generates a clean, newline-separated list for data harvesting.
5. **Save Template**: Click the `+` icon to save your query for later.

### 🛡️ Tech Stack (The "Stack" Tab)
StackerClient detects technologies across 15+ categories including:
- **Web Servers**: Nginx, Apache, LiteSpeed, GWS
- **CDNs & Security**: Cloudflare, Akamai, Fastly, Sucuri
- **Frameworks**: Next.js, React, Vue, Laravel, Django, Rails
- **PaaS**: Vercel, Netlify, Heroku
- **E-Commerce**: Shopify, Magento, WooCommerce

### 🌍 Handling Environments
1. Open the **Sidebar** → **Environments** tab.
2. Create a "Production" environment with a `baseUrl` variable.
3. In your request URL, use `{{baseUrl}}/api/v1/users`.
4. Switch environments in the sidebar to update all requests globally.

---

## 🎯 Commands

| Command | Description |
|---------|-------------|
| `StackerClient: Open` | Open main panel |
| `StackerClient: New Request` | Create new request in new tab |
| `StackerClient: Import cURL` | Import from cURL command |
| `StackerClient: Manage Auth` | Manage authentication tokens |
| `StackerClient: Clear History` | Delete all saved requests |

---

## 🎨 Themes & UI
StackerClient adapts to your VS Code theme (Dark, Light, High Contrast) and features purple-accented premium UI components.

## 🤝 Contributing
Contributions are welcome! Please feel free to submit issues and pull requests on [GitHub](https://github.com/yasinkuyu/StackerClient).

## 👨‍💻 Author
**Yasin Kuyu**  
- 💻 GitHub: [@yasinkuyu](https://github.com/yasinkuyu)  

## 📄 License
MIT License - feel free to use in personal and commercial projects.

---
<p align="center">Made with ❤️ by <a href="https://insya.com">Insya</a></p>
