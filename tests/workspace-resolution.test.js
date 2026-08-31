const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { resolveWorkspace } = require('../server.js');

// resolveWorkspace は projectId から `/Users/taiga/Projects/<projectId>` を作業ディレクトリとして
// 解決する。テストファイル自身の __dirname から見て安定した絶対パスだけを使い、
// リポジトリの配置場所に依存しないようにする。
const repoRoot = path.resolve(__dirname, '..');
const parentDir = path.resolve(repoRoot, '..');

test('resolveWorkspace: 実在するprojectId(自リポジトリ名)を渡すと、その配下のディレクトリを返す(正常系)', () => {
  const projectId = path.basename(repoRoot);

  const result = resolveWorkspace(projectId);

  assert.equal(result, repoRoot);
});

test('resolveWorkspace: 存在しないprojectIdを渡すとフォールバック(process.cwd())を返す(異常系)', () => {
  const result = resolveWorkspace('definitely-not-a-real-project-xyz123');

  assert.equal(result, process.cwd());
});

test('resolveWorkspace: projectIdがディレクトリではなくファイルを指す場合はフォールバックする(異常系)', () => {
  const projectId = path.join(path.basename(repoRoot), 'package.json');

  const result = resolveWorkspace(projectId);

  assert.equal(result, process.cwd());
});

test('resolveWorkspace: projectIdが空文字の場合はフォールバックする(境界値)', () => {
  const result = resolveWorkspace('');

  assert.equal(result, process.cwd());
});

test('resolveWorkspace: projectIdがnull/undefinedの場合はフォールバックする(境界値)', () => {
  assert.equal(resolveWorkspace(null), process.cwd());
  assert.equal(resolveWorkspace(undefined), process.cwd());
});

test('resolveWorkspace: projectIdが文字列以外の場合はフォールバックする(型分岐)', () => {
  assert.equal(resolveWorkspace(123), process.cwd());
  assert.equal(resolveWorkspace({ id: 'agent-office' }), process.cwd());
  assert.equal(resolveWorkspace(['agent-office']), process.cwd());
});

test('resolveWorkspace: パストラバーサルを試みるprojectIdはフォールバックする(異常系)', () => {
  const result = resolveWorkspace('../../../../etc');

  assert.equal(result, process.cwd());
  assert.notEqual(result, path.resolve(parentDir, '../../../../etc'));
});
