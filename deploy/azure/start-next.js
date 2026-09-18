'use strict';

const { spawn } = require('child_process');
const path = require('path');

const port = String(process.env.PORT || 8080);
const bin = path.join(__dirname, 'node_modules', 'next', 'dist', 'bin', 'next');
const child = spawn(process.execPath, [bin, 'start', '-H', '0.0.0.0', '-p', port], {
  stdio: 'inherit',
  env: process.env,
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
