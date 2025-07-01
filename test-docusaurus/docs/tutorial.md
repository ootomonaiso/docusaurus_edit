---
sidebar_position: 2
---

# チュートリアル

このチュートリアルでは、Docusaurusの基本的な使い方を学びます。

## ステップ1: インストール

```bash
npm install --global @docusaurus/init@latest
```

## ステップ2: プロジェクト作成

```bash
npx @docusaurus/init@latest init my-website classic
```

## ステップ3: 開発サーバー起動

```bash
cd my-website
npm start
```

:::warning 注意
開発サーバーはポート3000で起動します。
:::

## カスタマイズ

### テーマの変更

`docusaurus.config.js`ファイルでテーマをカスタマイズできます：

```javascript
module.exports = {
  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
    },
  },
};
```

### プラグインの追加

便利なプラグインを追加して機能を拡張できます。

:::info
プラグインの詳細は公式ドキュメントを参照してください。
:::

これでDocusaurusの基本的な使い方を覚えました！
