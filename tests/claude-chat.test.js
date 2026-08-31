const test = require('node:test');
const assert = require('node:assert/strict');

const { detectClaudeExecutable, buildClaudeConversationPrompt, buildClaudeCommand } = require('../server.js');

test('buildClaudeConversationPrompt includes prior user and assistant turns for continuity', () => {
  const prompt = buildClaudeConversationPrompt([
    { role: 'assistant', text: '前回は了解しました。' },
    { role: 'user', text: '次はリファクタリングをお願いします。' }
  ], 'この部分を修正してください。');

  assert.ok(prompt.includes('前回は了解しました。'));
  assert.ok(prompt.includes('次はリファクタリングをお願いします。'));
  assert.ok(prompt.includes('この部分を修正してください。'));
});

test('buildClaudeConversationPrompt keeps only the active session when session ids are present', () => {
  const prompt = buildClaudeConversationPrompt([
    { role: 'user', text: '古いセッションの内容', sessionId: 'session-a' },
    { role: 'assistant', text: '古い返答', sessionId: 'session-a' },
    { role: 'user', text: '今のセッションの内容', sessionId: 'session-b' },
    { role: 'assistant', text: '今の返答', sessionId: 'session-b' }
  ], '次は何をすべきですか?', 'session-b');

  assert.ok(prompt.includes('今のセッションの内容'));
  assert.ok(prompt.includes('今の返答'));
  assert.ok(!prompt.includes('古いセッションの内容'));
  assert.ok(!prompt.includes('古い返答'));
});

test('buildClaudeConversationPrompt tells Claude to perform code edits when the user asks for them', () => {
  const prompt = buildClaudeConversationPrompt([
    { role: 'user', text: '前回はリファクタリングしました。' },
    { role: 'assistant', text: '了解しました。' }
  ], 'app.js を修正して、npm test を実行してください。');

  assert.ok(/コード編集|ファイル修正|コマンド実行|npm test/i.test(prompt));
});

test('buildClaudeConversationPrompt keeps legacy unscoped messages when a session is active', () => {
  const prompt = buildClaudeConversationPrompt([
    { role: 'user', text: '以前の会話' },
    { role: 'assistant', text: '以前の返答' },
    { role: 'user', text: '今の会話', sessionId: 'session-b' },
    { role: 'assistant', text: '今の返答', sessionId: 'session-b' }
  ], '次は何を修正すべきですか?', 'session-b');

  assert.ok(prompt.includes('以前の会話'));
  assert.ok(prompt.includes('以前の返答'));
  assert.ok(prompt.includes('今の会話'));
  assert.ok(prompt.includes('今の返答'));
});

test('buildClaudeCommand bypasses the tool permission prompt for local agent execution', () => {
  const command = buildClaudeCommand('ファイルを修正してください。');

  assert.ok(Array.isArray(command.args));
  assert.ok(command.args.includes('--dangerously-skip-permissions'));
  assert.ok(command.args.includes('--permission-mode'));
  assert.ok(command.args.includes('bypassPermissions'));
  assert.ok(command.args.includes('-p'));
  assert.equal(command.args[command.args.length - 1], 'ファイルを修正してください。');
});

test('detectClaudeExecutable respects the environment override when set', () => {
  const previous = process.env.CLAUDE_COMMAND;
  process.env.CLAUDE_COMMAND = 'missing-cli';

  try {
    assert.equal(detectClaudeExecutable(), 'missing-cli');
  } finally {
    if (previous === undefined) {
      delete process.env.CLAUDE_COMMAND;
    } else {
      process.env.CLAUDE_COMMAND = previous;
    }
  }
});

test('detectClaudeExecutable resolves a local Claude CLI when available', () => {
  const previous = process.env.CLAUDE_COMMAND;
  delete process.env.CLAUDE_COMMAND;

  try {
    const result = detectClaudeExecutable();
    assert.ok(result === 'claude' || typeof result === 'string');
  } finally {
    if (previous === undefined) {
      delete process.env.CLAUDE_COMMAND;
    } else {
      process.env.CLAUDE_COMMAND = previous;
    }
  }
});
