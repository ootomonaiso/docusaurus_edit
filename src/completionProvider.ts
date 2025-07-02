import * as vscode from 'vscode';

/**
 * Docusaurus特有のMarkdown補完機能を提供する
 */
export class DocusaurusCompletionProvider implements vscode.CompletionItemProvider {
    
    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
        
        const linePrefix = document.lineAt(position).text.substr(0, position.character);
        
        // Admonition（警告ボックス）の補完
        if (linePrefix.endsWith(':::')) {
            return this.getAdmonitionCompletions();
        }
        
        // Tabs（タブ）の補完
        if (linePrefix.includes('<Tabs>') || linePrefix.includes('<TabItem>')) {
            return this.getTabCompletions();
        }
        
        // Code blocks（コードブロック）の補完
        if (linePrefix.endsWith('```')) {
            return this.getCodeBlockCompletions();
        }
        
        // Import statements（インポート文）の補完
        if (linePrefix.startsWith('import ')) {
            return this.getImportCompletions();
        }
        
        // MDX Components（MDXコンポーネント）の補完
        if (linePrefix.endsWith('<')) {
            return this.getMDXComponentCompletions();
        }
        
        return [];
    }
    
    private getAdmonitionCompletions(): vscode.CompletionItem[] {
        const admonitionTypes = [
            { label: 'note', description: '情報メモ' },
            { label: 'tip', description: 'ヒント' },
            { label: 'info', description: '情報' },
            { label: 'caution', description: '注意' },
            { label: 'danger', description: '危険' },
            { label: 'warning', description: '警告' }
        ];
        
        return admonitionTypes.map(type => {
            const item = new vscode.CompletionItem(type.label, vscode.CompletionItemKind.Snippet);
            item.insertText = new vscode.SnippetString(`${type.label} ${type.description}\n\n$1\n\n:::`);
            item.documentation = new vscode.MarkdownString(`Docusaurus ${type.description}ボックス`);
            item.detail = `Docusaurus Admonition - ${type.description}`;
            return item;
        });
    }
    
    private getTabCompletions(): vscode.CompletionItem[] {
        const completions: vscode.CompletionItem[] = [];
        
        // Tabs container
        const tabsItem = new vscode.CompletionItem('Tabs', vscode.CompletionItemKind.Snippet);
        tabsItem.insertText = new vscode.SnippetString(`<Tabs>\n  <TabItem value="$1" label="$2">\n    $3\n  </TabItem>\n  <TabItem value="$4" label="$5">\n    $6\n  </TabItem>\n</Tabs>`);
        tabsItem.documentation = new vscode.MarkdownString('Docusaurus タブコンテナ');
        completions.push(tabsItem);
        
        // TabItem
        const tabItemItem = new vscode.CompletionItem('TabItem', vscode.CompletionItemKind.Snippet);
        tabItemItem.insertText = new vscode.SnippetString(`<TabItem value="$1" label="$2">\n  $3\n</TabItem>`);
        tabItemItem.documentation = new vscode.MarkdownString('Docusaurus タブアイテム');
        completions.push(tabItemItem);
        
        return completions;
    }
    
    private getCodeBlockCompletions(): vscode.CompletionItem[] {
        const languages = [
            { label: 'javascript', description: 'JavaScript' },
            { label: 'typescript', description: 'TypeScript' },
            { label: 'jsx', description: 'JSX' },
            { label: 'tsx', description: 'TSX' },
            { label: 'bash', description: 'Bash' },
            { label: 'json', description: 'JSON' },
            { label: 'yaml', description: 'YAML' },
            { label: 'markdown', description: 'Markdown' },
            { label: 'css', description: 'CSS' },
            { label: 'html', description: 'HTML' }
        ];
        
        return languages.map(lang => {
            const item = new vscode.CompletionItem(`${lang.label} title`, vscode.CompletionItemKind.Snippet);
            item.insertText = new vscode.SnippetString(`${lang.label} title="$1"\n$2\n\`\`\``);
            item.documentation = new vscode.MarkdownString(`${lang.description} コードブロック（タイトル付き）`);
            item.detail = `Docusaurus Code Block - ${lang.description}`;
            return item;
        });
    }
    
    private getImportCompletions(): vscode.CompletionItem[] {
        const imports = [
            {
                label: 'Tabs',
                insertText: 'import Tabs from \'@theme/Tabs\';\nimport TabItem from \'@theme/TabItem\';',
                description: 'タブコンポーネントのインポート'
            },
            {
                label: 'CodeBlock',
                insertText: 'import CodeBlock from \'@theme/CodeBlock\';',
                description: 'コードブロックコンポーネントのインポート'
            },
            {
                label: 'Admonition',
                insertText: 'import Admonition from \'@theme/Admonition\';',
                description: '警告ボックスコンポーネントのインポート'
            },
            {
                label: 'Details',
                insertText: 'import Details from \'@theme/Details\';',
                description: '詳細表示コンポーネントのインポート'
            }
        ];
        
        return imports.map(imp => {
            const item = new vscode.CompletionItem(imp.label, vscode.CompletionItemKind.Module);
            item.insertText = new vscode.SnippetString(imp.insertText);
            item.documentation = new vscode.MarkdownString(imp.description);
            item.detail = `Docusaurus Import - ${imp.description}`;
            return item;
        });
    }
    
    private getMDXComponentCompletions(): vscode.CompletionItem[] {
        const components = [
            {
                label: 'Tabs',
                insertText: 'Tabs>\n  <TabItem value="$1" label="$2">\n    $3\n  </TabItem>\n</Tabs>',
                description: 'タブコンポーネント'
            },
            {
                label: 'TabItem',
                insertText: 'TabItem value="$1" label="$2">\n  $3\n</TabItem>',
                description: 'タブアイテム'
            },
            {
                label: 'CodeBlock',
                insertText: 'CodeBlock language="$1" title="$2">\n$3\n</CodeBlock>',
                description: 'コードブロック'
            },
            {
                label: 'Admonition',
                insertText: 'Admonition type="$1" title="$2">\n  $3\n</Admonition>',
                description: '警告ボックス'
            },
            {
                label: 'Details',
                insertText: 'Details summary="$1">\n  $2\n</Details>',
                description: '詳細表示'
            }
        ];
        
        return components.map(comp => {
            const item = new vscode.CompletionItem(comp.label, vscode.CompletionItemKind.Class);
            item.insertText = new vscode.SnippetString(comp.insertText);
            item.documentation = new vscode.MarkdownString(`Docusaurus ${comp.description}`);
            item.detail = `Docusaurus Component - ${comp.description}`;
            return item;
        });
    }
}
