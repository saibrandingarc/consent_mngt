'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { createRequire } = require('module');
const { spawn } = require('child_process');

const PUBLIC_PORT = Number(process.env.PORT || 8080);
const API_PORT = Number(process.env.API_INTERNAL_PORT || 4000);
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

function loadNext(appDir) {
  const dir = path.join(ROOT, appDir);
  const pkg = path.join(dir, 'package.json');
  if (!fs.existsSync(pkg)) {
    throw new Error(`missing ${pkg}`);
  }
  const req = createRequire(pkg);
  const next = req('next');
  return next({
    dev: false,
    dir,
    hostname: '0.0.0.0',
    port: PUBLIC_PORT,
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

function proxyApi(req, res) {
  const p = http.request(
    {
      hostname: '127.0.0.1',
      port: API_PORT,
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
    res.end(`API starting: ${err.message}`);
  });
  req.pipe(p);
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

  let webApp = null;
  let adminApp = null;
  let webError = null;
  let adminError = null;

  try {
    webApp = loadNext('web');
    await webApp.prepare();
    console.log('[azure-host] Next web prepared');
  } catch (err) {
    webError = err instanceof Error ? err.message : String(err);
    console.error('[azure-host] Next web failed:', err);
  }

  try {
    if (fs.existsSync(path.join(ROOT, 'admin', 'package.json'))) {
      adminApp = loadNext('admin');
      await adminApp.prepare();
      console.log('[azure-host] Next admin prepared');
    }
  } catch (err) {
    adminError = err instanceof Error ? err.message : String(err);
    console.error('[azure-host] Next admin failed:', err);
  }

  const webHandle = webApp ? webApp.getRequestHandler() : null;
  const adminHandle = adminApp ? adminApp.getRequestHandler() : null;

  const server = http.createServer((req, res) => {
    const url = req.url || '/';
    if (url === '/__host' || url === '/__host/') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: true,
          webReady: Boolean(webHandle),
          adminReady: Boolean(adminHandle),
          webError,
          adminError,
          host: hostName(req),
        }),
      );
      return;
    }

    if (isApiRequest(req)) {
      proxyApi(req, res);
      return;
    }

    const parsed = new URL(url, 'http://127.0.0.1');
    if (isAdminRequest(req) && adminHandle) {
      adminHandle(req, res, parsed).catch((err) => {
        res.writeHead(500, { 'content-type': 'text/plain' });
        res.end(String(err));
      });
      return;
    }

    if (webHandle) {
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
    console.log(`[azure-host] listening on ${PUBLIC_PORT} (Next in-process, API :${API_PORT})`);
  });
}

main().catch((err) => {
  console.error('[azure-host] fatal', err);
  process.exit(1);
});
