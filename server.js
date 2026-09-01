const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');

const PORT = Number(process.env.PORT || 3001);

// サブエージェント(Task tool呼び出し)の開始/終了イベントをSSE購読者へ配信する。
const subAgentEvents = new EventEmitter();
subAgentEvents.setMaxListeners(100);

function resolveWorkspace(projectId) {
  const fallback = process.cwd();
  if (!projectId || typeof projectId !== 'string') {
    return fallback;
  }

  const parentDir = path.resolve(__dirname, '..');
  const candidate = path.resolve(parentDir, projectId);

  if (candidate !== parentDir && !candidate.startsWith(parentDir + path.sep)) {
    return fallback;
  }

  try {
    if (fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  } catch (error) {
    // ディレクトリが存在しない場合は agent-office 自身にフォールバック
  }

  return fallback;
}

function detectClaudeExecutable() {
  const override = process.env.CLAUDE_COMMAND?.trim();
  if (override) {
    return override;
  }

  try {
    const { execSync } = require('node:child_process');
    const resolved = execSync('command -v claude || which claude || printf ""', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
    return resolved || 'claude';
  } catch (error) {
    return 'claude';
  }
}

function escapeShellArg(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function buildClaudeConversationPrompt(history, newMessage, activeSessionId = null) {
  const messages = Array.isArray(history) ? history.filter((item) => item && typeof item.text === 'string') : [];
  const hasSessionScopedHistory = messages.some((item) => typeof item.sessionId === 'string' && item.sessionId.length > 0);

  const sessionMessages = activeSessionId
    ? messages.filter((item) => {
        if (item.sessionId === activeSessionId) {
          return true;
        }
        if (!item.sessionId) {
          return true;
        }
        return !hasSessionScopedHistory;
      })
    : messages;

  const content = sessionMessages.map((item) => {
    const role = item.role === 'user' ? 'User' : 'Assistant';
    return `${role}: ${item.text.trim()}`;
  }).join('\n\n');

  const prompt = [
    'あなたは Agent Office の AI アシスタントです。',
    'この会話は、ユーザーが明示的に承認したあとだけ、ファイル編集・コマンド実行・外部ツール利用を行います。',
    'ユーザーの依頼が「修正」「編集」「リファクタ」「実行」「テスト」「確認」などを含む場合、実際のファイル編集やコマンド操作を行う前に、明示的な許可を待ちます。',
    'ユーザーの最終メッセージが実行要求であっても、編集や実行の権限が明示されていない限り、提案だけに留めてください。',
    'もし許可が得られていない場合は、次に何を実行するかを短く説明して待機してください。',
    '',
    '以下はこのセッションの過去の会話履歴です。現在の会話セッションの文脈だけを踏まえて回答してください。',
    '',
    content ? content : 'このセッションの過去の会話はありません。',
    '',
    'User: ' + String(newMessage).trim()
  ].join('\n');

  return prompt;
}

function buildClaudeCommand(prompt, workspace = process.cwd()) {
  const executable = detectClaudeExecutable();

  return {
    executable,
    args: [
      '--add-dir',
      workspace,
      '--dangerously-skip-permissions',
      '--permission-mode',
      'bypassPermissions',
      '--output-format',
      'stream-json',
      '--verbose',
      '-p',
      String(prompt)
    ]
  };
}

function runClaude(prompt, workspace = process.cwd(), projectId = null) {
  return new Promise((resolve, reject) => {
    const command = buildClaudeCommand(prompt, workspace);

    const child = spawn(command.executable, command.args, {
      cwd: workspace,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let lineBuffer = '';
    let stderr = '';
    let finalResponse = null;
    const pendingSubAgentCalls = new Map();

    function emitSubAgentEvent(subAgentId, status) {
      if (!projectId || !subAgentId) return;
      console.log(`[${new Date().toISOString()}] SSE emit sub-agent event: projectId=${projectId}, subAgentId=${subAgentId}, status=${status}`);
      subAgentEvents.emit('event', { projectId, subAgentId, status });
    }

    function handleStreamEvent(event) {
      // サブエージェントの実際のライフサイクルは system イベント(task_started/task_notification)で通知される。
      // tool_use/tool_result はツール呼び出しの受付確認に過ぎず、is_backgrounded なサブエージェント呼び出しでは
      // 実際の完了より先に返ってきてしまうため使用しない。
      if (event.type === 'system' && event.subtype === 'task_started' && event.task_id && event.subagent_type) {
        console.log(`[${new Date().toISOString()}] stream-json task_started: task_id=${event.task_id}, subagent_type=${event.subagent_type}, is_backgrounded=${event.is_backgrounded}`);
        pendingSubAgentCalls.set(event.task_id, event.subagent_type);
        emitSubAgentEvent(event.subagent_type, 'working');
      }

      if (event.type === 'system' && event.subtype === 'task_notification' && event.status === 'completed' && pendingSubAgentCalls.has(event.task_id)) {
        console.log(`[${new Date().toISOString()}] stream-json task_notification completed: task_id=${event.task_id}`);
        const subAgentId = pendingSubAgentCalls.get(event.task_id);
        pendingSubAgentCalls.delete(event.task_id);
        emitSubAgentEvent(subAgentId, 'idle');
      }

      if (event.type === 'result' && typeof event.result === 'string') {
        finalResponse = event.result;
      }
    }

    child.stdout.on('data', (chunk) => {
      lineBuffer += chunk.toString();
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          handleStreamEvent(JSON.parse(trimmed));
        } catch (error) {
          // stream-jsonの1行がJSONとしてパースできない場合は無視する
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(new Error(`Claude Code CLI を起動できませんでした: ${error.message}`));
    });

    child.on('close', (code) => {
      // 終了確認イベントが来なかったサブエージェント呼び出しはworking表示のまま固定されないようここで戻す
      for (const subAgentId of pendingSubAgentCalls.values()) {
        emitSubAgentEvent(subAgentId, 'idle');
      }

      if (code === 0) {
        resolve((finalResponse || '').trim() || 'Claude Code が空の応答を返しました。');
        return;
      }

      const message = stderr.trim() || `Claude Code が終了コード ${code} で失敗しました。`;
      reject(new Error(message));
    });
  });
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, status: 'ready', claude: detectClaudeExecutable() }));
    return;
  }

  if (req.method === 'GET' && req.url === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    res.write('\n');

    const listener = (payload) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };
    subAgentEvents.on('event', listener);

    req.on('close', () => {
      subAgentEvents.off('event', listener);
    });
    return;
  }

  if (req.method !== 'POST' || req.url !== '/api/chat') {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'Not found' }));
    return;
  }

  console.log(`[${new Date().toISOString()}] POST /api/chat incoming`);

  let rawBody = '';

  req.on('data', (chunk) => {
    rawBody += chunk;
  });

  req.on('end', async () => {
    try {
      const requestBody = rawBody ? JSON.parse(rawBody) : {};
      const promptText = typeof requestBody.message === 'string' ? requestBody.message.trim() : '';
      const history = Array.isArray(requestBody.history) ? requestBody.history : [];
      const activeSessionId = typeof requestBody.sessionId === 'string' ? requestBody.sessionId : null;
      const projectId = typeof requestBody.projectId === 'string' ? requestBody.projectId : null;
      const workspace = resolveWorkspace(projectId);

      console.log(`[${new Date().toISOString()}] Request parsed: message length=${promptText.length}, history size=${history.length}, sessionId=${activeSessionId}, projectId=${projectId}, workspace=${workspace}`);

      if (!promptText) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'Prompt is required.' }));
        return;
      }

      const prompt = buildClaudeConversationPrompt(history, promptText, activeSessionId);
      console.log(`[${new Date().toISOString()}] Calling Claude with prompt (${prompt.length} chars)`);

      const response = await runClaude(prompt, workspace, projectId);
      console.log(`[${new Date().toISOString()}] Claude responded (${response.length} chars)`);
      
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, response }));
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR:`, error.message);
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: false,
        error: error.message,
        hint: 'Claude Code CLI をインストールし、PATH に claude が存在するか、CLAUDE_COMMAND 環境変数で実行パスを指定してください。'
      }));
    }
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Claude chat server running on http://localhost:${PORT}`);
  });
}

module.exports = {
  detectClaudeExecutable,
  runClaude,
  buildClaudeConversationPrompt,
  buildClaudeCommand,
  resolveWorkspace
};
