'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { parse } = require('url');
const { createRequire } = require('module');
const { spawn } = require('child_process');

const PUBLIC_PORT = Number(process.env.PORT || 8080);
const API_PORT = Number(process.env.API_INTERNAL_PORT || 4000);
const ADMIN_PORT = Number(process.env.ADMIN_INTERNAL_PORT || 3001);
const ROOT = __dirname;

function start(label, command, args, cwd, extraEnv) {
  console.log(`[azure-host] spawn ${label} cwd=${cwd}`);
  const child = spawn(command, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, NODE_PATH: '', ...extraEnv },
  });
  child.on('exit', (code, signal) => {
    console.error(`[azure-host] ${label} exited code=${code} signal=${signal}`);
  });
}

function hostName(req) {
  return String(req.headers.host || '')
    .split(':')[0]
    .toLowerCase();
}

function isApiRequest(req) {
  const host = hostName(req);
  const url = req.url || '/';
  const apiHost = (process.env.API_HOST || '').toLowerCase();
  return host.startsWith('api.') || (apiHost && host === apiHost) || url.startsWith('/api/v1') || url.startsWith('/docs');
}

function isAdminRequest(req) {
  const host = hostName(req);
  const adminHost = (process.env.ADMIN_HOST || '').toLowerCase();
  return host.startsWith('admin.') || (adminHost && host === adminHost);
}

function proxyTo(port, req, res, label) {
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
    res.end(`${label} starting: ${err.message}`);
  });
  req.pipe(p);
}

async function prepareWeb() {
  const dir = path.join(ROOT, 'web');
  const pkg = path.join(dir, 'package.json');
  if (!fs.existsSync(pkg)) {
    throw new Error(`missing ${pkg}`);
  }
  const next = createRequire(pkg)('next');
  const app = next({ dev: false, dir, conf: { distDir: '.next' } });
  await app.prepare();
  return app.getRequestHandler();
}

async function main() {
  const siteHost = process.env.WEBSITE_HOSTNAME || 'localhost';
  const publicOrigin = `https://${siteHost}`;
  const webOrigin = (process.env.WEB_URL || publicOrigin).replace(/\/$/, '');
  const adminOrigin = (process.env.ADMIN_URL || publicOrigin).replace(/\/$/, '');

  start('api', process.execPath, ['dist/main.js'], path.join(ROOT, 'api'), {
    PORT: String(API_PORT),
    NODE_PATH: path.join(ROOT, 'api', 'node_modules'),
    WEB_URL: webOrigin,
    ADMIN_URL: adminOrigin,
  });

  const adminDir = path.join(ROOT, 'admin');
  const adminNext = path.join(adminDir, 'node_modules', 'next', 'dist', 'bin', 'next');
  let adminSpawned = false;
  if (fs.existsSync(adminNext)) {
    start('admin', process.execPath, [adminNext, 'start', '-H', '127.0.0.1', '-p', String(ADMIN_PORT)], adminDir, {
      PORT: String(ADMIN_PORT),
      HOSTNAME: '127.0.0.1',
      NODE_PATH: path.join(adminDir, 'node_modules'),
      APP_BASE_URL: adminOrigin,
      ADMIN_URL: adminOrigin,
      WEB_URL: webOrigin,
    });
    adminSpawned = true;
  }

  let webHandle = null;
  let webError = null;
  try {
    webHandle = await prepareWeb();
    console.log('[azure-host] Next web prepared');
  } catch (err) {
    webError = err instanceof Error ? err.message : String(err);
    console.error('[azure-host] Next web failed:', err);
  }

  const server = http.createServer((req, res) => {
    const url = req.url || '/';
    if (url === '/__host' || url === '/__host/') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: true,
          webReady: Boolean(webHandle),
          adminSpawned,
          webError,
          host: hostName(req),
        }),
      );
      return;
    }

    if (isApiRequest(req)) {
      proxyTo(API_PORT, req, res, 'API');
      return;
    }

    if (isAdminRequest(req) && adminSpawned) {
      proxyTo(ADMIN_PORT, req, res, 'Admin');
      return;
    }

    if (webHandle) {
      const parsed = parse(url, true);
      webHandle(req, res, parsed).catch((err) => {
        res.writeHead(500, { 'content-type': 'text/plain' });
        res.end(String(err));
      });
      return;
    }

    res.writeHead(503, { 'content-type': 'text/plain' });
    res.end(`Web failed to start: ${webError || 'unknown'}`);
  });

  server.listen(PUBLIC_PORT, '0.0.0.0', () => {
    console.log(`[azure-host] listening on ${PUBLIC_PORT} (Next web in-process, API :${API_PORT})`);
  });
}

main().catch((err) => {
  console.error('[azure-host] fatal', err);
  process.exit(1);
});
