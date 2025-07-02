import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';

export class NewFileHandler {
    constructor(private workspaceRoot: string, private contentType: 'docs' | 'blog' = 'docs') {}

    /**
     * コンテンツタイプを設定
     */
    setContentType(contentType: 'docs' | 'blog'): void {
        this.contentType = contentType;
    }

    async createNewDocument(targetFolder?: string): Promise<void> {
        try {
            // Get target folder
            const folderPath = targetFolder || await this.selectTargetFolder();
            if (!folderPath) {
                return;
            }

            // Get document details from user
            const docInfo = await this.getDocumentInfo(folderPath);
            if (!docInfo) {
                return;
            }

            // Create the file with appropriate naming
            let filePath: string;
            let frontmatter: any;
            
            if (this.contentType === 'blog') {
                // Blog posts use date-based naming
                const today = new Date();
                const dateString = today.toISOString().split('T')[0]; // YYYY-MM-DD
                filePath = path.join(folderPath, `${dateString}-${docInfo.filename}.md`);
                
                frontmatter = {
                    title: docInfo.title,
                    date: today.toISOString(),
                    authors: [docInfo.author || 'default'],
                    tags: docInfo.tags || ['general'],
                    description: docInfo.description || `${docInfo.title}について説明します。`
                };
            } else {
                // Docs use standard naming
                filePath = path.join(folderPath, `${docInfo.filename}.md`);
                frontmatter = {
                    id: docInfo.id,
                    title: docInfo.title,
                    sidebar_position: docInfo.position
                };
            }
            
            if (fs.existsSync(filePath)) {
                const overwrite = await vscode.window.showQuickPick(['Yes', 'No'], {
                    placeHolder: 'File already exists. Overwrite?'
                });
                if (overwrite !== 'Yes') {
                    return;
                }
            }

            // Create content with frontmatter
            const content = this.createTemplateContent(docInfo.title, docInfo.template);
            const fullContent = matter.stringify(content, frontmatter);

            // Write file
            fs.writeFileSync(filePath, fullContent, 'utf8');

            // Open in editor
            const document = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(document);

            const fileName = path.basename(filePath);
            vscode.window.showInformationMessage(`Created: ${fileName}`);

            // Refresh tree view
            vscode.commands.executeCommand('docusaurus-editor.refreshExplorer');

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create document: ${error}`);
        }
    }

    private async selectTargetFolder(): Promise<string | undefined> {
        const docsFolders = this.findDocsFolders();
        
        if (docsFolders.length === 0) {
            vscode.window.showErrorMessage('No docs folders found');
            return undefined;
        }

        if (docsFolders.length === 1) {
            return docsFolders[0];
        }

        const selected = await vscode.window.showQuickPick(
            docsFolders.map(folder => ({
                label: path.relative(this.workspaceRoot, folder),
                description: folder
            })),
            { placeHolder: 'Select target folder' }
        );

        return selected?.description;
    }

    private findDocsFolders(): string[] {
        const folders: string[] = [];
        
        // Look for docs folder
        const docsPath = path.join(this.workspaceRoot, 'docs');
        if (fs.existsSync(docsPath)) {
            folders.push(docsPath);
            
            // Also add subdirectories
            const subDirs = this.getSubDirectories(docsPath);
            folders.push(...subDirs);
        }

        return folders;
    }

    private getSubDirectories(dirPath: string): string[] {
        const subDirs: string[] = [];
        
        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                if (entry.isDirectory() && !entry.name.startsWith('.')) {
                    const fullPath = path.join(dirPath, entry.name);
                    subDirs.push(fullPath);
                    
                    // Recursively get subdirectories
                    const nestedDirs = this.getSubDirectories(fullPath);
                    subDirs.push(...nestedDirs);
                }
            }
        } catch (error) {
            console.error('Error reading directory:', error);
        }

        return subDirs;
    }

    private async getDocumentInfo(folderPath: string): Promise<{
        filename: string;
        id: string;
        title: string;
        position: number;
        template: string;
        author?: string;
        tags?: string[];
        description?: string;
    } | undefined> {
        // Get title
        const title = await vscode.window.showInputBox({
            prompt: `Enter ${this.contentType === 'blog' ? 'blog post' : 'document'} title`,
            placeHolder: this.contentType === 'blog' ? 'My New Blog Post' : 'My New Document'
        });

        if (!title) {
            return undefined;
        }

        // Generate filename and ID from title
        const filename = this.generateFilename(title);
        const id = this.generateId(title);

        // Get next position
        const position = this.getNextPosition(folderPath);

        // Select template
        const template = await this.selectTemplate();

        let author: string | undefined;
        let tags: string[] | undefined;
        let description: string | undefined;

        // Get blog-specific fields if creating a blog post
        if (this.contentType === 'blog') {
            // Get author
            author = await vscode.window.showInputBox({
                prompt: 'Enter author name',
                placeHolder: 'author-name'
            });

            // Get tags
            const tagsInput = await vscode.window.showInputBox({
                prompt: 'Enter tags (comma-separated)',
                placeHolder: 'tag1, tag2, tag3'
            });
            
            if (tagsInput) {
                tags = tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
            }

            // Get description
            description = await vscode.window.showInputBox({
                prompt: 'Enter description (optional)',
                placeHolder: 'Brief description of the blog post'
            });
        }

        return {
            filename,
            id,
            title,
            position,
            template,
            author,
            tags,
            description
        };
    }

    private generateFilename(title: string): string {
        return title
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .trim();
    }

    private generateId(title: string): string {
        return title
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .trim();
    }

    private getNextPosition(folderPath: string): number {
        let maxPosition = 0;

        try {
            const entries = fs.readdirSync(folderPath, { withFileTypes: true });

            for (const entry of entries) {
                if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
                    const filePath = path.join(folderPath, entry.name);
                    try {
                        const content = fs.readFileSync(filePath, 'utf8');
                        const parsed = matter(content);
                        const position = parsed.data.sidebar_position;
                        
                        if (typeof position === 'number' && position > maxPosition) {
                            maxPosition = position;
                        }
                    } catch (error) {
                        // Ignore parsing errors
                    }
                }
            }
        } catch (error) {
            console.error('Error reading folder:', error);
        }

        return maxPosition + 1;
    }

    private async selectTemplate(): Promise<string> {
        const templates = [
            { label: 'Basic Document', value: 'basic' },
            { label: 'Tutorial', value: 'tutorial' },
            { label: 'API Reference', value: 'api' },
            { label: 'Guide', value: 'guide' }
        ];

        const selected = await vscode.window.showQuickPick(templates, {
            placeHolder: 'Select document template'
        });

        return selected?.value || 'basic';
    }

    private createTemplateContent(title: string, template: string): string {
        switch (template) {
            case 'tutorial':
                return `# ${title}

## Prerequisites

Before starting this tutorial, make sure you have:

- [ ] Prerequisite 1
- [ ] Prerequisite 2

## Step 1: Getting Started

Describe the first step here.

## Step 2: Implementation

Describe the implementation details.

## Step 3: Testing

Explain how to test the implementation.

## Conclusion

Summarize what was accomplished in this tutorial.

## Next Steps

- Link to related tutorials
- Suggest further reading
`;

            case 'api':
                return `# ${title}

## Overview

Brief description of the API.

## Endpoints

### GET /endpoint

Description of the endpoint.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| param1    | string | Yes | Description |

**Response:**

\`\`\`json
{
  "example": "response"
}
\`\`\`

## Error Codes

| Code | Description |
|------|-------------|
| 400  | Bad Request |
| 404  | Not Found   |
`;

            case 'guide':
                return `# ${title}

## Introduction

Brief introduction to the topic.

## When to Use This Guide

Explain when this guide is applicable.

## Step-by-Step Instructions

### 1. Preparation

What needs to be prepared.

### 2. Implementation

How to implement the solution.

### 3. Verification

How to verify the implementation works.

## Troubleshooting

Common issues and solutions.

## Related Resources

- [Link 1](url)
- [Link 2](url)
`;

            default: // basic
                return `# ${title}

## Overview

Describe what this document covers.

## Content

Add your content here.

## Summary

Summarize the key points.
`;
        }
    }
}
