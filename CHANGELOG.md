# Change Log

All notable changes to the "StackerClient" extension will be documented in this file.

## [1.2.0] - 2026-02-15

### Added
- **Binary File Uploads**: Support for `multipart/form-data` with actual binary file selection via native VS Code dialog.
- **Improved History Deduplication**: Robust hash-based deduplication ensures unique requests (headers, body, query params) are accurately preserved in history.
- **Build & Publish Scripts**: Added dedicated shell scripts for streamlined extension packaging and publication.
- **Tech Stack Detection**: New "Stack" tab automatically detects and displays technology stack from response headers, cookies, and body signatures. Detects web servers (Nginx, Apache, IIS), CDNs (Cloudflare, CloudFront), backend frameworks (Express, Laravel, Django, Rails), frontend frameworks (React, Next.js, Vue), CMS (WordPress, Drupal), analytics (Google Analytics, Hotjar), and more.

### Fixed
- **Safer SSL Management**: Automatically restores the original SSL validation state (`NODE_TLS_REJECT_UNAUTHORIZED`) immediately after each request.
- **Memory Safety**: Implemented early `Content-Length` validation to block massive responses before they cause Out-Of-Memory issues.

### Improved
- **Sidebar Responsiveness**: Added a debounced refresh mechanism to the sidebar to ensure a smooth UI experience even with hundreds of saved requests.

## [1.1.9] - 2026-02-15

### Added
- **Default Preview Mode**: JSON, HTML, and XML responses now default to Preview mode for an immediate interactive experience.
- **Auto-Expanding Headers**: Targeted CSS refinements to ensure the response headers table key column expands naturally.

### Fixed
- **Environment Variables**: Fixed URL validation to allow `{{variable}}` syntax in the address bar.
- **State Synchronization**: Unified response body rendering to ensure toolbar buttons and labels are always perfectly in sync with the content.
- **UI Consistency**: Fixed button heights in the Tests panel and resolved "visual flash" by correctly initializing response toolbar states.

### Improved
- **Response Toolbar**: Reordered buttons (Copy, Raw/Preview, Expand, Collapse, Wrap) for a more intuitive, logical workflow.
- **Auth Tab Styling**: Integrated `compact-select` for the Auth type dropdown and refined inline select styling for a seamless experience.

## [1.1.8] - 2026-02-15

### Added
- **Recent Saved View**: New sidebar filter that merges recent history and saved requests into a single unified list.
- **Tab Content Badges**: Added visual count badges to Headers, Query, and Body tabs for better context.
- **Advanced Authentication**: Expanded support for various authentication methods.
- **Structured Body Input**: Improved handling and input for structured request bodies.

### Changed
- **UI Refresh**: Modernized the interface with new gradient buttons (purple/indigo), improved active tab visibility, and consistent panel backgrounds. Optimized syntax highlighting to respect VS Code themes accurately.
- **Sidebar Selection**: Unified source selection with a 3-way toggle (Recent, Recent Saved, Saved).
- **Default Response View**: Word-wrap is now **OFF** by default in the response body for better readability of raw data.

### Improved
- **Performance & Optimization**: 
  - Implemented debouncing for URL input, search filters, and tab summaries to reduce CPU usage.
  - Optimized DOM operations using persistent measurement elements and cached selectors.
  - Introduced size limits for HTML syntax highlighting (100KB) and JSON tree depth (20 levels) to prevent UI freezing on massive responses.
- **Robustness**: Applied extensive null checks and safety guards to all critical DOM interactions to prevent runtime errors.
- **Memory Management**: Optimized `ResizeObserver` and event listener cleanup to prevent background memory leaks.

### Fixed
- **Theming Consistency**: Fixed background color issues in JSON, HTML, and Hex viewers; ensured pure white for light themes and deep gray for dark themes.
- **Sidebar Rendering**: Resolved issues where history or folder lists would fail to render when elements were not yet initialized.
- **Extract Button**: Restyled the "Extract" button in the Tests tab to match the application's primary purple gradient theme.

## [1.1.7] - 2026-02-14

### Fixed
- **User-Agent Version**: Default User-Agent string now correctly reflects the current version.
- **Empty-Value Headers**: Headers with a key but empty value (e.g. `Cookie:`, `X-API-Key:`) are now sent to the server instead of being silently dropped.
- **Duplicate Auth Headers**: Applying Bearer Token, Basic Auth, or using a saved token now replaces any existing Authorization header instead of creating duplicates.

## [1.1.6] - 2026-02-14

### Added
- **Expandable Request Details**: Saved and Recent items now expand on click to show headers, query params, body, and settings with a "Load Request" button.
- **History Deduplication**: Identical requests (same URL, method, headers, body, settings) appear only once in Recent, with the timestamp updated.

### Fixed
- **Save/Load Completeness**: All request properties (headers, query params, body, bypassWAF, userAgent, referer) are now correctly saved and restored including checked/unchecked state.
- **Clear All Button**: Fixed "Clear All" in Recent tab (was blocked by `confirm()` which doesn't work in VS Code webviews).
- **Duplicate on Re-save**: Loading a saved request and saving again now updates the existing entry instead of creating a duplicate.
- **Field Reset on Load**: bypassWAF, userAgent, and referer fields are now properly reset when loading a request that doesn't have them.
- **Recent Tab Not Working**: Added missing history message handlers for new panels.
- **Duplicate Toast**: Removed duplicate "Request saved successfully!" toast.

### Improved
- **Smart Save/Update Button**: Save button changes to "Update" when editing a loaded request; skips name prompt and saves directly.
- **Recent Tab Path Display**: Recent items now show the request path/name alongside the time, matching the Saved tab layout.

## [1.1.5] - 2026-02-14

### Added
- **Referer Support**: Added a new Referer dropdown with predefined options (Google, Bing, GitHub, etc.) and custom URL support.
- **Settings Tab**: Promoted request settings (Stealth, User-Agent, Referer) to a top-level tab for easier access.
- **Recent History**: Added a new "Recent" tab that tracks all sent requests automatically.

### Improved
- **User-Agent**: User-Agent and Stealth settings moved to the new dedicated Settings tab.
- **Architecture**: Better separation between Authorization (credentials) and Request Settings (metadata/stealth).

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
