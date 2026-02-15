import { SavedRequest } from './RequestManager';

export class InsomniaParser {
    public static parse(json: any): SavedRequest[] {
        const requests: SavedRequest[] = [];
        const resources = json.resources || [];

        // In Insomnia, resources are flat, we need to find 'request' types
        for (const res of resources) {
            if (res._type === 'request') {
                requests.push(this.convertToSavedRequest(res));
            }
        }

        return requests;
    }

    private static convertToSavedRequest(res: any): SavedRequest {
        const headers = (res.headers || []).map((h: any) => ({
            key: h.name,
            value: h.value,
            checked: !h.disabled
        }));

        const queryParams = (res.parameters || []).map((p: any) => ({
            key: p.name,
            value: p.value,
            checked: !p.disabled
        }));

        let body = '';
        let bodyData: any = null;

        if (res.body) {
            if (res.body.mimeType === 'application/json' || res.body.mimeType === 'text/plain') {
                body = res.body.text || '';
                bodyData = {
                    type: 'raw',
                    value: body,
                    contentType: res.body.mimeType
                };
            } else if (res.body.mimeType === 'multipart/form-data') {
                bodyData = {
                    type: 'form-data',
                    items: (res.body.params || []).map((p: any) => ({
                        key: p.name,
                        value: p.value || '',
                        type: p.type === 'file' ? 'file' : 'text',
                        checked: !p.disabled
                    }))
                };
            } else if (res.body.mimeType === 'application/x-www-form-urlencoded') {
                bodyData = {
                    type: 'urlencoded',
                    items: (res.body.params || []).map((p: any) => ({
                        key: p.name,
                        value: p.value,
                        checked: !p.disabled
                    }))
                };
            }
        }

        let auth: any = null;
        if (res.authentication) {
            if (res.authentication.type === 'bearer') {
                auth = {
                    type: 'bearer',
                    token: res.authentication.token || '',
                    prefix: res.authentication.prefix || 'Bearer'
                };
            } else if (res.authentication.type === 'basic') {
                auth = {
                    type: 'basic',
                    username: res.authentication.username || '',
                    password: res.authentication.password || ''
                };
            }
        }

        return {
            id: Math.random().toString(36).substring(7),
            name: res.name || 'Insomnia Import',
            method: res.method || 'GET',
            url: res.url || '',
            headers,
            contentType: res.body?.mimeType || 'text/plain',
            body,
            bodyData,
            queryParams,
            auth,
            createdAt: Date.now()
        };
    }
}
