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
function ellipse(ctx, cx, cy, w, h, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(Math.round(cx), Math.round(cy), Math.round(w / 2), Math.round(h / 2), 0, 0, Math.PI * 2);
  ctx.fill();
}
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
  // Strong pseudo-isometric block with real roof + side depth, but capped so walls don't sprawl into neighbors.
  // x/y are the front-wall top-left; the roof rises up/right and the side face stays tight to the building.
  const d = Math.max(12, Math.min(28, Math.round(depth * 0.62)));
  rect(ctx, x + 14, y + h + 8, w + d - 8, 14, '#111a16');
  isoPoly(ctx, [[x, y], [x + d, y - d], [x + w + d, y - d], [x + w, y]], top, stroke);
  isoPoly(ctx, [[x + w, y], [x + w + d, y - d], [x + w + d, y + h - d], [x + w, y + h]], side, stroke);
  isoPoly(ctx, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], face, stroke);
  rect(ctx, x + w - 3, y + 2, 3, h - 5, 'rgba(0,0,0,.18)');
  rect(ctx, x + 8, y + 7, Math.max(18, w - 26), 4, 'rgba(255,255,255,.18)');
}
function drawBlockSurfaceTexture(ctx, x, y, w, h, depth, trim, accent, active, seed = 0) {
  // Detail lives on the roof/front/side surfaces so the buildings stay rich without adding overlapping wall chunks.
  const d = Math.max(12, Math.min(28, Math.round(depth * 0.62)));
  const roofDot = active ? accent : trim;
  for (let i = 0; i < Math.max(4, Math.floor(w / 34)); i++) {
    const px = x + 18 + ((i * 31 + seed * 7) % Math.max(24, w - 42));
    const py = y - d + 5 + ((i * 11 + seed) % Math.max(6, d - 8));
    rect(ctx, px, py, 10, 3, i % 2 ? 'rgba(255,255,255,.22)' : roofDot);
  }
  for (let yy = y + 20; yy < y + h - 18; yy += 22) {
    rect(ctx, x + 10, yy, Math.max(24, w - 26), 2, 'rgba(0,0,0,.18)');
  }
  for (let xx = x + 17; xx < x + w - 28; xx += 24) {
    rect(ctx, xx, y + h - 13, 10, 3, trim);
  }
  for (let yy = y + 18; yy < y + h - 24; yy += 20) {
    rect(ctx, x + w + Math.max(2, d - 10), yy - Math.floor(d / 2), 5, 7, active ? accent : '#22303a');
  }
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
  drawBlockSurfaceTexture(ctx, left, top, bw, bh, depth, trim, accent, active, hashString(dept.id || dept.name || form));
  rect(ctx, left + 6, top + 8, bw - 12, 5, '#eef0d6');
  rect(ctx, left + bw - 18, top + depth + 10, 10, bh - 20, '#182229');
  rect(ctx, left + 8, top + bh - 18, bw - 14, 18, '#26313a');

  if (form === 'hq') {
    rect(ctx, left + 14, top + 62, 36, bh - 68, '#365a77'); strokeRect(ctx, left + 14, top + 62, 36, bh - 68, '#172129', 1);
    rect(ctx, left + bw - 50, top + 62, 36, bh - 68, '#365a77'); strokeRect(ctx, left + bw - 50, top + 62, 36, bh - 68, '#172129', 1);
    drawIsoBlock(ctx, cx - (bw - 124) / 2 - 8, top - 40, bw - 124, 40, 16, '#6c91b1', '#385975', '#4f7595', '#172129');
    drawIsoBlock(ctx, cx - 36, top - 104, 56, 60, 16, '#496b87', '#29435c', '#6f8da8', '#172129');
    rect(ctx, cx - 12, top - 122, 24, 18, active ? '#d6ad55' : '#7f8c8d');
    rect(ctx, cx - 2, top - 140, 4, 18, '#d6ad55'); rect(ctx, cx + 2, top - 138, 26, 10, '#c57b7b');
    text(ctx, 'HQ', cx, top - 34, 22, '#fff1d6', 'center', 'mono');
  } else if (form === 'tower') {
    rect(ctx, left + 16, top + 34, 34, bh - 52, '#5d72a8'); strokeRect(ctx, left + 16, top + 34, 34, bh - 52, '#172129', 1);
    drawIsoBlock(ctx, left + bw - 70, top - 36, 52, bh + 16, 16, '#7d93ca', '#33476f', '#52699b', '#172129');
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
    drawIsoBlock(ctx, cx - (bw - 48) / 2 - 9, top - 34, bw - 48, 38, 18, '#8ea5bc', '#394b60', '#9fb4c8', '#263544');
    drawIsoBlock(ctx, cx - (bw - 124) / 2 - 7, top - 66, bw - 124, 32, 14, '#bfd0dd', '#4a5f76', '#d9edf7', '#263544');
    for (let i = 0; i < 6; i++) rect(ctx, cx - 84 + i * 30, ground - 46 - i * 8, 18, 46 + i * 8, i % 2 ? '#6fbfc8' : '#d6ad55');
  } else if (form === 'fort') {
    // Security: keep it as a clean attached fortress silhouette, not a pile of overlapping wall pieces.
    rect(ctx, left + 12, top - 10, 34, bh + 8, '#8f5b56'); strokeRect(ctx, left + 12, top - 10, 34, bh + 8, '#2b1918', 1);
    rect(ctx, left + bw - 46, top - 10, 34, bh + 8, '#7f4d49'); strokeRect(ctx, left + bw - 46, top - 10, 34, bh + 8, '#2b1918', 1);
    for (let i = 0; i < 7; i++) rect(ctx, left + 14 + i * 32, top - 24, 20, 16, '#b47770');
    rect(ctx, left + 52, top + 16, bw - 104, 12, '#6b3c3a');
    rect(ctx, left + bw / 2 - 24, ground - 54, 48, 54, '#2f1d1d'); strokeRect(ctx, left + bw / 2 - 24, ground - 54, 48, 54, '#e15f5f', 2);
    rect(ctx, left + bw / 2 - 8, ground - 34, 16, 16, '#e15f5f'); rect(ctx, left + bw / 2 - 3, ground - 29, 6, 6, '#2f1d1d');
    rect(ctx, left + bw - 35, top - 42, 18, 24, active ? '#e15f5f' : '#6a5454');
    rect(ctx, left + bw - 29, top - 62, 6, 20, '#d6ad55');
  } else if (form === 'vault') {
    drawIsoBlock(ctx, left + 26, top - 36, bw - 52, 38, 16, '#b3b7bd', '#41454d', '#d7dbe0', '#323842');
    rect(ctx, cx - 36, ground - 58, 72, 58, '#323842'); strokeRect(ctx, cx - 36, ground - 58, 72, 58, '#d8c48b', 3);
    rect(ctx, cx - 13, ground - 36, 26, 26, '#d8c48b'); rect(ctx, cx - 5, ground - 28, 10, 10, '#41454d');
  } else if (form === 'studio') {
    drawIsoBlock(ctx, cx - 36, top - 42, 56, 42, 16, '#b083a5', '#5b3e52', '#d1a0c2', '#2a2530');
    rect(ctx, cx - 13, top - 31, 26, 21, active ? '#c57b7b' : '#8a7a66');
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
  if (form !== 'fort') {
    for (let yy = top + 22; yy < ground - 22; yy += stepY) {
      for (let xx = left + 18; xx < left + bw - 24; xx += stepX) {
        const lit = active || ((Math.round(xx) + Math.round(yy) + load + Math.floor(t / 520)) % 7) === 0;
        rect(ctx, xx, yy, winW, 8, lit ? accent : side);
        rect(ctx, xx + 2, yy + 2, Math.max(2, winW - 5), 2, lit ? '#fff6d8' : base);
        if (((xx + yy) / stepX) % 3 < 1) rect(ctx, xx + winW - 2, yy + 1, 2, 6, 'rgba(0,0,0,.24)');
      }
    }
    for (let yy = top + 28; yy < ground - 22; yy += 22) {
      rect(ctx, left + bw - 14, yy - 8, 7, 8, active ? accent : '#1f2a32');
      rect(ctx, left + bw - 7, yy - 10, 2, 10, 'rgba(255,255,255,.14)');
    }
  }
  for (let i = 0; i < Math.floor(bw / 20); i++) rect(ctx, left + 10 + i * 20, ground - 10, 10, 4, trim);
  if (active) {
    const spark = Math.floor(t / 140) % 5;
    rect(ctx, left + bw - 18 - spark * 2, top + 12, 3, 3, accent);
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
  const roleIcons = { Commander: '★', Researcher: '?', Reviewer: '✓', Operator: '⚙', 'Autonomous Engineer': '</>' };
  const vest = roleColors[agent.role] || '#b9905c';
  const seed = hashString(agent.id || agent.name || String(index));
  const hat = agent.role === 'Commander' ? '#d9a441' : agent.role === 'Reviewer' ? '#6b4425' : agent.role === 'Researcher' ? '#7d5133' : '#3d2916';
  const step = working ? Math.floor(t / 140 + seed) % 4 : Math.floor(t / 520 + seed) % 2;
  const legA = step % 2 ? 2 : -1;
  const legB = step % 2 ? -1 : 2;
  rect(ctx, x - 5, y + 25, 32, 5, '#3d2916');
  rect(ctx, x + 3, y - 2, 14, 5, hat);
  rect(ctx, x + 4, y + 2, 12, 10, seed % 2 ? '#f2c995' : '#c98f5b');
  rect(ctx, x + 2, y + 12, 17, 17, vest);
  rect(ctx, x + 1, y + 16, 4, 9, '#2b1c0f'); rect(ctx, x + 16, y + 16, 4, 9, '#2b1c0f');
  rect(ctx, x + 5, y + 5, 2, 2, '#211407'); rect(ctx, x + 13, y + 5, 2, 2, '#211407');
  rect(ctx, x + 4 + legA, y + 29, 5, 5, '#2b1c0f'); rect(ctx, x + 13 + legB, y + 29, 5, 5, '#2b1c0f');
  rect(ctx, x + 3, y + 13, 14, 3, working ? '#fff1d6' : '#8f7350');
  // A tiny role badge makes real agents feel distinct at map scale.
  rect(ctx, x + 15, y + 10, 9, 9, '#151d24'); strokeRect(ctx, x + 15, y + 10, 9, 9, vest, 1);
  text(ctx, roleIcons[agent.role] || '•', x + 16, y + 10, agent.role === 'Autonomous Engineer' ? 5 : 7, '#fff1d6', 'left', 'mono');
  if (working) {
    const pulse = Math.floor(t / 140 + index) % 4;
    if (agent.role === 'Researcher') {
      rect(ctx, x - 12, y + 8, 9, 11, '#4b321b'); rect(ctx, x - 10, y + 10, 5, 1 + pulse, '#d9a441');
      rect(ctx, x - 15, y + 5 - pulse, 3, 3, '#c87968');
    } else if (agent.role === 'Reviewer') {
      rect(ctx, x + 22, y + 7, 10, 8, '#3d2916'); strokeRect(ctx, x + 22, y + 7, 10, 8, '#d9a441', 1); rect(ctx, x + 25, y + 10, 5, 2, '#9be37b');
    } else if (agent.role === 'Commander') {
      rect(ctx, x + 22, y - 2, 8, 8, '#9be37b'); rect(ctx, x + 31, y - 6, 3, 3, '#fff1d6'); rect(ctx, x + 28, y + 1 + pulse, 8, 2, '#d6ad55');
    } else if (agent.role === 'Autonomous Engineer') {
      rect(ctx, x - 13, y + 11, 10, 8, '#151d24'); strokeRect(ctx, x - 13, y + 11, 10, 8, '#7cc7b2', 1); rect(ctx, x - 11, y + 14, 4 + pulse, 1, '#9be37b'); rect(ctx, x - 15, y + 22, 15, 3, '#6fbfc8');
    } else {
      rect(ctx, x - 11, y + 11, 8, 8, '#3d2916'); strokeRect(ctx, x - 11, y + 11, 8, 8, '#d6ad55', 1); rect(ctx, x - 9, y + 14, 4 + pulse, 1, '#9be37b');
    }
  }
  if (index < 20) {
    const role = agent.role === 'Autonomous Engineer' ? 'Engineer' : agent.role;
    const mood = agent.mood ? ` · ${String(agent.mood).slice(0, 7)}` : '';
    text(ctx, `${agent.name.replace(/^Commander-/, 'Cmd-').slice(0, 10)} · ${role}${mood}`.slice(0, 30), x + 29, y - 7, 8, working ? '#fff1d6' : '#d8be8f', 'left', 'mono');
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

function drawStreetSegment(ctx, x, y, w, h, vertical = false) {
  // Dark asphalt street, not a tan sidewalk/pipe. x/y/w/h are actual road bounds.
  rect(ctx, x - 4, y - 4, w + 8, h + 8, '#101812');
  rect(ctx, x, y, w, h, '#242d35');
  rect(ctx, x + 4, y + 4, w - 8, h - 8, '#34404a');
  rect(ctx, x + 4, y + 4, vertical ? 3 : w - 8, vertical ? h - 8 : 3, '#5a6670');
  rect(ctx, vertical ? x + w - 7 : x + 4, vertical ? y + 4 : y + h - 7, vertical ? 3 : w - 8, vertical ? h - 8 : 3, '#151d23');
  const length = vertical ? h : w;
  for (let i = 30; i < length - 30; i += 70) {
    if (vertical) rect(ctx, x + Math.floor(w / 2) - 2, y + i, 4, 24, '#d9c77a');
    else rect(ctx, x + i, y + Math.floor(h / 2) - 2, 24, 4, '#d9c77a');
  }
}

function drawStreetJunction(ctx, cx, cy, size = 42) {
  rect(ctx, cx - size / 2 - 4, cy - size / 2 - 4, size + 8, size + 8, '#101812');
  rect(ctx, cx - size / 2, cy - size / 2, size, size, '#34404a');
  rect(ctx, cx - 3, cy - size / 2 + 8, 6, size - 16, '#d9c77a');
  rect(ctx, cx - size / 2 + 8, cy - 3, size - 16, 6, '#d9c77a');
}

function drawDriveway(ctx, x, y, w, h, vertical = true) {
  // Short dark spur from road to building pad; no long tan pipe through labels.
  rect(ctx, x - 2, y - 2, w + 4, h + 4, '#101812');
  rect(ctx, x, y, w, h, '#303a42');
  if (vertical) rect(ctx, x + Math.floor(w / 2) - 1, y + 4, 2, Math.max(2, h - 8), '#6a7378');
  else rect(ctx, x + 4, y + Math.floor(h / 2) - 1, Math.max(2, w - 8), 2, '#6a7378');
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

function drawCityHall(ctx, x, y, t = 0) {
  // Apple Park-inspired HQ: a low glass ring with inner courtyard, not a courthouse.
  const cx = x + 146;
  const cy = y + 106;
  const outerW = 304;
  const outerH = 146;
  const innerW = 168;
  const innerH = 72;
  const pulse = Math.floor(t / 140) % 6;
  const orbit = (t / 52) % 360;

  // One readable glass ring with a small grounded shadow; no extra bullseye layers.
  ellipse(ctx, cx, cy + 32, outerW + 8, outerH + 10, '#182719');
  ellipse(ctx, cx, cy + 22, outerW + 4, outerH + 4, '#52635f');
  ellipse(ctx, cx, cy + 12, outerW, outerH, '#b7c9c3');
  ellipse(ctx, cx, cy + 12, outerW - 28, outerH - 22, '#5faebc');
  ellipse(ctx, cx, cy + 12, outerW - 46, outerH - 36, '#c6d5cf');
  // Pixel side band and entrance blocks make the curved HQ share the surrounding 3D language.
  rect(ctx, cx - 137, cy + 36, 42, 9, '#52635f'); rect(ctx, cx + 92, cy + 36, 42, 9, '#52635f');
  rect(ctx, cx - 102, cy + 54, 58, 7, '#314334'); rect(ctx, cx + 48, cy + 54, 58, 7, '#314334');

  // Inner courtyard cuts the building into a clear ring.
  ellipse(ctx, cx, cy + 12, innerW + 22, innerH + 18, '#152819');
  ellipse(ctx, cx, cy + 12, innerW, innerH, '#2b5231');
  ellipse(ctx, cx, cy + 12, innerW - 38, innerH - 26, '#65a867');
  ellipse(ctx, cx, cy + 12, 46, 22, '#58c0d2');
  ellipse(ctx, cx, cy + 10, 28, 12, '#b8f4ff');
  for (let i = 0; i < 5; i++) rect(ctx, cx - 21 + i * 10, cy + 8 + ((i + pulse) % 3) * 3, 6, 2, '#eafaff');
  for (const [tx, ty] of [[cx - 58, cy + 1], [cx + 52, cy + 1], [cx - 32, cy + 28], [cx + 38, cy + 28]]) {
    rect(ctx, tx, ty, 6, 11, '#2d6a3a'); rect(ctx, tx - 3, ty + 6, 12, 5, '#72b76f');
  }

  // Glass panels, roof seams, and highlights around the ring.
  const panels = [
    [cx - 128, cy - 12, 30, 8], [cx - 88, cy - 24, 32, 7], [cx - 44, cy - 30, 32, 7], [cx + 8, cy - 31, 32, 7], [cx + 58, cy - 23, 32, 7], [cx + 100, cy - 10, 30, 8],
    [cx - 136, cy + 22, 28, 8], [cx - 92, cy + 42, 32, 7], [cx - 40, cy + 52, 34, 7], [cx + 12, cy + 52, 34, 7], [cx + 66, cy + 42, 32, 7], [cx + 108, cy + 22, 28, 8],
  ];
  for (const [px, py, pw, ph] of panels) { rect(ctx, px, py, pw, ph, '#4b9ead'); rect(ctx, px + 3, py + 2, Math.max(5, pw - 12), 2, '#b8f4ff'); }
  for (const [px, py] of [[cx - 145, cy + 2], [cx - 119, cy - 28], [cx - 70, cy - 44], [cx - 18, cy - 49], [cx + 42, cy - 45], [cx + 92, cy - 30], [cx + 138, cy + 1], [cx - 116, cy + 52], [cx - 50, cy + 70], [cx + 35, cy + 70], [cx + 105, cy + 52]]) {
    rect(ctx, px, py, 18, 4, '#dfeee8');
  }
  // Animated sparkle sweeps around the glass ring so the centerpiece feels alive.
  for (let i = 0; i < 3; i++) {
    const a = (orbit + i * 118) * Math.PI / 180;
    const gx = cx + Math.cos(a) * 132;
    const gy = cy + 15 + Math.sin(a) * 58;
    rect(ctx, gx - 8, gy - 2, 16, 4, '#eafaff');
    rect(ctx, gx - 3, gy - 6, 6, 12, '#9eefff');
  }

  // Subtle entrances and signage integrated into the ring.
  rect(ctx, cx - 42, cy + 78, 84, 18, '#111b17');
  rect(ctx, cx - 34, cy + 70, 68, 20, '#b7c9c3');
  rect(ctx, cx - 24, cy + 74, 48, 12, '#253440');
  rect(ctx, cx - 4, cy + 74, 4, 12, '#f5f0e6');
  rect(ctx, cx - 52, cy + 96, 104, 8, '#d0b77d');
  text(ctx, 'AGENT PARK', cx, cy + 88, 10, '#f5f0e6', 'center', 'mono');
  // Small autonomous shuttles circulate at the south entrance.
  const shuttleX = cx - 48 + ((t / 35) % 96);
  rect(ctx, shuttleX, cy + 103, 18, 8, '#d7e2dd'); rect(ctx, shuttleX + 3, cy + 105, 5, 2, '#5fb8c8'); rect(ctx, shuttleX + 12, cy + 105, 3, 2, '#5fb8c8');
  rect(ctx, shuttleX + 2, cy + 111, 3, 2, '#101812'); rect(ctx, shuttleX + 13, cy + 111, 3, 2, '#101812');

  // Minimal roof equipment / solar dots, attached to the roof surface.
  for (let i = 0; i < 12; i++) {
    const px = cx - 118 + i * 21;
    const py = cy - 2 + ((i * 7) % 22);
    if (px > cx - innerW / 2 - 12 && px < cx + innerW / 2 + 12 && py > cy - innerH / 2 && py < cy + innerH / 2 + 20) continue;
    rect(ctx, px, py, 8, 3, i % 2 ? '#8f9f98' : '#cfd8d5');
  }
  // Tiny roof service beacons blink gently, adding motion without fake agents.
  for (const [bx, by, off] of [[cx - 92, cy - 10, 0], [cx + 86, cy - 8, 2], [cx - 4, cy + 58, 4]]) {
    rect(ctx, bx, by, 5, 5, (pulse + off) % 6 < 3 ? '#81d672' : '#2f6f43');
  }
}
function drawPixelEcosystem(t = performance.now()) {
  if (!cityCtx || !cityCanvas || !currentState) return;
  const ctx = cityCtx; ctx.imageSmoothingEnabled = false;
  drawTexture(ctx, t);

  // Street grid: dark asphalt roads with curbs/lane markers, plus short driveway stubs to pads.
  // These replace the old tan sidewalk-looking pipes.
  // Organized street grid: consistent roads and clean bypasses around City Hall.
  drawStreetSegment(ctx, 250, 346, 2060, 34, false);
  drawStreetSegment(ctx, 250, 688, 700, 34, false);
  drawStreetSegment(ctx, 1592, 688, 718, 34, false);
  drawStreetSegment(ctx, 250, 1014, 2060, 34, false);
  drawStreetSegment(ctx, 918, 346, 34, 702, true);
  drawStreetSegment(ctx, 1592, 346, 34, 702, true);
  drawStreetSegment(ctx, 918, 840, 708, 34, false);
  for (const [cx, cy] of [[935, 363], [935, 705], [935, 857], [935, 1031], [1609, 363], [1609, 705], [1609, 857], [1609, 1031]]) drawStreetJunction(ctx, cx, cy, 46);
  const driveways = [
    [300, 326, 24, 24, true], [1269, 304, 24, 46, true], [2150, 326, 24, 24, true],
    [780, 650, 24, 38, true], [2150, 650, 24, 38, true], [300, 928, 24, 86, true], [2150, 928, 24, 86, true],
    [1269, 874, 24, 48, true], [300, 1038, 24, 250, true], [780, 1038, 24, 250, true], [1520, 1038, 24, 250, true], [2020, 1038, 24, 250, true],
  ];
  for (const [x, y, w, h, vertical] of driveways) drawDriveway(ctx, x, y, w, h, vertical);

  // Organized civic district: one quiet oval lawn under the ring, not stacked circles.
  const civicCx = 1280;
  const civicCy = 670;
  ellipse(ctx, civicCx, civicCy + 6, 486, 232, '#1a2f20');
  ellipse(ctx, civicCx, civicCy, 448, 204, '#213a25');
  ellipse(ctx, civicCx, civicCy, 376, 158, '#294d2f');
  // A soft inner grass patch supports the Apple Park building without competing with its ring.
  ellipse(ctx, civicCx, civicCy + 2, 276, 106, '#315f38');
  // Tan pads and short walks match the surrounding building bases instead of a floating oval.
  rect(ctx, 1210, 810, 140, 14, '#111b17'); rect(ctx, 1218, 802, 124, 16, '#d0b77d');
  rect(ctx, 1267, 548, 26, 244, '#8a704a'); rect(ctx, 1273, 548, 14, 244, '#c4aa76');
  rect(ctx, 1098, 710, 364, 22, '#8a704a'); rect(ctx, 1098, 716, 364, 10, '#c4aa76');
  for (const [gx, gy, gw, gh] of [[1098,566,88,28],[1374,566,88,28],[1098,760,88,28],[1374,760,88,28]]) { rect(ctx, gx, gy, gw, gh, '#24452b'); drawFlowerBed(ctx, gx + 8, gy + 6, gw - 16, 16); }

  drawCityHall(ctx, 1134, 558, t);
  for (const [lx, ly] of [[1040,544],[1520,544],[1040,804],[1520,804],[1110,688],[1450,688]]) drawLamp(ctx, lx, ly, true);
  // A few restrained moving campus packets on the paths make the center stand out without adding fake workers.
  for (let i = 0; i < 4; i++) {
    const k = ((t / 42 + i * 24) % 100) / 100;
    const px = i % 2 ? 1098 + 364 * k : 1462 - 364 * k;
    const py = i < 2 ? 719 : 548 + 244 * k;
    rect(ctx, px, py, 5, 5, i % 2 ? '#d6ad55' : '#6fbfc8');
  }

  // Clean border landscaping, aligned to the plaza edge.
  rect(ctx, 986, 470, 588, 6, '#1d361f'); rect(ctx, 986, 876, 588, 6, '#1d361f');
  for (let x = 1016; x < 1540; x += 96) { drawTree(ctx, x, 456, x % 3); drawTree(ctx, x + 36, 884, x % 4); }

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
