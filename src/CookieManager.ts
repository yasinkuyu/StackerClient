import * as vscode from 'vscode';
import { CookieJar, Cookie } from 'tough-cookie';

export class CookieManager {
    private static instance: CookieManager;
    private jar: CookieJar;
    private storageKey = 'stacker_cookie_jar';

    private constructor(private context: vscode.ExtensionContext) {
        this.jar = new CookieJar();
        this.loadFromStorage();
    }

    public static getInstance(context: vscode.ExtensionContext): CookieManager {
        if (!CookieManager.instance) {
            CookieManager.instance = new CookieManager(context);
        }
        return CookieManager.instance;
    }

    private async loadFromStorage() {
        const stored = this.context.globalState.get<string>(this.storageKey);
        if (stored) {
            try {
                this.jar = CookieJar.fromJSON(stored);
            } catch (e) {
                console.error('Failed to load cookie jar:', e);
                this.jar = new CookieJar();
            }
        }
    }

    private async saveToStorage() {
        try {
            const data = JSON.stringify(this.jar.toJSON());
            await this.context.globalState.update(this.storageKey, data);
        } catch (e) {
            console.error('Failed to save cookie jar:', e);
        }
    }

    public async getCookieString(url: string): Promise<string> {
        return new Promise((resolve, reject) => {
            this.jar.getCookieString(url, (err, cookies) => {
                if (err) reject(err);
                else resolve(cookies || '');
            });
        });
    }

    public async setCookie(cookieStr: string, url: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.jar.setCookie(cookieStr, url, async (err) => {
                if (err) reject(err);
                else {
                    await this.saveToStorage();
                    resolve();
                }
            });
        });
    }

    public async clearCookies() {
        this.jar = new CookieJar();
        await this.saveToStorage();
    }
}
