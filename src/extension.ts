// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { DocusaurusTreeDataProvider } from './treeView';
import { DocusaurusTreeDragAndDropController } from './dragAndDrop';
import { GitHandler } from './gitHandler';
import { NewFileHandler } from './newFileHandler';
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

	// Add to subscriptions
	context.subscriptions.push(
		treeView,
		refreshCommand,
		createNewDocCommand,
		editDocCommand,
		gitCommitCommand,
		createPullRequestCommand
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
