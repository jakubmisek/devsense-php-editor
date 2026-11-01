#!/usr/bin/env node
// @ts-check
/**
 * Production server for the sample web app: ONE Node process, ONE port.
 *
 *   GET  /            static Vite build (dist/)
 *   GET  /healthz     JSON health (200 when the language server is running, else 503)
 *   WS   /lsp         PhpEditor WebSocket (JSON-RPC) -> devsense-php-ls
 *
 * Listens on $PORT (default 8080) on 0.0.0.0. TLS is terminated by the platform
 * (App Service / Container Apps / a reverse proxy), so the browser connects with
 * wss://<same host>/lsp. The licence comes only from the DEVSENSE_PHP_LS_LICENSE env var.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { PhpEditor } = require('devsense-php-editor');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const DIST = path.resolve(process.env.STATIC_DIR || path.join(__dirname, '..', 'dist'));

/** @type {Record<string, string>} */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.wasm': 'application/wasm',
  '.map': 'application/json', '.txt': 'text/plain; charset=utf-8',
};

/** @type {PhpEditor} */
let editor;

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
function handle(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname === '/healthz') {
    const ok = !!editor && editor.isRunning();
    const clients = editor?.getWsServer()?.getClientIds().length ?? 0;
    res.writeHead(ok ? 200 : 503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ status: ok ? 'ok' : 'starting', clients, licensed: !!editor && editor.isLicensed(), uptime: Math.round(process.uptime()) }));
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { allow: 'GET, HEAD' }); res.end(); return; }
  // The dev-only port file (written for Vite) must never be served in production.
  if (url.pathname === '/php-editor-port') { res.writeHead(404); res.end(); return; }

  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { res.writeHead(400); res.end(); return; }
  let file = path.join(DIST, path.normalize(rel));
  if (!file.startsWith(DIST + path.sep) && file !== DIST) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html'); // SPA fallback
  const ext = path.extname(file);
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    // Vite emits content-hashed names under /assets; index.html must stay fresh.
    'cache-control': rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    'x-content-type-options': 'nosniff',
  });
  if (req.method === 'HEAD') { res.end(); return; }
  fs.createReadStream(file).pipe(res);
}

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.error(`[production] ${DIST}/index.html not found. Run "npm run build" first.`);
    process.exit(1);
  }
  const server = http.createServer(handle);
  await new Promise((resolve) => server.listen(PORT, HOST, () => resolve(undefined)));
  editor = new PhpEditor({ server, path: '/lsp' });
  await editor.start();
  console.log(`[production] http://${HOST}:${PORT}  (WebSocket /lsp, health /healthz, licensed: ${editor.isLicensed()})`);

  const shutdown = async () => {
    console.log('[production] shutting down');
    await editor.stop().catch(() => undefined);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => { console.error('[production] failed to start:', err); process.exit(1); });
