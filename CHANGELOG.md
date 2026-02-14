# Change Log

All notable changes to the "StackerClient" extension will be documented in this file.

## [1.1.4] - 2026-02-14

### Added
- **Repeat Request**: New feature to automatically repeat requests at custom intervals (1s to 60s or custom).
- **Example Requests**: Added more example requests to the modal.

### Improved
- **UI Aesthetics**: Refined styling for buttons, input groups, select elements, and the new request button.
- **Theming**: Integrated VS Code menu theme variables for better UI consistency.


## [1.1.3] - 2026-02-13

### Added
- **Hex Viewer**: New dedicated tab to view any response in hex format (Binary, Images, PDF, etc.)
- **Binary Response Support**: Automatic hex display for images, PDFs, ZIPs, and other binary content
- **Chunked Response Detection**: Shows "Chunked" badge when transfer-encoding: chunked detected
- **multipart/form-data Parser**: Parses and displays form-data responses with proper formatting
- **Regex Extraction**: Full regex support in Tests tab with capturing group support
- **Filter Button**: Filters response body and displays results in Body tab with match count
- **HTTP Methods**: Added HEAD, OPTIONS, CONNECT, and TRACE methods to the method dropdown
- **Example Search**: Minimalist search input in Examples modal to filter by name or method
- **Template System**: Save and reuse extraction expressions in Tests panel with custom templates
- **Response Test Tab**: Dedicated tab for XPath, JS Path, and CSS Selector tools for a cleaner UI
- **Bidirectional URL & Query Sync**: Real-time synchronization between URL input and Query tab
- **HTML/XML Syntax Highlighting**: Automatic syntax highlighting for HTML and XML responses
- **Simplified Auth UI**: Inline inputs for Bearer and Basic Auth (Username/Password)
- **Stealth Mode (Bypass WAF)**: New option to bypass Cloudflare/WAF with browser-identical headers

### Improved
- **Tests Tab**: Renamed from "Extract" to "Tests" with XPath as default extraction type
- **Example Requests**: Added 15+ new HTTP method examples (HEAD, OPTIONS, PUT, PATCH, DELETE, etc.)
- **Example Requests**: Added HTTPBin test examples (cookies, IP, user-agent, delay, status codes)
- **Hex Viewer**: Shows Offset, Hex bytes (16 bytes/line), and ASCII representation
- **Hex Viewer**: 1MB limit with truncation indicator for performance
- **Hex Viewer**: MIME type and file size display in header
- **Tests Panel**: Full extraction support for XPath, Regex, JSON Path, and CSS selectors
- **Auth Tabs**: Removed unused SSL Pinning tab (was not implemented)
- **Sidebar Search Alignment**: Exactly matched the History sidebar search layout with the "Saved" tab
- **User-Agent Width**: Fixed select width for a more balanced UI
- **History List Item Layout**: Better alignment for URL and request method (Indented URL)
- **Removal Button Aesthetics**: Subtle rounded hover effect for removal buttons in headers/params
- **Expanded User-Agent & Bots**: Select from various browsers and bots like Googlebot, Bingbot, and more
- **Extraction Tools**: Minimalist XPath (HTML/XML) and JS Path (JSON) extraction for responses
- **Tab Title Configuration**: New `stacker.tabTitleFormat` setting (Full URL vs Path only)
- **Smooth Loading Spinner**: Replaced rotating refresh icon with a polished circular spinner
- **Improved UI Consistency**: Minimalist search input styling in Saved tab
- **Tab Title Fix**: Improved dynamic tab updates for pre-filled and loaded requests
- **Auth Tab Restructured**: Split into Credentials, Saved, Pin, Security, and Quick Add sub-tabs
- **About Page Externalized**: Help content moved to `media/help.html` with dynamic version injection
- **Response Headers UI**: Reduced excess whitespace in headers table for a compact layout
- **Cookie Parsing**: Fixed `Set-Cookie` header handling using `getSetCookie()` for correct multi-cookie display

### Fixed
- **Tests Panel**: Fixed Regex button not being detected (was not in the type check chain)
- **Filter Function**: Created separate filterResponse() function that displays filtered results in Body tab
- **Hex Viewer**: Fixed backend hex generation logic - now generates hex for all response types
- **Hex Viewer**: Added frontend fallback to generate hex from response body if backend fails
- **Memory Leak**: `onDidChangeConfiguration` listener now properly disposed via `context.subscriptions`
- **VS Code Compatibility**: Replaced `Buffer.from()` with `TextEncoder().encode()` for broader compatibility
- **Null Safety**: Eliminated all `currentPanel!` non-null assertions with safe `panelRef` capture pattern
- **Null Safety**: `SidebarProvider` constructor now validates `context` instead of using `context!`
- **URL Parsing**: Added try-catch around `new URL()` in query param interpolation with manual fallback
- **Cleanup**: Removed unused `allPanels` array; added `onDidDispose` to `createNewPanel`


## [1.1.2] - 2026-02-12

### Fixed
- Fixed extension bundling issues
- Resolved dependency resolution errors in marketplace installation

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
