import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Docusaurusカテゴリ管理機能
 * より見やすく使いやすいUIを提供
 */
export class CategoryHandler {
    constructor(private docusaurusRoot: string) {}

    /**
     * 新しいカテゴリ（フォルダ）を作成（改善版UI）
     */
    async createNewCategory(parentFolderPath?: string): Promise<void> {
        try {
            // カテゴリ名の入力
            const categoryName = await vscode.window.showInputBox({
                prompt: '新しいカテゴリのフォルダ名を入力してください',
                placeHolder: 'カテゴリ名（例: getting-started, api-reference）',
                validateInput: (value) => {
                    if (!value?.trim()) {
                        return 'カテゴリ名は必須です';
                    }
                    if (!/^[a-zA-Z0-9\-_]+$/.test(value)) {
                        return 'カテゴリ名は英数字、ハイフン、アンダースコアのみ使用可能です';
                    }
                    return null;
                }
            });

            if (!categoryName) {
                return;
            }

            // 親フォルダーを決定
            const docsPath = parentFolderPath || path.join(this.docusaurusRoot, 'docs');
            const newCategoryPath = path.join(docsPath, categoryName);

            // フォルダーが既に存在するかチェック
            if (fs.existsSync(newCategoryPath)) {
                vscode.window.showErrorMessage(`フォルダー "${categoryName}" は既に存在します`);
                return;
            }

            // フォルダーを作成
            fs.mkdirSync(newCategoryPath, { recursive: true });

            // WebViewパネルを作成して詳細設定画面を表示
            const panel = vscode.window.createWebviewPanel(
                'categoryCreator',
                `🆕 新しいカテゴリ: ${categoryName}`,
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: []
                }
            );

            // 初期設定
            const initialConfig = {
                label: this.formatDisplayName(categoryName),
                position: await this.getNextPosition(docsPath),
                description: `${this.formatDisplayName(categoryName)}に関するドキュメント`
            };

            // Webviewの内容を設定
            panel.webview.html = this.getCategoryCreatorHtml(initialConfig, categoryName);

            // Webviewからのメッセージを処理
            panel.webview.onDidReceiveMessage(
                async (message) => {
                    switch (message.command) {
                        case 'save':
                            try {
                                const configPath = path.join(newCategoryPath, '_category_.json');
                                await this.saveCategoryConfig(configPath, message.data);
                                panel.dispose();
                                vscode.window.showInformationMessage(`✅ カテゴリ "${message.data.label}" を作成しました`);
                                // TreeViewを更新
                                vscode.commands.executeCommand('docusaurus-editor.refreshExplorer');
                            } catch (error) {
                                vscode.window.showErrorMessage(`保存エラー: ${error}`);
                            }
                            break;
                        case 'cancel':
                            // フォルダーを削除（空の場合のみ）
                            try {
                                if (fs.readdirSync(newCategoryPath).length === 0) {
                                    fs.rmdirSync(newCategoryPath);
                                }
                            } catch (error) {
                                // エラーは無視
                            }
                            panel.dispose();
                            break;
                    }
                }
            );
        } catch (error) {
            vscode.window.showErrorMessage(`カテゴリの作成中にエラーが発生しました: ${error}`);
        }
    }

    /**
     * 既存カテゴリの設定を編集（改善版UI）
     */
    async editCategorySettings(categoryFolderPath: string): Promise<void> {
        try {
            const categoryConfigPath = path.join(categoryFolderPath, '_category_.json');
            let categoryConfig: any = {};

            // 既存の設定を読み込み
            if (fs.existsSync(categoryConfigPath)) {
                const configContent = fs.readFileSync(categoryConfigPath, 'utf8');
                try {
                    categoryConfig = JSON.parse(configContent);
                } catch (parseError) {
                    vscode.window.showWarningMessage('既存の設定ファイルの形式が正しくありません。新しい設定で上書きします。');
                }
            }

            const categoryName = path.basename(categoryFolderPath);

            // WebViewパネルを作成して編集画面を表示
            const panel = vscode.window.createWebviewPanel(
                'categoryEditor',
                `✏️ カテゴリ編集: ${categoryConfig.label || categoryName}`,
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: []
                }
            );

            // Webviewの内容を設定
            panel.webview.html = this.getCategoryEditorHtml(categoryConfig, categoryName);

            // Webviewからのメッセージを処理
            panel.webview.onDidReceiveMessage(
                async (message) => {
                    switch (message.command) {
                        case 'save':
                            try {
                                await this.saveCategoryConfig(categoryConfigPath, message.data);
                                panel.dispose();
                                vscode.window.showInformationMessage('✅ カテゴリ設定を保存しました');
                                // TreeViewを更新
                                vscode.commands.executeCommand('docusaurus-editor.refreshExplorer');
                            } catch (error) {
                                vscode.window.showErrorMessage(`保存エラー: ${error}`);
                            }
                            break;
                        case 'cancel':
                            panel.dispose();
                            break;
                    }
                }
            );
        } catch (error) {
            vscode.window.showErrorMessage(`カテゴリ設定の編集中にエラーが発生しました: ${error}`);
        }
    }

    /**
     * カテゴリを削除
     */
    async deleteCategory(categoryFolderPath: string): Promise<void> {
        try {
            const categoryName = path.basename(categoryFolderPath);

            // 確認ダイアログ
            const confirmation = await vscode.window.showWarningMessage(
                `⚠️ カテゴリ "${categoryName}" を削除しますか？この操作は元に戻せません。`,
                { modal: true },
                '🗑️ はい、削除する'
            );

            if (confirmation !== '🗑️ はい、削除する') {
                return;
            }

            // フォルダー内のファイルを確認
            const files = fs.readdirSync(categoryFolderPath);
            const hasDocuments = files.some(file => file.endsWith('.md') || file.endsWith('.mdx'));

            if (hasDocuments) {
                const forceDelete = await vscode.window.showWarningMessage(
                    `⚠️ カテゴリ "${categoryName}" にはドキュメントファイルが含まれています。それでも削除しますか？`,
                    { modal: true },
                    '🗑️ すべて削除する',
                    '❌ キャンセル'
                );

                if (forceDelete !== '🗑️ すべて削除する') {
                    return;
                }
            }

            // フォルダーを削除
            this.deleteFolderRecursive(categoryFolderPath);
            vscode.window.showInformationMessage(`✅ カテゴリ "${categoryName}" を削除しました`);

            // エクスプローラーを更新
            vscode.commands.executeCommand('docusaurus-editor.refreshExplorer');
        } catch (error) {
            vscode.window.showErrorMessage(`❌ カテゴリの削除に失敗しました: ${error}`);
        }
    }

    /**
     * 次の表示位置を取得
     */
    private async getNextPosition(docsPath: string): Promise<number> {
        try {
            const items = fs.readdirSync(docsPath);
            let maxPosition = 0;

            for (const item of items) {
                const itemPath = path.join(docsPath, item);
                if (fs.lstatSync(itemPath).isDirectory()) {
                    const configPath = path.join(itemPath, '_category_.json');
                    if (fs.existsSync(configPath)) {
                        try {
                            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                            if (config.position && config.position > maxPosition) {
                                maxPosition = config.position;
                            }
                        } catch (error) {
                            // 設定ファイルの読み込みエラーは無視
                        }
                    }
                }
            }

            return maxPosition + 1;
        } catch (error) {
            return 1;
        }
    }

    /**
     * カテゴリ作成用のWebView HTMLを生成
     */
    private getCategoryCreatorHtml(config: any, categoryName: string): string {
        return this.getCategoryEditorHtml(config, categoryName, true);
    }

    /**
     * カテゴリ編集用のWebView HTMLを生成
     */
    private getCategoryEditorHtml(categoryConfig: any, categoryName: string, isCreating: boolean = false): string {
        const currentLabel = categoryConfig.label || this.formatDisplayName(categoryName);
        const currentPosition = categoryConfig.position || 1;
        const currentDescription = categoryConfig.link?.description || categoryConfig.description || `${currentLabel}に関するドキュメント`;

        const title = isCreating ? '🆕 新しいカテゴリを作成' : '✏️ カテゴリ設定編集';
        const saveButtonText = isCreating ? '🆕 作成' : '💾 保存';

        return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>カテゴリ${isCreating ? '作成' : '編集'}</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            padding: 0;
            margin: 0;
            line-height: 1.5;
        }

        .container {
            max-width: 700px;
            margin: 0 auto;
            padding: 30px 20px;
        }

        .header {
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid var(--vscode-textLink-foreground);
            text-align: center;
        }

        .header h1 {
            margin: 0 0 10px 0;
            color: var(--vscode-textLink-foreground);
            font-size: 28px;
            font-weight: 600;
        }

        .header .subtitle {
            color: var(--vscode-descriptionForeground);
            font-size: 16px;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 6px 12px;
            border-radius: 20px;
            display: inline-block;
        }

        .form-section {
            background-color: var(--vscode-sideBar-background);
            border-radius: 8px;
            padding: 24px;
            margin-bottom: 24px;
        }

        .form-group {
            margin-bottom: 24px;
        }

        .form-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: var(--vscode-foreground);
            font-size: 14px;
        }

        .form-group input,
        .form-group textarea {
            width: 100%;
            padding: 12px 16px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 6px;
            font-family: inherit;
            font-size: 14px;
            box-sizing: border-box;
            transition: border-color 0.2s ease;
        }

        .form-group input:focus,
        .form-group textarea:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 2px var(--vscode-focusBorder);
        }

        .form-group textarea {
            resize: vertical;
            min-height: 100px;
            font-family: inherit;
        }

        .form-group .help-text {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-top: 6px;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .help-text::before {
            content: "💡";
            font-size: 14px;
        }

        .position-input {
            width: 120px;
        }

        .preview-section {
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-textLink-foreground);
            border-radius: 8px;
            padding: 24px;
            margin-bottom: 24px;
        }

        .preview-section h3 {
            margin-top: 0;
            color: var(--vscode-textLink-foreground);
            font-size: 18px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .preview-content {
            font-family: var(--vscode-editor-font-family);
            font-size: 14px;
            padding: 16px;
            background-color: var(--vscode-editor-background);
            border-radius: 6px;
            margin: 16px 0;
        }

        .preview-item {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 8px;
        }

        .preview-label {
            font-weight: 600;
            color: var(--vscode-textLink-foreground);
        }

        .preview-position {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
        }

        .json-preview {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 16px;
            border-radius: 6px;
            font-family: var(--vscode-editor-font-family);
            font-size: 13px;
            overflow-x: auto;
            margin-top: 12px;
            border: 1px solid var(--vscode-panel-border);
        }

        .button-group {
            display: flex;
            gap: 12px;
            justify-content: center;
            margin-top: 30px;
            padding-top: 24px;
            border-top: 1px solid var(--vscode-panel-border);
        }

        .btn {
            padding: 12px 24px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-family: inherit;
            font-size: 14px;
            font-weight: 600;
            transition: all 0.2s ease;
            min-width: 120px;
        }

        .btn-primary {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .btn-primary:hover {
            background-color: var(--vscode-button-hoverBackground);
            transform: translateY(-1px);
        }

        .btn-secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .btn-secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
            transform: translateY(-1px);
        }

        details {
            margin-top: 16px;
        }

        summary {
            cursor: pointer;
            padding: 8px 0;
            font-weight: 600;
            color: var(--vscode-textLink-foreground);
            user-select: none;
        }

        summary:hover {
            color: var(--vscode-textLink-activeForeground);
        }

        .required {
            color: var(--vscode-errorForeground);
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .container {
            animation: fadeIn 0.3s ease-out;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${title}</h1>
            <div class="subtitle">📁 ${categoryName}</div>
        </div>

        <form id="categoryForm">
            <div class="form-section">
                <div class="form-group">
                    <label for="label">表示名 <span class="required">*</span></label>
                    <input type="text" id="label" name="label" value="${currentLabel}" required>
                    <div class="help-text">サイドバーに表示されるカテゴリ名です</div>
                </div>

                <div class="form-group">
                    <label for="position">表示順序</label>
                    <input type="number" id="position" name="position" value="${currentPosition}" class="position-input" min="1">
                    <div class="help-text">小さい数字ほど上に表示されます</div>
                </div>

                <div class="form-group">
                    <label for="description">説明</label>
                    <textarea id="description" name="description" placeholder="カテゴリの説明を入力してください...">${currentDescription}</textarea>
                    <div class="help-text">カテゴリのインデックスページに表示される説明文です</div>
                </div>
            </div>

            <div class="preview-section">
                <h3>👀 プレビュー</h3>
                <div class="preview-content">
                    <div class="preview-item">
                        <span class="preview-label" id="previewLabel">${currentLabel}</span>
                        <span class="preview-position">位置: <span id="previewPosition">${currentPosition}</span></span>
                    </div>
                    <div id="previewDescription">${currentDescription}</div>
                </div>

                <details>
                    <summary>📄 _category_.json プレビュー</summary>
                    <pre class="json-preview" id="jsonPreview"></pre>
                </details>
            </div>

            <div class="button-group">
                <button type="submit" class="btn btn-primary">${saveButtonText}</button>
                <button type="button" class="btn btn-secondary" onclick="cancel()">❌ キャンセル</button>
            </div>
        </form>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        // リアルタイムプレビュー更新
        function updatePreview() {
            const label = document.getElementById('label').value || '${categoryName}';
            const position = document.getElementById('position').value || '1';
            const description = document.getElementById('description').value || '';

            document.getElementById('previewLabel').textContent = label;
            document.getElementById('previewPosition').textContent = position;
            document.getElementById('previewDescription').textContent = description;

            // JSON プレビュー更新
            const jsonConfig = {
                label: label,
                position: parseInt(position) || 1,
                link: {
                    type: 'generated-index',
                    description: description
                }
            };

            document.getElementById('jsonPreview').textContent = JSON.stringify(jsonConfig, null, 2);
        }

        // 入力フィールドのイベントリスナー
        document.getElementById('label').addEventListener('input', updatePreview);
        document.getElementById('position').addEventListener('input', updatePreview);
        document.getElementById('description').addEventListener('input', updatePreview);

        // 初期プレビュー更新
        updatePreview();

        // フォーム送信
        document.getElementById('categoryForm').addEventListener('submit', (e) => {
            e.preventDefault();

            const formData = new FormData(e.target);
            const data = {
                label: formData.get('label'),
                position: parseInt(formData.get('position')) || 1,
                description: formData.get('description') || ''
            };

            vscode.postMessage({
                command: 'save',
                data: data
            });
        });

        // キャンセル
        function cancel() {
            vscode.postMessage({ command: 'cancel' });
        }

        // エンターキーでフォーム送信を防ぐ（テキストエリア以外）
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
            }
        });
    </script>
</body>
</html>`;
    }

    /**
     * カテゴリ設定を保存
     */
    private async saveCategoryConfig(configPath: string, data: any): Promise<void> {
        const config = {
            label: data.label,
            position: data.position,
            link: {
                type: 'generated-index',
                description: data.description
            }
        };

        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    }

    /**
     * 表示名をフォーマット（ハイフンをスペースに変換し、単語の最初を大文字に）
     */
    private formatDisplayName(name: string): string {
        return name
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    /**
     * フォルダーを再帰的に削除
     */
    private deleteFolderRecursive(folderPath: string): void {
        if (fs.existsSync(folderPath)) {
            fs.readdirSync(folderPath).forEach(file => {
                const curPath = path.join(folderPath, file);
                if (fs.lstatSync(curPath).isDirectory()) {
                    this.deleteFolderRecursive(curPath);
                } else {
                    fs.unlinkSync(curPath);
                }
            });
            fs.rmdirSync(folderPath);
        }
    }
}