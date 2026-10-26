// Menjalankan Tor tertanam: satu proses tor per perangkat, dengan layanan onion
// sendiri yang meneruskan port 80 ke server peer lokal.
import { spawn, execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { UserError } from './i18n.js';
import { openControl, readCircuits } from './torctl.js';

function which(bin) {
  try {
    return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null;
  } catch {
    return null;
  }
}

export class Tor extends EventEmitter {
  constructor({ dataDir, peerPort, socksPort, controlPort, torPath }) {
    super();
    this.dir = path.join(dataDir, 'tor');
    this.peerPort = peerPort;
    this.socksPort = socksPort;
    this.controlPort = controlPort;
    this.torPath = torPath || process.env.TOR_PATH || which('tor');
    this.state = { phase: 'idle', progress: 0, error: null, address: null };
    this.proc = null;
  }

  set(patch) {
    this.state = { ...this.state, ...patch };
    this.emit('state', this.state);
  }

  torrc(bridge) {
    const lines = [
      `DataDirectory ${path.join(this.dir, 'data')}`,
      `SocksPort 127.0.0.1:${this.socksPort}`,
      // Port kontrol hanya untuk membaca sirkuit (layar Rute Tor), dijaga cookie.
      this.controlPort ? `ControlPort 127.0.0.1:${this.controlPort}` : 'ControlPort 0',
      'CookieAuthentication 1',
      `CookieAuthFile ${this.cookieFile()}`,
      'Log notice stdout',
      `HiddenServiceDir ${path.join(this.dir, 'hs')}`,
      'HiddenServiceVersion 3',
      `HiddenServicePort 80 127.0.0.1:${this.peerPort}`,
    ];
    if (bridge && bridge.type !== 'none') {
      const lines2 = (bridge.lines || '').split('\n').map((l) => l.trim()).filter(Boolean);
      const exe = bridge.type === 'snowflake' ? which('snowflake-client') : (which('lyrebird') || which('obfs4proxy'));
      if (!exe) throw new UserError('bridgeProgram', { type: bridge.type });
      if (!lines2.length) throw new UserError('bridgeNoLines');
      lines.push('UseBridges 1', `ClientTransportPlugin ${bridge.type} exec ${exe}`);
      for (const l of lines2) lines.push(`Bridge ${l.replace(/^Bridge\s+/i, '')}`);
    }
    return lines.join('\n') + '\n';
  }

  start(bridge) {
    this.stop();
    if (!this.torPath) {
      this.set({ phase: 'error', error: { key: 'torMissing' } });
      return;
    }
    fs.mkdirSync(path.join(this.dir, 'hs'), { recursive: true, mode: 0o700 });
    fs.chmodSync(path.join(this.dir, 'hs'), 0o700);
    let rc;
    try {
      rc = this.torrc(bridge);
    } catch (e) {
      this.set({ phase: 'error', error: e.key ? { key: e.key, vars: e.vars } : e.message });
      return;
    }
    fs.writeFileSync(path.join(this.dir, 'torrc'), rc);
    this.set({ phase: 'connecting', progress: 0, error: null });
    const proc = spawn(this.torPath, ['-f', path.join(this.dir, 'torrc')], { stdio: ['ignore', 'pipe', 'pipe'] });
    this.proc = proc;
    let buf = '';
    const onData = (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        this.line(buf.slice(0, i));
        buf = buf.slice(i + 1);
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('exit', (code) => {
      if (this.proc !== proc) return;
      this.proc = null;
      if (this.state.phase !== 'stopped') {
        this.set({ phase: 'error', error: { key: 'torStopped', vars: { code } } });
      }
    });
    // Bootstrap yang macet terlalu lama dianggap gagal.
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.state.phase === 'connecting') {
        this.set({ phase: 'error', error: { key: 'torTimeout' } });
      }
    }, 120000);
  }

  line(l) {
    const m = l.match(/Bootstrapped (\d+)%/);
    if (m) {
      const progress = Number(m[1]);
      if (progress >= 100) {
        clearTimeout(this.timer);
        this.set({ phase: 'ready', progress, address: this.address() });
      } else {
        this.set({ progress });
      }
    }
    if (/\[err\]/.test(l)) this.set({ phase: 'error', error: l.replace(/^.*\[err\]\s*/, '') });
  }

  cookieFile() {
    return path.join(this.dir, 'control_auth_cookie');
  }

  // Sirkuit yang sedang dipakai, lengkap dengan IP dan negara tiap relay.
  async circuits(bridge) {
    if (!this.controlPort || this.state.phase !== 'ready') return null;
    const ctl = await openControl(this.controlPort, this.cookieFile());
    try {
      return await readCircuits(ctl, bridge);
    } finally {
      ctl.close();
    }
  }

  // Alamat .onion v3 dibuat tor dari kunci di folder hs.
  address() {
    try {
      return fs.readFileSync(path.join(this.dir, 'hs', 'hostname'), 'utf8').trim();
    } catch {
      return null;
    }
  }

  stop() {
    clearTimeout(this.timer);
    if (this.proc) {
      const p = this.proc;
      this.proc = null;
      this.set({ phase: 'stopped' });
      p.kill('SIGTERM');
    }
  }

  // Tor menulis kunci layanan onion saat pertama berjalan; tunggu file hostname.
  async waitAddress(ms = 30000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const a = this.address();
      if (a) return a;
      await new Promise((r) => setTimeout(r, 200));
    }
    return null;
  }
}
