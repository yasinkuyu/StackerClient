import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import { RequestManager, SavedRequest } from './RequestManager';
import { SidebarProvider } from './SidebarProvider';
import { getWebviewContent } from './webviewContent';
import { URL, URLSearchParams } from 'url';

let currentPanel: vscode.WebviewPanel | undefined;
let sidebarProvider: SidebarProvider;


// Hazır HTTP Header listesi
const COMMON_HEADERS = [
    { key: 'Accept', value: 'application/json', desc: 'Accepted response format' },
    { key: 'Accept', value: 'text/html', desc: 'Accepted response format' },
    { key: 'Accept', value: '*/*', desc: 'Accept any format' },
    { key: 'Accept-Encoding', value: 'gzip, deflate, br', desc: 'Compression algorithms' },
    { key: 'Accept-Language', value: 'en-US,en;q=0.9', desc: 'Preferred languages' },
    { key: 'Authorization', value: 'Bearer ', desc: 'Bearer token auth (paste token)' },
    { key: 'Authorization', value: 'Basic ', desc: 'Basic auth (user:pass base64)' },
    { key: 'Authorization', value: 'Token ', desc: 'Token auth (paste token)' },
    { key: 'Cache-Control', value: 'no-cache', desc: 'Disable caching' },
    { key: 'Content-Type', value: 'application/json', desc: 'JSON format' },
    { key: 'Content-Type', value: 'application/x-www-form-urlencoded', desc: 'Form data' },
    { key: 'Content-Type', value: 'multipart/form-data', desc: 'Multipart form' },
    { key: 'Content-Type', value: 'text/plain', desc: 'Plain text' },
    { key: 'Content-Type', value: 'text/html', desc: 'HTML format' },
    { key: 'Content-Type', value: 'application/xml', desc: 'XML format' },
    { key: 'Cookie', value: '', desc: 'Cookie data' },
    { key: 'Host', value: '', desc: 'Target host' },
    { key: 'Origin', value: '', desc: 'Request origin' },
    { key: 'Referer', value: '', desc: 'Previous page' },
    { key: 'User-Agent', value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', desc: 'Browser user agent' },
    { key: 'X-API-Key', value: '', desc: 'API Key header' },
    { key: 'X-Auth-Token', value: '', desc: 'Auth token header' },
    { key: 'X-Requested-With', value: 'XMLHttpRequest', desc: 'AJAX request' },
    { key: 'X-CSRF-Token', value: '', desc: 'CSRF protection token' }
];

export function activate(context: vscode.ExtensionContext) {
    const requestManager = new RequestManager(context);

    // Sidebar WebviewView Provider
    sidebarProvider = new SidebarProvider(context.extensionUri, requestManager, context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, sidebarProvider)
    );

    const openCommand = vscode.commands.registerCommand('stacker.open', () => {
        if (currentPanel) {
            currentPanel.reveal(vscode.ViewColumn.One);
            return;
        }

        currentPanel = vscode.window.createWebviewPanel(
            'stackerClient',
            'StackerClient',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        currentPanel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'icon.svg');
        currentPanel.webview.html = getWebviewContent();

        const panelRef = currentPanel;
        const messageDisposable = panelRef.webview.onDidReceiveMessage(async (message) => {
            if (!panelRef) { return; }
            switch (message.command) {
                case 'sendRequest':
                    await handleSendRequest(message.request, panelRef, requestManager);
                    break;
                case 'saveRequest':
                    handleSaveRequest(message.request, requestManager, panelRef);
                    sidebarProvider.refresh();
                    break;
                case 'loadRequests':
                    handleLoadRequests(requestManager, panelRef);
                    break;
                case 'deleteRequest':
                    handleDeleteRequest(message.id, requestManager, panelRef);
                    sidebarProvider.refresh();
                    break;
                case 'saveAuthToken':
                    await saveAuthToken(message.token, message.name, context);
                    break;
                case 'loadAuthTokens':
                    await loadAuthTokens(panelRef, context);
                    break;
                case 'deleteAuthToken':
                    await deleteAuthToken(message.name, context);
                    await loadAuthTokens(panelRef, context);
                    break;
                case 'showInputBox':
                    const result = await vscode.window.showInputBox({
                        prompt: message.prompt,
                        value: message.value
                    });
                    panelRef.webview.postMessage({
                        command: 'inputBoxResponse',
                        result: result
                    });
                    break;
                case 'getSettings':
                    panelRef.webview.postMessage({
                        command: 'settings',
                        settings: getSettings()
                    });
                    // Also send active environment info
                    const activeEnvId = sidebarProvider.getActiveEnvironment();
                    if (activeEnvId) {
                        const envs = sidebarProvider.getEnvironments();
                        const activeEnv = envs.find(e => e.id === activeEnvId);
                        if (activeEnv) {
                            panelRef.webview.postMessage({
                                command: 'activeEnvironment',
                                environment: activeEnv
                            });
                        }
                    }
                    break;
                case 'updateTitle':
                    updatePanelTitle(panelRef, message.method, message.url);
                    break;
                case 'updateSetting':
                    const config = vscode.workspace.getConfiguration();
                    config.update(message.key, message.value, vscode.ConfigurationTarget.Global);
                    break;
                case 'loadHistory':
                    handleLoadHistory(requestManager, panelRef);
                    break;
                case 'deleteHistoryItem':
                    requestManager.deleteHistoryItem(message.id);
                    handleLoadHistory(requestManager, panelRef);
                    break;
                case 'clearHistory':
                    requestManager.clearHistory();
                    handleLoadHistory(requestManager, panelRef);
                    break;
            }
        });

        currentPanel.onDidDispose(() => {
            messageDisposable.dispose();
            currentPanel = undefined;
        });
    });

    const refreshCommand = vscode.commands.registerCommand('stacker.refresh', () => {
        sidebarProvider.refresh();
    });

    const addRequestCommand = vscode.commands.registerCommand('stacker.addRequest', () => {
        // Always create new panel for new request - don't use currentPanel singleton
        createNewPanel(requestManager, context);
    });

    const deleteRequestCommand = vscode.commands.registerCommand('stacker.deleteRequest', (item: any) => {
        if (item && item.id) {
            requestManager.deleteRequest(item.id);
            sidebarProvider.refresh();
            if (currentPanel) {
                handleLoadRequests(requestManager, currentPanel);
            }
            vscode.window.showInformationMessage('Request deleted successfully!');
        }
    });

    const loadRequestCommand = vscode.commands.registerCommand('stacker.loadRequest', (item: any) => {
        const id = item?.id || item;
        if (id) {
            // First check saved requests, then history
            let request = requestManager.getRequest(id);
            if (!request) {
                // Check in history
                const history = requestManager.getHistory();
                request = history.find(r => r.id === id);
            }

            if (request && currentPanel) {
                currentPanel.webview.postMessage({
                    command: 'loadRequest',
                    request: request
                });
                currentPanel.reveal(vscode.ViewColumn.One);
            } else if (request) {
                vscode.commands.executeCommand('stacker.open');
                setTimeout(() => {
                    currentPanel?.webview.postMessage({
                        command: 'loadRequest',
                        request: request
                    });
                }, 500);
            }
        }
    });

    // Manage Auth Token Command
    const manageAuthCommand = vscode.commands.registerCommand('stacker.manageAuth', async () => {
        const action = await vscode.window.showQuickPick(
            ['Add New Token', 'View Saved Tokens', 'Delete Token'],
            { placeHolder: 'Select auth token action' }
        );

        if (action === 'Add New Token') {
            const name = await vscode.window.showInputBox({
                prompt: 'Enter token name (e.g., "Production API", "Test User")',
                placeHolder: 'My API Token'
            });
            if (!name) return;

            const token = await vscode.window.showInputBox({
                prompt: 'Enter Bearer token',
                placeHolder: 'eyJhbGciOiJIUzI1NiIs...',
                password: true
            });
            if (!token) return;

            await saveAuthToken(token, name, context);
            vscode.window.showInformationMessage(`Token "${name}" saved!`);
        } else if (action === 'View Saved Tokens') {
            const tokens = context.globalState.get<Record<string, string>>('stackerAuthTokens', {});
            const tokenNames = Object.keys(tokens);
            if (tokenNames.length === 0) {
                vscode.window.showInformationMessage('No saved tokens');
                return;
            }
            const selected = await vscode.window.showQuickPick(tokenNames, {
                placeHolder: 'Select token to copy'
            });
            if (selected) {
                await vscode.env.clipboard.writeText(tokens[selected]);
                vscode.window.showInformationMessage(`Token "${selected}" copied to clipboard!`);
            }
        } else if (action === 'Delete Token') {
            const tokens = context.globalState.get<Record<string, string>>('stackerAuthTokens', {});
            const tokenNames = Object.keys(tokens);
            if (tokenNames.length === 0) {
                vscode.window.showInformationMessage('No saved tokens');
                return;
            }
            const selected = await vscode.window.showQuickPick(tokenNames, {
                placeHolder: 'Select token to delete'
            });
            if (selected) {
                await deleteAuthToken(selected, context);
                vscode.window.showInformationMessage(`Token "${selected}" deleted!`);
            }
        }
    });

    // Status Bar Item
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        100
    );
    statusBarItem.text = "$(symbol-interface) StackerClient";
    statusBarItem.tooltip = "Click to open StackerClient or view recent requests";
    statusBarItem.command = 'stacker.showQuickMenu';

    // Show/hide based on settings
    const initialSettings = getSettings();
    if (initialSettings.showStatusBar) {
        statusBarItem.show();
    }

    // Listen for settings changes
    const configChangeListener = vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('stacker.showStatusBar')) {
            const settings = getSettings();
            if (settings.showStatusBar) {
                statusBarItem.show();
            } else {
                statusBarItem.hide();
            }
        }
        if (e.affectsConfiguration('stacker.sidebar.defaultView')) {
            sidebarProvider.refresh();
        }
    });
    context.subscriptions.push(configChangeListener);

    // Quick Menu Command (Status Bar Click)
    const quickMenuCommand = vscode.commands.registerCommand('stacker.showQuickMenu', async () => {
        const requests = requestManager.getAllRequests();

        interface MenuItem extends vscode.QuickPickItem {
            action: string;
            id?: string;
        }

        const items: MenuItem[] = [
            { label: "$(add) New Request", description: "Create a new HTTP request", action: "new" }
        ];

        if (requests.length > 0) {
            items.push({ label: "", kind: vscode.QuickPickItemKind.Separator, action: "" });
            items.push({ label: "$(history) Recent Requests:", description: "", action: "" });

            requests.slice(0, 10).forEach(req => {
                items.push({
                    label: `   ${req.method}`,
                    description: req.url,
                    action: "load",
                    id: req.id
                });
            });
        }

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a request or create new'
        });

        if (selected) {
            if (selected.action === "new") {
                vscode.commands.executeCommand('stacker.open');
            } else if (selected.action === "load" && selected.id) {
                const request = requestManager.getRequest(selected.id);
                if (request) {
                    vscode.commands.executeCommand('stacker.open');
                    setTimeout(() => {
                        currentPanel?.webview.postMessage({
                            command: 'loadRequest',
                            request: request
                        });
                    }, 300);
                }
            }
        }
    });

    // Rename Request Command
    const renameRequestCommand = vscode.commands.registerCommand('stacker.renameRequest', async (item: any) => {
        const id = item?.id || item;
        if (id) {
            const request = requestManager.getRequest(id);
            if (!request) return;

            const newName = await vscode.window.showInputBox({
                prompt: 'Enter new name for this request',
                value: request.name,
                placeHolder: 'my-request'
            });

            if (newName && newName !== request.name) {
                request.name = newName;
                requestManager.saveRequest(request);
                sidebarProvider.refresh();
                vscode.window.showInformationMessage(`Request renamed to "${newName}"`);
            }
        }
    });

    // Import cURL Command
    const importCurlCommand = vscode.commands.registerCommand('stacker.importCurl', async () => {
        const curlCommand = await vscode.window.showInputBox({
            prompt: 'Paste cURL command',
            placeHolder: 'curl -X POST https://api.example.com -H "Content-Type: application/json" -d {"key":"value"}'
        });

        if (curlCommand) {
            try {
                const request = parseCurl(curlCommand);

                // Always create new panel for imported cURL
                const panel = createNewPanel(requestManager, context);

                // Wait a bit for panel to initialize then send import data
                setTimeout(() => {
                    panel.webview.postMessage({
                        command: 'importCurl',
                        request: request
                    });
                }, 300);

            } catch (error: any) {
                vscode.window.showErrorMessage('Failed to parse cURL: ' + error.message);
            }
        }
    });

    // Clear All History Command
    const clearHistoryCommand = vscode.commands.registerCommand('stacker.clearHistory', async () => {
        const answer = await vscode.window.showWarningMessage(
            'Are you sure you want to clear all saved requests?',
            'Yes',
            'No'
        );
        if (answer === 'Yes') {
            requestManager.clearAll();
            sidebarProvider.refresh();
            vscode.window.showInformationMessage('All requests cleared!');
        }
    });

    // Export All Data Command
    const exportDataCommand = vscode.commands.registerCommand('stacker.exportData', async () => {
        const data = {
            requests: requestManager.getAllRequests(),
            folders: sidebarProvider.getFolders(),
            environments: sidebarProvider.getEnvironments(),
            activeEnvironment: sidebarProvider.getActiveEnvironment(),
            authTokens: context.globalState.get('stackerAuthTokens', {}),
            exportDate: new Date().toISOString(),
            version: '1.0'
        };

        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file('stacker-backup.json'),
            filters: { 'JSON': ['json'] }
        });

        if (uri) {
            await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(JSON.stringify(data, null, 2)));
            vscode.window.showInformationMessage('StackerClient data exported successfully!');
        }
    });

    // Import Data Command
    const importDataCommand = vscode.commands.registerCommand('stacker.importData', async () => {
        const uris = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: { 'JSON': ['json'] }
        });

        if (uris && uris.length > 0) {
            try {
                const fileContent = await vscode.workspace.fs.readFile(uris[0]);
                const data = JSON.parse(fileContent.toString());

                // Validate data structure
                if (!data.requests || !Array.isArray(data.requests)) {
                    throw new Error('Invalid backup file format');
                }

                // Ask for confirmation if there are existing requests
                const existingRequests = requestManager.getAllRequests();
                if (existingRequests.length > 0) {
                    const action = await vscode.window.showWarningMessage(
                        'Import will merge with existing data. Existing items with same ID will be overwritten.',
                        'Import & Merge',
                        'Replace All',
                        'Cancel'
                    );

                    if (action === 'Cancel' || !action) return;

                    if (action === 'Replace All') {
                        requestManager.clearAll();
                    }
                }

                // Import requests
                for (const req of data.requests) {
                    requestManager.saveRequest(req);
                }

                // Import folders
                if (data.folders) {
                    for (const folder of data.folders) {
                        sidebarProvider.saveFolder(folder);
                    }
                }

                // Import environments
                if (data.environments) {
                    for (const env of data.environments) {
                        sidebarProvider.saveEnvironment(env);
                    }
                }

                // Import auth tokens
                if (data.authTokens) {
                    await context.globalState.update('stackerAuthTokens', data.authTokens);
                }

                sidebarProvider.refresh();
                vscode.window.showInformationMessage(`Imported ${data.requests.length} requests successfully!`);
            } catch (error: any) {
                vscode.window.showErrorMessage('Failed to import: ' + error.message);
            }
        }
    });

    // Environment Changed Command (triggered by sidebar)
    const envChangedCommand = vscode.commands.registerCommand('stacker.environmentChanged', () => {
        if (currentPanel) {
            const activeEnvId = sidebarProvider.getActiveEnvironment();
            if (activeEnvId) {
                const envs = sidebarProvider.getEnvironments();
                const activeEnv = envs.find(e => e.id === activeEnvId);
                if (activeEnv) {
                    currentPanel.webview.postMessage({
                        command: 'activeEnvironment',
                        environment: activeEnv
                    });
                }
            } else {
                currentPanel.webview.postMessage({
                    command: 'activeEnvironment',
                    environment: null
                });
            }
        }
    });

    // Help/About Command
    const helpCommand = vscode.commands.registerCommand('stacker.help', async () => {
        const panel = vscode.window.createWebviewPanel(
            'stackerHelp',
            'StackerClient - Help & About',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );
        panel.webview.html = getHelpContent(context);
    });

    context.subscriptions.push(
        openCommand,
        refreshCommand,
        addRequestCommand,
        deleteRequestCommand,
        loadRequestCommand,
        manageAuthCommand,
        quickMenuCommand,
        renameRequestCommand,
        importCurlCommand,
        clearHistoryCommand,
        envChangedCommand,
        helpCommand,
        exportDataCommand,
        importDataCommand,
        statusBarItem
    );
}

export function deactivate() {
    currentPanel = undefined;
}

function parseCurl(curlCommand: string): any {
    const request: any = {
        method: 'GET',
        url: '',
        headers: [],
        contentType: 'application/json',
        body: ''
    };

    // Normalize: remove line continuations and extra whitespace
    let cmd = curlCommand
        .replace(/\\\r?\n/g, ' ')  // Remove line continuations
        .replace(/\s+/g, ' ')       // Normalize whitespace
        .trim();

    // Remove 'curl' prefix
    if (cmd.toLowerCase().startsWith('curl ')) {
        cmd = cmd.substring(5).trim();
    }

    // Parse method (-X or --request)
    const methodMatch = cmd.match(/-(?:X|request)\s+['"]*(\w+)['"]?/i);
    if (methodMatch) {
        request.method = methodMatch[1].toUpperCase();
    }

    // Parse headers (-H or --header) - handle both single and double quotes
    const headerRegex = /-(?:H|header)\s+(?:'([^']+)'|"([^"]+)"|([^\s]+))/gi;
    let headerMatch;
    while ((headerMatch = headerRegex.exec(cmd)) !== null) {
        const headerStr = headerMatch[1] || headerMatch[2] || headerMatch[3];
        if (headerStr) {
            const colonIndex = headerStr.indexOf(':');
            if (colonIndex > 0) {
                const key = headerStr.substring(0, colonIndex).trim();
                const value = headerStr.substring(colonIndex + 1).trim();

                // Avoid duplicate headers
                const existingIndex = request.headers.findIndex((h: any) => h.key.toLowerCase() === key.toLowerCase());
                if (existingIndex >= 0) {
                    request.headers[existingIndex] = { key, value }; // Update existing
                } else {
                    request.headers.push({ key, value });
                }

                if (key.toLowerCase() === 'content-type') {
                    request.contentType = value.split(';')[0].trim();
                }
            }
        }
    }

    // Parse data (-d, --data, --data-raw, --data-binary, --data-urlencode)
    // Support multiple -d flags (concatenate with & for form data, or use last for JSON)
    const dataParts: string[] = [];
    const dataRegex = /-(?:d|data|data-raw|data-binary)\s+(?:'([^']+)'|"([^"]+)"|\$'([^']+)'|([^\s]+))/gi;
    let dataMatch;
    while ((dataMatch = dataRegex.exec(cmd)) !== null) {
        const dataStr = dataMatch[1] || dataMatch[2] || dataMatch[3] || dataMatch[4];
        if (dataStr) {
            // Handle bash $'...' style escape sequences
            let cleanData = dataStr;
            if (dataMatch[3]) { // $'...' style
                cleanData = dataStr.replace(/\\'/g, "'").replace(/\\n/g, '\n').replace(/\\t/g, '\t');
            }
            dataParts.push(cleanData);
        }
    }

    // Parse --data-urlencode
    const urlEncodeRegex = /--data-urlencode\s+(?:'([^']+)'|"([^"]+)"|([^\s]+))/gi;
    let urlEncodeMatch;
    while ((urlEncodeMatch = urlEncodeRegex.exec(cmd)) !== null) {
        const dataStr = urlEncodeMatch[1] || urlEncodeMatch[2] || urlEncodeMatch[3];
        if (dataStr) {
            // If it's key=value format, encode only value part
            if (dataStr.includes('=')) {
                const [key, ...valueParts] = dataStr.split('=');
                const value = valueParts.join('='); // Rejoin if value had = in it
                dataParts.push(`${key}=${encodeURIComponent(value)}`);
            } else {
                dataParts.push(encodeURIComponent(dataStr));
            }
        }
    }

    // Parse form data (-F, --form)
    const formParts: Array<{ key: string, value: string, type: 'text' | 'file', filename?: string }> = [];
    const formRegex = /-(?:F|form)\s+(?:'([^']+)'|"([^"]+)"|([^\s]+))/gi;
    let formMatch;
    while ((formMatch = formRegex.exec(cmd)) !== null) {
        const formStr = formMatch[1] || formMatch[2] || formMatch[3];
        if (formStr) {
            // Parse form field: key=value or key=@filename or key=<filename
            const equalIndex = formStr.indexOf('=');
            if (equalIndex > 0) {
                const key = formStr.substring(0, equalIndex).trim();
                const value = formStr.substring(equalIndex + 1).trim();

                if (value.startsWith('@')) {
                    // File upload
                    formParts.push({
                        key,
                        value: value.substring(1),
                        type: 'file',
                        filename: value.substring(1).split(/[\/\\]/).pop() || 'file'
                    });
                } else if (value.startsWith('<')) {
                    // File content as text
                    formParts.push({
                        key,
                        value: value.substring(1),
                        type: 'file',
                        filename: value.substring(1).split(/[\/\\]/).pop() || 'file'
                    });
                } else {
                    // Regular form field
                    formParts.push({ key, value, type: 'text' });
                }
            }
        }
    }

    // Handle data body construction
    if (dataParts.length > 0) {
        // Check if it's JSON
        const isJson = dataParts.some(p => p.trim().startsWith('{') || p.trim().startsWith('['));
        if (isJson) {
            // For JSON, use the last data part (usually the complete JSON)
            request.body = dataParts[dataParts.length - 1];
        } else {
            // For form data, concatenate with &
            request.body = dataParts.join('&');
        }
        if (request.method === 'GET') {
            request.method = 'POST';
        }
    }

    // Handle form data
    if (formParts.length > 0) {
        request.formData = formParts;
        request.contentType = 'multipart/form-data';
        if (request.method === 'GET') {
            request.method = 'POST';
        }
    }

    // Parse URL - handle various formats
    // 1. Try --url flag
    let urlMatch = cmd.match(/--url\s+(?:'([^']+)'|"([^"]+)"|([^\s]+))/i);

    // 2. Try quoted URLs
    if (!urlMatch) {
        urlMatch = cmd.match(/['"](https?:\/\/[^'"]+)['"]/);
    }

    // 3. Try unquoted URL (usually at the end or beginning)
    if (!urlMatch) {
        // Remove flags and their values to isolate URL
        const withoutFlags = cmd
            .replace(/-(?:H|header)\s+(?:'[^']*'|"[^"]*"|[^\s]+)/gi, '')
            .replace(/-(?:d|data|data-raw|data-binary|data-urlencode)\s+(?:'[^']*'|"[^"]*"|\$'[^']*'|[^\s]+)/gi, '')
            .replace(/-(?:F|form)\s+(?:'[^']*'|"[^"]*"|[^\s]+)/gi, '')
            .replace(/-(?:X|request)\s+['"]?\w+['"]?/gi, '')
            .replace(/-(?:A|user-agent)\s+(?:'[^']*'|"[^"]*")/gi, '')
            .replace(/-(?:u|user)\s+(?:'[^']*'|"[^"]*"|[^\s]+)/gi, '')
            .replace(/-(?:b|cookie)\s+(?:'[^']*'|"[^"]*")/gi, '')
            .replace(/--(?:compressed|insecure|L|location)\b/gi, '')
            .replace(/-(?:L|k)\b/gi, '')
            .trim();

        urlMatch = withoutFlags.match(/(https?:\/\/[^\s'"]+)/);
    }

    if (urlMatch) {
        let cleanUrl = (urlMatch[1] || urlMatch[2] || urlMatch[3] || urlMatch[0]).trim();

        // Remove trailing quotes or special chars
        cleanUrl = cleanUrl.replace(/['"]+$/, '').replace(/\\+$/, '');

        // Parse query parameters
        try {
            // Handle URLs with hash fragments
            const hashIndex = cleanUrl.indexOf('#');
            const urlWithoutHash = hashIndex >= 0 ? cleanUrl.substring(0, hashIndex) : cleanUrl;

            const urlObj = new URL(urlWithoutHash);
            const queryParams: Array<{ key: string, value: string }> = [];

            urlObj.searchParams.forEach((value, key) => {
                queryParams.push({ key, value });
            });

            if (queryParams.length > 0) {
                request.queryParams = queryParams;
                // Remove query string from URL for display
                urlObj.search = '';
                cleanUrl = urlObj.toString();
                // Restore hash if present
                if (hashIndex >= 0) {
                    cleanUrl += cleanUrl.substring(hashIndex);
                }
            }
        } catch (e) {
            // Invalid URL, keep as is
        }

        request.url = cleanUrl;
    }

    // Parse compressed flag
    if (cmd.includes('--compressed')) {
        const hasAcceptEncoding = request.headers.some((h: any) =>
            h.key.toLowerCase() === 'accept-encoding'
        );
        if (!hasAcceptEncoding) {
            request.headers.push({ key: 'Accept-Encoding', value: 'gzip, deflate, br' });
        }
    }

    // Parse user agent (-A or --user-agent)
    const uaMatch = cmd.match(/-(?:A|user-agent)\s+['"]([^'"]+)['"]/i);
    if (uaMatch) {
        const hasUA = request.headers.some((h: any) => h.key.toLowerCase() === 'user-agent');
        if (!hasUA) {
            request.headers.push({ key: 'User-Agent', value: uaMatch[1] });
        }
    }

    // Parse basic auth (-u or --user)
    const authMatch = cmd.match(/-(?:u|user)\s+['"]*([^'"\s]+)['"]?/i);
    if (authMatch) {
        const credentials = authMatch[1];
        const base64 = btoa(credentials);
        const hasAuth = request.headers.some((h: any) => h.key.toLowerCase() === 'authorization');
        if (!hasAuth) {
            request.headers.push({ key: 'Authorization', value: 'Basic ' + base64 });
        }
    }

    // Parse cookies (-b or --cookie)
    const cookieMatch = cmd.match(/-(?:b|cookie)\s+['"]([^'"]+)['"]/i);
    if (cookieMatch) {
        const hasCookie = request.headers.some((h: any) => h.key.toLowerCase() === 'cookie');
        if (!hasCookie) {
            request.headers.push({ key: 'Cookie', value: cookieMatch[1] });
        }
    }

    // Handle @file syntax for data
    const fileDataMatch = cmd.match(/-(?:d|data|data-raw)\s+@([^\s'"]+)/);
    if (fileDataMatch && !request.body) {
        request.body = `@[File: ${fileDataMatch[1]}]`;
        request.bodyFile = fileDataMatch[1];
        if (request.method === 'GET') {
            request.method = 'POST';
        }
    }

    if (!request.url) {
        throw new Error('Could not find URL in cURL command');
    }

    return request;
}

function getHelpContent(context: vscode.ExtensionContext): string {
    const version = vscode.extensions.getExtension('yasinkuyu.stacker-client')?.packageJSON.version || '1.1.5';

    // Read help.html from media folder
    const helpPath = vscode.Uri.file(path.join(context.extensionPath, 'media', 'help.html'));

    // Asynchrony in synchronous function: readFileSync
    // Since getHelpContent is called in async parent, we could make it async, but for simplicity:
    try {
        const fs = require('fs');
        let html = fs.readFileSync(helpPath.fsPath, 'utf8');
        html = html.replace('{{VERSION}}', version);
        return html;
    } catch (e) {
        console.error('Error reading help.html', e);
        return `<html><body><h1>StackerClient v${version}</h1><p>Error loading help content.</p></body></html>`;
    }
}

async function saveAuthToken(token: string, name: string, context: vscode.ExtensionContext) {
    const tokens = context.globalState.get<Record<string, string>>('stackerAuthTokens', {});
    tokens[name] = token;
    await context.globalState.update('stackerAuthTokens', tokens);
}

async function loadAuthTokens(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    const tokens = context.globalState.get<Record<string, string>>('stackerAuthTokens', {});
    panel.webview.postMessage({
        command: 'authTokens',
        tokens: tokens
    });
}

async function deleteAuthToken(name: string, context: vscode.ExtensionContext) {
    const tokens = context.globalState.get<Record<string, string>>('stackerAuthTokens', {});
    delete tokens[name];
    await context.globalState.update('stackerAuthTokens', tokens);
}

// Create a new independent panel (not affecting currentPanel singleton)
function createNewPanel(requestManager: RequestManager, context: vscode.ExtensionContext): vscode.WebviewPanel {
    // Calculate next request number based on saved requests count
    const allRequests = requestManager.getAllRequests();
    const nextRequestNumber = allRequests.length + 1;

    const panel = vscode.window.createWebviewPanel(
        'stackerClient',
        `#${nextRequestNumber} StackerClient`,
        vscode.ViewColumn.One,
        { enableScripts: true, retainContextWhenHidden: true }
    );
    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'icon.svg');
    panel.webview.html = getWebviewContent();

    // Setup message handlers for this independent panel
    const msgDisposable = panel.webview.onDidReceiveMessage(async (message) => {
        switch (message.command) {
            case 'sendRequest':
                await handleSendRequest(message.request, panel, requestManager);
                break;
            case 'saveRequest':
                handleSaveRequest(message.request, requestManager, panel);
                sidebarProvider.refresh();
                break;
            case 'deleteRequest':
                handleDeleteRequest(message.id, requestManager, panel);
                sidebarProvider.refresh();
                break;
            case 'loadRequests':
                handleLoadRequests(requestManager, panel);
                break;
            case 'loadAuthTokens':
                await loadAuthTokens(panel, context);
                break;
            case 'saveAuthToken':
                await saveAuthToken(message.token, message.name, context);
                break;
            case 'deleteAuthToken':
                await deleteAuthToken(message.name, context);
                await loadAuthTokens(panel, context);
                break;
            case 'showInputBox':
                const result = await vscode.window.showInputBox({
                    prompt: message.prompt,
                    value: message.value
                });
                panel.webview.postMessage({
                    command: 'inputBoxResponse',
                    result: result
                });
                break;
            case 'getSettings':
                panel.webview.postMessage({
                    command: 'settings',
                    settings: getSettings()
                });
                // Also send active environment info
                const activeEnvId = sidebarProvider.getActiveEnvironment();
                if (activeEnvId) {
                    const envs = sidebarProvider.getEnvironments();
                    const activeEnv = envs.find(e => e.id === activeEnvId);
                    if (activeEnv) {
                        panel.webview.postMessage({
                            command: 'activeEnvironment',
                            environment: activeEnv
                        });
                    }
                }
                break;
            case 'updateTitle':
                updatePanelTitle(panel, message.method, message.url, `#${nextRequestNumber} `);
                break;
            case 'loadHistory':
                handleLoadHistory(requestManager, panel);
                break;
            case 'deleteHistoryItem':
                requestManager.deleteHistoryItem(message.id);
                handleLoadHistory(requestManager, panel);
                break;
            case 'clearHistory':
                requestManager.clearHistory();
                handleLoadHistory(requestManager, panel);
                break;
            case 'showOpenDialog':
                const options: vscode.OpenDialogOptions = {
                    canSelectMany: false,
                    openLabel: 'Select File',
                    filters: {
                        'All files': ['*']
                    }
                };
                const fileUri = await vscode.window.showOpenDialog(options);
                if (fileUri && fileUri[0]) {
                    panel.webview.postMessage({
                        command: 'fileSelected',
                        uri: fileUri[0].fsPath,
                        rowId: message.rowId
                    });
                }
                break;
        }
    });

    // Cleanup on panel dispose
    panel.onDidDispose(() => {
        msgDisposable.dispose();
    });

    return panel;
}

async function handleSendRequest(request: any, panel: vscode.WebviewPanel, requestManager?: RequestManager) {
    try {
        // Get active environment variables for interpolation
        const activeEnvId = sidebarProvider.getActiveEnvironment();
        let envVariables: Array<{ key: string, value: string, enabled: boolean }> = [];

        if (activeEnvId) {
            const environments = sidebarProvider.getEnvironments();
            const activeEnv = environments.find(e => e.id === activeEnvId);
            if (activeEnv) {
                envVariables = activeEnv.variables;
            }
        }

        const response = await sendHttpRequest(request, envVariables);
        panel.webview.postMessage({
            command: 'response',
            response: response
        });

        // Always save to history
        if (requestManager) {
            const historyRequest: SavedRequest = {
                id: Date.now().toString(),
                name: request.name || (() => { try { return new URL(request.url).pathname || 'Untitled'; } catch { return 'Untitled'; } })(),
                method: request.method,
                url: request.baseUrl || request.url,
                headers: request.allHeaders || request.headers || [],
                contentType: request.contentType,
                body: request.body || '',
                bypassWAF: request.bypassWAF,
                userAgent: request.userAgent,
                referer: request.referer,
                queryParams: request.queryParams
            };
            requestManager.addToHistory(historyRequest);
            handleLoadHistory(requestManager, panel);
            sidebarProvider.refresh();
        }

        // Auto-save if enabled
        const settings = getSettings();
        if (settings.autoSaveRequests && requestManager) {
            const savedRequest: SavedRequest = {
                id: Date.now().toString(),
                name: request.name || (() => { try { return new URL(request.url).pathname || 'Untitled'; } catch { return 'Untitled'; } })(),
                method: request.method,
                url: request.baseUrl || request.url,
                headers: request.allHeaders || request.headers || [],
                contentType: request.contentType,
                body: request.body || '',
                bypassWAF: request.bypassWAF,
                userAgent: request.userAgent,
                referer: request.referer,
                queryParams: request.queryParams
            };
            requestManager.saveRequest(savedRequest);
            sidebarProvider.refresh();
        }
    } catch (error: any) {
        panel.webview.postMessage({
            command: 'error',
            error: error.message || 'An unknown error occurred'
        });
    }
}

function handleSaveRequest(request: SavedRequest, requestManager: RequestManager, panel: vscode.WebviewPanel) {
    requestManager.saveRequest(request);
    panel.webview.postMessage({
        command: 'requestSaved',
        success: true
    });
    handleLoadRequests(requestManager, panel);
}

function handleLoadRequests(requestManager: RequestManager, panel: vscode.WebviewPanel) {
    panel.webview.postMessage({
        command: 'requests',
        requests: requestManager.getAllRequests()
    });
}

function handleLoadHistory(requestManager: RequestManager, panel: vscode.WebviewPanel) {
    panel.webview.postMessage({
        command: 'history',
        history: requestManager.getHistory()
    });
}

function handleDeleteRequest(id: string, requestManager: RequestManager, panel: vscode.WebviewPanel) {
    requestManager.deleteRequest(id);
    handleLoadRequests(requestManager, panel);
}

// Get extension settings
function getSettings() {
    const config = vscode.workspace.getConfiguration('stacker');
    return {
        requestTimeout: config.get<number>('requestTimeout', 30000),
        defaultContentType: config.get<string>('defaultContentType', 'application/json'),
        defaultMethod: config.get<string>('defaultMethod', 'GET'),
        maxHistoryItems: config.get<number>('maxHistoryItems', 100),
        showStatusBar: config.get<boolean>('showStatusBar', true),
        autoSaveRequests: config.get<boolean>('autoSaveRequests', false),
        followRedirects: config.get<boolean>('followRedirects', true),
        validateSSL: config.get<boolean>('validateSSL', true),
        prettyPrintResponse: config.get<boolean>('prettyPrintResponse', true),
        defaultHeaders: config.get<Array<{ key: string, value: string }>>('defaultHeaders', []),
        responseMaxSize: config.get<number>('responsePreview.maxSize', 5242880),
        groupByMethod: config.get<boolean>('sidebar.groupByMethod', true),
        showMethodBadges: config.get<boolean>('sidebar.showMethodBadges', true),
        editorFontSize: config.get<number>('editor.fontSize', 13),
        editorWordWrap: config.get<boolean>('editor.wordWrap', true),
        proxyEnabled: config.get<boolean>('proxy.enabled', false),
        proxyUrl: config.get<string>('proxy.url', ''),
        theme: config.get<string>('theme', 'auto'),
        tabTitleFormat: config.get<string>('tabTitleFormat', 'full'),
        sidebarDefaultView: config.get<string>('sidebar.defaultView', 'recent')
    };
}

/**
 * Partial implementation of RFC 2617 Digestive Authentication
 */
function parseDigestHeader(header: string): Record<string, string> {
    const params: Record<string, string> = {};
    const matches = header.matchAll(/(\w+)[:=] ?"?([^",]+)"?/g);
    for (const match of matches) {
        params[match[1]] = match[2];
    }
    return params;
}

function calculateDigestResponse(
    method: string,
    uri: string,
    params: Record<string, string>,
    user: string,
    pass: string
): string {
    const md5 = (str: string) => crypto.createHash('md5').update(str).digest('hex');

    const realm = params.realm;
    const nonce = params.nonce;
    const qop = params.qop;
    const opaque = params.opaque;
    const nc = '00000001';
    const cnonce = crypto.randomBytes(8).toString('hex');

    const ha1 = md5(`${user}:${realm}:${pass}`);
    const ha2 = md5(`${method}:${uri}`);

    let response: string;
    if (qop === 'auth') {
        response = md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);
    } else {
        response = md5(`${ha1}:${nonce}:${ha2}`);
    }

    let authHeader = `Digest username="${user}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
    if (opaque) authHeader += `, opaque="${opaque}"`;
    if (qop) authHeader += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;

    return authHeader;
}

// Update panel title helper
// Update panel title helper
function updatePanelTitle(panel: vscode.WebviewPanel, method: string, urlStr: string, prefix: string = '') {
    const settings = getSettings();
    let display = 'New Request';

    if (urlStr) {
        try {
            // Check if it's a full URL or just a path
            if (urlStr.startsWith('http') || urlStr.includes('://')) {
                const url = new URL(urlStr);
                if (settings.tabTitleFormat === 'path') {
                    display = url.pathname !== '/' ? url.pathname : '/';
                } else {
                    // hostname + path
                    const host = url.hostname;
                    const path = url.pathname !== '/' ? url.pathname : '';
                    display = host + path;
                }
            } else {
                // It's likely a relative path or environment variable
                display = urlStr;
            }
        } catch {
            display = urlStr;
        }
    }

    if (!display || display === '/') {
        display = urlStr || 'New Request';
    }

    // Truncate if too long (max 30 symbols)
    if (display.length > 30) {
        display = display.substring(0, 30) + '...';
    }

    panel.title = `${prefix}${method} ${display}`;
}

// Escape regex special characters in a string
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Environment variable interpolation - replaces {{variable}} with actual values
function interpolateEnvironmentVariables(text: string, variables: Array<{ key: string, value: string, enabled: boolean }>): string {
    if (!text || !variables || variables.length === 0) {
        return text;
    }

    let result = text;
    const enabledVars = variables.filter(v => v.enabled !== false);

    for (const variable of enabledVars) {
        const escapedKey = escapeRegex(variable.key);
        const pattern = new RegExp(`\\{\\{\\s*${escapedKey}\\s*\\}\\}`, 'g');
        result = result.replace(pattern, variable.value);
    }

    return result;
}

async function sendHttpRequest(request: any, envVariables: Array<{ key: string, value: string, enabled: boolean }> = []): Promise<any> {
    const settings = getSettings();
    const controller = new AbortController();
    const timeoutMs = settings.requestTimeout;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    // Apply environment variable interpolation
    let interpolatedUrl = interpolateEnvironmentVariables(request.url, envVariables);
    const interpolatedBody = request.body ? interpolateEnvironmentVariables(request.body, envVariables) : '';

    // Interpolate query parameters and rebuild URL
    if (request.queryParams && Array.isArray(request.queryParams) && request.queryParams.length > 0) {
        try {
            const urlObj = new URL(interpolatedUrl);
            urlObj.search = ''; // Clear existing query string

            request.queryParams.forEach((param: any) => {
                if (param.key && param.checked !== false) {
                    const interpolatedKey = interpolateEnvironmentVariables(param.key, envVariables);
                    const interpolatedValue = interpolateEnvironmentVariables(param.value || '', envVariables);
                    urlObj.searchParams.append(interpolatedKey, interpolatedValue);
                }
            });

            interpolatedUrl = urlObj.toString();
        } catch {
            // URL parsing failed, append params manually
            const params = request.queryParams
                .filter((p: any) => p.key && p.checked !== false)
                .map((p: any) => {
                    const k = interpolateEnvironmentVariables(p.key, envVariables);
                    const v = interpolateEnvironmentVariables(p.value || '', envVariables);
                    return `${encodeURIComponent(k)}=${encodeURIComponent(v)}`;
                })
                .join('&');
            if (params) {
                interpolatedUrl += (interpolatedUrl.includes('?') ? '&' : '?') + params;
            }
        }
    }

    const headers: Record<string, string> = {};

    // 1. Determine User-Agent
    let selectedUA = 'StackerClient/1.1.8';
    if (request.userAgent) {
        const mappedUA = getUserAgentString(request.userAgent);
        selectedUA = mappedUA || request.userAgent;
    } else if (request.bypassWAF) {
        // Default stealth UA if bypass is on but no specific UA is selected
        selectedUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    }
    headers['User-Agent'] = selectedUA;

    // Add Referer
    if (request.referer) {
        const mappedReferer = getRefererString(request.referer);
        headers['Referer'] = mappedReferer || request.referer;
    }

    // 2. Apply Bypass / Stealth Headers if enabled
    if (request.bypassWAF) {
        // Modern Browser Headers
        headers['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7';
        headers['Accept-Language'] = 'en-US,en;q=0.9,tr-TR;q=0.8,tr;q=0.7';
        headers['Accept-Encoding'] = 'gzip, deflate, br';
        headers['Upgrade-Insecure-Requests'] = '1';
        headers['Sec-Fetch-Dest'] = 'document';
        headers['Sec-Fetch-Mode'] = 'navigate';
        headers['Sec-Fetch-Site'] = 'none';
        headers['Sec-Fetch-User'] = '?1';
        headers['DNT'] = '1';
        headers['Cache-Control'] = 'max-age=0';

        // Intelligent Client Hints based on selected UA
        headers['Sec-Ch-Ua'] = '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"';
        headers['Sec-Ch-Ua-Mobile'] = selectedUA.includes('Mobile') || selectedUA.includes('iPhone') || selectedUA.includes('Android') ? '?1' : '?0';

        let platform = '"Windows"';
        if (selectedUA.includes('Macintosh') || selectedUA.includes('iPhone')) {
            platform = '"macOS"';
        } else if (selectedUA.includes('Android')) {
            platform = '"Android"';
        } else if (selectedUA.includes('Linux')) {
            platform = '"Linux"';
        }
        headers['Sec-Ch-Ua-Platform'] = platform;
    }

    // Add default headers from settings
    if (settings.defaultHeaders && settings.defaultHeaders.length > 0) {
        settings.defaultHeaders.forEach((h: any) => {
            if (h.key) {
                const interpolatedKey = interpolateEnvironmentVariables(h.key, envVariables);
                const interpolatedValue = interpolateEnvironmentVariables(h.value || '', envVariables);
                headers[interpolatedKey] = interpolatedValue;
            }
        });
    }

    // Add request-specific headers (override defaults)
    if (request.headers && Array.isArray(request.headers)) {
        request.headers.forEach((h: any) => {
            if (h.key) {
                const interpolatedKey = interpolateEnvironmentVariables(h.key, envVariables);
                const interpolatedValue = interpolateEnvironmentVariables(h.value || '', envVariables);
                headers[interpolatedKey] = interpolatedValue;
            }
        });
    }

    // 3. APPLY AUTH (New System)
    if (request.auth && request.auth.type !== 'none') {
        const auth = request.auth;
        switch (auth.type) {
            case 'bearer':
                if (auth.token) {
                    const prefix = auth.prefix || 'Bearer';
                    headers['Authorization'] = `${prefix} ${interpolateEnvironmentVariables(auth.token, envVariables)}`;
                }
                break;
            case 'basic':
                if (auth.username) {
                    const user = interpolateEnvironmentVariables(auth.username, envVariables);
                    const pass = interpolateEnvironmentVariables(auth.password || '', envVariables);
                    const base64 = Buffer.from(`${user}:${pass}`).toString('base64');
                    headers['Authorization'] = `Basic ${base64}`;
                }
                break;
            case 'apikey':
                if (auth.key && auth.value) {
                    const key = interpolateEnvironmentVariables(auth.key, envVariables);
                    const val = interpolateEnvironmentVariables(auth.value, envVariables);
                    if (auth.addTo === 'query') {
                        try {
                            const urlObj = new URL(interpolatedUrl);
                            urlObj.searchParams.append(key, val);
                            interpolatedUrl = urlObj.toString();
                        } catch {
                            interpolatedUrl += (interpolatedUrl.includes('?') ? '&' : '?') + `${encodeURIComponent(key)}=${encodeURIComponent(val)}`;
                        }
                    } else {
                        headers[key] = val;
                    }
                }
                break;
            case 'oauth2':
                if (auth.token) {
                    const prefix = auth.prefix || 'Bearer';
                    const token = interpolateEnvironmentVariables(auth.token, envVariables);
                    if (auth.addTo === 'query') {
                        try {
                            const urlObj = new URL(interpolatedUrl);
                            urlObj.searchParams.append('access_token', token);
                            interpolatedUrl = urlObj.toString();
                        } catch {
                            interpolatedUrl += (interpolatedUrl.includes('?') ? '&' : '?') + `access_token=${encodeURIComponent(token)}`;
                        }
                    } else {
                        headers['Authorization'] = `${prefix} ${token}`;
                    }
                }
                break;
            case 'custom':
                if (auth.key && auth.value) {
                    headers[interpolateEnvironmentVariables(auth.key, envVariables)] = interpolateEnvironmentVariables(auth.value, envVariables);
                }
                break;
        }
    }

    if (request.contentType) {
        headers['Content-Type'] = request.contentType;
    }

    // Build fetch options
    const fetchOptions: any = {
        method: request.method,
        headers,
        signal: controller.signal,
        redirect: settings.followRedirects ? 'follow' : 'manual'
    };

    // 4. PROCESS BODY (New System)
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
        if (request.bodyData && request.bodyData.type !== 'none') {
            const bodyData = request.bodyData;
            if (bodyData.type === 'form-data') {
                const boundary = '----StackerClientBoundary' + crypto.randomBytes(8).toString('hex');
                headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;

                const parts: Buffer[] = [];
                if (bodyData.items) {
                    for (const item of bodyData.items) {
                        if (item.key && item.checked !== false) {
                            const k = interpolateEnvironmentVariables(item.key, envVariables);
                            const v = interpolateEnvironmentVariables(item.value || '', envVariables);

                            parts.push(Buffer.from(`--${boundary}\r\n`));

                            if (item.type === 'file' && v) {
                                try {
                                    const fileUri = vscode.Uri.file(v);
                                    const fileData = await vscode.workspace.fs.readFile(fileUri);
                                    const fileName = path.basename(v);
                                    parts.push(Buffer.from(`Content-Disposition: form-data; name="${k}"; filename="${fileName}"\r\n`));
                                    parts.push(Buffer.from(`Content-Type: application/octet-stream\r\n\r\n`));
                                    parts.push(Buffer.from(fileData));
                                    parts.push(Buffer.from(`\r\n`));
                                } catch (e) {
                                    console.error(`Failed to read file: ${v}`, e);
                                    // Fallback to text if file read fails
                                    parts.push(Buffer.from(`Content-Disposition: form-data; name="${k}"\r\n\r\n`));
                                    parts.push(Buffer.from(`${v}\r\n`));
                                }
                            } else {
                                parts.push(Buffer.from(`Content-Disposition: form-data; name="${k}"\r\n\r\n`));
                                parts.push(Buffer.from(`${v}\r\n`));
                            }
                        }
                    }
                }
                parts.push(Buffer.from(`--${boundary}--\r\n`));
                fetchOptions.body = Buffer.concat(parts);
            } else if (bodyData.type === 'urlencoded') {
                const params = new URLSearchParams();
                if (bodyData.items) {
                    bodyData.items.forEach((item: any) => {
                        if (item.key && item.checked !== false) {
                            params.append(
                                interpolateEnvironmentVariables(item.key, envVariables),
                                interpolateEnvironmentVariables(item.value || '', envVariables)
                            );
                        }
                    });
                }
                fetchOptions.body = params.toString();
                headers['Content-Type'] = 'application/x-www-form-urlencoded';
            } else if (bodyData.type === 'raw') {
                fetchOptions.body = interpolateEnvironmentVariables(bodyData.value || '', envVariables);
                headers['Content-Type'] = bodyData.contentType || 'application/json';
            }
        } else if (interpolatedBody) {
            // Backward Compatibility
            if (request.contentType === 'application/json') {
                try {
                    JSON.parse(interpolatedBody);
                    fetchOptions.body = interpolatedBody;
                } catch {
                    throw new Error('Invalid JSON in request body');
                }
            } else {
                fetchOptions.body = interpolatedBody;
            }
        }
    }

    // Handle SSL validation
    const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    if (!settings.validateSSL) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    } else {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
    }

    // Handle proxy (if enabled and configured)
    if (settings.proxyEnabled && settings.proxyUrl) {
        console.log(`Proxy configured: ${settings.proxyUrl} `);
    }

    const startTime = Date.now();

    try {
        let response = await fetch(interpolatedUrl, fetchOptions);

        // Restore SSL setting immediately after request
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;

        // Handle Digest Auth challenge
        if (response.status === 401 && request.auth?.type === 'digest') {
            const wwwAuth = response.headers.get('www-authenticate');
            if (wwwAuth && wwwAuth.includes('Digest')) {
                const digestParams = parseDigestHeader(wwwAuth);
                const user = interpolateEnvironmentVariables(request.auth.username || '', envVariables);
                const pass = interpolateEnvironmentVariables(request.auth.password || '', envVariables);
                const urlObj = new URL(interpolatedUrl);

                const digestHeader = calculateDigestResponse(
                    request.method,
                    urlObj.pathname + urlObj.search,
                    digestParams,
                    user,
                    pass
                );

                // Update headers and retry
                fetchOptions.headers['Authorization'] = digestHeader;
                response = await fetch(interpolatedUrl, fetchOptions);
            }
        }

        clearTimeout(timeout);

        const responseHeaders: Record<string, any> = {};
        response.headers.forEach((value, key) => {
            if (key.toLowerCase() !== 'set-cookie') {
                responseHeaders[key] = value;
            }
        });

        // Always try getSetCookie() separately — forEach may skip or merge set-cookie
        if (typeof (response.headers as any).getSetCookie === 'function') {
            const cookies = (response.headers as any).getSetCookie();
            if (cookies && cookies.length > 0) {
                responseHeaders['set-cookie'] = cookies;
            }
        } else {
            // Fallback: use .get() which may join multiple cookies with comma
            const raw = response.headers.get('set-cookie');
            if (raw) {
                responseHeaders['set-cookie'] = raw;
            }
        }

        let responseBody: any;
        const contentType = response.headers.get('content-type') || '';

        // Binary content-type detection
        const binaryTypes = [
            'image/', 'audio/', 'video/', 'application/pdf',
            'application/zip', 'application/x-rar', 'application/x-zip',
            'application/octet-stream', 'application/gzip', 'application/x-gzip',
            'application/x-tar', 'application/x-7z'
        ];

        const isBinary = binaryTypes.some(type => contentType.includes(type)) ||
            contentType.includes('binary');

        // Check response size before loading into memory
        const contentLength = parseInt(response.headers.get('content-length') || '0');
        if (contentLength > settings.responseMaxSize) {
            return {
                status: response.status,
                statusText: response.statusText,
                headers: responseHeaders,
                body: `Response too large (${(contentLength / 1024 / 1024).toFixed(2)} MB). Max size: ${(settings.responseMaxSize / 1024 / 1024).toFixed(2)} MB`,
                time: Date.now() - startTime,
                size: contentLength,
                interpolatedUrl: interpolatedUrl !== request.url ? interpolatedUrl : undefined
            };
        }

        // Get arrayBuffer first (needed for hex and can be converted to text)
        let responseArrayBuffer: ArrayBuffer;
        try {
            responseArrayBuffer = await response.arrayBuffer();
        } catch {
            responseArrayBuffer = new Uint8Array(0).buffer;
        }

        // Generate hex representation for ALL responses
        let hexBody: { __hex__: boolean; hex: string; size: number; truncated: boolean; mimeType: string } | undefined;
        try {
            const uint8Array = new Uint8Array(responseArrayBuffer);
            const maxBytes = 1024 * 1024; // 1MB max
            const bytesToConvert = uint8Array.slice(0, maxBytes);
            const hexString = Array.from(bytesToConvert)
                .map(b => b.toString(16).padStart(2, '0'))
                .join(' ');

            hexBody = {
                __hex__: true,
                hex: hexString,
                size: uint8Array.length,
                truncated: uint8Array.length > maxBytes,
                mimeType: contentType
            };
        } catch {
            // Hex generation failed, continue without hex
        }

        // Get response text from arrayBuffer
        let responseText: string;
        try {
            const decoder = new TextDecoder('utf-8', { fatal: false });
            responseText = decoder.decode(responseArrayBuffer);
        } catch {
            responseText = '';
        }

        // Handle response body based on content type
        if (isBinary) {
            // Binary responses already handled above with hex in body
            responseBody = {
                __hex__: true,
                hex: hexBody?.hex || '',
                size: hexBody?.size || 0,
                truncated: hexBody?.truncated || false,
                mimeType: contentType
            };
        } else {
            // Check response size
            if (responseText.length > settings.responseMaxSize) {
                responseBody = `Response too large (${(responseText.length / 1024 / 1024).toFixed(2)} MB). Max size: ${(settings.responseMaxSize / 1024 / 1024).toFixed(2)} MB`;
            } else if (contentType.includes('application/json')) {
                try {
                    responseBody = JSON.parse(responseText);
                    if (settings.prettyPrintResponse && typeof responseBody === 'object') {
                        responseBody = responseBody;
                    }
                } catch {
                    responseBody = responseText;
                }
            } else if (contentType.includes('multipart/form-data')) {
                // Handle multipart/form-data responses
                const boundaryMatch = contentType.match(/boundary=(.+)/);
                const boundary = boundaryMatch ? boundaryMatch[1] : null;

                if (boundary) {
                    responseBody = {
                        __formData__: true,
                        raw: responseText,
                        boundary: boundary,
                        parts: parseMultipartFormData(responseText, boundary)
                    };
                } else {
                    responseBody = responseText;
                }
            } else {
                responseBody = responseText;
            }
        }

        // Detect transfer encoding
        const transferEncoding = response.headers.get('transfer-encoding') || '';
        const isChunked = transferEncoding.toLowerCase().includes('chunked');

        return {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
            body: responseBody,
            hexBody: hexBody,
            time: Date.now() - startTime,
            size: responseText.length,
            interpolatedUrl: interpolatedUrl !== request.url ? interpolatedUrl : undefined,
            isChunked: isChunked,
            transferEncoding: transferEncoding || undefined
        };
    } catch (error: any) {
        clearTimeout(timeout);
        if (error.name === 'AbortError') {
            throw new Error(`Request timeout(${timeoutMs / 1000}s)`);
        }
        throw error;
    }
}

function getUserAgentString(key: string): string {
    const agents: Record<string, string> = {
        'chrome_win': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'chrome_mac': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'firefox_win': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        'firefox_mac': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
        'safari_mac': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
        'edge_win': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
        'iphone': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
        'android': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'googlebot': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'bingbot': 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
        'yandexbot': 'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)',
        'duckduckgo': 'DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)'
    };
    return agents[key] || '';
}

function getRefererString(key: string): string {
    const referers: Record<string, string> = {
        'google': 'https://www.google.com/',
        'bing': 'https://www.bing.com/',
        'github': 'https://github.com/',
        'facebook': 'https://www.facebook.com/',
        'twitter': 'https://twitter.com/'
    };
    return referers[key] || '';
}

// Parse multipart/form-data response
function parseMultipartFormData(body: string, boundary: string): any[] {
    const parts: any[] = [];
    const delimiter = '--' + boundary;
    const sections = body.split(delimiter);

    sections.forEach(section => {
        const trimmed = section.trim();
        if (!trimmed || trimmed === '--' || trimmed === '') return;

        const [headersPart, ...bodyParts] = trimmed.split('\r\n\r\n');
        const bodyContent = bodyParts.join('\r\n\r\n').trim();

        const headers: Record<string, string> = {};
        headersPart.split('\r\n').forEach(line => {
            const [key, ...valueParts] = line.split(':');
            if (key && valueParts.length > 0) {
                headers[key.trim().toLowerCase()] = valueParts.join(':').trim();
            }
        });

        // Check if part is a file
        const contentDisposition = headers['content-disposition'] || '';
        const filenameMatch = contentDisposition.match(/filename="?([^";\n]+)"?/);
        const nameMatch = contentDisposition.match(/name="?([^";\n]+)"?/);

        parts.push({
            headers: headers,
            name: nameMatch ? nameMatch[1] : null,
            filename: filenameMatch ? filenameMatch[1] : null,
            contentType: headers['content-type'] || null,
            body: bodyContent
        });
    });

    return parts;
}

