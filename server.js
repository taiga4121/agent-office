const http = require('node:http');
const { spawn } = require('node:child_process');

const PORT = Number(process.env.PORT || 3001);

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

function buildClaudeCommand(prompt) {
  const executable = detectClaudeExecutable();
  const workspace = process.cwd();

  return {
    executable,
    args: [
      '--add-dir',
      workspace,
      '--dangerously-skip-permissions',
      '--permission-mode',
      'bypassPermissions',
      '-p',
      String(prompt)
    ]
  };
}

function runClaude(prompt) {
  return new Promise((resolve, reject) => {
    const workspace = process.cwd();
    const command = buildClaudeCommand(prompt);

    const child = spawn(command.executable, command.args, {
      cwd: workspace,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(new Error(`Claude Code CLI を起動できませんでした: ${error.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim() || 'Claude Code が空の応答を返しました。');
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

      console.log(`[${new Date().toISOString()}] Request parsed: message length=${promptText.length}, history size=${history.length}, sessionId=${activeSessionId}`);

      if (!promptText) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'Prompt is required.' }));
        return;
      }

      const prompt = buildClaudeConversationPrompt(history, promptText, activeSessionId);
      console.log(`[${new Date().toISOString()}] Calling Claude with prompt (${prompt.length} chars)`);
      
      const response = await runClaude(prompt);
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
  buildClaudeCommand
};
