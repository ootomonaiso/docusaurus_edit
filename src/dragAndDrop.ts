import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { DocItem } from './treeView';

export class DocusaurusTreeDragAndDropController implements vscode.TreeDragAndDropController<DocItem> {
    dropMimeTypes = ['application/vnd.code.tree.docusaurusexplorer'];
    dragMimeTypes = ['text/uri-list'];

    public async handleDrag(source: DocItem[], treeDataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
        treeDataTransfer.set('application/vnd.code.tree.docusaurusexplorer', new vscode.DataTransferItem(source));
    }

    public async handleDrop(target: DocItem | undefined, sources: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
        const transferItem = sources.get('application/vnd.code.tree.docusaurusexplorer');
        if (!transferItem) {
            return;
        }

        const sourceItems: DocItem[] = transferItem.value;
        
        for (const sourceItem of sourceItems) {
            if (target && target.type === 'folder') {
                // Moving item into a folder
                await this.moveItemToFolder(sourceItem, target);
            } else if (target && target.type === 'file') {
                // Reordering - moving before/after target file
                await this.reorderItems(sourceItem, target);
            }
        }

        // Refresh the tree
        vscode.commands.executeCommand('docusaurus-editor.refreshExplorer');
    }

    private async moveItemToFolder(sourceItem: DocItem, targetFolder: DocItem): Promise<void> {
        const sourcePath = sourceItem.filePath;
        const targetDir = targetFolder.filePath;
        const fileName = path.basename(sourcePath);
        const newPath = path.join(targetDir, fileName);

        try {
            // Move the file/folder
            fs.renameSync(sourcePath, newPath);

            // Update positions in the new folder
            await this.updatePositionsInFolder(targetDir);

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to move item: ${error}`);
        }
    }

    private async reorderItems(sourceItem: DocItem, targetItem: DocItem): Promise<void> {
        const sourceDir = path.dirname(sourceItem.filePath);
        const targetDir = path.dirname(targetItem.filePath);

        // Only reorder within the same directory
        if (sourceDir !== targetDir) {
            return;
        }

        try {
            // Get all items in the directory
            const items = this.getItemsInDirectory(sourceDir);
            
            // Remove source item from its current position
            const sourceIndex = items.findIndex(item => item.filePath === sourceItem.filePath);
            if (sourceIndex === -1) {
                return;
            }
            
            const [movedItem] = items.splice(sourceIndex, 1);
            
            // Find target position
            const targetIndex = items.findIndex(item => item.filePath === targetItem.filePath);
            if (targetIndex === -1) {
                return;
            }
            
            // Insert at new position
            items.splice(targetIndex, 0, movedItem);
            
            // Update positions
            await this.updateItemPositions(items);

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to reorder items: ${error}`);
        }
    }

    private getItemsInDirectory(dirPath: string): DocItem[] {
        const items: DocItem[] = [];
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name === '_category_.json') {
                continue;
            }

            const fullPath = path.join(dirPath, entry.name);

            if (entry.isDirectory()) {
                const categoryPath = path.join(fullPath, '_category_.json');
                let position = 999;
                if (fs.existsSync(categoryPath)) {
                    try {
                        const content = fs.readFileSync(categoryPath, 'utf8');
                        const categoryInfo = JSON.parse(content);
                        position = categoryInfo.position || 999;
                    } catch (error) {
                        console.error('Error parsing _category_.json:', error);
                    }
                }

                items.push({
                    label: entry.name,
                    type: 'folder',
                    filePath: fullPath,
                    position
                });
            } else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
                try {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    const parsed = matter(content);
                    
                    items.push({
                        label: parsed.data.title || entry.name,
                        type: 'file',
                        filePath: fullPath,
                        position: parsed.data.sidebar_position || 999
                    });
                } catch (error) {
                    console.error('Error parsing markdown file:', error);
                }
            }
        }

        // Sort by current position
        items.sort((a, b) => (a.position || 999) - (b.position || 999));
        return items;
    }

    private async updateItemPositions(items: DocItem[]): Promise<void> {
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const newPosition = i + 1;

            if (item.type === 'file') {
                await this.updateMarkdownPosition(item.filePath, newPosition);
            } else if (item.type === 'folder') {
                await this.updateCategoryPosition(item.filePath, newPosition);
            }
        }
    }

    private async updatePositionsInFolder(folderPath: string): Promise<void> {
        const items = this.getItemsInDirectory(folderPath);
        await this.updateItemPositions(items);
    }

    private async updateMarkdownPosition(filePath: string, position: number): Promise<void> {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const parsed = matter(content);
            
            parsed.data.sidebar_position = position;
            
            const newContent = matter.stringify(parsed.content, parsed.data);
            fs.writeFileSync(filePath, newContent, 'utf8');
            
        } catch (error) {
            console.error(`Failed to update position for ${filePath}:`, error);
        }
    }

    private async updateCategoryPosition(folderPath: string, position: number): Promise<void> {
        const categoryPath = path.join(folderPath, '_category_.json');
        
        try {
            let categoryInfo: any = {};
            
            if (fs.existsSync(categoryPath)) {
                const content = fs.readFileSync(categoryPath, 'utf8');
                categoryInfo = JSON.parse(content);
            }
            
            categoryInfo.position = position;
            
            fs.writeFileSync(categoryPath, JSON.stringify(categoryInfo, null, 2), 'utf8');
            
        } catch (error) {
            console.error(`Failed to update category position for ${folderPath}:`, error);
        }
    }
}
