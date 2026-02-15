import { SavedRequest } from './RequestManager';

export class PostmanParser {
    public static parse(json: any): SavedRequest[] {
        const requests: SavedRequest[] = [];
        const items = json.item || [];

        const processItems = (itemList: any[], folderPath: string = '') => {
            for (const item of itemList) {
                if (item.request) {
                    requests.push(this.convertToSavedRequest(item));
                } else if (item.item) {
                    processItems(item.item, item.name);
                }
            }
        };

        processItems(items);
        return requests;
    }

    private static convertToSavedRequest(item: any): SavedRequest {
        const req = item.request;
        const url = typeof req.url === 'string' ? req.url : (req.url?.raw || '');

        const headers = (req.header || []).map((h: any) => ({
            key: h.key,
            value: h.value,
            checked: !h.disabled
        }));

        const queryParams = (req.url?.query || []).map((p: any) => ({
            key: p.key,
            value: p.value,
            checked: !p.disabled
        }));

        let body = '';
        let bodyData: any = null;

        if (req.body) {
            if (req.body.mode === 'raw') {
                body = req.body.raw || '';
                bodyData = {
                    type: 'raw',
                    value: body,
                    contentType: req.body.options?.raw?.language === 'json' ? 'application/json' : 'text/plain'
                };
            } else if (req.body.mode === 'formdata') {
                bodyData = {
                    type: 'form-data',
                    items: (req.body.formdata || []).map((f: any) => ({
                        key: f.key,
                        value: f.value || f.src || '',
                        type: f.type === 'file' ? 'file' : 'text',
                        checked: !f.disabled
                    }))
                };
            } else if (req.body.mode === 'urlencoded') {
                bodyData = {
                    type: 'urlencoded',
                    items: (req.body.urlencoded || []).map((f: any) => ({
                        key: f.key,
                        value: f.value,
                        checked: !f.disabled
                    }))
                };
            }
        }

        let auth: any = null;
        if (req.auth) {
            if (req.auth.type === 'bearer') {
                const bearer = req.auth.bearer?.[0];
                auth = {
                    type: 'bearer',
                    token: bearer?.value || '',
                    prefix: 'Bearer'
                };
            } else if (req.auth.type === 'basic') {
                const username = req.auth.basic?.find((b: any) => b.key === 'username')?.value || '';
                const password = req.auth.basic?.find((b: any) => b.key === 'password')?.value || '';
                auth = {
                    type: 'basic',
                    username,
                    password
                };
            }
        }

        return {
            id: Math.random().toString(36).substring(7),
            name: item.name || 'Postman Import',
            method: req.method || 'GET',
            url,
            headers,
            contentType: req.body?.options?.raw?.language === 'json' ? 'application/json' : 'text/plain',
            body,
            bodyData,
            queryParams,
            auth,
            createdAt: Date.now()
        };
    }
}
