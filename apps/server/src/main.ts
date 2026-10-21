import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { Hub } from './hub';

/**
 * The Catan Night game server: rooms and live games over WebSockets at `/ws`, and — when the
 * web app has been built — the app itself, so one process serves everything.
 */
const PORT = Number(process.env.PORT ?? 8787);
const here = fileURLToPath(new URL('.', import.meta.url));
const WEB_DIST = resolve(process.env.WEB_DIST ?? join(here, '../../web/dist'));
const hasWeb = existsSync(join(WEB_DIST, 'index.html'));

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
};

const hub = new Hub();

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: hub.rooms.size }));
    return;
  }
  if (!hasWeb) {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(
      'Catan Night game server is running. Build the web app (pnpm build) to serve it from here too.',
    );
    return;
  }
  // Static files from the built web app; unknown paths fall back to index.html.
  let file = normalize(join(WEB_DIST, decodeURIComponent(url.pathname)));
  if (!file.startsWith(WEB_DIST)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(WEB_DIST, 'index.html');
  const immutable = file.includes(`${join(WEB_DIST, 'assets')}`);
  res.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
const alive = new WeakMap<WebSocket, boolean>();

wss.on('connection', (ws) => {
  alive.set(ws, true);
  ws.on('pong', () => alive.set(ws, true));
  const conn = hub.connect((msg) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  });
  ws.on('message', (data) => conn.onMessage(String(data)));
  ws.on('close', conn.onClose);
  ws.on('error', () => ws.terminate());
});

// Heartbeat: drop connections that stopped answering (closed laptops, lost Wi-Fi).
setInterval(() => {
  for (const ws of wss.clients) {
    if (!alive.get(ws)) {
      ws.terminate();
      continue;
    }
    alive.set(ws, false);
    ws.ping();
  }
  hub.sweep();
}, 20_000).unref();

server.listen(PORT, () => {
  console.log(
    `Catan Night server on http://localhost:${PORT} (WebSocket at /ws)${hasWeb ? ', serving the web app' : ''}`,
  );
});
