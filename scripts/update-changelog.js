/**
 * CHANGELOGを自動的に更新するスクリプト
 * 
 * 使用方法:
 * - npm run changelog [-- --type=<feature|bugfix|refactor> --message="変更内容"]
 * - デフォルトではfeatureタイプになります
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { version } = require('../package.json');

const CHANGELOG_PATH = path.join(__dirname, '..', 'CHANGELOG.md');
const DEFAULT_TYPE = 'feature';
const VALID_TYPES = ['feature', 'bugfix', 'refactor'];

// コマンドライン引数の処理
function parseArguments() {
  const args = process.argv.slice(2);
  const result = { type: DEFAULT_TYPE, message: null };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--type=')) {
      const type = args[i].substring(7);
      if (VALID_TYPES.includes(type)) {
        result.type = type;
      }
    } else if (args[i].startsWith('--message=')) {
      result.message = args[i].substring(10);
    }
  }
  
  return result;
}

// 最近のコミットからメッセージを取得
function getRecentCommits(count = 5) {
  try {
    const output = execSync(`git log -n ${count} --pretty=format:"%s"`)
      .toString()
      .split('\n')
      .filter(line => !line.includes('Merge '));
    return output;
  } catch (error) {
    console.warn('警告: Gitコマンドの実行に失敗しました。', error.message);
    return [];
  }
}

// CHANGELOGに新しいバージョンエントリを追加
function updateChangelog(type, message) {
  // CHANGELOGが存在しない場合は新規作成
  if (!fs.existsSync(CHANGELOG_PATH)) {
    fs.writeFileSync(CHANGELOG_PATH, '# 変更履歴\n\n');
  }
  
  // 既存のCHANGELOGを読み込む
  let content = fs.readFileSync(CHANGELOG_PATH, 'utf8');
  
  // 現在の日付を取得
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  
  // 新しいバージョンセクションを作成
  let newVersionHeader = `## v${version} (${dateStr})\n\n`;
  
  // 変更タイプに基づいてメッセージを追加
  let changeEntry = '';
  if (type === 'feature') {
    changeEntry = '### 新機能・改善\n';
  } else if (type === 'bugfix') {
    changeEntry = '### バグ修正\n';
  } else if (type === 'refactor') {
    changeEntry = '### リファクタリング\n';
  }
  
  // メッセージが提供されている場合はそれを使用、そうでなければ最近のコミットを使用
  if (message) {
    changeEntry += `- ${message}\n\n`;
  } else {
    const commits = getRecentCommits();
    if (commits.length > 0) {
      commits.forEach(commit => {
        changeEntry += `- ${commit}\n`;
      });
      changeEntry += '\n';
    } else {
      changeEntry += '- 詳細は追加されていません\n\n';
    }
  }
  
  // バージョンがCHANGELOGに既に存在するかチェック
  if (content.includes(`## v${version}`)) {
    // バージョンセクションを見つけてエントリを追加
    const versionRegex = new RegExp(`## v${version}.*?(\n##|$)`, 's');
    const versionSection = content.match(versionRegex);
    
    if (versionSection) {
      // 変更タイプセクションが既に存在するかチェック
      const typeSection = changeEntry.split('\n')[0];
      if (versionSection[0].includes(typeSection)) {
        // タイプセクションが存在する場合、そこにエントリを追加
        const typeSectionRegex = new RegExp(`${typeSection}.*?(\n###|$)`, 's');
        const typeSectionMatch = versionSection[0].match(typeSectionRegex);
        
        if (typeSectionMatch) {
          const updatedTypeSection = typeSectionMatch[0] + '- ' + 
            (message || getRecentCommits(1)[0] || '詳細は追加されていません') + '\n';
          content = content.replace(typeSectionMatch[0], updatedTypeSection);
        }
      } else {
        // タイプセクションが存在しない場合、バージョンセクションに追加
        const updatedVersionSection = versionSection[0].replace(/\n##/, '\n' + changeEntry + '##');
        content = content.replace(versionSection[0], updatedVersionSection);
      }
    }
  } else {
    // バージョンが存在しない場合、新しいバージョンセクションを先頭に追加
    const firstVersionMatch = content.match(/# 変更履歴\s*\n/);
    if (firstVersionMatch) {
      content = content.replace(
        firstVersionMatch[0], 
        firstVersionMatch[0] + newVersionHeader + changeEntry
      );
    }
  }
  
  // 更新されたコンテンツを書き込む
  fs.writeFileSync(CHANGELOG_PATH, content);
  console.log(`CHANGELOG.mdが更新されました: v${version}`);
}

// メイン処理
const { type, message } = parseArguments();
updateChangelog(type, message);
