import * as vscode from 'vscode';

export interface SavedRequest {
    id: string;
    name: string;
    method: string;
    url: string;
    headers: Array<{ key: string; value: string; checked?: boolean }>;
    contentType: string;
    body: string;
    createdAt?: number;
    folderId?: string;
    bypassWAF?: boolean;
    userAgent?: string;
    referer?: string;
    queryParams?: Array<{ key: string; value: string; checked?: boolean }>;
}

export class RequestManager {
    private readonly storageKey = 'stackerSavedRequests';
    private readonly historyKey = 'stackerRequestHistory';

    constructor(private context: vscode.ExtensionContext) { }

    private getMaxHistoryItems(): number {
        return vscode.workspace.getConfiguration('stacker').get<number>('maxHistoryItems', 100);
    }

    /**
     * Get all saved requests sorted by creation date
     */
    getAllRequests(): SavedRequest[] {
        const data = this.context.globalState.get<SavedRequest[]>(this.storageKey, []);
        return data.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }

    /**
     * Save a new request or update existing one
     */
    saveRequest(request: SavedRequest): void {
        let requests = this.getAllRequests();

        if (!request.createdAt) {
            request.createdAt = Date.now();
        }

        const existingIndex = requests.findIndex(r => r.id === request.id);

        if (existingIndex >= 0) {
            request.createdAt = requests[existingIndex].createdAt;
            requests[existingIndex] = request;
        } else {
            requests.push(request);
        }

        // Enforce maxHistoryItems limit
        const maxItems = this.getMaxHistoryItems();
        if (requests.length > maxItems) {
            // Sort by date and keep only the newest
            requests = requests
                .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
                .slice(0, maxItems);
        }

        this.context.globalState.update(this.storageKey, requests);
    }

    /**
     * Delete a request by ID
     */
    deleteRequest(id: string): boolean {
        const requests = this.getAllRequests();
        const initialLength = requests.length;
        const filtered = requests.filter(r => r.id !== id);

        if (filtered.length < initialLength) {
            this.context.globalState.update(this.storageKey, filtered);
            return true;
        }
        return false;
    }

    /**
     * Get a single request by ID
     */
    getRequest(id: string): SavedRequest | undefined {
        return this.getAllRequests().find(r => r.id === id);
    }

    /**
     * Update request's folder
     */
    updateRequestFolder(requestId: string, folderId: string | undefined): void {
        const requests = this.getAllRequests();
        const request = requests.find(r => r.id === requestId);
        if (request) {
            request.folderId = folderId;
            this.context.globalState.update(this.storageKey, requests);
        }
    }

    /**
     * Get requests by folder
     */
    getRequestsByFolder(folderId: string): SavedRequest[] {
        return this.getAllRequests().filter(r => r.folderId === folderId);
    }

    /**
     * Clear all saved requests
     */
    clearAll(): void {
        this.context.globalState.update(this.storageKey, []);
    }

    /**
     * Export requests to JSON
     */
    exportToJson(): string {
        return JSON.stringify(this.getAllRequests(), null, 2);
    }

    /**
     * Import requests from JSON
     */
    importFromJson(json: string): number {
        try {
            const requests: SavedRequest[] = JSON.parse(json);
            if (!Array.isArray(requests)) {
                throw new Error('Invalid format');
            }

            const current = this.getAllRequests();
            const merged = [...current, ...requests];

            const unique = merged.filter((req, index, self) =>
                index === self.findIndex(r => r.id === req.id)
            );

            // Enforce limit
            const maxItems = this.getMaxHistoryItems();
            const limited = unique.slice(0, maxItems);

            this.context.globalState.update(this.storageKey, limited);
            return limited.length - current.length;
        } catch (e) {
            vscode.window.showErrorMessage('Failed to import requests: Invalid JSON format');
            return 0;
        }
    }

    /**
     * Get recent request history
     */
    getHistory(): SavedRequest[] {
        return this.context.globalState.get<SavedRequest[]>(this.historyKey, []);
    }

    /**
     * Add a request to history
     */
    addToHistory(request: SavedRequest): void {
        let history = this.getHistory();

        // Deduplicate: remove existing entry if same request content
        history = history.filter(existing => {
            const sameMethod = existing.method === request.method;
            const sameUrl = existing.url === request.url;
            const sameBody = (existing.body || '') === (request.body || '');
            const sameContentType = (existing.contentType || '') === (request.contentType || '');
            const sameBypass = !!existing.bypassWAF === !!request.bypassWAF;
            const sameUA = (existing.userAgent || '') === (request.userAgent || '');
            const sameReferer = (existing.referer || '') === (request.referer || '');
            const sameHeaders = JSON.stringify(existing.headers || []) === JSON.stringify(request.headers || []);
            const sameQuery = JSON.stringify(existing.queryParams || []) === JSON.stringify(request.queryParams || []);
            return !(sameMethod && sameUrl && sameBody && sameContentType && sameBypass && sameUA && sameReferer && sameHeaders && sameQuery);
        });

        request.createdAt = Date.now();
        history.unshift(request);

        // Limit history size
        const maxItems = this.getMaxHistoryItems();
        if (history.length > maxItems) {
            history = history.slice(0, maxItems);
        }

        this.context.globalState.update(this.historyKey, history);
    }

    /**
     * Clear history
     */
    clearHistory(): void {
        this.context.globalState.update(this.historyKey, []);
    }

    /**
     * Delete a history item
     */
    deleteHistoryItem(id: string): void {
        const history = this.getHistory();
        const filtered = history.filter(r => r.id !== id);
        this.context.globalState.update(this.historyKey, filtered);
    }
}
