import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Docusaurus特有のMarkdownプレビュー機能を提供する
 */
export class DocusaurusPreviewProvider implements vscode.TextDocumentContentProvider {
    private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    public readonly onDidChange = this._onDidChange.event;
    
    constructor(private context: vscode.ExtensionContext) {}
    
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
        const processedContent = this.processDocusaurusContent(content);
        
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
                    <div class="preview-header">
                        <h1>📚 Docusaurus Preview</h1>
                        <p>ファイル: ${path.basename(document.fileName)}</p>
                    </div>
                    <div class="preview-content">
                        ${processedContent}
                    </div>
                </div>
            </body>
            </html>
        `;
    }
    
    private processDocusaurusContent(content: string): string {
        let processedContent = content;
        
        // フロントマターの処理
        processedContent = this.processFrontmatter(processedContent);
        
        // Admonition（警告ボックス）の処理
        processedContent = this.processAdmonitions(processedContent);
        
        // タブの処理
        processedContent = this.processTabs(processedContent);
        
        // コードブロックの処理
        processedContent = this.processCodeBlocks(processedContent);
        
        // MDXコンポーネントの処理
        processedContent = this.processMDXComponents(processedContent);
        
        // Markdownの基本処理
        processedContent = this.processBasicMarkdown(processedContent);
        
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
        const admonitionRegex = /:::(note|tip|info|caution|danger|warning)(.*?)\n([\s\S]*?)\n:::/g;
        
        return content.replace(admonitionRegex, (match, type, title, body) => {
            const cleanTitle = title.trim();
            const displayTitle = cleanTitle || this.getAdmonitionTitle(type);
            const icon = this.getAdmonitionIcon(type);
            
            return `
                <div class="admonition admonition-${type}">
                    <div class="admonition-heading">
                        <span class="admonition-icon">${icon}</span>
                        <span class="admonition-title">${displayTitle}</span>
                    </div>
                    <div class="admonition-content">
                        ${this.processBasicMarkdown(body.trim())}
                    </div>
                </div>
            `;
        });
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
            
            return `
                <div class="code-block">
                    ${titleHtml}
                    <pre><code class="language-${language}">${this.escapeHtml(code)}</code></pre>
                </div>
            `;
        });
    }
    
    private processMDXComponents(content: string): string {
        // CodeBlockコンポーネントの処理
        const codeBlockRegex = /<CodeBlock[^>]*language="([^"]*)"[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/CodeBlock>/g;
        content = content.replace(codeBlockRegex, (match, language, title, code) => {
            return `
                <div class="code-block">
                    <div class="code-title">${title}</div>
                    <pre><code class="language-${language}">${this.escapeHtml(code.trim())}</code></pre>
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
        // 見出し
        content = content.replace(/^### (.*$)/gim, '<h3>$1</h3>');
        content = content.replace(/^## (.*$)/gim, '<h2>$1</h2>');
        content = content.replace(/^# (.*$)/gim, '<h1>$1</h1>');
        
        // 太字とイタリック
        content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        content = content.replace(/\*(.*?)\*/g, '<em>$1</em>');
        
        // インラインコード
        content = content.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // リンク
        content = content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
        
        // 段落
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
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    
    private getPreviewStyles(): string {
        return `
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 900px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f8f9fa;
            }
            
            .docusaurus-preview {
                background: white;
                border-radius: 8px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                padding: 30px;
            }
            
            .preview-header {
                border-bottom: 2px solid #e9ecef;
                padding-bottom: 20px;
                margin-bottom: 30px;
            }
            
            .preview-header h1 {
                margin: 0;
                color: #2e8555;
            }
            
            .preview-header p {
                margin: 5px 0 0 0;
                color: #666;
                font-size: 14px;
            }
            
            .frontmatter {
                background: #f1f3f4;
                border-left: 4px solid #2e8555;
                padding: 15px;
                margin: 20px 0;
                border-radius: 4px;
            }
            
            .frontmatter h3 {
                margin-top: 0;
                color: #2e8555;
            }
            
            .admonition {
                margin: 20px 0;
                border-radius: 6px;
                padding: 16px;
                border-left: 4px solid;
            }
            
            .admonition-note { background: #f6f8fa; border-color: #0969da; }
            .admonition-tip { background: #f6ffed; border-color: #52c41a; }
            .admonition-info { background: #e6f7ff; border-color: #1890ff; }
            .admonition-caution { background: #fffbe6; border-color: #faad14; }
            .admonition-danger { background: #fff2f0; border-color: #ff4d4f; }
            .admonition-warning { background: #fffbe6; border-color: #faad14; }
            
            .admonition-heading {
                display: flex;
                align-items: center;
                font-weight: bold;
                margin-bottom: 8px;
            }
            
            .admonition-icon {
                margin-right: 8px;
                font-size: 18px;
            }
            
            .tabs-container {
                border: 1px solid #e1e4e8;
                border-radius: 6px;
                margin: 20px 0;
            }
            
            .tab-item {
                border-bottom: 1px solid #e1e4e8;
            }
            
            .tab-item:last-child {
                border-bottom: none;
            }
            
            .tab-label {
                background: #f6f8fa;
                padding: 12px 16px;
                font-weight: bold;
                border-bottom: 1px solid #e1e4e8;
            }
            
            .tab-content {
                padding: 16px;
            }
            
            .code-block {
                margin: 20px 0;
                border-radius: 6px;
                overflow: hidden;
                background: #f6f8fa;
                border: 1px solid #e1e4e8;
            }
            
            .code-title {
                background: #e1e4e8;
                padding: 8px 16px;
                font-size: 14px;
                font-weight: 600;
                border-bottom: 1px solid #d0d7de;
            }
            
            .code-block pre {
                margin: 0;
                padding: 16px;
                background: #f6f8fa;
                overflow-x: auto;
            }
            
            .code-block code {
                background: none;
                padding: 0;
                font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
                font-size: 14px;
            }
            
            .details-component {
                border: 1px solid #e1e4e8;
                border-radius: 6px;
                margin: 20px 0;
            }
            
            .details-component summary {
                padding: 12px 16px;
                background: #f6f8fa;
                cursor: pointer;
                font-weight: 600;
            }
            
            .details-content {
                padding: 16px;
            }
            
            code {
                background: #f1f3f4;
                padding: 2px 6px;
                border-radius: 3px;
                font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
                font-size: 85%;
            }
            
            h1, h2, h3, h4, h5, h6 {
                color: #2e8555;
                margin-top: 30px;
                margin-bottom: 16px;
            }
            
            h1 { font-size: 2em; }
            h2 { font-size: 1.5em; }
            h3 { font-size: 1.25em; }
            
            a {
                color: #2e8555;
                text-decoration: none;
            }
            
            a:hover {
                text-decoration: underline;
            }
            
            p {
                margin-bottom: 16px;
            }
        `;
    }
    
    public refresh() {
        // すべてのプレビューを更新
        vscode.workspace.textDocuments.forEach((doc: vscode.TextDocument) => {
            if (doc.languageId === 'markdown') {
                const uri = vscode.Uri.parse(`docusaurus-preview://preview?${doc.uri.toString()}`);
                this._onDidChange.fire(uri);
            }
        });
    }
}
