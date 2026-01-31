import * as vscode from 'vscode';
import { RequestManager, SavedRequest } from './RequestManager';
import { SidebarProvider } from './SidebarProvider';
import { getWebviewContent } from './webviewContent';

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

        currentPanel.iconPath = new vscode.ThemeIcon('debug-alt');
        currentPanel.webview.html = getWebviewContent();

        currentPanel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'sendRequest':
                    await handleSendRequest(message.request, currentPanel!, requestManager);
                    break;
                case 'saveRequest':
                    handleSaveRequest(message.request, requestManager, currentPanel!);
                    sidebarProvider.refresh();
                    break;
                case 'loadRequests':
                    handleLoadRequests(requestManager, currentPanel!);
                    break;
                case 'deleteRequest':
                    handleDeleteRequest(message.id, requestManager, currentPanel!);
                    sidebarProvider.refresh();
                    break;
                case 'saveAuthToken':
                    await saveAuthToken(message.token, message.name, context);
                    break;
                case 'loadAuthTokens':
                    await loadAuthTokens(currentPanel!, context);
                    break;
                case 'deleteAuthToken':
                    await deleteAuthToken(message.name, context);
                    await loadAuthTokens(currentPanel!, context);
                    break;
                case 'showInputBox':
                    const result = await vscode.window.showInputBox({
                        prompt: message.prompt,
                        value: message.value
                    });
                    currentPanel!.webview.postMessage({
                        command: 'inputBoxResponse',
                        result: result
                    });
                    break;
                case 'getSettings':
                    currentPanel!.webview.postMessage({
                        command: 'settings',
                        settings: getSettings()
                    });
                    // Also send active environment info
                    const activeEnvId = sidebarProvider.getActiveEnvironment();
                    if (activeEnvId) {
                        const envs = sidebarProvider.getEnvironments();
                        const activeEnv = envs.find(e => e.id === activeEnvId);
                        if (activeEnv) {
                            currentPanel!.webview.postMessage({
                                command: 'activeEnvironment',
                                environment: activeEnv
                            });
                        }
                    }
                    break;
                case 'updateTitle':
                    // Update panel title based on URL/method
                    if (message.url) {
                        try {
                            const url = new URL(message.url);
                            const path = url.pathname || '/';
                            currentPanel!.title = `${message.method} ${path}`;
                        } catch {
                            currentPanel!.title = `${message.method} ${message.url.substring(0, 30)}`;
                        }
                    } else {
                        currentPanel!.title = 'StackerClient';
                    }
                    break;
            }
        });

        currentPanel.onDidDispose(() => {
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
            const request = requestManager.getRequest(id);
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
    statusBarItem.text = "$(zap) StackerClient";
    statusBarItem.tooltip = "Click to open StackerClient or view recent requests";
    statusBarItem.command = 'stacker.showQuickMenu';

    // Show/hide based on settings
    const initialSettings = getSettings();
    if (initialSettings.showStatusBar) {
        statusBarItem.show();
    }

    // Listen for settings changes
    vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('stacker.showStatusBar')) {
            const settings = getSettings();
            if (settings.showStatusBar) {
                statusBarItem.show();
            } else {
                statusBarItem.hide();
            }
        }
    });

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
            await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(data, null, 2)));
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
        panel.webview.html = getHelpContent();
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
        const base64 = Buffer.from(credentials).toString('base64');
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

function getHelpContent(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>StackerClient - Help & About</title>
    <style>
        :root {
            --vscode-font-family: -apple-system, BlinkMacSystemFont, "Segoe WPC", "Segoe UI", "Ubuntu", "Droid Sans", sans-serif;
            --vscode-font-size: 13px;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 24px;
        }

        h1 {
            color: var(--vscode-foreground);
            font-size: 32px;
            font-weight: 600;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .subtitle {
            color: var(--vscode-descriptionForeground);
            font-size: 16px;
            margin-bottom: 32px;
        }

        h2 {
            color: var(--vscode-foreground);
            font-size: 20px;
            font-weight: 600;
            margin-top: 40px;
            margin-bottom: 16px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
            gap: 16px;
        }

        .feature {
            background: var(--vscode-sideBar-background);
            border: 1px solid var(--vscode-panel-border);
            padding: 20px;
            border-radius: 8px;
            transition: border-color 0.2s;
        }

        .feature:hover {
            border-color: var(--vscode-focusBorder);
        }

        .feature h3 {
            margin-top: 0;
            margin-bottom: 10px;
            color: var(--vscode-textLink-foreground);
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .feature p {
            color: var(--vscode-foreground);
            opacity: 0.9;
            font-size: 13px;
        }

        code {
            background: var(--vscode-textCodeBlock-background);
            color: var(--vscode-textPreformat-foreground);
            padding: 2px 6px;
            border-radius: 4px;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 12px;
        }

        .author-card {
            margin-top: 60px;
            padding: 32px;
            background: linear-gradient(135deg, var(--vscode-button-background) 0%, #8b5cf6 100%);
            color: var(--vscode-button-foreground);
            border-radius: 12px;
            text-align: center;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        }

        .author-card h3 {
            margin-bottom: 8px;
            font-size: 20px;
        }

        .author-card p {
            opacity: 0.9;
            margin-bottom: 16px;
        }

        .author-card a {
            color: #fbbf24;
            text-decoration: none;
            font-weight: 600;
            margin: 0 10px;
            transition: opacity 0.2s;
        }

        .author-card a:hover {
            text-decoration: underline;
            opacity: 0.8;
        }

        .version-badge {
            display: inline-block;
            padding: 4px 12px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            margin-left: 12px;
            vertical-align: middle;
        }
    </style>
</head>
<body>
    <h1>⚡ StackerClient <span class="version-badge">v1.0.0</span></h1>
    <p class="subtitle">Modern REST API Client for VS Code, Cursor & Antigravity IDE</p>
    
    <h2>🚀 Quick Start</h2>
    <div class="feature">
        <h3>Keyboard Shortcut</h3>
        <p>Press <code>Ctrl+Shift+R</code> (Mac: <code>Cmd+Shift+R</code>) to open StackerClient instantly.</p>
    </div>
    
    <h2>✨ Features</h2>
    <div class="grid">
        <div class="feature">
            <h3>🌐 Send HTTP Requests</h3>
            <p>Support for GET, POST, PUT, PATCH, DELETE methods with custom headers and body.</p>
        </div>
        <div class="feature">
            <h3>🔐 Authentication</h3>
            <p>Built-in support for Bearer tokens, Basic Auth, and API Keys. Save tokens securely for reuse.</p>
        </div>
        <div class="feature">
            <h3>💾 Request History</h3>
            <p>Save and organize your requests. Filter by name, URL, or method.</p>
        </div>
        <div class="feature">
            <h3>📥 Import cURL</h3>
            <p>Paste any cURL command to automatically convert it to a StackerClient request.</p>
        </div>
        <div class="feature">
            <h3>🌍 Environments</h3>
            <p>Manage multiple environments and variables for easy testing across different stages.</p>
        </div>
        <div class="feature">
            <h3>📁 Collections</h3>
            <p>Organize your requests into folders and share them with your team.</p>
        </div>
    </div>
    
    <div class="author-card">
        <h3>Created by Insya - Yasin Kuyu</h3>
        <p>Building tools for developers with ❤️</p>
        <div class="links">
            <a href="https://insya.com">Website</a>
            <a href="https://github.com/yasinkuyu">GitHub</a>
            <a href="https://twitter.com/yasinkuyu">Twitter</a>
        </div>
    </div>
</body>
</html>`;
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
    panel.iconPath = new vscode.ThemeIcon('debug-alt');
    panel.webview.html = getWebviewContent();

    // Setup message handlers for this independent panel
    panel.webview.onDidReceiveMessage(async (message) => {
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
                // Update panel title based on URL/method
                if (message.url) {
                    try {
                        const url = new URL(message.url);
                        const path = url.pathname || '/';
                        panel.title = `#${nextRequestNumber} ${message.method} ${path}`;
                    } catch {
                        panel.title = `#${nextRequestNumber} ${message.method} ${message.url.substring(0, 30)}`;
                    }
                } else {
                    panel.title = `#${nextRequestNumber} StackerClient`;
                }
                break;
        }
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

        // Auto-save if enabled
        const settings = getSettings();
        if (settings.autoSaveRequests && requestManager) {
            const savedRequest: SavedRequest = {
                id: Date.now().toString(),
                name: request.name || new URL(request.url).pathname || 'Untitled',
                method: request.method,
                url: request.url,
                headers: request.headers || [],
                contentType: request.contentType,
                body: request.body || ''
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
        theme: config.get<string>('theme', 'auto')
    };
}

// Environment variable interpolation - replaces {{variable}} with actual values
function interpolateEnvironmentVariables(text: string, variables: Array<{ key: string, value: string, enabled: boolean }>): string {
    if (!text || !variables || variables.length === 0) {
        return text;
    }

    let result = text;
    const enabledVars = variables.filter(v => v.enabled !== false);

    for (const variable of enabledVars) {
        const pattern = new RegExp(`\\{\\{\\s*${variable.key}\\s*\\}\\}`, 'g');
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
    const interpolatedUrl = interpolateEnvironmentVariables(request.url, envVariables);
    const interpolatedBody = request.body ? interpolateEnvironmentVariables(request.body, envVariables) : '';

    const headers: Record<string, string> = {};

    // Add default headers from settings
    if (settings.defaultHeaders && settings.defaultHeaders.length > 0) {
        settings.defaultHeaders.forEach((h: any) => {
            if (h.key && h.value) {
                const interpolatedKey = interpolateEnvironmentVariables(h.key, envVariables);
                const interpolatedValue = interpolateEnvironmentVariables(h.value, envVariables);
                headers[interpolatedKey] = interpolatedValue;
            }
        });
    }

    // Add request-specific headers (override defaults)
    if (request.headers && Array.isArray(request.headers)) {
        request.headers.forEach((h: any) => {
            if (h.key && h.value) {
                const interpolatedKey = interpolateEnvironmentVariables(h.key, envVariables);
                const interpolatedValue = interpolateEnvironmentVariables(h.value, envVariables);
                headers[interpolatedKey] = interpolatedValue;
            }
        });
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

    // Handle SSL validation (Node.js 18+ fetch doesn't support agent directly,
    // but we set the environment variable as a fallback hint)
    if (!settings.validateSSL) {
        // Note: Modern Node.js fetch may require undici dispatcher for this
        // For now, we set NODE_TLS_REJECT_UNAUTHORIZED as a hint
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    } else {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
    }

    // Handle proxy (if enabled and configured)
    if (settings.proxyEnabled && settings.proxyUrl) {
        // Set proxy via environment variable for fetch to use
        // Note: Node.js native fetch doesn't support proxy directly,
        // but we can hint the user or use undici dispatcher in future
        console.log(`Proxy configured: ${settings.proxyUrl}`);
    }

    if (interpolatedBody && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
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

    const startTime = Date.now();

    try {
        const response = await fetch(interpolatedUrl, fetchOptions);
        clearTimeout(timeout);

        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
        });

        let responseBody: any;
        const responseText = await response.text();

        // Check response size
        if (responseText.length > settings.responseMaxSize) {
            responseBody = `Response too large (${(responseText.length / 1024 / 1024).toFixed(2)} MB). Max size: ${(settings.responseMaxSize / 1024 / 1024).toFixed(2)} MB`;
        } else {
            const contentType = response.headers.get('content-type') || '';

            if (contentType.includes('application/json')) {
                try {
                    responseBody = JSON.parse(responseText);
                    if (settings.prettyPrintResponse && typeof responseBody === 'object') {
                        responseBody = responseBody; // Will be formatted in webview
                    }
                } catch {
                    responseBody = responseText;
                }
            } else {
                responseBody = responseText;
            }
        }

        return {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
            body: responseBody,
            time: Date.now() - startTime,
            size: responseText.length,
            interpolatedUrl: interpolatedUrl !== request.url ? interpolatedUrl : undefined
        };
    } catch (error: any) {
        clearTimeout(timeout);
        if (error.name === 'AbortError') {
            throw new Error(`Request timeout (${timeoutMs / 1000}s)`);
        }
        throw error;
    }
}

