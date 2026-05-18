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

function fmt(n) {
  const num = Number(n || 0);
  if (num > 1_000_000) return `${(num / 1_000_000).toFixed(1)}m`;
  if (num > 1_000) return `${(num / 1_000).toFixed(1)}k`;
  return String(num);
}

function shortName(name = '') {
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
    .replace('Coding Towers', 'Code Works')
    .replace('Media Rooms', 'Media');
}

function colorFor(load) {
  if (load >= 80) return '#f59e0b';
  if (load >= 45) return '#7dd3fc';
  if (load >= 15) return '#86efac';
  return '#64748b';
}

const ROLE_DETAILS = {
  Commander: { specialty: 'Strategy, routing, and decisions', style: 'calm lead who keeps the whole city aligned' },
  'Autonomous Engineer': { specialty: 'Coding, fixing, testing, and shipping', style: 'focused builder who turns requests into working software' },
  Researcher: { specialty: 'Searching, reading, and summarizing', style: 'curious scout who brings back useful facts' },
  Reviewer: { specialty: 'Quality checks, bugs, and risk', style: 'careful critic who catches problems before release' },
  Operator: { specialty: 'Tools, processes, files, and automation', style: 'hands-on technician who keeps workflows moving' },
};

function agentDetails(agent) {
  const base = ROLE_DETAILS[agent.role] || ROLE_DETAILS.Operator;
  const source = agent.source ? `${agent.source} channel` : 'local workspace';
  return {
    specialty: base.specialty,
    style: `${agent.personality || 'Steady'} — ${base.style}`,
    doing: agent.activity === 'idle' ? `Standing by in ${agent.department}` : `${agent.activity} on “${agent.objective || source}”`,
  };
}

const CITY_SLOTS = {
  'executive-headquarters': { x: 555, y: 52, w: 205, h: 142, lane: 'north', floors: 4 },
  'research-labs': { x: 82, y: 92, w: 180, h: 128, lane: 'northwest', floors: 2 },
  'coding-towers': { x: 325, y: 140, w: 178, h: 154, lane: 'west', floors: 5 },
  'deployment-facilities': { x: 792, y: 142, w: 190, h: 142, lane: 'east', floors: 3 },
  'automation-plants': { x: 1030, y: 230, w: 176, h: 142, lane: 'east', floors: 2 },
  'data-warehouses': { x: 92, y: 336, w: 180, h: 140, lane: 'west', floors: 2 },
  'analytics-centers': { x: 535, y: 330, w: 195, h: 138, lane: 'center', floors: 3 },
  'security-divisions': { x: 945, y: 492, w: 178, h: 142, lane: 'east', floors: 3 },
  'support-offices': { x: 330, y: 528, w: 180, h: 132, lane: 'southwest', floors: 3 },
  'marketing-studios': { x: 610, y: 532, w: 176, h: 132, lane: 'south', floors: 2 },
  'media-rooms': { x: 96, y: 542, w: 160, h: 118, lane: 'southwest', floors: 2 },
  'finance-centers': { x: 805, y: 535, w: 154, h: 120, lane: 'south', floors: 2 },
};
function citySlot(dept) { return CITY_SLOTS[dept.id] || { x: 520, y: 250, w: 180, h: 130, lane: 'center', floors: 2 }; }

function showDepartment(dept) {
  selectedEl.innerHTML = `
    <div class="card-title"><span>${String(dept.sessions || 0).padStart(2, '0')}</span>${dept.name}</div>
    <p class="green">${String(dept.status || 'idle').toUpperCase()}</p>
    <p>Load: <b>${dept.load || 0}%</b></p>
    <p>Active agents: <b>${dept.active_agents || 0}</b></p>
    <p>Sessions: <b>${dept.sessions || 0}</b></p>
    <p>Tool calls: <b>${dept.tool_calls || 0}</b></p>
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
    <p>${agent.metrics?.messages || 0} messages · ${agent.metrics?.tool_calls || 0} tool calls</p>`;
}

function rect(ctx, x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
function text(ctx, value, x, y, size = 14, color = '#fff0c8', align = 'left') {
  ctx.fillStyle = color; ctx.font = `${size}px "Pixelify Sans", monospace`; ctx.textAlign = align; ctx.textBaseline = 'top'; ctx.fillText(value, Math.round(x), Math.round(y));
}

function drawTexture(ctx) {
  for (let y = 24; y < 700; y += 8) {
    for (let x = 24; x < 1260; x += 8) {
      const v = (x * 13 + y * 29) % 11;
      if (v === 0) rect(ctx, x, y, 4, 4, '#182719');
      if (v === 2) rect(ctx, x + 2, y + 4, 2, 2, '#26351d');
      if (v === 5) rect(ctx, x + 4, y, 4, 2, '#0d190f');
      if (v === 7) rect(ctx, x, y + 6, 2, 2, '#2b3d22');
    }
  }
  for (let i = 0; i < 90; i++) {
    const x = (i * 97) % 1210 + 34;
    const y = (i * 53) % 650 + 38;
    rect(ctx, x, y, 6, 10, i % 3 === 0 ? '#21331b' : '#182719');
    rect(ctx, x + 2, y - 4, 4, 4, '#315226');
  }
}

function drawRoad(ctx, x, y, w, h, vertical = false) {
  rect(ctx, x - 4, y - 4, w + 8, h + 8, '#08090d');
  rect(ctx, x, y, w, h, '#191b22');
  rect(ctx, x + 4, y + 4, w - 8, h - 8, '#2a2e36');
  if (vertical) for (let yy = y + 12; yy < y + h - 12; yy += 34) rect(ctx, x + w / 2 - 2, yy, 4, 18, '#b99d62');
  else for (let xx = x + 12; xx < x + w - 12; xx += 34) rect(ctx, xx, y + h / 2 - 2, 18, 4, '#b99d62');
}

function drawLamp(ctx, x, y) {
  rect(ctx, x, y, 5, 22, '#211914'); rect(ctx, x - 5, y - 5, 15, 8, '#9f6f33'); rect(ctx, x - 2, y - 3, 9, 4, '#ffd77a');
  rect(ctx, x - 10, y + 24, 25, 4, 'rgba(245,201,108,.22)');
}

function drawBuildingPixel(ctx, slot, dept) {
  const accent = colorFor(dept.load);
  const cx = slot.x + slot.w / 2;
  const ground = slot.y + slot.h - 18;
  const bw = dept.kind === 'mainframe' ? 88 : dept.kind === 'coding' ? 68 : dept.kind === 'data' ? 82 : 62;
  const bh = dept.kind === 'mainframe' ? 96 : dept.kind === 'coding' ? 104 : dept.kind === 'security' ? 78 : 62 + (slot.floors || 2) * 7;
  rect(ctx, slot.x + 16, ground + 6, slot.w - 32, 10, '#050506');
  rect(ctx, cx - bw / 2 + 10, ground - bh + 10, bw, bh, '#030304');
  rect(ctx, cx - bw / 2, ground - bh, bw, bh, dept.kind === 'security' ? '#2c2430' : dept.kind === 'data' ? '#172836' : dept.kind === 'mainframe' ? '#24334a' : '#202838');
  rect(ctx, cx + bw / 2 - 14, ground - bh, 14, bh, '#111722');
  rect(ctx, cx - bw / 2, ground - bh, 8, bh, '#35435b');
  const roof = dept.kind === 'mainframe' ? '#aa613e' : dept.kind === 'security' ? '#6e4b59' : '#805e35';
  rect(ctx, cx - bw / 2 - 12, ground - bh - 22, bw + 24, 22, roof);
  rect(ctx, cx - bw / 2 - 12, ground - bh - 22, bw + 24, 6, '#d99b4e');
  if (dept.kind === 'coding') { rect(ctx, cx - 8, ground - bh - 54, 16, 32, '#323b4d'); rect(ctx, cx - 4, ground - bh - 62, 8, 8, accent); }
  if (dept.kind === 'security') { rect(ctx, cx - bw / 2 - 18, ground - bh - 6, 14, bh - 4, '#211b25'); rect(ctx, cx + bw / 2 + 4, ground - bh - 6, 14, bh - 4, '#211b25'); }
  for (let yy = ground - bh + 15; yy < ground - 12; yy += 18) {
    for (let xx = cx - bw / 2 + 15; xx < cx + bw / 2 - 18; xx += 20) {
      const lit = ((xx + yy + dept.load) % 3) !== 0;
      rect(ctx, xx, yy, 9, 9, lit ? accent : '#10141c');
      if (lit) rect(ctx, xx + 2, yy + 2, 3, 3, '#fff0c8');
    }
  }
  rect(ctx, cx - bw / 2 + 20, ground - 18, 18, 18, '#08090d'); rect(ctx, cx - bw / 2 + 25, ground - 14, 3, 10, accent);
  text(ctx, shortName(dept.name), cx, slot.y + 4, 14, '#fff0c8', 'center');
  text(ctx, `${dept.status || 'idle'} · ${dept.load || 0}%`, cx, slot.y + 22, 11, dept.status === 'overloaded' ? '#ffbd72' : '#b9aa86', 'center');
}

function drawAgentSprite(ctx, x, y, agent, index) {
  const colors = ['#5ba6c9', '#78b86d', '#b884d8', '#d69b54', '#d86f6f', '#b7aa8e'];
  const body = agent.role === 'Commander' ? '#78b86d' : colors[index % colors.length];
  rect(ctx, x - 1, y + 25, 22, 4, '#050506');
  rect(ctx, x + 4, y, 12, 11, '#ffd0a3');
  rect(ctx, x + 2, y + 11, 16, 18, body);
  rect(ctx, x + 5, y + 3, 2, 2, '#2b1b16'); rect(ctx, x + 13, y + 3, 2, 2, '#2b1b16');
  rect(ctx, x + 4, y + 28, 5, 5, '#243044'); rect(ctx, x + 12, y + 28, 5, 5, '#243044');
  if (agent.activity !== 'idle') { rect(ctx, x + 18, y + 4, 5, 5, '#f4c86a'); rect(ctx, x + 23, y + 1, 3, 3, '#fff0c8'); }
}

function drawPixelCity(state, agentsByDepartment) {
  if (!cityCtx || !cityCanvas) return;
  const ctx = cityCtx; ctx.imageSmoothingEnabled = false;
  rect(ctx, 0, 0, 1280, 720, '#050609'); rect(ctx, 16, 16, 1248, 688, '#08100b'); rect(ctx, 24, 24, 1232, 672, '#162417');
  drawTexture(ctx);
  drawRoad(ctx, 610, 70, 54, 588, true); drawRoad(ctx, 84, 330, 1098, 54, false); drawRoad(ctx, 180, 596, 820, 36, false); drawRoad(ctx, 1048, 155, 38, 430, true); drawRoad(ctx, 340, 235, 560, 30, false);
  for (const [x,y] of [[580,245],[690,245],[520,390],[754,390],[980,390],[300,390],[625,600],[1015,585],[170,500]]) drawLamp(ctx,x,y);
  // Small pixel props: crates, terminals, antennae, garden tiles.
  for (let i = 0; i < 42; i++) { const x = 45 + ((i * 83) % 1160); const y = 50 + ((i * 47) % 620); if (x > 590 && x < 690) continue; rect(ctx, x, y, 10, 8, i % 2 ? '#3b2a18' : '#1c2b38'); rect(ctx, x + 2, y + 2, 6, 2, '#7a5b2b'); }
  for (const dept of state.departments || []) drawBuildingPixel(ctx, citySlot(dept), dept);
  let globalIndex = 0;
  for (const dept of state.departments || []) {
    const slot = citySlot(dept); const deptAgents = (agentsByDepartment.get(dept.name) || []).slice(0, 5);
    deptAgents.forEach((agent, i) => {
      const ax = slot.x + 26 + (i % 3) * 48; const ay = slot.y + slot.h - 48 + Math.floor(i / 3) * 22;
      drawAgentSprite(ctx, ax, ay, agent, globalIndex++);
      text(ctx, agent.name.replace(/^Commander-/, 'Cmd-').slice(0, 13), ax + 22, ay - 3, 10, '#f4c86a');
    });
  }
  text(ctx, 'HERMES AGENT HQ — TEXTURED PIXEL OPS CITY', 34, 34, 19, '#f4c86a');
  text(ctx, `${(state.agents || []).length} real agents/sessions · ${(state.departments || []).filter(d => d.active_agents > 0).length} active districts`, 36, 58, 12, '#b9aa86');
}

function drawStreams(state) {
  streamsEl.innerHTML = '';
  const active = (state.departments || []).filter(d => (d.tool_calls || d.active_agents || d.sessions) > 0);
  const center = { x: 50, y: 50 };
  active.forEach((dept, i) => {
    const slot = citySlot(dept); const x = ((slot.x + slot.w / 2) / 1280) * 100; const y = ((slot.y + slot.h / 2) / 720) * 100;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('d', `M ${center.x} ${center.y} L ${x.toFixed(1)} ${y.toFixed(1)}`);
    line.setAttribute('stroke', i % 2 ? '#74c7ef88' : '#f5c96c88'); line.setAttribute('stroke-width', '.22'); line.setAttribute('stroke-dasharray', '1.2 1.2'); line.setAttribute('fill', 'none');
    streamsEl.appendChild(line);
  });
}

function renderHotspots(state, agentsByDepartment) {
  buildingsEl.innerHTML = ''; agentsEl.innerHTML = '';
  for (const dept of state.departments || []) {
    const slot = citySlot(dept); const node = document.createElement('button');
    node.className = 'hotspot'; node.title = dept.name;
    node.style.left = `${(slot.x / 1280) * 100}%`; node.style.top = `${(slot.y / 720) * 100}%`; node.style.width = `${(slot.w / 1280) * 100}%`; node.style.height = `${(slot.h / 720) * 100}%`;
    node.addEventListener('click', () => showDepartment(dept)); buildingsEl.appendChild(node);
    (agentsByDepartment.get(dept.name) || []).slice(0, 5).forEach((agent, i) => {
      const ax = slot.x + 26 + (i % 3) * 48; const ay = slot.y + slot.h - 48 + Math.floor(i / 3) * 22;
      const badge = document.createElement('button'); badge.className = `agent-badge ${agent.activity !== 'idle' ? 'active' : ''}`; badge.textContent = agent.name.replace(/^Commander-/, 'Cmd-').slice(0, 14); badge.title = `${agent.name} — ${agent.role}`;
      badge.style.left = `${((ax + 10) / 1280) * 100}%`; badge.style.top = `${(ay / 720) * 100}%`; badge.addEventListener('click', () => showAgent(agent)); agentsEl.appendChild(badge);
    });
  }
}

function renderState(state) {
  currentState = state;
  truthEl.textContent = state.truth_contract || 'Backend state loaded.';
  const agentsByDepartment = new Map();
  for (const agent of state.agents || []) { const list = agentsByDepartment.get(agent.department) || []; list.push(agent); agentsByDepartment.set(agent.department, list); }
  drawPixelCity(state, agentsByDepartment); drawStreams(state); renderHotspots(state, agentsByDepartment);
  metricsEl.innerHTML = Object.entries(state.telemetry || {}).map(([k, v]) => `<div><span>${k.replaceAll('_', ' ')}</span><b>${v ?? '—'}</b></div>`).join('') || '<p>No telemetry yet.</p>';
  agentRosterEl.innerHTML = (state.agents || []).length ? state.agents.slice(0, 14).map((agent) => { const details = agentDetails(agent); const active = !['idle', 'offline'].includes(agent.activity); return `<button class="roster-agent ${active ? 'active' : ''}" data-agent-id="${agent.id}"><span class="roster-top"><b>${agent.name}</b><i>${agent.energy}%</i></span><span class="roster-role">${agent.role} · ${agent.personality || 'Steady'}</span><span class="roster-doing">${details.doing}</span><span class="roster-specialty">Good at: ${details.specialty}</span></button>`; }).join('') : '<p>No real Hermes agents/sessions are currently available from this backend.</p>';
  agentRosterEl.querySelectorAll('.roster-agent').forEach((button) => button.addEventListener('click', () => { const agent = (state.agents || []).find((item) => item.id === button.dataset.agentId); if (agent) showAgent(agent); }));
  alertsEl.innerHTML = (state.alerts || []).length ? state.alerts.map((a) => `<div class="alert ${a.level}">${a.message}</div>`).join('') : '<div class="alert ok">No real backend alerts.</div>';
  logsEl.textContent = (state.logs || []).length ? state.logs.join('\n') : 'No recent Hermes logs.';
  const firstActive = (state.agents || []).find(a => a.activity !== 'idle'); if (firstActive) showAgent(firstActive); else if (state.departments?.[0]) showDepartment(state.departments[0]);
}

async function loadState() {
  try { const res = await fetch(stateUrl, { cache: 'no-store' }); const data = await res.json(); if (!res.ok) throw new Error(data.error || JSON.stringify(data)); renderState(data); }
  catch (err) { truthEl.textContent = `State error: ${err.message}`; }
}

document.querySelector('#syncBtn').addEventListener('click', loadState); setInterval(loadState, 3000); loadState();

const chatForm = document.querySelector('#chatForm'); const chatInput = document.querySelector('#chatInput'); const chatHistory = document.querySelector('#chatHistory');
function addChat(role, text) { const item = document.createElement('div'); item.className = `chat ${role}`; item.textContent = text; chatHistory.appendChild(item); chatHistory.scrollTop = chatHistory.scrollHeight; }
chatForm.addEventListener('submit', async (event) => {
  event.preventDefault(); const prompt = chatInput.value.trim(); if (!prompt) return; chatInput.value = ''; addChat('user', prompt); addChat('assistant pending', 'Hermes is thinking…'); const pending = chatHistory.querySelector('.pending');
  try { const res = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt }) }); const data = await res.json(); pending.remove(); if (!res.ok) throw new Error(data.error || 'Chat failed'); addChat('assistant', data.output || '(empty response)'); loadState(); }
  catch (err) { pending.remove(); addChat('assistant error', err.message); }
});
