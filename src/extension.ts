// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { DocusaurusTreeDataProvider, DocusaurusTreeItem } from './treeView';
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

	// Create global status bar item (always available)
	console.log('📊 Creating Global Status Bar Item');
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.command = 'docusaurus-editor.showCurrentFileStats';
	statusBarItem.tooltip = 'クリックで詳細統計を表示';
	context.subscriptions.push(statusBarItem);

	// Create global file stats provider (always available)
	console.log('📊 Creating Global FileStatsProvider');
	fileStatsProvider = new FileStatsProvider(workspaceRoot, 'docs');

	// Setup global editor change listeners
	const activeEditorChangeDisposable = vscode.window.onDidChangeActiveTextEditor(() => {
		console.log('👁️ Active editor changed');
		updateStatusBarStats();
	});
	
	const documentChangeDisposable = vscode.workspace.onDidChangeTextDocument(() => {
		console.log('✏️ Document changed');
		updateStatusBarStats();
	});

	context.subscriptions.push(activeEditorChangeDisposable, documentChangeDisposable);

	// Initial status bar update
	updateStatusBarStats();

	// Register global commands
	const globalShowCurrentFileStatsCommand = vscode.commands.registerCommand('docusaurus-editor.showCurrentFileStats', () => {
		console.log('📊 Global showCurrentFileStats command triggered');
		if (fileStatsProvider) {
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

	context.subscriptions.push(globalShowCurrentFileStatsCommand);

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
	
	// 指定されたパスが存在するか確認
	if (!fs.existsSync(docusaurusRoot)) {
		console.warn(`指定されたDocusaurusルートが存在しません: ${docusaurusRoot}`);
		vscode.window.showWarningMessage(`指定されたDocusaurusルートが存在しません: ${docusaurusRoot}`);
		return;
	}
	
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

	// Create completion and preview providers
	console.log('💬 Creating Docusaurus Completion Provider');
	const completionProvider = new DocusaurusCompletionProvider();
	
	console.log('👁️ Creating Docusaurus Preview Provider');
	const previewProvider = new DocusaurusPreviewProvider(context);

	// Register tree view
	try {
		console.log('🔧 Creating TreeView with provider:', treeDataProvider ? 'available' : 'undefined');
		
		// 追加のチェックと初期化
		if (!treeDataProvider) {
			console.log('⚠️ TreeDataProvider is undefined, creating a new one');
			treeDataProvider = new DocusaurusTreeDataProvider(docusaurusRoot);
		}
		
		treeView = vscode.window.createTreeView('docusaurusExplorer', {
			treeDataProvider,
			dragAndDropController: dragController,
			canSelectMany: false
		});
		
		console.log('✅ Main TreeView created successfully');
	} catch (err) {
		console.error('❌ Error creating main tree view:', err);
		vscode.window.showErrorMessage('ドキュメントツリーの作成に失敗しました');
	}

	// Register file stats tree view
	try {
		console.log('📊 Creating File Stats TreeView');
		
		// 追加のチェックと初期化
		if (!fileStatsProvider) {
			console.log('⚠️ FileStatsProvider is undefined, creating a new one');
			fileStatsProvider = new FileStatsProvider(docusaurusRoot, currentContentType);
		}
		
		fileStatsTreeView = vscode.window.createTreeView('docusaurusFileStats', {
			treeDataProvider: fileStatsProvider,
			canSelectMany: false
		});
		
		console.log('✅ File Stats TreeView created successfully');
	} catch (err) {
		console.error('❌ Error creating file stats tree view:', err);
		vscode.window.showErrorMessage('ファイル統計ツリーの作成に失敗しました');
	}

	// Set initial tree view title
	if (treeView) {
		treeView.title = `📚 Docs Explorer`;
	}
	if (fileStatsTreeView) {
		fileStatsTreeView.title = `📊 ファイル統計`;
	}

	console.log('✅ TreeViews setup completed');

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

	const deleteDocCommand = vscode.commands.registerCommand('docusaurus-editor.deleteDoc', async (item: any) => {
		if (item && item.filePath) {
			const fileName = path.basename(item.filePath);
			const result = await vscode.window.showWarningMessage(
				`本当に "${fileName}" を削除しますか？この操作は元に戻せません。`,
				{ modal: true },
				'削除',
				'キャンセル'
			);
			
			if (result === '削除') {
				try {
					await vscode.workspace.fs.delete(vscode.Uri.file(item.filePath));
					vscode.window.showInformationMessage(`ドキュメント "${fileName}" を削除しました`);
					if (treeDataProvider) {
						treeDataProvider.refresh();
					}
				} catch (error) {
					console.error('Delete document error:', error);
					vscode.window.showErrorMessage(`ドキュメントの削除に失敗しました: ${error}`);
				}
			}
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
			const folderName = path.basename(item.filePath);
			const result = await vscode.window.showWarningMessage(
				`本当にカテゴリ "${folderName}" を削除しますか？\nフォルダ内のすべてのファイルも削除されます。この操作は元に戻せません。`,
				{ modal: true },
				'削除',
				'キャンセル'
			);
			
			if (result === '削除') {
				try {
					await categoryHandler.deleteCategory(item.filePath);
					if (treeDataProvider) {
						treeDataProvider.refresh();
					}
				} catch (error) {
					console.error('Delete category error:', error);
					vscode.window.showErrorMessage(`カテゴリの削除に失敗しました: ${error}`);
				}
			}
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

	// 注意: グローバルにコマンドが登録されているため、ここでは登録しない
	// 代わりにローカル関数を定義して、必要な処理を実行する
	const showCurrentFileStatsHandler = () => {
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
	};

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
	
	// Register image add command
	const addImageCommand = vscode.commands.registerCommand('docusaurus-editor.addImage', async (item: any) => {
		// 画像追加処理
		if (!item || !item.filePath) {
			vscode.window.showErrorMessage('有効な画像フォルダが選択されていません');
			return;
		}

		// 仮想Imagesフォルダの場合、実際のフォルダパスを取得
		let targetFolder = item.filePath;
		
		// Check if item is a DocusaurusTreeItem and has a docItem property
		if (item.docItem && item.docItem.label) {
			// イメージフォルダの判定方法をより柔軟に
			const isImageFolder = /^(images|img|assets|static)\s*\(\d+\)$/.test(item.docItem.label);
			if (isImageFolder) {
				// Get the actual folder path from treeDataProvider
				if (treeDataProvider) {
					const actualPath = treeDataProvider.getImagesFolderPath(item.docItem.label);
					if (actualPath) {
						targetFolder = actualPath;
					}
				}
			}
		}
		
		// ファイル選択ダイアログを表示
		const options: vscode.OpenDialogOptions = {
			canSelectMany: false,
			openLabel: '画像を選択',
			filters: {
				'Images': ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico']
			}
		};
		
		const fileUri = await vscode.window.showOpenDialog(options);
		if (fileUri && fileUri[0]) {
			// ファイル名を保持
			const fileName = path.basename(fileUri[0].fsPath);
			const targetPath = path.join(targetFolder, fileName);
			
			try {
				// ファイルが既に存在するかチェック
				if (fs.existsSync(targetPath)) {
					const overwrite = await vscode.window.showWarningMessage(
						`${fileName}は既に存在します。上書きしますか？`,
						'はい',
						'いいえ'
					);
					if (overwrite !== 'はい') {
						return;
					}
				}
				
				// ファイルコピー
				fs.copyFileSync(fileUri[0].fsPath, targetPath);
				vscode.window.showInformationMessage(`画像${fileName}を追加しました`);
				
				// ツリービューを更新
				if (treeDataProvider) {
					treeDataProvider.refresh();
				}
			} catch (error) {
				console.error('Error copying image file:', error);
				vscode.window.showErrorMessage(`画像の追加に失敗しました: ${error}`);
			}
		}
	});
	
	// Register image delete command
	const deleteImageCommand = vscode.commands.registerCommand('docusaurus-editor.deleteImage', async (item: any) => {
		// 画像削除処理
		if (!item || !item.filePath) {
			vscode.window.showErrorMessage('有効な画像ファイルが選択されていません');
			return;
		}

		const fileName = path.basename(item.filePath);
		
		// 削除前に確認ダイアログを表示
		const confirmation = await vscode.window.showWarningMessage(
			`画像"${fileName}"を削除してもよろしいですか？`,
			'はい',
			'いいえ'
		);
		
		if (confirmation !== 'はい') {
			return;
		}
		
		try {
			// ファイル削除
			fs.unlinkSync(item.filePath);
			vscode.window.showInformationMessage(`画像"${fileName}"を削除しました`);
			
			// ツリービューを更新
			if (treeDataProvider) {
				treeDataProvider.refresh();
			}
		} catch (error) {
			console.error('Error deleting image file:', error);
			vscode.window.showErrorMessage(`画像の削除に失敗しました: ${error}`);
		}
	});
	
	// Register image folder delete command
	const deleteImageFolderCommand = vscode.commands.registerCommand('docusaurus-editor.deleteImageFolder', async (item: any) => {
		// 画像フォルダ削除処理
		if (!item || !item.filePath) {
			vscode.window.showErrorMessage('有効な画像フォルダが選択されていません');
			return;
		}

		let folderPath = item.filePath;
		const folderName = path.basename(folderPath);
		
		// Check if item is a DocusaurusTreeItem and has a docItem property
		if (item.docItem && item.docItem.label) {
			// イメージフォルダの判定方法をより柔軟に
			const isImageFolder = /^(images|img|assets|static)\s*\(\d+\)$/.test(item.docItem.label);
			if (isImageFolder) {
				// Get the actual folder path from treeDataProvider
				if (treeDataProvider) {
					const actualPath = treeDataProvider.getImagesFolderPath(item.docItem.label);
					if (actualPath) {
						folderPath = actualPath;
					}
				}
			}
		}
		
		// フォルダ内のファイル数をチェック
		try {
			const files = fs.readdirSync(folderPath);
			const fileCount = files.length;
			
			// 削除前に確認ダイアログを表示
			const confirmation = await vscode.window.showWarningMessage(
				`画像フォルダ"${folderName}"とその中の${fileCount}個のファイルを削除してもよろしいですか？`,
				'はい',
				'いいえ'
			);
			
			if (confirmation !== 'はい') {
				return;
			}
			
			// フォルダ内のファイルをすべて削除
			for (const file of files) {
				const filePath = path.join(folderPath, file);
				try {
					if (fs.statSync(filePath).isFile()) {
						fs.unlinkSync(filePath);
					} else if (fs.statSync(filePath).isDirectory()) {
						// サブフォルダがある場合は再帰的に削除
						fs.rmdirSync(filePath, { recursive: true });
					}
				} catch (err) {
					console.error(`Error deleting file ${filePath}:`, err);
				}
			}
			
			// 空になったフォルダを削除
			fs.rmdirSync(folderPath);
			vscode.window.showInformationMessage(`画像フォルダ"${folderName}"を削除しました`);
			
			// ツリービューを更新
			if (treeDataProvider) {
				treeDataProvider.refresh();
			}
		} catch (error) {
			console.error('Error deleting image folder:', error);
			vscode.window.showErrorMessage(`画像フォルダの削除に失敗しました: ${error}`);
		}
	});
	
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
	
	const insertTabsCommand = vscode.commands.registerCommand('docusaurus-editor.insertTabs', async () => {
		await markdownTemplateProvider.insertTabs();
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

		const panel = vscode.window.createWebviewPanel(
			'docusaurusPreview',
			`Preview: ${path.basename(document.fileName)}`,
			vscode.ViewColumn.Beside,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [
					vscode.Uri.file(path.dirname(document.fileName)),
					...(docusaurusRoot ? [vscode.Uri.file(docusaurusRoot)] : []),
					...(vscode.workspace.workspaceFolders || []).map(folder => folder.uri)
				]
			}
		);

		const content = previewProvider.generateWebViewContent(document, panel.webview);
		panel.webview.html = content;

		const changeSubscription = vscode.workspace.onDidChangeTextDocument((e: vscode.TextDocumentChangeEvent) => {
			if (e.document === document) {
				const updatedContent = previewProvider.generateWebViewContent(document, panel.webview);
				panel.webview.html = updatedContent;
			}
		});

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

	// Add folder deletion command
	const deleteFolderCommand = vscode.commands.registerCommand('docusaurus-editor.deleteFolder', async (uri: vscode.Uri) => {
		if (uri && uri.fsPath) {
			const folderPath = uri.fsPath;
			const confirmation = await vscode.window.showWarningMessage(
				`⚠️ フォルダ "${path.basename(folderPath)}" を削除しますか？この操作は元に戻せません。`,
				{ modal: true },
				'🗑️ はい、削除する'
			);

			if (confirmation === '🗑️ はい、削除する') {
				try {
					fs.rmdirSync(folderPath, { recursive: true });
					vscode.window.showInformationMessage(`✅ フォルダ "${path.basename(folderPath)}" を削除しました`);
					treeDataProvider?.refresh();
				} catch (error) {
					vscode.window.showErrorMessage(`❌ フォルダの削除に失敗しました: ${error}`);
				}
			}
		}
	});

	// Add file deletion command
	const deleteFileCommand = vscode.commands.registerCommand('docusaurus-editor.deleteFile', async (uri: vscode.Uri) => {
		if (uri && uri.fsPath) {
			const filePath = uri.fsPath;
			const confirmation = await vscode.window.showWarningMessage(
				`⚠️ ファイル "${path.basename(filePath)}" を削除しますか？この操作は元に戻せません。`,
				{ modal: true },
				'🗑️ はい、削除する'
			);

			if (confirmation === '🗑️ はい、削除する') {
				try {
					fs.unlinkSync(filePath);
					vscode.window.showInformationMessage(`✅ ファイル "${path.basename(filePath)}" を削除しました`);
					treeDataProvider?.refresh();
				} catch (error) {
					vscode.window.showErrorMessage(`❌ ファイルの削除に失敗しました: ${error}`);
				}
			}
		}
	});

	// Add to subscriptions
	context.subscriptions.push(
		...(treeView ? [treeView] : []),
		...(fileStatsTreeView ? [fileStatsTreeView] : []),
		...(statusBarItem ? [statusBarItem] : []),
		refreshCommand,
		createNewDocCommand,
		editDocCommand,
		deleteDocCommand,
		gitCommitCommand,
		createPullRequestCommand,
		createCategoryCommand,
		editCategoryCommand,
		deleteCategoryCommand,
		refreshStatsCommand,
		showOverallStatsCommand,
		// showCurrentFileStatsCommandはグローバルに登録済み
		markdownCompletionProvider,
		mdxCompletionProvider,
		previewProviderRegistration,
		previewCommand,
		refreshPreviewCommand,
		switchToDocsCommand,
		switchToBlogCommand,
		toggleContentTypeCommand,
		addImageCommand,
		deleteImageCommand,
		deleteImageFolderCommand,
		insertHeadingCommand,
		insertListCommand,
		insertCodeBlockCommand,
		insertAdmonitionCommand,
		insertTabsCommand,
		insertLinkCommand,
		insertImageCommand,
		deleteFolderCommand,
		deleteFileCommand
	);

	console.log(`Docusaurus Editor initialized for: ${docusaurusRoot}`);
}

function updateStatusBarStats() {
	console.log('📊 updateStatusBarStats called');
	
	if (!statusBarItem) {
		console.log('❌ statusBarItem is undefined');
		return;
	}
	
	if (!fileStatsProvider) {
		console.log('❌ fileStatsProvider is undefined');
		return;
	}

	const activeEditor = vscode.window.activeTextEditor;
	console.log('📝 Active editor:', activeEditor ? activeEditor.document.fileName : 'none');

	const stats = fileStatsProvider.getStatsForActiveEditor();
	console.log('📊 Stats result:', stats);
	
	if (stats) {
		const readingTime = stats.readingTime < 1 
			? `${Math.ceil(stats.readingTime * 60)}秒`
			: `${Math.ceil(stats.readingTime)}分`;
		
		const statusText = `$(file-text) ${stats.charCount}文字 • ${readingTime}`;
		console.log('📊 Setting status bar text:', statusText);
		
		statusBarItem.text = statusText;
		statusBarItem.show();
	} else {
		console.log('📊 No stats, hiding status bar');
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
	if (fileStatsProvider) {
		fileStatsProvider.dispose();
	}
	console.log('Docusaurus Editor extension deactivated');
}

//# sourceMappingURL=extension.js.map
