// Tiny server: serves public/ and GET /api/extract?url=... (no dependencies).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleExtract } from './lib/handler.js';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/extract') return handleExtract(req, res);

  const file = path.normalize(path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Forbidden', 'text/plain');
  try {
    send(res, 200, await readFile(file), TYPES[path.extname(file)] || 'application/octet-stream');
  } catch {
    send(res, 404, 'Not found', 'text/plain');
  }
});

server.listen(PORT, HOST, () => console.log(`Citation generator running at http://${HOST === '127.0.0.1' ? 'localhost' : HOST}:${PORT}`));
