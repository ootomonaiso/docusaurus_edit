import * as assert from 'assert';

// 基本的なユニットテスト
suite('Basic Test Suite', () => {
	test('配列インデックステスト', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
		assert.strictEqual(1, [1, 2, 3].indexOf(2));
	});

	test('文字列操作テスト', () => {
		assert.strictEqual('hello', 'hello');
		assert.strictEqual('hello world'.split(' ')[0], 'hello');
		assert.strictEqual('hello world'.split(' ')[1], 'world');
	});
});
