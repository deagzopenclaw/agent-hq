const stateUrl = '/api/hq/state';
let currentState = null;
let currentAgentsByDepartment = new Map();
let animationStarted = false;
const WORLD_W = 2560;
const WORLD_H = 1440;

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
const focusMapBtn = document.querySelector('#focusMapBtn');
const menuTabs = document.querySelectorAll('.menu-tab');
const menuPanels = document.querySelectorAll('.menu-panel-tab');
const closeChatBtn = document.querySelector('#closeChatBtn');
const hqMenuToggle = document.querySelector('#hqMenuToggle');
const commandMenu = document.querySelector('.left-command-menu');

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
  'executive-headquarters': { x: 1090, y: 86, w: 380, h: 260, floors: 9, form: 'hq' },
  'research-labs': { x: 205, y: 150, w: 260, h: 178, floors: 3, form: 'dome' },
  'deployment-facilities': { x: 1785, y: 145, w: 286, h: 184, floors: 4, form: 'factory' },
  'coding-towers': { x: 555, y: 458, w: 220, h: 224, floors: 7, form: 'tower' },
  'automation-plants': { x: 2115, y: 472, w: 244, h: 184, floors: 3, form: 'plant' },
  'data-warehouses': { x: 250, y: 845, w: 286, h: 176, floors: 3, form: 'warehouse' },
  'analytics-centers': { x: 1000, y: 958, w: 260, h: 180, floors: 4, form: 'stepped' },
  'finance-centers': { x: 2080, y: 830, w: 220, h: 152, floors: 3, form: 'vault' },
  'media-rooms': { x: 145, y: 1192, w: 220, h: 138, floors: 3, form: 'media' },
  'support-offices': { x: 615, y: 1184, w: 238, h: 158, floors: 4, form: 'office' },
  'marketing-studios': { x: 1370, y: 1180, w: 246, h: 160, floors: 3, form: 'studio' },
  'security-divisions': { x: 1875, y: 1120, w: 250, h: 166, floors: 5, form: 'fort' },
};
function citySlot(dept) { return CITY_SLOTS[dept.id] || { x: 1190, y: 690, w: 180, h: 130, floors: 2 }; }

function setCommandMenu(open) {
  commandMenu?.classList.toggle('open', open);
  hqMenuToggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (hqMenuToggle) hqMenuToggle.textContent = open ? 'Menu ▴' : 'Menu ▾';
}

function selectMenuPanel(name) {
  setCommandMenu(true);
  menuTabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.panel === name));
  menuPanels.forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === name));
}

function showDepartment(dept) {
  selectMenuPanel('selection');
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
  selectMenuPanel('selection');
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
  // Smaller pixel scale: denser grass, shade, flowers, rocks, and forest details.
  rect(ctx, 0, 0, WORLD_W, WORLD_H, '#203629');
  rect(ctx, 24, 24, WORLD_W - 48, WORLD_H - 48, '#294934');
  strokeRect(ctx, 24, 24, WORLD_W - 48, WORLD_H - 48, '#101c15', 2);
  for (let y = 28; y < WORLD_H - 24; y += 4) {
    for (let x = 28; x < WORLD_W - 24; x += 4) {
      const v = (x * 19 + y * 37 + Math.floor(t / 1800)) % 101;
      if (v < 2) rect(ctx, x, y, 2, 1, '#365d3c');
      else if (v === 7) rect(ctx, x + 1, y + 1, 1, 2, '#1a2c21');
      else if (v === 16) rect(ctx, x + 2, y, 2, 1, '#557a46');
      else if (v === 31) rect(ctx, x + 1, y + 2, 2, 1, '#6d5736');
      else if (v === 53) rect(ctx, x + 2, y + 2, 1, 1, '#d6ad55');
      else if (v === 79) rect(ctx, x, y + 1, 1, 1, '#c57b7b');
    }
  }
  for (let i = 0; i < 230; i++) {
    const x = 46 + ((i * 229) % (WORLD_W - 110));
    const y = 50 + ((i * 157) % (WORLD_H - 120));
    // Keep civic core and building pads readable.
    if (x > 940 && x < 1630 && y > 40 && y < 820) continue;
    if (x > 620 && x < 930 && y > 360 && y < 650) continue;
    if (x > 1700 && x < 2030 && y > 120 && y < 350) continue;
    drawTree(ctx, x, y, i % 4);
  }
  for (let i = 0; i < 210; i++) {
    const x = 54 + ((i * 193) % (WORLD_W - 120));
    const y = 58 + ((i * 113) % (WORLD_H - 134));
    if (i % 4 === 0) { rect(ctx, x, y, 7, 4, '#7c8074'); rect(ctx, x + 2, y + 1, 3, 1, '#b1b7aa'); }
    else if (i % 4 === 1) { rect(ctx, x, y, 2, 2, '#d6ad55'); rect(ctx, x + 5, y + 2, 2, 2, '#c57b7b'); rect(ctx, x + 2, y + 5, 2, 1, '#81d672'); }
    else if (i % 4 === 2) { rect(ctx, x, y, 5, 4, '#624527'); rect(ctx, x + 1, y, 3, 1, '#a07442'); }
    else { rect(ctx, x, y, 8, 2, '#375832'); rect(ctx, x + 3, y + 2, 5, 2, '#2a452b'); }
  }
}

function drawRoadOutline(ctx, roads) {
  for (const [x, y, w, h] of roads) rect(ctx, x - 5, y - 5, w + 10, h + 10, '#111813');
  for (const [x, y, w, h] of roads) rect(ctx, x - 1, y - 1, w + 2, h + 2, '#777f74');
}

function drawRoad(ctx, x, y, w, h, vertical = false) {
  // Clean road segments that meet without messy overlapping borders.
  rect(ctx, x, y, w, h, '#2d3540');
  rect(ctx, x + 4, y + 4, w - 8, h - 8, '#3a4550');
  const stripe = vertical ? h : w;
  for (let i = 34; i < stripe - 34; i += 72) {
    if (vertical) rect(ctx, x + Math.floor(w / 2) - 2, y + i, 4, 28, '#dec987');
    else rect(ctx, x + i, y + Math.floor(h / 2) - 2, 28, 4, '#dec987');
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

function drawTree(ctx, x, y, variant = 0) {
  rect(ctx, x + 6, y + 14, 5, 10, '#563d24');
  rect(ctx, x + 2, y + 9, 14, 9, variant % 2 ? '#315f31' : '#3f7138');
  rect(ctx, x + 5, y + 3, 10, 10, variant % 2 ? '#4f8a42' : '#5c9445');
  rect(ctx, x, y + 14, 18, 6, '#274a2b');
  rect(ctx, x + 8, y + 6, 3, 3, '#9bc76a');
}

function drawStonePath(ctx, points, width = 34) {
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i]; const [x2, y2] = points[i + 1];
    if (Math.abs(x1 - x2) > Math.abs(y1 - y2)) drawPathSegment(ctx, Math.min(x1, x2), y1 - width / 2, Math.abs(x2 - x1), width, false);
    else drawPathSegment(ctx, x1 - width / 2, Math.min(y1, y2), width, Math.abs(y2 - y1), true);
  }
}

function drawPathSegment(ctx, x, y, w, h, vertical = false) {
  rect(ctx, x - 3, y - 3, w + 6, h + 6, '#18261a');
  rect(ctx, x, y, w, h, '#a88d62');
  rect(ctx, x + 4, y + 4, w - 8, h - 8, '#c4aa76');
  const length = vertical ? h : w;
  for (let i = 6; i < length - 6; i += 18) {
    if (vertical) rect(ctx, x + 6 + (i % 3), y + i, w - 12, 2, '#8a704a');
    else rect(ctx, x + i, y + 6 + (i % 3), 2, h - 12, '#8a704a');
  }
}

function drawFlowerBed(ctx, x, y, w, h) {
  rect(ctx, x, y, w, h, '#24452b'); strokeRect(ctx, x, y, w, h, '#162617', 1);
  for (let i = 0; i < Math.floor(w / 10); i++) {
    const px = x + 6 + i * 10; const py = y + 5 + ((i * 7) % Math.max(6, h - 10));
    rect(ctx, px, py, 3, 3, i % 2 ? '#d6ad55' : '#c57b7b');
    rect(ctx, px + 4, py + 2, 2, 2, '#81d672');
  }
}

function drawFountain(ctx, cx, cy, t) {
  const pulse = Math.floor(t / 110) % 5;
  // Deep pixel basin with side faces, rim shine, animated spray, and water caustics.
  rect(ctx, cx - 74, cy + 42, 148, 16, '#111d18');
  rect(ctx, cx - 68, cy - 24, 136, 70, '#8e9a95');
  rect(ctx, cx - 60, cy - 18, 120, 58, '#d6ded9');
  rect(ctx, cx - 52, cy - 9, 104, 42, '#2c7f96');
  rect(ctx, cx - 43, cy - 2, 86, 30, '#58c0d2');
  rect(ctx, cx - 36, cy + 5, 72, 18, '#8be6ef');
  rect(ctx, cx + 52, cy - 18, 8, 58, '#6f7775');
  rect(ctx, cx - 60, cy + 34, 120, 7, '#5c6764');
  strokeRect(ctx, cx - 68, cy - 24, 136, 70, '#f1faf4', 2);
  for (let i = 0; i < 9; i++) {
    const wx = cx - 42 + i * 11;
    rect(ctx, wx, cy + 5 + ((i + pulse) % 3) * 5, 7, 3, i % 2 ? '#eafaff' : '#b8f4ff');
  }
  rect(ctx, cx - 14, cy - 56, 28, 42, '#cfd4cc');
  rect(ctx, cx - 9, cy - 50, 18, 34, '#f0f0de');
  rect(ctx, cx + 10, cy - 54, 5, 38, '#89928c');
  strokeRect(ctx, cx - 14, cy - 56, 28, 42, '#68736d', 1);
  rect(ctx, cx - 4, cy - 88 - pulse, 8, 34 + pulse, '#dffbff');
  rect(ctx, cx - 28 - pulse, cy - 68, 7, 27, '#9eefff');
  rect(ctx, cx + 21 + pulse, cy - 68, 7, 27, '#9eefff');
  rect(ctx, cx - 48 - pulse, cy - 48, 6, 16, '#72d8e8');
  rect(ctx, cx + 42 + pulse, cy - 48, 6, 16, '#72d8e8');
  for (let i = 0; i < 10; i++) rect(ctx, cx - 58 + i * 13, cy - 23, 7, 5, i % 2 ? '#f1faf4' : '#aeb7b3');
}

function drawCityHall(ctx, x, y) {
  const w = 330; const h = 158;
  // City Hall is decorative civic architecture: more depth, side wall, roof layers, columns, windows, flag, and shaded stairs.
  rect(ctx, x + 18, y + h + 12, w - 28, 14, '#111b17');
  rect(ctx, x + 32, y + 52, w - 46, h - 42, '#5e4937');
  rect(ctx, x + 18, y + 42, w - 56, h - 36, '#80664b');
  rect(ctx, x + 32, y + 54, w - 86, h - 62, '#b79668');
  rect(ctx, x + w - 54, y + 54, 36, h - 62, '#6f543c');
  rect(ctx, x + 42, y + 62, w - 116, 7, '#d4bd89');
  rect(ctx, x + 42, y + 82, w - 116, 5, '#7e6043');
  rect(ctx, x + 42, y + 109, w - 116, 5, '#d4bd89');
  // layered roof and pediment
  rect(ctx, x + 48, y + 30, w - 106, 28, '#d7c299');
  rect(ctx, x + 62, y + 18, w - 134, 17, '#916140');
  rect(ctx, x + 78, y + 4, w - 166, 18, '#d9b95e');
  rect(ctx, x + 94, y - 13, w - 198, 18, '#f0d67e');
  rect(ctx, x + 103, y - 6, w - 216, 5, '#fff2a7');
  strokeRect(ctx, x + 18, y + 42, w - 56, h - 36, '#3f2d22', 2);
  // columns with shadows and highlights
  for (let i = 0; i < 6; i++) {
    const px = x + 56 + i * 38;
    rect(ctx, px + 4, y + 61, 18, 82, '#6f543c');
    rect(ctx, px, y + 58, 18, 82, '#efe4c8');
    rect(ctx, px + 4, y + 58, 4, 82, '#fff7dc');
    rect(ctx, px + 13, y + 58, 5, 82, '#b69b72');
    rect(ctx, px - 5, y + 52, 28, 8, '#5e4937');
    rect(ctx, px - 3, y + 139, 24, 8, '#5e4937');
  }
  // glowing windows and carved blocks
  for (let i = 0; i < 5; i++) { rect(ctx, x + 52 + i * 43, y + 73, 10, 10, '#ffe8a3'); rect(ctx, x + 52 + i * 43, y + 92, 10, 10, '#8fcad8'); }
  for (let i = 0; i < 8; i++) rect(ctx, x + 34 + i * 29, y + 119 + (i % 2) * 3, 16, 3, '#6c543e');
  // stairs and doorway
  rect(ctx, x + w / 2 - 34, y + 98, 68, 50, '#2f2520');
  rect(ctx, x + w / 2 - 24, y + 109, 48, 39, '#493527');
  strokeRect(ctx, x + w / 2 - 34, y + 98, 68, 50, '#d6ad55', 1);
  for (let i = 0; i < 5; i++) rect(ctx, x + w / 2 - 54 - i * 5, y + 148 + i * 6, 108 + i * 10, 5, i % 2 ? '#9b835f' : '#c5aa77');
  // clock tower/flag
  rect(ctx, x + w / 2 - 13, y - 42, 26, 30, '#72513c');
  rect(ctx, x + w / 2 - 8, y - 37, 16, 16, '#f4e5a7');
  rect(ctx, x + w / 2 - 2, y - 32, 2, 7, '#3f2d22'); rect(ctx, x + w / 2, y - 30, 6, 2, '#3f2d22');
  rect(ctx, x + w / 2 - 23, y - 58, 46, 16, '#d6ad55');
  rect(ctx, x + w / 2 + 2, y - 78, 3, 20, '#d9d4c0'); rect(ctx, x + w / 2 + 5, y - 78, 30, 12, '#c57b7b'); rect(ctx, x + w / 2 + 5, y - 73, 21, 5, '#f5f0e6');
  text(ctx, 'CITY HALL', x + w / 2, y + 34, 15, '#fff1d6', 'center', 'mono');
}

function drawPixelEcosystem(t = performance.now()) {
  if (!cityCtx || !cityCanvas || !currentState) return;
  const ctx = cityCtx; ctx.imageSmoothingEnabled = false;
  drawTexture(ctx, t);

  // Clean campus road plan: one loop + short spurs with blank plazas at intersections so borders do not pile up.
  const roads = [
    [150, 720, 2260, 72, false],      // main east/west avenue through open grass
    [1246, 350, 72, 690, true],       // civic spine between HQ, City Hall, and fountain
    [500, 720, 72, 560, true],        // west/south spur, clear of buildings
    [1705, 720, 72, 560, true],       // east/south spur, clear of buildings
    [785, 360, 990, 60, false],       // north campus connector below HQ
    [2085, 720, 60, 260, true],       // finance spur
  ];
  drawRoadOutline(ctx, roads);
  for (const [x, y, w, h, vertical] of roads) drawRoad(ctx, x, y, w, h, vertical);
  for (const [x, y, w, h] of [[1234,708,98,98],[488,708,96,96],[1693,708,96,96],[1234,396,98,42]]) { rect(ctx, x, y, w, h, '#3a4550'); strokeRect(ctx, x, y, w, h, '#777f74', 1); }

  // Civic center: detailed but parked in the open middle, away from department building pads.
  drawPathSegment(ctx, 1040, 455, 480, 222, false);
  drawStonePath(ctx, [[1280, 348], [1280, 468], [1280, 677], [1280, 820]], 28);
  drawStonePath(ctx, [[1075, 666], [1485, 666]], 26);
  drawFlowerBed(ctx, 1055, 472, 118, 38); drawFlowerBed(ctx, 1386, 472, 118, 38);
  drawFlowerBed(ctx, 1055, 622, 124, 34); drawFlowerBed(ctx, 1380, 622, 124, 34);
  drawCityHall(ctx, 1124, 472);
  drawFountain(ctx, 1280, 704, t);
  for (const [lx, ly] of [[1025,462],[1534,462],[1025,655],[1534,655],[1190,832],[1370,832],[1190,405],[1370,405]]) drawLamp(ctx, lx, ly, true);

  // Landscaping and shade details.
  rect(ctx, 970, 418, 620, 8, '#1d361f'); rect(ctx, 970, 842, 620, 8, '#1d361f');
  for (let x = 980; x < 1580; x += 22) { rect(ctx, x, 420, 9, 8, '#47723d'); rect(ctx, x + 7, 842, 9, 8, '#47723d'); }
  for (let i = 0; i < 12; i++) { rect(ctx, 900 + i * 32, 875, 18, 7, '#6f4a31'); rect(ctx, 902 + i * 32, 882, 3, 7, '#362416'); rect(ctx, 912 + i * 32, 882, 3, 7, '#362416'); }
  rect(ctx, 1650, 900, 146, 78, '#386f7f'); rect(ctx, 1660, 910, 126, 58, '#5fb8c8'); strokeRect(ctx, 1650, 900, 146, 78, '#d7e5e1', 1);
  for (let i = 0; i < 7; i++) rect(ctx, 1678 + i * 16, 930 + (i % 2) * 8, 9, 3, '#eaf7ff');

  // Active backend packet paths are subtle and don't draw over the road surface.
  const activeDepts = (currentState.departments || []).filter(d => (d.tool_calls || d.active_agents || d.sessions) > 0);
  for (const dept of activeDepts) {
    const slot = citySlot(dept); const sx = slot.x + slot.w / 2; const sy = slot.y + slot.h / 2;
    const mx = 1280; const my = 790;
    strokeRect(ctx, Math.min(sx, mx), Math.min(sy, my), Math.abs(sx - mx) || 2, 2, '#1e3a2d', 1);
    strokeRect(ctx, mx, Math.min(sy, my), 2, Math.abs(sy - my) || 2, '#1e3a2d', 1);
    const k = ((t / 36 + hashString(dept.id)) % 100) / 100;
    rect(ctx, sx + (mx - sx) * k, sy + (my - sy) * k, 4, 4, colorFor(dept.load || 0));
  }

  // Curated props away from building pads.
  for (let i = 0; i < 92; i++) {
    const x = 78 + ((i * 263) % (WORLD_W - 170)); const y = 100 + ((i * 181) % (WORLD_H - 230));
    if (x > 930 && x < 1600 && y > 390 && y < 880) continue;
    const colors = ['#465b8b','#6b8f74','#8c5a3c','#8a647d','#7b6550'];
    if (i % 5 === 0) drawLamp(ctx, x, y, true);
    else { rect(ctx, x, y, 13, 9, colors[i % colors.length]); strokeRect(ctx, x, y, 13, 9, '#18251d', 1); rect(ctx, x + 3, y + 3, 7, 1, '#d6ad55'); }
  }
  for (let i = 0; i < 54; i++) {
    const x = 105 + ((i * 277) % (WORLD_W - 230)); const y = 118 + ((i * 199) % (WORLD_H - 250));
    if (x > 930 && x < 1600 && y > 390 && y < 880) continue;
    rect(ctx, x, y, 24, 14, '#20272d'); strokeRect(ctx, x, y, 24, 14, '#8f97a8', 1);
    rect(ctx, x + 5, y + 4, 13, 2, i % 3 ? '#81d672' : '#d6ad55');
    rect(ctx, x + 5, y + 9, 8, 2, '#6fbfc8');
  }

  // Backend departments drawn after roads/plaza so every building remains visible.
  for (const dept of currentState.departments || []) drawBuilding(ctx, citySlot(dept), dept, t);
  let globalIndex = 0;
  for (const agent of currentState.agents || []) drawAgentSprite(ctx, agent, globalIndex++, t);
  text(ctx, 'HERMES AGENT HQ — HIGH DETAIL PIXEL CAMPUS', 54, 46, 20, '#f5f0e6', 'left');
  text(ctx, `${(currentState.agents || []).length} real backend agents/sessions · ${(currentState.departments || []).filter(d => d.active_agents > 0).length} active districts`, 56, 74, 12, '#d8c48b', 'left', 'mono');
  if (!(currentState.agents || []).length) text(ctx, 'No real active agents reported by backend — scenic campus only; no fake workers.', WORLD_W / 2, WORLD_H / 2, 16, '#d8c48b', 'center', 'mono');
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
    const slot = citySlot(dept); const x = ((slot.x + slot.w / 2) / WORLD_W) * 100; const y = ((slot.y + slot.h / 2) / WORLD_H) * 100;
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
    node.style.left = `${(slot.x / WORLD_W) * 100}%`; node.style.top = `${(slot.y / WORLD_H) * 100}%`; node.style.width = `${(slot.w / WORLD_W) * 100}%`; node.style.height = `${(slot.h / WORLD_H) * 100}%`;
    node.addEventListener('click', () => showDepartment(dept)); buildingsEl.appendChild(node);
  }
  (state.agents || []).slice(0, 24).forEach((agent, index) => {
    const position = agentPosition(agent, index, performance.now());
    const badge = document.createElement('button');
    badge.className = `agent-badge ${agent.activity !== 'idle' ? 'active' : ''}`;
    badge.textContent = agent.name.replace(/^Commander-/, 'Cmd-').slice(0, 14);
    badge.title = `${agent.name} — ${agent.role}`;
    badge.style.left = `${(position.x / WORLD_W) * 100}%`; badge.style.top = `${(position.y / WORLD_H) * 100}%`;
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
hqMenuToggle?.addEventListener('click', () => setCommandMenu(!commandMenu?.classList.contains('open')));

menuTabs.forEach((tab) => tab.addEventListener('click', () => {
  selectMenuPanel(tab.dataset.panel);
  if (tab.dataset.panel === 'chat') openChat();
}));
openChatBtn?.addEventListener('click', openChat);
focusMapBtn?.addEventListener('click', () => document.querySelector('#world')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
closeChatBtn?.addEventListener('click', closeChat);
chatBackdrop?.addEventListener('click', closeChat);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeChat(); });

document.querySelector('#syncBtn').addEventListener('click', loadState); setInterval(loadState, 3000); loadState();

const chatForm = document.querySelector('#chatForm'); const chatInput = document.querySelector('#chatInput'); const chatHistory = document.querySelector('#chatHistory');
function addChat(role, text) { const item = document.createElement('div'); item.className = `chat ${role}`; item.textContent = text; chatHistory.appendChild(item); chatHistory.scrollTop = chatHistory.scrollHeight; }
chatForm.addEventListener('submit', async (event) => {
  event.preventDefault(); const prompt = chatInput.value.trim(); if (!prompt) return; chatInput.value = ''; addChat('user', prompt); addChat('assistant pending', 'Hermes is thinking…'); const pending = chatHistory.querySelector('.pending');
  try { const res = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt }) }); const data = await res.json(); pending.remove(); if (!res.ok) throw new Error(data.error || 'Chat failed'); addChat('assistant', data.output || '(empty response)'); loadState(); }
  catch (err) { pending.remove(); addChat('assistant error', err.message); }
});
