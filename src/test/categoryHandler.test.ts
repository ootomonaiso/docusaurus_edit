import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { CategoryHandler } from '../categoryHandler';

suite('CategoryHandler Tests', () => {
    const testWorkspaceRoot = path.join(__dirname, '..', '..', 'test-workspace');
    const testDocsPath = path.join(testWorkspaceRoot, 'docs');
    let categoryHandler: CategoryHandler;

    setup(() => {
        // テスト用のワークスペースを作成
        if (!fs.existsSync(testWorkspaceRoot)) {
            fs.mkdirSync(testWorkspaceRoot, { recursive: true });
        }
        if (!fs.existsSync(testDocsPath)) {
            fs.mkdirSync(testDocsPath, { recursive: true });
        }
        
        categoryHandler = new CategoryHandler(testWorkspaceRoot);
    });

    teardown(() => {
        // テスト後のクリーンアップ
        if (fs.existsSync(testWorkspaceRoot)) {
            fs.rmSync(testWorkspaceRoot, { recursive: true, force: true });
        }
    });

    test('CategoryHandler インスタンスが正しく作成される', () => {
        assert.ok(categoryHandler);
    });

    test('formatDisplayName が正しく動作する', () => {
        // private メソッドのテストのために any にキャスト
        const handler = categoryHandler as any;
        
        assert.strictEqual(handler.formatDisplayName('getting-started'), 'Getting Started');
        assert.strictEqual(handler.formatDisplayName('api-reference'), 'Api Reference');
        assert.strictEqual(handler.formatDisplayName('single'), 'Single');
        assert.strictEqual(handler.formatDisplayName('multi-word-example'), 'Multi Word Example');
    });

    test('saveCategoryConfig が正しいJSONを保存する', async () => {
        const handler = categoryHandler as any;
        const testConfigPath = path.join(testDocsPath, '_category_.json');
        
        const testData = {
            label: 'Test Category',
            position: 5,
            description: 'Test description'
        };

        await handler.saveCategoryConfig(testConfigPath, testData);

        assert.ok(fs.existsSync(testConfigPath));
        
        const savedConfig = JSON.parse(fs.readFileSync(testConfigPath, 'utf8'));
        assert.strictEqual(savedConfig.label, 'Test Category');
        assert.strictEqual(savedConfig.position, 5);
        assert.strictEqual(savedConfig.link.type, 'generated-index');
        assert.strictEqual(savedConfig.link.description, 'Test description');
    });

    test('getNextPosition が正しい次の位置を返す', async () => {
        const handler = categoryHandler as any;
        
        // 既存のカテゴリを作成
        const category1Path = path.join(testDocsPath, 'category1');
        const category2Path = path.join(testDocsPath, 'category2');
        
        fs.mkdirSync(category1Path);
        fs.mkdirSync(category2Path);
        
        // カテゴリ1の設定（position: 1）
        const config1 = {
            label: 'Category 1',
            position: 1,
            link: { type: 'generated-index', description: 'Category 1' }
        };
        fs.writeFileSync(path.join(category1Path, '_category_.json'), JSON.stringify(config1));
        
        // カテゴリ2の設定（position: 3）
        const config2 = {
            label: 'Category 2',
            position: 3,
            link: { type: 'generated-index', description: 'Category 2' }
        };
        fs.writeFileSync(path.join(category2Path, '_category_.json'), JSON.stringify(config2));
        
        const nextPosition = await handler.getNextPosition(testDocsPath);
        assert.strictEqual(nextPosition, 4); // 最大値3の次は4
    });

    test('deleteFolderRecursive が正しく動作する', () => {
        const handler = categoryHandler as any;
        
        // テスト用のネストしたフォルダ構造を作成
        const testFolderPath = path.join(testDocsPath, 'test-delete');
        const nestedFolderPath = path.join(testFolderPath, 'nested');
        
        fs.mkdirSync(testFolderPath);
        fs.mkdirSync(nestedFolderPath);
        
        // ファイルを作成
        fs.writeFileSync(path.join(testFolderPath, 'file1.txt'), 'test content');
        fs.writeFileSync(path.join(nestedFolderPath, 'file2.txt'), 'nested content');
        
        // フォルダが存在することを確認
        assert.ok(fs.existsSync(testFolderPath));
        assert.ok(fs.existsSync(nestedFolderPath));
        
        // 削除を実行
        handler.deleteFolderRecursive(testFolderPath);
        
        // フォルダが削除されたことを確認
        assert.ok(!fs.existsSync(testFolderPath));
    });
});
