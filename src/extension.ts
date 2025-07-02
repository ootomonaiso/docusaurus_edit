// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { DocusaurusTreeDataProvider } from './treeView';
import { DocusaurusTreeDragAndDropController } from './dragAndDrop';
import { GitHandler } from './gitHandler';
import { NewFileHandler } from './newFileHandler';
import { DocusaurusCompletionProvider } from './completionProvider';
import { DocusaurusPreviewProvider } from './previewProvider';
import { CategoryHandler } from './categoryHandler';
import { MarkdownTemplateProvider } from './markdownTemplates';
import { FileStatsProvider } from './fileStatsProvider';
import * as path from 'path';
import * as fs from 'fs';

let treeDataProvider: DocusaurusTreeDataProvider | undefined;
let treeView: vscode.TreeView<any> | undefined;
let fileStatsProvider: FileStatsProvider | undefined;
let fileStatsTreeView: vscode.TreeView<any> | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;
let currentDocusaurusRoot: string | undefined;
let currentContentType: 'docs' | 'blog' = 'docs';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	console.log('Activating Docusaurus Editor extension...');

	const workspaceRoot = vscode.workspace.rootPath;
	if (!workspaceRoot) {
		vscode.window.showErrorMessage('Docusaurus Editor: No workspace folder found');
		return;
	}

	// Try to auto-detect Docusaurus project
	const autoDetectedRoot = findDocusaurusRoot(workspaceRoot);
	if (autoDetectedRoot) {
		initializeExtension(context, autoDetectedRoot);
	}

	// Register manual activation commands
	const setDocusaurusRootCommand = vscode.commands.registerCommand('docusaurus-editor.setDocusaurusRoot', async (uri: vscode.Uri) => {
		if (uri && uri.fsPath) {
			const folderPath = uri.fsPath;
			
			// Check if this folder contains docusaurus config
			if (isDocusaurusFolder(folderPath)) {
				await initializeExtension(context, folderPath);
				vscode.window.showInformationMessage(`Docusaurus Editor activated for: ${path.basename(folderPath)}`);
			} else {
				vscode.window.showWarningMessage('No Docusaurus configuration found in this folder');
			}
		}
	});

	const enableForFolderCommand = vscode.commands.registerCommand('docusaurus-editor.enableForFolder', async (uri: vscode.Uri) => {
		if (uri && uri.fsPath) {
			const folderPath = uri.fsPath;
			
			// Force enable even without config file
			await initializeExtension(context, folderPath);
			vscode.window.showInformationMessage(`Docusaurus Editor enabled for: ${path.basename(folderPath)}`);
		}
	});

	context.subscriptions.push(setDocusaurusRootCommand, enableForFolderCommand);

	console.log('Docusaurus Editor extension setup completed');
}

async function initializeExtension(context: vscode.ExtensionContext, docusaurusRoot: string) {
	console.log('🚀 Initializing extension for:', docusaurusRoot);
	
	// Dispose existing tree view if any
	if (treeView) {
		console.log('📤 Disposing existing tree view');
		treeView.dispose();
	}
	
	if (fileStatsTreeView) {
		console.log('📤 Disposing existing file stats tree view');
		fileStatsTreeView.dispose();
	}

	currentDocusaurusRoot = docusaurusRoot;

	// Set context to show tree view
	console.log('⚙️ Setting context docusaurus.enabled = true');
	await vscode.commands.executeCommand('setContext', 'docusaurus.enabled', true);

	// Initialize components
	console.log('🌳 Creating TreeDataProvider');
	treeDataProvider = new DocusaurusTreeDataProvider(docusaurusRoot);
	
	console.log('🎯 Creating DragAndDropController');
	const dragController = new DocusaurusTreeDragAndDropController();
	
	console.log('📝 Creating GitHandler');
	const gitHandler = new GitHandler(docusaurusRoot);
	
	console.log('📄 Creating NewFileHandler');
	const newFileHandler = new NewFileHandler(docusaurusRoot, currentContentType);

	console.log('📁 Creating CategoryHandler');
	const categoryHandler = new CategoryHandler(docusaurusRoot, currentContentType);

	console.log('📊 Creating FileStatsProvider');
	fileStatsProvider = new FileStatsProvider(docusaurusRoot, currentContentType);

	// Create status bar item for current file stats
	console.log('📊 Creating Status Bar Item');
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.command = 'docusaurus-editor.showCurrentFileStats';
	statusBarItem.tooltip = 'クリックで詳細統計を表示';
	updateStatusBarStats();

	// Create completion and preview providers
	console.log('💬 Creating Docusaurus Completion Provider');
	const completionProvider = new DocusaurusCompletionProvider();
	
	console.log('👁️ Creating Docusaurus Preview Provider');
	const previewProvider = new DocusaurusPreviewProvider(context);

	// Register tree view
	console.log('🔧 Creating TreeView');
	treeView = vscode.window.createTreeView('docusaurusExplorer', {
		treeDataProvider,
		dragAndDropController: dragController,
		canSelectMany: false
	});

	// Register file stats tree view
	console.log('📊 Creating File Stats TreeView');
	fileStatsTreeView = vscode.window.createTreeView('docusaurusFileStats', {
		treeDataProvider: fileStatsProvider,
		canSelectMany: false
	});

	// Set initial tree view title
	treeView.title = `📚 Docs Explorer`;
	fileStatsTreeView.title = `📊 ファイル統計`;

	console.log('✅ TreeView created successfully');

	// Register commands
	const refreshCommand = vscode.commands.registerCommand('docusaurus-editor.refreshExplorer', () => {
		if (treeDataProvider) {
			treeDataProvider.refresh();
			vscode.window.showInformationMessage('Docusaurus Explorer refreshed');
		}
	});

	const createNewDocCommand = vscode.commands.registerCommand('docusaurus-editor.createNewDoc', async (item: any) => {
		const targetFolder = item ? item.filePath : undefined;
		await newFileHandler.createNewDocument(targetFolder);
	});

	const editDocCommand = vscode.commands.registerCommand('docusaurus-editor.editDoc', (item: any) => {
		if (item && item.filePath) {
			vscode.commands.executeCommand('vscode.open', vscode.Uri.file(item.filePath));
		}
	});

	const gitCommitCommand = vscode.commands.registerCommand('docusaurus-editor.gitCommit', async () => {
		await gitHandler.commitAndPush();
	});

	const createPullRequestCommand = vscode.commands.registerCommand('docusaurus-editor.createPullRequest', async () => {
		await gitHandler.createPullRequest();
	});

	// Register category commands
	const createCategoryCommand = vscode.commands.registerCommand('docusaurus-editor.createCategory', async (item: any) => {
		const targetFolder = item ? item.filePath : undefined;
		await categoryHandler.createNewCategory(targetFolder);
	});

	const editCategoryCommand = vscode.commands.registerCommand('docusaurus-editor.editCategory', async (item: any) => {
		if (item && item.filePath) {
			await categoryHandler.editCategorySettings(item.filePath);
		}
	});

	const deleteCategoryCommand = vscode.commands.registerCommand('docusaurus-editor.deleteCategory', async (item: any) => {
		if (item && item.filePath) {
			await categoryHandler.deleteCategory(item.filePath);
		}
	});

	// Register file stats commands
	const refreshStatsCommand = vscode.commands.registerCommand('docusaurus-editor.refreshFileStats', () => {
		if (fileStatsProvider) {
			fileStatsProvider.refresh();
			vscode.window.showInformationMessage('ファイル統計を更新しました');
		}
	});

	const showOverallStatsCommand = vscode.commands.registerCommand('docusaurus-editor.showOverallStats', () => {
		if (fileStatsProvider) {
			const stats = fileStatsProvider.getOverallStats();
			const message = `📊 全体統計\n` +
				`ファイル数: ${stats.totalFiles}\n` +
				`総文字数: ${stats.totalCharacters.toLocaleString()}\n` +
				`総単語数: ${stats.totalWords.toLocaleString()}\n` +
				`総読了時間: ${Math.ceil(stats.totalReadingTime)}分\n` +
				`平均読了時間: ${Math.ceil(stats.averageReadingTime)}分`;
			
			vscode.window.showInformationMessage(message);
		}
	});

	const showCurrentFileStatsCommand = vscode.commands.registerCommand('docusaurus-editor.showCurrentFileStats', () => {
		if (fileStatsProvider) {
			// アクティブエディタの統計をリアルタイムで取得
			const stats = fileStatsProvider.getStatsForActiveEditor();
			if (stats) {
				const readingTimeText = stats.readingTime < 1 
					? `${Math.ceil(stats.readingTime * 60)}秒`
					: `${Math.ceil(stats.readingTime)}分`;
				
				const message = `📊 ${stats.fileName} の統計\n` +
					`文字数: ${stats.charCount.toLocaleString()}\n` +
					`単語数: ${stats.wordCount.toLocaleString()}\n` +
					`行数: ${stats.lineCount.toLocaleString()}\n` +
					`読了時間: ${readingTimeText}\n` +
					`ファイルサイズ: ${(stats.fileSize / 1024).toFixed(1)} KB`;
				
				vscode.window.showInformationMessage(message);
			} else {
				vscode.window.showWarningMessage('現在開いているファイルはMarkdownファイルではありません');
			}
		}
	});

	// Register Docusaurus-specific providers
	const markdownCompletionProvider = vscode.languages.registerCompletionItemProvider(
		{ scheme: 'file', language: 'markdown' },
		completionProvider,
		':', '<', '`'
	);

	const mdxCompletionProvider = vscode.languages.registerCompletionItemProvider(
		{ scheme: 'file', language: 'mdx' },
		completionProvider,
		':', '<', '`'
	);

	// Register preview provider
	const previewProviderRegistration = vscode.workspace.registerTextDocumentContentProvider(
		'docusaurus-preview',
		previewProvider	);

	// Create Markdown Template Provider
	console.log('📝 Creating Markdown Template Provider');
	const markdownTemplateProvider = new MarkdownTemplateProvider();
	
	// Register Markdown template commands
	const insertHeadingCommand = vscode.commands.registerCommand('docusaurus-editor.insertHeading', async () => {
		await markdownTemplateProvider.insertHeading();
	});
	
	const insertListCommand = vscode.commands.registerCommand('docusaurus-editor.insertList', async () => {
		await markdownTemplateProvider.insertList();
	});
	
	const insertCodeBlockCommand = vscode.commands.registerCommand('docusaurus-editor.insertCodeBlock', async () => {
		await markdownTemplateProvider.insertCodeBlock();
	});
	
	const insertAdmonitionCommand = vscode.commands.registerCommand('docusaurus-editor.insertAdmonition', async () => {
		await markdownTemplateProvider.insertAdmonition();
	});
	
	const insertTableCommand = vscode.commands.registerCommand('docusaurus-editor.insertTable', async () => {
		await markdownTemplateProvider.insertTable();
	});
	
	const insertLinkCommand = vscode.commands.registerCommand('docusaurus-editor.insertLink', async () => {
		await markdownTemplateProvider.insertLink();
	});
	
	const insertImageCommand = vscode.commands.registerCommand('docusaurus-editor.insertImage', async () => {
		await markdownTemplateProvider.insertImage();
	});

	// Register preview command
	const previewCommand = vscode.commands.registerCommand('docusaurus-editor.showPreview', async () => {
		const activeEditor = vscode.window.activeTextEditor;
		if (!activeEditor) {
			vscode.window.showErrorMessage('アクティブなエディターがありません');
			return;
		}

		const document = activeEditor.document;
		if (document.languageId !== 'markdown' && document.languageId !== 'mdx') {
			vscode.window.showErrorMessage('Markdownファイルを開いてください');
			return;
		}

		// Create webview panel for preview
		const panel = vscode.window.createWebviewPanel(
			'docusaurusPreview',
			`Preview: ${path.basename(document.fileName)}`,
			vscode.ViewColumn.Beside,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [
					vscode.Uri.file(path.dirname(document.fileName)),
					vscode.Uri.file(docusaurusRoot),
					...(vscode.workspace.workspaceFolders || []).map(folder => folder.uri)
				]
			}
		);

		// Generate and set webview content
		const content = previewProvider.generateWebViewContent(document, panel.webview);
		panel.webview.html = content;

		// Update preview when document changes
		const changeSubscription = vscode.workspace.onDidChangeTextDocument((e: vscode.TextDocumentChangeEvent) => {
			if (e.document === document) {
				const updatedContent = previewProvider.generateWebViewContent(document, panel.webview);
				panel.webview.html = updatedContent;
			}
		});

		// Clean up when panel is disposed
		panel.onDidDispose(() => {
			changeSubscription.dispose();
		});
	});

	// Register refresh preview command
	const refreshPreviewCommand = vscode.commands.registerCommand('docusaurus-editor.refreshPreview', () => {
		previewProvider.refresh();
		vscode.window.showInformationMessage('Docusaurus プレビューを更新しました');
	});

	// Register content type switching commands
	const switchToDocsCommand = vscode.commands.registerCommand('docusaurus-editor.switchToDocs', async () => {
		currentContentType = 'docs';
		if (treeDataProvider && treeView) {
			treeDataProvider.setContentType('docs');
			treeDataProvider.refresh();
			categoryHandler.setContentType('docs');
			newFileHandler.setContentType('docs');
			if (fileStatsProvider) {
				fileStatsProvider.setContentType('docs');
			}
			treeView.title = `📚 Docs Explorer`;
			vscode.window.showInformationMessage('Switched to Docs view');
		}
	});

	const switchToBlogCommand = vscode.commands.registerCommand('docusaurus-editor.switchToBlog', async () => {
		currentContentType = 'blog';
		if (treeDataProvider && treeView) {
			treeDataProvider.setContentType('blog');
			treeDataProvider.refresh();
			categoryHandler.setContentType('blog');
			newFileHandler.setContentType('blog');
			if (fileStatsProvider) {
				fileStatsProvider.setContentType('blog');
			}
			treeView.title = `📝 Blog Explorer`;
			vscode.window.showInformationMessage('Switched to Blog view');
		}
	});

	const toggleContentTypeCommand = vscode.commands.registerCommand('docusaurus-editor.toggleContentType', async () => {
		currentContentType = currentContentType === 'docs' ? 'blog' : 'docs';
		if (treeDataProvider && treeView) {
			treeDataProvider.setContentType(currentContentType);
			treeDataProvider.refresh();
			categoryHandler.setContentType(currentContentType);
			newFileHandler.setContentType(currentContentType);
			if (fileStatsProvider) {
				fileStatsProvider.setContentType(currentContentType);
			}
			const titleEmoji = currentContentType === 'docs' ? '📚' : '📝';
			const titleText = currentContentType === 'docs' ? 'Docs' : 'Blog';
			treeView.title = `${titleEmoji} ${titleText} Explorer`;
			vscode.window.showInformationMessage(`Switched to ${currentContentType.charAt(0).toUpperCase() + currentContentType.slice(1)} view`);
		}
	});

	// Add to subscriptions
	context.subscriptions.push(
		treeView,
		fileStatsTreeView,
		statusBarItem,
		refreshCommand,
		createNewDocCommand,
		editDocCommand,
		gitCommitCommand,
		createPullRequestCommand,
		createCategoryCommand,
		editCategoryCommand,
		deleteCategoryCommand,
		refreshStatsCommand,
		showOverallStatsCommand,
		showCurrentFileStatsCommand,
		markdownCompletionProvider,
		mdxCompletionProvider,
		previewProviderRegistration,
		previewCommand,
		refreshPreviewCommand,
		switchToDocsCommand,
		switchToBlogCommand,
		toggleContentTypeCommand,
		insertHeadingCommand,
		insertListCommand,
		insertCodeBlockCommand,
		insertAdmonitionCommand,
		insertTableCommand,
		insertLinkCommand,
		insertImageCommand
	);

	// エディタの変更を監視してステータスバーを更新
	const activeEditorChangeDisposable = vscode.window.onDidChangeActiveTextEditor(() => {
		updateStatusBarStats();
	});
	
	const documentChangeDisposable = vscode.workspace.onDidChangeTextDocument(() => {
		updateStatusBarStats();
	});

	context.subscriptions.push(activeEditorChangeDisposable, documentChangeDisposable);

	console.log(`Docusaurus Editor initialized for: ${docusaurusRoot}`);
}

function updateStatusBarStats() {
	if (!statusBarItem || !fileStatsProvider) {
		return;
	}

	const stats = fileStatsProvider.getStatsForActiveEditor();
	if (stats) {
		const readingTime = stats.readingTime < 1 
			? `${Math.ceil(stats.readingTime * 60)}秒`
			: `${Math.ceil(stats.readingTime)}分`;
		
		statusBarItem.text = `$(file-text) ${stats.charCount}文字 • ${readingTime}`;
		statusBarItem.show();
	} else {
		statusBarItem.hide();
	}
}

function findDocusaurusRoot(workspaceRoot: string): string | undefined {
	// Check workspace root first
	if (isDocusaurusFolder(workspaceRoot)) {
		return workspaceRoot;
	}

	// Search in subdirectories
	try {
		const entries = fs.readdirSync(workspaceRoot, { withFileTypes: true });
		
		for (const entry of entries) {
			if (entry.isDirectory() && !entry.name.startsWith('.')) {
				const subPath = path.join(workspaceRoot, entry.name);
				if (isDocusaurusFolder(subPath)) {
					return subPath;
				}
			}
		}
	} catch (error) {
		console.error('Error searching for Docusaurus root:', error);
	}

	return undefined;
}

function isDocusaurusFolder(folderPath: string): boolean {
	// Check for docusaurus.config.js or docusaurus.config.ts
	const configFiles = [
		path.join(folderPath, 'docusaurus.config.js'),
		path.join(folderPath, 'docusaurus.config.ts')
	];

	for (const configFile of configFiles) {
		if (fs.existsSync(configFile)) {
			return true;
		}
	}

	// Also check for package.json with @docusaurus dependencies
	const packageJsonPath = path.join(folderPath, 'package.json');
	if (fs.existsSync(packageJsonPath)) {
		try {
			const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
			const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
			
			return Object.keys(dependencies).some(dep => dep.startsWith('@docusaurus/'));
		} catch (error) {
			console.error('Error reading package.json:', error);
		}
	}

	return false;
}

function checkDocusaurusProject(workspaceRoot: string): boolean {
	return findDocusaurusRoot(workspaceRoot) !== undefined;
}

// This method is called when your extension is deactivated
export function deactivate() {
	if (treeView) {
		treeView.dispose();
	}
	if (fileStatsTreeView) {
		fileStatsTreeView.dispose();
	}
	if (statusBarItem) {
		statusBarItem.dispose();
	}
	console.log('Docusaurus Editor extension deactivated');
}
