const stateUrl = '/api/hq/state';
let currentState = null;
let currentAgentsByDepartment = new Map();
let animationStarted = false;

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
const statAgentsEl = document.querySelector('#statAgents');
const statAgentsHintEl = document.querySelector('#statAgentsHint');
const statDistrictsEl = document.querySelector('#statDistricts');
const statSessionsEl = document.querySelector('#statSessions');
const statGatewayEl = document.querySelector('#statGateway');
const statGatewayHintEl = document.querySelector('#statGatewayHint');
const chatDrawer = document.querySelector('#chatDrawer');
const chatBackdrop = document.querySelector('#chatBackdrop');
const openChatBtn = document.querySelector('#openChatBtn');
const floatingChatBtn = document.querySelector('#floatingChatBtn');
const closeChatBtn = document.querySelector('#closeChatBtn');

function fmt(n) {
  const num = Number(n || 0);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}m`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
  return String(num);
}

function hashString(value = '') {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

function shortName(name = '') {
  return name
    .replace('Executive Headquarters', 'HQ')
    .replace('Deployment Facilities', 'Deploy')
    .replace('Automation Plants', 'Automation')
    .replace('Security Divisions', 'Security')
    .replace('Analytics Centers', 'Analytics')
    .replace('Data Warehouses', 'Data')
    .replace('Marketing Studios', 'Marketing')
    .replace('Support Offices', 'Support')
    .replace('Finance Centers', 'Finance')
    .replace('Research Labs', 'Research')
    .replace('Coding Towers', 'Code')
    .replace('Media Rooms', 'Media');
}

function colorFor(load) {
  if (load >= 85) return '#e15f5f';
  if (load >= 65) return '#d6ad55';
  if (load >= 35) return '#6fbfc8';
  if (load >= 10) return '#81d672';
  return '#8f97a8';
}

const ROLE_DETAILS = {
  Commander: { specialty: 'Strategy, routing, and decisions', style: 'calm lead who keeps the whole workspace aligned' },
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
  'executive-headquarters': { x: 464, y: 34, w: 330, h: 218, floors: 8, form: 'hq' },
  'research-labs': { x: 70, y: 82, w: 198, h: 142, floors: 2, form: 'dome' },
  'coding-towers': { x: 302, y: 146, w: 154, h: 178, floors: 6, form: 'tower' },
  'deployment-facilities': { x: 822, y: 120, w: 212, h: 154, floors: 3, form: 'factory' },
  'automation-plants': { x: 1054, y: 244, w: 164, h: 150, floors: 2, form: 'plant' },
  'data-warehouses': { x: 74, y: 352, w: 214, h: 142, floors: 2, form: 'warehouse' },
  'analytics-centers': { x: 504, y: 342, w: 196, h: 144, floors: 3, form: 'stepped' },
  'security-divisions': { x: 934, y: 492, w: 196, h: 150, floors: 4, form: 'fort' },
  'support-offices': { x: 318, y: 536, w: 184, h: 128, floors: 3, form: 'office' },
  'marketing-studios': { x: 598, y: 540, w: 188, h: 126, floors: 2, form: 'studio' },
  'media-rooms': { x: 88, y: 560, w: 166, h: 108, floors: 2, form: 'media' },
  'finance-centers': { x: 802, y: 550, w: 152, h: 114, floors: 2, form: 'vault' },
};
function citySlot(dept) { return CITY_SLOTS[dept.id] || { x: 520, y: 250, w: 180, h: 130, floors: 2 }; }

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
function strokeRect(ctx, x, y, w, h, color, line = 2) { ctx.strokeStyle = color; ctx.lineWidth = line; ctx.strokeRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
function text(ctx, value, x, y, size = 14, color = '#f4f4f4', align = 'left', font = 'Inter') {
  ctx.fillStyle = color;
  ctx.font = font === 'mono' ? `600 ${size}px "JetBrains Mono", monospace` : `600 ${size}px Inter, system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillText(value, Math.round(x), Math.round(y));
}

function drawTexture(ctx, t) {
  // Solid worksite field with layered pixel texture; dashboard shell stays single dark color.
  rect(ctx, 0, 0, 1280, 720, '#304334');
  rect(ctx, 18, 18, 1244, 684, '#304334');
  strokeRect(ctx, 18, 18, 1244, 684, '#18251d', 2);
  for (let y = 24; y < 704; y += 6) {
    for (let x = 24; x < 1260; x += 6) {
      const v = (x * 13 + y * 29 + Math.floor(t / 900)) % 41;
      if (v === 0) rect(ctx, x, y, 3, 2, '#3f563f');
      if (v === 5) rect(ctx, x + 2, y + 1, 2, 3, '#253622');
      if (v === 11) rect(ctx, x + 1, y + 4, 4, 1, '#5a6842');
      if (v === 19) rect(ctx, x + 4, y + 2, 2, 2, '#513923');
      if (v === 31) rect(ctx, x + 2, y + 2, 1, 1, '#b08a50');
    }
  }
  for (let i = 0; i < 120; i++) {
    const x = 34 + ((i * 97) % 1208);
    const y = 34 + ((i * 53) % 650);
    const c = i % 5 === 0 ? '#253622' : i % 5 === 1 ? '#476237' : i % 5 === 2 ? '#6d4b2a' : i % 5 === 3 ? '#7a5f38' : '#263f45';
    rect(ctx, x, y, 4 + (i % 3), 2 + (i % 2), c);
  }
  for (let i = 0; i < 70; i++) {
    const x = 44 + ((i * 173) % 1160);
    const y = 52 + ((i * 109) % 620);
    rect(ctx, x, y, 2, 7, '#5f7e43'); rect(ctx, x + 3, y + 2, 2, 5, '#7fa15a');
  }
}

function drawRoad(ctx, x, y, w, h, vertical = false) {
  rect(ctx, x - 4, y - 4, w + 8, h + 8, '#1e261d');
  rect(ctx, x, y, w, h, '#6d4b2a');
  rect(ctx, x + 4, y + 4, w - 8, h - 8, '#84603a');
  rect(ctx, x + 7, y + 7, w - 14, h - 14, '#785433');
  const stripe = vertical ? h : w;
  for (let i = 16; i < stripe - 16; i += 34) {
    if (vertical) rect(ctx, x + w / 2 - 2, y + i, 4, 16, '#d8c48b');
    else rect(ctx, x + i, y + h / 2 - 2, 16, 4, '#d8c48b');
  }
  for (let i = 10; i < stripe - 10; i += 24) {
    if (vertical) rect(ctx, x + 5, y + i, 3, 3, '#4e351d');
    else rect(ctx, x + i, y + 5, 3, 3, '#4e351d');
  }
}

function drawTerminal(ctx, x, y, active, t) {
  rect(ctx, x, y, 24, 18, '#06030d'); strokeRect(ctx, x, y, 24, 18, active ? '#53e8ff' : '#493b66', 1);
  const on = active && Math.floor(t / 160) % 2 === 0;
  rect(ctx, x + 4, y + 4, 16, 3, on ? '#5dff9b' : '#665e7c');
  rect(ctx, x + 4, y + 9, 11, 2, active ? '#ffd166' : '#3c3650');
  rect(ctx, x + 17, y + 9, 3, 2, active ? '#ff4fd8' : '#3c3650');
}

function buildingPalette(dept, form) {
  const map = {
    hq: ['#3f5f7c', '#557fa3', '#29435c', '#d6ad55'],
    dome: ['#6b8f74', '#88b18b', '#405f4b', '#d6ad55'],
    tower: ['#465b8b', '#6f85bc', '#27395d', '#6fbfc8'],
    factory: ['#8c5a3c', '#b47750', '#593725', '#d6ad55'],
    plant: ['#6d6f45', '#93965c', '#4a4c2f', '#81d672'],
    warehouse: ['#7b6550', '#a48668', '#4e3e31', '#d8c48b'],
    stepped: ['#5d728a', '#7f99b4', '#394b60', '#6fbfc8'],
    fort: ['#7a4b47', '#9d6660', '#4d2d2c', '#e15f5f'],
    office: ['#64705a', '#87957a', '#3f4b38', '#81d672'],
    studio: ['#8a647d', '#b083a5', '#5b3e52', '#c57b7b'],
    media: ['#7a6b43', '#a99762', '#514728', '#d6ad55'],
    vault: ['#6f7379', '#989da4', '#41454d', '#d8c48b'],
  };
  return map[form] || map.office;
}

function drawBuilding(ctx, slot, dept, t) {
  const load = Number(dept.load || 0);
  const active = Number(dept.active_agents || 0) > 0 || Number(dept.tool_calls || 0) > 0;
  const accent = colorFor(load);
  const form = slot.form || 'office';
  const [base, face, side, trim] = buildingPalette(dept, form);
  const cx = slot.x + slot.w / 2;
  const ground = slot.y + slot.h - 16;
  const floors = slot.floors || 2;
  const bw = form === 'hq' ? 230 : Math.min(slot.w - 34, 74 + floors * 10);
  const bh = form === 'hq' ? 166 : Math.min(slot.h - 18, 58 + floors * 19);
  const left = cx - bw / 2;
  const top = ground - bh;

  // 3D pixel footprint: cast shadow, back wall, face, side face, bevels.
  rect(ctx, slot.x + 8, ground + 10, slot.w - 16, 10, '#18251d');
  rect(ctx, left + 18, top + 18, bw, bh, '#18251d');
  rect(ctx, left + 9, top + 9, bw, bh, side);
  rect(ctx, left, top, bw, bh, base);
  rect(ctx, left + 7, top + 7, bw - 14, bh - 14, face);
  rect(ctx, left + bw - 18, top + 11, 18, bh - 11, side);
  rect(ctx, left + 11, top + bh - 16, bw - 11, 16, '#26323a');
  rect(ctx, left + 6, top + 6, bw - 20, 5, '#cbd7ca');
  strokeRect(ctx, left, top, bw, bh, active ? accent : '#1b252b', active ? 2 : 1);

  if (form === 'hq') {
    rect(ctx, left - 48, top + 62, 48, bh - 48, '#344f68'); strokeRect(ctx, left - 48, top + 62, 48, bh - 48, '#18222a', 1);
    rect(ctx, left + bw, top + 62, 48, bh - 48, '#29435c'); strokeRect(ctx, left + bw, top + 62, 48, bh - 48, '#18222a', 1);
    rect(ctx, left + 44, top - 40, bw - 88, 40, '#476d8d'); strokeRect(ctx, left + 44, top - 40, bw - 88, 40, '#18222a', 1);
    rect(ctx, cx - 20, top - 82, 40, 42, '#365a77'); strokeRect(ctx, cx - 20, top - 82, 40, 42, '#18222a', 1);
    rect(ctx, cx - 9, top - 100, 18, 18, active ? '#d6ad55' : '#7f8c8d');
    text(ctx, 'HQ', cx, top - 32, 20, '#f5f0e6', 'center', 'mono');
  } else if (form === 'tower') {
    rect(ctx, left + bw * .31, top - 50, bw * .38, 50, '#3c517d'); strokeRect(ctx, left + bw * .31, top - 50, bw * .38, 50, '#18222a', 1);
    rect(ctx, left + bw * .43, top - 64, bw * .14, 14, active ? '#6fbfc8' : '#738099');
  } else if (form === 'dome') {
    rect(ctx, left + 12, top - 26, bw - 24, 26, '#88b18b'); strokeRect(ctx, left + 12, top - 26, bw - 24, 26, '#213526', 1);
    rect(ctx, left + 32, top - 42, bw - 64, 16, '#b7cfae');
  } else if (form === 'factory' || form === 'plant') {
    for (let i = 0; i < 3; i++) { rect(ctx, left + 18 + i * 32, top - 38 - i * 6, 17, 38 + i * 6, side); strokeRect(ctx, left + 18 + i * 32, top - 38 - i * 6, 17, 38 + i * 6, '#2c211a', 1); }
    if (active) rect(ctx, left + 24 + (Math.floor(t / 180) % 3) * 32, top - 47, 9, 6, trim);
  } else if (form === 'fort') {
    rect(ctx, left - 20, top - 12, 20, bh + 12, '#633a37'); rect(ctx, left + bw, top - 12, 20, bh + 12, '#4d2d2c');
    for (let i = 0; i < 5; i++) rect(ctx, left + i * (bw / 5), top - 18, 20, 18, '#9d6660');
  } else if (form === 'vault') {
    rect(ctx, left + 22, top - 24, bw - 44, 24, '#989da4'); strokeRect(ctx, left + 22, top - 24, bw - 44, 24, '#323842', 1);
    rect(ctx, cx - 22, ground - 36, 44, 36, '#323842'); strokeRect(ctx, cx - 22, ground - 36, 44, 36, '#d8c48b', 1);
  } else if (form === 'studio' || form === 'media') {
    rect(ctx, left + bw - 36, top - 28, 30, 28, side); strokeRect(ctx, left + bw - 36, top - 28, 30, 28, '#2a2530', 1);
    rect(ctx, left + bw - 28, top - 21, 15, 13, active ? '#c57b7b' : '#8a7a66');
  } else if (form === 'stepped') {
    rect(ctx, left + 22, top - 28, bw - 44, 28, '#6e859f'); strokeRect(ctx, left + 22, top - 28, bw - 44, 28, '#263544', 1);
    rect(ctx, left + 42, top - 48, bw - 84, 20, '#8ea5bc');
  }

  const winW = form === 'hq' ? 12 : 10;
  const stepX = form === 'hq' ? 18 : 16;
  const stepY = form === 'hq' ? 14 : 15;
  for (let yy = top + 14; yy < ground - 14; yy += stepY) {
    for (let xx = left + 16; xx < left + bw - 18; xx += stepX) {
      const lit = active || ((xx + yy + load + Math.floor(t / 520)) % 6) === 0;
      rect(ctx, xx, yy, winW, 7, lit ? accent : side);
      rect(ctx, xx + 1, yy + 1, winW - 3, 2, lit ? '#f5f0e6' : base);
    }
  }
  for (let i = 0; i < Math.floor(bw / 18); i++) rect(ctx, left + 8 + i * 18, ground - 8, 9, 3, trim);

  if (dept.kind === 'coding') { text(ctx, '</>', cx, top - 39, 10, '#e3f6e9', 'center', 'mono'); }
  if (dept.kind === 'security') { rect(ctx, left + bw + 24, top + 10, 10, 34, '#432626'); rect(ctx, left + bw + 26, top + 4, 6, 6, active ? '#e15f5f' : '#79543a'); }
  if (dept.kind === 'research') { rect(ctx, left - 24, top + 24, 17, 25, '#405f4b'); strokeRect(ctx, left - 24, top + 24, 17, 25, '#d6ad55', 1); }
  if (active) {
    const spark = Math.floor(t / 160) % 4;
    rect(ctx, left + bw + 14 + spark * 3, top + 26, 3, 3, accent);
    rect(ctx, left - 14 - spark * 2, top + 48, 3, 3, trim);
  }

  rect(ctx, cx - 16, ground - 22, 32, 22, '#20272d'); strokeRect(ctx, cx - 16, ground - 22, 32, 22, active ? accent : '#14191d', 1);
  drawTerminal(ctx, slot.x + 15, slot.y + slot.h - 34, active, t);
  rect(ctx, slot.x + slot.w - 48, slot.y + 14, 34, 16, '#20272d'); strokeRect(ctx, slot.x + slot.w - 48, slot.y + 14, 34, 16, trim, 1);
  text(ctx, shortName(dept.name), cx, slot.y + 4, form === 'hq' ? 16 : 13, '#f5f0e6', 'center');
  text(ctx, `${dept.status || 'idle'} · ${load}%`, cx, slot.y + (form === 'hq' ? 25 : 21), 10, active ? accent : '#d8c48b', 'center', 'mono');
}

function agentPosition(agent, index, t) {
  const dept = (currentState?.departments || []).find(d => d.name === agent.department) || { id: 'executive-headquarters' };
  const slot = citySlot(dept);
  const seed = hashString(agent.id || agent.name || String(index));
  const active = !['idle', 'offline'].includes(agent.activity);
  const roleBoost = agent.role === 'Commander' ? 1.15 : agent.role === 'Researcher' ? 0.82 : agent.role === 'Reviewer' ? 0.7 : 1;
  const speed = (active ? 0.00105 + (seed % 7) * 0.00008 : 0.00034) * roleBoost;
  const phase = seed % 628;
  const lane = (seed % 5) - 2;
  const centerX = slot.x + slot.w / 2;
  const baseY = slot.y + slot.h - 12 + lane * 9;
  if (active) {
    const route = seed % 3;
    if (route === 0) return { x: centerX + Math.sin(t * speed + phase) * Math.min(90, slot.w * 0.42), y: baseY + Math.cos(t * speed * 1.5 + phase) * 16, working: true };
    if (route === 1) return { x: slot.x + 20 + ((t * speed * 55 + seed) % Math.max(40, slot.w - 40)), y: baseY + Math.sin(t * speed + phase) * 8, working: true };
    return { x: centerX + Math.cos(t * speed + phase) * Math.min(78, slot.w * 0.36), y: slot.y + slot.h * .55 + Math.sin(t * speed + phase) * Math.min(42, slot.h * .24), working: true };
  }
  return {
    x: slot.x + 24 + (seed % Math.max(30, slot.w - 48)),
    y: slot.y + slot.h - 6 + lane * 8 + Math.sin(t * 0.001 + phase) * 2,
    working: false,
  };
}

function drawAgentSprite(ctx, agent, index, t) {
  const { x, y, working } = agentPosition(agent, index, t);
  const roleColors = { Commander: '#9be37b', Researcher: '#c87968', Reviewer: '#d9a441', Operator: '#9b8062', 'Autonomous Engineer': '#7cc7b2' };
  const vest = roleColors[agent.role] || '#b9905c';
  const seed = hashString(agent.id || agent.name || String(index));
  const hat = agent.role === 'Commander' ? '#d9a441' : agent.role === 'Reviewer' ? '#6b4425' : agent.role === 'Researcher' ? '#7d5133' : '#3d2916';
  rect(ctx, x - 4, y + 25, 30, 5, '#3d2916');
  rect(ctx, x + 3, y - 2, 14, 5, hat);
  rect(ctx, x + 4, y + 2, 12, 10, seed % 2 ? '#f2c995' : '#c98f5b');
  rect(ctx, x + 2, y + 12, 17, 17, vest);
  rect(ctx, x + 5, y + 5, 2, 2, '#211407'); rect(ctx, x + 13, y + 5, 2, 2, '#211407');
  rect(ctx, x + 4, y + 29, 5, 5, '#2b1c0f'); rect(ctx, x + 13, y + 29, 5, 5, '#2b1c0f');
  rect(ctx, x + 3, y + 13, 14, 3, working ? '#fff1d6' : '#8f7350');
  if (working) {
    const pulse = Math.floor(t / 140 + index) % 4;
    if (agent.role === 'Researcher') { rect(ctx, x - 11, y + 8, 8, 10, '#4b321b'); rect(ctx, x - 9, y + 10, 4, 1 + pulse, '#d9a441'); }
    else if (agent.role === 'Reviewer') { rect(ctx, x + 21, y + 7, 9, 7, '#3d2916'); strokeRect(ctx, x + 21, y + 7, 9, 7, '#d9a441', 1); }
    else if (agent.role === 'Commander') { rect(ctx, x + 21, y - 2, 7, 7, '#9be37b'); rect(ctx, x + 30, y - 6, 3, 3, '#fff1d6'); }
    else { rect(ctx, x - 11, y + 11, 8, 8, '#3d2916'); strokeRect(ctx, x - 11, y + 11, 8, 8, '#7cc7b2', 1); rect(ctx, x - 9, y + 14, 4 + pulse, 1, '#9be37b'); }
  }
  if (index < 20) {
    const role = agent.role === 'Autonomous Engineer' ? 'Engineer' : agent.role;
    text(ctx, `${agent.name.replace(/^Commander-/, 'Cmd-').slice(0, 10)} · ${role}`.slice(0, 24), x + 27, y - 6, 8, working ? '#fff1d6' : '#d8be8f', 'left', 'mono');
  }
}

function drawPixelEcosystem(t = performance.now()) {
  if (!cityCtx || !cityCanvas || !currentState) return;
  const ctx = cityCtx; ctx.imageSmoothingEnabled = false;
  drawTexture(ctx, t);
  drawRoad(ctx, 620, 70, 58, 590, true);
  drawRoad(ctx, 82, 336, 1110, 58, false);
  drawRoad(ctx, 176, 604, 820, 38, false);
  drawRoad(ctx, 1050, 166, 42, 420, true);
  drawRoad(ctx, 340, 258, 570, 34, false);

  // Earthy data trenches only appear for real active departments/sessions.
  const activeDepts = (currentState.departments || []).filter(d => (d.tool_calls || d.active_agents || d.sessions) > 0);
  for (const dept of activeDepts) {
    const slot = citySlot(dept); const sx = slot.x + slot.w / 2; const sy = slot.y + slot.h / 2;
    const mx = 637; const my = 360;
    strokeRect(ctx, Math.min(sx, mx), Math.min(sy, my), Math.abs(sx - mx) || 2, 2, '#2f3f36', 1);
    strokeRect(ctx, mx, Math.min(sy, my), 2, Math.abs(sy - my) || 2, '#2f3f36', 1);
    const k = ((t / 26 + hashString(dept.id)) % 100) / 100;
    rect(ctx, sx + (mx - sx) * k, sy + (my - sy) * k, 5, 5, colorFor(dept.load || 0));
  }

  // Crates, fences, signs, gardens, and machinery texture the world without pretending to be agents.
  for (let i = 0; i < 80; i++) {
    const x = 44 + ((i * 83) % 1160); const y = 50 + ((i * 47) % 620);
    if (x > 455 && x < 805 && y < 265) continue;
    const colors = ['#465b8b','#6b8f74','#8c5a3c','#8a647d','#7b6550'];
    rect(ctx, x, y, 12, 9, colors[i % colors.length]); strokeRect(ctx, x, y, 12, 9, '#18251d', 1);
    if (i % 7 === 0) rect(ctx, x + 3, y - 5, 6, 5, '#d9a441');
  }
  for (let i = 0; i < 34; i++) {
    const x = 70 + ((i * 149) % 1100); const y = 92 + ((i * 97) % 540);
    rect(ctx, x, y, 22, 14, '#20272d'); strokeRect(ctx, x, y, 22, 14, '#8f97a8', 1);
    rect(ctx, x + 4, y + 4, 12, 2, i % 3 ? '#9be37b' : '#d9a441');
    rect(ctx, x + 4, y + 8, 7, 2, '#d6ad55');
  }
  for (let i = 0; i < 46; i++) {
    const x = 56 + ((i * 211) % 1160); const y = 70 + ((i * 123) % 590);
    rect(ctx, x, y, 3, 8, '#476237'); rect(ctx, x + 4, y + 3, 2, 5, '#58743e');
  }

  for (const dept of currentState.departments || []) drawBuilding(ctx, citySlot(dept), dept, t);
  let globalIndex = 0;
  for (const agent of currentState.agents || []) drawAgentSprite(ctx, agent, globalIndex++, t);
  text(ctx, 'HERMES AGENT HQ — COLOR TEXTURED PIXEL CAMPUS', 36, 36, 18, '#fff1d6', 'left');
  text(ctx, `${(currentState.agents || []).length} real backend agents/sessions · ${(currentState.departments || []).filter(d => d.active_agents > 0).length} active districts`, 38, 60, 11, '#d8c48b', 'left', 'mono');
  if (!(currentState.agents || []).length) text(ctx, 'No real active agents reported by backend — textured campus only; no fake workers.', 640, 354, 15, '#d8c48b', 'center', 'mono');
}

function animationLoop(t) {
  drawPixelEcosystem(t);
  requestAnimationFrame(animationLoop);
}
function ensureAnimation() {
  if (animationStarted) return;
  animationStarted = true;
  requestAnimationFrame(animationLoop);
}

function drawStreams(state) {
  streamsEl.innerHTML = '';
  const active = (state.departments || []).filter(d => (d.tool_calls || d.active_agents || d.sessions) > 0);
  const center = { x: 50, y: 50 };
  active.forEach((dept, i) => {
    const slot = citySlot(dept); const x = ((slot.x + slot.w / 2) / 1280) * 100; const y = ((slot.y + slot.h / 2) / 720) * 100;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('d', `M ${center.x} ${center.y} L ${x.toFixed(1)} ${y.toFixed(1)}`);
    line.setAttribute('stroke', i % 2 ? '#f4f4f455' : '#7cff9b55');
    line.setAttribute('stroke-width', '.18');
    line.setAttribute('stroke-dasharray', '1 1.5');
    line.setAttribute('fill', 'none');
    streamsEl.appendChild(line);
  });
}

function renderHotspots(state) {
  buildingsEl.innerHTML = ''; agentsEl.innerHTML = '';
  for (const dept of state.departments || []) {
    const slot = citySlot(dept); const node = document.createElement('button');
    node.className = 'hotspot'; node.title = dept.name;
    node.style.left = `${(slot.x / 1280) * 100}%`; node.style.top = `${(slot.y / 720) * 100}%`; node.style.width = `${(slot.w / 1280) * 100}%`; node.style.height = `${(slot.h / 720) * 100}%`;
    node.addEventListener('click', () => showDepartment(dept)); buildingsEl.appendChild(node);
  }
  (state.agents || []).slice(0, 24).forEach((agent, index) => {
    const position = agentPosition(agent, index, performance.now());
    const badge = document.createElement('button');
    badge.className = `agent-badge ${agent.activity !== 'idle' ? 'active' : ''}`;
    badge.textContent = agent.name.replace(/^Commander-/, 'Cmd-').slice(0, 14);
    badge.title = `${agent.name} — ${agent.role}`;
    badge.style.left = `${(position.x / 1280) * 100}%`; badge.style.top = `${(position.y / 720) * 100}%`;
    badge.addEventListener('click', () => showAgent(agent)); agentsEl.appendChild(badge);
  });
}

function renderSummary(state) {
  const agents = state.agents || [];
  const activeAgents = agents.filter(agent => !['idle', 'offline'].includes(agent.activity)).length;
  const activeDistricts = (state.departments || []).filter(d => Number(d.active_agents || 0) > 0 || Number(d.sessions || 0) > 0 || Number(d.tool_calls || 0) > 0).length;
  const telemetry = state.telemetry || {};
  statAgentsEl.textContent = String(agents.length);
  statAgentsHintEl.textContent = `${activeAgents} actually working`;
  statDistrictsEl.textContent = String(activeDistricts);
  statSessionsEl.textContent = `${fmt(telemetry.active_sessions || 0)} / ${fmt(telemetry.total_sessions || 0)}`;
  statGatewayEl.textContent = telemetry.gateway_running ? 'Live' : 'Offline';
  statGatewayHintEl.textContent = String(telemetry.gateway_state || 'unknown');
}

function renderState(state) {
  currentState = state;
  truthEl.textContent = state.truth_contract || 'Backend state loaded.';
  renderSummary(state);
  currentAgentsByDepartment = new Map();
  for (const agent of state.agents || []) { const list = currentAgentsByDepartment.get(agent.department) || []; list.push(agent); currentAgentsByDepartment.set(agent.department, list); }
  drawStreams(state); renderHotspots(state); ensureAnimation();
  metricsEl.innerHTML = Object.entries(state.telemetry || {}).map(([k, v]) => `<div><span>${k.replaceAll('_', ' ')}</span><b>${v ?? '—'}</b></div>`).join('') || '<p>No telemetry yet.</p>';
  agentRosterEl.innerHTML = (state.agents || []).length ? state.agents.slice(0, 14).map((agent) => { const details = agentDetails(agent); const active = !['idle', 'offline'].includes(agent.activity); return `<button class="roster-agent ${active ? 'active' : ''}" data-agent-id="${agent.id}"><span class="roster-top"><b>${agent.name}</b><i>${agent.energy}%</i></span><span class="roster-role">${agent.role} · ${agent.personality || 'Steady'}</span><span class="roster-doing">${details.doing}</span><span class="roster-specialty">Good at: ${details.specialty}</span></button>`; }).join('') : '<p>No real Hermes agents/sessions are currently available from this backend. The ecosystem will not fake working agents.</p>';
  agentRosterEl.querySelectorAll('.roster-agent').forEach((button) => button.addEventListener('click', () => { const agent = (state.agents || []).find((item) => item.id === button.dataset.agentId); if (agent) showAgent(agent); }));
  alertsEl.innerHTML = (state.alerts || []).length ? state.alerts.map((a) => `<div class="alert ${a.level}">${a.message}</div>`).join('') : '<div class="alert ok">No real backend alerts.</div>';
  logsEl.textContent = (state.logs || []).length ? state.logs.join('\n') : 'No recent Hermes logs.';
  const firstActive = (state.agents || []).find(a => a.activity !== 'idle'); if (firstActive) showAgent(firstActive); else if (state.departments?.[0]) showDepartment(state.departments[0]);
}

async function loadState() {
  try { const res = await fetch(stateUrl, { cache: 'no-store' }); const data = await res.json(); if (!res.ok) throw new Error(data.error || JSON.stringify(data)); renderState(data); }
  catch (err) { truthEl.textContent = `State error: ${err.message}`; }
}

function openChat() {
  chatDrawer.classList.add('open');
  chatDrawer.setAttribute('aria-hidden', 'false');
  chatBackdrop.hidden = false;
  setTimeout(() => document.querySelector('#chatInput')?.focus(), 50);
}
function closeChat() {
  chatDrawer.classList.remove('open');
  chatDrawer.setAttribute('aria-hidden', 'true');
  chatBackdrop.hidden = true;
}
openChatBtn.addEventListener('click', openChat);
floatingChatBtn.addEventListener('click', openChat);
closeChatBtn.addEventListener('click', closeChat);
chatBackdrop.addEventListener('click', closeChat);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeChat(); });

document.querySelector('#syncBtn').addEventListener('click', loadState); setInterval(loadState, 3000); loadState();

const chatForm = document.querySelector('#chatForm'); const chatInput = document.querySelector('#chatInput'); const chatHistory = document.querySelector('#chatHistory');
function addChat(role, text) { const item = document.createElement('div'); item.className = `chat ${role}`; item.textContent = text; chatHistory.appendChild(item); chatHistory.scrollTop = chatHistory.scrollHeight; }
chatForm.addEventListener('submit', async (event) => {
  event.preventDefault(); const prompt = chatInput.value.trim(); if (!prompt) return; chatInput.value = ''; addChat('user', prompt); addChat('assistant pending', 'Hermes is thinking…'); const pending = chatHistory.querySelector('.pending');
  try { const res = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt }) }); const data = await res.json(); pending.remove(); if (!res.ok) throw new Error(data.error || 'Chat failed'); addChat('assistant', data.output || '(empty response)'); loadState(); }
  catch (err) { pending.remove(); addChat('assistant error', err.message); }
});
