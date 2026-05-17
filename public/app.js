const stateUrl = '/api/hq/state';
let currentState = null;

const cityCanvas = document.querySelector('#cityCanvas');
const cityCtx = cityCanvas?.getContext('2d');
const buildingsEl = document.querySelector('#buildings');
const agentsEl = document.querySelector('#agents');
const streamsEl = document.querySelector('#streams');
const selectedEl = document.querySelector('#selected');
const metricsEl = document.querySelector('#metrics');
const alertsEl = document.querySelector('#alerts');
const logsEl = document.querySelector('#logs');
const agentRosterEl = document.querySelector('#agentRoster');
const truthEl = document.querySelector('.truth');
const buildingTemplate = document.querySelector('#buildingTemplate');
const agentTemplate = document.querySelector('#agentTemplate');

function fmt(n) {
  const num = Number(n || 0);
  if (num > 1_000_000) return `${(num / 1_000_000).toFixed(1)}m`;
  if (num > 1_000) return `${(num / 1_000).toFixed(1)}k`;
  return String(num);
}

function shortName(name) {
  return name
    .replace('Executive Headquarters', 'HERMES HQ')
    .replace('Deployment Facilities', 'Deploy Yard')
    .replace('Automation Plants', 'Auto Plant')
    .replace('Security Divisions', 'Sec Tower')
    .replace('Analytics Centers', 'Analytics')
    .replace('Data Warehouses', 'Data Vault')
    .replace('Marketing Studios', 'Market Lab')
    .replace('Support Offices', 'Support')
    .replace('Finance Centers', 'Finance')
    .replace('Research Labs', 'Research')
    .replace('Coding Towers', 'Code Works');
}

function colorFor(load) {
  if (load >= 80) return '#f59e0b';
  if (load >= 45) return '#7dd3fc';
  if (load >= 15) return '#86efac';
  return '#64748b';
}

const ROLE_DETAILS = {
  Commander: {
    specialty: 'Strategy, routing, and decisions',
    style: 'calm lead who keeps the whole city aligned',
  },
  'Autonomous Engineer': {
    specialty: 'Coding, fixing, testing, and shipping',
    style: 'focused builder who turns requests into working software',
  },
  Researcher: {
    specialty: 'Searching, reading, and summarizing',
    style: 'curious scout who brings back useful facts',
  },
  Reviewer: {
    specialty: 'Quality checks, bugs, and risk',
    style: 'careful critic who catches problems before release',
  },
  Operator: {
    specialty: 'Tools, processes, files, and automation',
    style: 'hands-on technician who keeps workflows moving',
  },
};

function agentDetails(agent) {
  const base = ROLE_DETAILS[agent.role] || ROLE_DETAILS.Operator;
  const source = agent.source ? `${agent.source} channel` : 'local workspace';
  return {
    specialty: base.specialty,
    style: `${agent.personality || 'Steady'} — ${base.style}`,
    doing: agent.activity === 'idle'
      ? `Standing by in ${agent.department}`
      : `${agent.activity} on “${agent.objective || source}”`,
  };
}

function buildingClass(kind) {
  if (kind === 'mainframe') return 'hq';
  if (kind === 'coding') return 'tall';
  if (kind === 'security') return 'fort';
  if (kind === 'data') return 'vault';
  return 'shop';
}

const CITY_SLOTS = {
  'executive-headquarters': { x: 592, y: 52, w: 240, h: 160, lane: 'north' },
  'research-labs': { x: 64, y: 78, w: 220, h: 150, lane: 'northwest' },
  'coding-towers': { x: 336, y: 150, w: 220, h: 155, lane: 'west' },
  'deployment-facilities': { x: 760, y: 150, w: 220, h: 155, lane: 'east' },
  'automation-plants': { x: 1000, y: 244, w: 220, h: 155, lane: 'east' },
  'data-warehouses': { x: 76, y: 322, w: 220, h: 155, lane: 'west' },
  'analytics-centers': { x: 530, y: 340, w: 220, h: 155, lane: 'center' },
  'security-divisions': { x: 936, y: 496, w: 220, h: 155, lane: 'east' },
  'support-offices': { x: 340, y: 520, w: 220, h: 150, lane: 'southwest' },
  'marketing-studios': { x: 610, y: 536, w: 220, h: 145, lane: 'south' },
  'finance-centers': { x: 70, y: 528, w: 220, h: 145, lane: 'southwest' },
};

function citySlot(dept) {
  return CITY_SLOTS[dept.id] || { x: 520, y: 250, w: 210, h: 150, lane: 'center' };
}

function showDepartment(dept) {
  selectedEl.innerHTML = `
    <div class="card-title"><span>${String(dept.sessions).padStart(2, '0')}</span>${dept.name}</div>
    <p class="green">${dept.status.toUpperCase()}</p>
    <p>Load: <b>${dept.load}%</b></p>
    <p>Active agents: <b>${dept.active_agents}</b></p>
    <p>Sessions: <b>${dept.sessions}</b></p>
    <p>Tool calls: <b>${dept.tool_calls}</b></p>
    <p>Tokens: <b>${fmt(dept.tokens)}</b></p>`;
}

function showAgent(agent) {
  const details = agentDetails(agent);
  selectedEl.innerHTML = `
    <div class="card-title"><span>Agent</span>${agent.name}</div>
    <p class="green">${agent.role}</p>
    <p><b>Doing:</b> ${details.doing}</p>
    <p><b>Specialty:</b> ${details.specialty}</p>
    <p><b>Personality:</b> ${details.style}</p>
    <p>Mood: <b>${agent.mood}</b> · Energy: <b>${agent.energy}%</b></p>
    <p>Home: <b>${agent.department}</b></p>
    <p>${agent.metrics.messages} messages · ${agent.metrics.tool_calls} tool calls</p>`;
}

function departmentByName(name) {
  return currentState.departments.find((d) => d.name === name) || currentState.departments[0];
}

function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function text(ctx, value, x, y, size = 14, color = '#fff0c8', align = 'left') {
  ctx.fillStyle = color;
  ctx.font = `${size}px monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillText(value, Math.round(x), Math.round(y));
}

function drawTexture(ctx) {
  for (let y = 0; y < 720; y += 8) {
    for (let x = 0; x < 1280; x += 8) {
      const v = (x * 17 + y * 31) % 7;
      if (v === 0) rect(ctx, x, y, 4, 4, '#182a18');
      if (v === 3) rect(ctx, x + 2, y + 2, 2, 2, '#2b3d22');
    }
  }
}

function drawRoad(ctx, x, y, w, h, vertical = false) {
  rect(ctx, x, y, w, h, '#151820');
  rect(ctx, x + 4, y + 4, w - 8, h - 8, '#282c36');
  if (vertical) {
    for (let yy = y + 12; yy < y + h - 12; yy += 34) rect(ctx, x + w / 2 - 2, yy, 4, 18, '#b99d62');
  } else {
    for (let xx = x + 12; xx < x + w - 12; xx += 34) rect(ctx, xx, y + h / 2 - 2, 18, 4, '#b99d62');
  }
}

function drawBuildingPixel(ctx, slot, dept) {
  const accent = colorFor(dept.load);
  const cx = slot.x + slot.w / 2;
  const baseY = slot.y + slot.h - 56;
  const bw = dept.kind === 'mainframe' ? 86 : dept.kind === 'coding' ? 64 : 58;
  const bh = dept.kind === 'mainframe' ? 94 : dept.kind === 'coding' ? 82 : 58;
  rect(ctx, cx - bw / 2 + 9, baseY - bh + 9, bw, bh, '#050506');
  rect(ctx, cx - bw / 2, baseY - bh, bw, bh, dept.kind === 'security' ? '#2a2430' : dept.kind === 'data' ? '#192a34' : '#202838');
  rect(ctx, cx + bw / 2 - 14, baseY - bh, 14, bh, '#111722');
  rect(ctx, cx - bw / 2 - 10, baseY - bh - 24, bw + 20, 24, dept.kind === 'mainframe' ? '#a45f3d' : '#7f5d35');
  rect(ctx, cx - bw / 2 - 10, baseY - bh - 24, bw + 20, 6, '#d79a4f');
  for (let yy = baseY - bh + 16; yy < baseY - 14; yy += 22) {
    for (let xx = cx - bw / 2 + 14; xx < cx + bw / 2 - 18; xx += 24) {
      rect(ctx, xx, yy, 10, 10, accent);
      rect(ctx, xx + 2, yy + 2, 3, 3, '#fff0c8');
    }
  }
  rect(ctx, slot.x + 8, slot.y + 8, slot.w - 16, 24, '#0b0f16');
  rect(ctx, slot.x + 8, slot.y + 8, 5, 24, accent);
  text(ctx, shortName(dept.name), slot.x + 20, slot.y + 13, 14, '#fff0c8');
}

function drawAgentSprite(ctx, x, y, agent, index) {
  const colors = ['#5ba6c9', '#78b86d', '#b884d8', '#d69b54', '#d86f6f'];
  const body = agent.name === 'Commander Hermes' ? '#78b86d' : colors[index % colors.length];
  rect(ctx, x + 3, y, 10, 10, '#ffd0a3');
  rect(ctx, x + 1, y + 10, 14, 16, body);
  rect(ctx, x + 5, y + 3, 2, 2, '#2b1b16');
  rect(ctx, x + 10, y + 3, 2, 2, '#2b1b16');
  if (agent.activity !== 'idle') rect(ctx, x + 15, y + 4, 4, 4, '#f4c86a');
}

function drawPixelCity(state, agentsByDepartment) {
  if (!cityCtx || !cityCanvas) return;
  const ctx = cityCtx;
  ctx.imageSmoothingEnabled = false;
  rect(ctx, 0, 0, 1280, 720, '#090b10');
  rect(ctx, 20, 20, 1240, 680, '#111c12');
  rect(ctx, 24, 24, 1232, 672, '#162417');
  drawTexture(ctx);
  drawRoad(ctx, 610, 58, 56, 604, true);
  drawRoad(ctx, 78, 332, 1110, 56, false);
  drawRoad(ctx, 180, 600, 700, 36, false);
  drawRoad(ctx, 1048, 160, 40, 420, true);

  for (const dept of state.departments) {
    const slot = citySlot(dept);
    rect(ctx, slot.x, slot.y, slot.w, slot.h, '#050506');
    rect(ctx, slot.x - 4, slot.y - 4, slot.w, slot.h, '#303744');
    rect(ctx, slot.x, slot.y, slot.w - 8, slot.h - 8, dept.status === 'overloaded' ? '#1b1209' : '#0d1219');
    for (let tx = slot.x + 10; tx < slot.x + slot.w - 16; tx += 18) {
      for (let ty = slot.y + 42; ty < slot.y + slot.h - 12; ty += 18) {
        if ((tx + ty) % 36 === 0) rect(ctx, tx, ty, 5, 5, '#1b2c1c');
      }
    }
    drawBuildingPixel(ctx, slot, dept);
    const deptAgents = (agentsByDepartment.get(dept.name) || []).slice(0, 3);
    deptAgents.forEach((agent, i) => {
      const ax = slot.x + 16 + i * 64;
      const ay = slot.y + slot.h - 42;
      drawAgentSprite(ctx, ax, ay, agent, i);
      text(ctx, agent.name.slice(0, 14), ax + 20, ay - 2, 11, '#f4c86a');
      text(ctx, agent.role.replace('Autonomous ', '').slice(0, 16), ax + 20, ay + 12, 10, '#b7aa8e');
    });
  }
  text(ctx, 'AI ECOSYSTEM — DETAILED PIXEL CITY', 36, 34, 20, '#f4c86a');
}

function renderState(state) {
  currentState = state;
  truthEl.textContent = state.truth_contract;
  buildingsEl.innerHTML = '';
  agentsEl.innerHTML = '';
  streamsEl.innerHTML = '';

  const agentsByDepartment = new Map();
  for (const agent of state.agents) {
    const list = agentsByDepartment.get(agent.department) || [];
    list.push(agent);
    agentsByDepartment.set(agent.department, list);
  }
  drawPixelCity(state, agentsByDepartment);

  for (const dept of state.departments) {
    const slot = citySlot(dept);
    const node = document.createElement('button');
    node.className = `district ${buildingClass(dept.kind)} ${dept.status === 'overloaded' ? 'overloaded' : ''}`;
    node.style.left = `${(slot.x / 1280) * 100}%`;
    node.style.top = `${(slot.y / 720) * 100}%`;
    node.style.width = `${(slot.w / 1280) * 100}%`;
    node.style.height = `${(slot.h / 720) * 100}%`;
    node.style.setProperty('--accent', colorFor(dept.load));
    const deptAgents = (agentsByDepartment.get(dept.name) || []).slice(0, 4);
    node.innerHTML = `
      <span class="district-roof"></span>
      <span class="district-building"><i></i></span>
      <span class="district-info">
        <b>${shortName(dept.name)}</b>
        <em>${dept.status} · ${dept.load}% load · ${dept.active_agents} active</em>
      </span>
      <span class="district-agents">
        ${deptAgents.length ? deptAgents.map((agent) => {
          const details = agentDetails(agent);
          return `<span class="mini-agent ${agent.activity !== 'idle' ? 'active' : ''}" data-agent-id="${agent.id}">
            <strong>${agent.name}</strong>
            <small>${agent.role}</small>
            <small>${details.doing}</small>
          </span>`;
        }).join('') : '<span class="mini-agent empty"><strong>No agents</strong><small>Standing by</small></span>'}
      </span>
    `;
    node.addEventListener('click', (event) => {
      const mini = event.target.closest('.mini-agent[data-agent-id]');
      if (mini) {
        const agent = state.agents.find((item) => item.id === mini.dataset.agentId);
        if (agent) showAgent(agent);
        return;
      }
      showDepartment(dept);
    });
    buildingsEl.appendChild(node);
  }

  metricsEl.innerHTML = Object.entries(state.telemetry)
    .map(([k, v]) => `<div><span>${k.replaceAll('_', ' ')}</span><b>${v ?? '—'}</b></div>`)
    .join('');

  agentRosterEl.innerHTML = state.agents
    .slice(0, 8)
    .map((agent) => {
      const details = agentDetails(agent);
      const active = !['idle', 'offline'].includes(agent.activity);
      return `<button class="roster-agent ${active ? 'active' : ''}" data-agent-id="${agent.id}">
        <span class="roster-top"><b>${agent.name}</b><i>${agent.energy}%</i></span>
        <span class="roster-role">${agent.role} · ${agent.personality || 'Steady'}</span>
        <span class="roster-doing">${details.doing}</span>
        <span class="roster-specialty">Good at: ${details.specialty}</span>
      </button>`;
    })
    .join('');
  agentRosterEl.querySelectorAll('.roster-agent').forEach((button) => {
    button.addEventListener('click', () => {
      const agent = state.agents.find((item) => item.id === button.dataset.agentId);
      if (agent) showAgent(agent);
    });
  });

  alertsEl.innerHTML = state.alerts.length
    ? state.alerts.map((a) => `<div class="alert ${a.level}">${a.message}</div>`).join('')
    : '<div class="alert ok">No real backend alerts.</div>';

  logsEl.textContent = state.logs.length ? state.logs.join('\n') : 'No recent Hermes logs.';
  if (state.departments[0]) showDepartment(state.departments[0]);
}

async function loadState() {
  try {
    const res = await fetch(stateUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error(await res.text());
    renderState(await res.json());
  } catch (err) {
    truthEl.textContent = `State error: ${err.message}`;
  }
}

document.querySelector('#syncBtn').addEventListener('click', loadState);
setInterval(loadState, 3000);
loadState();

const chatForm = document.querySelector('#chatForm');
const chatInput = document.querySelector('#chatInput');
const chatHistory = document.querySelector('#chatHistory');

function addChat(role, text) {
  const item = document.createElement('div');
  item.className = `chat ${role}`;
  item.textContent = text;
  chatHistory.appendChild(item);
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const prompt = chatInput.value.trim();
  if (!prompt) return;
  chatInput.value = '';
  addChat('user', prompt);
  addChat('assistant pending', 'Hermes is thinking…');
  const pending = chatHistory.querySelector('.pending');
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    const data = await res.json();
    pending.remove();
    if (!res.ok) throw new Error(data.error || 'Chat failed');
    addChat('assistant', data.output || '(empty response)');
    loadState();
  } catch (err) {
    pending.remove();
    addChat('assistant error', err.message);
  }
});
