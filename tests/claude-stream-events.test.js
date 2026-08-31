const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const childProcess = require('node:child_process');

// runClaude は `claude --output-format stream-json --verbose` の標準出力を1行1JSON(NDJSON)として
// 逐次パースし、Task tool の tool_use / tool_result を検知してサブエージェント開始・終了イベントを
// (server.js内部の)subAgentEventsへemitする。subAgentEvents自体はエクスポートされていないため、
// EventEmitter.prototype.emit を一時的にラップして 'event' という名前のemit呼び出しだけを観測する。
function withSubAgentEventSpy(t, fn) {
  const emitted = [];
  const originalEmit = EventEmitter.prototype.emit;

  EventEmitter.prototype.emit = function (name, ...args) {
    if (name === 'event') {
      emitted.push(args[0]);
    }
    return originalEmit.apply(this, [name, ...args]);
  };

  t.after(() => {
    EventEmitter.prototype.emit = originalEmit;
  });

  return fn(emitted);
}

function createFakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

function writeLine(child, obj) {
  child.stdout.emit('data', Buffer.from(`${JSON.stringify(obj)}\n`));
}

function requireFreshServer() {
  const serverPath = require.resolve('../server.js');
  delete require.cache[serverPath];
  return require(serverPath);
}

function taskToolUseEvent(toolUseId, subagentType) {
  return {
    type: 'assistant',
    message: { content: [{ type: 'tool_use', id: toolUseId, name: 'Task', input: { subagent_type: subagentType } }] }
  };
}

function agentToolUseEvent(toolUseId, subagentType) {
  return {
    type: 'assistant',
    message: { content: [{ type: 'tool_use', id: toolUseId, name: 'Agent', input: { subagent_type: subagentType } }] }
  };
}

function toolResultEvent(toolUseId) {
  return {
    type: 'user',
    message: { content: [{ type: 'tool_result', tool_use_id: toolUseId }] }
  };
}

function resultEvent(result) {
  return { type: 'result', result };
}

test('runClaude: Task tool_useの検知でworkingイベント、対応するtool_resultでidleイベントが発行される(正常系)', async (t) => {
  await withSubAgentEventSpy(t, async (emitted) => {
    const fakeChild = createFakeChild();
    t.mock.method(childProcess, 'spawn', () => fakeChild);
    const { runClaude } = requireFreshServer();

    const promise = runClaude('プロンプト', '/tmp/workspace', 'proj-a');

    writeLine(fakeChild, taskToolUseEvent('tool-1', 'code-reviewer'));
    writeLine(fakeChild, toolResultEvent('tool-1'));
    writeLine(fakeChild, resultEvent('最終応答です'));
    fakeChild.emit('close', 0);

    const response = await promise;

    assert.equal(response, '最終応答です');
    assert.deepEqual(emitted, [
      { projectId: 'proj-a', subAgentId: 'code-reviewer', status: 'working' },
      { projectId: 'proj-a', subAgentId: 'code-reviewer', status: 'idle' }
    ]);
  });
});

test('runClaude: Agent tool_useの検知でworkingイベント、対応するtool_resultでidleイベントが発行される(正常系)', async (t) => {
  await withSubAgentEventSpy(t, async (emitted) => {
    const fakeChild = createFakeChild();
    t.mock.method(childProcess, 'spawn', () => fakeChild);
    const { runClaude } = requireFreshServer();

    const promise = runClaude('プロンプト', '/tmp/workspace', 'proj-a');

    writeLine(fakeChild, agentToolUseEvent('tool-1', 'code-reviewer'));
    writeLine(fakeChild, toolResultEvent('tool-1'));
    writeLine(fakeChild, resultEvent('最終応答です'));
    fakeChild.emit('close', 0);

    const response = await promise;

    assert.equal(response, '最終応答です');
    assert.deepEqual(emitted, [
      { projectId: 'proj-a', subAgentId: 'code-reviewer', status: 'working' },
      { projectId: 'proj-a', subAgentId: 'code-reviewer', status: 'idle' }
    ]);
  });
});

test('runClaude: TaskとAgentが混在してもそれぞれtool_use_idごとに正しく対応付ける(境界値)', async (t) => {
  await withSubAgentEventSpy(t, async (emitted) => {
    const fakeChild = createFakeChild();
    t.mock.method(childProcess, 'spawn', () => fakeChild);
    const { runClaude } = requireFreshServer();

    const promise = runClaude('プロンプト', '/tmp/workspace', 'proj-a');

    writeLine(fakeChild, taskToolUseEvent('tool-1', 'agent-a'));
    writeLine(fakeChild, agentToolUseEvent('tool-2', 'agent-b'));
    writeLine(fakeChild, toolResultEvent('tool-2'));
    writeLine(fakeChild, toolResultEvent('tool-1'));
    writeLine(fakeChild, resultEvent('応答'));
    fakeChild.emit('close', 0);

    await promise;

    assert.deepEqual(emitted, [
      { projectId: 'proj-a', subAgentId: 'agent-a', status: 'working' },
      { projectId: 'proj-a', subAgentId: 'agent-b', status: 'working' },
      { projectId: 'proj-a', subAgentId: 'agent-b', status: 'idle' },
      { projectId: 'proj-a', subAgentId: 'agent-a', status: 'idle' }
    ]);
  });
});

test('runClaude: Agent tool_useでもsubagent_typeが無い場合はサブエージェントイベントを発行しない(境界値)', async (t) => {
  await withSubAgentEventSpy(t, async (emitted) => {
    const fakeChild = createFakeChild();
    t.mock.method(childProcess, 'spawn', () => fakeChild);
    const { runClaude } = requireFreshServer();

    const promise = runClaude('プロンプト', '/tmp/workspace', 'proj-a');

    writeLine(fakeChild, {
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 'tool-1', name: 'Agent', input: {} }] }
    });
    writeLine(fakeChild, resultEvent('応答'));
    fakeChild.emit('close', 0);

    await promise;

    assert.deepEqual(emitted, []);
  });
});

test('runClaude: Task以外のtool_useではサブエージェントイベントを発行しない(異常系)', async (t) => {
  await withSubAgentEventSpy(t, async (emitted) => {
    const fakeChild = createFakeChild();
    t.mock.method(childProcess, 'spawn', () => fakeChild);
    const { runClaude } = requireFreshServer();

    const promise = runClaude('プロンプト', '/tmp/workspace', 'proj-a');

    writeLine(fakeChild, {
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 'tool-1', name: 'Bash', input: { command: 'ls' } }] }
    });
    writeLine(fakeChild, resultEvent('応答'));
    fakeChild.emit('close', 0);

    await promise;

    assert.deepEqual(emitted, []);
  });
});

test('runClaude: Task tool_useでもsubagent_typeが無い場合はサブエージェントイベントを発行しない(異常系)', async (t) => {
  await withSubAgentEventSpy(t, async (emitted) => {
    const fakeChild = createFakeChild();
    t.mock.method(childProcess, 'spawn', () => fakeChild);
    const { runClaude } = requireFreshServer();

    const promise = runClaude('プロンプト', '/tmp/workspace', 'proj-a');

    writeLine(fakeChild, {
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 'tool-1', name: 'Task', input: {} }] }
    });
    writeLine(fakeChild, resultEvent('応答'));
    fakeChild.emit('close', 0);

    await promise;

    assert.deepEqual(emitted, []);
  });
});

test('runClaude: 不正なJSON行が混ざっていてもクラッシュせず、後続の正常な行は処理される(境界値)', async (t) => {
  await withSubAgentEventSpy(t, async (emitted) => {
    const fakeChild = createFakeChild();
    t.mock.method(childProcess, 'spawn', () => fakeChild);
    const { runClaude } = requireFreshServer();

    const promise = runClaude('プロンプト', '/tmp/workspace', 'proj-a');

    writeLine(fakeChild, taskToolUseEvent('tool-1', 'researcher'));
    fakeChild.stdout.emit('data', Buffer.from('{this is not valid json\n'));
    fakeChild.stdout.emit('data', Buffer.from('\n'));
    writeLine(fakeChild, toolResultEvent('tool-1'));
    writeLine(fakeChild, resultEvent('壊れた行があっても応答は返る'));
    fakeChild.emit('close', 0);

    const response = await promise;

    assert.equal(response, '壊れた行があっても応答は返る');
    assert.deepEqual(emitted, [
      { projectId: 'proj-a', subAgentId: 'researcher', status: 'working' },
      { projectId: 'proj-a', subAgentId: 'researcher', status: 'idle' }
    ]);
  });
});

test('runClaude: 複数のサブエージェント呼び出しをtool_use_idごとに正しく対応付ける(境界値)', async (t) => {
  await withSubAgentEventSpy(t, async (emitted) => {
    const fakeChild = createFakeChild();
    t.mock.method(childProcess, 'spawn', () => fakeChild);
    const { runClaude } = requireFreshServer();

    const promise = runClaude('プロンプト', '/tmp/workspace', 'proj-a');

    writeLine(fakeChild, taskToolUseEvent('tool-1', 'agent-a'));
    writeLine(fakeChild, taskToolUseEvent('tool-2', 'agent-b'));
    writeLine(fakeChild, toolResultEvent('tool-2'));
    writeLine(fakeChild, toolResultEvent('tool-1'));
    writeLine(fakeChild, resultEvent('応答'));
    fakeChild.emit('close', 0);

    await promise;

    assert.deepEqual(emitted, [
      { projectId: 'proj-a', subAgentId: 'agent-a', status: 'working' },
      { projectId: 'proj-a', subAgentId: 'agent-b', status: 'working' },
      { projectId: 'proj-a', subAgentId: 'agent-b', status: 'idle' },
      { projectId: 'proj-a', subAgentId: 'agent-a', status: 'idle' }
    ]);
  });
});

test('runClaude: tool_resultが来ないままプロセスが終了した場合、closeで残っているサブエージェントをidleに戻す(異常系)', async (t) => {
  await withSubAgentEventSpy(t, async (emitted) => {
    const fakeChild = createFakeChild();
    t.mock.method(childProcess, 'spawn', () => fakeChild);
    const { runClaude } = requireFreshServer();

    const promise = runClaude('プロンプト', '/tmp/workspace', 'proj-a');

    writeLine(fakeChild, taskToolUseEvent('tool-1', 'stuck-agent'));
    writeLine(fakeChild, resultEvent('応答'));
    fakeChild.emit('close', 0);

    await promise;

    assert.deepEqual(emitted, [
      { projectId: 'proj-a', subAgentId: 'stuck-agent', status: 'working' },
      { projectId: 'proj-a', subAgentId: 'stuck-agent', status: 'idle' }
    ]);
  });
});

test('runClaude: projectIdが未指定の場合はTaskを検知してもサブエージェントイベントを発行しない(境界値)', async (t) => {
  await withSubAgentEventSpy(t, async (emitted) => {
    const fakeChild = createFakeChild();
    t.mock.method(childProcess, 'spawn', () => fakeChild);
    const { runClaude } = requireFreshServer();

    const promise = runClaude('プロンプト', '/tmp/workspace', null);

    writeLine(fakeChild, taskToolUseEvent('tool-1', 'agent-a'));
    writeLine(fakeChild, toolResultEvent('tool-1'));
    writeLine(fakeChild, resultEvent('応答'));
    fakeChild.emit('close', 0);

    const response = await promise;

    assert.equal(response, '応答');
    assert.deepEqual(emitted, []);
  });
});

test('runClaude: 終了コードが0以外の場合はstderrの内容でrejectする(異常系)', async (t) => {
  const fakeChild = createFakeChild();
  t.mock.method(childProcess, 'spawn', () => fakeChild);
  const { runClaude } = requireFreshServer();

  const promise = runClaude('プロンプト', '/tmp/workspace', 'proj-a');

  fakeChild.stderr.emit('data', Buffer.from('claudeコマンドが失敗しました'));
  fakeChild.emit('close', 1);

  await assert.rejects(promise, /claudeコマンドが失敗しました/);
});

test('buildClaudeCommand: workspaceを--add-dirに使い、stream-json形式の出力オプションを付与する(正常系)', () => {
  const { buildClaudeCommand } = requireFreshServer();

  const command = buildClaudeCommand('タスクの依頼内容', '/Users/taiga/Projects/some-project');

  const addDirIndex = command.args.indexOf('--add-dir');
  assert.notEqual(addDirIndex, -1);
  assert.equal(command.args[addDirIndex + 1], '/Users/taiga/Projects/some-project');
  assert.ok(command.args.includes('--output-format'));
  assert.ok(command.args.includes('stream-json'));
  assert.ok(command.args.includes('--verbose'));
});
