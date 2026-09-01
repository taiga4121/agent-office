const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const childProcess = require('node:child_process');

// runClaude は `claude --output-format stream-json --verbose` の標準出力を1行1JSON(NDJSON)として
// 逐次パースし、system イベント(task_started/task_notification)を検知してサブエージェント開始・終了
// イベントを (server.js内部の)subAgentEventsへemitする。
// (以前は assistant イベント内の tool_use(Task/Agent) と、対応する user イベント内の tool_result で
// 検知していたが、Agentツール呼び出しがバックグラウンド実行される場合、tool_result がサブエージェントの
// 実際の完了を待たずに返ってくるため、表示と実際の作業時間が同期しない問題があった。実際のライフサイクルは
// system タイプの task_started/task_notification イベントで正確に示されるため、こちらに一本化されている。)
// subAgentEvents自体はエクスポートされていないため、EventEmitter.prototype.emit を一時的にラップして
// 'event' という名前のemit呼び出しだけを観測する。
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

function taskStartedEvent(taskId, subagentType) {
  return { type: 'system', subtype: 'task_started', task_id: taskId, subagent_type: subagentType };
}

function taskNotificationEvent(taskId, status = 'completed') {
  return { type: 'system', subtype: 'task_notification', task_id: taskId, status };
}

// 旧方式(tool_use/tool_result)のイベント形。新方式では無視されるべきことの回帰確認にのみ使う。
function taskToolUseEvent(toolUseId, subagentType) {
  return {
    type: 'assistant',
    message: { content: [{ type: 'tool_use', id: toolUseId, name: 'Task', input: { subagent_type: subagentType } }] }
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

test('runClaude: task_startedの検知でworkingイベント、対応するtask_notification(completed)でidleイベントが発行される(正常系)', async (t) => {
  await withSubAgentEventSpy(t, async (emitted) => {
    const fakeChild = createFakeChild();
    t.mock.method(childProcess, 'spawn', () => fakeChild);
    const { runClaude } = requireFreshServer();

    const promise = runClaude('プロンプト', '/tmp/workspace', 'proj-a');

    writeLine(fakeChild, taskStartedEvent('task-1', 'code-reviewer'));
    writeLine(fakeChild, taskNotificationEvent('task-1', 'completed'));
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

test('runClaude: 複数のサブエージェントが異なるtask_idで同時にtask_startedしても、それぞれ独立してworking/idleが管理される(正常系)', async (t) => {
  await withSubAgentEventSpy(t, async (emitted) => {
    const fakeChild = createFakeChild();
    t.mock.method(childProcess, 'spawn', () => fakeChild);
    const { runClaude } = requireFreshServer();

    const promise = runClaude('プロンプト', '/tmp/workspace', 'proj-a');

    writeLine(fakeChild, taskStartedEvent('task-1', 'agent-a'));
    writeLine(fakeChild, taskStartedEvent('task-2', 'agent-b'));
    writeLine(fakeChild, taskNotificationEvent('task-2', 'completed'));
    writeLine(fakeChild, taskNotificationEvent('task-1', 'completed'));
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

test('runClaude: 複数サブエージェントのうち一部だけtask_notificationが来た場合、通知が来た方だけ先にidleになり、来なかった方はcloseで強制的にidleへ戻る(境界値)', async (t) => {
  await withSubAgentEventSpy(t, async (emitted) => {
    const fakeChild = createFakeChild();
    t.mock.method(childProcess, 'spawn', () => fakeChild);
    const { runClaude } = requireFreshServer();

    const promise = runClaude('プロンプト', '/tmp/workspace', 'proj-a');

    writeLine(fakeChild, taskStartedEvent('task-1', 'agent-a'));
    writeLine(fakeChild, taskStartedEvent('task-2', 'agent-b'));
    writeLine(fakeChild, taskNotificationEvent('task-2', 'completed'));

    assert.deepEqual(emitted, [
      { projectId: 'proj-a', subAgentId: 'agent-a', status: 'working' },
      { projectId: 'proj-a', subAgentId: 'agent-b', status: 'working' },
      { projectId: 'proj-a', subAgentId: 'agent-b', status: 'idle' }
    ], 'task-1に対応する通知が来る前は、agent-aはworkingのまま');

    writeLine(fakeChild, resultEvent('応答'));
    fakeChild.emit('close', 0);
    await promise;

    assert.deepEqual(emitted, [
      { projectId: 'proj-a', subAgentId: 'agent-a', status: 'working' },
      { projectId: 'proj-a', subAgentId: 'agent-b', status: 'working' },
      { projectId: 'proj-a', subAgentId: 'agent-b', status: 'idle' },
      { projectId: 'proj-a', subAgentId: 'agent-a', status: 'idle' }
    ], 'closeで残っていたagent-aも強制的にidleへ戻る');
  });
});

test('runClaude: task_notificationのtask_idがtask_startedのtask_idと一致しない場合はidleイベントが発行されない(異常系)', async (t) => {
  await withSubAgentEventSpy(t, async (emitted) => {
    const fakeChild = createFakeChild();
    t.mock.method(childProcess, 'spawn', () => fakeChild);
    const { runClaude } = requireFreshServer();

    const promise = runClaude('プロンプト', '/tmp/workspace', 'proj-a');

    writeLine(fakeChild, taskStartedEvent('task-1', 'agent-a'));
    writeLine(fakeChild, taskNotificationEvent('task-999', 'completed'));

    assert.deepEqual(
      emitted,
      [{ projectId: 'proj-a', subAgentId: 'agent-a', status: 'working' }],
      'task_idが一致しない通知ではidleは発行されない'
    );

    writeLine(fakeChild, resultEvent('応答'));
    fakeChild.emit('close', 0);
    await promise;

    assert.deepEqual(
      emitted,
      [
        { projectId: 'proj-a', subAgentId: 'agent-a', status: 'working' },
        { projectId: 'proj-a', subAgentId: 'agent-a', status: 'idle' }
      ],
      '最終的なidleはcloseの強制リセットによるものであり、不一致の通知によるものではない'
    );
  });
});

test('runClaude: task_notificationのstatusがcompleted以外(failed)の場合はidleイベントが発行されない(異常系)', async (t) => {
  await withSubAgentEventSpy(t, async (emitted) => {
    const fakeChild = createFakeChild();
    t.mock.method(childProcess, 'spawn', () => fakeChild);
    const { runClaude } = requireFreshServer();

    const promise = runClaude('プロンプト', '/tmp/workspace', 'proj-a');

    writeLine(fakeChild, taskStartedEvent('task-1', 'agent-a'));
    writeLine(fakeChild, taskNotificationEvent('task-1', 'failed'));

    assert.deepEqual(
      emitted,
      [{ projectId: 'proj-a', subAgentId: 'agent-a', status: 'working' }],
      'statusが completed でない通知ではidleは発行されない'
    );

    writeLine(fakeChild, resultEvent('応答'));
    fakeChild.emit('close', 0);
    await promise;

    assert.deepEqual(
      emitted,
      [
        { projectId: 'proj-a', subAgentId: 'agent-a', status: 'working' },
        { projectId: 'proj-a', subAgentId: 'agent-a', status: 'idle' }
      ],
      '最終的なidleはcloseの強制リセットによるものである'
    );
  });
});

test('runClaude: task_startedにtask_idが無い場合はworkingイベントを発行しない(境界値)', async (t) => {
  await withSubAgentEventSpy(t, async (emitted) => {
    const fakeChild = createFakeChild();
    t.mock.method(childProcess, 'spawn', () => fakeChild);
    const { runClaude } = requireFreshServer();

    const promise = runClaude('プロンプト', '/tmp/workspace', 'proj-a');

    writeLine(fakeChild, { type: 'system', subtype: 'task_started', subagent_type: 'agent-a' });
    writeLine(fakeChild, resultEvent('応答'));
    fakeChild.emit('close', 0);

    await promise;

    assert.deepEqual(emitted, []);
  });
});

test('runClaude: task_startedにsubagent_typeが無い場合はworkingイベントを発行しない(境界値)', async (t) => {
  await withSubAgentEventSpy(t, async (emitted) => {
    const fakeChild = createFakeChild();
    t.mock.method(childProcess, 'spawn', () => fakeChild);
    const { runClaude } = requireFreshServer();

    const promise = runClaude('プロンプト', '/tmp/workspace', 'proj-a');

    writeLine(fakeChild, { type: 'system', subtype: 'task_started', task_id: 'task-1' });
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

    writeLine(fakeChild, taskStartedEvent('task-1', 'researcher'));
    fakeChild.stdout.emit('data', Buffer.from('{this is not valid json\n'));
    fakeChild.stdout.emit('data', Buffer.from('\n'));
    writeLine(fakeChild, taskNotificationEvent('task-1', 'completed'));
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

test('runClaude: task_notificationが来ないままプロセスが終了した場合、closeで残っているサブエージェントをidleに戻す(異常系)', async (t) => {
  await withSubAgentEventSpy(t, async (emitted) => {
    const fakeChild = createFakeChild();
    t.mock.method(childProcess, 'spawn', () => fakeChild);
    const { runClaude } = requireFreshServer();

    const promise = runClaude('プロンプト', '/tmp/workspace', 'proj-a');

    writeLine(fakeChild, taskStartedEvent('task-1', 'stuck-agent'));
    writeLine(fakeChild, resultEvent('応答'));
    fakeChild.emit('close', 0);

    await promise;

    assert.deepEqual(emitted, [
      { projectId: 'proj-a', subAgentId: 'stuck-agent', status: 'working' },
      { projectId: 'proj-a', subAgentId: 'stuck-agent', status: 'idle' }
    ]);
  });
});

test('runClaude: projectIdが未指定の場合はtask_startedを検知してもサブエージェントイベントを発行しない(境界値)', async (t) => {
  await withSubAgentEventSpy(t, async (emitted) => {
    const fakeChild = createFakeChild();
    t.mock.method(childProcess, 'spawn', () => fakeChild);
    const { runClaude } = requireFreshServer();

    const promise = runClaude('プロンプト', '/tmp/workspace', null);

    writeLine(fakeChild, taskStartedEvent('task-1', 'agent-a'));
    writeLine(fakeChild, taskNotificationEvent('task-1', 'completed'));
    writeLine(fakeChild, resultEvent('応答'));
    fakeChild.emit('close', 0);

    const response = await promise;

    assert.equal(response, '応答');
    assert.deepEqual(emitted, []);
  });
});

test('runClaude: assistant/tool_use(旧Task/Agentツール検知方式)のイベントが来てもworkingイベントは発行されない(回帰)', async (t) => {
  await withSubAgentEventSpy(t, async (emitted) => {
    const fakeChild = createFakeChild();
    t.mock.method(childProcess, 'spawn', () => fakeChild);
    const { runClaude } = requireFreshServer();

    const promise = runClaude('プロンプト', '/tmp/workspace', 'proj-a');

    writeLine(fakeChild, taskToolUseEvent('tool-1', 'code-reviewer'));
    writeLine(fakeChild, toolResultEvent('tool-1'));
    writeLine(fakeChild, resultEvent('応答'));
    fakeChild.emit('close', 0);

    await promise;

    assert.deepEqual(emitted, [], 'tool_use/tool_resultベースの検知は廃止されているため、いかなるイベントも発行されない');
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
