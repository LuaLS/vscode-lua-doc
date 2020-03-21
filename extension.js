const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

var currentPanel;

function compileOther(srcPath, dstPath, name) {
    fs.copyFileSync(path.join(srcPath, name), path.join(dstPath, name));
}

function compileCss(srcPath, dstPath, name) {
    let css = fs.readFileSync(path.join(srcPath, name), 'utf8');
    css = css.split('\n').map(function(line) {
        if (line.match('color')) {
            return '';
        }
        return line;
    }).join('\n');
    fs.writeFileSync(path.join(dstPath, name), css);
}

function compileHtml(srcPath, dstPath, name) {
    let html = fs.readFileSync(path.join(srcPath, name), 'utf8');
    html = html.replace(/(<\/body>)/i, `
<SCRIPT>
    const vscode = acquireVsCodeApi();
    function gotoAnchor(anchor) {
        for (const e of document.getElementsByName(anchor)) {
            e.scrollIntoView();
            break;
        }
    }
    for (const link of document.querySelectorAll('a[href^="#"]')) {
        link.addEventListener('click', () => {
            const anchor = link.getAttribute('href').substr(1);
            gotoAnchor(anchor);
        });
    }
    for (const link of document.querySelectorAll('a[href*=".html"]')) {
        link.addEventListener('click', () => {
            const uri = link.getAttribute('href');
            vscode.postMessage({
                command: 'goto',
                uri: uri,
            });
        });
    }
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'goto':
                gotoAnchor(message.anchor);
                break;
        }
    });
</SCRIPT>
$1
    `);
    fs.readdirSync(srcPath).forEach(function(name) {
        const file = path.join(srcPath, name);
        const stat = fs.statSync(file);
        if (stat && stat.isFile()) {
            if (".html" != path.extname(file)) {
                const uri = currentPanel.webview.asWebviewUri(vscode.Uri.file(path.join(dstPath, name)));
                html = html.replace(name, uri);
            }
        }
    });
    fs.writeFileSync(path.join(dstPath, name), html);
}

function compile(srcPath, dstPath) {
    fs.mkdirSync(dstPath, { recursive: true });
    fs.readdirSync(srcPath).forEach(function(name) {
        const file = path.join(srcPath, name);
        const stat = fs.statSync(file);
        if (!stat || !stat.isFile()) {
            return;
        }
        const extname = path.extname(file);
        if (".html" == extname) {
            compileHtml(srcPath, dstPath, name);
        }
        else if (".css" == extname) {
            compileCss(srcPath, dstPath, name);
        }
        else {
            compileOther(srcPath, dstPath, name);
        }
    });
}

function needCompile(workPath, dstPath) {
    const cfg = path.join(dstPath, '.compiled');
    if (!fs.existsSync(cfg)) {
        return true;
    }
    return (workPath != fs.readFileSync(cfg, 'utf8'));
}

function checkAndCompile(workPath, language, version) {
    const srcPath = path.join(workPath, 'doc', language, version);
    const dstPath = path.join(workPath, 'out', language, version);
    if (needCompile(workPath, dstPath)) {
        if (!fs.existsSync(srcPath)) {
            currentPanel.title = 'Error';
            currentPanel.webview.html = `
<!DOCTYPE html>
<html lang="en">
    <head></head>
    <body>
        <h1>Not Found doc/${language}/${version}/</h1>
    </body>
</html>`;
            return false;
        }
        compile(srcPath, dstPath);
        fs.writeFileSync(path.join(dstPath, '.compiled'), workPath);
    }
    currentPanel._language = language;
    currentPanel._version  = version;
    return true
}

function openHtml(workPath, file) {
    const htmlPath = path.join(workPath, 'out', currentPanel._language, currentPanel._version, file);
    if (currentPanel._file == htmlPath) {
        return;
    }
    const html = fs.readFileSync(htmlPath, 'utf8');
    currentPanel._file = htmlPath;
    currentPanel.title = html.match(/<title>(.*?)<\/title>/i)[1];
    currentPanel.webview.html = html;
}

function gotoAnchor(anchor) {
    currentPanel.webview.postMessage({ command: 'goto', anchor: anchor });
}

function parseUri(uri) {
    const l = uri.split(/[\/#]/g);
    return {
        language: l[0],
        version: l[1],
        file: l[2],
        anchor: l[3],
    };
}

function createPanel(workPath, disposables, viewType, uri) {
    const column = vscode.window.activeTextEditor
        ? vscode.window.activeTextEditor.viewColumn
        : vscode.ViewColumn.One;
    if (currentPanel) {
        currentPanel.reveal(column, true);
    }
    else {
        const options = { 
            enableScripts: true,
            enableFindWidget: true,
            retainContextWhenHidden: true,
        };
        currentPanel = vscode.window.createWebviewPanel(viewType, '', { viewColumn: column, preserveFocus: true }, options);
        currentPanel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'goto':
                        const uri = message.uri.split("#");
                        openHtml(workPath, uri[0]);
                        if (uri[1]) {
                            gotoAnchor(uri[1]);
                        }
                        return;
                }
            },
            null,
            disposables
        );
        currentPanel.onDidDispose(
            () => {
                currentPanel = undefined;
            },
            null,
            disposables
        );
    }
    const args = parseUri(uri);
    if (!checkAndCompile(workPath, args.language, args.version)) {
        return;
    }
    openHtml(workPath, args.file);
    if (args.anchor) {
        gotoAnchor(args.anchor);
    }
}

function activateLuaDoc(workPath, disposables, LuaDoc) {
    disposables.push(vscode.commands.registerCommand(LuaDoc.OpenCommand, (uri) => {
        try {
            createPanel(workPath, disposables, LuaDoc.ViewType, uri || "en-us/54/readme.html");
        } catch (error) {
            console.error(error)
        }
    }));
}

function activate(context) {
    activateLuaDoc(context.extensionPath, context.subscriptions, {
        ViewType: 'lua-doc', 
        OpenCommand: 'extension.lua.doc',
    });
}

exports.activate = activate;
