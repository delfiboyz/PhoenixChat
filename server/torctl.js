// Klien kecil untuk port kontrol Tor: autentikasi cookie lalu GETINFO. Dipakai
// untuk membaca sirkuit (rute relay) yang sedang dipakai perangkat ini.
import fs from 'node:fs';
import net from 'node:net';

export async function openControl(port, cookieFile, timeout = 10000) {
  const sock = net.connect(port, '127.0.0.1');
  sock.setTimeout(timeout, () => sock.destroy(new Error('timeout')));
  const waiting = [];
  let buf = '';
  let reply = null;
  let block = null; // baris data dari balasan "250+key="
  let closed = null;
  const fail = (e) => {
    closed ||= e;
    waiting.splice(0).forEach((w) => w.reject(e));
  };
  sock.on('error', fail);
  sock.on('close', () => fail(new Error('closed')));
  sock.on('data', (d) => {
    buf += d.toString('utf8');
    let i;
    while ((i = buf.indexOf('\r\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 2);
      if (block) {
        if (line === '.') {
          reply.lines.push(block.head + block.data.join('\n'));
          block = null;
        } else {
          block.data.push(line.startsWith('.') ? line.slice(1) : line);
        }
        continue;
      }
      reply ||= { code: 0, lines: [] };
      reply.code = Number(line.slice(0, 3));
      const sep = line[3];
      const text = line.slice(4);
      if (sep === '+') { block = { head: text, data: [] }; continue; }
      reply.lines.push(text);
      if (sep === ' ') {
        const r = reply;
        reply = null;
        const w = waiting.shift();
        if (!w) continue;
        if (r.code >= 200 && r.code < 300) w.resolve(r.lines);
        else w.reject(new Error(`${r.code} ${text}`));
      }
    }
  });
  const send = (cmd) => new Promise((resolve, reject) => {
    if (closed) { reject(closed); return; }
    waiting.push({ resolve, reject });
    sock.write(cmd + '\r\n');
  });
  const ctl = {
    async getInfo(key) {
      const lines = await send(`GETINFO ${key}`);
      const hit = lines.find((l) => l.startsWith(key + '='));
      return hit ? hit.slice(key.length + 1) : '';
    },
    close() { sock.end('QUIT\r\n'); },
  };
  try {
    await send(`AUTHENTICATE ${fs.readFileSync(cookieFile).toString('hex')}`);
  } catch (e) {
    sock.destroy();
    throw e;
  }
  return ctl;
}

// Baris circuit-status: "ID STATUS $FP~nama,$FP~nama KEY=VAL ...". Hanya sirkuit
// yang sudah jadi (BUILT) yang dikembalikan.
export function parseCircuits(text) {
  return text.split('\n').map((l) => l.trim().split(' ')).filter((p) => p[1] === 'BUILT' && p[2]?.startsWith('$')).map((p) => {
    const kv = Object.fromEntries(p.slice(3).map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
    const hops = p[2].split(',').map((h) => {
      const [fp, nick] = h.slice(1).split(/[~=]/);
      return { fp: fp.toUpperCase(), nick: nick || null };
    });
    return { id: p[0], purpose: kv.PURPOSE || 'GENERAL', hsState: kv.HS_STATE || null, rendQuery: kv.REND_QUERY || null, hops };
  });
}

// Bridge tidak ada di konsensus; alamatnya diambil dari baris bridge di pengaturan.
function bridgeIp(fp, bridge) {
  const line = (bridge?.lines || '').split('\n').find((l) => l.toUpperCase().includes(fp));
  if (!line) return null;
  const parts = line.trim().replace(/^Bridge\s+/i, '').split(/\s+/);
  const addr = /^[\d[]/.test(parts[0]) ? parts[0] : parts[1];
  return addr ? addr.replace(/^\[(.*)\]:\d+$/, '$1').replace(/:\d+$/, '') : null;
}

export async function readCircuits(ctl, bridge) {
  const circuits = parseCircuits(await ctl.getInfo('circuit-status'));
  const relays = new Map();
  for (const c of circuits) {
    for (const [i, h] of c.hops.entries()) {
      if (!relays.has(h.fp)) {
        let ip = null;
        try {
          // "r nama identitas digest tanggal jam IP ORPort DirPort"
          const r = (await ctl.getInfo(`ns/id/${h.fp}`)).split('\n').find((l) => l.startsWith('r '));
          ip = r?.split(' ')[6] || null;
        } catch { /* tidak ada di konsensus */ }
        const isBridge = !ip && i === 0 && bridge?.type !== 'none';
        if (isBridge) ip = bridgeIp(h.fp, bridge);
        let country = null;
        if (ip) {
          try {
            const cc = await ctl.getInfo(`ip-to-country/${ip}`);
            if (/^[a-z]{2}$/i.test(cc)) country = cc.toUpperCase();
          } catch { /* basis data GeoIP tidak tersedia */ }
        }
        relays.set(h.fp, { ip, country, bridge: isBridge });
      }
      Object.assign(h, relays.get(h.fp));
    }
  }
  return circuits;
}
