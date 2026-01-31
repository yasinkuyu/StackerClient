const vscode = acquireVsCodeApi();
        const COMMON_HEADERS = [
            { key: 'Accept', value: 'application/json', desc: 'Accepted response format' },
            { key: 'Accept', value: 'text/html', desc: 'Accepted response format' },
            { key: 'Accept', value: '*/*', desc: 'Accept any format' },
            { key: 'Accept-Encoding', value: 'gzip, deflate, br', desc: 'Compression algorithms' },
            { key: 'Accept-Language', value: 'en-US,en;q=0.9', desc: 'Preferred languages' },
            { key: 'Authorization', value: 'Bearer ', desc: 'Bearer token auth' },
            { key: 'Authorization', value: 'Basic ', desc: 'Basic auth' },
            { key: 'Cache-Control', value: 'no-cache', desc: 'Disable caching' },
            { key: 'Content-Type', value: 'application/json', desc: 'JSON format' },
            { key: 'Content-Type', value: 'application/x-www-form-urlencoded', desc: 'Form data' },
            { key: 'Content-Type', value: 'multipart/form-data', desc: 'Multipart form' },
            { key: 'Content-Type', value: 'text/plain', desc: 'Plain text' },
            { key: 'Cookie', value: '', desc: 'Cookie data' },
            { key: 'User-Agent', value: 'Mozilla/5.0', desc: 'Browser user agent' },
            { key: 'X-API-Key', value: '', desc: 'API Key header' },
            { key: 'X-Requested-With', value: 'XMLHttpRequest', desc: 'AJAX request' }
        ];
        let savedRequests = [];
        let authTokens = {};
        let isLoading = false;

        function initApp() {
        console.log('initApp started');

        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            console.log('Adding tab listener:', tab.dataset.tab);
            tab.addEventListener('click', () => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(tab.dataset.tab + 'Tab').classList.add('active');
            });
        });

        window.addAuthHeader = function(type, desc) {
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
        };

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
                    div.innerHTML = '<span class="header-name">' + escapeHtml(item.key) + '</span>' +
                        '<span class="header-desc">' + escapeHtml(item.desc) + '</span>';
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

        // Setup button handlers with null checks
        const addHeaderBtn = document.getElementById('addHeaderBtn');
        console.log('addHeaderBtn element:', addHeaderBtn);
        if (addHeaderBtn) {
            addHeaderBtn.addEventListener('click', () => {
                console.log('Add Header clicked!');
                addHeaderRow();
            });
        }

        const addQueryBtn = document.getElementById('addQueryBtn');
        if (addQueryBtn) {
            addQueryBtn.addEventListener('click', () => addQueryRow());
        }

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

        // Send button handler with null check
        const sendBtn = document.getElementById('sendBtn');
        console.log('sendBtn element:', sendBtn);
        if (sendBtn) {
            sendBtn.addEventListener('click', () => {
                console.log('Send button clicked!');
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
        }

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
                item.innerHTML = '<span class="token-name">' + escapeHtml(name) + '</span>' +
                    '<div class="token-actions">' +
                    '<button class="token-action-btn use-btn">Use</button>' +
                    '<button class="token-action-btn delete-btn">Delete</button>' +
                    '</div>';
                item.querySelector('.use-btn').onclick = function() { useToken(name); };
                item.querySelector('.delete-btn').onclick = function() { deleteToken(name); };
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
        window.showResTab = function(tabName, evt) {
            document.querySelectorAll('.res-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.res-tab-content').forEach(c => c.classList.remove('active'));
            if (evt && evt.target) {
                evt.target.classList.add('active');
            } else {
                document.querySelector('.res-tab').classList.add('active');
            }
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

        // Store response data for copy function
        let currentResponse = null;

        function displayResponse(response) {
            currentResponse = response;
            const responseEl = document.getElementById('response');
            responseEl.style.display = 'block';

            // Status
            const statusEl = document.getElementById('responseStatus');
            statusEl.textContent = response.status + ' ' + response.statusText;
            statusEl.className = 'response-status ' + (response.status >= 200 && response.status < 300 ? 'success' : 'error');

            // Time
            document.getElementById('responseTime').textContent = response.time + 'ms';

            // Size
            const sizeEl = document.getElementById('responseSize');
            if (sizeEl) {
                if (response.size) {
                    const sizeKB = (response.size / 1024).toFixed(2);
                    sizeEl.textContent = sizeKB + ' KB';
                } else {
                    sizeEl.textContent = '-';
                }
            }

            // Detect content type
            const contentType = response.headers['content-type'] || response.headers['Content-Type'] || '';
            const responseTypeEl = document.getElementById('responseType');
            if (responseTypeEl) {
                if (contentType.includes('json')) {
                    responseTypeEl.textContent = 'JSON';
                } else if (contentType.includes('html')) {
                    responseTypeEl.textContent = 'HTML';
                } else if (contentType.includes('xml')) {
                    responseTypeEl.textContent = 'XML';
                } else if (contentType.includes('text')) {
                    responseTypeEl.textContent = 'TEXT';
                } else {
                    responseTypeEl.textContent = contentType.split(';')[0] || 'Response';
                }
            }

            // Headers - table format
            const headersContainer = document.getElementById('responseHeaders');
            const headerKeys = Object.keys(response.headers);
            const headersCountEl = document.getElementById('headersCount');
            if (headersCountEl) {
                headersCountEl.textContent = headerKeys.length;
            }

            let headersHtml = '';
            if (response.interpolatedUrl) {
                headersHtml += '<div class="header-row" style="background:rgba(167,139,250,0.1);margin:-12px -12px 12px -12px;padding:12px;border-radius:4px 4px 0 0;">';
                headersHtml += '<span class="header-key" style="color:#a78bfa;">Interpolated URL</span>';
                headersHtml += '<span class="header-value">' + escapeHtml(response.interpolatedUrl) + '</span>';
                headersHtml += '</div>';
            }
            headerKeys.forEach(function(key) {
                headersHtml += '<div class="header-row">';
                headersHtml += '<span class="header-key">' + escapeHtml(key) + '</span>';
                headersHtml += '<span class="header-value">' + escapeHtml(String(response.headers[key])) + '</span>';
                headersHtml += '</div>';
            });
            headersContainer.innerHTML = headersHtml;

            // Body - with JSON tree viewer
            const bodyEl = document.getElementById('responseBody');
            var jsonData = null;

            if (typeof response.body === 'object') {
                jsonData = response.body;
            } else {
                // Try to parse as JSON
                try {
                    jsonData = JSON.parse(response.body);
                } catch (e) {
                    // Not JSON, show as plain text
                    bodyEl.textContent = response.body;
                }
            }

            if (jsonData !== null) {
                bodyEl.innerHTML = '<div class="json-tree">' + renderJSONTree(jsonData, 0) + '</div>';
            }

            // Cookies - formatted display
            const cookies = parseCookies(response.headers);
            const cookiesEl = document.getElementById('responseCookies');
            if (cookies.length > 0) {
                let cookiesHtml = '';
                cookies.forEach(function(cookie) {
                    cookiesHtml += '<div class="cookie-item">';
                    cookiesHtml += '<div class="cookie-name">' + escapeHtml(cookie.name) + '</div>';
                    cookiesHtml += '<div class="cookie-value">' + escapeHtml(cookie.value) + '</div>';
                    cookiesHtml += '<div class="cookie-attrs">';
                    if (cookie.path) cookiesHtml += '<span class="cookie-attr">Path: ' + escapeHtml(cookie.path) + '</span>';
                    if (cookie.domain) cookiesHtml += '<span class="cookie-attr">Domain: ' + escapeHtml(cookie.domain) + '</span>';
                    if (cookie.expires) cookiesHtml += '<span class="cookie-attr">Expires: ' + escapeHtml(cookie.expires) + '</span>';
                    if (cookie.httponly) cookiesHtml += '<span class="cookie-attr">HttpOnly</span>';
                    if (cookie.secure) cookiesHtml += '<span class="cookie-attr">Secure</span>';
                    if (cookie.samesite) cookiesHtml += '<span class="cookie-attr">SameSite: ' + escapeHtml(cookie.samesite) + '</span>';
                    cookiesHtml += '</div>';
                    cookiesHtml += '</div>';
                });
                cookiesEl.innerHTML = cookiesHtml;
            } else {
                cookiesEl.innerHTML = '<div class="empty-state" style="padding:20px;">No cookies in response</div>';
            }

            // Reset to Body tab
            document.querySelectorAll('.res-tab').forEach(function(t) { t.classList.remove('active'); });
            document.querySelectorAll('.res-tab-content').forEach(function(c) { c.classList.remove('active'); });
            document.querySelector('.res-tab').classList.add('active');
            document.getElementById('resBody').classList.add('active');

            responseEl.scrollIntoView({ behavior: 'smooth' });
        }

        // JSON Tree Viewer - Collapsible
        function renderJSONTree(data, level) {
            level = level || 0;
            var indent = '  '.repeat(level);
            var html = '';

            if (data === null) {
                return '<span class="json-null">null</span>';
            }

            if (typeof data === 'boolean') {
                return '<span class="json-boolean">' + data + '</span>';
            }

            if (typeof data === 'number') {
                return '<span class="json-number">' + data + '</span>';
            }

            if (typeof data === 'string') {
                var escaped = data.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                // Check if it's a URL
                if (/^https?:\/\//.test(data)) {
                    return '<span class="json-string">"<a href="' + escaped + '" class="json-link" title="Open URL">' + escaped + '</a>"</span>';
                }
                // Check if it's a date
                if (/^\d{4}-\d{2}-\d{2}/.test(data)) {
                    return '<span class="json-string json-date">"' + escaped + '"</span>';
                }
                return '<span class="json-string">"' + escaped + '"</span>';
            }

            if (Array.isArray(data)) {
                if (data.length === 0) {
                    return '<span class="json-bracket">[]</span>';
                }
                var id = 'json-' + Math.random().toString(36).substr(2, 9);
                html += '<span class="json-toggle" onclick="toggleJSON(\'' + id + '\')">';
                html += '<span class="json-toggle-icon">▼</span>';
                html += '</span>';
                html += '<span class="json-bracket">[</span>';
                html += '<span class="json-size">' + data.length + ' items</span>';
                html += '<div id="' + id + '" class="json-content">';
                data.forEach(function(item, index) {
                    html += '<div class="json-line">';
                    html += '<span class="json-index">' + index + '</span>';
                    html += '<span class="json-colon">: </span>';
                    html += renderJSONTree(item, level + 1);
                    if (index < data.length - 1) html += '<span class="json-comma">,</span>';
                    html += '</div>';
                });
                html += '</div>';
                html += '<span class="json-bracket">]</span>';
                return html;
            }

            if (typeof data === 'object') {
                var keys = Object.keys(data);
                if (keys.length === 0) {
                    return '<span class="json-bracket">{}</span>';
                }
                var id = 'json-' + Math.random().toString(36).substr(2, 9);
                html += '<span class="json-toggle" onclick="toggleJSON(\'' + id + '\')">';
                html += '<span class="json-toggle-icon">▼</span>';
                html += '</span>';
                html += '<span class="json-bracket">{</span>';
                html += '<span class="json-size">' + keys.length + ' keys</span>';
                html += '<div id="' + id + '" class="json-content">';
                keys.forEach(function(key, index) {
                    html += '<div class="json-line">';
                    html += '<span class="json-key">"' + key + '"</span>';
                    html += '<span class="json-colon">: </span>';
                    html += renderJSONTree(data[key], level + 1);
                    if (index < keys.length - 1) html += '<span class="json-comma">,</span>';
                    html += '</div>';
                });
                html += '</div>';
                html += '<span class="json-bracket">}</span>';
                return html;
            }

            return String(data);
        }

        // Toggle JSON node
        window.toggleJSON = function(id) {
            var el = document.getElementById(id);
            var toggle = el.previousElementSibling.previousElementSibling;
            var icon = toggle.querySelector('.json-toggle-icon');
            var size = el.previousElementSibling;

            if (el.classList.contains('collapsed')) {
                el.classList.remove('collapsed');
                icon.textContent = '▼';
                size.style.display = 'none';
            } else {
                el.classList.add('collapsed');
                icon.textContent = '▶';
                size.style.display = 'inline';
            }
        };

        // Collapse/Expand all
        window.collapseAllJSON = function() {
            document.querySelectorAll('.json-content').forEach(function(el) {
                el.classList.add('collapsed');
                var toggle = el.previousElementSibling.previousElementSibling;
                var icon = toggle.querySelector('.json-toggle-icon');
                var size = el.previousElementSibling;
                if (icon) icon.textContent = '▶';
                if (size) size.style.display = 'inline';
            });
        };

        window.expandAllJSON = function() {
            document.querySelectorAll('.json-content').forEach(function(el) {
                el.classList.remove('collapsed');
                var toggle = el.previousElementSibling.previousElementSibling;
                var icon = toggle.querySelector('.json-toggle-icon');
                var size = el.previousElementSibling;
                if (icon) icon.textContent = '▼';
                if (size) size.style.display = 'none';
            });
        };

        // Simple syntax highlight for non-JSON
        function syntaxHighlightJSON(json) {
            json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function(match) {
                var cls = 'json-number';
                if (/^"/.test(match)) {
                    if (/:$/.test(match)) {
                        cls = 'json-key';
                    } else {
                        cls = 'json-string';
                    }
                } else if (/true|false/.test(match)) {
                    cls = 'json-boolean';
                } else if (/null/.test(match)) {
                    cls = 'json-null';
                }
                return '<span class="' + cls + '">' + match + '</span>';
            });
        }

        // Copy response content
        window.copyResponse = function(type) {
            if (!currentResponse) return;
            var text = '';
            if (type === 'body') {
                if (typeof currentResponse.body === 'object') {
                    text = JSON.stringify(currentResponse.body, null, 2);
                } else {
                    text = currentResponse.body;
                }
            } else if (type === 'headers') {
                text = JSON.stringify(currentResponse.headers, null, 2);
            }
            navigator.clipboard.writeText(text).then(function() {
                showToast('Copied to clipboard!');
            });
        };

        // Toggle word wrap
        window.toggleWrap = function() {
            var bodyEl = document.getElementById('responseBody');
            bodyEl.classList.toggle('no-wrap');
        };

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
                
                item.innerHTML = '<div class="saved-req-id">#' + displayId + '</div>' +
                    '<div class="saved-req-main">' +
                    '<div class="saved-req-header">' +
                    '<span class="method method-' + req.method.toLowerCase() + '">' + req.method + '</span>' +
                    '<span class="saved-req-name" title="' + escapeHtml(req.name) + '">' + escapeHtml(req.name) + '</span>' +
                    '<span class="saved-req-time">' + timeAgo + '</span>' +
                    '</div>' +
                    '<div class="saved-req-url" title="' + escapeHtml(req.url) + '">' + escapeHtml(displayUrl) + '</div>' +
                    '</div>' +
                    '<button class="saved-req-delete" title="Delete">' +
                    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                    '<polyline points="3 6 5 6 21 6"></polyline>' +
                    '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>' +
                    '</svg>' +
                    '</button>';
                item.querySelector('.saved-req-main').onclick = function() { loadRequestById(req.id); };
                item.querySelector('.saved-req-delete').onclick = function(e) { e.stopPropagation(); deleteRequestById(req.id, e); };
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

        // Update panel title when URL or method changes
        function updatePanelTitle() {
            const url = document.getElementById('url').value.trim();
            const method = document.getElementById('method').value;
            vscode.postMessage({
                command: 'updateTitle',
                url: url,
                method: method
            });
        }

        document.getElementById('url')?.addEventListener('input', updatePanelTitle);
        document.getElementById('method')?.addEventListener('change', updatePanelTitle);

        function loadRequest(req, activateTab = 'headers') {
            document.getElementById('method').value = req.method;
            document.getElementById('url').value = req.url;
            document.getElementById('contentType').value = req.contentType || 'application/json';
            
            // Handle form data from cURL import
            if (req.formData && req.formData.length > 0) {
                // Form data varsa body'yi form formatında göster
                const formBody = req.formData.map(function(f) {
                    if (f.type === 'file') {
                        return f.key + '=@[' + (f.filename || 'file') + ']';
                    }
                    return f.key + '=' + f.value;
                }).join('\n');
                document.getElementById('bodyInput').value = formBody;
            } else {
                document.getElementById('bodyInput').value = req.body || '';
            }
            
            // Handle file upload indicator in body
            if (req.bodyFile) {
                showToast('Note: File upload "@' + req.bodyFile + '" needs manual handling');
            }
            
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
            
            // Tab switching logic
            const hasQueryParams = req.queryParams && req.queryParams.length > 0;
            const hasFormData = req.formData && req.formData.length > 0;
            
            // Eğer query parametreleri varsa ve import ediliyorsa query tab'ını aktif yap
            if (hasQueryParams && activateTab === 'query') {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                document.querySelector('[data-tab="query"]').classList.add('active');
                document.getElementById('queryTab').classList.add('active');
            } else if (hasFormData) {
                // Form data varsa body tab'ını aç
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                document.querySelector('[data-tab="body"]').classList.add('active');
                document.getElementById('bodyTab').classList.add('active');
                showToast('Form data imported - check Body tab');
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
        console.log('initApp completed successfully');
        }

        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initApp);
        } else {
            initApp();
        }