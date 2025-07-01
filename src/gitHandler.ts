import * as vscode from 'vscode';
import simpleGit, { SimpleGit } from 'simple-git';
import * as path from 'path';

export class GitHandler {
    private git: SimpleGit;

    constructor(private workspaceRoot: string) {
        this.git = simpleGit(workspaceRoot);
    }

    async isGitRepository(): Promise<boolean> {
        try {
            await this.git.status();
            return true;
        } catch (error) {
            return false;
        }
    }

    async initializeGit(): Promise<void> {
        try {
            await this.git.init();
            vscode.window.showInformationMessage('Git repository initialized');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to initialize Git: ${error}`);
            throw error;
        }
    }

    async addAndCommit(): Promise<void> {
        try {
            const message = await vscode.window.showInputBox({
                prompt: 'Enter commit message',
                placeHolder: 'Update documentation',
                value: 'Update documentation'
            });

            if (!message) {
                return;
            }

            // Add all changes
            await this.git.add('.');
            
            // Commit
            await this.git.commit(message);
            
            vscode.window.showInformationMessage(`Committed: ${message}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to commit: ${error}`);
            throw error;
        }
    }

    async push(): Promise<void> {
        try {
            const status = await this.git.status();
            const currentBranch = status.current;

            if (!currentBranch) {
                vscode.window.showErrorMessage('No current branch found');
                return;
            }

            // Try to push
            await this.git.push('origin', currentBranch);
            
            vscode.window.showInformationMessage(`Pushed to origin/${currentBranch}`);
        } catch (error) {
            // If push fails, might need to set upstream
            try {
                const status = await this.git.status();
                const currentBranch = status.current;
                
                if (currentBranch) {
                    await this.git.push(['-u', 'origin', currentBranch]);
                    vscode.window.showInformationMessage(`Pushed and set upstream: origin/${currentBranch}`);
                }
            } catch (upstreamError) {
                vscode.window.showErrorMessage(`Failed to push: ${error}`);
                throw error;
            }
        }
    }

    async commitAndPush(): Promise<void> {
        try {
            if (!(await this.isGitRepository())) {
                const shouldInit = await vscode.window.showQuickPick(['Yes', 'No'], {
                    placeHolder: 'No Git repository found. Initialize one?'
                });
                
                if (shouldInit === 'Yes') {
                    await this.initializeGit();
                } else {
                    return;
                }
            }

            await this.addAndCommit();
            await this.push();
            
        } catch (error) {
            console.error('Git operation failed:', error);
        }
    }

    async createPullRequest(): Promise<void> {
        try {
            const remotes = await this.git.getRemotes(true);
            const originRemote = remotes.find(remote => remote.name === 'origin');
            
            if (!originRemote) {
                vscode.window.showErrorMessage('No origin remote found');
                return;
            }

            // Extract repository info from remote URL
            const repoInfo = this.parseGitHubUrl(originRemote.refs.push || originRemote.refs.fetch);
            
            if (!repoInfo) {
                vscode.window.showErrorMessage('Could not parse GitHub repository information');
                return;
            }

            const status = await this.git.status();
            const currentBranch = status.current;

            if (!currentBranch || currentBranch === 'main' || currentBranch === 'master') {
                vscode.window.showErrorMessage('Please create a feature branch before creating a pull request');
                return;
            }

            // Open GitHub PR creation page
            const prUrl = `https://github.com/${repoInfo.owner}/${repoInfo.repo}/compare/${currentBranch}?expand=1`;
            vscode.env.openExternal(vscode.Uri.parse(prUrl));
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create pull request: ${error}`);
        }
    }

    private parseGitHubUrl(url: string): { owner: string; repo: string } | null {
        // Handle both HTTPS and SSH URLs
        const httpsMatch = url.match(/github\.com[:/]([^/]+)\/([^/]+?)(\.git)?$/);
        if (httpsMatch) {
            return {
                owner: httpsMatch[1],
                repo: httpsMatch[2]
            };
        }
        return null;
    }

    async getStatus(): Promise<string> {
        try {
            const status = await this.git.status();
            const changes = [];
            
            if (status.modified.length > 0) {
                changes.push(`Modified: ${status.modified.length}`);
            }
            if (status.created.length > 0) {
                changes.push(`Added: ${status.created.length}`);
            }
            if (status.deleted.length > 0) {
                changes.push(`Deleted: ${status.deleted.length}`);
            }
            
            return changes.length > 0 ? changes.join(', ') : 'No changes';
        } catch (error) {
            return 'Not a Git repository';
        }
    }
}
