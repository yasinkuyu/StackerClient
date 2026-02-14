import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
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
            const config = vscode.workspace.getConfiguration('stacker');
            const defaultView = config.get<string>('sidebar.defaultView', 'recent');

            let requests;
            if (defaultView === 'saved') {
                requests = this._requestManager.getAllRequests();
            } else if (defaultView === 'recentSaved') {
                // Combine history and saved requests
                const history = this._requestManager.getHistory();
                const saved = this._requestManager.getAllRequests();
                // Merge and remove duplicates by id
                const seen = new Set<string>();
                requests = [];
                for (const req of [...history, ...saved]) {
                    if (!seen.has(req.id)) {
                        seen.add(req.id);
                        requests.push(req);
                    }
                }
            } else {
                requests = this._requestManager.getHistory();
            }

            this._view.webview.postMessage({
                type: 'refresh',
                requests: requests,
                folders: this.getFolders(),
                environments: this.getEnvironments(),
                activeEnvironment: this.getActiveEnvironment(),
                viewMode: defaultView
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
                case 'setViewSource':
                    const config = vscode.workspace.getConfiguration('stacker');
                    await config.update('sidebar.defaultView', data.source, vscode.ConfigurationTarget.Global);
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
        const htmlPath = path.join(this._extensionUri.fsPath, 'media', 'sidebar.html');
        return fs.readFileSync(htmlPath, 'utf8');
    }
}
