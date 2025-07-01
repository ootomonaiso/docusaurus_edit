import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import matter from 'gray-matter';
import { marked } from 'marked';
import * as Prism from 'prismjs';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-scss';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-bash';

/**
 * Docusaurus特有のMarkdownプレビュー機能を提供する
 */
export class DocusaurusPreviewProvider implements vscode.TextDocumentContentProvider {
    private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    public readonly onDidChange = this._onDidChange.event;
    
    constructor(private context: vscode.ExtensionContext) {
        // Configure marked for better markdown processing
        marked.setOptions({
            gfm: true,        // GitHub Flavored Markdown
            breaks: true,     // Convert '\n' to <br>
            pedantic: false
        });
        
        // カスタムレンダラーを設定
        const renderer = new marked.Renderer();
        
        // コードブロックのカスタムレンダリング
        renderer.code = (token: any) => {
            const { text: code, lang: language } = token;
            let highlightedCode = this.escapeHtml(code);
            
            if (language) {
                try {
                    const grammar = Prism.languages[language];
                    if (grammar) {
                        highlightedCode = Prism.highlight(code, grammar, language);
                    }
                } catch (error) {
                    console.warn(`Failed to highlight code for language: ${language}`, error);
                }
            }
            
            const languageClass = language ? ` class="language-${language}"` : '';
            return `<pre><code${languageClass}>${highlightedCode}</code></pre>`;
        };
        
        // 画像のカスタムレンダリング
        renderer.image = (token: any) => {
            const { href, title, text } = token;
            let resolvedHref = href;
            
            try {
                // 絶対URLの場合はそのまま
                if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('data:')) {
                    resolvedHref = href;
                } else {
                    // 相対パスの場合、現在のファイルから解決
                    const activeEditor = vscode.window.activeTextEditor;
                    if (activeEditor) {
                        const currentDir = path.dirname(activeEditor.document.uri.fsPath);
                        let resolvedPath = href;
                        
                        if (href.startsWith('./') || href.startsWith('../') || (!href.startsWith('/') && !href.startsWith('\\'))) {
                            resolvedPath = path.resolve(currentDir, href);
                        } else if (href.startsWith('/')) {
                            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                            if (workspaceRoot) {
                                resolvedPath = path.join(workspaceRoot, href.substring(1));
                            }
                        }
                        
                        // WebView用のvscode-resource URIに変換
                        const fileUri = vscode.Uri.file(resolvedPath);
                        const webviewUri = fileUri.with({ scheme: 'vscode-resource' });
                        resolvedHref = webviewUri.toString();
                    }
                }
            } catch (error) {
                console.error('Image rendering error:', error);
                // エラーの場合はfile:// URIで試行
                try {
                    const fileUri = vscode.Uri.file(href);
                    resolvedHref = fileUri.toString();
                } catch (fallbackError) {
                    console.error('Fallback image rendering error:', fallbackError);
                }
            }
            
            const titleAttr = title ? ` title="${title}"` : '';
            return `<img src="${resolvedHref}" alt="${text}"${titleAttr} style="max-width: 100%; height: auto; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); display: block; margin: 16px 0;">`;
        };
        
        marked.setOptions({ renderer });
    }
    
    public provideTextDocumentContent(uri: vscode.Uri): string {
        const originalUri = vscode.Uri.parse(uri.query);
        const document = vscode.workspace.textDocuments.find((doc: vscode.TextDocument) => doc.uri.toString() === originalUri.toString());
        
        if (!document) {
            return '<h1>ドキュメントが見つかりません</h1>';
        }
        
        return this.generatePreviewContent(document);
    }
    
    private generatePreviewContent(document: vscode.TextDocument): string {
        const content = document.getText();
        const { data: frontmatter, content: markdownContent } = matter(content);
        
        // ファイルパスからコンテンツタイプを判定
        const isBlogPost = document.fileName.includes('blog') || 
                          frontmatter.slug || 
                          frontmatter.authors || 
                          frontmatter.tags;
        
        const processedContent = this.processDocusaurusContent(markdownContent);
        
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Docusaurus Preview</title>
                <style>
                    ${this.getPreviewStyles()}
                </style>
            </head>
            <body>
                <div class="docusaurus-preview">
                    ${this.generatePreviewHeader(document, frontmatter, isBlogPost)}
                    <div class="preview-content">
                        ${processedContent}
                    </div>
                </div>
            </body>
            </html>
        `;
    }
    
    /**
     * WebView用のコンテンツを生成
     */
    public generateWebViewContent(document: vscode.TextDocument, webview: vscode.Webview): string {
        const content = document.getText();
        const { data: frontmatter, content: markdownContent } = matter(content);
        
        // ファイルパスからコンテンツタイプを判定
        const isBlogPost = document.fileName.includes('blog') || 
                          frontmatter.slug || 
                          frontmatter.date || 
                          frontmatter.authors;
        
        // WebView用に画像パスを変換
        const processedContent = this.processWebViewImages(markdownContent, document, webview);
        
        // HTMLコンテンツを生成（Docusaurus特有の処理を含む）
        const htmlContent = this.processDocusaurusContent(processedContent);
        
        return `
            <!DOCTYPE html>
            <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Docusaurus Preview</title>
                    <style>
                        ${this.getPreviewStyles()}
                    </style>
                </head>
                <body>
                    <div class="docusaurus-preview">
                        ${this.generatePreviewHeader(document, frontmatter, isBlogPost)}
                        <div class="preview-content">
                            ${htmlContent}
                        </div>
                    </div>
                </body>
            </html>
        `;
    }
    
    /**
     * WebView用に画像パスを変換
     */
    private processWebViewImages(content: string, document: vscode.TextDocument, webview: vscode.Webview): string {
        const currentDir = path.dirname(document.uri.fsPath);
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        
        // Markdown画像記法を処理
        const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
        
        return content.replace(imgRegex, (match, alt, src) => {
            // 絶対URLの場合はそのまま
            if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
                return match;
            }
            
            try {
                let resolvedPath = src;
                
                if (src.startsWith('./') || src.startsWith('../') || (!src.startsWith('/') && !src.startsWith('\\'))) {
                    // 相対パスの場合、現在のファイルディレクトリから解決
                    resolvedPath = path.resolve(currentDir, src);
                } else if (src.startsWith('/') && workspaceRoot) {
                    // ルートからの絶対パスの場合、ワークスペースルートから解決
                    resolvedPath = path.join(workspaceRoot, src.substring(1));
                }
                
                // WebView用のURIに変換
                const fileUri = vscode.Uri.file(resolvedPath);
                const webviewUri = webview.asWebviewUri(fileUri);
                
                return `![${alt}](${webviewUri.toString()})`;
            } catch (error) {
                console.error('WebView image processing error:', error);
                return match;
            }
        });
    }
    
    private processDocusaurusContent(content: string): string {
        console.log('Processing Docusaurus content, length:', content.length);
        let processedContent = content;
        
        // タブの処理
        console.log('Step 1: Processing tabs');
        processedContent = this.processTabs(processedContent);
        
        // コードブロックの処理
        console.log('Step 2: Processing code blocks');
        processedContent = this.processCodeBlocks(processedContent);
        
        // MDXコンポーネントの処理
        console.log('Step 3: Processing MDX components');
        processedContent = this.processMDXComponents(processedContent);
        
        // 最後にMarkdownの基本処理（Admonitionを含む）
        console.log('Step 4: Processing basic markdown with admonitions');
        processedContent = this.processBasicMarkdown(processedContent);
        
        console.log('Docusaurus content processing complete');
        return processedContent;
    }
    
    private processFrontmatter(content: string): string {
        const frontmatterRegex = /^---\n([\s\S]*?)\n---\n/;
        const match = content.match(frontmatterRegex);
        
        if (match) {
            const frontmatter = match[1];
            const restContent = content.replace(frontmatterRegex, '');
            
            const frontmatterHtml = `
                <div class="frontmatter">
                    <h3>📋 フロントマター</h3>
                    <pre><code>${this.escapeHtml(frontmatter)}</code></pre>
                </div>
            `;
            
            return frontmatterHtml + restContent;
        }
        
        return content;
    }
    
    private processAdmonitions(content: string): string {
        console.log('Processing admonitions in content:', content.substring(0, 200) + '...');
        
        // より柔軟なAdmonition正規表現
        // 1. 開始タグ: :::type (オプションでタイトル)
        // 2. 本文: 任意の文字（改行含む）
        // 3. 終了タグ: :::
        const admonitionPattern = /:::(note|tip|info|caution|danger|warning)([^\r\n]*)\r?\n([\s\S]*?)\r?\n:::/gi;
        
        // まず、すべてのマッチを検出
        const matches = [];
        let match;
        while ((match = admonitionPattern.exec(content)) !== null) {
            matches.push({
                full: match[0],
                type: match[1],
                title: match[2].trim(),
                body: match[3].trim(),
                index: match.index
            });
        }
        
        console.log(`Found ${matches.length} admonitions:`, matches.map(m => ({ type: m.type, title: m.title })));
        
        // マッチを後ろから前に置換（インデックスがずれないように）
        let result = content;
        for (let i = matches.length - 1; i >= 0; i--) {
            const admonition = matches[i];
            const displayTitle = admonition.title || this.getAdmonitionTitle(admonition.type);
            const icon = this.getAdmonitionIcon(admonition.type);
            
            const replacement = `
                <div class="admonition admonition-${admonition.type}">
                    <div class="admonition-heading">
                        <span class="admonition-icon">${icon}</span>
                        <span class="admonition-title">${displayTitle}</span>
                    </div>
                    <div class="admonition-content">
                        ${admonition.body ? this.processBasicMarkdown(admonition.body) : '<p>（内容なし）</p>'}
                    </div>
                </div>
            `;
            
            result = result.substring(0, admonition.index) + replacement + result.substring(admonition.index + admonition.full.length);
        }
        
        console.log('Admonition processing complete. Replaced:', matches.length);
        return result;
    }
    
    /**
     * 再帰処理を避けるAdmonition専用の処理メソッド
     */
    private processAdmonitionsDirectly(content: string): string {
        console.log('Processing admonitions directly in content:', content.substring(0, 200) + '...');
        
        // より柔軟なAdmonition正規表現
        const admonitionPattern = /:::(note|tip|info|caution|danger|warning)([^\r\n]*)\r?\n([\s\S]*?)\r?\n:::/gi;
        
        // まず、すべてのマッチを検出
        const matches = [];
        let match;
        while ((match = admonitionPattern.exec(content)) !== null) {
            matches.push({
                full: match[0],
                type: match[1],
                title: match[2].trim(),
                body: match[3].trim(),
                index: match.index
            });
        }
        
        console.log(`Found ${matches.length} admonitions directly:`, matches.map(m => ({ type: m.type, title: m.title })));
        
        // マッチを後ろから前に置換（インデックスがずれないように）
        let result = content;
        for (let i = matches.length - 1; i >= 0; i--) {
            const admonition = matches[i];
            const displayTitle = admonition.title || this.getAdmonitionTitle(admonition.type);
            const icon = this.getAdmonitionIcon(admonition.type);
            
            // 単純なMarkdown処理のみ（再帰を避ける）
            let processedBody = admonition.body;
            if (processedBody) {
                // 基本的なMarkdown変換のみ
                processedBody = processedBody
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em>$1</em>')
                    .replace(/`([^`]+)`/g, '<code>$1</code>')
                    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
                    .replace(/\n\n/g, '</p><p>')
                    .replace(/\n/g, '<br>');
                
                processedBody = '<p>' + processedBody + '</p>';
            }
            
            const replacement = `
                <div class="admonition admonition-${admonition.type}">
                    <div class="admonition-heading">
                        <span class="admonition-icon">${icon}</span>
                        <span class="admonition-title">${displayTitle}</span>
                    </div>
                    <div class="admonition-content">
                        ${processedBody || '<p>（内容なし）</p>'}
                    </div>
                </div>
            `;
            
            result = result.substring(0, admonition.index) + replacement + result.substring(admonition.index + admonition.full.length);
        }
        
        console.log('Direct admonition processing complete. Replaced:', matches.length);
        return result;
    }
    
    private processTabs(content: string): string {
        // <Tabs>と</Tabs>の処理
        let processedContent = content.replace(/<Tabs[^>]*>/g, '<div class="tabs-container">');
        processedContent = processedContent.replace(/<\/Tabs>/g, '</div>');
        
        // <TabItem>の処理
        const tabItemRegex = /<TabItem[^>]*value="([^"]*)"[^>]*label="([^"]*)"[^>]*>([\s\S]*?)<\/TabItem>/g;
        processedContent = processedContent.replace(tabItemRegex, (match, value, label, content) => {
            return `
                <div class="tab-item" data-value="${value}">
                    <div class="tab-label">${label}</div>
                    <div class="tab-content">
                        ${this.processBasicMarkdown(content.trim())}
                    </div>
                </div>
            `;
        });
        
        return processedContent;
    }
    
    private processCodeBlocks(content: string): string {
        const codeBlockRegex = /```(\w+)(?:\s+title="([^"]*)")?\n([\s\S]*?)\n```/g;
        
        return content.replace(codeBlockRegex, (match, language, title, code) => {
            const titleHtml = title ? `<div class="code-title">${title}</div>` : '';
            
            // Prism.jsでシンタックスハイライトを適用
            let highlightedCode = this.escapeHtml(code);
            try {
                const grammar = Prism.languages[language];
                if (grammar) {
                    highlightedCode = Prism.highlight(code, grammar, language);
                }
            } catch (error) {
                console.warn(`Failed to highlight code for language: ${language}`, error);
            }
            
            return `
                <div class="code-block">
                    ${titleHtml}
                    <pre><code class="language-${language}">${highlightedCode}</code></pre>
                </div>
            `;
        });
    }
    
    private processMDXComponents(content: string): string {
        // CodeBlockコンポーネントの処理
        const codeBlockRegex = /<CodeBlock[^>]*language="([^"]*)"[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/CodeBlock>/g;
        content = content.replace(codeBlockRegex, (match, language, title, code) => {
            // Prism.jsでシンタックスハイライトを適用
            let highlightedCode = this.escapeHtml(code.trim());
            try {
                const grammar = Prism.languages[language];
                if (grammar) {
                    highlightedCode = Prism.highlight(code.trim(), grammar, language);
                }
            } catch (error) {
                console.warn(`Failed to highlight code for language: ${language}`, error);
            }
            
            return `
                <div class="code-block">
                    <div class="code-title">${title}</div>
                    <pre><code class="language-${language}">${highlightedCode}</code></pre>
                </div>
            `;
        });
        
        // Detailsコンポーネントの処理
        const detailsRegex = /<Details[^>]*summary="([^"]*)"[^>]*>([\s\S]*?)<\/Details>/g;
        content = content.replace(detailsRegex, (match, summary, body) => {
            return `
                <details class="details-component">
                    <summary>${summary}</summary>
                    <div class="details-content">
                        ${this.processBasicMarkdown(body.trim())}
                    </div>
                </details>
            `;
        });
        
        return content;
    }
    
    private processBasicMarkdown(content: string): string {
        try {
            // 最初にDocusaurus特有の処理を実行してからmarkedを適用
            let processedContent = content;
            
            // Admonitionを先に処理（markedの前に）
            processedContent = this.processAdmonitionsDirectly(processedContent);
            
            // marked を使用してMarkdownをHTMLに変換
            let htmlContent = marked(processedContent) as string;
            
            // Docusaurus特有の処理を追加で行う
            // 取り消し線の処理（marked が GFM モードで処理しているはずだが、念のため）
//             htmlContent = htmlContent.replace(/~~(.*?)~~/g, '<del>$1</del>');
            
            // タスクリストの処理
            htmlContent = htmlContent.replace(/\[ \]/g, '<input type="checkbox" disabled>');
            htmlContent = htmlContent.replace(/\[x\]/g, '<input type="checkbox" checked disabled>');
            
            // 画像のパス処理
            htmlContent = this.processImages(htmlContent);
            
            return htmlContent;
        } catch (error) {
            console.error('Markdown processing error:', error);
            // フォールバック: 基本的な処理のみ
            return this.fallbackMarkdownProcessing(content);
        }
    }
    
    private fallbackMarkdownProcessing(content: string): string {
        // 見出し
        content = content.replace(/^### (.*$)/gim, '<h3>$1</h3>');
        content = content.replace(/^## (.*$)/gim, '<h2>$1</h2>');
        content = content.replace(/^# (.*$)/gim, '<h1>$1</h1>');
        
        // 太字とイタリック
        content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        content = content.replace(/\*(.*?)\*/g, '<em>$1</em>');
        
        // 取り消し線
        content = content.replace(/~~(.*?)~~/g, '<del>$1</del>');
        
        // インラインコード
        content = content.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // リンク
        content = content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
        
        // リスト（順序なし）
        content = content.replace(/^[\s]*\* (.+)$/gm, '<li>$1</li>');
        content = content.replace(/^[\s]*- (.+)$/gm, '<li>$1</li>');
        content = content.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
        
        // リスト（順序あり）
        content = content.replace(/^[\s]*\d+\. (.+)$/gm, '<li>$1</li>');
        
        // 改行処理
        content = content.replace(/\n\n/g, '</p><p>');
        content = '<p>' + content + '</p>';
        
        return content;
    }
    
    private getAdmonitionTitle(type: string): string {
        const titles: { [key: string]: string } = {
            note: 'ノート',
            tip: 'ヒント',
            info: '情報',
            caution: '注意',
            danger: '危険',
            warning: '警告'
        };
        return titles[type] || type;
    }
    
    private getAdmonitionIcon(type: string): string {
        const icons: { [key: string]: string } = {
            note: '📝',
            tip: '💡',
            info: 'ℹ️',
            caution: '⚠️',
            danger: '🚨',
            warning: '⚠️'
        };
        return icons[type] || '📌';
    }
    
    private escapeHtml(text: string): string {
        const map: { [key: string]: string } = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, (m) => map[m]);
    }
    
    private getPreviewStyles(): string {
        return `
            :root {
                --bg-primary: #ffffff;
                --bg-secondary: #f8f9fa;
                --bg-tertiary: #f6f8fa;
                --text-primary: #333333;
                --text-secondary: #666666;
                --text-muted: #6a737d;
                --border-color: #e1e4e8;
                --border-light: #dfe2e5;
                --accent-color: #2e8555;
                --code-bg: #f1f3f4;
                --code-text: #d73a49;
                --shadow: rgba(0,0,0,0.1);
            }
            
            @media (prefers-color-scheme: dark) {
                :root {
                    --bg-primary: #1e1e1e;
                    --bg-secondary: #252526;
                    --bg-tertiary: #2d2d30;
                    --text-primary: #cccccc;
                    --text-secondary: #9d9d9d;
                    --text-muted: #6d6d6d;
                    --border-color: #3e3e42;
                    --border-light: #484848;
                    --accent-color: #4fc3f7;
                    --code-bg: #2d2d30;
                    --code-text: #9cdcfe;
                    --shadow: rgba(0,0,0,0.3);
                }
            }

            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                line-height: 1.6;
                color: var(--text-primary);
                max-width: 900px;
                margin: 0 auto;
                padding: 20px;
                background-color: var(--bg-secondary);
            }
            
            .docusaurus-preview {
                background: var(--bg-primary);
                border-radius: 8px;
                box-shadow: 0 2px 8px var(--shadow);
                padding: 30px;
            }
            
            .preview-header {
                border-bottom: 2px solid var(--border-color);
                padding-bottom: 20px;
                margin-bottom: 30px;
            }
            
            .header-meta {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 10px;
            }
            
            .content-type {
                background: var(--accent-color);
                color: white;
                padding: 4px 8px;
                border-radius: 12px;
                font-size: 12px;
                font-weight: 600;
            }
            
            .slug {
                background: var(--code-bg);
                color: var(--text-secondary);
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                font-family: monospace;
            }
            
            .position {
                background: #ffd43b;
                color: #333;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: 600;
            }
            
            .blog-title, .docs-title {
                margin: 0;
                color: var(--accent-color);
                font-size: 2.5em;
                font-weight: 700;
            }
            
            .blog-meta {
                display: flex;
                gap: 20px;
                margin: 15px 0;
                flex-wrap: wrap;
            }
            
            .date, .authors {
                color: var(--text-secondary);
                font-size: 14px;
                display: flex;
                align-items: center;
                gap: 5px;
            }
            
            .tags {
                margin: 15px 0;
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
            }
            
            .tag {
                background: #e3f2fd;
                color: #1976d2;
                padding: 4px 10px;
                border-radius: 16px;
                font-size: 12px;
                font-weight: 500;
            }
            
            @media (prefers-color-scheme: dark) {
                .tag {
                    background: #1e3a5f;
                    color: #4fc3f7;
                }
            }
            
            .file-name {
                margin: 5px 0 0 0;
                color: var(--text-secondary);
                font-size: 14px;
            }
            
            .frontmatter {
                background: var(--bg-tertiary);
                border-left: 4px solid var(--accent-color);
                padding: 15px;
                margin: 20px 0;
                border-radius: 4px;
            }
            
            .frontmatter h3 {
                margin-top: 0;
                color: var(--accent-color);
            }
            
            .admonition {
                margin: 20px 0;
                border-radius: 6px;
                padding: 16px;
                border-left: 4px solid;
            }
            
            .admonition-note { 
                background: var(--bg-tertiary); 
                border-color: #0969da; 
                color: var(--text-primary);
            }
            .admonition-tip { 
                background: var(--bg-tertiary); 
                border-color: #52c41a; 
                color: var(--text-primary);
            }
            .admonition-info { 
                background: var(--bg-tertiary); 
                border-color: #1890ff; 
                color: var(--text-primary);
            }
            .admonition-caution { 
                background: var(--bg-tertiary); 
                border-color: #faad14; 
                color: var(--text-primary);
            }
            .admonition-danger { 
                background: var(--bg-tertiary); 
                border-color: #ff4d4f; 
                color: var(--text-primary);
            }
            .admonition-warning { 
                background: var(--bg-tertiary); 
                border-color: #faad14; 
                color: var(--text-primary);
            }
            
            .admonition-heading {
                display: flex;
                align-items: center;
                font-weight: bold;
                margin-bottom: 8px;
                color: var(--text-primary);
            }
            
            .admonition-icon {
                margin-right: 8px;
                font-size: 18px;
            }
            
            .admonition-content {
                color: var(--text-primary);
            }
            
            .tabs-container {
                border: 1px solid var(--border-color);
                border-radius: 6px;
                margin: 20px 0;
                background: var(--bg-primary);
            }
            
            .tab-item {
                border-bottom: 1px solid var(--border-color);
            }
            
            .tab-item:last-child {
                border-bottom: none;
            }
            
            .tab-label {
                background: var(--bg-tertiary);
                padding: 12px 16px;
                font-weight: bold;
                border-bottom: 1px solid var(--border-color);
                color: var(--text-primary);
            }
            
            .tab-content {
                padding: 16px;
                color: var(--text-primary);
            }
            
            .code-block {
                margin: 20px 0;
                border-radius: 6px;
                overflow: hidden;
                background: var(--bg-tertiary);
                border: 1px solid var(--border-color);
            }
            
            .code-title {
                background: var(--border-color);
                padding: 8px 16px;
                font-size: 14px;
                font-weight: 600;
                border-bottom: 1px solid var(--border-light);
                color: var(--text-primary);
            }
            
            .code-block pre {
                margin: 0;
                padding: 16px;
                background: var(--bg-tertiary);
                overflow-x: auto;
            }
            
            .code-block code {
                background: none;
                padding: 0;
                font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
                font-size: 14px;
                color: var(--text-primary);
            }
            
            .details-component {
                border: 1px solid var(--border-color);
                border-radius: 6px;
                margin: 20px 0;
                background: var(--bg-primary);
            }
            
            .details-component summary {
                padding: 12px 16px;
                background: var(--bg-tertiary);
                cursor: pointer;
                font-weight: 600;
                color: var(--text-primary);
            }
            
            .details-content {
                padding: 16px;
                color: var(--text-primary);
            }
            
            code {
                background: var(--code-bg);
                color: var(--code-text);
                padding: 2px 6px;
                border-radius: 3px;
                font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
                font-size: 0.9em;
            }
            
            h1, h2, h3, h4, h5, h6 {
                color: var(--accent-color);
                margin-top: 30px;
                margin-bottom: 16px;
            }
            
            h1 { font-size: 2em; }
            h2 { font-size: 1.5em; }
            h3 { font-size: 1.25em; }
            
            a {
                color: var(--accent-color);
                text-decoration: none;
            }
            
            a:hover {
                text-decoration: underline;
            }
            
            p {
                margin-bottom: 16px;
                color: var(--text-primary);
            }
            
            /* 基本的なMarkdown要素のスタイル */
            ul, ol {
                margin: 16px 0;
                padding-left: 32px;
                color: var(--text-primary);
            }
            
            li {
                margin-bottom: 8px;
                color: var(--text-primary);
            }
            
            ul li {
                list-style-type: disc;
            }
            
            ol li {
                list-style-type: decimal;
            }
            
            del {
                text-decoration: line-through;
                color: var(--text-muted);
            }
            
            pre {
                background-color: var(--bg-tertiary);
                border-radius: 6px;
                padding: 16px;
                overflow-x: auto;
                margin: 16px 0;
                border: 1px solid var(--border-color);
            }
            
            pre code {
                background: none;
                color: var(--text-primary);
                padding: 0;
            }
            
            blockquote {
                border-left: 4px solid var(--border-light);
                padding-left: 16px;
                margin: 16px 0;
                color: var(--text-muted);
                background: var(--bg-tertiary);
                padding: 16px;
                border-radius: 4px;
            }
            
            table {
                border-collapse: collapse;
                width: 100%;
                margin: 16px 0;
                background: var(--bg-primary);
            }
            
            th, td {
                border: 1px solid var(--border-color);
                padding: 8px 12px;
                text-align: left;
                color: var(--text-primary);
            }
            
            th {
                background-color: var(--bg-tertiary);
                font-weight: 600;
            }
            
            hr {
                border: none;
                border-top: 1px solid var(--border-color);
                margin: 24px 0;
            }
            
            input[type="checkbox"] {
                margin-right: 8px;
            }
            
            img {
                max-width: 100%;
                height: auto;
                border-radius: 4px;
                box-shadow: 0 2px 8px var(--shadow);
                display: block;
                margin: 16px 0;
            }

            /* Prism.js シンタックスハイライト (VS Code風) */
            .token.comment,
            .token.prolog,
            .token.doctype,
            .token.cdata {
                color: #6a9955;
            }

            .token.punctuation {
                color: var(--text-primary);
            }

            .token.property,
            .token.tag,
            .token.boolean,
            .token.number,
            .token.constant,
            .token.symbol,
            .token.deleted {
                color: #b5cea8;
            }

            .token.selector,
            .token.attr-name,
            .token.string,
            .token.char,
            .token.builtin,
            .token.inserted {
                color: #ce9178;
            }

            .token.operator,
            .token.entity,
            .token.url,
            .language-css .token.string,
            .style .token.string {
                color: #d4d4d4;
            }

            .token.atrule,
            .token.attr-value,
            .token.keyword {
                color: #569cd6;
            }

            .token.function,
            .token.class-name {
                color: #dcdcaa;
            }

            .token.regex,
            .token.important,
            .token.variable {
                color: #d16969;
            }

            @media (prefers-color-scheme: light) {
                .token.comment,
                .token.prolog,
                .token.doctype,
                .token.cdata {
                    color: #008000;
                }

                .token.property,
                .token.tag,
                .token.boolean,
                .token.number,
                .token.constant,
                .token.symbol,
                .token.deleted {
                    color: #0451a5;
                }

                .token.selector,
                .token.attr-name,
                .token.string,
                .token.char,
                .token.builtin,
                .token.inserted {
                    color: #a31515;
                }

                .token.atrule,
                .token.attr-value,
                .token.keyword {
                    color: #0000ff;
                }

                .token.function,
                .token.class-name {
                    color: #795e26;
                }
            }
        `;
    }
    
    private generatePreviewHeader(document: vscode.TextDocument, frontmatter: any, isBlogPost: boolean): string {
        const fileName = path.basename(document.fileName);
        const contentType = isBlogPost ? '📝 Blog' : '📚 Docs';
        
        if (isBlogPost) {
            // Blog用のヘッダー
            const title = frontmatter.title || fileName;
            const date = frontmatter.date ? new Date(frontmatter.date).toLocaleDateString('ja-JP') : '';
            const authors = Array.isArray(frontmatter.authors) ? frontmatter.authors.join(', ') : frontmatter.authors || '';
            const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [];
            const slug = frontmatter.slug || '';
            
            return `
                <div class="preview-header blog-header">
                    <div class="header-meta">
                        <span class="content-type">${contentType}</span>
                        ${slug ? `<span class="slug">/${slug}</span>` : ''}
                    </div>
                    <h1 class="blog-title">${this.escapeHtml(title)}</h1>
                    <div class="blog-meta">
                        ${date ? `<span class="date">📅 ${date}</span>` : ''}
                        ${authors ? `<span class="authors">✍️ ${this.escapeHtml(authors)}</span>` : ''}
                    </div>
                    ${tags.length > 0 ? `
                        <div class="tags">
                            ${tags.map((tag: string) => `<span class="tag">#${this.escapeHtml(tag)}</span>`).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        } else {
            // Docs用のヘッダー
            const title = frontmatter.title || fileName;
            const sidebar_position = frontmatter.sidebar_position;
            
            return `
                <div class="preview-header docs-header">
                    <div class="header-meta">
                        <span class="content-type">${contentType}</span>
                        ${sidebar_position ? `<span class="position">位置: ${sidebar_position}</span>` : ''}
                    </div>
                    <h1 class="docs-title">${this.escapeHtml(title)}</h1>
                    <p class="file-name">ファイル: ${fileName}</p>
                </div>
            `;
        }
    }

    public refresh() {
        // すべてのプレビューを更新
        vscode.workspace.textDocuments.forEach((doc: vscode.TextDocument) => {
            if (doc.languageId === 'markdown' || doc.languageId === 'mdx') {
                const uri = vscode.Uri.parse(`docusaurus-preview://preview?${doc.uri.toString()}`);
                this._onDidChange.fire(uri);
            }
        });
    }

    private processImages(content: string): string {
        // 現在のファイルパスを取得
        const activeEditor = vscode.window.activeTextEditor;
        const currentDocPath = activeEditor?.document.uri.fsPath;
        
        // HTML内の<img>タグを処理
        const imgRegex = /<img([^>]*?)src="([^"]*)"([^>]*?)>/g;
        
        return content.replace(imgRegex, (match, beforeSrc, src, afterSrc) => {
            // 絶対パスの場合はそのまま
            if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
                return match;
            }
            
            let resolvedPath = src;
            
            try {
                if (currentDocPath) {
                    const currentDir = path.dirname(currentDocPath);
                    
                    if (src.startsWith('./') || src.startsWith('../') || (!src.startsWith('/') && !src.startsWith('\\'))) {
                        // 相対パスの場合、現在のファイルディレクトリから解決
                        resolvedPath = path.resolve(currentDir, src);
                    } else if (src.startsWith('/')) {
                        // ルートからの絶対パスの場合、ワークスペースルートから解決
                        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                        if (workspaceRoot) {
                            resolvedPath = path.join(workspaceRoot, src.substring(1));
                        }
                    }
                    
                    // WebView用のvscode-resource URIに変換
                    const fileUri = vscode.Uri.file(resolvedPath);
                    const webviewUri = fileUri.with({ scheme: 'vscode-resource' });
                    resolvedPath = webviewUri.toString();
                }
            } catch (error) {
                console.error('Image path resolution error:', error);
                // エラーの場合はfile:// URIで試行
                try {
                    const fileUri = vscode.Uri.file(resolvedPath);
                    resolvedPath = fileUri.toString();
                } catch (fallbackError) {
                    console.error('Fallback image path resolution error:', fallbackError);
                }
            }
            
            return `<img${beforeSrc}src="${resolvedPath}"${afterSrc} style="max-width: 100%; height: auto; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); display: block; margin: 16px 0;">`;
        });
    }
}
