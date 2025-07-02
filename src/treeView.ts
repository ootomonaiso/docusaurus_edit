import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import matter from 'gray-matter';

export interface DocItem {
    label: string;
    type: 'file' | 'folder' | 'image';
    filePath: string;
    position?: number;
    id?: string;
    title?: string;
    children?: DocItem[];
}

export class DocusaurusTreeItem extends vscode.TreeItem {
    // イメージフォルダかどうかを判定するヘルパーメソッド
    private isImageFolder(label: string): boolean {
        // "フォルダ名 (数字)" の形式をチェック
        return /^(images|img|assets|static)\s*\(\d+\)$/.test(label);
    }
    
    constructor(
        public readonly docItem: DocItem,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        try {
            // まず、ラベルだけで初期化（最低限の表示を保証）
            super(docItem.label, collapsibleState);

            // ポジション番号をラベルに追加
            if (docItem.position !== undefined) {
                this.label = docItem.label; // ポジション番号を削除
            }

            // 実際のファイルパスが存在する場合はresourceUriを設定
            if (docItem.filePath && fs.existsSync(docItem.filePath)) {
                if (docItem.type === 'file') {
                    // Markdownファイルの場合は拡張子なしのラベルを表示
                    this.label = docItem.label.replace(/\.mdx?$/, '');
                    // ファイルの場合はresourceUriを設定（ただしカスタムアイコンを後で上書き）
                    this.resourceUri = vscode.Uri.file(docItem.filePath);
                } else if (docItem.type === 'image') {
                    // 画像ファイルの場合もresourceUriを設定
                    this.resourceUri = vscode.Uri.file(docItem.filePath);
                } else if (docItem.type === 'folder' && !this.isImageFolder(docItem.label)) {
                    // 通常のフォルダの場合はresourceUriを設定
                    this.resourceUri = vscode.Uri.file(docItem.filePath);

                    // カテゴリフォルダの場合はカスタムラベルを使用
                    const categoryConfigPath = path.join(docItem.filePath, '_category_.json');
                    if (fs.existsSync(categoryConfigPath)) {
                        try {
                            const categoryConfig = JSON.parse(fs.readFileSync(categoryConfigPath, 'utf8'));
                            if (categoryConfig.label) {
                                this.label = categoryConfig.label;
                            }
                        } catch (err) {
                            console.error(`Error parsing ${categoryConfigPath}:`, err);
                        }
                    }
                }
                // Imagesフォルダは仮想フォルダなのでresourceUriは設定しない
            }
        } catch (err) {
            // エラーが発生した場合は、単純なラベルだけのTreeItemを作成
            console.error(`❌ Error creating TreeItem for ${docItem.label}:`, err);
            super(docItem.label || "Unknown Item", collapsibleState);
        }

        // ツールチップと説明を設定
        this.tooltip = docItem.title || docItem.label;
        // Remove seconds and character count from the description
        this.description = '';

        // コンテキスト値とコマンドをアイテムタイプに基づいて設定
        if (docItem.type === 'file') {
            this.command = {
                command: 'vscode.open',
                title: 'Open',
                arguments: [vscode.Uri.file(docItem.filePath)]
            };
            this.contextValue = 'docFile';
        } else if (docItem.type === 'image') {
            this.command = {
                command: 'vscode.open',
                title: 'Open Image',
                arguments: [vscode.Uri.file(docItem.filePath)]
            };
            this.contextValue = 'imageFile';
        } else {
            // フォルダ処理
            if (this.isImageFolder(docItem.label)) {
                this.contextValue = 'imagesFolder';
                // イメージフォルダは仮想フォルダとして扱うためresourceUriを削除
                this.resourceUri = undefined;
            } else {
                // 通常のフォルダまたはカテゴリフォルダ
                const categoryConfigPath = path.join(docItem.filePath, '_category_.json');
                const isCategory = fs.existsSync(categoryConfigPath);
                this.contextValue = isCategory ? 'docCategory' : 'docFolder';
            }
        }

        // アイコンを最後に設定（resourceUriによる自動アイコンを上書き）
        this.setCustomIcon(docItem);
    }

    private setCustomIcon(docItem: DocItem): void {
        if (docItem.type === 'file') {
            // Markdownファイルのアイコン（テーマカラーを適用）
            if (docItem.filePath.endsWith('.md') || docItem.filePath.endsWith('.mdx')) {
                this.iconPath = new vscode.ThemeIcon('markdown', new vscode.ThemeColor('icon.foreground'));
            } else {
                this.iconPath = new vscode.ThemeIcon('file-text');
            }
        } else if (docItem.type === 'image') {
            // 画像ファイルのアイコン（テーマカラーを適用）
            this.iconPath = new vscode.ThemeIcon('file-media', new vscode.ThemeColor('icon.foreground'));
        } else if (this.isImageFolder(docItem.label)) {
            // イメージフォルダも普通のフォルダと同じアイコン
            this.iconPath = new vscode.ThemeIcon('folder', new vscode.ThemeColor('icon.foreground'));
        } else {
            // 通常のフォルダまたはカテゴリフォルダも全て同じアイコン
            this.iconPath = new vscode.ThemeIcon('folder', new vscode.ThemeColor('icon.foreground'));
        }
    }
}

export class DocusaurusTreeDataProvider implements vscode.TreeDataProvider<DocItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<DocItem | undefined | null | void> = new vscode.EventEmitter<DocItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<DocItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private docsPaths: string[] = [];
    private blogPaths: string[] = [];
    private currentContentType: 'docs' | 'blog' = 'docs';
    private imagesFolderMap: Map<string, string> = new Map(); // Maps virtual folder labels to real paths

    // イメージフォルダかどうかを判定するヘルパーメソッド
    private isImageFolder(label: string): boolean {
        // "フォルダ名 (数字)" の形式をチェック
        return /^(images|img|assets|static)\s*\(\d+\)$/.test(label);
    }
    
    constructor(private workspaceRoot: string) {
        console.log('🌳 DocusaurusTreeDataProvider constructor called with:', workspaceRoot);
        this.refresh();
    }

    // Returns the actual file system path for a virtual folder
    getImagesFolderPath(label: string): string | undefined {
        return this.imagesFolderMap.get(label);
    }

    setContentType(contentType: 'docs' | 'blog'): void {
        this.currentContentType = contentType;
        console.log(`📝 Content type changed to: ${contentType}`);
    }

    getCurrentContentType(): 'docs' | 'blog' {
        return this.currentContentType;
    }

    refresh(): void {
        console.log('🔄 Refreshing tree data provider');
        this.loadDocusaurusConfig();
        this._onDidChangeTreeData.fire();
        console.log('🔄 Tree data refreshed, docsPaths:', this.docsPaths);
    }

    getTreeItem(element: DocItem): vscode.TreeItem {
        console.log('📋 getTreeItem called for:', element.label);
        
        let collapsibleState = vscode.TreeItemCollapsibleState.None;
        
        if (element.type === 'folder') {
            // 画像フォルダは閉じた状態で表示、それ以外は展開
            if (this.isImageFolder(element.label)) {
                collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            } else {
                collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
            }
        }
        
        // Create the tree item
        const treeItem = new DocusaurusTreeItem(element, collapsibleState);
        console.log(`📌 Created tree item for ${element.label}, resourceUri: ${treeItem.resourceUri ? 'set' : 'undefined'}`);
        return treeItem;
    }

    getChildren(element?: DocItem): Thenable<DocItem[]> {
        console.log('👥 getChildren called for element:', element?.label || 'root');
        
        if (!this.workspaceRoot) {
            console.log('❌ No workspace found');
            vscode.window.showInformationMessage('No workspace found');
            return Promise.resolve([]);
        }

        if (element) {
            // Check if this is a virtual Images folder
            if (this.isImageFolder(element.label)) {
                console.log('📸 Getting children for Images folder');
                
                // If we have children cached, return them directly
                if (element.children) {
                    return Promise.resolve(element.children);
                }
                
                // Otherwise, try to get the real images from the folder
                const imagesPath = element.filePath;
                if (fs.existsSync(imagesPath) && fs.statSync(imagesPath).isDirectory()) {
                    try {
                        // Load images from the actual images folder
                        const entries = fs.readdirSync(imagesPath);
                        const imageItems: DocItem[] = [];
                        
                        // Common image file extensions
                        const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico'];
                        
                        for (const entry of entries) {
                            const fullPath = path.join(imagesPath, entry);
                            if (fs.statSync(fullPath).isFile()) {
                                const ext = path.extname(entry).toLowerCase();
                                if (imageExtensions.includes(ext)) {
                                    imageItems.push({
                                        label: entry,
                                        type: 'image',
                                        filePath: fullPath
                                    });
                                }
                            }
                        }
                        
                        // Sort images alphabetically
                        imageItems.sort((a, b) => a.label.localeCompare(b.label));
                        return Promise.resolve(imageItems);
                    } catch (error) {
                        console.error('❌ Error reading images folder:', error);
                    }
                }
                
                return Promise.resolve([]);
            }
            
            // Return children of the selected folder
            console.log('📁 Getting children for folder:', element.filePath);
            return Promise.resolve(this.getDocItemsFromPath(element.filePath));
        } else {
            // Return root level items (docs folders)
            console.log('🏠 Getting root items');
            const rootItems = this.getRootItems();
            console.log('🏠 Root items found:', rootItems.length);
            
            // 詳細ログ出力
            if (rootItems.length === 0) {
                console.log('⚠️ No root items found! docsPaths:', this.docsPaths);
            } else {
                console.log('📊 Root items details:');
                rootItems.forEach((item, index) => {
                    console.log(`  ${index + 1}: ${item.label} (${item.type}) - ${item.filePath}`);
                });
            }
            
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
        this.blogPaths = [];

        for (const configPath of configPaths) {
            console.log('🔍 Checking config path:', configPath);
            if (fs.existsSync(configPath)) {
                console.log('✅ Config file found:', configPath);
                this.parseDocusaurusConfig(configPath);
                return;
            }
        }
        
        // If no config found, try common folder patterns
        console.log('⚠️ No config file found, searching for common doc/blog folders');
        this.findDocumentFolders();
    }

    private parseDocusaurusConfig(configPath: string): void {
        try {
            const configContent = fs.readFileSync(configPath, 'utf8');
            console.log('📄 Reading config file content');

            // Extract plugin-content-docs configurations
            const docsPluginMatches = this.extractDocsPlugins(configContent);
            const blogPluginMatches = this.extractBlogPlugins(configContent);
            
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

            if (blogPluginMatches.length > 0) {
                console.log(`📝 Found ${blogPluginMatches.length} blog plugin(s)`);
                
                for (const match of blogPluginMatches) {
                    const blogPath = this.extractPathFromPlugin(match);
                    if (blogPath) {
                        const fullPath = path.resolve(this.workspaceRoot, blogPath);
                        if (fs.existsSync(fullPath)) {
                            console.log('✅ Adding blog path:', fullPath);
                            this.blogPaths.push(fullPath);
                        } else {
                            console.log('⚠️ Blog path not found:', fullPath);
                        }
                    }
                }
            }
            
            // Always check for default docs and blog folders first
            console.log('📁 Checking default docs and blog folders');
            const defaultDocsPath = path.join(this.workspaceRoot, 'docs');
            const defaultBlogPath = path.join(this.workspaceRoot, 'blog');
            
            if (fs.existsSync(defaultDocsPath)) {
                console.log('✅ Found default docs folder:', defaultDocsPath);
                this.docsPaths.push(defaultDocsPath);
            }
            
            if (fs.existsSync(defaultBlogPath)) {
                console.log('✅ Found default blog folder:', defaultBlogPath);
                this.blogPaths.push(defaultBlogPath);
            }
            
            // If no additional paths found from config, we're done
            if (this.docsPaths.length === 0 && this.blogPaths.length === 0) {
                console.log('⚠️ No default folders found, searching for additional ones');
                this.findDocumentFolders();
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

    private extractBlogPlugins(configContent: string): string[] {
        const plugins: string[] = [];
        
        // Pattern 1: @docusaurus/plugin-content-blog with configuration
        const pluginPattern1 = /@docusaurus\/plugin-content-blog['"]\s*,\s*{([^}]+)}/g;
        let match;
        
        while ((match = pluginPattern1.exec(configContent)) !== null) {
            plugins.push(match[1]);
        }

        // Pattern 2: plugins array with objects
        const pluginPattern2 = /{\s*['"]*preset['"]*:\s*['"]@docusaurus\/plugin-content-blog['"][^}]*}/g;
        while ((match = pluginPattern2.exec(configContent)) !== null) {
            plugins.push(match[0]);
        }

        // Pattern 3: Simple string reference in plugins array
        const pluginPattern3 = /plugins:\s*\[([\s\S]*?)\]/;
        const pluginsMatch = configContent.match(pluginPattern3);
        if (pluginsMatch) {
            const pluginsContent = pluginsMatch[1];
            const blogPluginPattern = /{[^}]*@docusaurus\/plugin-content-blog[^}]*}/g;
            while ((match = blogPluginPattern.exec(pluginsContent)) !== null) {
                plugins.push(match[0]);
            }
        }

        // Pattern 4: preset configuration
        const presetPattern = /@docusaurus\/preset-classic['"]\s*,\s*{([^}]+)}/g;
        while ((match = presetPattern.exec(configContent)) !== null) {
            const presetConfig = match[1];
            const blogConfigPattern = /blog:\s*{([^}]+)}/;
            const blogConfigMatch = presetConfig.match(blogConfigPattern);
            if (blogConfigMatch) {
                plugins.push(blogConfigMatch[1]);
            }
        }

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
        const commonDocsFolders = [
            'docs',           // Default docs
            'api',            // API docs
            'guides',         // Guides
            'tutorials',      // Tutorials
            'versioned_docs', // Versioned docs
        ];

        const commonBlogFolders = [
            'blog',           // Blog posts
        ];

        // Also check for folders that might contain markdown files
        try {
            const entries = fs.readdirSync(this.workspaceRoot, { withFileTypes: true });
            
            for (const entry of entries) {
                if (entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.startsWith('node_modules')) {
                    const fullPath = path.join(this.workspaceRoot, entry.name);
                    
                    // Check if it's a docs folder
                    if (commonDocsFolders.includes(entry.name)) {
                        console.log('📁 Adding docs folder:', fullPath);
                        this.docsPaths.push(fullPath);
                    }

                    // Check if it's a blog folder
                    if (commonBlogFolders.includes(entry.name)) {
                        console.log('� Adding blog folder:', fullPath);
                        this.blogPaths.push(fullPath);
                    }

                    // Check for other folders that contain markdown files (but not already categorized)
                    if (!commonDocsFolders.includes(entry.name) && !commonBlogFolders.includes(entry.name)) {
                        if (this.containsMarkdownFiles(fullPath)) {
                            // Determine if it's more likely docs or blog based on content
                            if (entry.name.toLowerCase().includes('blog') || this.containsBlogFiles(fullPath)) {
                                console.log('📝 Adding potential blog folder:', fullPath);
                                this.blogPaths.push(fullPath);
                            } else {
                                console.log('📁 Adding potential docs folder:', fullPath);
                                this.docsPaths.push(fullPath);
                            }
                        }
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

    private containsBlogFiles(folderPath: string): boolean {
        try {
            const entries = fs.readdirSync(folderPath, { withFileTypes: true });
            
            for (const entry of entries) {
                if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.mdx'))) {
                    // Check if file has blog-like naming pattern (YYYY-MM-DD-title.md)
                    const blogFilePattern = /^\d{4}-\d{2}-\d{2}-.+\.(md|mdx)$/;
                    if (blogFilePattern.test(entry.name)) {
                        return true;
                    }
                    
                    // Check frontmatter for blog-specific fields
                    try {
                        const filePath = path.join(folderPath, entry.name);
                        const content = fs.readFileSync(filePath, 'utf8');
                        const frontmatter = matter(content);
                        
                        // Look for blog-specific frontmatter fields
                        if (frontmatter.data.authors || frontmatter.data.tags || frontmatter.data.slug) {
                            return true;
                        }
                    } catch (error) {
                        // If we can't read the file, continue
                    }
                }
            }
        } catch (error) {
            console.error('Error checking for blog files:', error);
        }
        
        return false;
    }

    private getRootItems(): DocItem[] {
        const currentPaths = this.currentContentType === 'docs' ? this.docsPaths : this.blogPaths;
        const contentTypeLabel = this.currentContentType === 'docs' ? 'documentation' : 'blog';
        
        console.log(`🔍 Getting root items for ${this.currentContentType}`);
        console.log(`📁 Current paths (${this.currentContentType}):`, currentPaths);
        console.log(`📚 All docs paths:`, this.docsPaths);
        console.log(`📝 All blog paths:`, this.blogPaths);
        
        const items: DocItem[] = [];
        
        if (currentPaths.length === 0) {
            console.log(`⚠️ No ${this.currentContentType} paths found, creating default item`);
            // If no paths found, create a default item for testing
            items.push({
                label: `No ${contentTypeLabel} folders found`,
                type: 'folder',
                filePath: this.workspaceRoot
            });
            return items;
        }
        
        for (const contentPath of currentPaths) {
            const folderName = path.basename(contentPath);
            const relativePath = path.relative(this.workspaceRoot, contentPath);
            
            // Create a more descriptive label
            let label = folderName;
            if (relativePath !== folderName) {
                label = `${folderName} (${relativePath})`;
            }
            
            console.log('📁 Adding root item:', label, 'at', contentPath);
            items.push({
                label: label,
                type: 'folder',
                filePath: contentPath
            });
        }

        console.log('✅ Root items created:', items.length);
        return items;
    }

    private getDocItemsFromPath(folderPath: string): DocItem[] {
        console.log(`🔍 Getting doc items from path: ${folderPath}`);
        if (!fs.existsSync(folderPath)) {
            console.log(`❌ Path does not exist: ${folderPath}`);
            return [];
        }

        const items: DocItem[] = [];
        const imageItems: DocItem[] = [];
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

        // Common image file extensions
        const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico'];

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
            } else {
                // Check if it's an image file
                const fileExtension = path.extname(entry.name).toLowerCase();
                if (imageExtensions.includes(fileExtension)) {
                    imageItems.push({
                        label: entry.name,
                        type: 'image',
                        filePath: fullPath
                        // No position for images
                    });
                }
            }
        }

        // Sort regular items by position
        items.sort((a, b) => {
            const posA = a.position || 999;
            const posB = b.position || 999;
            return posA - posB;
        });

        // Sort image items alphabetically
        imageItems.sort((a, b) => a.label.localeCompare(b.label));

        // If there are images, check if an images folder exists already or create one
        if (imageItems.length > 0) {
            console.log(`📸 Found ${imageItems.length} image(s) in ${folderPath}`);
            
            // Check for existing image folders
            const existingImageFolders = ['images', 'img', 'assets', 'static'];
            let foundImageFolder = false;
            let imageFolderName = '';
            let imageFolderPath = '';
            
            // Look for existing image folders
            for (const folder of existingImageFolders) {
                const checkPath = path.join(folderPath, folder);
                if (fs.existsSync(checkPath) && fs.statSync(checkPath).isDirectory()) {
                    imageFolderName = folder;
                    imageFolderPath = checkPath;
                    foundImageFolder = true;
                    console.log(`📁 Found existing image folder: ${imageFolderName}`);
                    break;
                }
            }
            
            // If no image folder exists, create a default one
            if (!foundImageFolder) {
                imageFolderName = 'images'; // デフォルト名
                imageFolderPath = path.join(folderPath, imageFolderName);
                try {
                    fs.mkdirSync(imageFolderPath, { recursive: true });
                    console.log(`📁 Created default images folder: ${imageFolderPath}`);
                } catch (error) {
                    console.error('❌ Error creating images folder:', error);
                }
            }
            
            // フォルダ名をそのまま表示（カウントを付加）
            const imagesFolderLabel = `${imageFolderName} (${imageItems.length})`;
            const imagesFolder: DocItem = {
                label: imagesFolderLabel,
                type: 'folder',
                filePath: imageFolderPath,
                position: 1000, // Place at the end
                children: imageItems
            };
            
            // Store the mapping of virtual folder label to real path
            this.imagesFolderMap.set(imagesFolderLabel, imageFolderPath);
            
            items.push(imagesFolder);
        }

        return items;
    }
}
