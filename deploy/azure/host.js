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
  const child = spawn(command, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  child.on('exit', (code, signal) => {
    console.error(`[azure-host] ${label} exited code=${code} signal=${signal}`);
  });
  return child;
}

const webRel = readRel('web-server-rel.txt');
if (!webRel) {
  console.error('[azure-host] missing web-server-rel.txt');
  process.exit(1);
}
const webServer = path.join(ROOT, webRel);
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
    res.end(JSON.stringify({ ok: true, web: WEB_PORT, api: API_PORT }));
    return;
  }
  proxy(req, res, isApiPath(url) ? API_PORT : WEB_PORT);
});

server.on('upgrade', (req, socket, head) => {
  const url = req.url || '/';
  const port = isApiPath(url) ? API_PORT : WEB_PORT;
  const p = http.request({
    hostname: '127.0.0.1',
    port,
    path: url,
    method: req.method,
    headers: req.headers,
  });
  p.on('upgrade', (upRes, upSocket, upHead) => {
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n${Object.keys(upRes.headers)
        .map((k) => `${k}: ${upRes.headers[k]}`)
        .join('\r\n')}\r\n\r\n`,
    );
    upSocket.write(upHead);
    socket.pipe(upSocket).pipe(socket);
  });
  p.on('error', () => socket.destroy());
  p.end(head);
});

server.listen(PUBLIC_PORT, '0.0.0.0', () => {
  console.log(`[azure-host] public :${PUBLIC_PORT} -> web :${WEB_PORT}, api :${API_PORT}`);
  start('web', process.execPath, [webServer], webCwd, {
    PORT: String(WEB_PORT),
    HOSTNAME: '0.0.0.0',
    NODE_PATH: [path.join(webCwd, 'node_modules'), path.join(path.dirname(webServer), 'node_modules')].join(path.delimiter),
    INTERNAL_API_URL: `http://127.0.0.1:${API_PORT}/api/v1`,
    NEXT_PUBLIC_API_URL: `${publicOrigin}/api/v1`,
    APP_BASE_URL: process.env.APP_BASE_URL || publicOrigin,
    WEB_URL: process.env.WEB_URL || publicOrigin,
  });
  start('api', process.execPath, ['dist/main.js'], path.join(ROOT, 'api'), {
    PORT: String(API_PORT),
    NODE_PATH: path.join(ROOT, 'api', 'node_modules'),
    WEB_URL: process.env.WEB_URL || publicOrigin,
    ADMIN_URL: process.env.ADMIN_URL || 'http://localhost:3001',
  });
});
