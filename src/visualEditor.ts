import * as vscode from 'vscode';
import * as path from 'path';
import matter from 'gray-matter';

/**
 * Note風のビジュアルエディタ機能を提供する
 */
export class VisualEditorProvider {
    public static readonly viewType = 'docusaurus.visualEditor';
    
    private currentDocument?: vscode.TextDocument;
    
    constructor(private readonly context: vscode.ExtensionContext) {}
    
    /**
     * WebViewパネルとしてビジュアルエディタを開く
     */
    public async openEditor(document: vscode.TextDocument) {
        this.currentDocument = document;
        
        // WebViewパネルを作成
        const panel = vscode.window.createWebviewPanel(
            VisualEditorProvider.viewType,
            `✨ ビジュアルエディタ - ${path.basename(document.fileName)}`,
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.dirname(document.fileName)),
                    ...(vscode.workspace.workspaceFolders || []).map(folder => folder.uri)
                ]
            }
        );
        
        // WebViewコンテンツを設定
        panel.webview.html = this.getWebviewContent(panel.webview);
        
        // メッセージ受信の処理
        panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.type) {
                    case 'saveContent':
                        await this.saveContent(message.content);
                        break;
                    case 'loadContent':
                        await this.loadDocument(panel.webview);
                        break;
                    case 'addElement':
                        panel.webview.postMessage({
                            type: 'addElement',
                            elementType: message.elementType
                        });
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );
        
        // アクティブエディタの変更を監視
        const editorChangeListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor && editor.document === this.currentDocument) {
                this.loadDocument(panel.webview);
            }
        });
        
        // ドキュメントの変更を監視
        const documentChangeListener = vscode.workspace.onDidChangeTextDocument((e) => {
            if (e.document === this.currentDocument) {
                this.loadDocument(panel.webview);
            }
        });
        
        // パネルが破棄されたときのクリーンアップ
        panel.onDidDispose(() => {
            editorChangeListener.dispose();
            documentChangeListener.dispose();
        });
        
        // 初期コンテンツを読み込み
        await this.loadDocument(panel.webview);
        
        // パネルを表示
        panel.reveal(vscode.ViewColumn.Beside);
    }
    
    private async loadDocument(webview: vscode.Webview) {
        if (!this.currentDocument) {
            return;
        }
        
        const content = this.currentDocument.getText();
        const { data: frontmatter, content: markdownContent } = matter(content);
        
        webview.postMessage({
            type: 'loadContent',
            frontmatter,
            content: markdownContent,
            fileName: path.basename(this.currentDocument.fileName)
        });
    }
    
    private async saveContent(content: any) {
        if (!this.currentDocument) {
            vscode.window.showErrorMessage('保存するドキュメントが選択されていません');
            return;
        }
        
        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(
            this.currentDocument.positionAt(0),
            this.currentDocument.positionAt(this.currentDocument.getText().length)
        );
        
        // フロントマターとマークダウンコンテンツを再構築
        const frontmatterYaml = Object.keys(content.frontmatter).length > 0 
            ? `---\n${Object.entries(content.frontmatter)
                .map(([key, value]) => `${key}: ${typeof value === 'string' ? `"${value}"` : value}`)
                .join('\n')}\n---\n\n`
            : '';
        
        const fullContent = frontmatterYaml + content.markdown;
        
        edit.replace(this.currentDocument.uri, fullRange, fullContent);
        await vscode.workspace.applyEdit(edit);
        
        vscode.window.showInformationMessage('ドキュメントを保存しました');
    }
    
    private getWebviewContent(webview: vscode.Webview): string {
        return `
            <!DOCTYPE html>
            <html lang="ja">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>ビジュアルエディタ</title>
                <style>
                    ${this.getStyles()}
                </style>
            </head>
            <body>
                <div class="editor-container">
                    <!-- Word風のツールバー -->
                    <div class="toolbar">
                        <div class="toolbar-section">
                            <h3>✨ ビジュアルエディタ</h3>
                        </div>
                        <div class="toolbar-section formatting-tools">
                            <div class="tool-group">
                                <label>スタイル:</label>
                                <select id="text-style" onchange="applyStyle()">
                                    <option value="normal">標準</option>
                                    <option value="h1">見出し1</option>
                                    <option value="h2">見出し2</option>
                                    <option value="h3">見出し3</option>
                                    <option value="h4">見出し4</option>
                                    <option value="quote">引用</option>
                                    <option value="code">コード</option>
                                </select>
                            </div>
                            <div class="tool-group">
                                <button onclick="formatText('bold')" title="太字" class="format-btn">B</button>
                                <button onclick="formatText('italic')" title="斜体" class="format-btn">I</button>
                                <button onclick="formatText('underline')" title="下線" class="format-btn">U</button>
                                <button onclick="formatText('strikethrough')" title="取り消し線" class="format-btn">S</button>
                            </div>
                            <div class="tool-group">
                                <button onclick="insertList('ul')" title="箇条書き">• リスト</button>
                                <button onclick="insertList('ol')" title="番号付きリスト">1. リスト</button>
                                <button onclick="insertTable()" title="表を挿入">📋 表</button>
                            </div>
                            <div class="tool-group">
                                <button onclick="insertAdmonition('info')" title="情報ボックス">💡 情報</button>
                                <button onclick="insertAdmonition('warning')" title="警告ボックス">⚠️ 警告</button>
                                <button onclick="insertCodeBlock()" title="コードブロック">💻 コード</button>
                                <button onclick="insertImage()" title="画像">🖼️ 画像</button>
                                <button onclick="insertLink()" title="リンク">🔗 リンク</button>
                            </div>
                        </div>
                        <div class="toolbar-section">
                            <button onclick="saveContent()" title="保存" class="save-btn">💾 保存</button>
                        </div>
                    </div>
                    
                    <!-- フロントマター設定 -->
                    <div class="frontmatter-section">
                        <div class="section-header" onclick="toggleSection('frontmatter')">
                            <span>📋 ドキュメント設定</span>
                            <span class="toggle-icon">▼</span>
                        </div>
                        <div class="section-content" id="frontmatter-content">
                            <div class="frontmatter-tabs">
                                <button class="tab-btn active" onclick="switchTab('basic')">基本設定</button>
                                <button class="tab-btn" onclick="switchTab('blog')" id="blog-tab" style="display: none;">ブログ設定</button>
                                <button class="tab-btn" onclick="switchTab('advanced')">詳細設定</button>
                            </div>
                            
                            <!-- 基本設定タブ -->
                            <div class="tab-content active" id="basic-tab">
                                <div class="field-row">
                                    <div class="field-group">
                                        <label>📝 タイトル</label>
                                        <input type="text" id="title" placeholder="ドキュメントのタイトル">
                                    </div>
                                    <div class="field-group">
                                        <label>📄 説明</label>
                                        <textarea id="description" rows="2" placeholder="ドキュメントの説明"></textarea>
                                    </div>
                                </div>
                                <div class="field-row">
                                    <div class="field-group">
                                        <label>📍 サイドバー位置</label>
                                        <input type="number" id="sidebar_position" placeholder="1" min="1">
                                    </div>
                                    <div class="field-group">
                                        <label>🔗 スラッグ (URL)</label>
                                        <input type="text" id="slug" placeholder="my-document">
                                    </div>
                                </div>
                            </div>
                            
                            <!-- ブログ設定タブ -->
                            <div class="tab-content" id="blog-tab-content">
                                <div class="field-row">
                                    <div class="field-group">
                                        <label>📅 公開日</label>
                                        <input type="date" id="date">
                                    </div>
                                    <div class="field-group">
                                        <label>✍️ 著者</label>
                                        <input type="text" id="authors" placeholder="著者名">
                                    </div>
                                </div>
                                <div class="field-row">
                                    <div class="field-group full-width">
                                        <label>🏷️ タグ (カンマ区切り)</label>
                                        <input type="text" id="tags" placeholder="JavaScript, React, Tutorial">
                                        <div class="tag-suggestions">
                                            <span class="tag-suggestion" onclick="addTag('JavaScript')">JavaScript</span>
                                            <span class="tag-suggestion" onclick="addTag('React')">React</span>
                                            <span class="tag-suggestion" onclick="addTag('TypeScript')">TypeScript</span>
                                            <span class="tag-suggestion" onclick="addTag('Tutorial')">Tutorial</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- 詳細設定タブ -->
                            <div class="tab-content" id="advanced-tab">
                                <div class="field-row">
                                    <div class="field-group">
                                        <label>🔍 SEOタイトル</label>
                                        <input type="text" id="seo_title" placeholder="検索エンジン用タイトル">
                                    </div>
                                    <div class="field-group">
                                        <label>🖼️ サムネイル画像</label>
                                        <input type="text" id="image" placeholder="./images/thumbnail.jpg">
                                    </div>
                                </div>
                                <div class="field-row">
                                    <div class="field-group">
                                        <label>🔒 下書き</label>
                                        <input type="checkbox" id="draft">
                                    </div>
                                    <div class="field-group">
                                        <label>📱 モバイル表示</label>
                                        <input type="checkbox" id="hide_table_of_contents">
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Word風のメインエディタ -->
                    <div class="content-section">
                        <div class="section-header">
                            <span>📝 コンテンツ</span>
                            <div class="editor-stats">
                                <span id="word-count">0語</span>
                                <span id="char-count">0文字</span>
                                <span id="reading-time">1分</span>
                            </div>
                        </div>
                        <div class="editor-wrapper">
                            <div id="visual-editor" class="visual-editor" contenteditable="true" spellcheck="false">
                                <div class="editor-placeholder">ここに内容を入力してください...</div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- マークダウンプレビュー（折りたたみ可能） -->
                    <div class="markdown-section">
                        <div class="section-header" onclick="toggleSection('markdown')">
                            <span>🔍 マークダウン プレビュー</span>
                            <span class="toggle-icon">▼</span>
                        </div>
                        <div class="section-content collapsed" id="markdown-content">
                            <textarea id="markdown-output" rows="15" readonly></textarea>
                        </div>
                    </div>
                </div>
                
                <script>
                    ${this.getScript()}
                </script>
            </body>
            </html>
        `;
    }
    
    private getStyles(): string {
        return `
            * {
                box-sizing: border-box;
            }
            
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                margin: 0;
                padding: 0;
                background: var(--vscode-editor-background);
                color: var(--vscode-editor-foreground);
                font-size: 13px;
                overflow-x: hidden;
            }
            
            .editor-container {
                max-width: 100%;
                height: 100vh;
                display: flex;
                flex-direction: column;
            }
            
            /* Word風ツールバー */
            .toolbar {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 12px;
                background: var(--vscode-titleBar-activeBackground);
                border-bottom: 1px solid var(--vscode-panel-border);
                flex-wrap: wrap;
                gap: 8px;
                position: sticky;
                top: 0;
                z-index: 100;
            }
            
            .toolbar-section {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .toolbar h3 {
                margin: 0;
                color: var(--vscode-titleBar-activeForeground);
                font-size: 14px;
            }
            
            .formatting-tools {
                display: flex;
                gap: 12px;
                flex-wrap: wrap;
            }
            
            .tool-group {
                display: flex;
                align-items: center;
                gap: 4px;
                padding: 0 8px;
                border-right: 1px solid var(--vscode-panel-border);
            }
            
            .tool-group:last-child {
                border-right: none;
            }
            
            .tool-group label {
                font-size: 11px;
                color: var(--vscode-titleBar-activeForeground);
                margin-right: 4px;
            }
            
            #text-style {
                background: var(--vscode-dropdown-background);
                color: var(--vscode-dropdown-foreground);
                border: 1px solid var(--vscode-dropdown-border);
                border-radius: 3px;
                padding: 2px 6px;
                font-size: 11px;
            }
            
            .format-btn {
                width: 24px;
                height: 24px;
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: 1px solid var(--vscode-button-border);
                border-radius: 3px;
                font-weight: bold;
                font-size: 11px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .format-btn:hover {
                background: var(--vscode-button-hoverBackground);
            }
            
            .format-btn.active {
                background: var(--vscode-button-secondaryBackground);
                color: var(--vscode-button-secondaryForeground);
            }
            
            .toolbar button {
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: 1px solid var(--vscode-button-border);
                padding: 4px 8px;
                border-radius: 3px;
                cursor: pointer;
                font-size: 11px;
                white-space: nowrap;
            }
            
            .toolbar button:hover {
                background: var(--vscode-button-hoverBackground);
            }
            
            .save-btn {
                background: var(--vscode-textLink-foreground) !important;
                color: white !important;
                font-weight: 600;
            }
            
            /* セクション共通スタイル */
            .frontmatter-section, .content-section, .markdown-section {
                background: var(--vscode-panel-background);
                border-bottom: 1px solid var(--vscode-panel-border);
                overflow: hidden;
            }
            
            .section-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 16px;
                background: var(--vscode-sideBar-background);
                border-bottom: 1px solid var(--vscode-panel-border);
                cursor: pointer;
                user-select: none;
                font-weight: 600;
                font-size: 13px;
            }
            
            .section-header:hover {
                background: var(--vscode-list-hoverBackground);
            }
            
            .toggle-icon {
                transition: transform 0.2s;
            }
            
            .section-header.collapsed .toggle-icon {
                transform: rotate(-90deg);
            }
            
            .section-content {
                padding: 16px;
                transition: max-height 0.3s ease;
                overflow: hidden;
            }
            
            .section-content.collapsed {
                max-height: 0;
                padding: 0 16px;
            }
            
            .editor-stats {
                display: flex;
                gap: 12px;
                font-size: 11px;
                color: var(--vscode-descriptionForeground);
            }
            
            /* フロントマタータブ */
            .frontmatter-tabs {
                display: flex;
                margin-bottom: 16px;
                border-bottom: 1px solid var(--vscode-panel-border);
            }
            
            .tab-btn {
                background: none;
                border: none;
                padding: 8px 16px;
                cursor: pointer;
                color: var(--vscode-tab-inactiveForeground);
                border-bottom: 2px solid transparent;
                font-size: 12px;
            }
            
            .tab-btn.active {
                color: var(--vscode-tab-activeForeground);
                border-bottom-color: var(--vscode-textLink-foreground);
            }
            
            .tab-content {
                display: none;
            }
            
            .tab-content.active {
                display: block;
            }
            
            .field-row {
                display: flex;
                gap: 16px;
                margin-bottom: 16px;
            }
            
            .field-group {
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            
            .field-group.full-width {
                flex: 100%;
            }
            
            .field-group label {
                font-weight: 600;
                color: var(--vscode-editor-foreground);
                font-size: 12px;
            }
            
            .field-group input, .field-group textarea, .field-group select {
                background: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
                padding: 8px;
                font-size: 13px;
                font-family: inherit;
            }
            
            .field-group input:focus, .field-group textarea:focus, .field-group select:focus {
                outline: none;
                border-color: var(--vscode-focusBorder);
                box-shadow: 0 0 0 1px var(--vscode-focusBorder);
            }
            
            .tag-suggestions {
                display: flex;
                gap: 6px;
                margin-top: 8px;
                flex-wrap: wrap;
            }
            
            .tag-suggestion {
                background: var(--vscode-badge-background);
                color: var(--vscode-badge-foreground);
                padding: 2px 8px;
                border-radius: 12px;
                font-size: 11px;
                cursor: pointer;
                user-select: none;
            }
            
            .tag-suggestion:hover {
                opacity: 0.8;
            }
            
            /* Word風エディタ */
            .content-section {
                flex: 1;
                display: flex;
                flex-direction: column;
            }
            
            .editor-wrapper {
                flex: 1;
                padding: 20px;
                background: var(--vscode-editor-background);
                overflow-y: auto;
            }
            
            .visual-editor {
                min-height: 400px;
                max-width: 800px;
                margin: 0 auto;
                background: var(--vscode-editor-background);
                padding: 40px;
                border-radius: 8px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                line-height: 1.6;
                font-size: 14px;
                border: 1px solid var(--vscode-input-border);
                position: relative;
            }
            
            .visual-editor:focus {
                outline: none;
                border-color: var(--vscode-focusBorder);
            }
            
            .editor-placeholder {
                color: var(--vscode-input-placeholderForeground);
                font-style: italic;
                pointer-events: none;
                position: absolute;
                top: 40px;
                left: 40px;
            }
            
            .visual-editor:focus .editor-placeholder,
            .visual-editor:not(:empty) .editor-placeholder {
                display: none;
            }
            
            /* エディタ内要素のスタイル */
            .visual-editor h1 {
                font-size: 2.5em;
                color: var(--vscode-textLink-foreground);
                margin: 24px 0 16px 0;
                font-weight: 700;
                border-bottom: 2px solid var(--vscode-textLink-foreground);
                padding-bottom: 8px;
            }
            
            .visual-editor h2 {
                font-size: 2em;
                color: var(--vscode-textLink-foreground);
                margin: 20px 0 12px 0;
                font-weight: 600;
            }
            
            .visual-editor h3 {
                font-size: 1.5em;
                color: var(--vscode-textLink-foreground);
                margin: 16px 0 10px 0;
                font-weight: 600;
            }
            
            .visual-editor h4 {
                font-size: 1.25em;
                color: var(--vscode-textLink-foreground);
                margin: 14px 0 8px 0;
                font-weight: 600;
            }
            
            .visual-editor p {
                margin: 12px 0;
                color: var(--vscode-editor-foreground);
            }
            
            .visual-editor blockquote {
                border-left: 4px solid var(--vscode-textLink-foreground);
                padding-left: 16px;
                margin: 16px 0;
                color: var(--vscode-descriptionForeground);
                background: var(--vscode-textBlockQuote-background);
                padding: 16px;
                border-radius: 4px;
            }
            
            .visual-editor ul, .visual-editor ol {
                margin: 12px 0;
                padding-left: 24px;
            }
            
            .visual-editor li {
                margin: 4px 0;
            }
            
            .visual-editor code {
                background: var(--vscode-textCodeBlock-background);
                color: var(--vscode-editor-foreground);
                padding: 2px 4px;
                border-radius: 3px;
                font-family: 'Courier New', monospace;
                font-size: 0.9em;
            }
            
            .visual-editor pre {
                background: var(--vscode-textCodeBlock-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: 6px;
                padding: 16px;
                overflow-x: auto;
                margin: 16px 0;
            }
            
            .visual-editor table {
                border-collapse: collapse;
                width: 100%;
                margin: 16px 0;
            }
            
            .visual-editor th, .visual-editor td {
                border: 1px solid var(--vscode-panel-border);
                padding: 8px 12px;
                text-align: left;
            }
            
            .visual-editor th {
                background: var(--vscode-panel-background);
                font-weight: 600;
            }
            
            /* アドモニション */
            .admonition {
                margin: 16px 0;
                border-radius: 6px;
                padding: 16px;
                border-left: 4px solid;
                background: var(--vscode-panel-background);
            }
            
            .admonition.info {
                border-left-color: #1890ff;
            }
            
            .admonition.warning {
                border-left-color: #faad14;
            }
            
            .admonition.danger {
                border-left-color: #ff4d4f;
            }
            
            .admonition-title {
                font-weight: 600;
                margin-bottom: 8px;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            /* マークダウンプレビュー */
            #markdown-output {
                width: 100%;
                background: var(--vscode-editor-background);
                color: var(--vscode-editor-foreground);
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
                padding: 12px;
                font-family: 'Courier New', monospace;
                font-size: 12px;
                resize: vertical;
                min-height: 200px;
            }
            
            /* レスポンシブ対応 */
            @media (max-width: 768px) {
                .formatting-tools {
                    order: 3;
                    flex-basis: 100%;
                }
                
                .field-row {
                    flex-direction: column;
                    gap: 12px;
                }
                
                .visual-editor {
                    padding: 20px;
                    margin: 0;
                }
            }
        `;
    }
    
    private getScript(): string {
        return `
            const vscode = acquireVsCodeApi();
            let currentContent = { frontmatter: {}, markdown: '' };
            
            // VSCodeからのメッセージを受信
            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.type) {
                    case 'loadContent':
                        loadContent(message);
                        break;
                    case 'addElement':
                        insertElement(message.elementType);
                        break;
                }
            });
            
            function loadContent(data) {
                // フロントマターを読み込み
                const frontmatter = data.frontmatter || {};
                document.getElementById('title').value = frontmatter.title || '';
                document.getElementById('description').value = frontmatter.description || '';
                document.getElementById('tags').value = Array.isArray(frontmatter.tags) ? frontmatter.tags.join(', ') : (frontmatter.tags || '');
                document.getElementById('sidebar_position').value = frontmatter.sidebar_position || '';
                document.getElementById('date').value = frontmatter.date || '';
                document.getElementById('authors').value = frontmatter.authors || '';
                
                // マークダウンコンテンツを読み込み
                const editor = document.getElementById('visual-editor');
                if (data.content) {
                    editor.innerHTML = convertMarkdownToHTML(data.content);
                    editor.classList.remove('placeholder');
                } else {
                    editor.innerHTML = '<div class="placeholder">ここに内容を入力するか、上のツールバーから要素を追加してください...</div>';
                }
            }
            
            function convertMarkdownToHTML(markdown) {
                // 簡単なマークダウン→HTML変換
                return markdown
                    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
                    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
                    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
                    .replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>')
                    .replace(/\\*(.*?)\\*/g, '<em>$1</em>')
                    .replace(/\`(.*?)\`/g, '<code>$1</code>')
                    .replace(/\\n\\n/g, '</p><p>')
                    .replace(/\\n/g, '<br>');
            }
            
            function convertHTMLToMarkdown(html) {
                // 簡単なHTML→マークダウン変換
                return html
                    .replace(/<h1>(.*?)<\\/h1>/g, '# $1\\n\\n')
                    .replace(/<h2>(.*?)<\\/h2>/g, '## $1\\n\\n')
                    .replace(/<h3>(.*?)<\\/h3>/g, '### $1\\n\\n')
                    .replace(/<strong>(.*?)<\\/strong>/g, '**$1**')
                    .replace(/<em>(.*?)<\\/em>/g, '*$1*')
                    .replace(/<code>(.*?)<\\/code>/g, '\`$1\`')
                    .replace(/<p>(.*?)<\\/p>/g, '$1\\n\\n')
                    .replace(/<br>/g, '\\n')
                    .replace(/<div class="placeholder">.*?<\\/div>/g, '');
            }
            
            function addElement(elementType) {
                insertElement(elementType);
            }
            
            function insertElement(elementType) {
                const editor = document.getElementById('visual-editor');
                const placeholder = editor.querySelector('.placeholder');
                if (placeholder) {
                    placeholder.remove();
                }
                
                let element = '';
                switch (elementType) {
                    case 'heading':
                        element = '<h2 contenteditable="true">新しい見出し</h2>';
                        break;
                    case 'paragraph':
                        element = '<p contenteditable="true">新しい段落を入力してください...</p>';
                        break;
                    case 'list':
                        element = '<ul><li contenteditable="true">項目1</li><li contenteditable="true">項目2</li></ul>';
                        break;
                    case 'admonition':
                        element = '<div class="element-block"><div class="element-type">💡 Info</div><div contenteditable="true">重要な情報をここに入力してください...</div></div>';
                        break;
                    case 'code':
                        element = '<div class="element-block"><div class="element-type">💻 Code</div><pre><code contenteditable="true">console.log("Hello, World!");</code></pre></div>';
                        break;
                    case 'image':
                        element = '<div class="element-block"><div class="element-type">🖼️ Image</div><p>画像パス: <input type="text" placeholder="./images/example.png" style="width: 200px;"></p><p>Alt text: <input type="text" placeholder="画像の説明" style="width: 200px;"></p></div>';
                        break;
                }
                
                editor.innerHTML += element;
                updateMarkdownPreview();
            }
            
            function updateMarkdownPreview() {
                const editor = document.getElementById('visual-editor');
                const markdown = convertHTMLToMarkdown(editor.innerHTML);
                document.getElementById('markdown-output').value = markdown;
            }
            
            function saveContent() {
                const frontmatter = {
                    title: document.getElementById('title').value,
                    description: document.getElementById('description').value,
                    tags: document.getElementById('tags').value.split(',').map(tag => tag.trim()).filter(tag => tag),
                    sidebar_position: parseInt(document.getElementById('sidebar_position').value) || undefined,
                    date: document.getElementById('date').value,
                    authors: document.getElementById('authors').value
                };
                
                // 空の値を除去
                Object.keys(frontmatter).forEach(key => {
                    if (!frontmatter[key] || (Array.isArray(frontmatter[key]) && frontmatter[key].length === 0)) {
                        delete frontmatter[key];
                    }
                });
                
                const editor = document.getElementById('visual-editor');
                const markdown = convertHTMLToMarkdown(editor.innerHTML);
                
                vscode.postMessage({
                    type: 'saveContent',
                    content: {
                        frontmatter,
                        markdown
                    }
                });
            }
            
            // エディタの変更を監視してプレビューを更新
            document.getElementById('visual-editor').addEventListener('input', updateMarkdownPreview);
            
            // フロントマターの変更も監視
            ['title', 'description', 'tags', 'sidebar_position', 'date', 'authors'].forEach(id => {
                document.getElementById(id).addEventListener('input', updateMarkdownPreview);
            });
            
            // 初期コンテンツを読み込み
            vscode.postMessage({ type: 'loadContent' });
        `;
    }
}
