const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

// 修正内容の回帰テスト:
// - executeApprovedTask() は以前、working状態に入った直後と成功時にautoReset()を呼び出し、
//   固定4.2秒後に強制的にidleへ戻していた。これは実際の非同期処理(Claude API呼び出し)の完了より
//   先に発火し、表示上のステータスと実際の状態が食い違う原因になっていたため削除された。
// - callClaudeChatApi() は projectId をリクエストボディに含めて /api/chat に送るようになった。
// このファイルは、working状態が非同期処理の完了まで(4.2秒を超えても)維持されること、および
// projectIdが正しく送信されることを検証する。

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

// Promiseチェーン(callClaudeChatApiのawait → .then → .finally)を安全に進めるため、
// タイマーではなくマイクロタスクだけを複数回消化する。fake timers有効時でも安全に使える。
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
    subAgents: []
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

  const appModulePath = require.resolve('../app.js');
  delete require.cache[appModulePath];
  require(appModulePath);

  await flushAsync();

  return window.document;
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

test('タスク承認直後にworking状態になり、4.2秒(旧autoResetの発火タイミング)を過ぎても非同期処理完了まではworkingのまま維持される(回帰テスト)', async (t) => {
  let resolveChatFetch;
  const chatFetchPromise = new Promise((resolve) => { resolveChatFetch = resolve; });

  const document = await setupApp({
    onChatRequest: () => chatFetchPromise
  });

  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => t.mock.timers.reset());

  submitAndApproveTask(document, 'このコードをレビューしてください');

  assert.equal(
    findWorldAgentByName(document, 'proj-a', 'Dev').dataset.status,
    'working',
    'タスク承認直後はworking状態になる'
  );

  // 旧実装のautoReset()は4200ms後に強制的にidleへ戻していた。ここでは非同期処理(fetch)が
  // 完了していないにもかかわらず、4.2秒を超えてもworkingのまま維持されることを確認する。
  t.mock.timers.tick(4300);

  assert.equal(
    findWorldAgentByName(document, 'proj-a', 'Dev').dataset.status,
    'working',
    '4.2秒を過ぎても、Claude APIの応答が返るまではworking状態が維持される(autoReset削除の確認)'
  );

  resolveChatFetch({ ok: true, json: async () => ({ ok: true, response: 'レビュー完了しました' }) });
  await flushMicrotasks();

  assert.equal(
    findWorldAgentByName(document, 'proj-a', 'Dev').dataset.status,
    'idle',
    '非同期処理が完了したタイミングでidleに戻る'
  );
  assert.ok(
    document.getElementById('chat-panel').textContent.includes('レビュー完了しました'),
    'Claudeからの応答メッセージがチャットパネルに表示される'
  );
});

test('タスク承認後にAPI呼び出しが失敗した場合はerror状態になり、working状態のまま固定されない(異常系)', async (t) => {
  let rejectChatFetch;
  const chatFetchPromise = new Promise((_resolve, reject) => { rejectChatFetch = reject; });

  const document = await setupApp({
    onChatRequest: () => chatFetchPromise
  });

  submitAndApproveTask(document, '設定ファイルを修正してください');

  assert.equal(findWorldAgentByName(document, 'proj-a', 'Dev').dataset.status, 'working');

  rejectChatFetch(new Error('ネットワークエラー'));
  await flushMicrotasks();

  assert.equal(
    findWorldAgentByName(document, 'proj-a', 'Dev').dataset.status,
    'error',
    'API呼び出しが失敗した場合はerror状態になる'
  );
});

test('callClaudeChatApiはリクエストボディにprojectIdを含めて/api/chatへ送信する(正常系)', async () => {
  const capturedRequests = [];

  const document = await setupApp({
    onChatRequest: (url, options) => {
      capturedRequests.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ ok: true, response: 'OK' }) };
    }
  });

  submitAndApproveTask(document, 'READMEを更新してください');
  await flushMicrotasks();

  assert.equal(capturedRequests.length, 1);
  assert.equal(capturedRequests[0].projectId, 'proj-a');
  assert.equal(capturedRequests[0].message, 'READMEを更新してください');
});
