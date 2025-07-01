<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# Docusaurus Editor VSCode Extension

This is a VS Code extension project for editing Docusaurus documentation. Please use the get_vscode_api with a query as input to fetch the latest VS Code API references.

## Project Overview

This extension provides:
- TreeView display of Docusaurus documentation structure
- Drag and drop reordering with automatic position updates
- New document creation with templates
- Git integration for commit/push/PR operations
- Markdown editing with frontmatter support

## Key Technologies
- TypeScript
- VSCode Extension API (TreeView, TreeDataProvider, TreeDragAndDropController)
- gray-matter for frontmatter parsing
- simple-git for Git operations

## File Structure
- `src/extension.ts` - Main extension entry point
- `src/treeView.ts` - TreeView data provider and items
- `src/dragAndDrop.ts` - Drag and drop controller
- `src/gitHandler.ts` - Git operations handler
- `src/newFileHandler.ts` - New document creation with templates

## Docusaurus Integration
The extension works with:
- `sidebar_position` in markdown frontmatter
- `_category_.json` files for folder ordering
- Standard Docusaurus project structure with `docs/` folder
- Multiple documentation IDs support