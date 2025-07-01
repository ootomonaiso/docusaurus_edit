// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { DocusaurusTreeDataProvider } from './treeView';
import { DocusaurusTreeDragAndDropController } from './dragAndDrop';
import { GitHandler } from './gitHandler';
import { NewFileHandler } from './newFileHandler';
import { DocusaurusCompletionProvider } from './completionProvider';
import { DocusaurusPreviewProvider } from './previewProvider';
import * as path from 'path';
import * as fs from 'fs';

let treeDataProvider: DocusaurusTreeDataProvider | undefined;
let treeView: vscode.TreeView<any> | undefined;
let currentDocusaurusRoot: string | undefined;

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
	const newFileHandler = new NewFileHandler(docusaurusRoot);

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

	console.log('✅ TreeView created successfully');

	// Register commands
	const refreshCommand = vscode.commands.registerCommand('docusaurus-editor.refreshExplorer', () => {
		if (treeDataProvider) {
			treeDataProvider.refresh();
			vscode.window.showInformationMessage('Docusaurus Explorer refreshed');
		}
	});

	const createNewDocCommand = vscode.commands.registerCommand('docusaurus-editor.createNewDoc', async (item) => {
		const targetFolder = item ? item.filePath : undefined;
		await newFileHandler.createNewDocument(targetFolder);
	});

	const editDocCommand = vscode.commands.registerCommand('docusaurus-editor.editDoc', (item) => {
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
		previewProvider
	);

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
				retainContextWhenHidden: true
			}
		);

		// Generate and set webview content
		const content = previewProvider.provideTextDocumentContent(
			vscode.Uri.parse(`docusaurus-preview://preview?${document.uri.toString()}`)
		);
		panel.webview.html = content;

		// Update preview when document changes
		const changeSubscription = vscode.workspace.onDidChangeTextDocument((e: vscode.TextDocumentChangeEvent) => {
			if (e.document === document) {
				const updatedContent = previewProvider.provideTextDocumentContent(
					vscode.Uri.parse(`docusaurus-preview://preview?${document.uri.toString()}`)
				);
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

	// Add to subscriptions
	context.subscriptions.push(
		treeView,
		refreshCommand,
		createNewDocCommand,
		editDocCommand,
		gitCommitCommand,
		createPullRequestCommand,
		markdownCompletionProvider,
		mdxCompletionProvider,
		previewProviderRegistration,
		previewCommand,
		refreshPreviewCommand
	);

	console.log(`Docusaurus Editor initialized for: ${docusaurusRoot}`);
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
	console.log('Docusaurus Editor extension deactivated');
}
