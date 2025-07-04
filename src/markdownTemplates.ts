import * as vscode from 'vscode';

/**
 * Markdownテンプレート挿入機能を提供する
 */
export class MarkdownTemplateProvider {
    
    /**
     * 見出しテンプレートを挿入
     */
    public async insertHeading() {
        const levels = [
            { label: '# 見出し1', value: '# ' },
            { label: '## 見出し2', value: '## ' },
            { label: '### 見出し3', value: '### ' },
            { label: '#### 見出し4', value: '#### ' },
            { label: '##### 見出し5', value: '##### ' },
            { label: '###### 見出し6', value: '###### ' }
        ];
        
        const selected = await vscode.window.showQuickPick(levels, {
            placeHolder: '見出しレベルを選択してください'
        });
        
        if (selected) {
            await this.insertTextAtCursor(`${selected.value}見出しテキスト`);
        }
    }
    
    /**
     * リストテンプレートを挿入
     */
    public async insertList() {
        const listTypes = [
            { label: '• 箇条書きリスト', value: 'unordered' },
            { label: '1. 番号付きリスト', value: 'ordered' },
            { label: '☑️ タスクリスト', value: 'task' }
        ];
        
        const selected = await vscode.window.showQuickPick(listTypes, {
            placeHolder: 'リストの種類を選択してください'
        });
        
        if (!selected) {
            return;
        }
        
        let template = '';
        switch (selected.value) {
            case 'unordered':
                template = '- 項目1\n- 項目2\n- 項目3';
                break;
            case 'ordered':
                template = '1. 項目1\n2. 項目2\n3. 項目3';
                break;
            case 'task':
                template = '- [ ] 未完了のタスク\n- [x] 完了したタスク\n- [ ] もう一つのタスク';
                break;
        }
        
        await this.insertTextAtCursor(template);
    }
    
    /**
     * コードブロックテンプレートを挿入
     */
    public async insertCodeBlock() {
        const languages = [
            { label: 'TypeScript', value: 'typescript' },
            { label: 'JavaScript', value: 'javascript' },
            { label: 'Python', value: 'python' },
            { label: 'Java', value: 'java' },
            { label: 'C#', value: 'csharp' },
            { label: 'HTML', value: 'html' },
            { label: 'CSS', value: 'css' },
            { label: 'JSON', value: 'json' },
            { label: 'YAML', value: 'yaml' },
            { label: 'Bash/Shell', value: 'bash' },
            { label: 'プレーンテキスト', value: 'text' }
        ];
        
        const selected = await vscode.window.showQuickPick(languages, {
            placeHolder: 'プログラミング言語を選択してください'
        });
        
        if (selected) {
            const title = await vscode.window.showInputBox({
                prompt: 'コードブロックのタイトル（オプション）',
                placeHolder: 'example.js'
            });
            
            const titlePart = title ? ` title="${title}"` : '';
            const template = `\`\`\`${selected.value}${titlePart}\n// コードをここに入力\nconsole.log("Hello, World!");\n\`\`\``;
            
            await this.insertTextAtCursor(template);
        }
    }
    
    /**
     * アドモニションテンプレートを挿入
     */
    public async insertAdmonition() {
        const admonitionTypes = [
            { label: '📝 note - メモ', value: 'note' },
            { label: '🔍 tip - ヒント', value: 'tip' },
            { label: '⚠️ warning - 警告', value: 'warning' },
            { label: '🚫 danger - 危険', value: 'danger' },
            { label: '📌 info - 情報', value: 'info' },
            { label: '✅ success - 成功', value: 'success' },
            { label: '🔧 caution - 注意', value: 'caution' }
        ];
        
        const selected = await vscode.window.showQuickPick(admonitionTypes, {
            placeHolder: '注釈の種類を選択してください'
        });
        
        if (!selected) {
            return;
        }
        
        const title = await vscode.window.showInputBox({
            prompt: 'タイトルを入力してください（オプション）',
            placeHolder: '例: 注意点'
        });
        
        let template = `:::${selected.value}`;
        if (title) {
            template += ` ${title}`;
        }
        template += `\n\nここに内容を入力します。\n\n:::`;
        
        await this.insertTextAtCursor(template);
    }
    
    /**
     * テーブルテンプレートを挿入
     */
    public async insertTable() {
        const tableTypes = [
            { label: '2列 × 3行の基本テーブル', rows: 3, cols: 2 },
            { label: '3列 × 4行のテーブル', rows: 4, cols: 3 },
            { label: '4列 × 3行のテーブル', rows: 3, cols: 4 },
            { label: 'カスタムサイズ', rows: 0, cols: 0 }
        ];
        
        const selected = await vscode.window.showQuickPick(tableTypes, {
            placeHolder: 'テーブルのサイズを選択してください'
        });
        
        if (!selected) {
            return;
        }
        
        let rows = selected.rows;
        let cols = selected.cols;
        
        if (rows === 0 && cols === 0) {
            const colsInput = await vscode.window.showInputBox({
                prompt: '列数を入力してください',
                value: '3',
                validateInput: (value) => {
                    const num = parseInt(value);
                    return (isNaN(num) || num < 1 || num > 10) ? '1から10の数値を入力してください' : null;
                }
            });
            
            const rowsInput = await vscode.window.showInputBox({
                prompt: '行数を入力してください（ヘッダー行を除く）',
                value: '3',
                validateInput: (value) => {
                    const num = parseInt(value);
                    return (isNaN(num) || num < 1 || num > 20) ? '1から20の数値を入力してください' : null;
                }
            });
            
            if (!colsInput || !rowsInput) {
                return;
            }
            
            cols = parseInt(colsInput);
            rows = parseInt(rowsInput);
        }
        
        // テーブルテンプレートを生成
        const headerCells = Array(cols).fill(0).map((_, i) => `ヘッダー${i + 1}`).join(' | ');
        const separatorCells = Array(cols).fill('---').join(' | ');
        const dataCells = Array(rows).fill(0).map((_, rowIndex) => 
            Array(cols).fill(0).map((_, colIndex) => `データ${rowIndex + 1}-${colIndex + 1}`).join(' | ')
        ).join('\n');
        
        const template = `| ${headerCells} |\n| ${separatorCells} |\n| ${dataCells} |`;
        
        await this.insertTextAtCursor(template);
    }
    
    /**
     * リンクテンプレートを挿入
     */
    public async insertLink() {
        const linkTypes = [
            { label: '🔗 外部リンク', value: 'external' },
            { label: '📄 内部リンク（相対パス）', value: 'internal' },
            { label: '🏷️ アンカーリンク', value: 'anchor' },
            { label: '✉️ メールリンク', value: 'email' }
        ];
        
        const selected = await vscode.window.showQuickPick(linkTypes, {
            placeHolder: 'リンクの種類を選択してください'
        });
        
        if (!selected) {
            return;
        }
        
        let template = '';
        
        switch (selected.value) {
            case 'external':
                const url = await vscode.window.showInputBox({
                    prompt: 'URLを入力してください',
                    placeHolder: 'https://example.com'
                });
                const text = await vscode.window.showInputBox({
                    prompt: 'リンクテキストを入力してください',
                    placeHolder: 'リンクテキスト'
                });
                if (url && text) {
                    template = `[${text}](${url})`;
                }
                break;
                
            case 'internal':
                const path = await vscode.window.showInputBox({
                    prompt: '相対パスを入力してください',
                    placeHolder: './other-document.md'
                });
                const linkText = await vscode.window.showInputBox({
                    prompt: 'リンクテキストを入力してください',
                    placeHolder: '関連ドキュメント'
                });
                if (path && linkText) {
                    template = `[${linkText}](${path})`;
                }
                break;
                
            case 'anchor':
                const anchor = await vscode.window.showInputBox({
                    prompt: 'アンカー名を入力してください（#は自動で付加されます）',
                    placeHolder: 'section-title'
                });
                const anchorText = await vscode.window.showInputBox({
                    prompt: 'リンクテキストを入力してください',
                    placeHolder: 'セクションへ移動'
                });
                if (anchor && anchorText) {
                    template = `[${anchorText}](#${anchor})`;
                }
                break;
                
            case 'email':
                const email = await vscode.window.showInputBox({
                    prompt: 'メールアドレスを入力してください',
                    placeHolder: 'contact@example.com'
                });
                const emailText = await vscode.window.showInputBox({
                    prompt: 'リンクテキストを入力してください',
                    placeHolder: 'お問い合わせ'
                });
                if (email && emailText) {
                    template = `[${emailText}](mailto:${email})`;
                }
                break;
        }
        
        if (template) {
            await this.insertTextAtCursor(template);
        }
    }
    
    /**
     * 画像テンプレートを挿入
     */
    public async insertImage() {
        const imagePath = await vscode.window.showInputBox({
            prompt: '画像のパスまたはURLを入力してください',
            placeHolder: './images/example.png または https://example.com/image.jpg'
        });
        
        if (!imagePath) {
            return;
        }
        
        const altText = await vscode.window.showInputBox({
            prompt: '画像の代替テキストを入力してください',
            placeHolder: '画像の説明'
        });
        
        const title = await vscode.window.showInputBox({
            prompt: '画像のタイトル（オプション）',
            placeHolder: 'ホバー時に表示されるテキスト'
        });
        
        let template = `![${altText || '画像'}](${imagePath}`;
        if (title) {
            template += ` "${title}"`;
        }
        template += ')';
        
        await this.insertTextAtCursor(template);
    }
    
    /**
     * タブテンプレートを挿入
     */
    public async insertTabs() {
        const template = `<Tabs>
<TabItem value="tab1" label="タブ1">
コンテンツ1
</TabItem>
<TabItem value="tab2" label="タブ2">
コンテンツ2
</TabItem>
</Tabs>`;
        await this.insertTextAtCursor(template);
    }
    
    /**
     * カーソル位置にテキストを挿入
     */
    private async insertTextAtCursor(text: string) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('アクティブなエディターがありません');
            return;
        }
        
        const selection = editor.selection;
        await editor.edit(editBuilder => {
            if (selection.isEmpty) {
                // カーソル位置に挿入
                editBuilder.insert(selection.active, text);
            } else {
                // 選択範囲を置換
                editBuilder.replace(selection, text);
            }
        });
        
        // 挿入後にカーソルを適切な位置に移動
        const newPosition = selection.active.translate(0, text.length);
        editor.selection = new vscode.Selection(newPosition, newPosition);
    }
}
