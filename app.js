const statusIcons = {
  idle: "🧑‍💼",
  working: "💻",
  waiting: "🧑‍💻",
  error: "⚠️"
};

const statusLabels = {
  idle: "Idle",
  working: "Working",
  waiting: "Waiting",
  error: "Error"
};

const projectVisibilityStorageKey = "agent-office-project-visibility";
const chatHistoryStorageKey = "agent-office-chat-history";
const debugLogsStorageKey = "agent-office-debug-logs";

// Debug log buffer to capture logs across reloads
let debugLogs = [];
function addDebugLog(level, message, data) {
  const timestamp = new Date().toISOString();
  const logEntry = { timestamp, level, message, data };
  debugLogs.push(logEntry);
  
  // Keep only last 100 logs to avoid bloating memory
  if (debugLogs.length > 100) {
    debugLogs.shift();
  }
  
  // Also save to sessionStorage for persistence across reloads
  try {
    sessionStorage.setItem(debugLogsStorageKey, JSON.stringify(debugLogs));
  } catch (e) {
    // sessionStorage might be full, ignore
  }
  
  // Also log to console
  console.log(`[${level}] ${message}`, data || "");
}

// Load debug logs from sessionStorage if available
try {
  const stored = sessionStorage.getItem(debugLogsStorageKey);
  if (stored) {
    debugLogs = JSON.parse(stored);
  }
} catch (e) {
  // Ignore parse errors
}

let projects = [];
let showProjectList = false;
let activeProjectId = null;
let activeSessionByProject = {};
let chatMessagesByProject = {};
let pendingPermission = null;

let historyOpenForProject = null;

async function loadProjects() {
  try {
    const response = await fetch("./projects.json");
    if (!response.ok) throw new Error("Failed to load project list");
    const data = await response.json();
    return Array.isArray(data) ? data : data.projects || [];
  } catch (error) {
    return [];
  }
}

function loadStoredVisibility(projectsData) {
  try {
    const raw = localStorage.getItem(projectVisibilityStorageKey);
    if (!raw) {
      return projectsData.map((project) => ({
        ...project,
        visible: project.visible ?? true
      }));
    }

    const stored = JSON.parse(raw);
    return projectsData.map((project) => ({
      ...project,
      visible: stored[project.id] ?? project.visible ?? true
    }));
  } catch (error) {
    return projectsData.map((project) => ({
      ...project,
      visible: project.visible ?? true
    }));
  }
}

function persistProjectVisibility() {
  const visibilityMap = Object.fromEntries(
    projects.map((project) => [project.id, project.visible !== false])
  );
  localStorage.setItem(projectVisibilityStorageKey, JSON.stringify(visibilityMap));
}

function getAgentById(project, agentId) {
  if (!project) return null;
  if (project.mainAgent && project.mainAgent.id === agentId) return project.mainAgent;
  return (project.subAgents || []).find((item) => item.id === agentId) || null;
}

function setAgentStatus(projectId, agentId, nextStatus, activity) {
  const project = projects.find((item) => item.id === projectId);
  if (!project) return;

  const agent = getAgentById(project, agentId);
  if (!agent) return;

  const isSubAgent = project.mainAgent?.id !== agentId;
  if (isSubAgent) {
    addDebugLog("INFO", "setAgentStatus (sub-agent)", { projectId, agentId, prevStatus: agent.status, nextStatus });
  }

  agent.status = nextStatus;
  agent.activity = activity;
  render();
}

function chooseAgentForTask(taskText) {
  const normalized = taskText.toLowerCase();
  const targetProject = projects[Math.floor(Math.random() * projects.length)] || null;

  if (!targetProject) {
    return { projectId: null, agentId: null };
  }

  const mainAgentId = targetProject.mainAgent?.id || null;
  if (!mainAgentId) {
    return { projectId: null, agentId: null };
  }

  if (/(調査|research|調べ|株価|api|分析|market)/.test(normalized)) {
    return { projectId: targetProject.id, agentId: mainAgentId };
  }

  if (/(修正|fix|bug|レビュー|review|test|テスト)/.test(normalized)) {
    return { projectId: targetProject.id, agentId: mainAgentId };
  }

  return { projectId: targetProject.id, agentId: mainAgentId };
}

function renderAgent(agent, isMain = false) {
  return `
    <article class="agent-card ${isMain ? 'is-main' : ''}" data-status="${agent.status}">
      <div class="agent-top">
        <span class="agent-role">${agent.role}</span>
        <span class="agent-status">${statusLabels[agent.status]}</span>
      </div>
      <div class="agent-avatar" aria-label="${agent.name} ${statusLabels[agent.status]}">${statusIcons[agent.status]}</div>
      <h3 class="agent-name">${agent.name}</h3>
      ${isMain ? '<div class="main-badge">Main Agent</div>' : '<div class="sub-badge">Sub Agent</div>'}
      <p class="agent-activity">${agent.activity}</p>
    </article>
  `;
}

function renderProject(project) {
  const mainAgent = project.mainAgent || { id: "main-agent", name: `${project.name}マネージャー`, role: "Main Agent", status: "idle", activity: "Ready for task" };
  const subAgents = Array.isArray(project.subAgents) ? project.subAgents : [];
  const allAgents = [mainAgent, ...subAgents];

  const positions = [
    { x: 18, y: 42, role: "left" },
    { x: 50, y: 42, role: "center" },
    { x: 82, y: 42, role: "right" },
    { x: 28, y: 70, role: "left" },
    { x: 50, y: 70, role: "center" },
    { x: 72, y: 70, role: "right" },
    { x: 18, y: 86, role: "left" },
    { x: 50, y: 86, role: "center" },
    { x: 82, y: 86, role: "right" }
  ];

  const roomAgents = allAgents.slice(0, positions.length).map((agent, index) => ({
    agent,
    x: positions[index].x,
    y: positions[index].y,
    role: positions[index].role
  }));

  const renderWorldAgent = ({ agent, x, y, role }) => `
    <div class="world-object world-agent world-agent--${role}" data-status="${agent.status}" style="left:${x}%; top:${y}%">
      <div class="desk-unit" aria-hidden="true">
        <span class="desk-surface">💻</span>
      </div>
      <div class="agent-avatar-world">${statusIcons[agent.status]}</div>
      <div class="agent-tag">
        <span>${agent.name}</span>
        <small>${statusLabels[agent.status]}</small>
      </div>
    </div>
  `;

  const isSelected = activeProjectId === project.id;

  return `
    <section class="project-room ${isSelected ? "is-selected" : ""}" data-project-id="${project.id}" aria-label="${project.name} project room">
      <div class="room-header is-visible">
        <div class="room-title-wrap">
          <span class="room-title-icon">💻</span>
          <h2>${project.name}</h2>
        </div>
      </div>

      <div class="room-world" aria-label="${project.name} room world">
        <div class="room-wall" aria-hidden="true"></div>
        <div class="room-floor" aria-hidden="true">
          <div class="furniture-layer">
            <div class="furniture-item furniture-item--left">📚</div>
            <div class="furniture-item furniture-item--right">📋</div>
            <div class="furniture-item furniture-item--plant left">🌱</div>
            <div class="furniture-item furniture-item--plant right">🌱</div>
          </div>
          ${roomAgents.map(renderWorldAgent).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderProjectListPanel() {
  const panel = document.getElementById("project-list-panel");
  if (!panel) return;

  const projectList = projects.map((project) => `
    <label class="project-list-item ${project.visible === false ? "is-hidden" : ""}">
      <span class="project-list-name">${project.icon} ${project.name}</span>
      <span class="project-list-state">${project.visible === false ? "非表示" : "表示中"}</span>
      <input type="checkbox" data-project-id="${project.id}" ${project.visible !== false ? "checked" : ""}>
    </label>
  `).join("");

  panel.innerHTML = `
    <h3>プロジェクト一覧</h3>
    <div class="project-list-items">${projectList}</div>
  `;
  panel.classList.toggle("hidden", !showProjectList);

  panel.querySelectorAll("input[data-project-id]").forEach((toggle) => {
    toggle.addEventListener("change", (event) => {
      const projectId = event.target.dataset.projectId;
      const targetProject = projects.find((project) => project.id === projectId);
      if (!targetProject) {
        return;
      }

      targetProject.visible = event.target.checked;
      persistProjectVisibility();
      if (!targetProject.visible && activeProjectId === projectId) {
        activeProjectId = projects.find((project) => project.visible !== false)?.id || null;
      }
      render();
      renderProjectListPanel();
    });
  });
}

function persistChatMessages() {
  localStorage.setItem(chatHistoryStorageKey, JSON.stringify(chatMessagesByProject));
}

function loadStoredChatMessages() {
  try {
    const raw = localStorage.getItem(chatHistoryStorageKey);
    if (!raw) {
      return {};
    }

    const stored = JSON.parse(raw);
    return stored && typeof stored === "object" ? stored : {};
  } catch (error) {
    return {};
  }
}

function createSessionId(projectId) {
  return `${projectId}-session-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function getProjectSessionIds(projectId) {
  const projectMessages = Array.isArray(chatMessagesByProject[projectId]) ? chatMessagesByProject[projectId] : [];
  const sessionIds = new Set(projectMessages
    .map((message) => message?.sessionId)
    .filter((sessionId) => typeof sessionId === "string" && sessionId.length > 0));

  const activeSessionId = activeSessionByProject[projectId];
  if (typeof activeSessionId === "string" && activeSessionId.length > 0) {
    sessionIds.add(activeSessionId);
  }

  if (sessionIds.size) {
    return [...sessionIds];
  }

  const fallbackSessionId = createSessionId(projectId);
  chatMessagesByProject[projectId] = [];
  activeSessionByProject[projectId] = fallbackSessionId;
  return [fallbackSessionId];
}

function getActiveSessionId(projectId) {
  const sessionIds = getProjectSessionIds(projectId);
  if (!activeSessionByProject[projectId] || !sessionIds.includes(activeSessionByProject[projectId])) {
    activeSessionByProject[projectId] = sessionIds[0];
  }
  return activeSessionByProject[projectId];
}

function setActiveSessionId(projectId, sessionId) {
  const sessionIds = getProjectSessionIds(projectId);
  if (!sessionIds.includes(sessionId)) {
    return;
  }

  activeSessionByProject[projectId] = sessionId;
  renderChatPanel();
}

function createNewSession(projectId) {
  const nextSessionId = createSessionId(projectId);
  activeSessionByProject[projectId] = nextSessionId;
  return nextSessionId;
}

function getProjectMessages(projectId, sessionId = null) {
  const activeSessionId = sessionId || getActiveSessionId(projectId);
  const projectMessages = Array.isArray(chatMessagesByProject[projectId]) ? chatMessagesByProject[projectId] : [];
  const hasSessionScopedMessages = projectMessages.some((message) => typeof message?.sessionId === "string" && message.sessionId.length > 0);

  return projectMessages.filter((message) => {
    if (!message || typeof message.text !== "string") {
      return false;
    }

    if (message.sessionId === activeSessionId) {
      return true;
    }

    if (!message.sessionId) {
      return true;
    }

    return !hasSessionScopedMessages;
  });
}

function appendProjectMessage(projectId, message) {
  if (!chatMessagesByProject[projectId]) {
    chatMessagesByProject[projectId] = [];
  }

  chatMessagesByProject[projectId].push(message);
  persistChatMessages();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderChatPanel() {
  const panel = document.getElementById("chat-panel");
  if (!panel) return;

  const selectedProject = projects.find((project) => project.id === activeProjectId) || projects[0];
  if (!selectedProject) {
    panel.innerHTML = "";
    return;
  }

  const activeSessionId = getActiveSessionId(selectedProject.id);
  const messages = getProjectMessages(selectedProject.id, activeSessionId);
  const isHistoryOpen = historyOpenForProject === selectedProject.id;
  const historyItems = getProjectSessionIds(selectedProject.id).map((sessionId) => `
    <button
      type="button"
      class="chat-history-item ${sessionId === activeSessionId ? "is-active" : ""}"
      data-session-id="${sessionId}"
      aria-pressed="${sessionId === activeSessionId}"
    >
      ${sessionId === activeSessionId ? "現在の会話" : `会話 ${sessionId.slice(-2)}`}
    </button>
  `).join("");
  const messageMarkup = messages.length ? messages.map((message) => `
    <div class="chat-message ${message.role === "user" ? "is-user" : "is-assistant"}">
      <span class="chat-bubble">${escapeHtml(message.text)}</span>
    </div>
  `).join("") : `
    <div class="chat-empty-state">履歴なし</div>
  `;

  const thinkingIndicator = window.__agentOfficeThinkingForProject === selectedProject.id ? `
    <div class="chat-message is-assistant is-thinking">
      <span class="chat-bubble chat-bubble--thinking">
        <span class="thinking-dots" aria-label="考え中"><span></span><span></span><span></span></span>
        Claude Code が考えています...
      </span>
    </div>
  ` : "";

  const permissionDialog = pendingPermission && pendingPermission.projectId === selectedProject.id ? `
    <div class="permission-dialog" role="dialog" aria-modal="true" aria-label="Claude Code approval dialog">
      <div class="permission-dialog__header">
        <span class="permission-dialog__icon">⚠️</span>
        <span>Agent 実行許可</span>
      </div>
      <p class="permission-dialog__text">エージェントが次の操作を実行しようとしています。許可しますか?</p>
      <div class="permission-dialog__body">
        <div class="permission-dialog__label">許可対象</div>
        <div class="permission-dialog__action">${escapeHtml(pendingPermission.actionLabel || "ファイル編集とコマンド実行")}</div>
      </div>
      <div class="permission-dialog__actions">
        <button type="button" class="permission-dialog__button permission-dialog__button--secondary" data-permission="deny">拒否</button>
        <button type="button" class="permission-dialog__button permission-dialog__button--primary" data-permission="allow">許可</button>
      </div>
    </div>
  ` : "";

  panel.innerHTML = `
    <div class="chat-header">
      <div class="chat-header-title">
        <span class="chat-header-icon">💬</span>
        <span>${selectedProject.name}</span>
      </div>
      <span class="chat-status-badge">Local Claude</span>
    </div>
    <div class="chat-session-switcher">
      <div class="chat-history-dropdown">
        <button
          type="button"
          class="chat-history-toggle ${isHistoryOpen ? "is-open" : ""}"
          data-history-toggle="${selectedProject.id}"
          aria-expanded="${isHistoryOpen}"
        >
          履歴
        </button>
        ${isHistoryOpen ? `<div class="chat-history-list" role="listbox">${historyItems}</div>` : ""}
      </div>
      <button type="button" class="chat-new-session-button" data-new-session="${selectedProject.id}">+ 新規セッション</button>
    </div>
    ${permissionDialog}
    <div class="chat-body">
      ${messageMarkup}
      ${thinkingIndicator}
    </div>
    <div class="chat-composer">
      <textarea id="chat-input" rows="3" placeholder="${selectedProject.name} に指示を入力..."></textarea>
      <button id="chat-send-button" type="button" data-project-id="${selectedProject.id}" ${window.__agentOfficeThinkingForProject === selectedProject.id ? "disabled" : ""}>${window.__agentOfficeThinkingForProject === selectedProject.id ? "考え中" : "送信"}</button>
    </div>
  `;

  const textArea = document.getElementById("chat-input");
  const sendButton = document.getElementById("chat-send-button");
  const historyToggleButton = panel.querySelector(".chat-history-toggle[data-history-toggle]");
  const historyItemButtons = panel.querySelectorAll(".chat-history-item[data-session-id]");
  const newSessionButton = panel.querySelector(".chat-new-session-button[data-new-session]");
  const permissionAllowButton = panel.querySelector('[data-permission="allow"]');
  const permissionDenyButton = panel.querySelector('[data-permission="deny"]');

  if (historyToggleButton) {
    historyToggleButton.addEventListener("click", () => {
      historyOpenForProject = isHistoryOpen ? null : selectedProject.id;
      renderChatPanel();
    });
  }

  historyItemButtons.forEach((button) => {
    button.addEventListener("click", () => {
      historyOpenForProject = null;
      setActiveSessionId(selectedProject.id, button.dataset.sessionId);
    });
  });

  if (newSessionButton) {
    newSessionButton.addEventListener("click", () => {
      const nextSessionId = createNewSession(selectedProject.id);
      activeSessionByProject[selectedProject.id] = nextSessionId;
      historyOpenForProject = null;
      renderChatPanel();
    });
  }

  if (permissionAllowButton) {
    permissionAllowButton.addEventListener("click", () => {
      approvePendingPermission();
    });
  }

  if (permissionDenyButton) {
    permissionDenyButton.addEventListener("click", () => {
      pendingPermission = null;
      renderChatPanel();
    });
  }

  if (textArea) {
    textArea.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        handleTaskSubmit(selectedProject.id, selectedProject.mainAgent?.id || null, textArea);
      }
    });
  }

  if (sendButton) {
    sendButton.addEventListener("click", () => {
      handleTaskSubmit(selectedProject.id, selectedProject.mainAgent?.id || null, textArea);
    });
  }
}

function render() {
  const app = document.getElementById("app");
  const visibleProjects = projects.filter((project) => project.visible !== false);

  if (visibleProjects.length <= 1) {
    app.className = "office-layout project-count-1";
  } else if (visibleProjects.length <= 4) {
    app.className = "office-layout project-count-2";
  } else {
    app.className = "office-layout project-count-3";
  }

  if (!visibleProjects.length) {
    app.innerHTML = `
      <section class="project-room empty-state">
        <div class="room-header">
          <h2>📭 表示中のプロジェクトなし</h2>
        </div>
        <p class="empty-state-text">表示したいプロジェクトのチェックをオンにしてください。</p>
      </section>
    `;
  } else {
    app.innerHTML = visibleProjects.map(renderProject).join("");

    document.querySelectorAll(".project-room").forEach((room) => {
      room.addEventListener("click", () => {
        const projectId = room.dataset.projectId;
        activeProjectId = projectId;
        render();
      });
    });
  }

  renderProjectListPanel();
  renderChatPanel();
}

async function callClaudeChatApi(message, history = [], sessionId = null, projectId = null) {
  addDebugLog("INFO", "callClaudeChatApi called", { messageLength: message.length, historyLength: history.length, sessionId, projectId });

  try {
    const response = await fetch("http://localhost:3001/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history, sessionId, projectId })
    });

    addDebugLog("INFO", "Response received", { status: response.status, ok: response.ok });
    
    const payload = await response.json();
    addDebugLog("INFO", "Payload parsed", { ok: payload.ok, hasError: !!payload.error, responseLength: payload.response?.length });
    
    if (!response.ok) {
      addDebugLog("ERROR", "Response not OK", { status: response.status, error: payload.error });
      throw new Error(`HTTP ${response.status}: ${payload.error || response.statusText}`);
    }
    
    if (!payload.ok) {
      addDebugLog("ERROR", "Payload error", { error: payload.error });
      throw new Error(payload.error || "Claude Code が エラーを返しました");
    }

    addDebugLog("INFO", "callClaudeChatApi success", { responseLength: payload.response?.length });
    return payload.response || "Claude Code から応答がありませんでした。";
  } catch (error) {
    addDebugLog("ERROR", "callClaudeChatApi exception", { message: error.message });
    throw error;
  }
}

function subscribeToSubAgentEvents() {
  if (typeof EventSource === "undefined") {
    return;
  }

  try {
    const source = new EventSource("http://localhost:3001/api/events");
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (!payload || !payload.projectId || !payload.subAgentId) {
          return;
        }

        addDebugLog("INFO", "SSE sub-agent event received", payload);

        const activity = payload.status === "working" ? "Sub agent running" : "Sub agent finished";
        setAgentStatus(payload.projectId, payload.subAgentId, payload.status, activity);
      } catch (error) {
        addDebugLog("ERROR", "Failed to parse sub agent event", { message: error.message });
      }
    };
  } catch (error) {
    addDebugLog("ERROR", "Failed to subscribe to sub agent events", { message: error.message });
  }
}

function executeApprovedTask(projectId, task, agentId) {
  addDebugLog("INFO", "executeApprovedTask called", { projectId, taskLength: task.length, agentId });
  
  const targetProject = projects.find((project) => project.id === projectId);
  const targetAgentId = agentId || targetProject?.mainAgent?.id || null;

  if (!targetProject || !targetAgentId) {
    addDebugLog("ERROR", "targetProject or targetAgentId not found", { projectId, agentId });
    return;
  }

  const sessionId = getActiveSessionId(projectId);
  appendProjectMessage(projectId, { role: "user", text: task, sessionId });
  setAgentStatus(projectId, targetAgentId, "working", task);

  window.__agentOfficeThinkingForProject = projectId;
  renderChatPanel();

  const sendButton = document.getElementById("chat-send-button");
  if (sendButton) {
    sendButton.disabled = true;
    sendButton.textContent = "考え中";
  }

  console.log("[DEBUG] About to call Claude API with sessionId:", sessionId);
  console.log("[DEBUG] Project messages to send:", getProjectMessages(projectId, sessionId).length, "messages");
  
  callClaudeChatApi(task, getProjectMessages(projectId, sessionId), sessionId, projectId)
    .then((claudeReply) => {
      addDebugLog("INFO", "Claude reply received", { replyLength: claudeReply.length });
      appendProjectMessage(projectId, { role: "assistant", text: claudeReply, sessionId });
      setAgentStatus(projectId, targetAgentId, "idle", "Claude Code responded");
    })
    .catch((error) => {
      addDebugLog("ERROR", "Error in Claude call", { message: error.message });
      const errorMsg = `Claude Code との接続に失敗しました: ${error.message}`;
      appendProjectMessage(projectId, { role: "assistant", text: errorMsg, sessionId });
      setAgentStatus(projectId, targetAgentId, "error", error.message);
    })
    .finally(() => {
      addDebugLog("INFO", "Finally block: cleaning up", {});
      pendingPermission = null;
      delete window.__agentOfficeThinkingForProject;
      renderChatPanel();
      const chatInput = document.getElementById("chat-input");
      if (chatInput) {
        chatInput.value = "";
      }
      const button = document.getElementById("chat-send-button");
      if (button) {
        button.disabled = false;
        button.textContent = "送信";
      }
    });
}

function approvePendingPermission() {
  addDebugLog("INFO", "approvePendingPermission called", { hasPending: !!pendingPermission });
  
  if (!pendingPermission) {
    addDebugLog("WARN", "No pendingPermission, returning", {});
    return;
  }

  const { projectId, task, agentId } = pendingPermission;
  addDebugLog("INFO", "Executing approved task", { projectId });
  pendingPermission = null;
  executeApprovedTask(projectId, task, agentId);
}

async function handleTaskSubmit(projectId = null, agentId = null, inputElement = null) {
  addDebugLog("INFO", "handleTaskSubmit called", { projectId, agentId });
  
  const selectedProject = projects.find((project) => project.id === projectId) || projects[0];
  const resolvedProjectId = selectedProject ? selectedProject.id : null;
  const resolvedInput = inputElement || document.getElementById("chat-input");

  if (!resolvedInput || !resolvedProjectId) {
    addDebugLog("ERROR", "No input or projectId", { hasInput: !!resolvedInput, hasProjectId: !!resolvedProjectId });
    return;
  }

  const task = resolvedInput.value.trim();
  if (!task) {
    addDebugLog("WARN", "Task is empty", {});
    resolvedInput.focus();
    return;
  }

  const targetProject = projects.find((project) => project.id === resolvedProjectId);
  if (!targetProject) {
    addDebugLog("ERROR", "targetProject not found", { projectId: resolvedProjectId });
    resolvedInput.focus();
    return;
  }

  const actionLabel = /修正|編集|変更|リファクタ|fix|update|write|delete|test|実行|run|npm|yarn|pnpm|git/i.test(task)
    ? "ファイル編集とコマンド実行を行う"
    : "コードの確認と提案を行う";

  addDebugLog("INFO", "Setting pendingPermission", { projectId: resolvedProjectId, taskLength: task.length, actionLabel });
  pendingPermission = {
    projectId: resolvedProjectId,
    task,
    actionLabel,
    agentId: agentId || targetProject.mainAgent?.id || null
  };
  renderChatPanel();
}

async function init() {
  const loadedProjects = await loadProjects();
  const normalizedProjects = loadedProjects.length ? loadStoredVisibility(loadedProjects) : [
    {
      id: "no-projects-found",
      name: "No Projects Found",
      icon: "📁",
      visible: true,
      mainAgent: { id: "main-agent", name: "Main Agent", role: "Main Agent", status: "idle", activity: "Waiting for project folders" },
      subAgents: []
    }
  ];
  projects = normalizedProjects;
  chatMessagesByProject = loadStoredChatMessages();
  projects.forEach((project) => {
    if (!chatMessagesByProject[project.id]) {
      chatMessagesByProject[project.id] = [];
    }
    if (!activeSessionByProject[project.id]) {
      activeSessionByProject[project.id] = getProjectSessionIds(project.id)[0];
    }
  });
  persistChatMessages();
  activeProjectId = projects.find((project) => project.visible !== false)?.id || null;
  persistProjectVisibility();
  render();
}

init();
subscribeToSubAgentEvents();

const projectListButton = document.getElementById("project-list-button");
if (projectListButton) {
  projectListButton.addEventListener("click", () => {
    showProjectList = !showProjectList;
    renderProjectListPanel();
  });
}

// Diagnostic function for debugging
window.__agentOfficeDiagnostics = function() {
  const diagnostics = {
    serverStatus: "unknown",
    activeProject: activeProjectId,
    activeSessions: Object.keys(activeSessionByProject),
    pendingPermission: pendingPermission ? "exists" : "null",
    projectsLoaded: projects.length,
    thinkingProjectId: window.__agentOfficeThinkingForProject || "none"
  };
  
  fetch("http://localhost:3001/health")
    .then(r => r.json())
    .then(data => {
      diagnostics.serverStatus = data.ok ? "running" : "error";
      console.log("[DIAGNOSTICS]", JSON.stringify(diagnostics, null, 2));
    })
    .catch(e => {
      diagnostics.serverStatus = `error: ${e.message}`;
      console.log("[DIAGNOSTICS]", JSON.stringify(diagnostics, null, 2));
    });
};

// Show last message from each project
window.__agentOfficeShowMessages = function() {
  for (const [projectId, messages] of Object.entries(chatMessagesByProject)) {
    if (Array.isArray(messages) && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      console.log(`[${projectId}] ${lastMsg.role}: ${lastMsg.text?.slice(0, 100)}...`);
    }
  }
};

// Show debug logs captured across reloads
window.__agentOfficeShowDebugLogs = function() {
  console.log("=== DEBUG LOGS (last 20) ===");
  const logsToShow = debugLogs.slice(-20);
  logsToShow.forEach((log) => {
    const prefix = `[${log.timestamp.slice(11, 19)}] [${log.level}]`;
    if (log.data) {
      console.log(prefix, log.message, log.data);
    } else {
      console.log(prefix, log.message);
    }
  });
  console.log("=== END DEBUG LOGS ===");
};

// Clear debug logs
window.__agentOfficeClearDebugLogs = function() {
  debugLogs = [];
  try {
    sessionStorage.removeItem(debugLogsStorageKey);
  } catch (e) {}
  console.log("Debug logs cleared");
};

console.log("[INIT] Agent Office loaded. Run __agentOfficeShowDebugLogs() to see error logs.");
