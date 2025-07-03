#!/usr/bin/env node

/**
 * リリースノート自動生成スクリプト
 * 
 * このスクリプトは以下の機能を提供します：
 * - Conventional Commits形式のコミットメッセージ解析
 * - CHANGELOG.mdからの既存リリースノート抽出
 * - コミット種別による自動分類
 * - 貢献者情報の取得
 * - プルリクエスト情報の抽出
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 設定
const CONFIG = {
  commitTypes: {
    feat: { title: '🚀 新機能・機能追加', keywords: ['feat', 'add', '新機能'] },
    fix: { title: '🐛 バグ修正', keywords: ['fix', 'bug', '修正'] },
    docs: { title: '📖 ドキュメント', keywords: ['docs', 'doc', 'ドキュメント'] },
    style: { title: '💄 スタイル', keywords: ['style', 'format', 'スタイル'] },
    refactor: { title: '♻️ リファクタリング', keywords: ['refactor', 'リファクタ'] },
    perf: { title: '⚡ パフォーマンス', keywords: ['perf', 'performance', 'パフォーマンス'] },
    test: { title: '✅ テスト', keywords: ['test', 'テスト'] },
    chore: { title: '🔧 その他', keywords: ['chore', 'その他'] }
  },
  excludePatterns: ['merge', 'マージ', 'wip', 'work in progress']
};

/**
 * Gitコマンドを実行してコミット情報を取得
 */
function getCommits(range) {
  try {
    const output = execSync(`git log ${range} --pretty=format:"%H|%s|%an|%ae|%ad" --date=short`, { encoding: 'utf8' });
    return output.trim().split('\n').filter(line => line).map(line => {
      const [hash, subject, author, email, date] = line.split('|');
      return { hash, subject, author, email, date };
    });
  } catch (error) {
    console.warn('Failed to get commits:', error.message);
    return [];
  }
}

/**
 * 前回のタグを取得
 */
function getPreviousTag() {
  try {
    return execSync('git describe --tags --abbrev=0 HEAD~1', { encoding: 'utf8' }).trim();
  } catch (error) {
    console.warn('No previous tag found');
    return null;
  }
}

/**
 * プルリクエスト番号を抽出
 */
function extractPullRequests(commits) {
  const prNumbers = new Set();
  commits.forEach(commit => {
    const matches = commit.subject.match(/#(\d+)/g);
    if (matches) {
      matches.forEach(match => prNumbers.add(match));
    }
  });
  return Array.from(prNumbers).sort();
}

/**
 * コミットを種別ごとに分類
 */
function categorizeCommits(commits) {
  const categories = {};
  const uncategorized = [];

  commits.forEach(commit => {
    const subject = commit.subject.toLowerCase();
    
    // 除外パターンをチェック
    if (CONFIG.excludePatterns.some(pattern => subject.includes(pattern))) {
      return;
    }

    let categorized = false;
    
    for (const [type, config] of Object.entries(CONFIG.commitTypes)) {
      if (config.keywords.some(keyword => subject.includes(keyword))) {
        if (!categories[type]) {
          categories[type] = [];
        }
        categories[type].push(commit);
        categorized = true;
        break;
      }
    }

    if (!categorized) {
      uncategorized.push(commit);
    }
  });

  return { categories, uncategorized };
}

/**
 * 貢献者リストを生成
 */
function getContributors(commits) {
  const contributors = new Map();
  commits.forEach(commit => {
    const key = `${commit.author} <${commit.email}>`;
    if (!contributors.has(key)) {
      contributors.set(key, { name: commit.author, email: commit.email, count: 0 });
    }
    contributors.get(key).count++;
  });
  
  return Array.from(contributors.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

/**
 * CHANGELOG.mdから既存のリリースノートを取得
 */
function getChangelogContent(version) {
  const changelogPath = path.join(process.cwd(), 'CHANGELOG.md');
  
  if (!fs.existsSync(changelogPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(changelogPath, 'utf8');
    const versionRegex = new RegExp(`## ${version.replace('v', '')}([\\s\\S]*?)(?=## |$)`, 'i');
    const match = content.match(versionRegex);
    
    if (match) {
      return match[1].trim();
    }
  } catch (error) {
    console.warn('Failed to read CHANGELOG.md:', error.message);
  }
  
  return null;
}

/**
 * リリースノートを生成
 */
function generateReleaseNotes(version) {
  console.log(`Generating release notes for ${version}`);
  
  // CHANGELOG.mdから既存の内容を確認
  const changelogContent = getChangelogContent(version);
  if (changelogContent) {
    console.log('Found existing changelog content');
    return {
      releaseNotes: changelogContent,
      additionalInfo: ''
    };
  }

  // コミット範囲を決定
  const previousTag = getPreviousTag();
  const range = previousTag ? `${previousTag}..HEAD` : 'HEAD~20..HEAD';
  console.log(`Using commit range: ${range}`);

  // コミット情報を取得
  const commits = getCommits(range);
  if (commits.length === 0) {
    return {
      releaseNotes: '変更内容の詳細は、コミット履歴をご確認ください。',
      additionalInfo: ''
    };
  }

  // コミットを分類
  const { categories, uncategorized } = categorizeCommits(commits);
  
  // リリースノートを構築
  let releaseNotes = '';
  
  for (const [type, config] of Object.entries(CONFIG.commitTypes)) {
    if (categories[type] && categories[type].length > 0) {
      releaseNotes += `\n### ${config.title}\n`;
      categories[type].forEach(commit => {
        releaseNotes += `- ${commit.subject}\n`;
      });
    }
  }

  if (uncategorized.length > 0) {
    releaseNotes += '\n### 🔧 その他の変更\n';
    uncategorized.slice(0, 10).forEach(commit => {
      releaseNotes += `- ${commit.subject}\n`;
    });
  }

  // 追加情報を生成
  let additionalInfo = '';
  
  // 貢献者情報
  const contributors = getContributors(commits);
  if (contributors.length > 0) {
    additionalInfo += '\n### 👥 貢献者\n';
    contributors.forEach(contributor => {
      additionalInfo += `- @${contributor.name} (${contributor.count} commits)\n`;
    });
  }

  // プルリクエスト情報
  const pullRequests = extractPullRequests(commits);
  if (pullRequests.length > 0) {
    additionalInfo += '\n### 🔗 関連プルリクエスト\n';
    pullRequests.forEach(pr => {
      additionalInfo += `- ${pr}\n`;
    });
  }

  // 統計情報
  const commitCount = commits.length;
  const fileCount = execSync(`git diff --name-only ${range} | wc -l`, { encoding: 'utf8' }).trim();
  
  additionalInfo += '\n### 📊 リリース統計\n';
  additionalInfo += `- コミット数: ${commitCount}\n`;
  additionalInfo += `- 変更ファイル数: ${fileCount}\n`;

  return {
    releaseNotes: releaseNotes.trim(),
    additionalInfo: additionalInfo.trim()
  };
}

// メイン実行部分
if (require.main === module) {
  const version = process.argv[2] || 'v0.0.1';
  
  try {
    const { releaseNotes, additionalInfo } = generateReleaseNotes(version);
    
    // GitHub Actionsの出力変数として設定
    if (process.env.GITHUB_OUTPUT) {
      const fs = require('fs');
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `release_notes<<EOF\n${releaseNotes}\nEOF\n`);
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `additional_info<<EOF\n${additionalInfo}\nEOF\n`);
    } else {
      // ローカル実行時はコンソールに出力
      console.log('=== Release Notes ===');
      console.log(releaseNotes);
      console.log('\n=== Additional Info ===');
      console.log(additionalInfo);
    }
    
    console.log('Release notes generated successfully');
  } catch (error) {
    console.error('Error generating release notes:', error.message);
    process.exit(1);
  }
}

module.exports = { generateReleaseNotes };
