import * as vscode from 'vscode';
import { RequestManager, SavedRequest } from './RequestManager';
import { SidebarProvider } from './SidebarProvider';

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
        currentPanel.webview.html = getWebviewContent(currentPanel.webview);

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

                // Panel yoksa aç
                if (!currentPanel) {
                    vscode.commands.executeCommand('stacker.open');
                    // Panel oluşana kadar bekle (max 1 saniye)
                    let attempts = 0;
                    while (!currentPanel && attempts < 100) {
                        await new Promise(r => setTimeout(r, 10));
                        attempts++;
                    }
                }

                // Panel hazırsa gönder - importCurl flag'i ile query tab'ını otomatik aç
                if (currentPanel) {
                    currentPanel.webview.postMessage({
                        command: 'importCurl',
                        request: request
                    });
                }
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
    const methodMatch = cmd.match(/-(?:X|request)\s+['"]?(\w+)['"]?/i);
    if (methodMatch) {
        request.method = methodMatch[1].toUpperCase();
    }

    // Parse headers (-H or --header) - handle both single and double quotes
    // Pattern: -H 'Header: Value' or -H "Header: Value" or --header 'Header: Value'
    const headerPatterns = [
        /-(?:H|header)\s+'([^']+)'/gi,
        /-(?:H|header)\s+"([^"]+)"/gi,
        /--header\s+'([^']+)'/gi,
        /--header\s+"([^"]+)"/gi
    ];

    for (const pattern of headerPatterns) {
        let match;
        while ((match = pattern.exec(cmd)) !== null) {
            const headerStr = match[1];
            const colonIndex = headerStr.indexOf(':');
            if (colonIndex > 0) {
                const key = headerStr.substring(0, colonIndex).trim();
                const value = headerStr.substring(colonIndex + 1).trim();

                // Avoid duplicate headers
                const existing = request.headers.find((h: any) => h.key.toLowerCase() === key.toLowerCase());
                if (!existing) {
                    request.headers.push({ key, value });
                }

                if (key.toLowerCase() === 'content-type') {
                    request.contentType = value.split(';')[0].trim(); // Handle "application/json; charset=utf-8"
                }
            }
        }
    }

    // Parse data (-d, --data, --data-raw, --data-binary, --data-urlencode)
    const dataPatterns = [
        /-(?:d|data|data-raw|data-binary)\s+'([^']+)'/i,
        /-(?:d|data|data-raw|data-binary)\s+"([^"]+)"/i,
        /--data-urlencode\s+'([^']+)'/i,
        /--data-urlencode\s+"([^"]+)"/i,
        /-d\s+(\{[^}]+\})/i,  // Handle unquoted JSON: -d {key:value}
        /--data\s+(\{[^}]+\})/i
    ];

    for (const pattern of dataPatterns) {
        const dataMatch = cmd.match(pattern);
        if (dataMatch) {
            request.body = dataMatch[1];
            if (request.method === 'GET') {
                request.method = 'POST';
            }
            break;
        }
    }

    // Also try to capture $'...' style strings (bash)
    const bashDataMatch = cmd.match(/-(?:d|data|data-raw)\s+\$'([^']+)'/);
    if (bashDataMatch && !request.body) {
        request.body = bashDataMatch[1].replace(/\\'/g, "'").replace(/\\n/g, '\n');
        if (request.method === 'GET') {
            request.method = 'POST';
        }
    }

    // Parse URL - handle various positions and quote styles
    // First try quoted URLs
    let urlMatch = cmd.match(/['"]?(https?:\/\/[^\s'"]+)['"]?/);
    if (!urlMatch) {
        // Try URL at the end without quotes
        urlMatch = cmd.match(/(https?:\/\/[^\s]+)$/);
    }
    if (!urlMatch) {
        // Try URL anywhere
        urlMatch = cmd.match(/(https?:\/\/[^\s'"\\]+)/);
    }

    if (urlMatch) {
        // Clean URL - remove trailing quotes or special chars
        let cleanUrl = urlMatch[1].replace(/['"]$/, '').replace(/\\$/, '');

        // Parse query parameters
        try {
            const urlObj = new URL(cleanUrl);
            const queryParams: Array<{ key: string, value: string }> = [];

            urlObj.searchParams.forEach((value, key) => {
                queryParams.push({ key, value });
            });

            if (queryParams.length > 0) {
                request.queryParams = queryParams;
                // Remove query string from URL for display
                urlObj.search = '';
                cleanUrl = urlObj.toString();
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
    const authMatch = cmd.match(/-(?:u|user)\s+['"]?([^'"\s]+)['"]?/i);
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
function createNewPanel(requestManager: RequestManager, context: vscode.ExtensionContext) {
    const panel = vscode.window.createWebviewPanel(
        'stackerClient',
        '⚡ New Request',
        vscode.ViewColumn.One,
        { enableScripts: true, retainContextWhenHidden: true }
    );
    panel.iconPath = new vscode.ThemeIcon('debug-alt');
    panel.webview.html = getWebviewContent(panel.webview);
    
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
        }
    });
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

function getWebviewContent(webview: vscode.Webview): string {
    const headersJson = JSON.stringify(COMMON_HEADERS);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
    <title>StackerClient</title>
    <style>
        :root {
            /* VS Code/Cursor Native CSS Variables */
            --vscode-font-family: -apple-system, BlinkMacSystemFont, "Segoe WPC", "Segoe UI", "Ubuntu", "Droid Sans", sans-serif;
            --vscode-font-size: 13px;
            --vscode-font-weight: 400;
            --vscode-foreground: #cccccc;
            --vscode-disabledForeground: rgba(204, 204, 204, 0.5);
            --vscode-errorForeground: #f48771;
            --vscode-descriptionForeground: rgba(204, 204, 204, 0.7);
            --vscode-focusBorder: #007fd4;
            
            --vscode-editor-background: #1e1e1e;
            --vscode-editor-foreground: #d4d4d4;
            
            --vscode-input-background: #3c3c3c;
            --vscode-input-foreground: #cccccc;
            --vscode-input-border: #3c3c3c;
            --vscode-input-placeholderForeground: rgba(204, 204, 204, 0.5);
            
            --vscode-button-background: #0e639c;
            --vscode-button-foreground: #ffffff;
            --vscode-button-hoverBackground: #1177bb;
            --vscode-button-secondaryBackground: #3a3d41;
            --vscode-button-secondaryForeground: #ffffff;
            --vscode-button-secondaryHoverBackground: #45494e;
            
            --vscode-dropdown-background: #3c3c3c;
            --vscode-dropdown-foreground: #f0f0f0;
            --vscode-dropdown-border: #3c3c3c;
            
            --vscode-list-activeSelectionBackground: #094771;
            --vscode-list-activeSelectionForeground: #ffffff;
            --vscode-list-hoverBackground: #2a2d2e;
            --vscode-list-highlightForeground: #18a3ff;
            
            --vscode-panel-background: #1e1e1e;
            --vscode-panel-border: #80808059;
            
            --vscode-tab-activeBackground: #1e1e1e;
            --vscode-tab-inactiveBackground: #2d2d2d;
            --vscode-tab-activeForeground: #ffffff;
            --vscode-tab-inactiveForeground: rgba(255, 255, 255, 0.5);
            --vscode-tab-activeBorderTop: #007acc;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            font-weight: var(--vscode-font-weight);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            line-height: 1.4;
            padding: 12px 16px;
        }

        /* URL Bar */
        .url-bar {
            display: flex;
            gap: 0;
            margin-bottom: 12px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            overflow: hidden;
        }

        .method-select {
            background: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border: none;
            border-right: 1px solid var(--vscode-panel-border);
            padding: 8px 28px 8px 12px;
            font-size: 13px;
            font-family: var(--vscode-font-family);
            cursor: pointer;
            appearance: none;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23cccccc' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: right 8px center;
            min-width: 90px;
        }

        .method-select:focus {
            outline: none;
            background-color: var(--vscode-list-activeSelectionBackground);
        }

        .url-input {
            flex: 1;
            background: transparent;
            color: var(--vscode-input-foreground);
            border: none;
            padding: 8px 12px;
            font-size: 13px;
            font-family: var(--vscode-font-family);
        }

        .url-input:focus {
            outline: none;
        }

        .url-input::placeholder {
            color: var(--vscode-input-placeholderForeground);
        }

        .send-btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 20px;
            font-size: 13px;
            font-family: var(--vscode-font-family);
            cursor: pointer;
            font-weight: 500;
        }

        .send-btn:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .send-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .save-btn {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            padding: 8px 16px;
            font-size: 13px;
            font-family: var(--vscode-font-family);
            cursor: pointer;
            border-left: 1px solid var(--vscode-panel-border);
        }

        .save-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        /* Tabs */
        .tabs {
            display: flex;
            gap: 0;
            background: var(--vscode-tab-inactiveBackground);
            border-bottom: 1px solid var(--vscode-panel-border);
            padding: 0 8px;
        }

        .tab {
            padding: 8px 16px;
            cursor: pointer;
            border: none;
            background: transparent;
            color: var(--vscode-tab-inactiveForeground);
            font-size: 12px;
            font-family: var(--vscode-font-family);
            border-bottom: 2px solid transparent;
        }

        .tab:hover {
            color: var(--vscode-tab-activeForeground);
            background: var(--vscode-list-hoverBackground);
        }

        .tab.active {
            color: var(--vscode-tab-activeForeground);
            border-bottom-color: var(--vscode-tab-activeBorderTop);
            background: var(--vscode-tab-activeBackground);
        }

        .tab-content {
            display: none;
            background: var(--vscode-panel-background);
            padding: 16px;
            border: 1px solid var(--vscode-panel-border);
            border-top: none;
        }

        .tab-content.active {
            display: block;
        }

        .section-title {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 8px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        /* Auth Section */
        .auth-section {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 12px;
            margin-bottom: 16px;
        }

        .auth-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }

        .auth-title {
            font-size: 12px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }

        .auth-actions {
            display: flex;
            gap: 8px;
        }

        .auth-btn {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            padding: 4px 10px;
            font-size: 11px;
            font-family: var(--vscode-font-family);
            cursor: pointer;
            border-radius: 3px;
        }

        .auth-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        .token-list {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .token-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 6px 8px;
            background: var(--vscode-editor-background);
            border-radius: 3px;
            font-size: 12px;
        }

        .token-name {
            color: var(--vscode-foreground);
        }

        .token-actions {
            display: flex;
            gap: 4px;
        }

        .token-action-btn {
            background: transparent;
            color: var(--vscode-foreground);
            border: none;
            padding: 2px 6px;
            font-size: 11px;
            cursor: pointer;
            opacity: 0.7;
        }

        .token-action-btn:hover {
            opacity: 1;
            background: var(--vscode-list-hoverBackground);
            border-radius: 3px;
        }

        /* Header Row - Unified Style */
        .key-value-row {
            display: flex;
            align-items: center;
            gap: 0;
            margin-bottom: 6px;
            position: relative;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            overflow: hidden;
            padding-left: 28px;
        }

        .key-value-row:focus-within {
            border-color: var(--vscode-focusBorder);
        }

        .key-value-row input {
            background: transparent;
            color: var(--vscode-input-foreground);
            border: none;
            padding: 6px 10px;
            font-size: 13px;
            font-family: var(--vscode-font-family);
            height: 28px;
        }

        .key-value-row input:focus {
            outline: none;
        }

        .row-checkbox {
            position: absolute;
            left: 6px;
            top: 50%;
            transform: translateY(-50%);
            margin: 0;
            cursor: pointer;
            width: 16px;
            height: 16px;
            accent-color: #8b5cf6;
        }

        .header-key {
            flex: 1;
            min-width: 140px;
            border-right: 1px solid var(--vscode-panel-border);
        }

        .header-value {
            flex: 1.5;
        }

        .btn-remove {
            background: transparent;
            color: var(--vscode-foreground);
            border: none;
            border-left: 1px solid var(--vscode-panel-border);
            padding: 0 10px;
            cursor: pointer;
            font-size: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0.6;
            transition: all 0.1s;
            width: 32px;
        }

        .btn-remove:hover {
            opacity: 1;
            background: var(--vscode-errorForeground);
            color: white;
        }

        .btn-small {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            padding: 4px 12px;
            font-size: 12px;
            font-family: var(--vscode-font-family);
            cursor: pointer;
            border-radius: 3px;
            margin-top: 8px;
        }

        .btn-small:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        /* Autocomplete */
        .autocomplete-container {
            position: relative;
            flex: 1;
        }

        .autocomplete-list {
            position: absolute;
            top: calc(100% + 2px);
            left: 0;
            right: 0;
            max-height: 200px;
            overflow-y: auto;
            background: var(--vscode-dropdown-background);
            border: 1px solid var(--vscode-focusBorder);
            border-radius: 4px;
            z-index: 9999;
            display: none;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            margin-top: 2px;
        }

        .autocomplete-list.visible {
            display: block;
        }

        .autocomplete-item {
            padding: 8px 12px;
            cursor: pointer;
            font-size: 13px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .autocomplete-item:last-child {
            border-bottom: none;
        }

        .autocomplete-item:hover,
        .autocomplete-item.selected {
            background: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }

        .autocomplete-item .header-name {
            font-weight: 500;
            color: var(--vscode-foreground);
        }

        .autocomplete-item .header-desc {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-left: 12px;
        }

        textarea {
            width: 100%;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            padding: 10px;
            font-size: 13px;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            resize: vertical;
            min-height: 180px;
        }

        textarea:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }

        .content-type-select {
            background: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            padding: 5px 28px 5px 8px;
            font-size: 13px;
            font-family: var(--vscode-font-family);
            margin-bottom: 12px;
            appearance: none;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23cccccc' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: right 8px center;
            cursor: pointer;
        }

        /* Response Panel */
        .response {
            background: var(--vscode-panel-background);
            border: 1px solid var(--vscode-panel-border);
            margin-top: 16px;
            display: none;
        }

        .response-tabs {
            display: flex;
            background: var(--vscode-tab-inactiveBackground);
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .res-tab {
            padding: 8px 16px;
            background: transparent;
            color: var(--vscode-tab-inactiveForeground);
            border: none;
            cursor: pointer;
            font-size: 12px;
            border-bottom: 2px solid transparent;
        }

        .res-tab:hover {
            color: var(--vscode-tab-activeForeground);
        }

        .res-tab.active {
            color: var(--vscode-tab-activeForeground);
            border-bottom-color: var(--vscode-focusBorder);
        }

        .response-content {
            max-height: calc(100vh - 400px);
            min-height: 200px;
            overflow: auto;
        }

        .res-tab-content {
            display: none;
            padding: 16px;
        }

        .res-tab-content.active {
            display: block;
        }

        .response-body, .pre-headers {
            margin: 0;
            white-space: pre-wrap;
            word-break: break-word;
            overflow: auto;
        }

        .row-checkbox {
            margin-right: 8px;
            cursor: pointer;
        }

        .response-header {
            display: flex;
            gap: 16px;
            padding: 10px 16px;
            background: var(--vscode-tab-inactiveBackground);
            border-bottom: 1px solid var(--vscode-panel-border);
            font-size: 12px;
            align-items: center;
        }

        .response-status {
            padding: 2px 8px;
            border-radius: 3px;
            font-weight: 600;
            font-size: 11px;
        }

        .response-status.success {
            background: #238636;
            color: white;
        }

        .response-status.error {
            background: #da3633;
            color: white;
        }

        .response-body {
            padding: 16px;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            white-space: pre-wrap;
            word-wrap: break-word;
            max-height: 400px;
            overflow-y: auto;
            font-size: 13px;
        }

        .pre-headers {
            background: var(--vscode-input-background);
            padding: 10px;
            border-radius: 3px;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 12px;
            max-height: 120px;
            overflow-y: auto;
            margin-bottom: 12px;
            border: 1px solid var(--vscode-panel-border);
        }

        /* Saved Requests - Modern Design */
        .saved-toolbar {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            background: var(--vscode-sideBar-background);
        }

        .saved-search {
            flex: 1;
            position: relative;
        }

        .saved-search .search-icon {
            position: absolute;
            left: 10px;
            top: 50%;
            transform: translateY(-50%);
            opacity: 0.5;
            pointer-events: none;
        }

        .saved-search-input {
            width: 100%;
            padding: 6px 10px 6px 32px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            color: var(--vscode-input-foreground);
            font-size: 13px;
            outline: none;
        }

        .saved-search-input:focus {
            border-color: #8b5cf6;
        }

        .saved-stats {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            white-space: nowrap;
        }

        .saved-requests-list {
            max-height: 400px;
            overflow-y: auto;
            padding: 8px;
        }

        .saved-request-item {
            padding: 10px 12px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            margin-bottom: 6px;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 8px;
            transition: all 0.15s;
        }

        .saved-request-item:hover {
            background: var(--vscode-list-hoverBackground);
            border-color: var(--vscode-focusBorder);
        }

        .saved-req-main {
            flex: 1;
            min-width: 0;
            cursor: pointer;
        }

        .saved-req-id {
            font-size: 11px;
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
            opacity: 0.6;
            min-width: 28px;
            text-align: center;
            padding-top: 2px;
        }

        .saved-req-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 4px;
        }

        .saved-req-header .method {
            font-weight: 600;
            min-width: 38px;
            padding: 2px 5px;
            border-radius: 3px;
            text-align: center;
            font-size: 10px;
            text-transform: uppercase;
        }

        .method-get { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
        .method-post { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
        .method-put { background: rgba(234, 179, 8, 0.15); color: #eab308; }
        .method-patch { background: rgba(168, 85, 247, 0.15); color: #a855f7; }
        .method-delete { background: rgba(239, 68, 68, 0.15); color: #ef4444; }

        .saved-req-name {
            flex: 1;
            font-weight: 500;
            font-size: 13px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            color: var(--vscode-foreground);
        }

        .saved-req-time {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            opacity: 0.7;
        }

        .saved-req-url {
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            padding-left: 46px;
        }

        .saved-req-delete {
            background: transparent;
            border: none;
            color: var(--vscode-foreground);
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            opacity: 0.4;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .saved-req-delete:hover {
            opacity: 1;
            background: rgba(239, 68, 68, 0.15);
            color: #ef4444;
        }

        /* Pagination */
        .pagination {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            padding: 10px;
            border-top: 1px solid var(--vscode-panel-border);
            background: var(--vscode-sideBar-background);
        }

        .page-btn {
            background: var(--vscode-button-secondaryBackground);
            border: 1px solid var(--vscode-panel-border);
            color: var(--vscode-button-secondaryForeground);
            padding: 6px 10px;
            border-radius: 4px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0.8;
            transition: all 0.15s;
        }

        .page-btn:hover:not(:disabled) {
            opacity: 1;
            background: var(--vscode-button-secondaryHoverBackground);
        }

        .page-btn:disabled {
            opacity: 0.3;
            cursor: not-allowed;
        }

        .page-info {
            font-size: 12px;
            color: var(--vscode-foreground);
            min-width: 50px;
            text-align: center;
        }

        .empty-state {
            text-align: center;
            padding: 40px 20px;
            color: var(--vscode-descriptionForeground);
        }

        .spinner {
            display: inline-block;
            width: 12px;
            height: 12px;
            border: 2px solid rgba(255,255,255,0.3);
            border-radius: 50%;
            border-top-color: white;
            animation: spin 0.8s linear infinite;
            margin-right: 6px;
        }

        .spinner-small {
            display: inline-block;
            width: 10px;
            height: 10px;
            border: 2px solid rgba(255,255,255,0.3);
            border-radius: 50%;
            border-top-color: white;
            animation: spin 0.8s linear infinite;
            margin-right: 6px;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .toast {
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 20px;
            background: var(--vscode-input-background);
            color: var(--vscode-foreground);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.4);
            opacity: 0;
            transform: translateY(20px);
            transition: all 0.2s ease;
            z-index: 10000;
        }

        .toast.show {
            opacity: 1;
            transform: translateY(0);
        }

        .hidden {
            display: none !important;
        }

        /* Theme overrides for forced light/dark mode */
        body.theme-light {
            --vscode-foreground: #333333;
            --vscode-editor-background: #ffffff;
            --vscode-input-background: #f5f5f5;
            --vscode-input-foreground: #333333;
            --vscode-panel-background: #ffffff;
            --vscode-panel-border: #e0e0e0;
            --vscode-tab-inactiveBackground: #f5f5f5;
            --vscode-tab-activeBackground: #ffffff;
            --vscode-list-hoverBackground: #f0f0f0;
        }

        body.theme-dark {
            --vscode-foreground: #cccccc;
            --vscode-editor-background: #1e1e1e;
            --vscode-input-background: #3c3c3c;
            --vscode-input-foreground: #cccccc;
            --vscode-panel-background: #1e1e1e;
            --vscode-panel-border: #404040;
            --vscode-tab-inactiveBackground: #2d2d2d;
            --vscode-tab-activeBackground: #1e1e1e;
            --vscode-list-hoverBackground: #2a2d2e;
        }

        /* Environment variable highlight hint */
        .env-hint {
            font-size: 10px;
            color: #a78bfa;
            margin-top: 4px;
            display: none;
        }

        .env-hint.visible {
            display: block;
        }
    </style>
</head>
<body>
    <!-- Active Environment Indicator -->
    <div id="envIndicator" class="env-indicator" style="display:none;padding:6px 12px;background:rgba(34,197,94,0.1);border-radius:4px;margin-bottom:8px;font-size:11px;color:#22c55e;">
        <span style="opacity:0.7;">Active Environment:</span> <strong id="envName"></strong>
    </div>

    <!-- URL Bar -->
    <div class="url-bar">
        <select id="method" class="method-select">
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
        </select>
        <input type="text" id="url" class="url-input" placeholder="https://api.example.com/{{endpoint}} (use {{var}} for env variables)">
        <button id="sendBtn" class="send-btn">Send</button>
        <button id="saveBtn" class="save-btn">Save</button>
    </div>

    <!-- Tabs -->
    <div class="tabs">
        <button class="tab active" data-tab="headers">Headers</button>
        <button class="tab" data-tab="query">Query</button>
        <button class="tab" data-tab="body">Body</button>
        <button class="tab" data-tab="auth">Auth</button>
        <button class="tab" data-tab="saved">Saved</button>
    </div>

    <!-- Headers Tab -->
    <div id="headersTab" class="tab-content active">
        <div class="section-title">
            Request Headers
            <span style="font-size: 11px; color: var(--vscode-descriptionForeground); font-weight: normal;">
                Type to see suggestions
            </span>
        </div>
        <div id="headersContainer"></div>
        <button id="addHeaderBtn" class="btn-small">+ Add Header</button>
    </div>

    <!-- Query Tab -->
    <div id="queryTab" class="tab-content">
        <div class="section-title">
            Query Parameters
            <span style="font-size: 11px; color: var(--vscode-descriptionForeground); font-weight: normal;">
                URL query string parameters
            </span>
        </div>
        <div id="queryContainer"></div>
        <button id="addQueryBtn" class="btn-small">+ Add Parameter</button>
    </div>

    <!-- Body Tab -->
    <div id="bodyTab" class="tab-content">
        <div class="section-title">Content Type</div>
        <select id="contentType" class="content-type-select">
            <option value="application/json">application/json</option>
            <option value="text/plain">text/plain</option>
            <option value="application/x-www-form-urlencoded">application/x-www-form-urlencoded</option>
            <option value="multipart/form-data">multipart/form-data</option>
        </select>
        <div class="section-title">Request Body</div>
        <textarea id="bodyInput" placeholder='{"key": "{{value}}"} (use {{var}} for env variables)'></textarea>
    </div>

    <!-- Auth Tab -->
    <div id="authTab" class="tab-content">
        <div class="section-title">Authorization</div>
        <div class="auth-section">
            <div class="auth-header">
                <span class="auth-title">Quick Add</span>
            </div>
            <button class="auth-btn" onclick="addAuthHeader('Bearer', 'Bearer token')">+ Bearer Token</button>
            <button class="auth-btn" onclick="addAuthHeader('Basic', 'Basic credentials')">+ Basic Auth</button>
            <button class="auth-btn" onclick="addAuthHeader('API Key', 'API key')">+ API Key</button>
        </div>
        
        <div class="section-title">Saved Tokens</div>
        <div id="tokenList" class="token-list">
            <div class="empty-state">No saved tokens. Use Command Palette to add tokens.</div>
        </div>
    </div>

    <!-- Saved Tab -->
    <div id="savedTab" class="tab-content">
        <div class="saved-toolbar">
            <div class="saved-search">
                <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input type="text" id="savedFilterInput" class="saved-search-input" placeholder="Search saved requests...">
            </div>
            <div class="saved-stats" id="savedStats"></div>
        </div>
        <div id="savedRequestsContainer" class="saved-requests-list">
            <div class="empty-state">No saved requests yet</div>
        </div>
        <div class="pagination" id="pagination" style="display: none;">
            <button class="page-btn" id="prevPage" onclick="changePage(-1)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
            </button>
            <span class="page-info" id="pageInfo">1 / 1</span>
            <button class="page-btn" id="nextPage" onclick="changePage(1)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
            </button>
        </div>
    </div>

    <!-- Response -->
    <div id="response" class="response" style="display:none">
        <div class="response-header">
            <span>Status: <span id="responseStatus" class="response-status"></span></span>
            <span>Time: <span id="responseTime"></span></span>
        </div>
        <div class="response-tabs">
            <button class="res-tab active" onclick="showResTab('resBody')">Body</button>
            <button class="res-tab" onclick="showResTab('resHeaders')">Headers</button>
            <button class="res-tab" onclick="showResTab('resCookies')">Cookies</button>
        </div>
        <div class="response-content">
            <div id="resBody" class="res-tab-content active">
                <pre id="responseBody" class="response-body"></pre>
            </div>
            <div id="resHeaders" class="res-tab-content">
                <pre id="responseHeaders" class="pre-headers"></pre>
            </div>
            <div id="resCookies" class="res-tab-content">
                <pre id="responseCookies" class="pre-headers">No cookies</pre>
            </div>
        </div>
    </div>

    <div id="toast" class="toast"></div>

    <script>
        const vscode = acquireVsCodeApi();
        const COMMON_HEADERS = ${headersJson};
        let savedRequests = [];
        let authTokens = {};
        let isLoading = false;

        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(tab.dataset.tab + 'Tab').classList.add('active');
            });
        });

        function addAuthHeader(type, desc) {
            let key = 'Authorization';
            let value = '';
            
            switch(type) {
                case 'Bearer':
                    value = 'Bearer ';
                    break;
                case 'Basic':
                    value = 'Basic ';
                    break;
                case 'API Key':
                    key = 'X-API-Key';
                    break;
            }
            
            addHeaderRow(key, value);
            
            // Switch to headers tab
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.querySelector('[data-tab="headers"]').classList.add('active');
            document.getElementById('headersTab').classList.add('active');
            
            showToast(type + ' header added. Paste your token.');
        }

        function createAutocompleteInput(placeholder, onSelect) {
            const container = document.createElement('div');
            container.className = 'autocomplete-container';
            
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = placeholder;
            input.className = 'header-key';
            
            const list = document.createElement('div');
            list.className = 'autocomplete-list';
            
            container.appendChild(input);
            container.appendChild(list);
            
            let selectedIndex = -1;
            let filtered = [];
            
            input.addEventListener('input', () => {
                const value = input.value.toLowerCase();
                list.innerHTML = '';
                selectedIndex = -1;
                
                if (value.length < 1) {
                    list.classList.remove('visible');
                    return;
                }
                
                filtered = COMMON_HEADERS.filter(h => 
                    h.key.toLowerCase().includes(value) || 
                    h.value.toLowerCase().includes(value)
                );
                
                const uniqueKeys = [...new Set(filtered.map(h => h.key))];
                const uniqueHeaders = uniqueKeys.map(key => filtered.find(h => h.key === key));
                filtered = uniqueHeaders.slice(0, 8);
                
                filtered.forEach((item, index) => {
                    const div = document.createElement('div');
                    div.className = 'autocomplete-item';
                    div.innerHTML = \`
                        <span class="header-name">\${escapeHtml(item.key)}</span>
                        <span class="header-desc">\${escapeHtml(item.desc)}</span>
                    \`;
                    div.addEventListener('click', () => {
                        input.value = item.key;
                        onSelect(item);
                        list.classList.remove('visible');
                    });
                    list.appendChild(div);
                });
                
                if (filtered.length > 0) {
                    list.classList.add('visible');
                } else {
                    list.classList.remove('visible');
                }
            });
            
            input.addEventListener('keydown', (e) => {
                if (!list.classList.contains('visible')) return;
                
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    selectedIndex = (selectedIndex + 1) % filtered.length;
                    updateSelection();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    selectedIndex = selectedIndex <= 0 ? filtered.length - 1 : selectedIndex - 1;
                    updateSelection();
                } else if (e.key === 'Enter' && selectedIndex >= 0) {
                    e.preventDefault();
                    const item = filtered[selectedIndex];
                    input.value = item.key;
                    onSelect(item);
                    list.classList.remove('visible');
                } else if (e.key === 'Escape') {
                    list.classList.remove('visible');
                }
            });
            
            document.addEventListener('click', (e) => {
                if (!container.contains(e.target)) {
                    list.classList.remove('visible');
                }
            });
            
            function updateSelection() {
                const items = list.querySelectorAll('.autocomplete-item');
                items.forEach((item, index) => {
                    item.classList.toggle('selected', index === selectedIndex);
                });
            }
            
            return { container, input };
        }

        function addHeaderRow(key = '', value = '', checked = true) {
            const container = document.getElementById('headersContainer');
            const row = document.createElement('div');
            row.className = 'key-value-row';
            
            // Checkbox
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'row-checkbox';
            checkbox.checked = checked;
            checkbox.title = 'Enable/Disable header';
            checkbox.addEventListener('change', () => {
                row.style.opacity = checkbox.checked ? '1' : '0.5';
                keyInput.disabled = !checkbox.checked;
                valueInput.disabled = !checkbox.checked;
            });
            
            const { container: keyContainer, input: keyInput } = createAutocompleteInput('Header', (item) => {
                valueInput.value = item.value;
            });
            keyContainer.className = 'autocomplete-container';
            keyContainer.style.flex = '1';
            keyInput.value = key;
            keyInput.className = 'header-key';
            if (!checked) keyInput.disabled = true;
            
            const valueInput = document.createElement('input');
            valueInput.type = 'text';
            valueInput.placeholder = 'Value';
            valueInput.className = 'header-value';
            valueInput.value = value;
            if (!checked) valueInput.disabled = true;
            
            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn-remove';
            removeBtn.innerHTML = '×';
            removeBtn.title = 'Remove header';
            removeBtn.addEventListener('click', () => row.remove());
            
            row.appendChild(checkbox);
            row.appendChild(keyContainer);
            row.appendChild(valueInput);
            row.appendChild(removeBtn);
            container.appendChild(row);
            
            keyInput.focus();
        }

        function addQueryRow(key = '', value = '', checked = true) {
            const container = document.getElementById('queryContainer');
            const row = document.createElement('div');
            row.className = 'key-value-row';
            
            // Checkbox
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'row-checkbox';
            checkbox.checked = checked;
            checkbox.title = 'Enable/Disable parameter';
            checkbox.addEventListener('change', () => {
                row.style.opacity = checkbox.checked ? '1' : '0.5';
                keyInput.disabled = !checkbox.checked;
                valueInput.disabled = !checkbox.checked;
            });
            
            const keyInput = document.createElement('input');
            keyInput.type = 'text';
            keyInput.placeholder = 'Parameter name';
            keyInput.className = 'query-key';
            keyInput.value = key;
            keyInput.style.flex = '1';
            if (!checked) keyInput.disabled = true;
            
            const valueInput = document.createElement('input');
            valueInput.type = 'text';
            valueInput.placeholder = 'Value';
            valueInput.className = 'query-value';
            valueInput.value = value;
            valueInput.style.flex = '1.5';
            if (!checked) valueInput.disabled = true;
            
            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn-remove';
            removeBtn.innerHTML = '×';
            removeBtn.title = 'Remove parameter';
            removeBtn.addEventListener('click', () => row.remove());
            
            row.appendChild(checkbox);
            row.appendChild(keyInput);
            row.appendChild(valueInput);
            row.appendChild(removeBtn);
            container.appendChild(row);
            
            keyInput.focus();
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        document.getElementById('addHeaderBtn').addEventListener('click', () => addHeaderRow());
        document.getElementById('addQueryBtn').addEventListener('click', () => addQueryRow());

        function showToast(message) {
            const toast = document.getElementById('toast');
            toast.textContent = message;
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 3000);
        }

        function setLoading(loading) {
            isLoading = loading;
            const btn = document.getElementById('sendBtn');
            if (loading) {
                btn.innerHTML = '<span class="spinner"></span>Sending...';
                btn.disabled = true;
            } else {
                btn.innerHTML = 'Send';
                btn.disabled = false;
            }
        }

        function getCurrentRequest() {
            // Sadece checked olan header'ları topla
            const headerRows = document.querySelectorAll('#headersContainer .key-value-row');
            const requestHeaders = [];
            
            headerRows.forEach(row => {
                const checkbox = row.querySelector('.row-checkbox');
                if (checkbox && checkbox.checked) {
                    const keyInput = row.querySelector('.header-key');
                    const valueInput = row.querySelector('.header-value');
                    const key = keyInput?.value.trim();
                    const value = valueInput?.value.trim();
                    if (key) {
                        requestHeaders.push({ key, value });
                    }
                }
            });

            // Sadece checked olan query parametrelerini topla
            const queryRows = document.querySelectorAll('#queryContainer .key-value-row');
            const queryParams = [];
            
            queryRows.forEach(row => {
                const checkbox = row.querySelector('.row-checkbox');
                if (checkbox && checkbox.checked) {
                    const keyInput = row.querySelector('.query-key');
                    const valueInput = row.querySelector('.query-value');
                    const key = keyInput?.value.trim();
                    const value = valueInput?.value.trim();
                    if (key) {
                        queryParams.push({ key, value });
                    }
                }
            });

            // URL'e query parametrelerini ekle
            let url = document.getElementById('url').value.trim();
            // Mevcut query string'i temizle
            url = url.split('?')[0];
            if (queryParams.length > 0) {
                const queryString = queryParams.map(p => encodeURIComponent(p.key) + '=' + encodeURIComponent(p.value)).join('&');
                url = url + '?' + queryString;
            }

            return {
                method: document.getElementById('method').value,
                url: url,
                headers: requestHeaders,
                contentType: document.getElementById('contentType').value,
                body: document.getElementById('bodyInput').value,
                queryParams: queryParams
            };
        }

        document.getElementById('sendBtn').addEventListener('click', () => {
            const request = getCurrentRequest();
            
            if (!request.url) {
                showToast('Please enter a URL');
                document.getElementById('url').focus();
                return;
            }

            if (!request.url.startsWith('http://') && !request.url.startsWith('https://')) {
                showToast('URL must start with http:// or https://');
                document.getElementById('url').focus();
                return;
            }

            setLoading(true);
            vscode.postMessage({ command: 'sendRequest', request });
        });

        // Global değişken olarak mevcut request ID'sini tut
        let currentRequestId = null;
        
        // Save button
        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                const request = getCurrentRequest();
                
                if (!request.url) {
                    showToast('Please enter a URL before saving');
                    document.getElementById('url').focus();
                    return;
                }

                if (!request.url.startsWith('http://') && !request.url.startsWith('https://')) {
                    showToast('URL must start with http:// or https://');
                    document.getElementById('url').focus();
                    return;
                }

                // İsim için öneri oluştur
                let defaultName;
                try {
                    defaultName = new URL(request.url).pathname || 'root';
                } catch {
                    defaultName = 'untitled';
                }
                
                // Kullanıcıdan isim al
                vscode.postMessage({ 
                    command: 'showInputBox', 
                    prompt: 'Enter request name',
                    value: currentRequestId ? undefined : defaultName
                });
            });
        }

        // Input box yanıtı için callback
        window.handleInputBoxResponse = function(name) {
            if (name === undefined) return;
            
            const request = getCurrentRequest();
            const defaultName = request.url ? (new URL(request.url).pathname || 'root') : 'untitled';
            
            const requestToSave = {
                id: currentRequestId || Date.now().toString(),
                name: name || defaultName,
                method: request.method,
                url: request.url,
                headers: request.headers,
                contentType: request.contentType,
                body: request.body,
                queryParams: request.queryParams
            };
            
            currentRequestId = requestToSave.id;
            vscode.postMessage({ command: 'saveRequest', request: requestToSave });
            showToast(currentRequestId ? 'Request updated!' : 'Request saved!');
        };

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'response':
                    setLoading(false);
                    displayResponse(message.response);
                    break;
                case 'error':
                    setLoading(false);
                    displayError(message.error);
                    break;
                case 'requests':
                    savedRequests = message.requests || [];
                    displaySavedRequests();
                    break;
                case 'requestSaved':
                    showToast('Request saved successfully!');
                    break;
                case 'inputBoxResponse':
                    if (window.handleInputBoxResponse) {
                        window.handleInputBoxResponse(message.result);
                    }
                    break;
                case 'authTokens':
                    authTokens = message.tokens || {};
                    displayAuthTokens();
                    break;
                case 'loadRequest':
                    loadRequest(message.request);
                    break;
                case 'importCurl':
                    // Import cURL'da query parametreleri varsa query tab'ını aç
                    loadRequest(message.request, message.request.queryParams?.length > 0 ? 'query' : 'headers');
                    break;
                case 'settings':
                    applySettings(message.settings);
                    break;
                case 'activeEnvironment':
                    displayActiveEnvironment(message.environment);
                    break;
            }
        });

        function applySettings(settings) {
            // Apply default method
            if (settings.defaultMethod && !document.getElementById('url').value) {
                document.getElementById('method').value = settings.defaultMethod;
            }

            // Apply default content type
            if (settings.defaultContentType) {
                document.getElementById('contentType').value = settings.defaultContentType;
            }

            // Apply editor font size
            if (settings.editorFontSize) {
                document.getElementById('bodyInput').style.fontSize = settings.editorFontSize + 'px';
                document.getElementById('responseBody').style.fontSize = settings.editorFontSize + 'px';
            }

            // Apply word wrap
            if (settings.editorWordWrap !== undefined) {
                const wordWrapStyle = settings.editorWordWrap ? 'break-word' : 'normal';
                const whiteSpaceStyle = settings.editorWordWrap ? 'pre-wrap' : 'pre';
                document.getElementById('responseBody').style.wordWrap = wordWrapStyle;
                document.getElementById('responseBody').style.whiteSpace = whiteSpaceStyle;
            }

            // Apply theme (auto follows VS Code, light/dark force specific theme)
            if (settings.theme && settings.theme !== 'auto') {
                document.body.classList.remove('theme-light', 'theme-dark');
                document.body.classList.add('theme-' + settings.theme);
            }

            // Store for later use
            window.appSettings = settings;
        }

        function displayActiveEnvironment(env) {
            const indicator = document.getElementById('envIndicator');
            const nameEl = document.getElementById('envName');

            if (env && env.name) {
                nameEl.textContent = env.name + ' (' + env.variables.length + ' variables)';
                indicator.style.display = 'block';
                // Store variables for hints
                window.activeEnvVariables = env.variables;
            } else {
                indicator.style.display = 'none';
                window.activeEnvVariables = [];
            }
        }

        function displayAuthTokens() {
            const container = document.getElementById('tokenList');
            const names = Object.keys(authTokens);
            
            if (names.length === 0) {
                container.innerHTML = '<div class="empty-state">No saved tokens.<br>Cmd+Shift+P → "StackerClient: Manage Auth" to add</div>';
                return;
            }
            
            container.innerHTML = '';
            names.forEach(name => {
                const item = document.createElement('div');
                item.className = 'token-item';
                item.innerHTML = \`
                    <span class="token-name">\${escapeHtml(name)}</span>
                    <div class="token-actions">
                        <button class="token-action-btn" onclick="useToken('\${name}')">Use</button>
                        <button class="token-action-btn" onclick="deleteToken('\${name}')">Delete</button>
                    </div>
                \`;
                container.appendChild(item);
            });
        }

        function useToken(name) {
            const token = authTokens[name];
            if (token) {
                addHeaderRow('Authorization', 'Bearer ' + token);
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                document.querySelector('[data-tab="headers"]').classList.add('active');
                document.getElementById('headersTab').classList.add('active');
                showToast('Token "' + name + '" added to headers');
            }
        }

        function deleteToken(name) {
            vscode.postMessage({ command: 'deleteAuthToken', name: name });
        }

        // Response tab switching
        window.showResTab = function(tabName) {
            document.querySelectorAll('.res-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.res-tab-content').forEach(c => c.classList.remove('active'));
            event.target.classList.add('active');
            document.getElementById(tabName).classList.add('active');
        };

        function parseCookies(headers) {
            const cookies = [];
            const setCookieHeader = headers['set-cookie'] || headers['Set-Cookie'];
            if (setCookieHeader) {
                const cookieStrings = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
                cookieStrings.forEach(cookieStr => {
                    const parts = cookieStr.split(';');
                    const [nameValue] = parts;
                    const [name, value] = nameValue.trim().split('=');
                    const cookie = { name: name.trim(), value: value?.trim() || '' };
                    
                    parts.slice(1).forEach(part => {
                        const [attr, attrVal] = part.trim().split('=');
                        if (attr) cookie[attr.trim().toLowerCase()] = attrVal?.trim() || true;
                    });
                    
                    cookies.push(cookie);
                });
            }
            return cookies;
        }

        function displayResponse(response) {
            const responseEl = document.getElementById('response');
            responseEl.style.display = 'block';

            const statusEl = document.getElementById('responseStatus');
            statusEl.textContent = \`\${response.status} \${response.statusText}\`;
            statusEl.className = 'response-status ' + (response.status >= 200 && response.status < 300 ? 'success' : 'error');

            let timeInfo = \`\${response.time}ms\`;
            if (response.size) {
                const sizeKB = (response.size / 1024).toFixed(1);
                timeInfo += \` | \${sizeKB} KB\`;
            }
            document.getElementById('responseTime').textContent = timeInfo;

            // Headers
            let headersText = JSON.stringify(response.headers, null, 2);
            if (response.interpolatedUrl) {
                headersText = '// Variables interpolated: ' + response.interpolatedUrl + '\\n\\n' + headersText;
            }
            document.getElementById('responseHeaders').textContent = headersText;

            // Body
            const bodyEl = document.getElementById('responseBody');
            if (typeof response.body === 'object') {
                bodyEl.textContent = JSON.stringify(response.body, null, 2);
            } else {
                bodyEl.textContent = response.body;
            }

            // Cookies
            const cookies = parseCookies(response.headers);
            const cookiesEl = document.getElementById('responseCookies');
            if (cookies.length > 0) {
                cookiesEl.textContent = JSON.stringify(cookies, null, 2);
            } else {
                cookiesEl.textContent = 'No cookies in response';
            }

            // Reset to Body tab
            document.querySelectorAll('.res-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.res-tab-content').forEach(c => c.classList.remove('active'));
            document.querySelector('.res-tab').classList.add('active');
            document.getElementById('resBody').classList.add('active');

            responseEl.scrollIntoView({ behavior: 'smooth' });
        }

        function displayError(error) {
            const responseEl = document.getElementById('response');
            responseEl.style.display = 'block';
            
            const statusEl = document.getElementById('responseStatus');
            statusEl.textContent = 'Error';
            statusEl.className = 'response-status error';
            
            document.getElementById('responseTime').textContent = '-';
            document.getElementById('responseHeaders').textContent = '';
            document.getElementById('responseBody').textContent = error;
        }

        // Pagination settings
        const ITEMS_PER_PAGE = 20;
        let currentPage = 1;
        let filteredRequests = [];
        
        function displaySavedRequests() {
            const container = document.getElementById('savedRequestsContainer');
            const statsEl = document.getElementById('savedStats');
            const paginationEl = document.getElementById('pagination');
            const pageInfoEl = document.getElementById('pageInfo');
            
            // Filter
            const filterText = (document.getElementById('savedFilterInput')?.value || '').toLowerCase();
            filteredRequests = savedRequests.filter(req => 
                req.name.toLowerCase().includes(filterText) ||
                req.url.toLowerCase().includes(filterText) ||
                req.method.toLowerCase().includes(filterText)
            );
            
            // Update stats
            statsEl.textContent = filteredRequests.length + ' requests';
            
            if (filteredRequests.length === 0) {
                container.innerHTML = '<div class="empty-state">No saved requests found</div>';
                paginationEl.style.display = 'none';
                return;
            }
            
            // Calculate pagination
            const totalPages = Math.ceil(filteredRequests.length / ITEMS_PER_PAGE);
            currentPage = Math.min(currentPage, totalPages);
            const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
            const endIdx = startIdx + ITEMS_PER_PAGE;
            const pageItems = filteredRequests.slice(startIdx, endIdx);
            
            // Update pagination UI
            if (totalPages > 1) {
                paginationEl.style.display = 'flex';
                pageInfoEl.textContent = currentPage + ' / ' + totalPages;
                document.getElementById('prevPage').disabled = currentPage === 1;
                document.getElementById('nextPage').disabled = currentPage === totalPages;
            } else {
                paginationEl.style.display = 'none';
            }
            
            // Render items
            container.innerHTML = '';
            pageItems.forEach((req, idx) => {
                const item = document.createElement('div');
                item.className = 'saved-request-item';
                const timeAgo = formatTime(req.createdAt);
                const displayId = startIdx + idx + 1;
                
                // Format URL to show domain + path
                let displayUrl = req.url;
                try {
                    const url = new URL(req.url);
                    displayUrl = url.hostname + (url.pathname !== '/' ? url.pathname : '') + (url.search || '');
                } catch {}
                
                item.innerHTML = \`
                    <div class="saved-req-id">#\${displayId}</div>
                    <div class="saved-req-main" onclick="loadRequestById('\${req.id}')">
                        <div class="saved-req-header">
                            <span class="method method-\${req.method.toLowerCase()}">\${req.method}</span>
                            <span class="saved-req-name" title="\${escapeHtml(req.name)}">\${escapeHtml(req.name)}</span>
                            <span class="saved-req-time">\${timeAgo}</span>
                        </div>
                        <div class="saved-req-url" title="\${escapeHtml(req.url)}">\${escapeHtml(displayUrl)}</div>
                    </div>
                    <button class="saved-req-delete" onclick="deleteRequestById('\${req.id}', event)" title="Delete">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                \`;
                container.appendChild(item);
            });
        }
        
        function formatTime(timestamp) {
            if (!timestamp) return '';
            const now = Date.now();
            const diff = now - timestamp;
            const minutes = Math.floor(diff / 60000);
            const hours = Math.floor(diff / 3600000);
            const days = Math.floor(diff / 86400000);
            
            if (minutes < 1) return 'now';
            if (minutes < 60) return minutes + 'm';
            if (hours < 24) return hours + 'h';
            if (days < 7) return days + 'd';
            return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        }
        
        window.loadRequestById = function(id) {
            const req = savedRequests.find(r => r.id === id);
            if (req) loadRequest(req);
        };
        
        window.deleteRequestById = function(id, event) {
            event.stopPropagation();
            vscode.postMessage({ command: 'deleteRequest', id: id });
        };
        
        window.changePage = function(delta) {
            currentPage += delta;
            displaySavedRequests();
        };
        
        // Search input listener
        document.getElementById('savedFilterInput')?.addEventListener('input', () => {
            currentPage = 1;
            displaySavedRequests();
        });

        function loadRequest(req, activateTab = 'headers') {
            document.getElementById('method').value = req.method;
            document.getElementById('url').value = req.url;
            document.getElementById('contentType').value = req.contentType || 'application/json';
            document.getElementById('bodyInput').value = req.body || '';
            
            // Headers'ı yükle
            const headersContainer = document.getElementById('headersContainer');
            headersContainer.innerHTML = '';
            if (req.headers && Array.isArray(req.headers)) {
                req.headers.forEach(h => addHeaderRow(h.key, h.value, h.checked !== false));
            }
            
            // Query parametrelerini yükle
            const queryContainer = document.getElementById('queryContainer');
            queryContainer.innerHTML = '';
            if (req.queryParams && Array.isArray(req.queryParams)) {
                req.queryParams.forEach(p => addQueryRow(p.key, p.value, p.checked !== false));
            }
            
            // Eğer query parametreleri varsa ve import ediliyorsa query tab'ını aktif yap
            if (req.queryParams && req.queryParams.length > 0 && activateTab === 'query') {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                document.querySelector('[data-tab="query"]').classList.add('active');
                document.getElementById('queryTab').classList.add('active');
            } else {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                document.querySelector('[data-tab="' + activateTab + '"]').classList.add('active');
                document.getElementById(activateTab + 'Tab').classList.add('active');
            }
            
            showToast('Request loaded: ' + req.method + ' ' + req.url);
        }

        // Load on startup
        vscode.postMessage({ command: 'loadRequests' });
        vscode.postMessage({ command: 'loadAuthTokens' });
        vscode.postMessage({ command: 'getSettings' });
    </script>
</body>
</html>`;
}
