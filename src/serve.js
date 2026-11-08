/*
 * The map view's server: the page in web/, and the newest map snapshots as
 * JSON. On 127.0.0.1 only, and read-only - it serves what AutomatU already
 * made and changes nothing (t-9b8317f00e).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { latestMap, mappedRepos } from './maps.js';

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

export function serve({ port = 7790, host = '127.0.0.1' } = {}) {
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method !== 'GET') return send(res, 405, { error: 'read-only' });
      const url = new URL(req.url, 'http://' + host);
      if (url.pathname === '/api/repos') return send(res, 200, { repos: await mappedRepos() });
      if (url.pathname === '/api/map') {
        const m = await latestMap(url.searchParams.get('repo') || '');
        return m ? send(res, 200, m) : send(res, 404, { error: 'no map for this repository yet: automatu align <repo>' });
      }
      const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      const file = path.join(WEB, rel);
      if (!file.startsWith(WEB + path.sep) || !fs.existsSync(file)) return send(res, 404, 'not found', 'text/plain');
      return send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
    } catch (e) {
      return send(res, 500, { error: e.message });
    }
  });
  return new Promise((resolve) => server.listen(port, host, () => resolve(server)));
}
