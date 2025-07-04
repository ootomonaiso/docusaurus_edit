import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface FileStats {
	filePath: string;
	fileName: string;
	charCount: number;
	wordCount: number;
	lineCount: number;
	readingTime: number; // 分単位
	lastModified: Date;
	fileSize: number; // バイト単位
}

export class FileStatsTreeItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly stats?: FileStats,
		public readonly isStatsItem?: boolean
	) {
		super(label, collapsibleState);
		
		if (isStatsItem && stats) {
			this.contextValue = 'fileStats';
			this.iconPath = new vscode.ThemeIcon('info');
			this.description = this.formatStatsDescription();
		} else if (stats) {
			this.contextValue = 'file';
			this.iconPath = new vscode.ThemeIcon('file');
			this.command = {
				command: 'vscode.open',
				title: 'Open File',
				arguments: [vscode.Uri.file(stats.filePath)]
			};
		} else {
			// ファイルが選択されていない場合
			this.contextValue = 'noFile';
			this.iconPath = new vscode.ThemeIcon('info');
		}
	}

	private formatStatsDescription(): string {
		if (!this.stats) {
			return '';
		}
		const readingTime = this.stats.readingTime < 1 
			? `${Math.ceil(this.stats.readingTime * 60)}秒`
			: `${Math.ceil(this.stats.readingTime)}分`;
		return `${this.stats.charCount}文字 • ${readingTime}`;
	}
}

export class FileStatsProvider implements vscode.TreeDataProvider<FileStatsTreeItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<FileStatsTreeItem | undefined | null | void> = new vscode.EventEmitter<FileStatsTreeItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<FileStatsTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

	private fileStats: Map<string, FileStats> = new Map();

	private disposables: vscode.Disposable[] = [];

	constructor(private docusaurusRoot: string, private contentType: 'docs' | 'blog' = 'docs') {
		this.refreshStats();
		
		// エディタ関連のイベントリスナーを設定
		this.disposables.push(
			vscode.window.onDidChangeActiveTextEditor(() => this.refresh()),
			vscode.window.onDidChangeVisibleTextEditors(() => this.refresh()),
			vscode.workspace.onDidOpenTextDocument(() => this.refresh()),
			vscode.workspace.onDidCloseTextDocument(() => this.refresh())
		);
	}

	refresh(): void {
		this.refreshStats();
		this._onDidChangeTreeData.fire();
	}

	setContentType(contentType: 'docs' | 'blog'): void {
		this.contentType = contentType;
		this.refresh();
	}

	getTreeItem(element: FileStatsTreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: FileStatsTreeItem): Promise<FileStatsTreeItem[]> {
		if (!element) {
			// ルートレベル - 現在開いているファイルのみを返す
			return Promise.resolve(this.getOpenFileList());
		} else if (element.stats && !element.isStatsItem) {
			// ファイルノード - 統計情報を返す
			return Promise.resolve(this.getStatsForFile(element.stats));
		}
		
		return Promise.resolve([]);
	}

	private getFileList(): FileStatsTreeItem[] {
		const items: FileStatsTreeItem[] = [];
		
		for (const [filePath, stats] of this.fileStats) {
			const item = new FileStatsTreeItem(
				stats.fileName,
				vscode.TreeItemCollapsibleState.Collapsed,
				stats,
				false
			);
			items.push(item);
		}

		return items.sort((a, b) => a.label.localeCompare(b.label));
	}

	private getOpenFileList(): FileStatsTreeItem[] {
		const items: FileStatsTreeItem[] = [];
		
		// 現在開いているすべてのエディタを取得
		const openEditors = vscode.window.visibleTextEditors;
		const processedFiles = new Set<string>();

		// アクティブエディタを最初に追加
		const activeEditor = vscode.window.activeTextEditor;
		if (activeEditor && this.isMarkdownFile(activeEditor.document.fileName)) {
			const stats = this.getStatsForActiveEditor();
			if (stats) {
				const item = new FileStatsTreeItem(
					stats.fileName,
					vscode.TreeItemCollapsibleState.Expanded,  // デフォルトで開いた状態に
					stats,
					false
				);
				items.push(item);
				processedFiles.add(activeEditor.document.fileName);
			}
		}

		// その他の開いているMarkdownファイルを追加
		for (const editor of openEditors) {
			if (!processedFiles.has(editor.document.fileName) && 
				this.isMarkdownFile(editor.document.fileName)) {
				
				// リアルタイムで統計を計算
				const content = editor.document.getText();
				const contentWithoutFrontmatter = this.removeFrontmatter(content);
				
				const charCount = contentWithoutFrontmatter.length;
				const wordCount = this.countWords(contentWithoutFrontmatter);
				const lineCount = content.split('\n').length;
				const readingTime = this.calculateReadingTime(contentWithoutFrontmatter, wordCount);

				const stats: FileStats = {
					filePath: editor.document.fileName,
					fileName: path.basename(editor.document.fileName),
					charCount,
					wordCount,
					lineCount,
					readingTime,
					lastModified: new Date(),
					fileSize: Buffer.byteLength(content, 'utf8')
				};

				const item = new FileStatsTreeItem(
					stats.fileName,
					vscode.TreeItemCollapsibleState.Expanded,  // デフォルトで開いた状態に
					stats,
					false
				);
				items.push(item);
				processedFiles.add(editor.document.fileName);
			}
		}

		// 開いているファイルがない場合のメッセージ
		if (items.length === 0) {
			items.push(new FileStatsTreeItem(
				'Markdownファイルが開かれていません',
				vscode.TreeItemCollapsibleState.None,
				undefined,
				true
			));
		}

		return items;
	}

	private getStatsForFile(stats: FileStats): FileStatsTreeItem[] {
		const items: FileStatsTreeItem[] = [];

		// 読了時間
		const readingTimeText = stats.readingTime < 1 
			? `${Math.ceil(stats.readingTime * 60)}秒`
			: `${Math.ceil(stats.readingTime)}分`;
		
		// コンパクトに主要な情報だけ表示
		items.push(new FileStatsTreeItem(
			`${stats.charCount.toLocaleString()}文字 • ${readingTimeText}`,
			vscode.TreeItemCollapsibleState.None,
			stats,
			true
		));

		items.push(new FileStatsTreeItem(
			`${stats.lineCount}行 • ${this.formatFileSize(stats.fileSize)}`,
			vscode.TreeItemCollapsibleState.None,
			stats,
			true
		));

		return items;
	}

	private refreshStats(): void {
		this.fileStats.clear();
		
		if (!this.docusaurusRoot) {
			console.warn('Docusaurus root not set');
			return;
		}
		
		const contentPath = path.join(this.docusaurusRoot, this.contentType);
		if (!fs.existsSync(contentPath)) {
			// エラーメッセージを削除し、静かに失敗するようにする
			// 実際のユースケースで使用されるまで警告を出さない
			return;
		}

		this.scanDirectory(contentPath);
	}

	private scanDirectory(dirPath: string): void {
		try {
			const entries = fs.readdirSync(dirPath, { withFileTypes: true });
			
			for (const entry of entries) {
				const fullPath = path.join(dirPath, entry.name);
				
				if (entry.isDirectory() && !entry.name.startsWith('.')) {
					// サブディレクトリを再帰的にスキャン
					this.scanDirectory(fullPath);
				} else if (entry.isFile() && this.isMarkdownFile(entry.name)) {
					// Markdownファイルの統計を計算
					const stats = this.calculateFileStats(fullPath);
					if (stats) {
						this.fileStats.set(fullPath, stats);
					}
				}
			}
		} catch (error) {
			console.error('Error scanning directory:', error);
		}
	}

	private isMarkdownFile(fileName: string): boolean {
		const ext = path.extname(fileName).toLowerCase();
		return ext === '.md' || ext === '.mdx';
	}

	private calculateFileStats(filePath: string): FileStats | null {
		try {
			if (!fs.existsSync(filePath)) {
				console.warn(`File does not exist: ${filePath}`);
				return null;
			}

			const content = fs.readFileSync(filePath, 'utf8');
			const stats = fs.statSync(filePath);
			
			// フロントマターを除去したコンテンツを取得
			const contentWithoutFrontmatter = this.removeFrontmatter(content);
			
			// 基本統計を計算
			const charCount = contentWithoutFrontmatter.length;
			const wordCount = this.countWords(contentWithoutFrontmatter);
			const lineCount = content.split('\n').length;
			
			// 読了時間を計算（日本語: 400-500文字/分、英語: 200-250単語/分）
			const readingTime = this.calculateReadingTime(contentWithoutFrontmatter, wordCount);
			
			return {
				filePath,
				fileName: path.basename(filePath),
				charCount,
				wordCount,
				lineCount,
				readingTime,
				lastModified: stats.mtime,
				fileSize: stats.size
			};
		} catch (error) {
			console.error(`Error calculating stats for ${filePath}:`, error);
			return null;
		}
	}

	private removeFrontmatter(content: string): string {
		// YAMLフロントマターを除去
		const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
		return content.replace(frontmatterRegex, '');
	}

	private countWords(text: string): number {
		// 日本語と英語の単語をカウント
		// 日本語文字（ひらがな、カタカナ、漢字）
		const japaneseChars = (text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g) || []).length;
		
		// 英語の単語
		const englishWords = text
			.replace(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, ' ') // 日本語文字を空白に置換
			.split(/\s+/)
			.filter(word => word.length > 0 && /[a-zA-Z]/.test(word)).length;
		
		// 日本語文字は1文字1単語、英語は単語数でカウント
		return japaneseChars + englishWords;
	}

	private calculateReadingTime(content: string, wordCount: number): number {
		// 日本語文字数を取得
		const japaneseChars = (content.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g) || []).length;
		
		// 英語単語数（総単語数から日本語文字数を引く）
		const englishWords = Math.max(0, wordCount - japaneseChars);
		
		// 読了時間計算
		// 日本語: 450文字/分
		// 英語: 225単語/分
		const japaneseReadingTime = japaneseChars / 450;
		const englishReadingTime = englishWords / 225;
		
		return Math.max(0.1, japaneseReadingTime + englishReadingTime); // 最低0.1分
	}

	private formatFileSize(bytes: number): string {
		if (bytes === 0) {
			return '0 B';
		}
		
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		
		return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
	}

	// リソースを解放
	public dispose() {
		this.disposables.forEach(d => d.dispose());
	}

	// 現在選択されているファイルの統計を取得
	public getStatsForCurrentFile(): FileStats | null {
		const activeEditor = vscode.window.activeTextEditor;
		if (!activeEditor) {
			return null;
		}

		const filePath = activeEditor.document.fileName;
		return this.fileStats.get(filePath) || null;
	}

	// アクティブエディタの統計をリアルタイムで計算
	public getStatsForActiveEditor(): FileStats | null {
		const activeEditor = vscode.window.activeTextEditor;
		if (!activeEditor) {
			console.log('📊 No active editor');
			return null;
		}

		const document = activeEditor.document;
		console.log('📊 Checking file:', document.fileName);
		
		if (!this.isMarkdownFile(document.fileName)) {
			console.log('📊 Not a markdown file');
			return null;
		}

		console.log('📊 Processing markdown file');

		// ドキュメントの現在の内容から統計を計算
		const content = document.getText();
		const contentWithoutFrontmatter = this.removeFrontmatter(content);
		
		const charCount = contentWithoutFrontmatter.length;
		const wordCount = this.countWords(contentWithoutFrontmatter);
		const lineCount = content.split('\n').length;
		const readingTime = this.calculateReadingTime(contentWithoutFrontmatter, wordCount);

		const result = {
			filePath: document.fileName,
			fileName: path.basename(document.fileName),
			charCount,
			wordCount,
			lineCount,
			readingTime,
			lastModified: new Date(), // 現在時刻
			fileSize: Buffer.byteLength(content, 'utf8')
		};

		console.log('📊 Calculated stats:', result);
		return result;
	}

	// 全体統計を取得
	public getOverallStats(): {
		totalFiles: number;
		totalCharacters: number;
		totalWords: number;
		totalReadingTime: number;
		averageReadingTime: number;
	} {
		let totalCharacters = 0;
		let totalWords = 0;
		let totalReadingTime = 0;
		const totalFiles = this.fileStats.size;

		for (const stats of this.fileStats.values()) {
			totalCharacters += stats.charCount;
			totalWords += stats.wordCount;
			totalReadingTime += stats.readingTime;
		}

		return {
			totalFiles,
			totalCharacters,
			totalWords,
			totalReadingTime,
			averageReadingTime: totalFiles > 0 ? totalReadingTime / totalFiles : 0
		};
	}
}
