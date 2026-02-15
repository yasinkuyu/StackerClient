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
let requestHistory = [];
let authTokens = {};
let isLoading = false;
let isSyncing = false;

// Performance: Debounce helper
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Performance: Persistent measurement element for autoExpandKey
let measurementSpan = null;
function getMeasurementSpan() {
    if (!measurementSpan) {
        measurementSpan = document.createElement('span');
        measurementSpan.style.visibility = 'hidden';
        measurementSpan.style.position = 'absolute';
        measurementSpan.style.top = '-9999px';
        measurementSpan.style.whiteSpace = 'pre';
        document.body.appendChild(measurementSpan);
    }
    return measurementSpan;
}

function initApp() {
    console.log('initApp started');

    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab + 'Tab').classList.add('active');
            updateTabCounts();
        });
    });

    function updateBadge(id, count) {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = count > 0 ? count : '';
            el.style.display = count > 0 ? 'inline-block' : 'none';
        }
    }

    const debouncedUpdateTabCounts = debounce(() => {
        // Headers
        const headerCount = Array.from(document.querySelectorAll('#headersContainer .key-value-row'))
            .filter(row => {
                const k = row.querySelector('.header-key')?.value.trim();
                const v = row.querySelector('.header-value')?.value.trim();
                return k || v;
            }).length;
        updateBadge('headersTabCount', headerCount);

        // Query
        const queryCount = Array.from(document.querySelectorAll('#queryContainer .key-value-row'))
            .filter(row => {
                const k = row.querySelector('.query-key')?.value.trim();
                const v = row.querySelector('.query-value')?.value.trim();
                return k || v;
            }).length;
        updateBadge('queryTabCount', queryCount);

        // Body
        const activeBodyType = document.querySelector('input[name="bodyType"]:checked')?.value;
        let bodyCount = 0;
        if (activeBodyType === 'form-data' || activeBodyType === 'urlencoded') {
            const containerId = activeBodyType === 'form-data' ? 'formDataContainer' : 'urlencodedContainer';
            const container = document.getElementById(containerId);
            if (container) {
                bodyCount = Array.from(container.querySelectorAll('.key-value-row'))
                    .filter(row => {
                        const k = row.querySelector('input[class*="-key"]')?.value.trim();
                        const v = row.querySelector('input[class*="-value"]')?.value.trim();
                        return k || v;
                    }).length;
            }
        }
        updateBadge('bodyTabCount', bodyCount);
    }, 200);

    window.updateTabCounts = function () {
        debouncedUpdateTabCounts();
    };

    window.autoExpandKey = function (input) {
        if (!input) return;
        const span = getMeasurementSpan();
        span.style.font = window.getComputedStyle(input).font;
        span.textContent = input.value || input.placeholder || '';

        const width = Math.max(150, span.offsetWidth + 32);
        input.style.width = width + 'px';

        // If it's inside an autocomplete container, expand that too
        if (input.parentElement.classList.contains('autocomplete-container')) {
            input.parentElement.style.width = width + 'px';
        }
    };

    function removeExistingHeader(headerKey) {
        const rows = document.querySelectorAll('#headersContainer .key-value-row');
        rows.forEach(row => {
            const keyInput = row.querySelector('.header-key');
            if (keyInput && keyInput.value.trim().toLowerCase() === headerKey.toLowerCase()) {
                row.remove();
            }
        });
    }

    window.showAuthFields = function (type) {
        document.querySelectorAll('.auth-fields').forEach(f => f.classList.remove('active'));
        const activeField = document.getElementById('authFields_' + type);
        if (activeField) {
            activeField.classList.add('active');
        }
    };

    window.toggleSavedTokens = function () {
        const panel = document.getElementById('savedTokensPanel');
        const chevron = document.getElementById('savedTokensChevron');
        const isHidden = panel.style.display === 'none';
        panel.style.display = isHidden ? 'block' : 'none';
        chevron.classList.toggle('expanded', isHidden);
    };

    function getAuthData() {
        const type = document.getElementById('authTypeSelect').value;
        const data = { type: type };

        switch (type) {
            case 'bearer':
                data.token = document.getElementById('authBearerToken').value.trim();
                data.prefix = document.getElementById('authBearerPrefix').value.trim();
                break;
            case 'basic':
                data.username = document.getElementById('authBasicUser').value.trim();
                data.password = document.getElementById('authBasicPass').value.trim();
                break;
            case 'apikey':
                data.key = document.getElementById('authApiKeyKey').value.trim();
                data.value = document.getElementById('authApiKeyValue').value.trim();
                data.addTo = document.getElementById('authApiKeyAddTo').value;
                break;
            case 'digest':
                data.username = document.getElementById('authDigestUser').value.trim();
                data.password = document.getElementById('authDigestPass').value.trim();
                break;
            case 'oauth2':
                data.token = document.getElementById('authOAuth2Token').value.trim();
                data.prefix = document.getElementById('authOAuth2Prefix').value.trim();
                data.addTo = document.getElementById('authOAuth2TokenType').value;
                break;
            case 'custom':
                data.key = document.getElementById('authCustomKey').value.trim();
                data.value = document.getElementById('authCustomValue').value.trim();
                break;
        }
        return data;
    }
    window.showBodyFields = function (type) {
        document.querySelectorAll('.body-fields').forEach(f => f.classList.remove('active'));
        const activeField = document.getElementById('bodyFields_' + type);
        if (activeField) {
            activeField.classList.add('active');

            // Add default row if empty for form-data or urlencoded
            if (type === 'form-data' || type === 'urlencoded') {
                const containerId = type === 'form-data' ? 'formDataContainer' : 'urlencodedContainer';
                const container = document.getElementById(containerId);
                if (container && container.children.length === 0) {
                    addBodyRow(type);
                }
            }
        }
        updateTabCounts();
    };

    window.addBodyRow = function (type, key = '', value = '', checked = true) {
        const containerId = type === 'form-data' ? 'formDataContainer' : 'urlencodedContainer';
        const container = document.getElementById(containerId);
        const row = document.createElement('div');
        row.className = 'key-value-row';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'row-checkbox';
        checkbox.checked = checked;
        checkbox.addEventListener('change', () => {
            row.style.opacity = checkbox.checked ? '1' : '0.5';
            keyInput.disabled = !checkbox.checked;
            valInput.disabled = !checkbox.checked;
        });

        const keyInput = document.createElement('input');
        keyInput.type = 'text';
        keyInput.placeholder = 'Key';
        keyInput.className = type === 'form-data' ? 'form-data-key' : 'urlencoded-key';
        keyInput.value = key;
        keyInput.addEventListener('input', () => {
            autoExpandKey(keyInput);
            updateTabCounts();
        });
        setTimeout(() => autoExpandKey(keyInput), 0);

        const valInput = document.createElement('input');
        valInput.type = 'text';
        valInput.placeholder = 'Value';
        valInput.className = type === 'form-data' ? 'form-data-value' : 'urlencoded-value';
        valInput.value = value;
        valInput.addEventListener('input', () => updateTabCounts());
        valInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addBodyRow(type);
            }
        });

        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn-remove';
        removeBtn.innerHTML = '×';
        removeBtn.onclick = () => {
            row.remove();
            updateTabCounts();
        };

        row.appendChild(checkbox);
        row.appendChild(keyInput);
        row.appendChild(valInput);
        row.appendChild(removeBtn);
        container.appendChild(row);
        keyInput.focus();
        updateTabCounts();
    };

    window.updateRawContentType = function (value) {
        // Option to handle placeholder changes here if needed
    };

    function getBodyData() {
        const type = document.querySelector('input[name="bodyType"]:checked')?.value || 'none';
        const data = { type: type };

        if (type === 'form-data' || type === 'urlencoded') {
            const containerId = type === 'form-data' ? 'formDataContainer' : 'urlencodedContainer';
            const rows = document.querySelectorAll(`#${containerId} .key-value-row`);
            const items = [];
            rows.forEach(row => {
                const keyInput = row.querySelector('input[type="text"]:first-of-type');
                const valInput = row.querySelector('input[type="text"]:last-of-type');
                const key = keyInput ? keyInput.value.trim() : '';
                const value = valInput ? valInput.value.trim() : '';
                const checked = row.querySelector('.row-checkbox').checked;
                if (key) items.push({ key, value, checked });
            });
            data.items = items;
        } else if (type === 'raw') {
            data.value = document.getElementById('bodyInput').value;
            data.contentType = document.getElementById('bodyRawType').value;
        }
        return data;
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

    window.addHeaderRow = function (key = '', value = '', checked = true) {
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
        keyInput.value = key;
        keyInput.className = 'header-key';
        keyInput.addEventListener('input', () => {
            autoExpandKey(keyInput);
            updateTabCounts();
        });
        if (!checked) keyInput.disabled = true;
        setTimeout(() => autoExpandKey(keyInput), 0);

        const valueInput = document.createElement('input');
        valueInput.type = 'text';
        valueInput.placeholder = 'Value';
        valueInput.className = 'header-value';
        valueInput.value = value;
        if (!checked) valueInput.disabled = true;
        valueInput.addEventListener('input', () => updateTabCounts());
        valueInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addHeaderRow();
            }
        });

        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn-remove';
        removeBtn.innerHTML = '×';
        removeBtn.title = 'Remove header';
        removeBtn.addEventListener('click', () => {
            row.remove();
            updateTabCounts();
        });

        row.appendChild(checkbox);
        row.appendChild(keyContainer);
        row.appendChild(valueInput);
        row.appendChild(removeBtn);
        container.appendChild(row);

        keyInput.focus();
        updateTabCounts();
    };

    window.addQueryRow = function (key = '', value = '', checked = true) {
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
            syncQueryToUrl();
        });

        const keyInput = document.createElement('input');
        keyInput.type = 'text';
        keyInput.placeholder = 'Parameter name';
        keyInput.className = 'query-key';
        keyInput.value = key;
        if (!checked) keyInput.disabled = true;
        keyInput.addEventListener('input', () => {
            syncQueryToUrl();
            autoExpandKey(keyInput);
            updateTabCounts();
        });
        setTimeout(() => autoExpandKey(keyInput), 0);

        const valueInput = document.createElement('input');
        valueInput.type = 'text';
        valueInput.placeholder = 'Value';
        valueInput.className = 'query-value';
        valueInput.value = value;
        if (!checked) valueInput.disabled = true;
        valueInput.addEventListener('input', () => {
            syncQueryToUrl();
            updateTabCounts();
        });
        valueInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addQueryRow();
            }
        });

        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn-remove';
        removeBtn.innerHTML = '×';
        removeBtn.title = 'Remove parameter';
        removeBtn.addEventListener('click', () => {
            row.remove();
            syncQueryToUrl();
            updateTabCounts();
        });

        row.appendChild(checkbox);
        row.appendChild(keyInput);
        row.appendChild(valueInput);
        row.appendChild(removeBtn);
        container.appendChild(row);

        keyInput.focus();
        updateTabCounts();
    };

    function syncUrlToQuery() {
        if (isSyncing) return;
        isSyncing = true;
        try {
            const urlValue = document.getElementById('url').value.trim();
            if (!urlValue || (!urlValue.startsWith('http://') && !urlValue.startsWith('https://'))) {
                isSyncing = false;
                return;
            }

            const url = new URL(urlValue);
            const container = document.getElementById('queryContainer');
            container.innerHTML = '';

            url.searchParams.forEach((value, key) => {
                addQueryRow(key, value);
            });
        } catch (e) {
            // Invalid URL, just skip
        }
        isSyncing = false;
    }

    function syncQueryToUrl() {
        if (isSyncing) return;
        isSyncing = true;
        try {
            const urlInput = document.getElementById('url');
            let urlValue = urlInput.value.trim();
            if (!urlValue) {
                isSyncing = false;
                return;
            }

            const queryRows = document.querySelectorAll('#queryContainer .key-value-row');
            const params = new URLSearchParams();

            queryRows.forEach(row => {
                const checkbox = row.querySelector('.row-checkbox');
                if (checkbox && checkbox.checked) {
                    const key = row.querySelector('.query-key').value.trim();
                    const value = row.querySelector('.query-value').value.trim();
                    if (key) params.append(key, value);
                }
            });

            const baseUrl = urlValue.split('?')[0];
            const queryString = params.toString();
            urlInput.value = queryString ? `${baseUrl}?${queryString}` : baseUrl;
        } catch (e) {
            console.error('Sync error:', e);
        }
        isSyncing = false;
    }

    const urlInput = document.getElementById('url');
    if (urlInput) {
        const debouncedSync = debounce(() => syncUrlToQuery(), 300);
        urlInput.addEventListener('input', () => debouncedSync());
        urlInput.addEventListener('paste', () => setTimeout(syncUrlToQuery, 0));
    }

    const escaper = document.createElement('div');
    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        escaper.textContent = text;
        return escaper.innerHTML;
    }

    // Button handlers removed - now using inline onclick in body.html

    // User-Agent and Referer custom handler
    const userAgentSelect = document.getElementById('userAgentSelect');
    const customUserAgentRow = document.getElementById('customUserAgentRow');
    if (userAgentSelect) {
        userAgentSelect.addEventListener('change', () => {
            if (userAgentSelect.value === 'custom') {
                customUserAgentRow.style.display = 'block';
                document.getElementById('customUserAgentInput').focus();
            } else {
                customUserAgentRow.style.display = 'none';
            }
        });
    }

    const refererSelect = document.getElementById('refererSelect');
    const customRefererRow = document.getElementById('customRefererRow');
    if (refererSelect) {
        refererSelect.addEventListener('change', () => {
            if (refererSelect.value === 'custom') {
                customRefererRow.style.display = 'block';
                document.getElementById('customRefererInput').focus();
            } else {
                customRefererRow.style.display = 'none';
            }
        });
    }

    const sidebarDefaultView = document.getElementById('sidebarDefaultView');
    if (sidebarDefaultView) {
        sidebarDefaultView.addEventListener('change', () => {
            vscode.postMessage({
                command: 'updateSetting',
                key: 'stacker.sidebar.defaultView',
                value: sidebarDefaultView.value
            });
        });
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
        // Tüm header'ları topla (checked durumu ile birlikte)
        const headerRows = document.querySelectorAll('#headersContainer .key-value-row');
        const allHeaders = [];
        const activeHeaders = [];

        headerRows.forEach(row => {
            const checkbox = row.querySelector('.row-checkbox');
            const keyInput = row.querySelector('.header-key');
            const valueInput = row.querySelector('.header-value');
            const key = keyInput?.value.trim();
            const value = valueInput?.value.trim();
            const checked = checkbox ? checkbox.checked : true;
            if (key) {
                allHeaders.push({ key, value, checked });
                if (checked) {
                    activeHeaders.push({ key, value });
                }
            }
        });

        // Tüm query parametrelerini topla (checked durumu ile birlikte)
        const queryRows = document.querySelectorAll('#queryContainer .key-value-row');
        const allQueryParams = [];
        const activeQueryParams = [];

        queryRows.forEach(row => {
            const checkbox = row.querySelector('.row-checkbox');
            const keyInput = row.querySelector('.query-key');
            const valueInput = row.querySelector('.query-value');
            const key = keyInput?.value.trim();
            const value = valueInput?.value.trim();
            const checked = checkbox ? checkbox.checked : true;
            if (key) {
                allQueryParams.push({ key, value, checked });
                if (checked) {
                    activeQueryParams.push({ key, value });
                }
            }
        });

        // URL'e sadece aktif query parametrelerini ekle (gönderim için)
        let url = document.getElementById('url').value.trim();
        // Mevcut query string'i temizle
        const baseUrl = url.split('?')[0];
        let fullUrl = baseUrl;
        if (activeQueryParams.length > 0) {
            const queryString = activeQueryParams.map(p => encodeURIComponent(p.key) + '=' + encodeURIComponent(p.value)).join('&');
            fullUrl = baseUrl + '?' + queryString;
        }

        return {
            method: document.getElementById('method').value,
            url: fullUrl,
            baseUrl: baseUrl,
            headers: activeHeaders,
            allHeaders: allHeaders,
            contentType: document.getElementById('contentType').value,
            body: document.getElementById('bodyInput').value,
            queryParams: allQueryParams,
            auth: getAuthData(),
            bodyData: getBodyData(),
            bypassWAF: document.getElementById('bypassWAF')?.checked || false,
            userAgent: userAgentSelect?.value === 'custom'
                ? document.getElementById('customUserAgentInput')?.value.trim()
                : (userAgentSelect?.value || ''),
            referer: refererSelect?.value === 'custom'
                ? document.getElementById('customRefererInput')?.value.trim()
                : (refererSelect?.value || '')
        };
    }

    // Repeat Request Logic
    let repeatTimerId = null;
    let countdownTimerId = null;
    let countdownValue = 0;

    function stopRepeat() {
        if (repeatTimerId) {
            clearInterval(repeatTimerId);
            repeatTimerId = null;
        }
        if (countdownTimerId) {
            clearInterval(countdownTimerId);
            countdownTimerId = null;
        }
        const sendBtn = document.getElementById('sendBtn');
        if (sendBtn) {
            sendBtn.innerHTML = 'Send';
            sendBtn.classList.remove('repeating');
        }
    }

    function startRepeat(intervalSeconds) {
        stopRepeat(); // Ensure clean start

        const sendBtn = document.getElementById('sendBtn');
        if (!sendBtn) return;

        sendBtn.classList.add('repeating');

        // Initial request
        executeRequest();

        countdownValue = intervalSeconds;

        const updateButtonText = () => {
            sendBtn.innerHTML = `Stop (${Math.ceil(countdownValue)}s)`;
        };

        updateButtonText();

        countdownTimerId = setInterval(() => {
            countdownValue -= 1;
            if (countdownValue <= 0) {
                if (!isLoading) {
                    executeRequest();
                }
                countdownValue = intervalSeconds;
            }
            updateButtonText();
        }, 1000);
    }

    function executeRequest() {
        const request = getCurrentRequest();

        if (!request.url) {
            showToast('Please enter a URL');
            const urlInput = document.getElementById('url');
            if (urlInput) urlInput.focus();
            stopRepeat();
            return;
        }

        if (!request.url.startsWith('http://') && !request.url.startsWith('https://')) {
            showToast('URL must start with http:// or https://');
            const urlInput = document.getElementById('url');
            if (urlInput) urlInput.focus();
            stopRepeat();
            return;
        }

        clearResponse();
        setLoading(true);
        vscode.postMessage({ command: 'sendRequest', request });
    }

    // Send button handler
    const sendBtn = document.getElementById('sendBtn');
    console.log('sendBtn element:', sendBtn);
    if (sendBtn) {
        sendBtn.addEventListener('click', () => {
            console.log('Send button clicked!');

            // Eğer tekrarlayan moddaysak ve buton üzerinde "Stop" yazıyorsa (veya repeating class'ı varsa) durdur
            if (sendBtn.classList.contains('repeating')) {
                stopRepeat();
                return;
            }

            executeRequest();
        });
    }

    // Dropdown handlers
    const repeatBtn = document.getElementById('repeatBtn');
    const repeatMenu = document.getElementById('repeatMenu');

    if (repeatBtn && repeatMenu) {
        repeatBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            repeatMenu.classList.toggle('show');
        });

        document.addEventListener('click', () => {
            repeatMenu.classList.remove('show');
        });

        repeatMenu.querySelectorAll('.dropdown-item[data-interval]').forEach(item => {
            item.addEventListener('click', () => {
                const interval = parseInt(item.dataset.interval);
                startRepeat(interval);
                repeatMenu.classList.remove('show');
            });
        });

        const customIntervalBtn = document.getElementById('customIntervalBtn');
        if (customIntervalBtn) {
            customIntervalBtn.addEventListener('click', () => {
                repeatMenu.classList.remove('show');
                vscode.postMessage({
                    command: 'showInputBox',
                    prompt: 'Enter repeat interval in seconds',
                    value: '60'
                });

                // Set a temporary callback for custom interval
                window.handleIntervalResponse = function (value) {
                    const seconds = parseInt(value);
                    if (!isNaN(seconds) && seconds > 0) {
                        startRepeat(seconds);
                    } else if (value !== undefined) {
                        showToast('Invalid interval');
                    }
                    window.handleIntervalResponse = null;
                };
            });
        }
    }

    // Auth Sub-tab switching
    window.showAuthTab = function (tabName, evt) {
        // Toggle tabs
        document.querySelectorAll('.auth-sub-tab').forEach(t => t.classList.remove('active'));
        if (evt && evt.target) {
            evt.target.classList.add('active');
        }

        // Toggle content
        document.querySelectorAll('.auth-tab-content').forEach(c => c.classList.remove('active'));
        const tabContent = document.getElementById(tabName);
        if (tabContent) {
            tabContent.classList.add('active');
        } else {
            console.error('Tab content not found:', tabName);
        }
    };

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
            let defaultName = 'untitled';
            try {
                const urlObj = new URL(request.url);
                if (urlObj.pathname && urlObj.pathname !== '/') {
                    defaultName = urlObj.pathname.split('/').pop() || urlObj.pathname;
                } else {
                    defaultName = urlObj.hostname;
                }
            } catch (e) {
                console.warn('URL parsing failed for name suggestion', e);
                defaultName = 'request-' + new Date().toLocaleTimeString();
            }

            // Eğer mevcut bir request güncelliyorsak, isim sormadan doğrudan kaydet
            if (currentRequestId) {
                // Mevcut request'in ismini bul
                const existingReq = savedRequests.find(r => r.id === currentRequestId);
                const existingName = existingReq ? existingReq.name : defaultName;
                window.handleInputBoxResponse(existingName);
            } else {
                // Yeni kayıt — isim sor
                vscode.postMessage({
                    command: 'showInputBox',
                    prompt: 'Enter request name',
                    value: defaultName
                });
            }
        });
    }

    // Input box yanıtı için callback
    window.handleInputBoxResponse = function (name) {
        if (name === undefined) return;

        const request = getCurrentRequest();
        const defaultName = request.url ? (new URL(request.url).pathname || 'root') : 'untitled';

        const requestToSave = {
            id: currentRequestId || Date.now().toString(),
            name: name || defaultName,
            method: request.method,
            url: request.baseUrl || request.url,
            headers: request.allHeaders || request.headers,
            contentType: request.contentType,
            body: request.body,
            queryParams: request.queryParams,
            bypassWAF: request.bypassWAF,
            userAgent: request.userAgent,
            referer: request.referer
        };

        const isUpdate = !!currentRequestId;
        currentRequestId = requestToSave.id;
        vscode.postMessage({ command: 'saveRequest', request: requestToSave });
        showToast(isUpdate ? 'Request updated!' : 'Request saved!');
        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn) saveBtn.textContent = 'Update';
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
                break;
            case 'inputBoxResponse':
                if (window.handleIntervalResponse) {
                    window.handleIntervalResponse(message.result);
                } else if (window.handleInputBoxResponse) {
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
            case 'history':
                requestHistory = message.history || [];
                displayHistory();
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
            const isWrapped = settings.editorWordWrap;
            document.getElementById('responseBody').style.wordWrap = isWrapped ? 'break-word' : 'normal';
            document.getElementById('responseBody').style.whiteSpace = isWrapped ? 'pre-wrap' : 'pre';

            const btn = document.getElementById('wordWrapToggle');
            if (btn) btn.classList.toggle('active', isWrapped);
        }

        // Apply theme (auto follows VS Code, light/dark force specific theme)
        if (settings.theme && settings.theme !== 'auto') {
            document.body.classList.remove('theme-light', 'theme-dark');
            document.body.classList.add('theme-' + settings.theme);
        }

        // Apply sidebar default view
        if (settings.sidebarDefaultView) {
            const sidebarEl = document.getElementById('sidebarDefaultView');
            if (sidebarEl) sidebarEl.value = settings.sidebarDefaultView;
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
            item.querySelector('.use-btn').onclick = function () { useToken(name); };
            item.querySelector('.delete-btn').onclick = function () { deleteToken(name); };
            container.appendChild(item);
        });
    }

    function useToken(name) {
        const token = authTokens[name];
        if (token) {
            document.getElementById('authTypeSelect').value = 'bearer';
            showAuthFields('bearer');
            document.getElementById('authBearerToken').value = token;
            showToast('Token "' + name + '" applied to Bearer Token auth');
        }
    }

    function deleteToken(name) {
        vscode.postMessage({ command: 'deleteAuthToken', name: name });
    }

    // Response tab switching
    window.showResTab = function (tabName, evt) {
        document.querySelectorAll('.res-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.res-tab-content').forEach(c => c.classList.remove('active'));
        if (evt && evt.target) {
            evt.target.classList.add('active');
        } else {
            // Find the tab button for this tabName if evt is missing
            const tabBtn = document.querySelector(`[onclick*="${tabName}"]`);
            if (tabBtn) tabBtn.classList.add('active');
        }
        document.getElementById(tabName).classList.add('active');

        // Show/hide shared content
        const sharedContent = document.getElementById('sharedResponseContent');
        if (sharedContent) {
            sharedContent.style.display = (tabName === 'resBody' || tabName === 'resTests') ? 'block' : 'none';
        }
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
    let bodyViewMode = 'raw'; // 'raw' or 'preview'
    let headersViewMode = 'table'; // 'table' or 'raw'

    function displayResponse(response) {
        currentResponse = response;
        const responseEl = document.getElementById('response');
        if (responseEl) {
            responseEl.style.display = 'block';
            // Scroll to response for better visibility
            responseEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

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

        // Chunked indicator
        const chunkedEl = document.getElementById('chunkedIndicator');
        if (chunkedEl) {
            if (response.isChunked) {
                chunkedEl.style.display = 'inline';
            } else {
                chunkedEl.style.display = 'none';
            }
        }

        // Detect content type
        const contentType = response.headers['content-type'] || response.headers['Content-Type'] || '';
        const isHtml = contentType.includes('html');
        const isJson = contentType.includes('json');
        const responseTypeEl = document.getElementById('responseType');
        if (responseTypeEl) {
            if (isJson) {
                responseTypeEl.textContent = 'JSON';
            } else if (isHtml) {
                responseTypeEl.textContent = 'HTML';
            } else if (contentType.includes('xml')) {
                responseTypeEl.textContent = 'XML';
            } else if (contentType.includes('text')) {
                responseTypeEl.textContent = 'TEXT';
            } else {
                responseTypeEl.textContent = contentType.split(';')[0] || 'Response';
            }
        }

        // Show/hide body view toggle and extraction tab based on content type
        const bodyViewToggle = document.getElementById('bodyViewToggle');
        const expandBtn = document.getElementById('expandBtn');
        const collapseBtn = document.getElementById('collapseBtn');
        const extractionTab = document.querySelector('[onclick*="resTests"]');

        if (isHtml || contentType.includes('xml')) {
            if (extractionTab) extractionTab.style.display = 'block';
            bodyViewToggle.style.display = 'flex';
            expandBtn.style.display = 'none';
            collapseBtn.style.display = 'none';
            bodyViewMode = 'raw';
            updateBodyView();
        } else if (isJson) {
            if (extractionTab) extractionTab.style.display = 'block';
            bodyViewToggle.style.display = 'none';
            expandBtn.style.display = 'flex';
            collapseBtn.style.display = 'flex';
        } else {
            if (extractionTab) extractionTab.style.display = 'none';
            bodyViewToggle.style.display = 'none';
            expandBtn.style.display = 'none';
            collapseBtn.style.display = 'none';
        }

        // Headers - table format
        const headersContainer = document.getElementById('responseHeaders');
        const headersRawEl = document.getElementById('responseHeadersRaw');
        const headerKeys = Object.keys(response.headers);
        const headersCountEl = document.getElementById('headersCount');
        if (headersCountEl) {
            headersCountEl.textContent = headerKeys.length;
        }

        let headersHtml = '';
        if (response.interpolatedUrl) {
            headersHtml += '<div class="header-row" style="background:rgba(167,139,250,0.1);">';
            headersHtml += '<span class="header-key" style="color:#a78bfa;">Interpolated URL</span>';
            headersHtml += '<span class="header-value">' + escapeHtml(response.interpolatedUrl) + '</span>';
            headersHtml += '</div>';
        }
        headerKeys.forEach(function (key) {
            headersHtml += '<div class="header-row">';
            headersHtml += '<span class="header-key">' + escapeHtml(key) + '</span>';
            headersHtml += '<span class="header-value">' + escapeHtml(String(response.headers[key])) + '</span>';
            headersHtml += '</div>';
        });
        headersContainer.innerHTML = headersHtml;

        // Headers raw format
        let headersRaw = '';
        if (response.interpolatedUrl) {
            headersRaw += 'Interpolated URL: ' + response.interpolatedUrl + '\n';
        }
        headerKeys.forEach(function (key) {
            headersRaw += key + ': ' + String(response.headers[key]) + '\n';
        });
        headersRawEl.textContent = headersRaw;

        // Body - with JSON tree viewer or HTML preview
        const bodyEl = document.getElementById('responseBody');
        const previewEl = document.getElementById('responsePreview');
        const previewFrame = document.getElementById('previewFrame');
        var jsonData = null;

        // Reset body view
        bodyEl.style.display = 'block';
        previewEl.style.display = 'none';

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

        // Check for hex/binary response
        if (response.body && response.body.__hex__) {
            bodyEl.innerHTML = renderHexViewer(response.body);
            // Hide expand/collapse for hex
            if (expandBtn) expandBtn.style.display = 'none';
            if (collapseBtn) collapseBtn.style.display = 'none';
            if (bodyViewToggle) bodyViewToggle.style.display = 'none';
        } else if (response.body && response.body.__formData__) {
            // Handle multipart/form-data response
            bodyEl.innerHTML = renderFormData(response.body);
        } else if (jsonData !== null) {
            bodyEl.innerHTML = '<div class="json-tree">' + renderJSONTree(jsonData, 0) + '</div>';
        } else if (isHtml || contentType.includes('xml')) {
            bodyEl.innerHTML = highlightHTML(response.body);
        } else {
            bodyEl.textContent = response.body;
        }

        // Render Form Data
        function renderFormData(formData) {
            let html = '<div class="formdata-viewer">';
            html += '<div class="formdata-header">';
            html += `<span class="formdata-type">multipart/form-data</span>`;
            html += `<span class="formdata-boundary">Boundary: ${escapeHtml(formData.boundary || '')}</span>`;
            html += '</div>';

            if (formData.parts && formData.parts.length > 0) {
                html += '<div class="formdata-parts">';
                formData.parts.forEach((part, idx) => {
                    html += '<div class="formdata-part">';
                    html += `<div class="formdata-part-header">Part ${idx + 1}</div>`;

                    if (part.filename) {
                        html += `<div class="formdata-field"><span class="field-label">Filename:</span> <span class="field-value">${escapeHtml(part.filename)}</span></div>`;
                    }
                    if (part.name) {
                        html += `<div class="formdata-field"><span class="field-label">Name:</span> <span class="field-value">${escapeHtml(part.name)}</span></div>`;
                    }
                    if (part.contentType) {
                        html += `<div class="formdata-field"><span class="field-label">Type:</span> <span class="field-value">${escapeHtml(part.contentType)}</span></div>`;
                    }
                    html += `<div class="formdata-field"><span class="field-label">Content:</span></div>`;
                    html += `<pre class="formdata-content">${escapeHtml(part.body || '')}</pre>`;

                    html += '</div>';
                });
                html += '</div>';
            } else {
                html += '<pre class="formdata-raw">' + escapeHtml(formData.raw || '') + '</pre>';
            }

            html += '</div>';
            return html;
        }

        function highlightHTML(html) {
            if (!html) return '';

            // Performance: Limit highlighting for very large bodies
            if (html.length > 100000) {
                return '<code class="html-highlighted">' + escapeHtml(html) + '</code>';
            }

            var escaped = escapeHtml(html);
            // Use placeholder markers instead of real <span> tags during regex
            // to prevent later regex steps from matching generated span attributes.
            // \x01CLASS\x02 will become <span class="CLASS"> at the end
            // \x03 will become </span> at the end
            var h = escaped
                .replace(/&lt;!--[\s\S]*?--&gt;/g, '\x01token-comment\x02$&\x03')
                .replace(/(&lt;!DOCTYPE\s+[^&]*&gt;)/gi, '\x01token-doctype\x02$&\x03')
                .replace(/(&lt;\/?)([a-z][a-z0-9-]*)/gi, '$1\x01token-tag\x02$2\x03')
                .replace(/(\s+)([a-z][a-z0-9_:-]*)(\s*=\s*)(&quot;[\s\S]*?&quot;|&#39;[\s\S]*?&#39;|[^\s&>\x01]+)/gi,
                    '$1\x01token-attr-name\x02$2\x03$3\x01token-attr-value\x02$4\x03')
                .replace(/&lt;/g, '\x01token-bracket\x02&lt;\x03')
                .replace(/\/?&gt;/g, '\x01token-bracket\x02$&\x03');
            // Now convert markers to real spans (safe - no more regex processing)
            h = h.replace(/\x01([^\x02]*)\x02/g, '<span class="$1">').replace(/\x03/g, '</span>');
            // Line numbers
            var lines = h.split('\n');
            var numbered = lines.map(function (line, i) {
                return '<span class="line-number">' + (i + 1) + '</span>' + line;
            }).join('\n');
            return '<code class="html-highlighted">' + numbered + '</code>';
        }

        // Hex Viewer - Custom implementation
        function renderHexViewer(hexData) {
            const size = hexData.size;
            const truncated = hexData.truncated;
            const mime = hexData.mimeType || 'unknown';

            const hexStr = hexData.hex || '';

            let html = '<div class="hex-viewer">';
            html += '<div class="hex-header">';
            html += `<span class="hex-type">Binary</span>`;
            html += `<span class="hex-mime">${escapeHtml(mime)}</span>`;
            html += `<span class="hex-size">${formatBytes(size)}</span>`;
            if (truncated) {
                html += `<span class="hex-truncated">(Showing first 1MB)</span>`;
            }
            html += '</div>';
            html += '<div class="hex-content">';

            // Use manual hex rendering
            html += renderHexManual(hexStr);

            html += '</div></div>';
            return html;
        }

        // Manual hex render fallback
        function renderHexManual(hex) {
            let html = '';
            const bytes = hex.split(' ');
            for (let i = 0; i < bytes.length; i += 16) {
                const lineBytes = bytes.slice(i, i + 16);
                const offset = i.toString(16).padStart(8, '0');
                const hexPart = lineBytes.join(' ');
                const asciiPart = lineBytes.map(b => {
                    const code = parseInt(b, 16);
                    return code >= 32 && code <= 126 ? String.fromCharCode(code) : '.';
                }).join('');

                html += '<div class="hex-line">';
                html += `<span class="hex-offset">${offset}</span>`;
                html += `<span class="hex-bytes">${hexPart}</span>`;
                html += `<span class="hex-ascii">${escapeHtml(asciiPart)}</span>`;
                html += '</div>';
            }
            return html;
        }

        // Format bytes to human readable
        function formatBytes(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }


        // Setup HTML preview using srcdoc (more secure and CSP-friendly)
        if (isHtml && response.body) {
            // Sanitize and prepare HTML for preview
            let htmlContent = response.body;

            // Add base target to prevent links from breaking out
            if (!htmlContent.includes('<base')) {
                htmlContent = htmlContent.replace('<head>', '<head><base target="_blank">');
                if (!htmlContent.includes('<head>')) {
                    htmlContent = '<base target="_blank">' + htmlContent;
                }
            }

            // Use srcdoc for better security and CSP compliance
            previewFrame.srcdoc = htmlContent;
        } else {
            previewFrame.srcdoc = '';
        }

        // Cookies - formatted display
        const cookies = parseCookies(response.headers);
        const cookiesEl = document.getElementById('responseCookies');
        if (cookies.length > 0) {
            let cookiesHtml = '';
            cookies.forEach(function (cookie) {
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
            cookiesEl.innerHTML = '<div class="empty-cookies">No cookies in response</div>';
        }

        // Hex viewer - render in hex tab
        const hexViewerEl = document.getElementById('hexViewer');

        // Try to use hexBody from backend, or generate from response body
        let hexData = null;

        if (response.hexBody && response.hexBody.hex) {
            hexData = response.hexBody;
        } else if (response.body) {
            // Fallback: generate hex from response body
            try {
                const bodyStr = typeof response.body === 'string' ? response.body : JSON.stringify(response.body);
                const encoder = new TextEncoder();
                const bytes = encoder.encode(bodyStr);
                const hexString = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
                hexData = {
                    __hex__: true,
                    hex: hexString,
                    size: bytes.length,
                    truncated: bytes.length > 1048576,
                    mimeType: 'text/plain'
                };
            } catch (e) {
                console.error('Failed to generate hex:', e);
            }
        }

        if (hexData && hexData.hex) {
            hexViewerEl.innerHTML = renderHexViewer(hexData);
        } else {
            hexViewerEl.innerHTML = '<div class="hex-empty">No hex data available</div>';
        }

        // Reset to Body tab
        document.querySelectorAll('.res-tab').forEach(function (t) { t.classList.remove('active'); });
        document.querySelectorAll('.res-tab-content').forEach(function (c) { c.classList.remove('active'); });
        document.querySelector('.res-tab').classList.add('active');
        document.getElementById('resBody').classList.add('active');

        // Reset view modes
        headersViewMode = 'table';
        updateHeadersView();

        responseEl.scrollIntoView({ behavior: 'smooth' });
    }

    // Toggle body view (raw/preview)
    window.toggleBodyView = function () {
        bodyViewMode = bodyViewMode === 'raw' ? 'preview' : 'raw';
        updateBodyView();
    };

    // ── Expression Templates ──
    var defaultTemplates = [
        { type: 'xpath', expr: '//title', label: 'Page Title' },
        { type: 'xpath', expr: '//a/@href', label: 'All Links' },
        { type: 'xpath', expr: '//img/@src', label: 'All Images' },
        { type: 'xpath', expr: '//meta[@name="description"]/@content', label: 'Meta Description' },
        { type: 'xpath', expr: '//h1 | //h2 | //h3', label: 'Headings' },
        { type: 'css', expr: 'a[href]', label: 'Links' },
        { type: 'css', expr: 'img[src]', label: 'Images' },
        { type: 'css', expr: '.error, .warning', label: 'Errors & Warnings' },
        { type: 'regex', expr: '\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b', label: 'Email Addresses' },
        { type: 'regex', expr: 'https?://[^\\s<>"]+', label: 'URLs' },
        { type: 'regex', expr: '\\b\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\b', label: 'IP Addresses' },
        { type: 'jspath', expr: 'data', label: 'Root Data' },
        { type: 'jspath', expr: 'headers', label: 'Headers Object' },
        { type: 'jspath', expr: 'args', label: 'Query Params' }
    ];

    function getCustomTemplates() {
        try {
            var stored = localStorage.getItem('stacker_templates');
            return stored ? JSON.parse(stored) : [];
        } catch (e) { return []; }
    }

    function saveCustomTemplates(templates) {
        localStorage.setItem('stacker_templates', JSON.stringify(templates));
    }

    function getAllTemplates() {
        return defaultTemplates.concat(getCustomTemplates());
    }

    function getActiveType() {
        if (document.getElementById('btn-regex').classList.contains('active')) return 'regex';
        if (document.getElementById('btn-css').classList.contains('active')) return 'css';
        if (document.getElementById('btn-jspath').classList.contains('active')) return 'jspath';
        return 'xpath';
    }

    var editingTemplate = null;

    function renderTemplates() {
        var container = document.getElementById('templatesList');
        if (!container) return;
        var activeType = getActiveType();
        var all = getAllTemplates();
        var filtered = all.filter(function (t) { return t.type === activeType; });
        var customTemplates = getCustomTemplates();

        if (filtered.length === 0) {
            container.innerHTML = '<div style="font-size: 11px; opacity: 0.5; padding: 4px 8px;">No templates for ' + activeType.toUpperCase() + '</div>';
            return;
        }

        var html = '';
        filtered.forEach(function (t, idx) {
            var isCustom = customTemplates.some(function (ct) {
                return ct.type === t.type && ct.expr === t.expr && ct.label === t.label;
            });

            var isEditing = editingTemplate &&
                editingTemplate.type === t.type &&
                editingTemplate.expr === t.expr &&
                editingTemplate.label === t.label;

            var safeExpr = t.expr.replace(/'/g, "\\'").replace(/\\/g, "\\\\");
            var safeLabel = (t.label || t.expr).replace(/'/g, "\\'").replace(/\\/g, "\\\\");

            var onclick = isEditing ? '' : 'onclick="applyTemplate(\'' + t.type + '\', \'' + safeExpr + '\')"';

            html += '<div class="template-item ' + (isEditing ? 'editing' : '') + '" ' + onclick + ' title="' + escapeHtml(t.expr) + '">';
            html += '<span class="tpl-type">' + t.type.toUpperCase() + '</span>';

            if (isEditing) {
                html += '<input type="text" class="tpl-edit-input" value="' + escapeHtml(t.label || t.expr) + '" ' +
                    'onclick="event.stopPropagation()" ' +
                    'onkeydown="if(event.key===\'Enter\') saveEdit(this, \'' + t.type + '\', \'' + safeExpr + '\', \'' + safeLabel + '\')">';
                html += '<div class="tpl-actions visible">';
                html += '<button class="tpl-action-btn save" onclick="event.stopPropagation(); saveEdit(this.parentElement.previousElementSibling, \'' + t.type + '\', \'' + safeExpr + '\', \'' + safeLabel + '\')" title="Save">✓</button>';
                html += '<button class="tpl-action-btn cancel" onclick="event.stopPropagation(); cancelEdit()" title="Cancel">×</button>';
                html += '</div>';
            } else {
                html += '<span class="tpl-name">' + escapeHtml(t.label || t.expr) + '</span>';
                if (isCustom) {
                    html += '<div class="tpl-actions">';
                    html += '<button class="tpl-action-btn edit" onclick="event.stopPropagation(); startEdit(\'' + t.type + '\', \'' + safeExpr + '\', \'' + safeLabel + '\')" title="Rename">✎</button>';
                    html += '<button class="tpl-action-btn delete" onclick="event.stopPropagation(); deleteTemplate(\'' + t.type + '\', \'' + safeExpr + '\', \'' + safeLabel + '\')" title="Delete">×</button>';
                    html += '</div>';
                }
            }
            html += '</div>';
        });
        container.innerHTML = html;

        if (editingTemplate) {
            var input = container.querySelector('.tpl-edit-input');
            if (input) {
                input.focus();
                input.select();
            }
        }
    }

    window.startEdit = function (type, expr, label) {
        editingTemplate = { type: type, expr: expr, label: label };
        renderTemplates();
    };

    window.cancelEdit = function () {
        editingTemplate = null;
        renderTemplates();
    };

    window.saveEdit = function (input, type, expr, oldLabel) {
        if (!input) input = document.querySelector('.tpl-edit-input');
        if (!input) return;
        var newLabel = input.value.trim();
        if (!newLabel) return;

        var customs = getCustomTemplates();
        for (var i = 0; i < customs.length; i++) {
            if (customs[i].type === type && customs[i].expr === expr && customs[i].label === oldLabel) {
                customs[i].label = newLabel;
                break;
            }
        }
        saveCustomTemplates(customs);
        editingTemplate = null;
        renderTemplates();
        showToast('Template renamed');
    };

    window.applyTemplate = function (type, expr) {
        toggleExtractionType(type);
        document.getElementById('extractionPath').value = expr;
    };

    window.saveCurrentTemplate = function () {
        var expr = document.getElementById('extractionPath').value.trim();
        if (!expr) {
            showToast('Enter an expression first');
            return;
        }
        var type = getActiveType();

        // Using truncated expression as default label since prompt() is blocked
        var label = expr.length > 40 ? expr.substring(0, 37) + '...' : expr;

        var customs = getCustomTemplates();
        // Check duplicate
        if (customs.some(function (t) { return t.type === type && t.expr === expr; })) {
            showToast('Template already exists');
            return;
        }
        customs.push({ type: type, expr: expr, label: label });
        saveCustomTemplates(customs);

        // Auto-expand if saved
        const container = document.getElementById('templatesListContainer');
        const chevron = document.getElementById('templatesChevron');
        if (container) container.style.display = 'block';
        if (chevron) chevron.style.rotate = '180deg';

        renderTemplates();
        showToast('Template saved');
    };

    window.toggleTemplatesList = function () {
        const container = document.getElementById('templatesListContainer');
        const chevron = document.getElementById('templatesChevron');
        if (!container) return;

        if (container.style.display === 'none') {
            container.style.display = 'block';
            if (chevron) chevron.style.rotate = '180deg';
        } else {
            container.style.display = 'none';
            if (chevron) chevron.style.rotate = '0deg';
        }
    };

    window.deleteTemplate = function (type, expr, label) {
        var customs = getCustomTemplates();
        customs = customs.filter(function (t) {
            return !(t.type === type && t.expr === expr && t.label === label);
        });
        saveCustomTemplates(customs);
        renderTemplates();
        showToast('Template deleted');
    };

    // Render templates on load
    renderTemplates();

    // Extraction type toggling
    window.toggleExtractionType = function (type) {
        // Update UI
        document.querySelectorAll('.type-toggle-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`btn-${type}`).classList.add('active');

        // Update placeholder based on type
        const input = document.getElementById('extractionPath');
        if (input) {
            if (type === 'xpath') input.placeholder = '//div[@class="content"]';
            else if (type === 'regex') input.placeholder = 'Enter regex pattern (e.g., \\d+ or [a-z]+)';
            else if (type === 'jspath') input.placeholder = 'user.name';
            else if (type === 'css') input.placeholder = '.content > div';
        }

        renderTemplates();
    };

    window.evaluateExtraction = function () {
        if (!currentResponse || !currentResponse.body) {
            showToast('No response body to extract from');
            return;
        }

        let type = getActiveType();
        const path = document.getElementById('extractionPath').value.trim();
        const resultEl = document.getElementById('extractionResult');
        const resultLabel = document.querySelector('.extraction-result-header span');

        if (!path) {
            showToast('Please enter a path or expression');
            return;
        }

        try {
            let result = '';
            const body = typeof currentResponse.body === 'string' ? currentResponse.body : JSON.stringify(currentResponse.body);

            if (type === 'regex') {
                const regex = new RegExp(path, 'g');
                const matches = [];
                let match;
                let textToMatch = typeof currentResponse.body === 'object' ? JSON.stringify(currentResponse.body, null, 2) : body;

                while ((match = regex.exec(textToMatch)) !== null) {
                    matches.push(match[1] || match[0]);
                }
                result = matches.length > 0 ? matches.join('\n') : 'No matches found';
            } else if (type === 'xpath' || type === 'css') {
                const parser = new DOMParser();
                const contentType = currentResponse.headers['content-type'] || 'text/html';
                const docType = contentType.includes('xml') ? 'text/xml' : 'text/html';
                const doc = parser.parseFromString(body, docType);
                const results = [];

                if (type === 'xpath') {
                    const xr = doc.evaluate(path, doc, null, XPathResult.ANY_TYPE, null);
                    if (xr.resultType === XPathResult.NUMBER_TYPE) results.push(xr.numberValue);
                    else if (xr.resultType === XPathResult.STRING_TYPE) results.push(xr.stringValue);
                    else if (xr.resultType === XPathResult.BOOLEAN_TYPE) results.push(xr.booleanValue);
                    else {
                        let node = xr.iterateNext();
                        while (node) {
                            results.push(node.textContent || node.outerHTML || String(node));
                            node = xr.iterateNext();
                        }
                    }
                } else {
                    doc.querySelectorAll(path).forEach(node => results.push(node.textContent.trim() || node.outerHTML));
                }
                result = results.length > 0 ? results.join('\n') : 'No matches found';
            } else {
                // JS Path (Raw List)
                let data = currentResponse.body;
                if (typeof data === 'string') try { data = JSON.parse(data); } catch { }

                const evaluateJSPath = (obj, p) => {
                    let normalized = p.startsWith('data') ? p : 'data' + (p.startsWith('[') ? '' : '.') + p;
                    return new Function('data', `try { return ${normalized}; } catch(e) { return undefined; }`)(obj);
                };

                const evalResult = evaluateJSPath(data, path);
                if (evalResult === undefined) result = 'No matches found';
                else if (Array.isArray(evalResult)) result = evalResult.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join('\n');
                else result = typeof evalResult === 'object' ? JSON.stringify(evalResult, null, 2) : String(evalResult);
            }

            if (resultLabel) resultLabel.textContent = 'EXTRACTION RESULT (RAW DATA)';
            resultEl.innerHTML = '<pre class="extraction-pre" style="margin:0; font-family:var(--vscode-editor-font-family); font-size:11px; white-space:pre-wrap; word-break:break-all;">' + escapeHtml(result) + '</pre>';

            const resultContainer = document.getElementById('extractionResultContainer');
            if (resultContainer) resultContainer.style.display = 'block';
        } catch (e) {
            resultEl.textContent = 'Error: ' + e.message;
            const resultContainer = document.getElementById('extractionResultContainer');
            if (resultContainer) resultContainer.style.display = 'block';
        }
    };

    // Filter response body with extraction
    window.filterResponse = function () {
        if (!currentResponse || !currentResponse.body) {
            showToast('No response body to filter');
            return;
        }

        let type = getActiveType();
        const path = document.getElementById('extractionPath').value.trim();
        const resultEl = document.getElementById('extractionResult');
        const resultLabel = document.querySelector('.extraction-result-header span');

        if (!path) {
            showToast('Please enter a filter expression');
            return;
        }

        try {
            let filteredData = null;
            const body = typeof currentResponse.body === 'string' ? currentResponse.body : JSON.stringify(currentResponse.body);
            const contentType = currentResponse.headers['content-type'] || 'text/html';

            if (type === 'jspath') {
                let data = currentResponse.body;
                if (typeof data === 'string') try { data = JSON.parse(data); } catch { }

                const evaluateJSPath = (obj, p) => {
                    let normalized = p.startsWith('data') ? p : 'data' + (p.startsWith('[') ? '' : '.') + p;
                    return new Function('data', `try { return ${normalized}; } catch(e) { return undefined; }`)(obj);
                };
                filteredData = evaluateJSPath(data, path);
            } else if (type === 'xpath' || type === 'css') {
                const parser = new DOMParser();
                const docType = contentType.includes('xml') ? 'text/xml' : 'text/html';
                const doc = parser.parseFromString(body, docType);

                if (type === 'xpath') {
                    const xr = doc.evaluate(path, doc, null, XPathResult.ANY_TYPE, null);
                    if (xr.resultType === XPathResult.NUMBER_TYPE) filteredData = xr.numberValue;
                    else if (xr.resultType === XPathResult.STRING_TYPE) filteredData = xr.stringValue;
                    else if (xr.resultType === XPathResult.BOOLEAN_TYPE) filteredData = xr.booleanValue;
                    else {
                        let node = xr.iterateNext();
                        filteredData = node ? (node.outerHTML || node.textContent) : 'No matches found';
                    }
                } else {
                    const nodes = doc.querySelectorAll(path);
                    filteredData = nodes.length > 0 ? Array.from(nodes).map(n => n.outerHTML || n.textContent).join('\n') : 'No matches found';
                }
            } else if (type === 'regex') {
                const regex = new RegExp(path, 'g');
                const matches = [];
                let match;
                let textToMatch = typeof currentResponse.body === 'object' ? JSON.stringify(currentResponse.body, null, 2) : body;
                while ((match = regex.exec(textToMatch)) !== null) {
                    matches.push(match[0]);
                }
                filteredData = matches.length > 0 ? (matches.length === 1 ? matches[0] : matches) : 'No matches found';
            }

            if (resultLabel) resultLabel.textContent = 'FILTERED VIEW (STRUCTURED)';

            if (filteredData === null || filteredData === undefined) {
                resultEl.textContent = 'No matches found';
            } else if (typeof filteredData === 'object') {
                resultEl.innerHTML = '';
                renderJSONTree(filteredData, resultEl);
            } else if (typeof filteredData === 'string' && (filteredData.trim().startsWith('<') || type === 'xpath' || type === 'css')) {
                resultEl.innerHTML = '<pre class="extraction-pre" style="margin:0; font-family:var(--vscode-editor-font-family); font-size:11px; white-space:pre-wrap; color:var(--vscode-debugTokenEditor-string);">' + escapeHtml(filteredData) + '</pre>';
            } else {
                resultEl.textContent = String(filteredData);
            }

            const resultContainer = document.getElementById('extractionResultContainer');
            if (resultContainer) resultContainer.style.display = 'block';
            showToast('Filter applied - Structured View');
        } catch (e) {
            resultEl.textContent = 'Error: ' + e.message;
            const resultContainer = document.getElementById('extractionResultContainer');
            if (resultContainer) resultContainer.style.display = 'block';
        }
    };

    window.clearExtractionResult = function () {
        const resultEl = document.getElementById('extractionResult');
        const resultContainer = document.getElementById('extractionResultContainer');
        if (resultEl) resultEl.innerHTML = '';
        if (resultContainer) resultContainer.style.display = 'none';
    };

    function updateBodyView() {
        const bodyEl = document.getElementById('responseBody');
        const previewEl = document.getElementById('responsePreview');
        const viewText = document.getElementById('bodyViewText');

        if (bodyViewMode === 'preview') {
            bodyEl.style.display = 'none';
            previewEl.style.display = 'block';
            viewText.textContent = 'Raw';
        } else {
            bodyEl.style.display = 'block';
            previewEl.style.display = 'none';
            viewText.textContent = 'Preview';
        }
    }

    // Toggle headers view (table/raw)
    window.toggleHeadersView = function () {
        headersViewMode = headersViewMode === 'table' ? 'raw' : 'table';
        updateHeadersView();
    };

    function updateHeadersView() {
        const tableEl = document.getElementById('responseHeaders');
        const rawEl = document.getElementById('responseHeadersRaw');
        const viewText = document.getElementById('headersViewText');

        if (headersViewMode === 'raw') {
            tableEl.style.display = 'none';
            rawEl.style.display = 'block';
            viewText.textContent = 'Table';
        } else {
            tableEl.style.display = 'block';
            rawEl.style.display = 'none';
            viewText.textContent = 'Raw';
        }
    }

    // JSON Tree Viewer - Collapsible
    function renderJSONTree(data, level, path) {
        level = level || 0;
        path = path || '';

        // Performance: Stop recursion if object is too deep or data is massive
        if (level > 20) {
            return '<span class="json-string">"[Too Deep]"</span>';
        }

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
            if (/^https?:\/\//.test(data)) {
                return '<span class="json-string">"<a href="' + escaped + '" class="json-link" title="Open URL">' + escaped + '</a>"</span>';
            }
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
            data.forEach(function (item, index) {
                var itemPath = path + '[' + index + ']';
                html += '<div class="json-line">';
                html += '<span class="json-index" onclick="copyJSPath(\'' + itemPath + '\')" title="Click to copy path">' + index + '</span>';
                html += '<span class="json-colon">: </span>';
                html += renderJSONTree(item, level + 1, itemPath);
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
            keys.forEach(function (key, index) {
                var keyPath = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
                    ? (path ? path + '.' + key : key)
                    : (path ? path + '["' + key + '"]' : '["' + key + '"]');

                html += '<div class="json-line">';
                html += '<span class="json-key" onclick="copyJSPath(\'' + keyPath + '\')" title="Click to copy path">"' + key + '"</span>';
                html += '<span class="json-colon">: </span>';
                html += renderJSONTree(data[key], level + 1, keyPath);
                if (index < keys.length - 1) html += '<span class="json-comma">,</span>';
                html += '</div>';
            });
            html += '</div>';
            html += '<span class="json-bracket">}</span>';
            return html;
        }

        return String(data);
    }

    window.copyJSPath = function (path) {
        // Set to extraction input
        const typeSelect = document.getElementById('extractionType');
        const pathInput = document.getElementById('extractionPath');

        typeSelect.value = 'jspath';
        pathInput.value = path;

        // Auto extract
        evaluateExtraction();

        // Copy to clipboard
        navigator.clipboard.writeText(path).then(() => {
            showToast('Path copied: ' + path);
        });
    };

    // Toggle JSON node
    window.toggleJSON = function (id) {
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
    window.collapseAllJSON = function () {
        document.querySelectorAll('.json-content').forEach(function (el) {
            el.classList.add('collapsed');
            var toggle = el.previousElementSibling.previousElementSibling;
            var icon = toggle.querySelector('.json-toggle-icon');
            var size = el.previousElementSibling;
            if (icon) icon.textContent = '▶';
            if (size) size.style.display = 'inline';
        });
    };

    window.expandAllJSON = function () {
        document.querySelectorAll('.json-content').forEach(function (el) {
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
        return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
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
    window.copyResponse = function (type) {
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
        navigator.clipboard.writeText(text).then(function () {
            showToast('Copied to clipboard!');
        });
    };

    // Toggle word wrap
    window.toggleWrap = function () {
        var bodyEl = document.getElementById('responseBody');
        bodyEl.classList.toggle('no-wrap');
    };

    function displayError(error) {
        const responseEl = document.getElementById('response');
        if (responseEl) {
            responseEl.style.display = 'block';
        }

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
            } catch { }

            // Build details content
            let detailsHtml = '';

            if (req.headers && req.headers.length > 0) {
                detailsHtml += '<div class="history-detail-section"><span class="history-detail-label">Headers</span>';
                req.headers.forEach(h => {
                    const checkedClass = h.checked === false ? ' history-unchecked' : '';
                    detailsHtml += '<div class="history-detail-row' + checkedClass + '"><span class="history-detail-key">' + escapeHtml(h.key) + ':</span> <span class="history-detail-value">' + escapeHtml(h.value) + '</span></div>';
                });
                detailsHtml += '</div>';
            }

            if (req.queryParams && req.queryParams.length > 0) {
                detailsHtml += '<div class="history-detail-section"><span class="history-detail-label">Query Params</span>';
                req.queryParams.forEach(p => {
                    const checkedClass = p.checked === false ? ' history-unchecked' : '';
                    detailsHtml += '<div class="history-detail-row' + checkedClass + '"><span class="history-detail-key">' + escapeHtml(p.key) + ':</span> <span class="history-detail-value">' + escapeHtml(p.value) + '</span></div>';
                });
                detailsHtml += '</div>';
            }

            if (req.body) {
                const bodyPreview = req.body.length > 200 ? req.body.substring(0, 200) + '...' : req.body;
                detailsHtml += '<div class="history-detail-section"><span class="history-detail-label">Body</span><div class="history-detail-body">' + escapeHtml(bodyPreview) + '</div></div>';
            }

            const settings = [];
            if (req.bypassWAF) settings.push('Bypass WAF');
            if (req.userAgent) settings.push('UA: ' + req.userAgent);
            if (req.referer) settings.push('Referer: ' + req.referer);
            if (settings.length > 0) {
                detailsHtml += '<div class="history-detail-section"><span class="history-detail-label">Settings</span><div class="history-detail-row">' + escapeHtml(settings.join(' · ')) + '</div></div>';
            }

            item.innerHTML = '<div class="saved-req-id">#' + displayId + '</div>' +
                '<div class="saved-req-main">' +
                '<div class="saved-req-header">' +
                '<span class="method method-' + req.method.toLowerCase() + '">' + req.method + '</span>' +
                '<span class="saved-req-name" title="' + escapeHtml(req.name) + '">' + escapeHtml(req.name) + '</span>' +
                '<span class="saved-req-time">' + timeAgo + '</span>' +
                '<svg class="history-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>' +
                '</div>' +
                '<div class="saved-req-url" title="' + escapeHtml(req.url) + '">' + escapeHtml(displayUrl) + '</div>' +
                '<div class="history-details" style="display:none;">' + detailsHtml +
                '<button class="history-load-btn" title="Load this request">Load Request</button>' +
                '</div>' +
                '</div>' +
                '<button class="saved-req-delete" title="Delete">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                '<polyline points="3 6 5 6 21 6"></polyline>' +
                '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>' +
                '</svg>' +
                '</button>';

            item.querySelector('.saved-req-header').onclick = function (e) {
                e.stopPropagation();
                const details = item.querySelector('.history-details');
                const chevron = item.querySelector('.history-chevron');
                const isOpen = details.style.display !== 'none';
                details.style.display = isOpen ? 'none' : 'block';
                chevron.classList.toggle('history-chevron-open', !isOpen);
            };
            item.querySelector('.history-load-btn').onclick = function (e) {
                e.stopPropagation();
                loadRequestById(req.id);
            };
            item.querySelector('.saved-req-delete').onclick = function (e) { e.stopPropagation(); deleteRequestById(req.id, e); };
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

    window.loadRequestById = function (id) {
        const req = savedRequests.find(r => r.id === id);
        if (req) loadRequest(req);
    };

    window.deleteRequestById = function (id, event) {
        event.stopPropagation();
        vscode.postMessage({ command: 'deleteRequest', id: id });
    };

    window.changePage = function (delta) {
        currentPage += delta;
        displaySavedRequests();
    };

    // Search input listeners with debounce
    const debouncedDisplaySaved = debounce(() => displaySavedRequests(), 250);
    document.getElementById('savedFilterInput')?.addEventListener('input', () => {
        currentPage = 1;
        debouncedDisplaySaved();
    });

    const debouncedDisplayHistory = debounce(() => displayHistory(), 250);
    document.getElementById('recentFilterInput')?.addEventListener('input', () => {
        debouncedDisplayHistory();
    });

    function displayHistory() {
        const container = document.getElementById('recentRequestsContainer');
        const statsEl = document.getElementById('recentStats');
        const filterText = (document.getElementById('recentFilterInput')?.value || '').toLowerCase();

        const filteredHistory = requestHistory.filter(req =>
            req.url.toLowerCase().includes(filterText) ||
            req.method.toLowerCase().includes(filterText)
        );

        statsEl.textContent = filteredHistory.length + ' requests';

        if (filteredHistory.length === 0) {
            container.innerHTML = '<div class="empty-state">No request history found</div>';
            return;
        }

        // Performance: Limit history rendering to first 50 items
        container.innerHTML = '';
        const historyToDisplay = filteredHistory.slice(0, 50);
        historyToDisplay.forEach((req, idx) => {
            const item = document.createElement('div');
            item.className = 'saved-request-item';
            const timeAgo = formatTime(req.createdAt);

            let displayUrl = req.url;
            try {
                const url = new URL(req.url);
                displayUrl = url.hostname + (url.pathname !== '/' ? url.pathname : '') + (url.search || '');
            } catch { }

            // Build details content
            let detailsHtml = '';

            // Headers
            if (req.headers && req.headers.length > 0) {
                detailsHtml += '<div class="history-detail-section"><span class="history-detail-label">Headers</span>';
                req.headers.forEach(h => {
                    const checkedClass = h.checked === false ? ' history-unchecked' : '';
                    detailsHtml += '<div class="history-detail-row' + checkedClass + '"><span class="history-detail-key">' + escapeHtml(h.key) + ':</span> <span class="history-detail-value">' + escapeHtml(h.value) + '</span></div>';
                });
                detailsHtml += '</div>';
            }

            // Query params
            if (req.queryParams && req.queryParams.length > 0) {
                detailsHtml += '<div class="history-detail-section"><span class="history-detail-label">Query Params</span>';
                req.queryParams.forEach(p => {
                    const checkedClass = p.checked === false ? ' history-unchecked' : '';
                    detailsHtml += '<div class="history-detail-row' + checkedClass + '"><span class="history-detail-key">' + escapeHtml(p.key) + ':</span> <span class="history-detail-value">' + escapeHtml(p.value) + '</span></div>';
                });
                detailsHtml += '</div>';
            }

            // Body
            if (req.body) {
                const bodyPreview = req.body.length > 200 ? req.body.substring(0, 200) + '...' : req.body;
                detailsHtml += '<div class="history-detail-section"><span class="history-detail-label">Body</span><div class="history-detail-body">' + escapeHtml(bodyPreview) + '</div></div>';
            }

            // Settings
            const settings = [];
            if (req.bypassWAF) settings.push('Bypass WAF');
            if (req.userAgent) settings.push('UA: ' + req.userAgent);
            if (req.referer) settings.push('Referer: ' + req.referer);
            if (settings.length > 0) {
                detailsHtml += '<div class="history-detail-section"><span class="history-detail-label">Settings</span><div class="history-detail-row">' + escapeHtml(settings.join(' · ')) + '</div></div>';
            }

            item.innerHTML = '<div class="saved-req-id">#' + (idx + 1) + '</div>' +
                '<div class="saved-req-main">' +
                '<div class="saved-req-header">' +
                '<span class="method method-' + req.method.toLowerCase() + '">' + req.method + '</span>' +
                '<span class="saved-req-name" title="' + escapeHtml(req.name || displayUrl) + '">' + escapeHtml(req.name || displayUrl) + '</span>' +
                '<span class="saved-req-time">' + timeAgo + '</span>' +
                '<svg class="history-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>' +
                '</div>' +
                '<div class="saved-req-url" title="' + escapeHtml(req.url) + '">' + escapeHtml(displayUrl) + '</div>' +
                '<div class="history-details" style="display:none;">' + detailsHtml +
                '<button class="history-load-btn" title="Load this request">Load Request</button>' +
                '</div>' +
                '</div>' +
                '<button class="saved-req-delete" title="Delete">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                '<polyline points="3 6 5 6 21 6"></polyline>' +
                '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>' +
                '</svg>' +
                '</button>';

            // Toggle expand/collapse on header click
            item.querySelector('.saved-req-header').onclick = function (e) {
                e.stopPropagation();
                const details = item.querySelector('.history-details');
                const chevron = item.querySelector('.history-chevron');
                const isOpen = details.style.display !== 'none';
                details.style.display = isOpen ? 'none' : 'block';
                chevron.classList.toggle('history-chevron-open', !isOpen);
            };
            // Load request button
            item.querySelector('.history-load-btn').onclick = function (e) {
                e.stopPropagation();
                loadRequest(req);
            };
            item.querySelector('.saved-req-delete').onclick = function (e) {
                e.stopPropagation();
                vscode.postMessage({ command: 'deleteHistoryItem', id: req.id });
            };
            container.appendChild(item);
        });
    }

    window.clearHistory = function () {
        vscode.postMessage({ command: 'clearHistory' });
    };

    // Load initial history
    vscode.postMessage({ command: 'loadHistory' });

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
        // Track loaded request ID for update-on-save
        if (req.id) {
            currentRequestId = req.id;
            const saveBtn = document.getElementById('saveBtn');
            if (saveBtn) saveBtn.textContent = 'Update';
        }

        document.getElementById('method').value = req.method;
        document.getElementById('url').value = req.url;
        document.getElementById('contentType').value = req.contentType || 'application/json';

        // Set Auth (New System)
        if (req.auth) {
            const authTypeSelect = document.getElementById('authTypeSelect');
            if (authTypeSelect) {
                authTypeSelect.value = req.auth.type || 'none';
                showAuthFields(req.auth.type || 'none');

                // Fill fields based on type
                switch (req.auth.type) {
                    case 'bearer':
                        document.getElementById('authBearerToken').value = req.auth.token || '';
                        document.getElementById('authBearerPrefix').value = req.auth.prefix || 'Bearer';
                        break;
                    case 'basic':
                        document.getElementById('authBasicUser').value = req.auth.username || '';
                        document.getElementById('authBasicPass').value = req.auth.password || '';
                        break;
                    case 'apikey':
                        document.getElementById('authApiKeyKey').value = req.auth.key || 'X-API-Key';
                        document.getElementById('authApiKeyValue').value = req.auth.value || '';
                        document.getElementById('authApiKeyAddTo').value = req.auth.addTo || 'header';
                        break;
                    case 'digest':
                        document.getElementById('authDigestUser').value = req.auth.username || '';
                        document.getElementById('authDigestPass').value = req.auth.password || '';
                        break;
                    case 'oauth2':
                        document.getElementById('authOAuth2Token').value = req.auth.token || '';
                        document.getElementById('authOAuth2Prefix').value = req.auth.prefix || 'Bearer';
                        document.getElementById('authOAuth2TokenType').value = req.auth.addTo || 'header';
                        break;
                    case 'custom':
                        document.getElementById('authCustomKey').value = req.auth.key || '';
                        document.getElementById('authCustomValue').value = req.auth.value || '';
                        break;
                }
            }
        }

        // Set Body (New System)
        if (req.bodyData) {
            const bodyTypeRadio = document.querySelector(`input[name="bodyType"][value="${req.bodyData.type}"]`);
            if (bodyTypeRadio) {
                bodyTypeRadio.checked = true;
                showBodyFields(req.bodyData.type);
            }

            if (req.bodyData.type === 'form-data' || req.bodyData.type === 'urlencoded') {
                const containerId = req.bodyData.type === 'form-data' ? 'formDataContainer' : 'urlencodedContainer';
                document.getElementById(containerId).innerHTML = '';
                if (req.bodyData.items && req.bodyData.items.length > 0) {
                    req.bodyData.items.forEach(item => {
                        addBodyRow(req.bodyData.type, item.key, item.value, item.checked !== false);
                    });
                } else {
                    addBodyRow(req.bodyData.type);
                }
            } else if (req.bodyData.type === 'raw') {
                document.getElementById('bodyInput').value = req.bodyData.value || '';
                document.getElementById('bodyRawType').value = req.bodyData.contentType || 'application/json';
            }
        } else {
            // Backward compatibility
            document.getElementById('bodyInput').value = req.body || '';
            const isUrlEncoded = req.contentType === 'application/x-www-form-urlencoded';
            const isFormData = req.contentType === 'multipart/form-data';

            if (isUrlEncoded || isFormData) {
                const type = isUrlEncoded ? 'urlencoded' : 'form-data';
                document.querySelector(`input[name="bodyType"][value="${type}"]`).checked = true;
                showBodyFields(type);
                // Convert body string to rows if possible
                const parts = (req.body || '').split('&');
                parts.forEach(p => {
                    const [k, v] = p.split('=');
                    if (k) addBodyRow(type, decodeURIComponent(k), decodeURIComponent(v || ''));
                });
            } else {
                document.querySelector('input[name="bodyType"][value="raw"]').checked = true;
                showBodyFields('raw');
            }
        }

        // Set Stealth / Bypass WAF (always reset)
        const bypassEl = document.getElementById('bypassWAF');
        if (bypassEl) bypassEl.checked = !!req.bypassWAF;

        // Set User-Agent (always reset)
        const userAgentSelect = document.getElementById('userAgentSelect');
        const customUserAgentRow = document.getElementById('customUserAgentRow');
        if (userAgentSelect) {
            if (!req.userAgent) {
                userAgentSelect.value = '';
                customUserAgentRow.style.display = 'none';
            } else {
                const isCustomUA = !userAgentSelect.querySelector(`option[value="${req.userAgent}"]`);
                if (isCustomUA) {
                    userAgentSelect.value = 'custom';
                    customUserAgentRow.style.display = 'block';
                    document.getElementById('customUserAgentInput').value = req.userAgent;
                } else {
                    userAgentSelect.value = req.userAgent;
                    customUserAgentRow.style.display = 'none';
                }
            }
        }

        // Set Referer (always reset)
        const refererSelect = document.getElementById('refererSelect');
        const customRefererRow = document.getElementById('customRefererRow');
        if (refererSelect) {
            if (!req.referer) {
                refererSelect.value = '';
                customRefererRow.style.display = 'none';
            } else {
                const isCustomReferer = !refererSelect.querySelector(`option[value="${req.referer}"]`);
                if (isCustomReferer) {
                    refererSelect.value = 'custom';
                    customRefererRow.style.display = 'block';
                    document.getElementById('customRefererInput').value = req.referer;
                } else {
                    refererSelect.value = req.referer;
                    customRefererRow.style.display = 'none';
                }
            }
        }

        // Handle file upload indicator in body
        if (req.bodyFile) {
            showToast('Note: File upload "@' + req.bodyFile + '" needs manual handling');
        }

        // Headers'ı yükle
        const headersContainer = document.getElementById('headersContainer');
        headersContainer.innerHTML = '';
        if (req.headers && Array.isArray(req.headers) && req.headers.length > 0) {
            req.headers.forEach(h => addHeaderRow(h.key, h.value, h.checked !== false));
        } else {
            addHeaderRow();
        }

        // Query parametrelerini yükle
        const queryContainer = document.getElementById('queryContainer');
        queryContainer.innerHTML = '';
        if (req.queryParams && Array.isArray(req.queryParams) && req.queryParams.length > 0) {
            req.queryParams.forEach(p => addQueryRow(p.key, p.value, p.checked !== false));
        } else {
            addQueryRow();
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
        updatePanelTitle();
        updateTabCounts();
    }

    // Load on startup
    vscode.postMessage({ command: 'loadRequests' });
    vscode.postMessage({ command: 'loadAuthTokens' });
    vscode.postMessage({ command: 'getSettings' });
    console.log('initApp completed successfully');

    function clearResponse() {
        const responseEl = document.getElementById('response');
        if (responseEl) {
            responseEl.style.display = 'none';
        }

        // Reset current response data
        currentResponse = null;

        // Clear response body
        const responseBody = document.getElementById('responseBody');
        if (responseBody) {
            responseBody.innerHTML = '';
            responseBody.textContent = '';
        }

        // Clear preview frame
        const previewFrame = document.getElementById('previewFrame');
        if (previewFrame) {
            previewFrame.srcdoc = '';
            previewFrame.removeAttribute('src');
        }

        // Clear response headers
        const responseHeaders = document.getElementById('responseHeaders');
        if (responseHeaders) {
            responseHeaders.innerHTML = '';
        }
    }

    // Global toggle for Word Wrap
    window.toggleWordWrap = function () {
        const responseBody = document.getElementById('responseBody');
        if (!responseBody) return;

        const isWrapped = responseBody.style.whiteSpace === 'pre-wrap';
        responseBody.style.wordWrap = isWrapped ? 'normal' : 'break-word';
        responseBody.style.whiteSpace = isWrapped ? 'pre' : 'pre-wrap';

        const btn = document.getElementById('wordWrapToggle');
        if (btn) btn.classList.toggle('active', !isWrapped);
    };

    // Clear all form data and response
    function clearAllData() {
        // Clear URL
        document.getElementById('url').value = '';

        // Reset method to GET
        document.getElementById('method').value = 'GET';

        // Clear headers
        document.getElementById('headersContainer').innerHTML = '';

        // Clear query params
        document.getElementById('queryContainer').innerHTML = '';

        // Clear body
        document.getElementById('bodyInput').value = '';

        // Reset content type
        document.getElementById('contentType').value = 'application/json';

        clearResponse();
        bodyViewMode = 'raw';
        headersViewMode = 'table';

        // Reset tabs to headers
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelector('[data-tab="headers"]').classList.add('active');
        document.getElementById('headersTab').classList.add('active');

        // Reset response tabs
        document.querySelectorAll('.res-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.res-tab-content').forEach(c => c.classList.remove('active'));
        const firstResTab = document.querySelector('.res-tab');
        if (firstResTab) {
            firstResTab.classList.add('active');
        }
        document.getElementById('resBody').classList.add('active');
    }

    // Examples Modal
    const examplesBtn = document.getElementById('examplesBtn');
    const examplesModal = document.getElementById('examplesModal');
    const closeExamples = document.getElementById('closeExamples');

    // Create backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    document.body.appendChild(backdrop);

    function showExamplesModal() {
        examplesModal.classList.add('show');
        backdrop.classList.add('show');
    }

    function hideExamplesModal() {
        examplesModal.classList.remove('show');
        backdrop.classList.remove('show');
    }

    if (examplesBtn) {
        examplesBtn.addEventListener('click', showExamplesModal);
    }

    if (closeExamples) {
        closeExamples.addEventListener('click', hideExamplesModal);
    }

    backdrop.addEventListener('click', hideExamplesModal);

    // Example requests data
    const EXAMPLE_REQUESTS = {
        'jsonplaceholder-get-users': {
            method: 'GET',
            url: 'https://jsonplaceholder.typicode.com/users',
            headers: [{ key: 'Accept', value: 'application/json' }],
            contentType: 'application/json',
            body: ''
        },
        'jsonplaceholder-get-posts': {
            method: 'GET',
            url: 'https://jsonplaceholder.typicode.com/posts',
            headers: [{ key: 'Accept', value: 'application/json' }],
            contentType: 'application/json',
            body: ''
        },
        'jsonplaceholder-get-post': {
            method: 'GET',
            url: 'https://jsonplaceholder.typicode.com/posts/1',
            headers: [{ key: 'Accept', value: 'application/json' }],
            contentType: 'application/json',
            body: ''
        },
        'jsonplaceholder-post': {
            method: 'POST',
            url: 'https://jsonplaceholder.typicode.com/posts',
            headers: [
                { key: 'Accept', value: 'application/json' },
                { key: 'Content-Type', value: 'application/json' }
            ],
            contentType: 'application/json',
            body: JSON.stringify({
                title: 'foo',
                body: 'bar',
                userId: 1
            }, null, 2)
        },
        'jsonplaceholder-put': {
            method: 'PUT',
            url: 'https://jsonplaceholder.typicode.com/posts/1',
            headers: [
                { key: 'Accept', value: 'application/json' },
                { key: 'Content-Type', value: 'application/json' }
            ],
            contentType: 'application/json',
            body: JSON.stringify({
                id: 1,
                title: 'foo updated',
                body: 'bar updated',
                userId: 1
            }, null, 2)
        },
        'jsonplaceholder-patch': {
            method: 'PATCH',
            url: 'https://jsonplaceholder.typicode.com/posts/1',
            headers: [
                { key: 'Accept', value: 'application/json' },
                { key: 'Content-Type', value: 'application/json' }
            ],
            contentType: 'application/json',
            body: JSON.stringify({
                title: 'foo patched'
            }, null, 2)
        },
        'jsonplaceholder-delete': {
            method: 'DELETE',
            url: 'https://jsonplaceholder.typicode.com/posts/1',
            headers: [{ key: 'Accept', value: 'application/json' }],
            contentType: 'application/json',
            body: ''
        },
        'httpbin-get': {
            method: 'GET',
            url: 'https://httpbin.org/get',
            headers: [{ key: 'Accept', value: 'application/json' }],
            contentType: 'application/json',
            body: ''
        },
        'httpbin-post': {
            method: 'POST',
            url: 'https://httpbin.org/post',
            headers: [
                { key: 'Accept', value: 'application/json' },
                { key: 'Content-Type', value: 'application/json' }
            ],
            contentType: 'application/json',
            body: JSON.stringify({
                name: 'test',
                value: 'hello world'
            }, null, 2)
        },
        'httpbin-headers': {
            method: 'GET',
            url: 'https://httpbin.org/headers',
            headers: [
                { key: 'Accept', value: 'application/json' },
                { key: 'X-Custom-Header', value: 'StackerClient' }
            ],
            contentType: 'application/json',
            body: ''
        },
        'httpbin-html': {
            method: 'GET',
            url: 'https://httpbin.org/html',
            headers: [
                { key: 'Accept', value: 'text/html' }
            ],
            contentType: 'text/html',
            body: ''
        },
        'reqres-users': {
            method: 'GET',
            url: 'https://reqres.in/api/users?page=2',
            headers: [{ key: 'Accept', value: 'application/json' }],
            contentType: 'application/json',
            body: ''
        },
        'reqres-create': {
            method: 'POST',
            url: 'https://reqres.in/api/users',
            headers: [
                { key: 'Accept', value: 'application/json' },
                { key: 'Content-Type', value: 'application/json' }
            ],
            contentType: 'application/json',
            body: JSON.stringify({
                name: 'morpheus',
                job: 'leader'
            }, null, 2)
        },
        'reqres-update': {
            method: 'PUT',
            url: 'https://reqres.in/api/users/2',
            headers: [
                { key: 'Accept', value: 'application/json' },
                { key: 'Content-Type', value: 'application/json' }
            ],
            contentType: 'application/json',
            body: JSON.stringify({
                name: 'morpheus',
                job: 'zion resident'
            }, null, 2)
        },
        'github-user': {
            method: 'GET',
            url: 'https://api.github.com/users/octocat',
            headers: [
                { key: 'Accept', value: 'application/vnd.github.v3+json' },
                { key: 'User-Agent', value: 'StackerClient' }
            ],
            contentType: 'application/json',
            body: ''
        },
        'github-repos': {
            method: 'GET',
            url: 'https://api.github.com/users/octocat/repos',
            headers: [
                { key: 'Accept', value: 'application/vnd.github.v3+json' },
                { key: 'User-Agent', value: 'StackerClient' }
            ],
            contentType: 'application/json',
            body: ''
        },
        'auth-bearer': {
            method: 'GET',
            url: 'https://httpbin.org/bearer',
            headers: [
                { key: 'Accept', value: 'application/json' },
                { key: 'Authorization', value: 'Bearer your_token_here' }
            ],
            contentType: 'application/json',
            body: ''
        },
        'auth-basic': {
            method: 'GET',
            url: 'https://httpbin.org/basic-auth/user/passwd',
            headers: [
                { key: 'Accept', value: 'application/json' },
                { key: 'Authorization', value: 'Basic ' + btoa('user:passwd') }
            ],
            contentType: 'application/json',
            body: ''
        },
        'auth-apikey': {
            method: 'GET',
            url: 'https://httpbin.org/headers',
            headers: [
                { key: 'Accept', value: 'application/json' },
                { key: 'X-API-Key', value: 'your_api_key_here' }
            ],
            contentType: 'application/json',
            body: ''
        },
        'auth-cookie': {
            method: 'GET',
            url: 'https://httpbin.org/response-headers?Set-Cookie=session_id%3Dabc123%3B+Path%3D%2F&Set-Cookie=user%3Dstacker%3B+Path%3D%2F',
            headers: [
                { key: 'Accept', value: 'application/json' }
            ],
            contentType: 'application/json',
            body: ''
        },
        'query-search': {
            method: 'GET',
            url: 'https://httpbin.org/get',
            headers: [
                { key: 'Accept', value: 'application/json' }
            ],
            contentType: 'application/json',
            body: '',
            queryParams: [
                { key: 'q', value: 'search term' },
                { key: 'limit', value: '10' }
            ]
        },
        'query-filter': {
            method: 'GET',
            url: 'https://jsonplaceholder.typicode.com/posts',
            headers: [
                { key: 'Accept', value: 'application/json' }
            ],
            contentType: 'application/json',
            body: '',
            queryParams: [
                { key: 'userId', value: '1' },
                { key: '_page', value: '1' },
                { key: '_limit', value: '5' }
            ]
        },
        'query-multiple': {
            method: 'GET',
            url: 'https://httpbin.org/get',
            headers: [
                { key: 'Accept', value: 'application/json' }
            ],
            contentType: 'application/json',
            body: '',
            queryParams: [
                { key: 'category', value: 'electronics' },
                { key: 'sort', value: 'price' },
                { key: 'order', value: 'asc' },
                { key: 'minPrice', value: '100' },
                { key: 'maxPrice', value: '1000' }
            ]
        },
        'complex-auth-query': {
            method: 'GET',
            url: 'https://httpbin.org/get',
            headers: [
                { key: 'Accept', value: 'application/json' },
                { key: 'Authorization', value: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' }
            ],
            contentType: 'application/json',
            body: '',
            queryParams: [
                { key: 'page', value: '1' },
                { key: 'per_page', value: '20' },
                { key: 'filter', value: 'active' }
            ]
        },
        'complex-post-auth': {
            method: 'POST',
            url: 'https://httpbin.org/post',
            headers: [
                { key: 'Accept', value: 'application/json' },
                { key: 'Content-Type', value: 'application/json' },
                { key: 'Authorization', value: 'Bearer your_access_token_here' }
            ],
            contentType: 'application/json',
            body: JSON.stringify({
                name: 'John Doe',
                email: 'john@example.com',
                role: 'admin',
                metadata: {
                    department: 'Engineering',
                    joined: '2024-01-15'
                }
            }, null, 2)
        },
        'env-demo': {
            method: 'GET',
            url: '{{baseUrl}}/users/{{userId}}',
            headers: [
                { key: 'Accept', value: 'application/json' },
                { key: 'Authorization', value: 'Bearer {{authToken}}' },
                { key: 'X-API-Version', value: '{{apiVersion}}' }
            ],
            contentType: 'application/json',
            body: '',
            queryParams: [
                { key: 'page', value: '{{pageNum}}' },
                { key: 'limit', value: '{{pageSize}}' }
            ]
        },
        // Additional HTTP Methods
        'httpbin-head': {
            method: 'HEAD',
            url: 'https://httpbin.org/get',
            headers: [
                { key: 'Accept', value: 'application/json' }
            ],
            contentType: 'application/json',
            body: ''
        },
        'httpbin-options': {
            method: 'OPTIONS',
            url: 'https://httpbin.org/anything',
            headers: [
                { key: 'Accept', value: 'application/json' }
            ],
            contentType: 'application/json',
            body: ''
        },
        'httpbin-anything-post': {
            method: 'POST',
            url: 'https://httpbin.org/anything',
            headers: [
                { key: 'Accept', value: 'application/json' },
                { key: 'Content-Type', value: 'application/json' }
            ],
            contentType: 'application/json',
            body: JSON.stringify({
                name: 'test',
                action: 'create'
            }, null, 2)
        },
        'httpbin-anything-put': {
            method: 'PUT',
            url: 'https://httpbin.org/anything',
            headers: [
                { key: 'Accept', value: 'application/json' },
                { key: 'Content-Type', value: 'application/json' }
            ],
            contentType: 'application/json',
            body: JSON.stringify({
                name: 'updated',
                action: 'update'
            }, null, 2)
        },
        'httpbin-anything-patch': {
            method: 'PATCH',
            url: 'https://httpbin.org/anything',
            headers: [
                { key: 'Accept', value: 'application/json' },
                { key: 'Content-Type', value: 'application/json' }
            ],
            contentType: 'application/json',
            body: JSON.stringify({
                name: 'patched'
            }, null, 2)
        },
        'httpbin-delete': {
            method: 'DELETE',
            url: 'https://httpbin.org/anything/1',
            headers: [
                { key: 'Accept', value: 'application/json' }
            ],
            contentType: 'application/json',
            body: ''
        },
        'httpbin-basic-auth': {
            method: 'GET',
            url: 'https://httpbin.org/basic-auth/user/passwd',
            headers: [
                { key: 'Accept', value: 'application/json' },
                { key: 'Authorization', value: 'Basic ' + btoa('user:passwd') }
            ],
            contentType: 'application/json',
            body: ''
        },
        'httpbin bearer': {
            method: 'GET',
            url: 'https://httpbin.org/bearer',
            headers: [
                { key: 'Accept', value: 'application/json' },
                { key: 'Authorization', value: 'Bearer test_token_123' }
            ],
            contentType: 'application/json',
            body: ''
        },
        'httpbin-headers': {
            method: 'GET',
            url: 'https://httpbin.org/headers',
            headers: [
                { key: 'Accept', value: 'application/json' },
                { key: 'X-Custom-Header', value: 'StackerClient' }
            ],
            contentType: 'application/json',
            body: ''
        },
        'httpbin-cookies': {
            method: 'GET',
            url: 'https://httpbin.org/cookies',
            headers: [
                { key: 'Accept', value: 'application/json' }
            ],
            contentType: 'application/json',
            body: ''
        },
        'httpbin-set-cookies': {
            method: 'GET',
            url: 'https://httpbin.org/response-headers?Set-Cookie=session=abc123&Set-Cookie=user=admin',
            headers: [
                { key: 'Accept', value: 'application/json' }
            ],
            contentType: 'application/json',
            body: ''
        },
        'httpbin-ip': {
            method: 'GET',
            url: 'https://httpbin.org/ip',
            headers: [
                { key: 'Accept', value: 'application/json' }
            ],
            contentType: 'application/json',
            body: ''
        },
        'httpbin-user-agent': {
            method: 'GET',
            url: 'https://httpbin.org/user-agent',
            headers: [
                { key: 'Accept', value: 'application/json' },
                { key: 'User-Agent', value: 'StackerClient/1.0' }
            ],
            contentType: 'application/json',
            body: ''
        },
        'httpbin-delay': {
            method: 'GET',
            url: 'https://httpbin.org/delay/2',
            headers: [
                { key: 'Accept', value: 'application/json' }
            ],
            contentType: 'application/json',
            body: ''
        },
        'httpbin-status': {
            method: 'GET',
            url: 'https://httpbin.org/status/200',
            headers: [
                { key: 'Accept', value: 'application/json' }
            ],
            contentType: 'application/json',
            body: ''
        },
        'httpbin-json': {
            method: 'POST',
            url: 'https://httpbin.org/json',
            headers: [
                { key: 'Accept', value: 'application/json' }
            ],
            contentType: 'application/json',
            body: ''
        },
        'httpbin-xml': {
            method: 'GET',
            url: 'https://httpbin.org/xml',
            headers: [
                { key: 'Accept', value: 'application/xml' }
            ],
            contentType: 'application/xml',
            body: ''
        }
    };

    // Search examples
    const examplesSearch = document.getElementById('examplesSearch');
    if (examplesSearch) {
        examplesSearch.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            document.querySelectorAll('.example-category').forEach(cat => {
                const items = cat.nextElementSibling?.querySelectorAll?.('.example-item') || [];
                let hasVisible = false;

                // Check category name
                if (cat.textContent.toLowerCase().includes(searchTerm)) {
                    hasVisible = true;
                }

                // Check each item
                cat.parentElement?.querySelectorAll?.('.example-item').forEach?.(item => {
                    const name = item.querySelector('.example-name')?.textContent?.toLowerCase() || '';
                    const method = item.querySelector('.example-method')?.textContent?.toLowerCase() || '';
                    const visible = name.includes(searchTerm) || method.includes(searchTerm);
                    item.classList.toggle('hidden', !visible);
                    if (visible) hasVisible = true;
                });

                cat.classList.toggle('hidden', !hasVisible);
            });
        });
    }

    // Handle example item clicks
    document.querySelectorAll('.example-item').forEach(item => {
        item.addEventListener('click', () => {
            const exampleKey = item.dataset.example;
            const example = EXAMPLE_REQUESTS[exampleKey];

            if (example) {
                // Clear all previous data and response first
                clearAllData();

                // Load the new example
                loadRequest(example);
                hideExamplesModal();
                showToast('Example loaded: ' + example.method + ' ' + example.url);
            }
        });
    });

    // Handle initial state
    updatePanelTitle();
    updateTabCounts();
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}