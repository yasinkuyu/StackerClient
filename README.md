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
  <img src="https://img.shields.io/badge/version-1.1.3-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/VS%20Code-%5E1.74.0-blue.svg" alt="VS Code">
  <img src="https://img.shields.io/badge/Cursor-Compatible-blue.svg" alt="Cursor">
  <img src="https://img.shields.io/badge/Antigravity-Compatible-blue.svg" alt="Antigravity">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License">
</p>

## 🌟 Features

- 🚀 **Send HTTP Requests** - Full support for GET, POST, PUT, PATCH, DELETE, HEAD, and OPTIONS
- 📊 **Hex Viewer** - Dedicated tab for binary analysis (Images, PDF, ZIP) with ASCII representation
- 🧪 **Advanced Testing** - Extract and filter data using **XPath, CSS, JSPath, and Regex**
- 📋 **Extraction Templates** - Save and reuse complex expressions for faster API testing
- 🏰 **Stealth Mode** - Bypass WAF/Cloudflare protection with browser-identical header profiles
- 📚 **Example Requests** - 20+ ready-to-use API examples including HTTPBin, Auth, and mock APIs
- 🌍 **Environment Variables** - Manage multiple environments with `{{variable}}` syntax support
- 🔐 **Authentication** - Securely manage Bearer tokens, Basic Auth, and API Keys
- 🔄 **Bidirectional Sync** - Real-time synchronization between URL input and Query parameter tab
- 👁️ **HTML Preview** - Render and inspect HTML responses directly within the editor
- 💾 **Request History** - Save, rename, filter, and organize your API requests with ease
- 📥 **Import cURL** - Instantly convert regular cURL commands into StackerClient requests
- 🔍 **Smart Autocomplete** - Intelligent header suggestions as you type
- 🎨 **Modern UI** - A clean, high-performance interface with native VS Code theme support

## 🖥️ Supported Platforms

| Platform | Status |
|----------|--------|
| **Visual Studio Code** | ✅ Fully Supported |
| **Cursor IDE** | ✅ Fully Supported |
| **Antigravity IDE** | ✅ Fully Supported |
| **Any VS Code-based Editor** | ✅ Compatible |

## ⌨️ Quick Start

### Keyboard Shortcut
Press `Ctrl+Shift+R` (Mac: `Cmd+Shift+R`) to open StackerClient instantly.

### From Status Bar
Click the `⚡ StackerClient` button in the bottom-left status bar for quick menu.

## 📖 Usage

### Sending Requests

1. Click **New Request** or press `Ctrl+Shift+R`
2. Enter your API URL (must start with `http://` or `https://`)
3. Select HTTP method from dropdown
4. Add headers if needed (with autocomplete)
5. Add request body for POST/PUT/PATCH
6. Click **Send**

### Authentication

#### Bearer Token
1. Go to **Auth** tab
2. Click **+ Bearer Token** button
3. Paste your token in the header value

#### Saved Tokens
1. Go to **Auth** tab
2. Click **+ Add** button in Saved Tokens section
3. Add tokens with name for reuse
4. Click ✓ to use, 🗑️ to delete

### Environment Variables

Manage multiple environments (Development, Production, Staging) with variable substitution:

1. Open **Sidebar** → **Environments** tab
2. Click **New Environment** (e.g., "Production")
3. Add variables: `baseUrl` = `https://api.example.com`
4. Click environment to activate (green "Active" badge)
5. Use in requests: `{{baseUrl}}/users`

**Supported locations:**
- URL: `{{baseUrl}}/users/{{userId}}`
- Headers: `Authorization: Bearer {{token}}`
- Body: `{"id": "{{userId}}"}`
- Query Parameters: `?page={{pageNum}}&limit={{pageSize}}`

### Example Requests

Quick start with 15+ built-in examples:

1. Click **📚 Examples** button (next to Save)
2. Choose from categories:
   - **JSONPlaceholder**: Fake REST API for testing
   - **HTTPBin**: HTTP testing endpoints
   - **Reqres**: Mock API for prototyping
   - **GitHub API**: Real API examples
   - **Authentication**: Bearer, Basic, API Key examples
   - **Environment Demo**: Variables usage examples

### Advanced Diagnostic Tools (Tests)

StackerClient 1.1.3 introduces powerful extraction and filtering tools:

1. Click the **Tests** tab in the response panel.
2. Select your tool: **XPath**, **JS Path**, **CSS**, or **Regex**.
3. Enter your expression (e.g., `//title` for XPath or `data.users[0]` for JS Path).
4. **Filter**: Click to see a structured visual view (JSON tree or highlighted markup).
5. **Extract**: Click to get a clean, newline-separated plain text list (ideal for data harvesting).
6. **Templates**: Save your expressions by clicking the **Save** icon for future reuse.

### Hex Viewer (Binary Analysis)

For requests returning binary data (Images, PDFs, ZIPs, etc.):
1. StackerClient automatically detects binary content.
2. Switch to the **Hex** tab to view the data in raw hexadecimal format.
3. Analyze offsets, hex bytes, and ASCII representation side-by-side.

### Import cURL

Paste any cURL command by clicking the **Import cURL** icon in the action bar:
```bash
curl -X POST https://api.example.com/users \
  -H "Content-Type: application/json" \
  -d '{"name":"John","email":"john@example.com"}'
```

### Managing History

- **Filter**: Use the filter input in History tab
- **Rename**: Right-click a request → Rename
- **Delete**: Click delete button on request item
- **Clear All**: Action bar → Clear History

## 🎯 Commands

| Command | Description |
|---------|-------------|
| `StackerClient: Open` | Open main panel |
| `StackerClient: New Request` | Create new request in new tab |
| `StackerClient: Import cURL` | Import from cURL command |
| `StackerClient: Manage Auth` | Manage authentication tokens |
| `StackerClient: Clear History` | Delete all saved requests |
| `StackerClient: Help & About` | View documentation |

## 🔧 Configuration

No configuration required! StackerClient works out of the box with your VS Code theme.

## 🎨 Themes

StackerClient automatically adapts to your VS Code theme with beautiful purple accents:
- **Dark Themes**: Full support
- **Light Themes**: Full support
- **Custom Themes**: Compatible

## 🚀 Installation

### From VS Code Marketplace
1. Open Extensions view (`Cmd+Shift+X`)
2. Search for "StackerClient"
3. Click Install

### From Cursor/Antigravity
1. Open Extensions
2. Search "StackerClient REST API"
3. Click Install

## 📝 Keywords

Find this extension using these keywords:
- REST Client
- API Testing
- HTTP Client
- Postman Alternative
- Insomnia Alternative
- Thunder Client
- API Debugger
- HTTP Request
- REST API Tool
- API Development
- Web Service Testing
- Endpoint Testing

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## 👨‍💻 Author

**Insya - Yasin Kuyu**

- 🌐 Website: [https://insya.com](https://insya.com)
- 💻 GitHub: [@yasinkuyu](https://github.com/yasinkuyu)
- 📧 Email: yasin@insya.com

## 📄 License

MIT License - feel free to use in personal and commercial projects.

---

<p align="center">
  Made with ❤️ by <a href="https://insya.com">Insya</a>
</p>
