import * as fs from 'fs';
import * as path from 'path';

export function getWebviewContent(): string {
    // Read CSS
    const cssPath = path.join(__dirname, '..', 'media', 'styles.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    // Read JS
    const jsPath = path.join(__dirname, '..', 'media', 'script.js');
    const js = fs.readFileSync(jsPath, 'utf8');

    // Read Body HTML
    const bodyPath = path.join(__dirname, '..', 'media', 'body.html');
    const bodyHtml = fs.readFileSync(bodyPath, 'utf8');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https:;">
    <title>StackerClient</title>
    <style>${css}</style>
</head>
<body>
${bodyHtml}
    <script>${js}</script>
</body>
</html>`;
}
