# 変更履歴

## v0.0.1 (2025-07-03)

### 新機能・改善
- chore: VS Code Marketplaceへの公開設定をコメントアウト
- Update CHANGELOG.md for v0.0.1
- feat: リリースノート自動生成機能を追加
- Update CHANGELOG.md for v0.0.1

### 新機能・改善
- feat: リリースノート自動生成機能を追加
- Update CHANGELOG.md for v0.0.1
- feat: CHANGELOG.mdの自動ビルドテストの説明を修正

### 新機能・改善
- feat: CHANGELOG.mdの自動ビルドテストの説明を修正
- feat: バージョン番号をv0.0.2に更新し、自動ビルドテストを追加
- Update CHANGELOG.md for v0.0.1

## v0.0.2 (2025-07-03)
自動ビルドテスト！

### 新機能・改善
- feat: リリースノート生成機能を追加
- feat: GitHubリリース作成のためのトークン設定を修正
- feat: GitHubリリース作成のための権限を追加

### 新機能・改善
- Docusaurusドキュメントのツリービュー表示機能
- ドラッグ&ドロップによるドキュメント順序の変更とsidebar_positionの自動更新
- Markdownフロントマターのサポート
- 画像フォルダ・画像ファイルの右クリック削除機能
- 外部アイコンテーマ対応

### バグ修正
- 仮想「Images」フォルダを廃止し、実体フォルダ名＋画像数で表示するよう修正
- CI/CDプロセスの安定化（npm install→npm ciの2段階インストール）
- GitHubリリース作成の権限エラー修正

### リファクタリング
- Webpackによるバンドル設定の最適化
- 不要ファイル除外設定の拡張
- GitHubワークフローの改善（テスト・リリースプロセス）