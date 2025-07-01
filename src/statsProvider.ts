import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import matter from 'gray-matter';

/**
 * 統計情報のデータ構造
 */
interface FileStats {
    filePath: string;
    fileName: string;
    characters: number;
    words: number;
    paragraphs: number;
    codeBlocks: number;
    admonitions: number;
    readingTimeMinutes: number;
    lastModified: Date;
}

interface ProjectStats {
    totalFiles: number;
    totalCharacters: number;
    totalWords: number;
    totalParagraphs: number;
    totalCodeBlocks: number;
    totalAdmonitions: number;
    totalReadingTimeMinutes: number;
    averageReadingTime: number;
    lastUpdated: Date;
}

/**
 * Docusaurus統計情報プロバイダー
 */
export class DocusaurusStatsProvider implements vscode.TreeDataProvider<StatsItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<StatsItem | undefined | null | void> = new vscode.EventEmitter<StatsItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<StatsItem | undefined | null | void> = this._onDidChangeTreeData.event;
    
    private projectStats: ProjectStats | null = null;
    private fileStats: FileStats[] = [];
    private currentContentType: 'docs' | 'blog' = 'docs';
    private fileWatcher: vscode.FileSystemWatcher | null = null;
    
    constructor(private docusaurusRoot: string) {
        this.setupFileWatcher();
        this.refresh();
    }
    
    private setupFileWatcher(): void {
        // Markdown ファイルの変更を監視
        const pattern = new vscode.RelativePattern(this.docusaurusRoot, '**/*.{md,mdx}');
        this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
        
        this.fileWatcher.onDidCreate(() => this.refresh());
        this.fileWatcher.onDidChange(() => this.refresh());
        this.fileWatcher.onDidDelete(() => this.refresh());
    }
    
    dispose(): void {
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
        }
    }
    
    refresh(): void {
        this.calculateStats();
        this._onDidChangeTreeData.fire();
    }
    
    setContentType(contentType: 'docs' | 'blog'): void {
        this.currentContentType = contentType;
        this.refresh();
    }
    
    getTreeItem(element: StatsItem): vscode.TreeItem {
        return element;
    }
    
    getChildren(element?: StatsItem): Thenable<StatsItem[]> {
        if (!element) {
            // ルート要素
            const items: StatsItem[] = [];
            
            if (this.projectStats) {
                // プロジェクト統計
                items.push(new StatsItem(
                    `📊 プロジェクト統計 (${this.currentContentType === 'docs' ? 'ドキュメント' : 'ブログ'})`,
                    '',
                    vscode.TreeItemCollapsibleState.Expanded,
                    'project'
                ));
                
                // ファイル一覧
                if (this.fileStats.length > 0) {
                    items.push(new StatsItem(
                        `📄 ファイル別統計 (${this.fileStats.length}件)`,
                        '',
                        vscode.TreeItemCollapsibleState.Collapsed,
                        'files'
                    ));
                }
            }
            
            return Promise.resolve(items);
        } else if (element.contextValue === 'project') {
            // プロジェクト統計の詳細
            const items: StatsItem[] = [];
            if (this.projectStats) {
                items.push(new StatsItem(`📝 ${this.projectStats.totalCharacters.toLocaleString()}文字`, '', vscode.TreeItemCollapsibleState.None, 'stat'));
                items.push(new StatsItem(`📖 ${this.projectStats.totalWords.toLocaleString()}語`, '', vscode.TreeItemCollapsibleState.None, 'stat'));
                items.push(new StatsItem(`📄 ${this.projectStats.totalParagraphs}段落`, '', vscode.TreeItemCollapsibleState.None, 'stat'));
                items.push(new StatsItem(`⏱️ ${this.projectStats.totalReadingTimeMinutes}分 (平均${this.projectStats.averageReadingTime}分)`, '', vscode.TreeItemCollapsibleState.None, 'stat'));
                if (this.projectStats.totalCodeBlocks > 0) {
                    items.push(new StatsItem(`💻 ${this.projectStats.totalCodeBlocks}コードブロック`, '', vscode.TreeItemCollapsibleState.None, 'stat'));
                }
                if (this.projectStats.totalAdmonitions > 0) {
                    items.push(new StatsItem(`💡 ${this.projectStats.totalAdmonitions}アドモニション`, '', vscode.TreeItemCollapsibleState.None, 'stat'));
                }
                items.push(new StatsItem(`🔄 最終更新: ${this.projectStats.lastUpdated.toLocaleString('ja-JP')}`, '', vscode.TreeItemCollapsibleState.None, 'stat'));
            }
            return Promise.resolve(items);
        } else if (element.contextValue === 'files') {
            // ファイル別統計
            const items: StatsItem[] = this.fileStats
                .sort((a, b) => b.characters - a.characters) // 文字数順でソート
                .slice(0, 10) // 上位10件のみ表示
                .map(stat => new StatsItem(
                    `${stat.fileName}`,
                    `📝 ${stat.characters.toLocaleString()}文字 📖 ${stat.words.toLocaleString()}語 ⏱️ ${stat.readingTimeMinutes}分`,
                    vscode.TreeItemCollapsibleState.None,
                    'file',
                    stat.filePath
                ));
            
            return Promise.resolve(items);
        }
        
        return Promise.resolve([]);
    }
    
    private calculateStats(): void {
        const contentDir = path.join(this.docusaurusRoot, this.currentContentType);
        
        console.log(`[Stats] Calculating stats for contentType: ${this.currentContentType}`);
        console.log(`[Stats] Content directory: ${contentDir}`);
        
        if (!fs.existsSync(contentDir)) {
            console.log(`[Stats] Content directory does not exist: ${contentDir}`);
            this.projectStats = null;
            this.fileStats = [];
            return;
        }
        
        const markdownFiles = this.findMarkdownFiles(contentDir);
        console.log(`[Stats] Found ${markdownFiles.length} markdown files:`, markdownFiles);
        this.fileStats = [];
        
        let totalCharacters = 0;
        let totalWords = 0;
        let totalParagraphs = 0;
        let totalCodeBlocks = 0;
        let totalAdmonitions = 0;
        let totalReadingTime = 0;
        let lastModified = new Date(0);
        
        for (const filePath of markdownFiles) {
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                const { content: markdownContent } = matter(content);
                const stats = this.calculateContentStats(markdownContent);
                const fileStat = fs.statSync(filePath);
                
                console.log(`[Stats] Processing file: ${path.basename(filePath)}`);
                console.log(`[Stats] Content length: ${markdownContent.length}, Stats:`, stats);
                
                const fileStats: FileStats = {
                    filePath,
                    fileName: path.basename(filePath),
                    characters: stats.characters,
                    words: stats.words,
                    paragraphs: stats.paragraphs,
                    codeBlocks: stats.codeBlocks,
                    admonitions: stats.admonitions,
                    readingTimeMinutes: stats.readingTimeMinutes,
                    lastModified: fileStat.mtime
                };
                
                this.fileStats.push(fileStats);
                
                totalCharacters += stats.characters;
                totalWords += stats.words;
                totalParagraphs += stats.paragraphs;
                totalCodeBlocks += stats.codeBlocks;
                totalAdmonitions += stats.admonitions;
                totalReadingTime += stats.readingTimeMinutes;
                
                if (fileStat.mtime > lastModified) {
                    lastModified = fileStat.mtime;
                }
            } catch (error) {
                console.error(`Error processing file ${filePath}:`, error);
            }
        }
        
        this.projectStats = {
            totalFiles: markdownFiles.length,
            totalCharacters,
            totalWords,
            totalParagraphs,
            totalCodeBlocks,
            totalAdmonitions,
            totalReadingTimeMinutes: Math.round(totalReadingTime),
            averageReadingTime: markdownFiles.length > 0 ? Math.round((totalReadingTime / markdownFiles.length) * 10) / 10 : 0,
            lastUpdated: lastModified
        };
        
        console.log(`[Stats] Project stats calculated:`, this.projectStats);
    }
    
    private findMarkdownFiles(dir: string): string[] {
        const files: string[] = [];
        
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                
                if (entry.isDirectory() && !entry.name.startsWith('.')) {
                    files.push(...this.findMarkdownFiles(fullPath));
                } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.mdx'))) {
                    files.push(fullPath);
                }
            }
        } catch (error) {
            console.error(`Error reading directory ${dir}:`, error);
        }
        
        return files;
    }
    
    private calculateContentStats(content: string): {
        characters: number;
        words: number;
        paragraphs: number;
        codeBlocks: number;
        admonitions: number;
        readingTimeMinutes: number;
    } {
        // マークダウン記法を除去してプレーンテキストを取得
        let plainText = content
            // コードブロックを除去
            .replace(/```[\s\S]*?```/g, '')
            // インラインコードを除去
            .replace(/`[^`]+`/g, '')
            // Admonitionを除去
            .replace(/:::(note|tip|info|caution|danger|warning)[\s\S]*?:::/gi, '')
            // リンクのURLを除去
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            // 画像記法を除去
            .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
            // HTMLタグを除去
            .replace(/<[^>]+>/g, '')
            // マークダウン記法を除去
            .replace(/[*_~`#>-]/g, '')
            // 余分な空白を正規化
            .replace(/\s+/g, ' ')
            .trim();

        const characters = plainText.length;
        
        // 日本語と英語混在を考慮した単語数計算
        const japaneseChars = (plainText.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g) || []).length;
        const englishWords = (plainText.match(/[a-zA-Z]+/g) || []).length;
        const words = japaneseChars + englishWords;
        
        // 読了時間の計算（日本語: 400文字/分、英語: 200単語/分）
        const japaneseReadingTime = japaneseChars / 400;
        const englishReadingTime = englishWords / 200;
        const readingTimeMinutes = Math.max(1, Math.ceil(japaneseReadingTime + englishReadingTime));
        
        // その他の統計
        const paragraphs = (content.match(/\n\s*\n/g) || []).length + 1;
        const codeBlocks = (content.match(/```/g) || []).length / 2;
        const admonitions = (content.match(/:::(note|tip|info|caution|danger|warning)/gi) || []).length;
        
        return {
            characters,
            words,
            paragraphs,
            codeBlocks,
            admonitions,
            readingTimeMinutes
        };
    }
    
    /**
     * 現在のファイル統計を取得
     */
    public getCurrentFileStats(): FileStats | null {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            return null;
        }
        
        const currentFilePath = activeEditor.document.uri.fsPath;
        return this.fileStats.find(stat => stat.filePath === currentFilePath) || null;
    }
}

class StatsItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly description: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string,
        public readonly filePath?: string
    ) {
        super(label, collapsibleState);
        
        this.description = description;
        this.contextValue = contextValue;
        
        if (filePath) {
            this.resourceUri = vscode.Uri.file(filePath);
            this.command = {
                command: 'vscode.open',
                title: 'ファイルを開く',
                arguments: [vscode.Uri.file(filePath)]
            };
        }
        
        // アイコンを設定
        switch (contextValue) {
            case 'project':
                this.iconPath = new vscode.ThemeIcon('graph');
                break;
            case 'files':
                this.iconPath = new vscode.ThemeIcon('files');
                break;
            case 'file':
                this.iconPath = new vscode.ThemeIcon('file-text');
                break;
            case 'stat':
                this.iconPath = new vscode.ThemeIcon('info');
                break;
        }
    }
}
