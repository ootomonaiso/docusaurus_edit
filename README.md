# Docusaurus Editor

A VS Code extension for editing Docusaurus documentation with enhanced productivity features.

## Features

### 🌳 Tree View Explorer
- Display Docusaurus documentation structure in a dedicated tree view
- Show documents sorted by `sidebar_position` and `_category_.json` position
- Navigate quickly through your documentation hierarchy

### 📝 Document Management
- Create new markdown documents with pre-built templates
- Automatic frontmatter generation with proper `sidebar_position`
- Support for multiple document templates (Basic, Tutorial, API Reference, Guide)

### 🔄 Drag & Drop Reordering
- Reorder documents and folders by dragging and dropping
- Automatic `sidebar_position` and `_category_.json` position updates
- Visual feedback during drag operations

### 🔗 Git Integration
- One-click commit and push operations
- Automatic pull request creation for GitHub repositories
- Git status display in the tree view

## Requirements

- VS Code 1.101.0 or higher
- A Docusaurus project (detected by `docusaurus.config.js/ts` or `@docusaurus/*` dependencies)
- Git repository (for Git integration features)

## Getting Started

1. Open your Docusaurus project in VS Code
2. The extension will automatically activate when a Docusaurus project is detected
3. Use the "Docusaurus Explorer" view in the Explorer panel
4. Right-click on folders to create new documents
5. Drag and drop to reorder items

## Extension Settings

This extension contributes the following settings:

* `docusaurus-editor.enabled`: Enable/disable the extension (automatically set based on project detection)

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

For example:

This extension contributes the following settings:

* `myExtension.enable`: Enable/disable this extension.
* `myExtension.thing`: Set to `blah` to do something.

## Known Issues

Calling out known issues can help limit users opening duplicate issues against your extension.

## Release Notes

Users appreciate release notes as you update your extension.

### 1.0.0

Initial release of ...

### 1.0.1

Fixed issue #.

### 1.1.0

Added features X, Y, and Z.

---

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
