import * as vscode from 'vscode';
import { RequestManager, SavedRequest } from './RequestManager';

export interface EnvVariable {
    key: string;
    value: string;
    enabled: boolean;
}

export interface Environment {
    id: string;
    name: string;
    variables: EnvVariable[];
}

export interface Folder {
    id: string;
    name: string;
    requestIds: string[];
}

export class SidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'stackerSidebar';
    private _view?: vscode.WebviewView;
    private _context: vscode.ExtensionContext;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _requestManager: RequestManager,
        context?: vscode.ExtensionContext
    ) {
        if (!context) {
            throw new Error('SidebarProvider requires a valid ExtensionContext');
        }
        this._context = context;
    }

    public setContext(context: vscode.ExtensionContext) {
        this._context = context;
    }

    // Environment methods
    public getEnvironments(): Environment[] {
        return this._context?.globalState.get<Environment[]>('stackerEnvironments', []) || [];
    }

    public saveEnvironment(env: Environment) {
        const envs = this.getEnvironments();
        const index = envs.findIndex(e => e.id === env.id);
        if (index >= 0) {
            envs[index] = env;
        } else {
            envs.push(env);
        }
        this._context?.globalState.update('stackerEnvironments', envs);
    }

    public deleteEnvironment(id: string) {
        const envs = this.getEnvironments().filter(e => e.id !== id);
        this._context?.globalState.update('stackerEnvironments', envs);
    }

    public getActiveEnvironment(): string | undefined {
        return this._context?.globalState.get<string>('stackerActiveEnvironment');
    }

    public setActiveEnvironment(id: string | undefined) {
        this._context?.globalState.update('stackerActiveEnvironment', id);
    }

    // Folder methods
    public getFolders(): Folder[] {
        return this._context?.globalState.get<Folder[]>('stackerFolders', []) || [];
    }

    public saveFolder(folder: Folder) {
        const folders = this.getFolders();
        const index = folders.findIndex(f => f.id === folder.id);
        if (index >= 0) {
            folders[index] = folder;
        } else {
            folders.push(folder);
        }
        this._context?.globalState.update('stackerFolders', folders);
    }

    public deleteFolder(id: string) {
        const folders = this.getFolders().filter(f => f.id !== id);
        this._context?.globalState.update('stackerFolders', folders);
    }

    public refresh() {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'refresh',
                requests: this._requestManager.getAllRequests(),
                folders: this.getFolders(),
                environments: this.getEnvironments(),
                activeEnvironment: this.getActiveEnvironment()
            });
        }
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlContent(webviewView.webview);

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'newRequest':
                    vscode.commands.executeCommand('stacker.addRequest');
                    break;
                case 'loadRequest':
                    vscode.commands.executeCommand('stacker.loadRequest', { id: data.id });
                    break;
                case 'deleteRequest':
                    this._requestManager.deleteRequest(data.id);
                    this.refresh();
                    break;
                case 'importCurl':
                    vscode.commands.executeCommand('stacker.importCurl');
                    break;
                case 'exportData':
                    vscode.commands.executeCommand('stacker.exportData');
                    break;
                case 'importData':
                    vscode.commands.executeCommand('stacker.importData');
                    break;
                case 'openSettings':
                    vscode.commands.executeCommand('workbench.action.openSettings', 'stacker');
                    break;
                case 'clearHistory':
                    const answer = await vscode.window.showWarningMessage(
                        'Clear all saved requests?',
                        'Yes', 'No'
                    );
                    if (answer === 'Yes') {
                        this._requestManager.clearAll();
                        this.refresh();
                    }
                    break;
                case 'manageAuth':
                    vscode.commands.executeCommand('stacker.manageAuth');
                    break;
                case 'showHelp':
                    vscode.commands.executeCommand('stacker.help');
                    break;
                case 'ready':
                    this.refresh();
                    break;
                case 'refreshList':
                    this.refresh();
                    break;

                // Folder operations
                case 'createFolder':
                    const folderName = await vscode.window.showInputBox({
                        prompt: 'Enter folder name',
                        placeHolder: 'My Collection'
                    });
                    if (folderName) {
                        this.saveFolder({
                            id: Date.now().toString(),
                            name: folderName,
                            requestIds: []
                        });
                        this.refresh();
                    }
                    break;
                case 'deleteFolder':
                    const delAnswer = await vscode.window.showWarningMessage(
                        `Delete folder "${data.name}"?`,
                        'Yes', 'No'
                    );
                    if (delAnswer === 'Yes') {
                        this.deleteFolder(data.id);
                        this.refresh();
                    }
                    break;
                case 'renameFolder':
                    const newFolderName = await vscode.window.showInputBox({
                        prompt: 'Enter new folder name',
                        value: data.name
                    });
                    if (newFolderName) {
                        const folders = this.getFolders();
                        const folder = folders.find(f => f.id === data.id);
                        if (folder) {
                            folder.name = newFolderName;
                            this.saveFolder(folder);
                            this.refresh();
                        }
                    }
                    break;
                case 'addToFolder':
                    const foldersForAdd = this.getFolders();
                    const folderToAdd = foldersForAdd.find(f => f.id === data.folderId);
                    if (folderToAdd && !folderToAdd.requestIds.includes(data.requestId)) {
                        folderToAdd.requestIds.push(data.requestId);
                        this.saveFolder(folderToAdd);
                        this.refresh();
                    }
                    break;
                case 'removeFromFolder':
                    const foldersForRemove = this.getFolders();
                    const folderToRemoveFrom = foldersForRemove.find(f => f.id === data.folderId);
                    if (folderToRemoveFrom) {
                        folderToRemoveFrom.requestIds = folderToRemoveFrom.requestIds.filter(id => id !== data.requestId);
                        this.saveFolder(folderToRemoveFrom);
                        this.refresh();
                    }
                    break;
                case 'addToFolderPrompt':
                    const folders = this.getFolders();
                    const folder = folders.find(f => f.id === data.folderId);
                    if (!folder) break;

                    const allReqs = this._requestManager.getAllRequests();
                    const availableReqs = allReqs.filter(r => !folder.requestIds.includes(r.id));

                    if (availableReqs.length === 0) {
                        vscode.window.showInformationMessage('No available requests to add');
                        break;
                    }

                    const items = availableReqs.map(r => ({ label: r.method + ' ' + r.name, description: r.url, id: r.id }));
                    const selected = await vscode.window.showQuickPick(items, { placeHolder: 'Select request to add' });

                    if (selected) {
                        folder.requestIds.push(selected.id);
                        this.saveFolder(folder);
                        this.refresh();
                    }
                    break;

                // Environment operations
                case 'createEnvironment':
                    const envName = await vscode.window.showInputBox({
                        prompt: 'Enter environment name',
                        placeHolder: 'Production'
                    });
                    if (envName) {
                        this.saveEnvironment({
                            id: Date.now().toString(),
                            name: envName,
                            variables: []
                        });
                        this.refresh();
                    }
                    break;
                case 'deleteEnvironment':
                    const delEnvAnswer = await vscode.window.showWarningMessage(
                        `Delete environment "${data.name}"?`,
                        'Yes', 'No'
                    );
                    if (delEnvAnswer === 'Yes') {
                        this.deleteEnvironment(data.id);
                        if (this.getActiveEnvironment() === data.id) {
                            this.setActiveEnvironment(undefined);
                        }
                        this.refresh();
                    }
                    break;
                case 'setActiveEnvironment':
                    this.setActiveEnvironment(data.id);
                    this.refresh();
                    // Notify main panel about environment change
                    vscode.commands.executeCommand('stacker.environmentChanged');
                    vscode.window.showInformationMessage(`Active environment: ${data.name || 'None'}`);
                    break;
                case 'addVariablePrompt':
                    const keyInput = await vscode.window.showInputBox({ prompt: 'Variable name (e.g., baseUrl, apiKey)' });
                    if (!keyInput) break;
                    const valueInput = await vscode.window.showInputBox({ prompt: 'Value for "' + keyInput + '"' });
                    if (valueInput === undefined) break;
                    const envsPrompt = this.getEnvironments();
                    const envPrompt = envsPrompt.find(e => e.id === data.envId);
                    if (envPrompt) {
                        envPrompt.variables.push({ key: keyInput, value: valueInput, enabled: true });
                        this.saveEnvironment(envPrompt);
                        this.refresh();
                    }
                    break;
                case 'addVariable':
                    const envs = this.getEnvironments();
                    const envToUpdate = envs.find(e => e.id === data.envId);
                    if (envToUpdate) {
                        envToUpdate.variables.push({
                            key: data.key,
                            value: data.value,
                            enabled: true
                        });
                        this.saveEnvironment(envToUpdate);
                        this.refresh();
                    }
                    break;
                case 'updateVariable':
                    const envsForUpdate = this.getEnvironments();
                    const envForVarUpdate = envsForUpdate.find(e => e.id === data.envId);
                    if (envForVarUpdate) {
                        const varIndex = envForVarUpdate.variables.findIndex(v => v.key === data.oldKey);
                        if (varIndex >= 0) {
                            envForVarUpdate.variables[varIndex] = {
                                key: data.key,
                                value: data.value,
                                enabled: data.enabled
                            };
                            this.saveEnvironment(envForVarUpdate);
                            this.refresh();
                        }
                    }
                    break;
                case 'deleteVariable':
                    const envsForDelete = this.getEnvironments();
                    const envForVarDelete = envsForDelete.find(e => e.id === data.envId);
                    if (envForVarDelete) {
                        envForVarDelete.variables = envForVarDelete.variables.filter(v => v.key !== data.key);
                        this.saveEnvironment(envForVarDelete);
                        this.refresh();
                    }
                    break;
            }
        });
    }

    private _getHtmlContent(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>StackerClient</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background: var(--vscode-sideBar-background);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .refresh-spinner {
            display: inline-block;
            width: 14px;
            height: 14px;
            border: 2px solid rgba(255, 255, 255, 0.2);
            border-top: 2px solid currentColor;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            box-sizing: border-box;
        }

        .icon-btn {
            background: transparent;
            border: none;
            color: var(--vscode-foreground);
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0.7;
            transition: all 0.15s;
        }

        .icon-btn:hover {
            opacity: 1;
            background: var(--vscode-toolbar-hoverBackground);
        }

        /* Dropdown Menu */
        .dropdown {
            position: relative;
        }

        .dropdown-menu {
            position: absolute;
            top: 100%;
            right: 0;
            min-width: 180px;
            background: var(--vscode-menu-background);
            border: 1px solid var(--vscode-menu-border);
            border-radius: 6px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
            z-index: 1000;
            display: none;
            overflow: hidden;
        }

        .dropdown-menu.show {
            display: block;
        }

        .dropdown-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 12px;
            font-size: 12px;
            color: var(--vscode-menu-foreground);
            cursor: pointer;
            transition: background 0.1s;
        }

        .dropdown-item:hover {
            background: var(--vscode-menu-selectionBackground);
            color: var(--vscode-menu-selectionForeground);
        }

        .dropdown-item svg {
            width: 14px;
            height: 14px;
            opacity: 0.8;
        }

        .dropdown-divider {
            height: 1px;
            background: var(--vscode-menu-separatorBackground);
            margin: 4px 0;
        }

        .dropdown-item.danger:hover {
            background: rgba(239, 68, 68, 0.15);
            color: #ef4444;
        }

        /* Header */
        .header {
            padding: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .header-row {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .header-actions {
            display: flex;
            gap: 2px;
        }

        .new-request-btn {
            flex: 1;
            width: 100%;
            padding: 5px 14px;
            background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
            color: white;
            border: none;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            transition: all 0.2s;
            box-shadow: none !important;
        }

        .new-request-btn:hover {
            background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
            filter: brightness(1.1) contrast(1.1);
            box-shadow: none !important;
            outline: none !important;
        }

        .new-request-btn svg {
            width: 14px;
            height: 14px;
        }

        /* Tabs */
        .tabs {
            display: flex;
            border-bottom: 1px solid var(--vscode-panel-border);
            background: var(--vscode-sideBar-background);
        }

        .tab {
            flex: 1;
            padding: 10px 8px;
            background: transparent;
            border: none;
            color: var(--vscode-foreground);
            opacity: 0.6;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            border-bottom: 2px solid transparent;
            transition: all 0.2s;
        }

        .tab:hover {
            opacity: 0.8;
            background: var(--vscode-list-hoverBackground);
        }

        .tab.active {
            opacity: 1;
            border-bottom-color: #8b5cf6;
            color: #8b5cf6;
        }

        /* View Options */
        .view-options {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            background: var(--vscode-sideBar-background);
        }

        .view-mode-toggle {
            display: flex;
            gap: 2px;
        }

        .view-btn {
            background: var(--vscode-button-secondaryBackground);
            border: 1px solid var(--vscode-panel-border);
            color: var(--vscode-button-secondaryForeground);
            padding: 4px 8px;
            border-radius: 4px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0.7;
            transition: all 0.15s;
        }

        .view-btn:hover {
            opacity: 1;
            background: var(--vscode-button-secondaryHoverBackground);
        }

        .view-btn.active {
            opacity: 1;
            background: #8b5cf6;
            border-color: #8b5cf6;
            color: white;
        }

        .view-options {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 6px 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .view-mode-toggle {
            display: flex;
            margin-left: auto;
            gap: 1px;
        }

        .view-btn-icon {
            background: transparent;
            border: none;
            color: var(--vscode-foreground);
            padding: 4px 6px;
            border-radius: 3px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0.5;
            transition: all 0.15s;
        }

        .view-btn-icon:hover {
            opacity: 0.8;
            background: var(--vscode-toolbar-hoverBackground);
        }

        .view-btn-icon.active {
            opacity: 1;
            background: #8b5cf6;
            color: white;
        }

        .compact-select {
            padding: 2px 4px;
            background: var(--vscode-dropdown-background);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 3px;
            color: var(--vscode-dropdown-foreground);
            font-size: 10px;
            cursor: pointer;
            outline: none;
            min-width: 0;
            height: 22px;
        }

        .compact-select:focus {
            border-color: #8b5cf6;
        }

        .compact-select.method {
            width: 50px;
        }

        /* Search/Filter */
        .saved-toolbar {
            padding: 10px 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            background: var(--vscode-sideBar-background);
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .saved-search {
            flex: 1;
            position: relative;
        }

        .search-icon {
            position: absolute;
            left: 10px;
            top: 50%;
            transform: translateY(-50%);
            opacity: 0.5;
            pointer-events: none;
            color: var(--vscode-foreground);
        }

        .saved-search-input {
            width: 100%;
            height: 28px;
            padding: 6px 10px 6px 32px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            color: var(--vscode-input-foreground);
            font-size: 13px;
            outline: none;
            transition: border-color 0.2s;
        }

        .saved-search-input:focus {
            border-color: #8b5cf6;
        }

        .saved-search-input::placeholder {
            color: var(--vscode-input-placeholderForeground);
            opacity: 0.7;
        }

        /* Content */
        .content {
            flex: 1;
            overflow-y: auto;
            padding: 8px;
        }

        .tab-content {
            display: none;
        }

        .tab-content.active {
            display: block;
        }

        /* Empty State */
        .empty-state {
            text-align: center;
            padding: 40px 20px;
            color: var(--vscode-descriptionForeground);
        }

        .empty-state svg {
            width: 48px;
            height: 48px;
            opacity: 0.3;
            margin-bottom: 16px;
        }

        .empty-state h3 {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 8px;
            color: var(--vscode-foreground);
        }

        .empty-state p {
            font-size: 12px;
            line-height: 1.5;
        }

        /* Request List */
        .request-list {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .request-item {
            display: flex;
            flex-direction: column;
            padding: 8px 10px;
            border-radius: 6px;
            cursor: pointer;
            transition: background 0.15s;
            gap: 4px;
        }

        .request-item:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .method-badge {
            font-size: 9px;
            font-weight: 700;
            padding: 3px 6px;
            border-radius: 4px;
            min-width: 42px;
            text-align: center;
            text-transform: uppercase;
        }

        .method-get { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
        .method-post { background: rgba(59, 130, 246, 0.2); color: #3b82f6; }
        .method-put { background: rgba(234, 179, 8, 0.2); color: #eab308; }
        .method-patch { background: rgba(168, 85, 247, 0.2); color: #a855f7; }
        .method-delete { background: rgba(239, 68, 68, 0.2); color: #ef4444; }

        .request-info {
            flex: 1;
            min-width: 0;
            display: flex;
            align-items: center;
        }

        .request-header-row {
            display: flex;
            align-items: center;
            gap: 6px;
            width: 100%;
        }

        .request-name {
            font-size: 12px;
            font-weight: 500;
            color: var(--vscode-foreground);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            flex: 1;
        }

        .request-time {
            font-size: 9px;
            color: var(--vscode-descriptionForeground);
            opacity: 0.7;
            white-space: nowrap;
        }

        .method-badge-small {
            font-size: 8px;
            font-weight: 700;
            padding: 1px 4px;
            border-radius: 3px;
            text-transform: uppercase;
            min-width: 28px;
            text-align: center;
        }

        .method-badge-small.method-get { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
        .method-badge-small.method-post { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
        .method-badge-small.method-put { background: rgba(234, 179, 8, 0.15); color: #eab308; }
        .method-badge-small.method-patch { background: rgba(168, 85, 247, 0.15); color: #a855f7; }
        .method-badge-small.method-delete { background: rgba(239, 68, 68, 0.15); color: #ef4444; }

        .request-url {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            width: 100%;
        }

        .request-actions {
            display: flex;
            gap: 4px;
            opacity: 0;
            transition: opacity 0.15s;
        }

        .request-item:hover .request-actions {
            opacity: 1;
        }

        .action-btn {
            background: transparent;
            border: none;
            color: var(--vscode-foreground);
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            opacity: 0.6;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .action-btn:hover {
            opacity: 1;
            background: var(--vscode-toolbar-hoverBackground);
        }

        .action-btn.delete:hover {
            color: #ef4444;
        }

        /* Method Groups */
        .method-group {
            margin-bottom: 8px;
        }

        .method-group-header {
            display: flex;
            align-items: center;
            padding: 6px 8px;
            font-size: 11px;
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
            cursor: pointer;
            border-radius: 4px;
            gap: 6px;
        }

        .method-group-header:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .method-group-header svg {
            transition: transform 0.2s;
        }

        .method-group.collapsed .method-group-header svg {
            transform: rotate(-90deg);
        }

        .method-group.collapsed .method-group-content {
            display: none;
        }

        .method-group-count {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 1px 6px;
            border-radius: 10px;
            font-size: 10px;
            margin-left: auto;
        }

        /* Folders Tab */
        .folder-list {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        
        .folder-wrapper {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            margin-bottom: 4px;
            overflow: hidden;
        }
        
        .folder-wrapper.expanded {
            background: var(--vscode-list-hoverBackground);
        }

        .folder-item {
            display: flex;
            align-items: center;
            padding: 8px 10px;
            cursor: pointer;
            gap: 8px;
            background: var(--vscode-list-hoverBackground);
        }

        .folder-item:hover {
            background: var(--vscode-list-activeSelectionBackground);
        }
        
        .folder-content {
            display: none;
            padding: 0 8px 8px 32px;
        }
        
        .folder-wrapper.expanded .folder-content {
            display: block;
        }
        
        .folder-request-item {
            padding: 6px 8px;
            border-radius: 4px;
            margin-bottom: 2px;
        }
        
        .folder-request-item:hover {
            background: var(--vscode-list-activeSelectionBackground);
        }

        .folder-icon {
            color: #eab308;
        }

        /* Tab Header */
        .tab-header {
            padding: 8px 0;
            margin-bottom: 8px;
        }

        .add-btn {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 4px;
            font-size: 11px;
            cursor: pointer;
            transition: background 0.15s;
        }

        .add-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        /* Folder List */
        .folder-list, .env-list {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .folder-item, .env-item {
            display: flex;
            align-items: center;
            padding: 8px 10px;
            border-radius: 6px;
            cursor: pointer;
            gap: 8px;
            background: var(--vscode-list-hoverBackground);
        }

        .folder-item:hover, .env-item:hover {
            background: var(--vscode-list-activeSelectionBackground);
        }

        .folder-item.expanded {
            background: transparent;
            border-bottom: 1px solid var(--vscode-panel-border);
            border-radius: 0;
        }

        .folder-name, .env-name {
            flex: 1;
            font-size: 12px;
            font-weight: 500;
        }

        .folder-count, .env-active {
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 10px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }

        .env-active {
            background: rgba(34, 197, 94, 0.2);
            color: #22c55e;
        }

        .folder-requests {
            padding-left: 24px;
            margin-top: 4px;
        }

        /* Environment Variables */
        .env-variables {
            padding: 8px;
            background: var(--vscode-input-background);
            border-radius: 4px;
            margin-top: 4px;
        }

        .var-row {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 4px 0;
            font-size: 11px;
        }

        .var-key {
            color: #a78bfa;
            font-weight: 500;
            min-width: 80px;
        }

        .var-value {
            flex: 1;
            color: var(--vscode-foreground);
            opacity: 0.8;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .var-actions {
            display: flex;
            gap: 4px;
            opacity: 0;
        }

        .var-row:hover .var-actions {
            opacity: 1;
        }

        .small-icon-btn {
            background: transparent;
            border: none;
            color: var(--vscode-foreground);
            cursor: pointer;
            padding: 2px;
            border-radius: 3px;
            opacity: 0.6;
        }

        .small-icon-btn:hover {
            opacity: 1;
            background: var(--vscode-toolbar-hoverBackground);
        }

        .add-var-btn {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 4px 8px;
            margin-top: 8px;
            background: transparent;
            border: 1px dashed var(--vscode-panel-border);
            border-radius: 4px;
            color: var(--vscode-descriptionForeground);
            font-size: 11px;
            cursor: pointer;
        }

        .add-var-btn:hover {
            border-color: #8b5cf6;
            color: #8b5cf6;
        }
    </style>
</head>
<body>
    <!-- Header with New Request Button and Actions -->
    <div class="header">
        <div class="header-row">
            <button class="new-request-btn" onclick="newRequest()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                New Request
            </button>
            <div class="header-actions">
                <button class="icon-btn" onclick="refreshList()" title="Refresh">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="23 4 23 10 17 10"></polyline>
                        <polyline points="1 20 1 14 7 14"></polyline>
                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                    </svg>
                </button>
                <div class="dropdown">
                    <button class="icon-btn" onclick="toggleDropdown(event)" title="More Actions">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="1"></circle>
                            <circle cx="12" cy="5" r="1"></circle>
                            <circle cx="12" cy="19" r="1"></circle>
                        </svg>
                    </button>
                    <div class="dropdown-menu" id="dropdownMenu">
                        <div class="dropdown-item" onclick="importCurl()">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="17 8 12 3 7 8"></polyline>
                                <line x1="12" y1="3" x2="12" y2="15"></line>
                            </svg>
                            Import cURL
                        </div>
                        <div class="dropdown-item" onclick="manageAuth()">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                            </svg>
                            Manage Tokens
                        </div>
                        <div class="dropdown-divider"></div>
                        <div class="dropdown-item" onclick="exportData()">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                            Export Data
                        </div>
                        <div class="dropdown-item" onclick="importData()">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="17 8 12 3 7 8"></polyline>
                                <line x1="12" y1="3" x2="12" y2="15"></line>
                            </svg>
                            Import Data
                        </div>
                        <div class="dropdown-divider"></div>
                        <div class="dropdown-item" onclick="openSettings()">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="3"></circle>
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                            </svg>
                            Extension Settings
                        </div>
                        <div class="dropdown-item" onclick="showHelp()">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                                <line x1="12" y1="17" x2="12.01" y2="17"></line>
                            </svg>
                            Help & About
                        </div>
                        <div class="dropdown-divider"></div>
                        <div class="dropdown-item danger" onclick="clearHistory()">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                            Clear All History
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="tabs">
        <button class="tab active" data-tab="history">History</button>
        <button class="tab" data-tab="folders">Folders</button>
        <button class="tab" data-tab="variables">Env</button>
    </div>

    <div class="content">
        <!-- History Tab -->
        <div class="tab-content active" id="historyTab">
            <!-- View Options Bar -->
            <div class="view-options">
                <select class="compact-select" id="sortSelect" onchange="setSortOrder(this.value)" title="Sort">
                    <option value="newest">Newest</option>
                    <option value="oldest">Oldest</option>
                    <option value="name">Name A-Z</option>
                    <option value="nameDesc">Name Z-A</option>
                </select>
                <select class="compact-select method" id="methodFilter" onchange="setMethodFilter(this.value)" title="Filter by method">
                    <option value="all">All</option>
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="PATCH">PATCH</option>
                    <option value="DELETE">DEL</option>
                </select>
                <div class="view-mode-toggle">
                    <button class="view-btn-icon active" id="viewGrouped" onclick="setViewMode('grouped')" title="Grouped">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="3" width="7" height="7"></rect>
                            <rect x="14" y="3" width="7" height="7"></rect>
                            <rect x="14" y="14" width="7" height="7"></rect>
                            <rect x="3" y="14" width="7" height="7"></rect>
                        </svg>
                    </button>
                    <button class="view-btn-icon" id="viewFlat" onclick="setViewMode('flat')" title="Flat">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="3" y1="6" x2="21" y2="6"></line>
                            <line x1="3" y1="12" x2="21" y2="12"></line>
                            <line x1="3" y1="18" x2="21" y2="18"></line>
                        </svg>
                    </button>
                </div>
            </div>

            <div class="saved-toolbar">
                <div class="saved-search">
                    <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input type="text" class="saved-search-input" id="filterInput" placeholder="Search requests...">
                </div>
            </div>

            <div id="requestList" class="request-list"></div>
            <div id="emptyState" class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                    <polyline points="13 2 13 9 20 9"></polyline>
                </svg>
                <h3>Welcome to StackerClient</h3>
                <p>Your request history will appear here.<br>Click "New Request" to get started.</p>
            </div>
        </div>

        <!-- Folders Tab -->
        <div class="tab-content" id="foldersTab">
            <div class="tab-header">
                <button class="add-btn" onclick="createFolder()">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    New Folder
                </button>
            </div>
            <div id="folderList" class="folder-list"></div>
            <div id="foldersEmptyState" class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
                <h3>No Folders Yet</h3>
                <p>Create folders to organize your requests into collections.</p>
            </div>
        </div>

        <!-- Variables Tab -->
        <div class="tab-content" id="variablesTab">
            <div class="tab-header">
                <button class="add-btn" onclick="createEnvironment()">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    New Environment
                </button>
            </div>
            <div id="envList" class="env-list"></div>
            <div id="envEmptyState" class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="3" y1="9" x2="21" y2="9"></line>
                    <line x1="9" y1="21" x2="9" y2="9"></line>
                </svg>
                <h3>No Environments Yet</h3>
                <p>Create environments to manage variables. Use \`{{variableName}}\` syntax in URL, headers or body to substitute values.</p>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let allRequests = [];
        let allFolders = [];
        let allEnvironments = [];
        let activeEnvironment = null;
        let filterQuery = '';

        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(tab.dataset.tab + 'Tab').classList.add('active');
            });
        });

        // Filter
        document.getElementById('filterInput').addEventListener('input', (e) => {
            filterQuery = e.target.value.toLowerCase();
            renderRequests();
        });

        // Dropdown toggle
        function toggleDropdown(event) {
            event.stopPropagation();
            const menu = document.getElementById('dropdownMenu');
            menu.classList.toggle('show');
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const menu = document.getElementById('dropdownMenu');
            if (!e.target.closest('.dropdown')) {
                menu.classList.remove('show');
            }
        });

        function closeDropdown() {
            document.getElementById('dropdownMenu').classList.remove('show');
        }

        function newRequest() {
            vscode.postMessage({ type: 'newRequest' });
        }

        function refreshList() {
            const btn = document.querySelector('[onclick="refreshList()"]');
            const originalIcon = btn.innerHTML;
            
            // Add loading spinner
            btn.innerHTML = '<span class="refresh-spinner"></span>';
            btn.disabled = true;
            
            vscode.postMessage({ type: 'refreshList' });
            
            // Reset after 500ms
            setTimeout(() => {
                btn.innerHTML = originalIcon;
                btn.disabled = false;
            }, 500);
        }

        // View Options
        let viewMode = 'grouped'; // 'grouped' | 'flat'
        let methodFilter = 'all'; // 'all' | 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
        let sortOrder = 'newest'; // 'newest' | 'oldest' | 'name' | 'nameDesc'

        function setViewMode(mode) {
            viewMode = mode;
            document.getElementById('viewGrouped').classList.toggle('active', mode === 'grouped');
            document.getElementById('viewFlat').classList.toggle('active', mode === 'flat');
            renderRequests();
        }

        function setMethodFilter(method) {
            methodFilter = method;
            renderRequests();
        }

        function setSortOrder(order) {
            sortOrder = order;
            renderRequests();
        }

        function importCurl() {
            closeDropdown();
            vscode.postMessage({ type: 'importCurl' });
        }

        function exportData() {
            closeDropdown();
            vscode.postMessage({ type: 'exportData' });
        }

        function importData() {
            closeDropdown();
            vscode.postMessage({ type: 'importData' });
        }

        function manageAuth() {
            closeDropdown();
            vscode.postMessage({ type: 'manageAuth' });
        }

        function openSettings() {
            closeDropdown();
            vscode.postMessage({ type: 'openSettings' });
        }

        function showHelp() {
            closeDropdown();
            vscode.postMessage({ type: 'showHelp' });
        }

        function clearHistory() {
            closeDropdown();
            vscode.postMessage({ type: 'clearHistory' });
        }

        function loadRequest(id) {
            vscode.postMessage({ type: 'loadRequest', id });
        }

        function deleteRequest(id, event) {
            event.stopPropagation();
            vscode.postMessage({ type: 'deleteRequest', id });
        }

        function renderRequests() {
            const container = document.getElementById('requestList');
            const emptyState = document.getElementById('emptyState');

            let filtered = [...allRequests];
            
            // Sort
            filtered.sort((a, b) => {
                switch (sortOrder) {
                    case 'newest':
                        return (b.createdAt || 0) - (a.createdAt || 0);
                    case 'oldest':
                        return (a.createdAt || 0) - (b.createdAt || 0);
                    case 'name':
                        return (a.name || '').localeCompare(b.name || '');
                    case 'nameDesc':
                        return (b.name || '').localeCompare(a.name || '');
                    default:
                        return 0;
                }
            });
            
            // Text filter
            if (filterQuery) {
                filtered = filtered.filter(r =>
                    r.name.toLowerCase().includes(filterQuery) ||
                    r.url.toLowerCase().includes(filterQuery) ||
                    r.method.toLowerCase().includes(filterQuery)
                );
            }
            
            // Method filter
            if (methodFilter !== 'all') {
                filtered = filtered.filter(r => r.method.toUpperCase() === methodFilter);
            }

            if (filtered.length === 0) {
                container.innerHTML = '';
                emptyState.style.display = 'block';
                if (filterQuery || methodFilter !== 'all') {
                    emptyState.querySelector('h3').textContent = 'No Results';
                    emptyState.querySelector('p').textContent = 'No requests match your filters.';
                } else {
                    emptyState.querySelector('h3').textContent = 'Welcome to StackerClient';
                    emptyState.querySelector('p').innerHTML = 'Your request history will appear here.<br>Click "New Request" to get started.';
                }
                return;
            }

            emptyState.style.display = 'none';

            // Flat view
            if (viewMode === 'flat') {
                container.innerHTML = filtered.map(req => renderRequestItem(req)).join('');
                return;
            }

            // Grouped view (by method)
            const groups = {};
            filtered.forEach(req => {
                const method = req.method.toUpperCase();
                if (!groups[method]) groups[method] = [];
                groups[method].push(req);
            });

            const methodOrder = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
            let html = '';

            methodOrder.forEach(method => {
                if (groups[method]) {
                    html += renderMethodGroup(method, groups[method]);
                }
            });

            // Other methods
            Object.keys(groups).forEach(method => {
                if (!methodOrder.includes(method)) {
                    html += renderMethodGroup(method, groups[method]);
                }
            });

            container.innerHTML = html;
        }

        function renderMethodGroup(method, requests) {
            const methodClass = 'method-' + method.toLowerCase();
            return \`
                <div class="method-group">
                    <div class="method-group-header" onclick="this.parentElement.classList.toggle('collapsed')">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                        <span class="method-badge \${methodClass}">\${method}</span>
                        <span class="method-group-count">\${requests.length}</span>
                    </div>
                    <div class="method-group-content">
                        \${requests.map(req => renderRequestItem(req)).join('')}
                    </div>
                </div>
            \`;
        }

        function formatTime(timestamp) {
            if (!timestamp) return '';
            const now = Date.now();
            const diff = now - timestamp;
            const minutes = Math.floor(diff / 60000);
            const hours = Math.floor(diff / 3600000);
            const days = Math.floor(diff / 86400000);
            
            if (minutes < 1) return 'just now';
            if (minutes < 60) return minutes + 'm ago';
            if (hours < 24) return hours + 'h ago';
            if (days < 2) return 'yesterday';
            if (days < 7) return days + 'd ago';
            return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        }

        function renderRequestItem(req) {
            const methodClass = 'method-' + req.method.toLowerCase();
            let displayUrl = req.url;
            try {
                const url = new URL(req.url);
                // Show domain + path (without protocol)
                displayUrl = url.hostname + (url.pathname !== '/' ? url.pathname : '') + (url.search || '');
            } catch {}

            const timeAgo = formatTime(req.createdAt);

            return \`
                <div class="request-item" onclick="loadRequest('\${req.id}')">
                    <div class="request-header-row">
                        <span class="method-badge-small \${methodClass}">\${req.method}</span>
                        <div class="request-info">
                            <span class="request-name">\${escapeHtml(req.name)}</span>
                            </div>
                        <span class="request-time">\${timeAgo}</span>
                        <div class="request-actions">
                            <button class="action-btn delete" onclick="deleteRequest('\${req.id}', event)" title="Delete">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div class="request-url">\${escapeHtml(displayUrl)}</div>
                </div>
            \`;
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // Folder functions
        function createFolder() {
            vscode.postMessage({ type: 'createFolder' });
        }

        function deleteFolder(id, name, event) {
            event.stopPropagation();
            vscode.postMessage({ type: 'deleteFolder', id, name });
        }

        function renameFolder(id, name, event) {
            event.stopPropagation();
            vscode.postMessage({ type: 'renameFolder', id, name });
        }

        function addToFolderPrompt(folderId, event) {
            event.stopPropagation();
            vscode.postMessage({ type: 'addToFolderPrompt', folderId });
        }

        function removeFromFolder(folderId, requestId, event) {
            event.stopPropagation();
            vscode.postMessage({ type: 'removeFromFolder', folderId, requestId });
        }

        function renderRequestItemWithRemove(req, folderId) {
            const methodClass = 'method-' + req.method.toLowerCase();
            let displayUrl = req.url;
            try {
                const url = new URL(req.url);
                // Show domain + path (without protocol)
                displayUrl = url.hostname + (url.pathname !== '/' ? url.pathname : '') + (url.search || '');
            } catch {}

            return \`
                <div class="request-item folder-request-item">
                    <div class="request-header-row">
                        <span class="method-badge-small \${methodClass}">\${req.method}</span>
                        <div class="request-info" onclick="loadRequest('\${req.id}')">
                            <div class="request-name">\${escapeHtml(req.name)}</div>
                        </div>
                        <button class="action-btn" onclick="removeFromFolder('\${folderId}', '\${req.id}', event)" title="Remove from folder">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                    <div class="request-url">\${escapeHtml(displayUrl)}</div>
                </div>
            \`;
        }

        function renderFolders() {
            const container = document.getElementById('folderList');
            const emptyState = document.getElementById('foldersEmptyState');

            if (allFolders.length === 0) {
                container.innerHTML = '';
                emptyState.style.display = 'block';
                return;
            }

            emptyState.style.display = 'none';
            container.innerHTML = allFolders.map(folder => {
                const requests = allRequests.filter(r => folder.requestIds.includes(r.id));
                const availableRequests = allRequests.filter(r => !folder.requestIds.includes(r.id));
                return \`
                    <div class="folder-wrapper" id="folder-\${folder.id}">
                        <div class="folder-item" onclick="document.getElementById('folder-\${folder.id}').classList.toggle('expanded')">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="2">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                            </svg>
                            <span class="folder-name">\${escapeHtml(folder.name)}</span>
                            <span class="folder-count">\${requests.length}</span>
                            <button class="small-icon-btn" onclick="addToFolderPrompt('\${folder.id}', event)" title="Add Request" \${availableRequests.length === 0 ? 'disabled' : ''}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                </svg>
                            </button>
                            <button class="small-icon-btn" onclick="renameFolder('\${folder.id}', '\${escapeHtml(folder.name)}', event)" title="Rename">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </button>
                            <button class="small-icon-btn" onclick="deleteFolder('\${folder.id}', '\${escapeHtml(folder.name)}', event)" title="Delete">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                            </button>
                        </div>
                        <div class="folder-content">
                            \${requests.length === 0 ? 
                                '<p style="font-size:11px;color:var(--vscode-descriptionForeground);padding:8px 0;">No requests in this folder. Click + to add.</p>' :
                                requests.map(req => renderRequestItemWithRemove(req, folder.id)).join('')
                            }
                        </div>
                    </div>
                \`;
            }).join('');
        }

        // Environment functions
        function createEnvironment() {
            vscode.postMessage({ type: 'createEnvironment' });
        }

        function deleteEnvironment(id, name, event) {
            event.stopPropagation();
            vscode.postMessage({ type: 'deleteEnvironment', id, name });
        }

        function setActiveEnv(id, name) {
            vscode.postMessage({ type: 'setActiveEnvironment', id, name });
        }

        function addVariable(envId) {
            vscode.postMessage({ type: 'addVariablePrompt', envId });
        }

        function deleteVariable(envId, key, event) {
            event.stopPropagation();
            vscode.postMessage({ type: 'deleteVariable', envId, key });
        }

        function renderEnvironments() {
            const container = document.getElementById('envList');
            const emptyState = document.getElementById('envEmptyState');

            if (allEnvironments.length === 0) {
                container.innerHTML = '';
                emptyState.style.display = 'block';
                return;
            }

            emptyState.style.display = 'none';
            container.innerHTML = allEnvironments.map(env => {
                const isActive = activeEnvironment === env.id;
                return \`
                    <div class="env-item" onclick="setActiveEnv('\${env.id}', '\${escapeHtml(env.name)}')" style="\${isActive ? 'border-left: 2px solid #22c55e;' : ''}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="\${isActive ? '#22c55e' : 'currentColor'}" stroke-width="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="3" y1="9" x2="21" y2="9"></line>
                            <line x1="9" y1="21" x2="9" y2="9"></line>
                        </svg>
                        <span class="env-name">\${escapeHtml(env.name)}</span>
                        \${isActive ? '<span class="env-active">Active</span>' : ''}
                        <button class="small-icon-btn" onclick="deleteEnvironment('\${env.id}', '\${escapeHtml(env.name)}', event)" title="Delete">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                    <div class="env-variables">
                        \${env.variables.map(v => \`
                            <div class="var-row">
                                <span class="var-key">\${escapeHtml(v.key)}</span>
                                <span class="var-value">\${escapeHtml(v.value)}</span>
                                <div class="var-actions">
                                    <button class="small-icon-btn" onclick="deleteVariable('\${env.id}', '\${escapeHtml(v.key)}', event)" title="Delete">
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <line x1="18" y1="6" x2="6" y2="18"></line>
                                            <line x1="6" y1="6" x2="18" y2="18"></line>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        \`).join('') || '<p style="font-size:11px;color:var(--vscode-descriptionForeground)">No variables</p>'}
                        <button class="add-var-btn" onclick="addVariable('\${env.id}')">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                            Add Variable
                        </button>
                    </div>
                \`;
            }).join('');
        }

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'refresh') {
                allRequests = message.requests || [];
                allFolders = message.folders || [];
                allEnvironments = message.environments || [];
                activeEnvironment = message.activeEnvironment;
                renderRequests();
                renderFolders();
                renderEnvironments();
            }
        });

        // Ready
        vscode.postMessage({ type: 'ready' });
    </script>
</body>
</html>`;
    }
}
