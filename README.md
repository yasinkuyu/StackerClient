# ⚡ StackerClient

<p align="center">
  <img src="https://raw.githubusercontent.com/yasinkuyu/StackerClient/main/resources/icon.png" width="80" height="80" alt="StackerClient Logo">
</p>

<p align="center">
  <strong>Modern REST API Client for VS Code, Cursor & Antigravity IDE</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/VS%20Code-%5E1.74.0-blue.svg" alt="VS Code">
  <img src="https://img.shields.io/badge/Cursor-Compatible-blue.svg" alt="Cursor">
  <img src="https://img.shields.io/badge/Antigravity-Compatible-blue.svg" alt="Antigravity">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License">
</p>

## 🌟 Features

- 🚀 **Send HTTP Requests** - GET, POST, PUT, PATCH, DELETE with custom headers
- 🔐 **Authentication** - Bearer tokens, Basic Auth, API Keys with secure storage
- 💾 **Request History** - Save, rename, filter and organize your requests
- 📥 **Import cURL** - Convert cURL commands to StackerClient requests
- 🔍 **Smart Autocomplete** - Headers autocomplete with suggestions
- 🎨 **Modern UI** - Native VS Code interface with purple theme accents
- 📊 **Status Bar Integration** - Quick access from status bar
- 🎯 **Multi-Platform** - Works on VS Code, Cursor IDE, and Antigravity

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
1. Open Command Palette (`Cmd+Shift+P`)
2. Type: `StackerClient: Manage Auth`
3. Add tokens with name for reuse

### Import cURL

Paste any cURL command:
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
