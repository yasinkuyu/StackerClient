# Change Log

All notable changes to the "StackerClient" extension will be documented in this file.

## [1.1.1] - 2026-02-01

### Fixed
- GitHub repository URL corrected

## [1.1.0] - 2026-02-01

### Added
- **Example Requests**: 15+ ready-to-use API examples (JSONPlaceholder, HTTPBin, Reqres, GitHub API)
- **Environment Variables**: Full environment management with `{{variable}}` syntax support
  - URL, headers, body, and query parameters interpolation
  - Multiple environments (Development, Production, Staging)
- **HTML Preview**: Render HTML responses in iframe with Raw/Preview toggle
- **Headers Raw/Table View**: Toggle between formatted table and raw headers view
- **Modern Auth Tab UI**: Redesigned token management with inline "Add" button
- **Token Auto-Sync**: Token changes instantly reflect across all open panels
- **Query Parameter Variables**: Environment variables now work in query parameters
- **New Example Categories**:
  - Authentication examples (Bearer, Basic, API Key)
  - Query parameter examples
  - Complex examples (Auth + Query + Body)
  - Environment variables demo

### Changed
- **Placeholder Texts**: Realistic examples instead of variable syntax
- **Token UI**: Minimalist card-based design with icons
- **Response Toolbar**: Smart buttons based on content type (JSON/HTML)

### Fixed
- Token addition not reflecting until panel reload
- Environment variable interpolation in query parameters
- HTML preview CSP issues (switched to srcdoc)

## [1.0.0] - 2024-01-31

### Added
- Initial release
- HTTP methods: GET, POST, PUT, PATCH, DELETE
- Custom headers support
- Request body with JSON, text/plain, form-urlencoded content types
- Save and manage requests in VS Code global state
- Native VS Code theme support (dark/light)
- Activity bar integration with tree view
- Keyboard shortcut: Ctrl/Cmd+Shift+R
- Request response details (status, headers, body, timing)
- Toast notifications
- Loading indicators
- URL and JSON validation
- Export/Import functionality

### Features
- Click saved request in sidebar to load
- Method-based colored icons in tree view
- Response syntax highlighting
- 30-second request timeout
- Empty state messages
