# Docusaurus Editor

生産性を向上させる機能を備えた、Docusaurus ドキュメント編集用の VS Code 拡張機能です。

## 機能

### 🌳 ツリービューエクスプローラー
- 専用のツリービューで Docusaurus ドキュメント構造を表示
- `sidebar_position` と `_category_.json` の位置でソートされたドキュメントを表示
- ドキュメント階層を素早くナビゲート

### 📝 ドキュメント管理
- 事前構築されたテンプレートで新しい Markdown ドキュメントを作成
- 適切な `sidebar_position` を持つ自動フロントマター生成
- 複数のドキュメントテンプレートをサポート（基本、チュートリアル、API リファレンス、ガイド）

### 🔄 ドラッグ＆ドロップ並び替え
- ドラッグ＆ドロップでドキュメントとフォルダーを並び替え
- `sidebar_position` と `_category_.json` の位置の自動更新
- ドラッグ操作中の視覚的フィードバック

### 🔗 Git 統合
- ワンクリックでのコミット・プッシュ操作
- GitHub リポジトリ用の自動プルリクエスト作成
- ツリービューでの Git ステータス表示

### 💡 Docusaurus Markdown 補完
- Docusaurus 特有の記法（Admonition、Tabs、CodeBlock など）の自動補完
- MDX コンポーネントのスニペット補完
- インポート文の自動補完

### 👁️ ライブプレビュー
- Docusaurus スタイルのリアルタイムプレビュー
- Admonition、Tabs、CodeBlock の正確な表示
- エディター変更時の自動更新

### 📁 カテゴリ管理
- 新しいカテゴリ（フォルダ）の作成
- `_category_.json` ファイルの自動生成
- カテゴリ設定の編集（表示名、位置、説明）
- カテゴリの削除
- カテゴリとフォルダの視覚的区別

## 要件

- VS Code 1.101.0 以上
- Docusaurus プロジェクト（`docusaurus.config.js/ts` または `@docusaurus/*` 依存関係で検出）
- Git リポジトリ（Git 統合機能を使用する場合）

## はじめに

1. VS Code で Docusaurus プロジェクトを開く
2. Docusaurus プロジェクトが検出されると、拡張機能が自動的にアクティブになります
3. エクスプローラーパネルの「Docusaurus Explorer」ビューを使用
4. フォルダーを右クリックして新しいドキュメントを作成
5. ドラッグ＆ドロップでアイテムを並び替え

## 機能の使用方法

### Markdown 補完機能
Markdown ファイルまたは MDX ファイルで以下の補完機能を利用できます：

1. **Admonition（警告ボックス）**: `:::` と入力すると自動補完メニューが表示
2. **Tabs**: `<Tabs>` または `<TabItem>` と入力すると補完
3. **Code Blocks**: ``````` と入力すると言語とタイトル付きコードブロックの補完
4. **Import 文**: `import ` と入力すると Docusaurus コンポーネントのインポート補完
5. **MDX Components**: `<` と入力すると MDX コンポーネントの補完

### プレビュー機能
1. Markdown/MDX ファイルを開く
2. エディターのタイトルバーのプレビューアイコンをクリック
3. または、右クリックメニューから「Docusaurus プレビューを表示」を選択
4. Docusaurus スタイルでレンダリングされたプレビューが隣に表示されます

### カテゴリ管理機能
1. **新しいカテゴリの作成**:
   - ツリービューのタイトルバーのフォルダアイコンをクリック
   - または、フォルダを右クリック → 「新しいカテゴリを作成」
   - カテゴリ名、表示名、位置を設定

2. **カテゴリ設定の編集**:
   - カテゴリフォルダ（ライブラリアイコン）を右クリック
   - 「カテゴリ設定を編集」を選択
   - 表示名、位置、説明を変更可能

3. **カテゴリの削除**:
   - カテゴリフォルダを右クリック → 「カテゴリを削除」
   - 確認ダイアログでフォルダとその中身を完全削除

## 拡張機能の設定

この拡張機能は以下の設定を提供します：

* `docusaurus-editor.enabled`: 拡張機能の有効/無効を切り替え（プロジェクト検出に基づいて自動設定）

拡張機能が `contributes.configuration` 拡張ポイントを通じて VS Code 設定を追加する場合に含めてください。

例：

この拡張機能は以下の設定を提供します：

* `myExtension.enable`: この拡張機能を有効/無効にします。
* `myExtension.thing`: 何かを実行するために `blah` に設定します。

## 既知の問題

既知の問題を明記することで、ユーザーが拡張機能に対して重複した問題を報告することを防げます。

## リリースノート

ユーザーは拡張機能を更新する際のリリースノートを重要視します。

---

## 拡張機能ガイドラインの遵守

拡張機能ガイドラインを読み、拡張機能作成のベストプラクティスに従うことを確認してください。

* [拡張機能ガイドライン](https://code.visualstudio.com/api/references/extension-guidelines)

## Markdown の使用

Visual Studio Code を使用して README を作成できます。以下は便利なエディターキーボードショートカットです：

* エディターを分割（macOS では `Cmd+\`、Windows と Linux では `Ctrl+\`）。
* プレビューの切り替え（macOS では `Shift+Cmd+V`、Windows と Linux では `Shift+Ctrl+V`）。
* `Ctrl+Space`（Windows、Linux、macOS）を押すと、Markdown スニペットの一覧が表示されます。

## 詳細情報

* [Visual Studio Code の Markdown サポート](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown 構文リファレンス](https://help.github.com/articles/markdown-basics/)

**お楽しみください！**
