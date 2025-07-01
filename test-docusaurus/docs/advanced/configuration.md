---
sidebar_position: 1
---

# 高度な設定

Docusaurusの高度な機能と設定について説明します。

## カスタムCSS

独自のスタイルを適用する方法：

```css
.hero__title {
  color: #ff6b6b;
  font-weight: bold;
}

.hero__subtitle {
  color: #4ecdc4;
}
```

## MDXの活用

Markdownに加えて、ReactコンポーネントをMDXで使用できます：

```jsx
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

<Tabs>
  <TabItem value="apple" label="Apple" default>
    これはAppleです。
  </TabItem>
  <TabItem value="orange" label="Orange">
    これはOrangeです。
  </TabItem>
</Tabs>
```

:::danger 重要
カスタムコンポーネントを使用する際は、セキュリティに注意してください。
:::

## 国際化（i18n）

多言語対応の設定方法：

```javascript
module.exports = {
  i18n: {
    defaultLocale: 'ja',
    locales: ['ja', 'en'],
  },
};
```

これで高度な機能を使用できるようになります。
