'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const PUBLIC_PORT = Number(process.env.PORT || 8080);
const WEB_PORT = Number(process.env.WEB_INTERNAL_PORT || 3000);
const API_PORT = Number(process.env.API_INTERNAL_PORT || 4000);
const ROOT = __dirname;

function readRel(file) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8').trim();
}

function start(label, command, args, cwd, extraEnv) {
  console.log(`[azure-host] spawn ${label} cwd=${cwd} cmd=${command} ${args.join(' ')}`);
  const child = spawn(command, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, NODE_PATH: '', HOSTNAME: '0.0.0.0', ...extraEnv },
  });
  child.on('exit', (code, signal) => {
    console.error(`[azure-host] ${label} exited code=${code} signal=${signal}`);
  });
  return child;
}

const nextRel = readRel('next-bin-rel.txt');
if (!nextRel) {
  console.error('[azure-host] missing next-bin-rel.txt');
  process.exit(1);
}
const nextBin = path.join(ROOT, nextRel);
const webCwd = path.join(ROOT, 'web');

const siteHost = process.env.WEBSITE_HOSTNAME || 'localhost';
const publicOrigin = `https://${siteHost}`;

function isApiPath(url) {
  return url.startsWith('/api/v1') || url.startsWith('/docs');
}

function proxy(req, res, port) {
  const p = http.request(
    {
      hostname: '127.0.0.1',
      port,
      path: req.url,
      method: req.method,
      headers: req.headers,
    },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    },
  );
  p.on('error', (err) => {
    res.writeHead(503, { 'content-type': 'text/plain' });
    res.end(`Service starting (${port}): ${err.message}`);
  });
  req.pipe(p);
}

const server = http.createServer((req, res) => {
  const url = req.url || '/';
  if (url === '/__host' || url === '/__host/') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        web: WEB_PORT,
        api: API_PORT,
        nextBin: fs.existsSync(nextBin),
      }),
    );
    return;
  }
  proxy(req, res, isApiPath(url) ? API_PORT : WEB_PORT);
});

server.listen(PUBLIC_PORT, '0.0.0.0', () => {
  console.log(`[azure-host] public :${PUBLIC_PORT} -> web :${WEB_PORT}, api :${API_PORT}`);
  console.log(`[azure-host] nextBin=${nextBin} exists=${fs.existsSync(nextBin)}`);
  start(
    'web',
    process.execPath,
    [nextBin, 'start', '--hostname', '127.0.0.1', '--port', String(WEB_PORT)],
    webCwd,
    {
      PORT: String(WEB_PORT),
      HOSTNAME: '127.0.0.1',
      INTERNAL_API_URL: `http://127.0.0.1:${API_PORT}/api/v1`,
      NEXT_PUBLIC_API_URL: `${publicOrigin}/api/v1`,
      APP_BASE_URL: process.env.APP_BASE_URL || publicOrigin,
      WEB_URL: process.env.WEB_URL || publicOrigin,
    },
  );
  start('api', process.execPath, ['dist/main.js'], path.join(ROOT, 'api'), {
    PORT: String(API_PORT),
    NODE_PATH: path.join(ROOT, 'api', 'node_modules'),
    WEB_URL: process.env.WEB_URL || publicOrigin,
    ADMIN_URL: process.env.ADMIN_URL || 'http://localhost:3001',
  });
});
