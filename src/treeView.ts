import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import matter from 'gray-matter';

export interface DocItem {
    label: string;
    type: 'file' | 'folder';
    filePath: string;
    position?: number;
    id?: string;
    title?: string;
    children?: DocItem[];
}

export class DocusaurusTreeItem extends vscode.TreeItem {
    constructor(
        public readonly docItem: DocItem,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(docItem.label, collapsibleState);
        
        this.tooltip = docItem.title || docItem.label;
        this.description = docItem.position ? `pos: ${docItem.position}` : '';
        
        if (docItem.type === 'file') {
            this.command = {
                command: 'vscode.open',
                title: 'Open',
                arguments: [vscode.Uri.file(docItem.filePath)]
            };
            this.contextValue = 'docFile';
            this.iconPath = new vscode.ThemeIcon('markdown');
        } else {
            this.contextValue = 'docFolder';
            this.iconPath = new vscode.ThemeIcon('folder');
        }
    }
}

export class DocusaurusTreeDataProvider implements vscode.TreeDataProvider<DocItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<DocItem | undefined | null | void> = new vscode.EventEmitter<DocItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<DocItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private docsPaths: string[] = [];

    constructor(private workspaceRoot: string) {
        console.log('🌳 DocusaurusTreeDataProvider constructor called with:', workspaceRoot);
        this.refresh();
    }

    refresh(): void {
        console.log('🔄 Refreshing tree data provider');
        this.loadDocusaurusConfig();
        this._onDidChangeTreeData.fire();
        console.log('🔄 Tree data refreshed, docsPaths:', this.docsPaths);
    }

    getTreeItem(element: DocItem): vscode.TreeItem {
        console.log('📋 getTreeItem called for:', element.label);
        return new DocusaurusTreeItem(element, 
            element.type === 'folder' ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
    }

    getChildren(element?: DocItem): Thenable<DocItem[]> {
        console.log('👥 getChildren called for element:', element?.label || 'root');
        
        if (!this.workspaceRoot) {
            console.log('❌ No workspace found');
            vscode.window.showInformationMessage('No workspace found');
            return Promise.resolve([]);
        }

        if (element) {
            // Return children of the selected folder
            console.log('📁 Getting children for folder:', element.filePath);
            return Promise.resolve(this.getDocItemsFromPath(element.filePath));
        } else {
            // Return root level items (docs folders)
            console.log('🏠 Getting root items');
            const rootItems = this.getRootItems();
            console.log('🏠 Root items found:', rootItems.length);
            return Promise.resolve(rootItems);
        }
    }

    private loadDocusaurusConfig(): void {
        console.log('⚙️ Loading Docusaurus config from:', this.workspaceRoot);
        const configPaths = [
            path.join(this.workspaceRoot, 'docusaurus.config.js'),
            path.join(this.workspaceRoot, 'docusaurus.config.ts')
        ];

        this.docsPaths = [];

        for (const configPath of configPaths) {
            console.log('🔍 Checking config path:', configPath);
            if (fs.existsSync(configPath)) {
                console.log('✅ Config file found:', configPath);
                this.parseDocusaurusConfig(configPath);
                return;
            }
        }
        
        // If no config found, try common folder patterns
        console.log('⚠️ No config file found, searching for common doc folders');
        this.findDocumentFolders();
    }

    private parseDocusaurusConfig(configPath: string): void {
        try {
            const configContent = fs.readFileSync(configPath, 'utf8');
            console.log('📄 Reading config file content');

            // Extract plugin-content-docs configurations
            const docsPluginMatches = this.extractDocsPlugins(configContent);
            
            if (docsPluginMatches.length > 0) {
                console.log(`📚 Found ${docsPluginMatches.length} docs plugin(s)`);
                
                for (const match of docsPluginMatches) {
                    const docPath = this.extractPathFromPlugin(match);
                    if (docPath) {
                        const fullPath = path.resolve(this.workspaceRoot, docPath);
                        if (fs.existsSync(fullPath)) {
                            console.log('✅ Adding docs path:', fullPath);
                            this.docsPaths.push(fullPath);
                        } else {
                            console.log('⚠️ Docs path not found:', fullPath);
                        }
                    }
                }
            }
            
            // If no paths found from config, use default
            if (this.docsPaths.length === 0) {
                console.log('📁 No paths found in config, using default docs folder');
                const defaultDocsPath = path.join(this.workspaceRoot, 'docs');
                if (fs.existsSync(defaultDocsPath)) {
                    this.docsPaths.push(defaultDocsPath);
                }
            }
        } catch (error) {
            console.error('❌ Error parsing config file:', error);
            this.findDocumentFolders();
        }
    }

    private extractDocsPlugins(configContent: string): string[] {
        const plugins: string[] = [];
        
        // Pattern 1: @docusaurus/plugin-content-docs with configuration
        const pluginPattern1 = /@docusaurus\/plugin-content-docs['"]\s*,\s*{([^}]+)}/g;
        let match;
        
        while ((match = pluginPattern1.exec(configContent)) !== null) {
            plugins.push(match[1]);
        }

        // Pattern 2: plugins array with objects
        const pluginPattern2 = /{\s*['"]*preset['"]*:\s*['"]@docusaurus\/plugin-content-docs['"][^}]*}/g;
        while ((match = pluginPattern2.exec(configContent)) !== null) {
            plugins.push(match[0]);
        }

        // Pattern 3: Simple string reference in plugins array
        const pluginPattern3 = /plugins:\s*\[([\s\S]*?)\]/;
        const pluginsMatch = configContent.match(pluginPattern3);
        if (pluginsMatch) {
            const pluginsContent = pluginsMatch[1];
            const docsPluginPattern = /{[^}]*@docusaurus\/plugin-content-docs[^}]*}/g;
            while ((match = docsPluginPattern.exec(pluginsContent)) !== null) {
                plugins.push(match[0]);
            }
        }

        // Pattern 4: Nested array format [['@docusaurus/plugin-content-docs', {...}], ...]
        const nestedArrayPattern = /\[\s*\[\s*['"]@docusaurus\/plugin-content-docs['"],\s*({[^}]+})\s*\]\s*\]/g;
        while ((match = nestedArrayPattern.exec(configContent)) !== null) {
            plugins.push(match[1]);
        }

        console.log('🔍 Extracted plugin configs:', plugins.length);
        return plugins;
    }

    private extractPathFromPlugin(pluginConfig: string): string | null {
        // Extract path or id from plugin configuration
        
        // Pattern 1: path: './docs' or path: 'docs'
        const pathMatch = pluginConfig.match(/path\s*:\s*['"`]([^'"`]+)['"`]/);
        if (pathMatch) {
            console.log('📂 Found path:', pathMatch[1]);
            return pathMatch[1];
        }

        // Pattern 2: id: 'api' (use id as folder name)
        const idMatch = pluginConfig.match(/id\s*:\s*['"`]([^'"`]+)['"`]/);
        if (idMatch && idMatch[1] !== 'default') {
            const idPath = path.join('docs', idMatch[1]); // Assume docs/[id] structure
            console.log('🆔 Found id, assuming path:', idPath);
            return idPath;
        }

        // Pattern 3: routeBasePath: '/api' (extract from route)
        const routeMatch = pluginConfig.match(/routeBasePath\s*:\s*['"`]\/([^'"`]+)['"`]/);
        if (routeMatch) {
            const routePath = routeMatch[1];
            console.log('🛣️ Found route, assuming path:', routePath);
            return routePath;
        }

        return null;
    }

    private findDocumentFolders(): void {
        console.log('🔍 Searching for document folders');
        
        // Common Docusaurus folder patterns
        const commonFolders = [
            'docs',           // Default docs
            'blog',           // Blog posts (if any)
            'api',            // API docs
            'guides',         // Guides
            'tutorials',      // Tutorials
            'versioned_docs', // Versioned docs
        ];

        // Also check for folders that might contain markdown files
        try {
            const entries = fs.readdirSync(this.workspaceRoot, { withFileTypes: true });
            
            for (const entry of entries) {
                if (entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.startsWith('node_modules')) {
                    const fullPath = path.join(this.workspaceRoot, entry.name);
                    
                    // Check if it's a common folder or contains markdown files
                    if (commonFolders.includes(entry.name) || this.containsMarkdownFiles(fullPath)) {
                        console.log('📁 Adding potential docs folder:', fullPath);
                        this.docsPaths.push(fullPath);
                    }
                }
            }
        } catch (error) {
            console.error('❌ Error searching for folders:', error);
        }

        // If still no paths found, use workspace root
        if (this.docsPaths.length === 0) {
            console.log('⚠️ No document folders found, using workspace root');
            this.docsPaths.push(this.workspaceRoot);
        }
    }

    private containsMarkdownFiles(folderPath: string): boolean {
        try {
            const entries = fs.readdirSync(folderPath, { withFileTypes: true });
            
            for (const entry of entries) {
                if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.mdx'))) {
                    return true;
                }
                
                // Check one level deeper
                if (entry.isDirectory() && !entry.name.startsWith('.')) {
                    const subPath = path.join(folderPath, entry.name);
                    const subEntries = fs.readdirSync(subPath, { withFileTypes: true });
                    
                    for (const subEntry of subEntries) {
                        if (subEntry.isFile() && (subEntry.name.endsWith('.md') || subEntry.name.endsWith('.mdx'))) {
                            return true;
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error checking for markdown files:', error);
        }
        
        return false;
    }

    private getRootItems(): DocItem[] {
        console.log('🔍 Getting root items, docsPaths:', this.docsPaths);
        const items: DocItem[] = [];
        
        if (this.docsPaths.length === 0) {
            console.log('⚠️ No docs paths found, creating default item');
            // If no docs paths found, create a default item for testing
            items.push({
                label: 'No documentation folders found',
                type: 'folder',
                filePath: this.workspaceRoot
            });
            return items;
        }
        
        for (const docsPath of this.docsPaths) {
            const folderName = path.basename(docsPath);
            const relativePath = path.relative(this.workspaceRoot, docsPath);
            
            // Create a more descriptive label
            let label = folderName;
            if (relativePath !== folderName) {
                label = `${folderName} (${relativePath})`;
            }
            
            console.log('📁 Adding root item:', label, 'at', docsPath);
            items.push({
                label: label,
                type: 'folder',
                filePath: docsPath
            });
        }

        console.log('✅ Root items created:', items.length);
        return items;
    }

    private getDocItemsFromPath(folderPath: string): DocItem[] {
        if (!fs.existsSync(folderPath)) {
            return [];
        }

        const items: DocItem[] = [];
        const entries = fs.readdirSync(folderPath, { withFileTypes: true });

        // Parse category file if exists
        const categoryPath = path.join(folderPath, '_category_.json');
        let categoryInfo: any = {};
        if (fs.existsSync(categoryPath)) {
            try {
                const categoryContent = fs.readFileSync(categoryPath, 'utf8');
                categoryInfo = JSON.parse(categoryContent);
            } catch (error) {
                console.error('Error parsing _category_.json:', error);
            }
        }

        for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name === '_category_.json') {
                continue;
            }

            const fullPath = path.join(folderPath, entry.name);

            if (entry.isDirectory()) {
                // Get folder info from _category_.json if available
                const folderCategoryPath = path.join(fullPath, '_category_.json');
                let folderInfo: any = {};
                if (fs.existsSync(folderCategoryPath)) {
                    try {
                        const content = fs.readFileSync(folderCategoryPath, 'utf8');
                        folderInfo = JSON.parse(content);
                    } catch (error) {
                        console.error('Error parsing folder _category_.json:', error);
                    }
                }

                items.push({
                    label: folderInfo.label || entry.name,
                    type: 'folder',
                    filePath: fullPath,
                    position: folderInfo.position
                });
            } else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
                // Parse markdown frontmatter
                try {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    const parsed = matter(content);
                    
                    items.push({
                        label: parsed.data.title || entry.name,
                        type: 'file',
                        filePath: fullPath,
                        position: parsed.data.sidebar_position,
                        id: parsed.data.id,
                        title: parsed.data.title
                    });
                } catch (error) {
                    console.error('Error parsing markdown file:', error);
                    items.push({
                        label: entry.name,
                        type: 'file',
                        filePath: fullPath
                    });
                }
            }
        }

        // Sort by position
        items.sort((a, b) => {
            const posA = a.position || 999;
            const posB = b.position || 999;
            return posA - posB;
        });

        return items;
    }
}
