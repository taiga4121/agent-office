const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

// app.js persists chat history under this localStorage key (see chatHistoryStorageKey in app.js).
const CHAT_HISTORY_STORAGE_KEY = 'agent-office-chat-history';

// Minimal skeleton of index.html: only the elements app.js actually queries via
// document.getElementById are required for the module to boot without throwing.
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
  // app.js calls the async init() at module load time without awaiting it.
  // A single macrotask tick is enough to let the mocked fetch chain and the
  // subsequent render() settle before assertions run.
  return new Promise((resolve) => setTimeout(resolve, 0));
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

// Boots app.js inside a fresh jsdom document/window pair so each test starts
// from a clean module state (app.js keeps its store in module-level `let`
// variables, so the require cache must be cleared every time).
async function setupApp({ projects = [defaultProject()], storedChatHistory = null } = {}) {
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

  if (storedChatHistory) {
    window.localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(storedChatHistory));
  }

  const appModulePath = require.resolve('../app.js');
  delete require.cache[appModulePath];
  require(appModulePath);

  await flushAsync();

  return window.document;
}

function getChatPanel(document) {
  return document.getElementById('chat-panel');
}

test('新規セッションボタンを押すと、表示中のメッセージが新しい空セッションに切り替わる(回帰テスト)', async () => {
  const document = await setupApp({
    storedChatHistory: {
      'proj-a': [
        { role: 'user', text: '古いセッションのメッセージです', sessionId: 'old-session-1' },
        { role: 'assistant', text: '古いセッションへの返答です', sessionId: 'old-session-1' }
      ]
    }
  });

  const chatPanel = getChatPanel(document);

  // 前提: 初期状態では既存セッションのメッセージが表示されている。
  assert.ok(chatPanel.textContent.includes('古いセッションのメッセージです'));
  assert.ok(chatPanel.textContent.includes('古いセッションへの返答です'));

  const newSessionButton = chatPanel.querySelector('.chat-new-session-button[data-new-session]');
  assert.ok(newSessionButton, '新規セッションボタンが描画されていること');

  newSessionButton.click();

  // バグ修正の核心: 空の新規セッションが getActiveSessionId によって
  // 即座に古いセッションIDへ巻き戻されないこと。
  assert.ok(
    !chatPanel.textContent.includes('古いセッションのメッセージです'),
    '新規セッション作成後に古いセッションのメッセージが表示され続けていない'
  );
  assert.ok(
    chatPanel.textContent.includes('履歴なし'),
    '新規セッションはメッセージが無いため空状態が表示される'
  );

  // 2回目のクリックでも同様に切り替わること(切り替え直後だけ有効になる回帰を防ぐ)。
  const secondNewSessionButton = chatPanel.querySelector('.chat-new-session-button[data-new-session]');
  secondNewSessionButton.click();
  assert.ok(
    !chatPanel.textContent.includes('古いセッションのメッセージです'),
    '2回目の新規セッション作成後も古いセッションのメッセージへ戻らない'
  );
  assert.ok(chatPanel.textContent.includes('履歴なし'));

  // 履歴ドロップダウンを開くと、旧セッションと現在アクティブな新規セッションの2件が一覧できる。
  // (メッセージが送信されていない空セッションは、新規セッション作成のたびに
  //  アクティブセッションIDが置き換わるだけで、履歴として蓄積はされない)
  const historyToggle = chatPanel.querySelector('.chat-history-toggle[data-history-toggle]');
  historyToggle.click();
  const historyItems = chatPanel.querySelectorAll('.chat-history-item[data-session-id]');
  assert.equal(historyItems.length, 2, '旧セッション1件 + 現在の新規セッション1件が履歴に並ぶ');
});

test('履歴ドロップダウンから過去のセッションを選択すると、そのセッションのメッセージ表示に切り替わる', async () => {
  const document = await setupApp({
    storedChatHistory: {
      'proj-a': [
        { role: 'user', text: 'セッション1のメッセージ', sessionId: 'session-1' },
        { role: 'assistant', text: 'セッション1の返答', sessionId: 'session-1' },
        { role: 'user', text: 'セッション2のメッセージ', sessionId: 'session-2' },
        { role: 'assistant', text: 'セッション2の返答', sessionId: 'session-2' }
      ]
    }
  });

  const chatPanel = getChatPanel(document);

  // 最初に見つかったセッション(session-1)がアクティブになっている。
  assert.ok(chatPanel.textContent.includes('セッション1のメッセージ'));
  assert.ok(!chatPanel.textContent.includes('セッション2のメッセージ'));

  const historyToggle = chatPanel.querySelector('.chat-history-toggle[data-history-toggle]');
  historyToggle.click();

  const historyItems = [...chatPanel.querySelectorAll('.chat-history-item[data-session-id]')];
  assert.equal(historyItems.length, 2);

  const otherSessionButton = historyItems.find((item) => item.getAttribute('aria-pressed') === 'false');
  assert.ok(otherSessionButton, '非アクティブなセッションの履歴ボタンが存在する');

  otherSessionButton.click();

  assert.ok(
    chatPanel.textContent.includes('セッション2のメッセージ'),
    '選択したセッションのメッセージに切り替わる'
  );
  assert.ok(
    !chatPanel.textContent.includes('セッション1のメッセージ'),
    '切り替え後は以前のセッションのメッセージが表示されない'
  );

  // セッション選択後は履歴ドロップダウンが自動的に閉じる。
  assert.equal(chatPanel.querySelector('.chat-history-list'), null);

  // 再度開いて、選択したセッションがアクティブ表示になっていることを確認する。
  chatPanel.querySelector('.chat-history-toggle[data-history-toggle]').click();
  const activeButton = chatPanel.querySelector('.chat-history-item[data-session-id="session-2"]');
  assert.ok(activeButton, '切り替え後も session-2 は履歴一覧に残っている');
  assert.equal(activeButton.getAttribute('aria-pressed'), 'true');
  assert.ok(activeButton.classList.contains('is-active'));
});

test('メッセージが1件も無い新規プロジェクトでも、新規セッションボタン押下後に空状態のまま維持される(境界値)', async () => {
  // localStorageにチャット履歴が無い = 完全に新規のプロジェクト。
  const document = await setupApp({ storedChatHistory: null });

  const chatPanel = getChatPanel(document);

  assert.ok(
    chatPanel.textContent.includes('履歴なし'),
    '初期状態(メッセージ0件)では空状態が表示される'
  );

  const newSessionButton = chatPanel.querySelector('.chat-new-session-button[data-new-session]');
  newSessionButton.click();

  assert.ok(
    chatPanel.textContent.includes('履歴なし'),
    'メッセージが無いプロジェクトで新規セッションを作成してもクラッシュせず空状態を維持する'
  );

  const historyToggle = chatPanel.querySelector('.chat-history-toggle[data-history-toggle]');
  historyToggle.click();
  const historyItems = chatPanel.querySelectorAll('.chat-history-item[data-session-id]');
  assert.equal(historyItems.length, 1, '空セッションであっても現在のセッション1件は履歴に表示される');
});

test('履歴ドロップダウンのトグルボタンで開閉状態が切り替わる', async () => {
  const document = await setupApp({
    storedChatHistory: {
      'proj-a': [{ role: 'user', text: 'こんにちは', sessionId: 'session-1' }]
    }
  });

  const chatPanel = getChatPanel(document);
  const historyToggle = chatPanel.querySelector('.chat-history-toggle[data-history-toggle]');

  assert.equal(historyToggle.getAttribute('aria-expanded'), 'false');
  assert.equal(chatPanel.querySelector('.chat-history-list'), null, '初期状態では履歴一覧は非表示');

  historyToggle.click();

  const reopenedToggle = chatPanel.querySelector('.chat-history-toggle[data-history-toggle]');
  assert.equal(reopenedToggle.getAttribute('aria-expanded'), 'true');
  const historyList = chatPanel.querySelector('.chat-history-list');
  assert.ok(historyList, '開いた状態では履歴一覧が描画される');
  assert.equal(historyList.querySelectorAll('.chat-history-item').length, 1);
});
