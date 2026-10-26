// Dua server HTTP lokal yang sengaja dipisah:
// - server peer: satu-satunya yang terjangkau lewat layanan onion (ping + kotak masuk);
// - server UI: hanya 127.0.0.1, butuh token, melayani antarmuka dan API-nya.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import { limitBytes } from './core.js';

const MB = 1024 * 1024;

function readBody(req, max) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > max) {
        reject(Object.assign(new Error('Terlalu besar'), { code: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const json = (res, code, obj) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
};

export function createPeerServer(core) {
  return http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/ping') {
        res.end('ok');
        return;
      }
      if (req.method === 'POST' && req.url === '/inbox') {
        // Lampiran dikirim base64 dalam amplop JSON; batas mengikuti pengaturan penerima.
        const cap = Math.min(limitBytes(core.settings.limit), 200 * MB) * 1.4 + MB;
        const body = await readBody(req, Math.max(cap, 2 * MB));
        const ok = core.receive(JSON.parse(body.toString('utf8')));
        res.writeHead(ok ? 200 : 400);
        res.end();
        return;
      }
      res.writeHead(404);
      res.end();
    } catch (e) {
      res.writeHead(e.code === 413 ? 413 : 400);
      res.end();
    }
  });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png' };

export function createUiServer(core, { token, distDir, allowedHosts }) {
  const clients = new Set();
  const push = (event, data) => {
    const line = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    clients.forEach((res) => res.write(line));
  };
  core.on('change', (d) => push('change', d));
  core.on('notify', (d) => push('notify', d));

  const routes = [];
  const route = (method, pattern, handler, opts = {}) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ method, re, keys, handler, ...opts });
  };
  const jsonBody = async (req) => {
    const b = await readBody(req, MB);
    return b.length ? JSON.parse(b.toString('utf8')) : {};
  };

  route('GET', '/api/status', () => core.status(), { whenLocked: true });
  route('POST', '/api/unlock', async (req) => { core.unlock((await jsonBody(req)).pin); return core.status(); }, { whenLocked: true });
  route('POST', '/api/onboard', async (req) => { await core.onboard((await jsonBody(req)).name); return core.status(); });
  route('POST', '/api/restore', async (req) => {
    const buf = await readBody(req, 2048 * MB);
    await core.restore(buf, decodeURIComponent(req.headers['x-password'] || ''));
    return core.status();
  });
  route('GET', '/api/chats', (req, p, url) => core.chatList(url.searchParams.get('q')));
  route('GET', '/api/chats/:id', (req, p) => core.chat(p.id));
  route('POST', '/api/chats/:id/read', (req, p) => { core.markRead(p.id); return {}; });
  route('POST', '/api/chats/:id/messages', async (req, p) => core.send(p.id, (await jsonBody(req)).text));
  route('POST', '/api/chats/:id/files', async (req, p) => {
    const buf = await readBody(req, 200 * MB);
    return core.sendFile(p.id, decodeURIComponent(req.headers['x-name'] || 'file'), req.headers['content-type'], buf);
  });
  route('POST', '/api/chats/:id/files/:fid/request', (req, p) => { core.requestFile(p.id, p.fid); return {}; });
  route('POST', '/api/contacts', async (req) => core.addContact((await jsonBody(req)).code));
  route('POST', '/api/contacts/:id/accept', (req, p) => { core.acceptContact(p.id); return {}; });
  route('POST', '/api/contacts/:id/block', (req, p) => { core.blockContact(p.id); return {}; });
  route('DELETE', '/api/contacts/:id', (req, p) => { core.deleteContact(p.id); return {}; });
  route('GET', '/api/settings', () => core.publicSettings());
  route('PATCH', '/api/settings', async (req) => { core.patchSettings(await jsonBody(req)); return core.publicSettings(); });
  route('POST', '/api/me', async (req) => { core.setName((await jsonBody(req)).name); return core.status(); });
  route('POST', '/api/pin', async (req) => { core.setPin((await jsonBody(req)).pin ?? null); return core.publicSettings(); });
  route('POST', '/api/network/retry', () => { core.restartNetwork(); return {}; });
  route('POST', '/api/wipe', () => { core.wipe(); return core.status(); });

  return http.createServer(async (req, res) => {
    // Tolak Host asing (perlindungan DNS rebinding).
    const host = String(req.headers.host || '').replace(/:\d+$/, '');
    if (!allowedHosts.includes(host)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const url = new URL(req.url, 'http://local');
    if (!url.pathname.startsWith('/api/')) {
      serveStatic(res, distDir, url.pathname);
      return;
    }
    const given = req.headers['x-token'] || url.searchParams.get('token');
    if (given !== token) {
      json(res, 401, { error: 'Token tidak valid' });
      return;
    }

    try {
      if (req.method === 'GET' && url.pathname === '/api/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(': ok\n\n');
        clients.add(res);
        const ka = setInterval(() => res.write(': ka\n\n'), 25000);
        req.on('close', () => { clients.delete(res); clearInterval(ka); });
        return;
      }
      if (core.locked && !(url.pathname === '/api/status' || url.pathname === '/api/unlock')) {
        json(res, 423, { error: 'Aplikasi terkunci' });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/qr') {
        const code = core.status().me?.code;
        if (!code) { json(res, 404, { error: 'Belum ada kode' }); return; }
        const svg = await QRCode.toString(code, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#15201B', light: '#FFFFFF' } });
        res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' });
        res.end(svg);
        return;
      }
      const fm = url.pathname.match(/^\/api\/files\/([\w-]+)$/);
      if (req.method === 'GET' && fm) {
        const buf = core.getFile(fm[1]);
        if (!buf) { json(res, 404, { error: 'Lampiran belum ada' }); return; }
        res.writeHead(200, { 'content-type': url.searchParams.get('type') || 'application/octet-stream', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'" });
        res.end(buf);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/backup/export') {
        const buf = core.exportBackup((await jsonBody(req)).password);
        res.writeHead(200, { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(buf);
        return;
      }
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = url.pathname.match(r.re);
        if (!m) continue;
        const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        const out = await r.handler(req, params, url);
        json(res, 200, out ?? {});
        return;
      }
      json(res, 404, { error: 'Tidak ditemukan' });
    } catch (e) {
      json(res, e.code === 413 ? 413 : 400, { error: e.message || 'Gagal' });
    }
  });
}

function serveStatic(res, distDir, pathname) {
  let rel = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = path.join(distDir, rel);
  if (!file.startsWith(distDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(distDir, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Antarmuka belum dibangun. Jalankan: npm run build');
    return;
  }
  res.writeHead(200, {
    'content-type': MIME[path.extname(file)] || 'application/octet-stream',
    'content-security-policy': "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self'",
  });
  fs.createReadStream(file).pipe(res);
}
