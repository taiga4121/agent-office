const statusIcons = {
  idle: "☕",
  working: "💻",
  waiting: "⏳",
  error: "⚠️"
};

const statusLabels = {
  idle: "Idle",
  working: "Working",
  waiting: "Waiting",
  error: "Error"
};

const projectVisibilityStorageKey = "agent-office-project-visibility";
let projects = [];
let showProjectList = false;

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

  agent.status = nextStatus;
  agent.activity = activity;
  render();
}

function autoReset(projectId, agentId) {
  const project = projects.find((item) => item.id === projectId);
  if (!project) return;

  const agent = getAgentById(project, agentId);
  if (!agent) return;

  setTimeout(() => {
    if (agent.status === "working" || agent.status === "waiting") {
      agent.status = "idle";
      agent.activity = "Ready for the next task";
      render();
    }
  }, 4200);
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
  const mainAgent = project.mainAgent || { id: "main-agent", name: "Main Agent", role: "Main Agent", status: "idle", activity: "Ready for task" };
  const subAgents = project.subAgents || [];

  return `
    <section class="project-room" aria-label="${project.name} project room">
      <div class="room-header">
        <h2>${project.icon} ${project.name}</h2>
        <div class="room-controls">
          <label class="visibility-toggle">
            <input type="checkbox" data-project-id="${project.id}" ${project.visible !== false ? "checked" : ""}>
            <span>${project.visible !== false ? "表示" : "非表示"}</span>
          </label>
          <span class="room-icon" aria-hidden="true">🗂️</span>
        </div>
      </div>
      <div class="agent-grid">
        ${renderAgent(mainAgent, true)}
        ${subAgents.map((agent) => renderAgent(agent, false)).join("")}
      </div>

      <div class="project-command-panel" data-project-id="${project.id}">
        <label class="project-command-label" for="task-input-${project.id}">${project.name} のメインエージェントに指示</label>
        <textarea id="task-input-${project.id}" rows="2" placeholder="${project.name} に指示を入力... 例: ログイン機能を実装して"></textarea>
        <button type="button" data-project-id="${project.id}" data-agent-id="${mainAgent.id}" class="project-send-task">送信</button>
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
      render();
      renderProjectListPanel();
    });
  });
}

function render() {
  const app = document.getElementById("app");
  const visibleProjects = projects.filter((project) => project.visible !== false);

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

    document.querySelectorAll(".project-send-task").forEach((button) => {
      button.addEventListener("click", () => handleTaskSubmit(button.dataset.projectId, button.dataset.agentId));
    });

    document.querySelectorAll(".project-command-panel textarea").forEach((input) => {
      input.addEventListener("keydown", (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          const projectId = input.closest(".project-command-panel")?.dataset.projectId;
          const agentId = document.querySelector(`button[data-project-id="${projectId}"]`)?.dataset.agentId;
          handleTaskSubmit(projectId, agentId, input);
        }
      });
    });

    document.querySelectorAll(".visibility-toggle input").forEach((toggle) => {
      toggle.addEventListener("change", (event) => {
        const projectId = event.target.dataset.projectId;
        const targetProject = projects.find((project) => project.id === projectId);
        if (!targetProject) {
          return;
        }

        targetProject.visible = event.target.checked;
        persistProjectVisibility();
        render();
        renderProjectListPanel();
      });
    });
  }

  renderProjectListPanel();
}

function handleTaskSubmit(projectId = null, agentId = null, inputElement = null) {
  const resolvedProjectId = projectId || document.querySelector(".project-command-panel")?.dataset.projectId || null;
  const resolvedInput = inputElement || document.querySelector(`textarea#task-input-${resolvedProjectId}`);

  if (!resolvedInput) {
    return;
  }

  const task = resolvedInput.value.trim();
  if (!task || !resolvedProjectId) {
    resolvedInput.focus();
    return;
  }

  const targetProject = projects.find((project) => project.id === resolvedProjectId);
  const targetAgentId = agentId || targetProject?.mainAgent?.id || null;

  if (!targetProject || !targetAgentId) {
    resolvedInput.focus();
    return;
  }

  setAgentStatus(resolvedProjectId, targetAgentId, "working", task);
  autoReset(resolvedProjectId, targetAgentId);
  resolvedInput.value = "";
  resolvedInput.focus();
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
  persistProjectVisibility();
  render();
}

init();

const projectListButton = document.getElementById("project-list-button");
if (projectListButton) {
  projectListButton.addEventListener("click", () => {
    showProjectList = !showProjectList;
    renderProjectListPanel();
  });
}
