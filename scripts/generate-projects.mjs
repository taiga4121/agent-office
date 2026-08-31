import fs from 'node:fs';
import path from 'node:path';

const parentDir = '/Users/taiga/Projects';

function slugify(text) {
  const raw = String(text || '').trim();
  if (!raw) return 'project';

  const normalized = raw
    .normalize('NFKC')
    .replace(/[\u3000-\u303F\u3040-\u30FF\u4E00-\u9FFF]/g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

  if (normalized) return normalized;

  const hash = Array.from(raw)
    .reduce((sum, char) => sum + char.charCodeAt(0), 0)
    .toString(36);

  return `project-${hash}`;
}

function readAgentsForProject(folderPath) {
  const agentDir = path.join(folderPath, '.claude', 'agents');
  if (!fs.existsSync(agentDir)) {
    return [];
  }

  const files = fs.readdirSync(agentDir)
    .filter((file) => file.endsWith('.md'))
    .sort();

  return files
    .map((file) => {
      const fullPath = path.join(agentDir, file);
      const content = fs.readFileSync(fullPath, 'utf8');
      const nameMatch = content.match(/^name:\s*(.+)$/m);
      if (!nameMatch) return null;

      const rawName = nameMatch[1].trim().replace(/^['"]|['"]$/g, '');
      return {
        id: slugify(rawName),
        name: rawName,
        role: 'Agent',
        status: 'idle',
        activity: 'Ready for task'
      };
    })
    .filter(Boolean);
}

function buildProjectAgents(projectName, folderPath, projectId) {
  const subAgents = readAgentsForProject(folderPath);

  const mainAgent = {
    id: `${projectId}-main-agent`,
    name: `${projectName} Main Agent`,
    role: 'Main Agent',
    status: 'idle',
    activity: 'Ready for task'
  };

  return {
    mainAgent,
    subAgents: subAgents.length ? subAgents : [
      {
        id: `${projectId}-sub-agent`,
        name: `${projectName} Sub Agent`,
        role: 'Sub Agent',
        status: 'idle',
        activity: 'Waiting for assignment'
      }
    ]
  };
}

function ensureProjectList() {
  const seenIds = new Set();
  const entries = fs.readdirSync(parentDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry, index) => {
      const name = entry.name;
      const folderPath = path.join(parentDir, name);
      const baseId = slugify(name);
      const projectId = baseId && !seenIds.has(baseId)
        ? baseId
        : `${baseId || 'project'}-${index + 1}`;
      seenIds.add(projectId);
      const { mainAgent, subAgents } = buildProjectAgents(name, folderPath, projectId);

      return {
        id: projectId,
        name,
        icon: '🏢',
        visible: true,
        mainAgent,
        subAgents
      };
    });

  const output = path.join(process.cwd(), 'public', 'projects.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(entries, null, 2));
}

ensureProjectList();
