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
  'executive-headquarters': { x: 1040, y: 70, w: 480, h: 250, floors: 8, form: 'hq' },
  'research-labs': { x: 130, y: 108, w: 350, h: 230, floors: 3, form: 'dome' },
  'coding-towers': { x: 620, y: 430, w: 340, h: 255, floors: 8, form: 'tower' },
  'deployment-facilities': { x: 1980, y: 108, w: 360, h: 230, floors: 3, form: 'factory' },
  'automation-plants': { x: 1980, y: 430, w: 360, h: 245, floors: 3, form: 'plant' },
  'data-warehouses': { x: 130, y: 735, w: 360, h: 230, floors: 2, form: 'warehouse' },
  'analytics-centers': { x: 1085, y: 910, w: 390, h: 230, floors: 4, form: 'stepped' },
  'finance-centers': { x: 1980, y: 735, w: 360, h: 230, floors: 2, form: 'vault' },
  'media-rooms': { x: 130, y: 1110, w: 340, h: 210, floors: 2, form: 'media' },
  'support-offices': { x: 620, y: 1110, w: 340, h: 210, floors: 3, form: 'office' },
  'marketing-studios': { x: 1360, y: 1110, w: 340, h: 210, floors: 2, form: 'studio' },
  'security-divisions': { x: 1850, y: 1110, w: 360, h: 220, floors: 4, form: 'fort' },
};
const SLOT_ALIASES = {
  mainframe: 'executive-headquarters', executive: 'executive-headquarters', headquarters: 'executive-headquarters', hq: 'executive-headquarters',
  research: 'research-labs', coding: 'coding-towers', code: 'coding-towers', deployment: 'deployment-facilities', deploy: 'deployment-facilities',
  automation: 'automation-plants', data: 'data-warehouses', analytics: 'analytics-centers', security: 'security-divisions',
  support: 'support-offices', marketing: 'marketing-studios', media: 'media-rooms', finance: 'finance-centers',
};
function slugify(value = '') { return String(value).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function citySlot(dept = {}) {
  const keys = [dept.id, dept.kind, dept.slug, dept.name, slugify(dept.name)].filter(Boolean).map((value) => String(value).toLowerCase());
  for (const key of keys) {
    if (CITY_SLOTS[key]) return CITY_SLOTS[key];
    if (SLOT_ALIASES[key] && CITY_SLOTS[SLOT_ALIASES[key]]) return CITY_SLOTS[SLOT_ALIASES[key]];
  }
  const seed = hashString(dept.name || dept.id || 'unknown');
  const fallbackSlots = Object.values(CITY_SLOTS);
  return fallbackSlots[seed % fallbackSlots.length];
}

function setCommandMenu() { /* permanent left rail; no dropdown overlay */ }
function selectMenuPanel(name) {
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

function isoPoly(ctx, points, color, stroke = '#141b1f') {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(Math.round(points[0][0]), Math.round(points[0][1]));
  for (let i = 1; i < points.length; i++) ctx.lineTo(Math.round(points[i][0]), Math.round(points[i][1]));
  ctx.closePath();
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}
function drawIsoBlock(ctx, x, y, w, h, depth, face, side, top, stroke = '#141b1f') {
  // Compact pseudo-3D block: keep all wall faces inside the intended footprint.
  // The old version pushed the right wall outside the building, which made walls overlap in screenshots.
  const d = Math.max(8, Math.min(18, Math.round(depth * 0.42)));
  rect(ctx, x + 10, y + h + 8, w, 12, '#111a16');
  rect(ctx, x, y, w, h, face);
  rect(ctx, x + w - d, y + d, d, h - d, side);
  rect(ctx, x, y, w - d, d, top);
  rect(ctx, x + w - d, y, d, d, side);
  if (stroke) strokeRect(ctx, x, y, w, h, stroke, 2);
}
function drawBuildingPad(ctx, slot, labelColor = '#273a2d') {
  rect(ctx, slot.x - 8, slot.y + slot.h - 35, slot.w + 16, 42, '#142217');
  rect(ctx, slot.x, slot.y + slot.h - 31, slot.w, 32, labelColor);
  rect(ctx, slot.x + 8, slot.y + slot.h - 23, slot.w - 16, 16, '#bfa875');
  strokeRect(ctx, slot.x, slot.y + slot.h - 31, slot.w, 32, '#101812', 1);
}
function drawTexture(ctx, t) {
  // Dense pixel terrain; keep civic core/building pads readable.
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
  for (let i = 0; i < 190; i++) {
    const x = 46 + ((i * 229) % (WORLD_W - 110));
    const y = 50 + ((i * 157) % (WORLD_H - 120));
    if (x > 920 && x < 1660 && y > 40 && y < 900) continue;
    if (x > 80 && x < 500 && y > 80 && y < 360) continue;
    if (x > 560 && x < 980 && y > 330 && y < 670) continue;
    if (x > 1880 && x < 2360 && y > 80 && y < 720) continue;
    drawTree(ctx, x, y, i % 4);
  }
  for (let i = 0; i < 180; i++) {
    const x = 54 + ((i * 193) % (WORLD_W - 120));
    const y = 58 + ((i * 113) % (WORLD_H - 134));
    if (x > 900 && x < 1660 && y > 360 && y < 920) continue;
    if (x > 240 && x < 2320 && ((y > 360 && y < 440) || (y > 1010 && y < 1090))) continue;
    if (y > 340 && y < 1100 && ((x > 500 && x < 580) || (x > 1995 && x < 2070) || (x > 780 && x < 850) || (x > 1585 && x < 1660))) continue;
    if (i % 4 === 0) { rect(ctx, x, y, 7, 4, '#7c8074'); rect(ctx, x + 2, y + 1, 3, 1, '#b1b7aa'); }
    else if (i % 4 === 1) { rect(ctx, x, y, 2, 2, '#d6ad55'); rect(ctx, x + 5, y + 2, 2, 2, '#c57b7b'); rect(ctx, x + 2, y + 5, 2, 1, '#81d672'); }
    else if (i % 4 === 2) { rect(ctx, x, y, 5, 4, '#624527'); rect(ctx, x + 1, y, 3, 1, '#a07442'); }
    else { rect(ctx, x, y, 8, 2, '#375832'); rect(ctx, x + 3, y + 2, 5, 2, '#2a452b'); }
  }
}

function drawRoad(ctx, x, y, w, h, vertical = false) {
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

function drawSign(ctx, x, y, label, color = '#d6ad55') {
  rect(ctx, x - 5, y + 22, label.length * 9 + 16, 6, '#111812');
  rect(ctx, x, y, 4, 28, '#4a3826');
  rect(ctx, x + 8, y, label.length * 9 + 8, 20, '#151d24');
  strokeRect(ctx, x + 8, y, label.length * 9 + 8, 20, color, 1);
  text(ctx, label, x + 12, y + 4, 9, '#fff1d6', 'left', 'mono');
}

function drawDish(ctx, x, y, color = '#d8c48b') {
  rect(ctx, x + 12, y + 18, 7, 20, '#3f3425');
  isoPoly(ctx, [[x, y + 8], [x + 34, y], [x + 28, y + 22], [x + 5, y + 28]], '#8f97a8', '#272f35');
  rect(ctx, x + 24, y - 10, 5, 14, color);
  rect(ctx, x + 32, y - 17, 4, 4, color);
}

function drawGear(ctx, cx, cy, r, color = '#d6ad55') {
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    rect(ctx, cx + Math.cos(a) * r - 3, cy + Math.sin(a) * r - 3, 6, 6, color);
  }
  rect(ctx, cx - r * .7, cy - r * .7, r * 1.4, r * 1.4, '#4a4c2f');
  rect(ctx, cx - 5, cy - 5, 10, 10, '#1c211b');
}

function drawRoadJunction(ctx, x, y, w = 66, h = 66) {
  rect(ctx, x - w / 2 - 4, y - h / 2 - 4, w + 8, h + 8, '#111813');
  rect(ctx, x - w / 2, y - h / 2, w, h, '#3a4550');
  rect(ctx, x - 4, y - h / 2 + 8, 8, h - 16, '#dec987');
  rect(ctx, x - w / 2 + 8, y - 4, w - 16, 8, '#dec987');
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
  const active = Number(dept.active_agents || 0) > 0 || Number(dept.tool_calls || 0) > 0 || Number(dept.sessions || 0) > 0;
  const accent = colorFor(load);
  const form = slot.form || 'office';
  const [base, face, side, trim] = buildingPalette(dept, form);
  const cx = slot.x + slot.w / 2;
  const floors = slot.floors || 2;
  const size = {
    hq: [330, 190, 46], dome: [230, 112, 36], tower: [198, 178, 34], factory: [250, 116, 34], plant: [230, 116, 34],
    warehouse: [270, 96, 30], stepped: [250, 126, 34], vault: [220, 94, 30], fort: [250, 132, 30], office: [214, 126, 30],
    studio: [228, 98, 30], media: [218, 92, 30],
  }[form] || [210, 116, 30];
  const [bw, bh, depth] = size;
  const ground = slot.y + slot.h - 46;
  const left = Math.round(cx - bw / 2 - depth / 2);
  const top = Math.round(ground - bh);

  drawBuildingPad(ctx, slot, active ? '#2d4632' : '#26382b');
  // Keep the area around each building clean: only a small centered entrance strip, no detached side props.
  rect(ctx, cx - 24, slot.y + slot.h - 48, 48, 10, '#c4aa76');

  drawIsoBlock(ctx, left, top, bw, bh, depth, face, side, base, active ? accent : '#151d20');
  rect(ctx, left + 6, top + 8, bw - 12, 5, '#eef0d6');
  rect(ctx, left + bw - 18, top + depth + 10, 10, bh - 20, '#182229');
  rect(ctx, left + 8, top + bh - 18, bw - 14, 18, '#26313a');

  if (form === 'hq') {
    rect(ctx, left + 12, top + 56, 44, bh - 54, '#557fa3'); strokeRect(ctx, left + 12, top + 56, 44, bh - 54, '#172129', 1);
    rect(ctx, left + bw - 56, top + 56, 44, bh - 54, '#456c8d'); strokeRect(ctx, left + bw - 56, top + 56, 44, bh - 54, '#172129', 1);
    drawIsoBlock(ctx, left + 56, top - 46, bw - 112, 46, 16, '#6c91b1', '#385975', '#4f7595', '#172129');
    drawIsoBlock(ctx, cx - 28, top - 104, 56, 60, 16, '#496b87', '#29435c', '#6f8da8', '#172129');
    rect(ctx, cx - 12, top - 122, 24, 18, active ? '#d6ad55' : '#7f8c8d');
    rect(ctx, cx - 2, top - 140, 4, 18, '#d6ad55'); rect(ctx, cx + 2, top - 138, 26, 10, '#c57b7b');
    text(ctx, 'HQ', cx, top - 34, 22, '#fff1d6', 'center', 'mono');
  } else if (form === 'tower') {
    rect(ctx, left + 12, top + 28, 42, bh - 36, '#5d72a8'); strokeRect(ctx, left + 12, top + 28, 42, bh - 36, '#172129', 1);
    rect(ctx, left + bw - 64, top - 38, 52, bh + 20, '#7d93ca'); strokeRect(ctx, left + bw - 64, top - 38, 52, bh + 20, '#172129', 1);
    rect(ctx, left + bw - 28, top - 64, 16, 26, active ? '#6fbfc8' : '#738099');
    rect(ctx, left + bw - 18, top - 82, 4, 18, '#d6ad55');
    text(ctx, '</>', cx, top - 54, 15, '#e3f6e9', 'center', 'mono');
  } else if (form === 'dome') {
    drawIsoBlock(ctx, left + 18, top - 20, bw - 36, 42, 22, '#a2c79f', '#405f4b', '#c5ddbd', '#213526');
    rect(ctx, left + 48, top - 48, bw - 96, 30, '#d1dfbf');
    strokeRect(ctx, left + 48, top - 48, bw - 96, 30, '#405f4b', 1);
    drawDish(ctx, left + bw - 58, top - 42, '#b8f4ff');
  } else if (form === 'factory') {
    for (let i = 0; i < 3; i++) drawIsoBlock(ctx, left + 18 + i * 48, top - 48 - i * 8, 22, 48 + i * 8, 8, side, '#2c211a', trim, '#241912');
    if (active) rect(ctx, left + 28 + (Math.floor(t / 180) % 3) * 48, top - 60, 12, 8, trim);
  } else if (form === 'plant') {
    drawGear(ctx, left + 38, ground - 74, 14, '#d6ad55');
    drawGear(ctx, left + bw - 38, ground - 92, 13, '#81d672');
    rect(ctx, left + 46, top - 38, 94, 38, '#93965c'); strokeRect(ctx, left + 46, top - 38, 94, 38, '#4a4c2f', 1);
    rect(ctx, left + 70, top - 58, 14, 20, '#4a4c2f'); rect(ctx, left + 104, top - 58, 14, 20, '#4a4c2f');
  } else if (form === 'warehouse') {
    for (let i = 0; i < 4; i++) {
      drawIsoBlock(ctx, left + 26 + i * 47, top - 18, 34, bh + 6, 10, '#a48668', '#4e3e31', '#c3a17b', '#2f241c');
      rect(ctx, left + 34 + i * 47, top + 20, 18, 54, i % 2 ? '#6fbfc8' : '#d8c48b');
    }
  } else if (form === 'stepped') {
    drawIsoBlock(ctx, left + 24, top - 34, bw - 48, 38, 18, '#8ea5bc', '#394b60', '#9fb4c8', '#263544');
    drawIsoBlock(ctx, left + 62, top - 66, bw - 124, 32, 14, '#bfd0dd', '#4a5f76', '#d9edf7', '#263544');
    for (let i = 0; i < 6; i++) rect(ctx, left + 26 + i * 30, ground - 46 - i * 8, 18, 46 + i * 8, i % 2 ? '#6fbfc8' : '#d6ad55');
  } else if (form === 'fort') {
    rect(ctx, left + 8, top - 18, 32, bh + 18, '#9d6660'); strokeRect(ctx, left + 8, top - 18, 32, bh + 18, '#2b1918', 1);
    rect(ctx, left + bw - 40, top - 18, 32, bh + 18, '#8d5550'); strokeRect(ctx, left + bw - 40, top - 18, 32, bh + 18, '#2b1918', 1);
    for (let i = 0; i < 6; i++) rect(ctx, left + i * (bw / 6), top - 26, 22, 18, '#b47770');
    rect(ctx, left + bw / 2 - 20, ground - 52, 40, 52, '#432626'); strokeRect(ctx, left + bw / 2 - 20, ground - 52, 40, 52, '#e15f5f', 2);
  } else if (form === 'vault') {
    drawIsoBlock(ctx, left + 26, top - 36, bw - 52, 38, 16, '#b3b7bd', '#41454d', '#d7dbe0', '#323842');
    rect(ctx, cx - 36, ground - 58, 72, 58, '#323842'); strokeRect(ctx, cx - 36, ground - 58, 72, 58, '#d8c48b', 3);
    rect(ctx, cx - 13, ground - 36, 26, 26, '#d8c48b'); rect(ctx, cx - 5, ground - 28, 10, 10, '#41454d');
  } else if (form === 'studio') {
    drawIsoBlock(ctx, left + bw - 62, top - 42, 56, 42, 16, '#b083a5', '#5b3e52', '#d1a0c2', '#2a2530');
    rect(ctx, left + bw - 46, top - 31, 26, 21, active ? '#c57b7b' : '#8a7a66');
  } else if (form === 'media') {
    drawDish(ctx, left + bw - 48, top - 42, '#d6ad55');
  } else if (form === 'office') {
    for (let i = 0; i < 3; i++) {
      rect(ctx, left + bw - 56, top + 22 + i * 26, 38, 18, '#151d24');
      strokeRect(ctx, left + bw - 56, top + 22 + i * 26, 38, 18, '#81d672', 1);
      rect(ctx, left + bw - 50, top + 28 + i * 26, 22, 3, '#fff1d6');
    }
  }

  const winW = form === 'hq' ? 14 : 11;
  const stepX = form === 'hq' ? 23 : form === 'tower' ? 19 : 22;
  const stepY = form === 'hq' ? 18 : 18;
  for (let yy = top + 22; yy < ground - 22; yy += stepY) {
    for (let xx = left + 18; xx < left + bw - 24; xx += stepX) {
      const lit = active || ((Math.round(xx) + Math.round(yy) + load + Math.floor(t / 520)) % 7) === 0;
      rect(ctx, xx, yy, winW, 8, lit ? accent : side);
      rect(ctx, xx + 2, yy + 2, Math.max(2, winW - 5), 2, lit ? '#fff6d8' : base);
    }
  }
  for (let yy = top + depth + 25; yy < ground - 18; yy += 22) rect(ctx, left + bw - 18, yy, 8, 8, active ? accent : '#1f2a32');
  for (let i = 0; i < Math.floor(bw / 20); i++) rect(ctx, left + 10 + i * 20, ground - 10, 10, 4, trim);
  if (active) {
    const spark = Math.floor(t / 140) % 5;
    rect(ctx, left + bw - 14 - spark * 3, top + 24, 3, 3, accent);
    rect(ctx, left - 16 - spark * 2, top + 48, 3, 3, trim);
  }

  rect(ctx, cx - 20, ground - 27, 40, 27, '#20272d'); strokeRect(ctx, cx - 20, ground - 27, 40, 27, active ? accent : '#14191d', 1);
  text(ctx, shortName(dept.name), cx, slot.y + slot.h - 28, form === 'hq' ? 17 : 15, '#fff1d6', 'center', 'mono');
  text(ctx, `${dept.status || 'idle'} · ${load}%`, cx, slot.y + slot.h - 10, 11, active ? accent : '#d8c48b', 'center', 'mono');
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

function drawLamp(ctx, x, y, lit = false) {
  // Missing this helper caused the animation loop to crash right after City Hall,
  // which is why the screenshot only showed the center civic building.
  rect(ctx, x - 5, y + 22, 16, 5, '#111812');
  rect(ctx, x, y, 5, 25, '#3e3426');
  rect(ctx, x - 3, y - 6, 11, 9, lit ? '#f6d97a' : '#6f6147');
  rect(ctx, x - 1, y - 4, 7, 5, lit ? '#fff2ad' : '#3e3426');
  rect(ctx, x - 7, y - 1, 19, 2, '#2b241b');
  if (lit) {
    rect(ctx, x - 9, y - 8, 23, 3, '#d6ad55');
    rect(ctx, x - 12, y - 3, 29, 2, '#bfa05b');
  }
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
  // Cleaner civic anchor: organized plaza, symmetrical hall, readable stairs, and no road clutter through it.
  const w = 300; const h = 150;
  rect(ctx, x - 55, y + h + 24, w + 110, 18, '#111b17');
  rect(ctx, x - 42, y + h + 10, w + 84, 18, '#8a704a');
  rect(ctx, x - 30, y + h + 14, w + 60, 8, '#c4aa76');
  for (let i = 0; i < 5; i++) rect(ctx, x + w / 2 - 80 - i * 8, y + h - 2 + i * 7, 160 + i * 16, 6, i % 2 ? '#8e7654' : '#d0b77d');

  drawIsoBlock(ctx, x + 22, y + 26, w - 44, h - 28, 30, '#b79668', '#6d523d', '#d7c299', '#3f2d22');
  drawIsoBlock(ctx, x + 82, y - 4, w - 164, 34, 22, '#d6bc82', '#8d6442', '#f0d67e', '#3f2d22');
  drawIsoBlock(ctx, x + w / 2 - 36, y - 58, 72, 58, 16, '#846047', '#59402f', '#d7c299', '#3f2d22');
  rect(ctx, x + w / 2 - 18, y - 49, 36, 27, '#f4e5a7');
  strokeRect(ctx, x + w / 2 - 18, y - 49, 36, 27, '#3f2d22', 1);
  rect(ctx, x + w / 2 - 2, y - 42, 3, 12, '#3f2d22');
  rect(ctx, x + w / 2, y - 36, 11, 3, '#3f2d22');
  rect(ctx, x + w / 2 + 4, y - 84, 4, 26, '#d9d4c0');
  rect(ctx, x + w / 2 + 8, y - 84, 38, 14, '#c57b7b');
  rect(ctx, x + w / 2 + 8, y - 78, 27, 5, '#f5f0e6');

  // Orderly columns and windows.
  for (let i = 0; i < 6; i++) {
    const px = x + 50 + i * 38;
    rect(ctx, px + 4, y + 55, 18, 78, '#6f543c');
    rect(ctx, px, y + 52, 18, 78, '#efe4c8');
    rect(ctx, px + 4, y + 52, 4, 78, '#fff7dc');
    rect(ctx, px + 13, y + 52, 5, 78, '#b69b72');
    rect(ctx, px - 4, y + 47, 27, 7, '#5e4937');
    rect(ctx, px - 3, y + 129, 25, 8, '#5e4937');
  }
  for (let i = 0; i < 4; i++) {
    rect(ctx, x + 51 + i * 55, y + 72, 12, 12, '#ffe8a3');
    rect(ctx, x + 51 + i * 55, y + 96, 12, 12, '#8fcad8');
  }
  rect(ctx, x + w / 2 - 31, y + 91, 62, 47, '#2f2520');
  rect(ctx, x + w / 2 - 21, y + 102, 42, 36, '#493527');
  strokeRect(ctx, x + w / 2 - 31, y + 91, 62, 47, '#d6ad55', 1);
  drawSign(ctx, x + w / 2 - 48, y + 18, 'CITY HALL', '#d6ad55');
}

function drawPixelEcosystem(t = performance.now()) {
  if (!cityCtx || !cityCanvas || !currentState) return;
  const ctx = cityCtx; ctx.imageSmoothingEnabled = false;
  drawTexture(ctx, t);

  // Clean thin sidewalk system. No dogleg pipes around every building.
  // Three straight campus paths + one central path; short stubs stop at building pads.
  const pathColor = '#c4aa76';
  drawPathSegment(ctx, 280, 358, 2000, 12, false);
  drawPathSegment(ctx, 280, 704, 2000, 12, false);
  drawPathSegment(ctx, 280, 1030, 2000, 12, false);
  drawPathSegment(ctx, 1275, 320, 12, 790, true);
  const stubs = [
    [305, 330, 12, 36, true], [1280, 320, 12, 44, true], [2160, 330, 12, 36, true],
    [790, 650, 12, 60, true], [2160, 650, 12, 60, true], [310, 930, 12, 106, true], [2160, 930, 12, 106, true],
    [1280, 1100, 12, 38, true], [300, 1030, 12, 82, true], [790, 1030, 12, 82, true], [1530, 1030, 12, 82, true], [2030, 1030, 12, 82, true],
  ];
  for (const [x, y, w, h, vertical] of stubs) drawPathSegment(ctx, x, y, w, h, vertical);

  // Clean civic district: simple centered plaza with fewer ornaments.
  rect(ctx, 1000, 500, 560, 360, '#162719');
  strokeRect(ctx, 1000, 500, 560, 360, '#405837', 2);
  rect(ctx, 1028, 528, 504, 304, '#1e3422');
  drawPathSegment(ctx, 1058, 552, 444, 78, false);
  drawPathSegment(ctx, 1118, 666, 324, 38, false);
  drawPathSegment(ctx, 1275, 500, 12, 360, true);
  drawPathSegment(ctx, 1068, 704, 424, 12, false);
  drawFlowerBed(ctx, 1058, 560, 72, 22); drawFlowerBed(ctx, 1430, 560, 72, 22);
  drawCityHall(ctx, 1132, 522);
  drawFountain(ctx, 1281, 770, t);
  for (const [lx, ly] of [[1042,528],[1516,528],[1042,708],[1516,708]]) drawLamp(ctx, lx, ly, true);

  // Minimal landscaping around the civic border only.
  rect(ctx, 970, 474, 620, 6, '#1d361f'); rect(ctx, 970, 868, 620, 6, '#1d361f');
  for (let x = 1000; x < 1560; x += 82) { drawTree(ctx, x, 458, x % 3); drawTree(ctx, x + 28, 878, x % 4); }

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

  // No random loose props here; building details now stay attached to the buildings.
  for (let i = 0; i < 0; i++) {
    const x = 78 + ((i * 263) % (WORLD_W - 170)); const y = 100 + ((i * 181) % (WORLD_H - 230));
    if (x > 900 && x < 1660 && y > 360 && y < 920) continue;
    if (x > 240 && x < 2320 && ((y > 360 && y < 440) || (y > 1010 && y < 1090))) continue;
    if (y > 340 && y < 1100 && ((x > 500 && x < 580) || (x > 1995 && x < 2070) || (x > 780 && x < 850) || (x > 1585 && x < 1660))) continue;
    const colors = ['#465b8b','#6b8f74','#8c5a3c','#8a647d','#7b6550'];
    if (i % 5 === 0) drawLamp(ctx, x, y, true);
    else { rect(ctx, x, y, 13, 9, colors[i % colors.length]); strokeRect(ctx, x, y, 13, 9, '#18251d', 1); rect(ctx, x + 3, y + 3, 7, 1, '#d6ad55'); }
  }
  for (let i = 0; i < 0; i++) {
    const x = 105 + ((i * 277) % (WORLD_W - 230)); const y = 118 + ((i * 199) % (WORLD_H - 250));
    if (x > 900 && x < 1660 && y > 360 && y < 920) continue;
    if (x > 240 && x < 2320 && ((y > 360 && y < 440) || (y > 1010 && y < 1090))) continue;
    if (y > 340 && y < 1100 && ((x > 500 && x < 580) || (x > 1995 && x < 2070) || (x > 780 && x < 850) || (x > 1585 && x < 1660))) continue;
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
  if (!(currentState.agents || []).length) text(ctx, 'No real active agents reported by backend — scenic campus only; no fake workers.', WORLD_W / 2, WORLD_H - 44, 16, '#d8c48b', 'center', 'mono');
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
