const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

// app.jsには、Agentのステータスを更新する2つの独立した経路がある。
// 1. executeApprovedTask() → callClaudeChatApi() → setAgentStatus()
//    (メインエージェントがユーザーの指示を承認・実行する経路)
// 2. subscribeToSubAgentEvents() → EventSource.onmessage → setAgentStatus()
//    (サーバーがClaude CLIのTask/Agentツール呼び出しをSSEで通知する経路)
// 両者は同じsetAgentStatus()/render()を経由するが、更新対象のagentIdが異なる限りは
// 互いの状態を上書きしてはならない。このファイルは、この2つの経路が同時に動いても
// 各エージェントのステータスが独立して正しく維持されることを検証する。

class MockEventSource {
  constructor(url) {
    this.url = url;
    this.onmessage = null;
    this.onerror = null;
    MockEventSource.instances.push(this);
  }
}
MockEventSource.instances = [];

const PAGE_HTML = `<!DOCTYPE html>
<html lang="ja">
  <body>
    <div class="app-shell">
      <header class="topbar">
        <button id="project-list-button" type="button" class="project-list-button">プロジェクト一覧</button>
      </header>
      <section id="project-list-panel" class="project-list-panel hidden"></section>
      <main class="workspace-layout">
        <div id="app" class="office-layout"></div>
        <aside id="chat-panel" class="chat-panel"></aside>
      </main>
    </div>
  </body>
</html>`;

function flushAsync() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function flushMicrotasks(times = 20) {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

function defaultProject() {
  return {
    id: 'proj-a',
    name: 'プロジェクトA',
    icon: '🏢',
    visible: true,
    mainAgent: { id: 'agent-main', name: 'Dev', role: 'Developer', status: 'idle', activity: 'Ready' },
    subAgents: [
      { id: 'agent-sub-1', name: 'Sub One', role: 'Researcher', status: 'idle', activity: 'Ready' }
    ]
  };
}

async function setupApp({ projects = [defaultProject()], onChatRequest = null } = {}) {
  const dom = new JSDOM(PAGE_HTML, { url: 'http://localhost/' });
  const { window } = dom;

  global.window = window;
  global.document = window.document;
  global.localStorage = window.localStorage;
  global.sessionStorage = window.sessionStorage;
  global.fetch = async (url, options) => {
    if (String(url).includes('projects.json')) {
      return { ok: true, json: async () => projects };
    }
    if (String(url).includes('/api/chat') && onChatRequest) {
      return onChatRequest(url, options);
    }
    return { ok: true, json: async () => ({ ok: true, response: '' }) };
  };

  MockEventSource.instances = [];
  global.EventSource = MockEventSource;

  const appModulePath = require.resolve('../app.js');
  delete require.cache[appModulePath];
  require(appModulePath);

  await flushAsync();

  return window.document;
}

function getLatestEventSource() {
  return MockEventSource.instances[MockEventSource.instances.length - 1];
}

function findWorldAgentByName(document, projectId, agentName) {
  const room = document.querySelector(`.project-room[data-project-id="${projectId}"]`);
  const agents = [...room.querySelectorAll('.world-agent')];
  return agents.find((el) => el.querySelector('.agent-tag span')?.textContent === agentName);
}

function submitAndApproveTask(document, taskText) {
  const textArea = document.getElementById('chat-input');
  const sendButton = document.getElementById('chat-send-button');
  textArea.value = taskText;
  sendButton.click();

  const allowButton = document.getElementById('chat-panel').querySelector('[data-permission="allow"]');
  assert.ok(allowButton, '承認ダイアログのallowボタンが描画されていること');
  allowButton.click();
}

test('メインエージェントがタスク実行中(working)でも、SSEで通知されたサブエージェントのworkingは独立して反映される(正常系)', async () => {
  let resolveChatFetch;
  const chatFetchPromise = new Promise((resolve) => { resolveChatFetch = resolve; });

  const document = await setupApp({ onChatRequest: () => chatFetchPromise });
  const eventSource = getLatestEventSource();

  submitAndApproveTask(document, 'このコードをレビューしてください');
  assert.equal(findWorldAgentByName(document, 'proj-a', 'Dev').dataset.status, 'working');

  eventSource.onmessage({
    data: JSON.stringify({ projectId: 'proj-a', subAgentId: 'agent-sub-1', status: 'working' })
  });

  assert.equal(
    findWorldAgentByName(document, 'proj-a', 'Sub One').dataset.status,
    'working',
    'SSE経由でサブエージェントもworkingになる'
  );
  assert.equal(
    findWorldAgentByName(document, 'proj-a', 'Dev').dataset.status,
    'working',
    'サブエージェントの更新でメインエージェントのworking状態が上書きされない'
  );

  resolveChatFetch({ ok: true, json: async () => ({ ok: true, response: '完了しました' }) });
  await flushMicrotasks();

  assert.equal(
    findWorldAgentByName(document, 'proj-a', 'Dev').dataset.status,
    'idle',
    'メインエージェントはAPI応答完了でidleに戻る'
  );
  assert.equal(
    findWorldAgentByName(document, 'proj-a', 'Sub One').dataset.status,
    'working',
    'メインエージェントがidleに戻っても、サブエージェントのworking状態はSSEのidle通知が来るまで維持される'
  );
});

test('サブエージェントがSSE経由でworking中に、メインエージェントのタスクがエラー終了しても、サブエージェントの状態は上書きされない(異常系)', async () => {
  let rejectChatFetch;
  const chatFetchPromise = new Promise((_resolve, reject) => { rejectChatFetch = reject; });

  const document = await setupApp({ onChatRequest: () => chatFetchPromise });
  const eventSource = getLatestEventSource();

  eventSource.onmessage({
    data: JSON.stringify({ projectId: 'proj-a', subAgentId: 'agent-sub-1', status: 'working' })
  });
  assert.equal(findWorldAgentByName(document, 'proj-a', 'Sub One').dataset.status, 'working');

  submitAndApproveTask(document, '設定ファイルを修正してください');
  assert.equal(findWorldAgentByName(document, 'proj-a', 'Dev').dataset.status, 'working');

  rejectChatFetch(new Error('ネットワークエラー'));
  await flushMicrotasks();

  assert.equal(
    findWorldAgentByName(document, 'proj-a', 'Dev').dataset.status,
    'error',
    'メインエージェントはAPI呼び出し失敗でerrorになる'
  );
  assert.equal(
    findWorldAgentByName(document, 'proj-a', 'Sub One').dataset.status,
    'working',
    'メインエージェントのerror化はSSEで管理されているサブエージェントの状態に影響しない'
  );

  eventSource.onmessage({
    data: JSON.stringify({ projectId: 'proj-a', subAgentId: 'agent-sub-1', status: 'idle' })
  });

  assert.equal(
    findWorldAgentByName(document, 'proj-a', 'Sub One').dataset.status,
    'idle',
    'SSEのidle通知でサブエージェントの状態が更新される'
  );
  assert.equal(
    findWorldAgentByName(document, 'proj-a', 'Dev').dataset.status,
    'error',
    'サブエージェントの状態更新がメインエージェントのerror状態を上書きしない'
  );
});
