const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

// app.js が起動時に呼び出す subscribeToSubAgentEvents() は、SSEエンドポイント(/api/events)を
// EventSourceで購読し、受信した {projectId, subAgentId, status} を使って該当エージェントの
// ステータスを更新する。jsdomはEventSourceを実装していないため、テストではブラウザ実装の代わりに
// 最小限のモックを注入し、生成されたインスタンスのonmessageハンドラを直接呼び出して検証する。
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

function projectWithSubAgent() {
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

// setupApp() は各テストごとにjsdomの新しいwindow/documentを組み立て、app.jsをrequireキャッシュから
// 取り除いてから再requireすることで、app.jsのモジュールスコープの状態(store)をテスト間で分離する。
async function setupApp({ projects = [projectWithSubAgent()], provideEventSource = true } = {}) {
  const dom = new JSDOM(PAGE_HTML, { url: 'http://localhost/' });
  const { window } = dom;

  global.window = window;
  global.document = window.document;
  global.localStorage = window.localStorage;
  global.sessionStorage = window.sessionStorage;
  global.fetch = async (url) => {
    if (String(url).includes('projects.json')) {
      return { ok: true, json: async () => projects };
    }
    return { ok: true, json: async () => ({ ok: true, response: '' }) };
  };

  MockEventSource.instances = [];
  if (provideEventSource) {
    global.EventSource = MockEventSource;
  } else {
    delete global.EventSource;
  }

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

test('SSEでworkingイベントを受信すると該当のサブエージェントのステータスがworkingになる(正常系)', async () => {
  const document = await setupApp();
  const eventSource = getLatestEventSource();
  assert.ok(eventSource, 'subscribeToSubAgentEvents()によりEventSourceが生成されていること');
  assert.ok(typeof eventSource.onmessage === 'function');

  const before = findWorldAgentByName(document, 'proj-a', 'Sub One');
  assert.equal(before.dataset.status, 'idle');

  eventSource.onmessage({
    data: JSON.stringify({ projectId: 'proj-a', subAgentId: 'agent-sub-1', status: 'working' })
  });

  const after = findWorldAgentByName(document, 'proj-a', 'Sub One');
  assert.equal(after.dataset.status, 'working');
});

test('SSEでidleイベントを受信すると該当のサブエージェントのステータスがidleに戻る(正常系)', async () => {
  const document = await setupApp();
  const eventSource = getLatestEventSource();

  eventSource.onmessage({
    data: JSON.stringify({ projectId: 'proj-a', subAgentId: 'agent-sub-1', status: 'working' })
  });
  assert.equal(findWorldAgentByName(document, 'proj-a', 'Sub One').dataset.status, 'working');

  eventSource.onmessage({
    data: JSON.stringify({ projectId: 'proj-a', subAgentId: 'agent-sub-1', status: 'idle' })
  });
  assert.equal(findWorldAgentByName(document, 'proj-a', 'Sub One').dataset.status, 'idle');
});

test('存在しないprojectIdのイベントを受信しても、既存プロジェクトの状態は変化せずクラッシュしない(異常系)', async () => {
  const document = await setupApp();
  const eventSource = getLatestEventSource();

  assert.doesNotThrow(() => {
    eventSource.onmessage({
      data: JSON.stringify({ projectId: 'proj-not-found', subAgentId: 'agent-sub-1', status: 'working' })
    });
  });

  assert.equal(findWorldAgentByName(document, 'proj-a', 'Sub One').dataset.status, 'idle');
  assert.equal(findWorldAgentByName(document, 'proj-a', 'Dev').dataset.status, 'idle');
});

test('存在するprojectIdだが存在しないsubAgentIdのイベントを受信しても、状態は変化せずクラッシュしない(異常系)', async () => {
  const document = await setupApp();
  const eventSource = getLatestEventSource();

  assert.doesNotThrow(() => {
    eventSource.onmessage({
      data: JSON.stringify({ projectId: 'proj-a', subAgentId: 'agent-not-found', status: 'working' })
    });
  });

  assert.equal(findWorldAgentByName(document, 'proj-a', 'Sub One').dataset.status, 'idle');
  assert.equal(findWorldAgentByName(document, 'proj-a', 'Dev').dataset.status, 'idle');
});

test('event.dataが不正なJSONの場合はクラッシュせず、状態も変化しない(異常系)', async () => {
  const document = await setupApp();
  const eventSource = getLatestEventSource();

  assert.doesNotThrow(() => {
    eventSource.onmessage({ data: 'これはJSONではありません' });
  });

  assert.equal(findWorldAgentByName(document, 'proj-a', 'Sub One').dataset.status, 'idle');
});

test('projectIdまたはsubAgentIdが欠けたペイロードは無視される(境界値)', async () => {
  const document = await setupApp();
  const eventSource = getLatestEventSource();

  assert.doesNotThrow(() => {
    eventSource.onmessage({ data: JSON.stringify({ projectId: 'proj-a', status: 'working' }) });
    eventSource.onmessage({ data: JSON.stringify({ subAgentId: 'agent-sub-1', status: 'working' }) });
    eventSource.onmessage({ data: JSON.stringify({}) });
  });

  assert.equal(findWorldAgentByName(document, 'proj-a', 'Sub One').dataset.status, 'idle');
});

test('EventSourceが利用できない環境ではsubscribeToSubAgentEventsは何もせず、アプリの初期化には影響しない(境界値)', async () => {
  const document = await setupApp({ provideEventSource: false });

  assert.equal(MockEventSource.instances.length, 0);
  assert.ok(document.querySelector('.project-room[data-project-id="proj-a"]'), 'EventSource非対応でも通常の描画は行われる');
});
