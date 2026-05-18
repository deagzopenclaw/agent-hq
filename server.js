import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const HERMES_ROOT = process.env.HERMES_ROOT || '/home/deagz/.hermes/hermes-agent';
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 7777);

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJSON(res, status, obj) {
  send(res, status, JSON.stringify(obj), {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
}

function collectBody(req, maxBytes = 128_000) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (Buffer.byteLength(data) > maxBytes) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function fallbackHQState(reason = 'Hermes backend is not mounted in this environment') {
  const departments = [
    ['executive-headquarters', 'Executive Headquarters', 'mainframe', 0],
    ['research-labs', 'Research Labs', 'research', 0],
    ['coding-towers', 'Coding Towers', 'coding', 0],
    ['deployment-facilities', 'Deployment Facilities', 'deployment', 0],
    ['automation-plants', 'Automation Plants', 'automation', 0],
    ['data-warehouses', 'Data Warehouses', 'data', 0],
    ['analytics-centers', 'Analytics Centers', 'analytics', 0],
    ['security-divisions', 'Security Divisions', 'security', 0],
    ['support-offices', 'Support Offices', 'support', 0],
    ['marketing-studios', 'Marketing Studios', 'marketing', 0],
    ['media-rooms', 'Media Rooms', 'media', 0],
    ['finance-centers', 'Finance Centers', 'finance', 0],
  ].map(([id, name, kind, load]) => ({
    id, name, kind, x: 0, y: 0, load, active_agents: 0, sessions: 0,
    tool_calls: 0, tokens: 0, status: 'idle',
  }));
  return {
    generated_at: Date.now() / 1000,
    truth_contract: `Railway UI is live, but real Hermes backend data is unavailable here: ${reason}. No fake agent work is being shown.`,
    telemetry: {
      gateway_running: false,
      gateway_state: 'unavailable-on-railway',
      active_sessions: 0,
      total_sessions: 0,
      enabled_cron_jobs: 0,
      tracked_processes: 0,
      connected_platforms: 0,
    },
    departments,
    agents: [],
    alerts: [{ level: 'warning', message: `Real Hermes backend unavailable: ${reason}` }],
    logs: ['Railway preview mode: UI deployed without local Hermes runtime mounted.'],
  };
}

function runPythonHQState() {
  return new Promise((resolve, reject) => {
    const code = `
import json, sys
sys.path.insert(0, ${JSON.stringify(HERMES_ROOT)})
from hermes_cli.web_server import _build_hq_state
print(json.dumps(_build_hq_state(), default=str))
`;
    const child = spawn('python', ['-c', code], {
      cwd: HERMES_ROOT,
      env: { ...process.env, PYTHONPATH: HERMES_ROOT },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 10_000);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(stderr || `HQ state exited ${code}`));
      try {
        resolve(JSON.parse(stdout));
      } catch (err) {
        reject(new Error(`Could not parse HQ state: ${err.message}\n${stdout.slice(0, 300)}`));
      }
    });
  });
}

function stripAnsi(text) {
  return String(text || '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\r/g, '\n');
}

function cleanHermesChatOutput(raw) {
  const text = stripAnsi(raw);
  const lines = text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => {
      const t = line.trim();
      if (!t) return false;
      if (t.startsWith('Query:')) return false;
      if (/^Initializing agent/i.test(t)) return false;
      if (/^Resume this session with:/i.test(t)) return false;
      if (/^hermes --resume\b/i.test(t)) return false;
      if (/^(Session|Duration|Messages):\s+/i.test(t)) return false;
      if (/^[╭╰─╮╯⚕ Hermes\s]+$/.test(t)) return false;
      if (/^[─━═\-\s]+$/.test(t)) return false;
      return true;
    });

  const start = lines.findIndex((line) => /Hermes/i.test(line) && /[╭┌]/.test(line));
  const usable = start >= 0 ? lines.slice(start + 1) : lines;
  const cleaned = usable
    .filter((line) => !/^[╭╰─╮╯⚕ Hermes\s]+$/.test(line.trim()))
    .join('\n')
    .trim();

  return cleaned || text.trim();
}

function runHermesChat(prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn('python', ['-m', 'hermes_cli.main', 'chat', '-q', prompt], {
      cwd: HERMES_ROOT,
      env: { ...process.env, PYTHONPATH: HERMES_ROOT, HERMES_NONINTERACTIVE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 180_000);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(stderr || `Hermes chat exited ${code}`));
      resolve({ output: cleanHermesChatOutput(stdout), rawOutput: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

async function serveStatic(req, res, pathname) {
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (!filePath.startsWith(PUBLIC_DIR) || !existsSync(filePath)) {
    return send(res, 404, 'Not found', { 'content-type': 'text/plain' });
  }
  const ext = path.extname(filePath);
  const data = await readFile(filePath);
  send(res, 200, data, { 'content-type': MIME[ext] || 'application/octet-stream' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/api/health') {
      return sendJSON(res, 200, { ok: true, hermesRoot: HERMES_ROOT, port: PORT });
    }

    if (req.method === 'GET' && url.pathname === '/api/hq/state') {
      if (!existsSync(HERMES_ROOT)) return sendJSON(res, 200, fallbackHQState(`missing ${HERMES_ROOT}`));
      try {
        const state = await runPythonHQState();
        return sendJSON(res, 200, state);
      } catch (err) {
        return sendJSON(res, 200, fallbackHQState(err.message || String(err)));
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/chat') {
      if (!existsSync(HERMES_ROOT)) {
        return sendJSON(res, 503, {
          error: `Hermes chat is not available on this Railway runtime because ${HERMES_ROOT} is not mounted.`,
        });
      }
      const raw = await collectBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const prompt = String(body.prompt || '').trim();
      if (!prompt) return sendJSON(res, 400, { error: 'Prompt is required' });
      const result = await runHermesChat(prompt);
      return sendJSON(res, 200, result);
    }

    if (req.method === 'GET') return serveStatic(req, res, url.pathname);
    sendJSON(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    sendJSON(res, 500, { error: err.message || String(err) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Agent HQ standalone site → http://127.0.0.1:${PORT}`);
  console.log(`Serving real Hermes state from ${HERMES_ROOT}`);
});
