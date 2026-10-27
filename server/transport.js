// Mengirim amplop terenkripsi ke perangkat teman. Alamat .onion lewat proxy
// SOCKS Tor; alamat host:port biasa hanya dipakai di mode pengembangan --no-tor.
import http from 'node:http';
import { SocksProxyAgent } from 'socks-proxy-agent';

export class Transport {
  constructor({ socksPort, allowDirect }) {
    this.allowDirect = allowDirect;
    this.agent = socksPort ? new SocksProxyAgent(`socks5h://127.0.0.1:${socksPort}`) : null;
  }

  target(address) {
    if (address.endsWith('.onion')) {
      if (!this.agent) throw new Error('Tor belum aktif');
      return { host: address, port: 80, agent: this.agent };
    }
    if (!this.allowDirect) throw new Error('Alamat bukan .onion');
    const [host, port] = address.split(':');
    return { host, port: Number(port), agent: undefined };
  }

  request(address, method, pathname, body, timeout) {
    return new Promise((resolve, reject) => {
      let t;
      try {
        t = this.target(address);
      } catch (e) {
        reject(e);
        return;
      }
      const data = body ? Buffer.from(JSON.stringify(body)) : null;
      const req = http.request({
        host: t.host,
        port: t.port,
        agent: t.agent,
        method,
        path: pathname,
        timeout,
        headers: data ? { 'content-type': 'application/json', 'content-length': data.length } : {},
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(Buffer.concat(chunks).toString());
          else reject(new Error(`HTTP ${res.statusCode}`));
        });
      });
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  }

  send(address, envelope) {
    return this.request(address, 'POST', '/inbox', envelope, 60000);
  }

  ping(address) {
    return this.request(address, 'GET', '/ping', null, 60000).then(() => true, () => false);
  }
}
