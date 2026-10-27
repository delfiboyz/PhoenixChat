// Logika aplikasi: identitas, kontak, pesan, antrean kirim, lampiran, cadangan.
// Semua status ada di file lokal (Store); jaringan hanya lewat Transport.
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import {
  newBoxKeys, seal, open, deviceId, encodeContactCode, decodeContactCode,
  encryptBackup, decryptBackup, hashPin, checkPin, randomId,
} from './crypto.js';
import { UserError, msg } from './i18n.js';
import { Store } from './store.js';
import { Tor } from './tor.js';
import { Transport } from './transport.js';

const DAY = 24 * 60 * 60 * 1000;
const MB = 1024 * 1024;
const RETRY_STEPS = [5000, 15000, 30000, 60000, 120000];
// Jeda cek status online berkala: lebih jarang untuk kontak yang sudah terlihat online.
const PRESENCE_ONLINE = 2 * 60 * 1000;
const PRESENCE_OFFLINE = 60 * 1000;

// Tujuan sirkuit Tor yang ditampilkan di layar Rute Tor.
const CIRCUIT_KINDS = { HS_CLIENT_REND: 'out', HS_SERVICE_REND: 'in', HS_SERVICE_INTRO: 'intro' };

const DEFAULT_SETTINGS = {
  autoDelete: true,
  readReceipts: true,
  battery: false,
  limit: '25',
  bridge: { type: 'none', lines: '' },
  pin: null,
  lang: null,
};

export const limitBytes = (limit) => (limit === 'none' ? Infinity : Number(limit) * MB);

const contactIdOf = (publicKey) => crypto.createHash('sha256').update(publicKey).digest('hex').slice(0, 16);

export class Core extends EventEmitter {
  constructor({ dataDir, direct, socksPort, controlPort, peerPort }) {
    super();
    this.dataDir = dataDir;
    this.peerPort = peerPort;
    this.direct = direct;
    this.socksPort = socksPort;
    this.controlPort = controlPort;
    this.store = new Store(dataDir);
    this.tor = null;
    this.transport = null;
    this.backoff = new Map();
    this.flushing = new Set();
    this.fileRequests = new Set();
    this.load();
    this.locked = Boolean(this.settings.pin);
    this.retryTimer = setInterval(() => this.flushAll(), 5000);
    this.presenceTimer = setInterval(() => this.checkPresence(), 30000);
    this.sweepTimer = setInterval(() => this.sweep(), 60 * 60 * 1000);
  }

  load() {
    this.identity = this.store.read('identity.json', null);
    this.settings = { ...DEFAULT_SETTINGS, ...this.store.read('settings.json', {}) };
    this.contacts = this.store.read('contacts.json', {});
    this.outbox = this.store.read('outbox.json', []);
  }

  // Pesan untuk pengguna dalam bahasa perangkat.
  m(key, vars) {
    return msg(this.settings.lang, key, vars);
  }

  changed(kind, cid) {
    this.emit('change', { kind, cid });
  }

  saveContacts() { this.store.write('contacts.json', this.contacts); }
  saveOutbox() { this.store.write('outbox.json', this.outbox); }
  saveSettings() { this.store.write('settings.json', this.settings); }
  messages(cid) { return this.store.read(`chats/${cid}.json`, []); }
  saveMessages(cid, list) { this.store.write(`chats/${cid}.json`, list); }

  // ---------- identitas dan jaringan ----------

  address() {
    if (!this.identity) return null;
    if (this.direct) return `127.0.0.1:${this.identity.peerPort}`;
    return this.tor?.state.address || this.tor?.address() || null;
  }

  networkState() {
    if (!this.identity) return { phase: 'idle', progress: 0 };
    if (this.direct) return { phase: 'ready', progress: 100, direct: true };
    if (!this.tor) return { phase: 'idle', progress: 0 };
    const { error } = this.tor.state;
    return { ...this.tor.state, error: error && typeof error === 'object' ? this.m(error.key, error.vars) : error };
  }

  async startNetwork() {
    if (!this.identity) return;
    if (this.direct) {
      this.transport = new Transport({ allowDirect: true });
      this.changed('network');
      this.flushAll(true);
      return;
    }
    if (!this.tor) {
      this.tor = new Tor({ dataDir: this.dataDir, peerPort: this.identity.peerPort, socksPort: this.socksPort, controlPort: this.controlPort });
      this.tor.on('state', (s) => {
        if (s.phase === 'ready') {
          this.flushAll(true);
          this.checkPresence(true);
        }
        this.changed('network');
      });
    }
    this.transport = new Transport({ socksPort: this.socksPort, allowDirect: false });
    this.tor.start(this.settings.bridge);
    await this.tor.waitAddress(15000);
    this.changed('network');
  }

  // Rute relay untuk layar Rute Tor. Sirkuit ke kontak dikenali dari REND_QUERY;
  // sirkuit masuk tidak menyebut pengirimnya, jadi kontaknya tidak bisa diketahui.
  async circuits() {
    let raw = null;
    try {
      raw = this.direct ? null : await this.tor?.circuits(this.settings.bridge);
    } catch {
      raw = null;
    }
    if (!raw) return { available: false, bridge: this.settings.bridge.type, circuits: [] };
    const byOnion = new Map(Object.values(this.contacts).map((c) => [c.address, c]));
    const circuits = raw.map((c) => {
      const kind = CIRCUIT_KINDS[c.purpose];
      const contact = kind === 'out' ? byOnion.get(`${c.rendQuery}.onion`) : null;
      if (!kind || (kind === 'out' && !contact)) return null;
      return { id: c.id, kind, contact: contact ? { id: contact.id, name: contact.name, color: contact.color } : null, hops: c.hops };
    }).filter(Boolean);
    return { available: true, bridge: this.settings.bridge.type, circuits };
  }

  restartNetwork() {
    if (this.tor) this.tor.start(this.settings.bridge);
    this.changed('network');
  }

  status() {
    const addr = this.address();
    return {
      onboarded: Boolean(this.identity),
      lang: this.settings.lang || null,
      locked: this.locked,
      network: this.networkState(),
      me: this.identity && {
        name: this.identity.name,
        address: addr,
        deviceId: addr ? deviceId(addr) : null,
        code: addr ? encodeContactCode({ name: this.identity.name, address: addr, publicKey: this.identity.box.publicKey }) : null,
      },
      usage: this.store.usage(),
    };
  }

  async onboard(name) {
    if (this.identity) throw new UserError('identityExists');
    const clean = String(name || '').trim().slice(0, 40);
    if (!clean) throw new UserError('nameRequired');
    this.identity = { name: clean, box: newBoxKeys(), peerPort: this.peerPort, createdAt: Date.now() };
    this.store.write('identity.json', this.identity);
    this.saveSettings();
    await this.startNetwork();
    this.changed('me');
  }

  setName(name) {
    const clean = String(name || '').trim().slice(0, 40);
    if (!clean) throw new UserError('nameEmpty');
    this.identity.name = clean;
    this.store.write('identity.json', this.identity);
    this.changed('me');
  }

  // ---------- kunci PIN (hanya di antarmuka) ----------

  unlock(pin) {
    if (!checkPin(pin, this.settings.pin)) throw new UserError('wrongPin');
    this.locked = false;
  }

  setPin(pin) {
    if (pin === null) {
      this.settings.pin = null;
    } else {
      if (!/^\d{4,8}$/.test(String(pin))) throw new UserError('pinFormat');
      this.settings.pin = hashPin(pin);
    }
    this.saveSettings();
    this.changed('settings');
  }

  // ---------- kontak ----------

  colorIndex(publicKey) {
    return parseInt(contactIdOf(publicKey).slice(0, 2), 16) % 6;
  }

  upsertContact({ name, address, publicKey }, status) {
    const id = contactIdOf(publicKey);
    const existing = this.contacts[id];
    if (existing) {
      if (name) existing.name = name;
      if (address) existing.address = address;
      if (status === 'ok' && existing.status === 'pending') existing.status = 'ok';
    } else {
      this.contacts[id] = {
        id, name: name || 'Tanpa nama', address, publicKey, status,
        color: this.colorIndex(publicKey), unread: 0, online: null, lastCheck: 0, createdAt: Date.now(),
      };
    }
    this.saveContacts();
    return this.contacts[id];
  }

  addContact(code) {
    const c = decodeContactCode(code);
    if (!c) throw new UserError('badCode');
    if (c.publicKey === this.identity.box.publicKey) throw new UserError('ownCode');
    if (!this.direct && !/^[a-z2-7]{56}\.onion$/.test(c.address)) throw new UserError('badOnion');
    const contact = this.upsertContact(c, 'ok');
    this.enqueue(contact.id, { t: 'hello' });
    this.changed('contacts', contact.id);
    return contact;
  }

  acceptContact(cid) {
    const c = this.contacts[cid];
    if (!c) throw new UserError('noContact');
    c.status = 'ok';
    this.saveContacts();
    this.enqueue(cid, { t: 'hello' });
    this.changed('contacts', cid);
  }

  blockContact(cid) {
    const c = this.contacts[cid];
    if (!c) throw new UserError('noContact');
    c.status = 'blocked';
    this.outbox = this.outbox.filter((o) => o.cid !== cid);
    this.saveOutbox();
    this.saveContacts();
    this.changed('contacts', cid);
  }

  deleteContact(cid) {
    for (const m of this.messages(cid)) if (m.file) this.store.removeBlob(m.file.id);
    this.store.remove(`chats/${cid}.json`);
    delete this.contacts[cid];
    this.outbox = this.outbox.filter((o) => o.cid !== cid);
    this.saveOutbox();
    this.saveContacts();
    this.changed('contacts', cid);
  }

  chatList(query) {
    const q = String(query || '').trim().toLowerCase();
    const rows = Object.values(this.contacts)
      .filter((c) => c.status !== 'blocked')
      .map((c) => {
        const msgs = this.messages(c.id);
        const last = msgs[msgs.length - 1];
        const hit = !q || c.name.toLowerCase().includes(q) || msgs.some((m) => (m.text || '').toLowerCase().includes(q));
        return hit && {
          id: c.id, name: c.name, color: c.color, status: c.status, unread: c.unread, online: c.online,
          last: last ? { mine: Boolean(last.mine), text: last.text || '', file: last.file ? last.file.name : null } : null,
          ts: last ? last.ts : c.createdAt,
          queued: msgs.some((m) => m.mine && (m.status === 'queued' || m.status === 'local')),
        };
      })
      .filter(Boolean);
    return rows.sort((a, b) => b.ts - a.ts);
  }

  chat(cid) {
    const c = this.contacts[cid];
    if (!c) throw new UserError('noChat');
    // Cek apakah teman sedang online, paling sering tiap 30 detik.
    if (c.status === 'ok' && Date.now() - c.lastCheck > 30000) this.ping(c);
    const contact = { id: c.id, name: c.name, color: c.color, status: c.status, online: c.online, deviceId: deviceId(c.address), address: c.address };
    return { contact, messages: this.messages(cid) };
  }

  // Cek status online semua kontak saat Tor baru siap dan berkala sesudahnya, agar
  // status tidak tertahan "offline" sampai obrolannya dibuka.
  checkPresence(force) {
    for (const c of Object.values(this.contacts)) {
      const every = c.online ? PRESENCE_ONLINE : PRESENCE_OFFLINE;
      if (c.status === 'ok' && (force || Date.now() - c.lastCheck > every)) this.ping(c);
    }
  }

  ping(c) {
    if (!this.transport || this.networkState().phase !== 'ready') return;
    c.lastCheck = Date.now();
    this.transport.ping(c.address).then((ok) => {
      // Tor perangkat ini berhenti di tengah jalan: bukan berarti teman offline.
      if (!ok && this.networkState().phase !== 'ready') return;
      if (c.online !== ok) {
        c.online = ok;
        this.saveContacts();
        this.changed('contacts', c.id);
      }
      if (ok) this.flush(c.id, true);
    });
  }

  markRead(cid) {
    const c = this.contacts[cid];
    if (!c) return;
    const msgs = this.messages(cid);
    const ids = msgs.filter((m) => !m.mine && !m.seen).map((m) => m.id);
    if (!ids.length && !c.unread) return;
    msgs.forEach((m) => { if (!m.mine) m.seen = true; });
    this.saveMessages(cid, msgs);
    c.unread = 0;
    this.saveContacts();
    if (ids.length && this.settings.readReceipts && c.status === 'ok') this.enqueue(cid, { t: 'read', ids });
    this.changed('contacts', cid);
  }

  // ---------- pesan keluar ----------

  enqueue(cid, payload, msgId) {
    this.outbox.push({ oid: randomId(), cid, payload, msgId: msgId || null });
    this.saveOutbox();
    this.flush(cid, true);
  }

  addMessage(cid, msg) {
    const list = this.messages(cid);
    list.push(msg);
    this.saveMessages(cid, list);
    this.changed('messages', cid);
  }

  updateMessage(cid, id, patch) {
    const list = this.messages(cid);
    const m = list.find((x) => x.id === id);
    if (!m) return;
    Object.assign(m, typeof patch === 'function' ? patch(m) : patch);
    this.saveMessages(cid, list);
    this.changed('messages', cid);
  }

  send(cid, text) {
    const c = this.contacts[cid];
    if (!c || c.status !== 'ok') throw new UserError('notApproved');
    const body = String(text || '').trim().slice(0, 8000);
    if (!body) throw new UserError('emptyMessage');
    const msg = { id: randomId(), mine: true, text: body, ts: Date.now(), status: 'local' };
    this.addMessage(cid, msg);
    this.enqueue(cid, { t: 'msg', id: msg.id, text: body, ts: msg.ts }, msg.id);
    return msg;
  }

  sendFile(cid, name, mime, buf) {
    const c = this.contacts[cid];
    if (!c || c.status !== 'ok') throw new UserError('notApproved');
    const id = randomId();
    this.store.writeBlob(id, buf);
    const file = { id, name: String(name).slice(0, 120), mime: String(mime || 'application/octet-stream'), size: buf.length, state: 'have' };
    const msg = { id, mine: true, text: '', file, ts: Date.now(), status: 'local' };
    this.addMessage(cid, msg);
    this.enqueue(cid, { t: 'file', id, name: file.name, mime: file.mime, size: file.size, ts: msg.ts }, id);
    return msg;
  }

  // Lampiran besar tidak diunduh otomatis; pengguna memintanya manual.
  requestFile(cid, id) {
    const c = this.contacts[cid];
    if (!c || c.status !== 'ok') throw new UserError('notApproved');
    this.fileRequests.add(id);
    this.updateMessage(cid, id, (m) => ({ file: { ...m.file, state: 'downloading' } }));
    this.enqueue(cid, { t: 'file-req', id });
  }

  getFile(id) {
    return this.store.readBlob(id);
  }

  flushAll(force) {
    const cids = [...new Set(this.outbox.map((o) => o.cid))];
    cids.forEach((cid) => this.flush(cid, force));
  }

  async flush(cid, force) {
    if (!this.transport) return;
    if (this.networkState().phase !== 'ready') {
      this.markQueued(cid);
      return;
    }
    if (this.flushing.has(cid)) return;
    const b = this.backoff.get(cid) || { step: 0, next: 0 };
    if (!force && Date.now() < b.next) return;
    const c = this.contacts[cid];
    if (!c) return;
    this.flushing.add(cid);
    try {
      while (true) {
        const item = this.outbox.find((o) => o.cid === cid);
        if (!item) break;
        const payload = { ...item.payload, me: { name: this.identity.name, address: this.address() } };
        const env = { from: this.identity.box.publicKey, ...seal(payload, c.publicKey, this.identity.box.secretKey) };
        try {
          await this.transport.send(c.address, env);
        } catch {
          const step = Math.min(b.step + 1, RETRY_STEPS.length - 1);
          this.backoff.set(cid, { step, next: Date.now() + RETRY_STEPS[step] });
          if (c.online !== false && this.networkState().phase === 'ready') { c.online = false; this.saveContacts(); this.changed('contacts', cid); }
          this.markQueued(cid);
          return;
        }
        this.outbox = this.outbox.filter((o) => o.oid !== item.oid);
        this.saveOutbox();
        this.backoff.delete(cid);
        if (c.online !== true) { c.online = true; c.lastCheck = Date.now(); this.saveContacts(); this.changed('contacts', cid); }
        if (item.msgId) {
          const wasQueued = this.messages(cid).find((m) => m.id === item.msgId)?.status === 'queued';
          this.updateMessage(cid, item.msgId, (m) => (m.status === 'read' ? {} : { status: 'sent' }));
          if (wasQueued) this.emit('notify', { title: c.name, body: this.m('notifyQueueSent') });
        }
      }
    } finally {
      this.flushing.delete(cid);
    }
  }

  markQueued(cid) {
    const ids = new Set(this.outbox.filter((o) => o.cid === cid && o.msgId).map((o) => o.msgId));
    if (!ids.size) return;
    const list = this.messages(cid);
    let dirty = false;
    for (const m of list) if (ids.has(m.id) && m.status === 'local') { m.status = 'queued'; dirty = true; }
    if (dirty) { this.saveMessages(cid, list); this.changed('messages', cid); }
  }

  // ---------- pesan masuk (dari server peer) ----------

  receive(env) {
    if (!this.identity || !env || typeof env.from !== 'string') return false;
    const cid = contactIdOf(env.from);
    const known = this.contacts[cid];
    if (known?.status === 'blocked') return true; // diam-diam diabaikan
    const p = open(env, env.from, this.identity.box.secretKey);
    if (!p || !p.me || typeof p.me.address !== 'string') return false;

    let c = known;
    if (!c) {
      // Orang yang belum ada di kontak: jadi permintaan yang harus disetujui.
      c = this.upsertContact({ name: String(p.me.name || '').slice(0, 40), address: p.me.address, publicKey: env.from }, 'pending');
      this.emit('notify', { title: this.m('notifyRequestTitle'), body: this.m('notifyRequestBody', { name: c.name }) });
    } else if (p.me.name && p.me.name !== c.name) {
      c.name = String(p.me.name).slice(0, 40);
    }
    c.online = true;
    c.lastCheck = Date.now();
    this.backoff.delete(cid);

    switch (p.t) {
      case 'hello':
        break;
      case 'msg': {
        if (this.messages(cid).some((m) => m.id === p.id)) break;
        this.addMessage(cid, { id: String(p.id), mine: false, text: String(p.text || '').slice(0, 8000), ts: Number(p.ts) || Date.now() });
        c.unread = (c.unread || 0) + 1;
        this.emit('notify', { title: c.name, body: String(p.text || '').slice(0, 120) });
        break;
      }
      case 'file': {
        if (this.messages(cid).some((m) => m.id === p.id)) break;
        const size = Number(p.size) || 0;
        const auto = size <= limitBytes(this.settings.limit) && c.status === 'ok';
        const file = { id: String(p.id), name: String(p.name || 'file').slice(0, 120), mime: String(p.mime || ''), size, state: auto ? 'downloading' : 'offered' };
        this.addMessage(cid, { id: file.id, mine: false, text: '', file, ts: Number(p.ts) || Date.now() });
        c.unread = (c.unread || 0) + 1;
        this.emit('notify', { title: c.name, body: this.m('notifyAttachment', { name: file.name }) });
        if (auto) {
          this.fileRequests.add(file.id);
          this.outbox.push({ oid: randomId(), cid, payload: { t: 'file-req', id: file.id }, msgId: null });
          this.saveOutbox();
        }
        break;
      }
      case 'file-req': {
        const own = this.messages(cid).find((m) => m.id === p.id && m.mine && m.file);
        const buf = own && this.store.readBlob(own.id);
        if (buf) {
          this.outbox.push({ oid: randomId(), cid, payload: { t: 'file-data', id: own.id, data: buf.toString('base64') }, msgId: null });
          this.saveOutbox();
        }
        break;
      }
      case 'file-data': {
        if (!this.fileRequests.has(p.id)) break; // hanya terima yang kita minta
        this.fileRequests.delete(p.id);
        this.store.writeBlob(p.id, Buffer.from(String(p.data || ''), 'base64'));
        this.updateMessage(cid, p.id, (m) => ({ file: { ...m.file, state: 'have' } }));
        break;
      }
      case 'read': {
        const ids = new Set((p.ids || []).map(String));
        const list = this.messages(cid);
        list.forEach((m) => { if (m.mine && ids.has(m.id)) m.status = 'read'; });
        this.saveMessages(cid, list);
        this.changed('messages', cid);
        break;
      }
      default:
        break;
    }
    this.saveContacts();
    this.changed('contacts', cid);
    // Teman sedang online: kirim antrean untuknya sekarang juga.
    setImmediate(() => this.flush(cid, true));
    return true;
  }

  // ---------- pengaturan, pembersihan, cadangan ----------

  publicSettings() {
    const { pin, ...rest } = this.settings;
    return { ...rest, hasPin: Boolean(pin) };
  }

  patchSettings(patch) {
    const allowed = ['autoDelete', 'readReceipts', 'battery', 'limit', 'bridge', 'lang'];
    for (const k of allowed) if (k in patch) this.settings[k] = patch[k];
    if (!['5', '25', '100', 'none'].includes(this.settings.limit)) this.settings.limit = '25';
    if (!['id', 'en'].includes(this.settings.lang)) this.settings.lang = null;
    this.saveSettings();
    if ('bridge' in patch) this.restartNetwork();
    if (patch.autoDelete) this.sweep();
    this.changed('settings');
  }

  // Hapus pesan yang lebih tua dari 30 hari bila diaktifkan.
  sweep() {
    if (!this.settings.autoDelete) return;
    const cutoff = Date.now() - 30 * DAY;
    for (const cid of Object.keys(this.contacts)) {
      const list = this.messages(cid);
      const keep = list.filter((m) => m.ts >= cutoff);
      if (keep.length === list.length) continue;
      list.filter((m) => m.ts < cutoff && m.file).forEach((m) => this.store.removeBlob(m.file.id));
      this.saveMessages(cid, keep);
      this.changed('messages', cid);
    }
  }

  exportBackup(password) {
    if (!password || String(password).length < 8) throw new UserError('shortPassword');
    const hsDir = path.join(this.dataDir, 'tor', 'hs');
    const hs = {};
    if (fs.existsSync(hsDir)) {
      for (const n of fs.readdirSync(hsDir)) {
        const p = path.join(hsDir, n);
        if (fs.statSync(p).isFile()) hs[n] = fs.readFileSync(p).toString('base64');
      }
    }
    const chats = {};
    const files = {};
    for (const cid of Object.keys(this.contacts)) {
      chats[cid] = this.messages(cid);
      for (const m of chats[cid]) {
        const buf = m.file && this.store.readBlob(m.file.id);
        if (buf) files[m.file.id] = buf.toString('base64');
      }
    }
    const { pin, ...settings } = this.settings;
    const data = { v: 1, identity: this.identity, settings, contacts: this.contacts, outbox: this.outbox, chats, files, hs };
    return encryptBackup(Buffer.from(JSON.stringify(data)), String(password));
  }

  async restore(buf, password) {
    const data = JSON.parse(decryptBackup(buf, String(password)).toString('utf8'));
    if (data.v !== 1 || !data.identity) throw new UserError('badBackup');
    this.tor?.stop();
    this.tor = null;
    this.store.wipe();
    this.store.write('identity.json', { ...data.identity, peerPort: this.peerPort });
    this.store.write('settings.json', { ...DEFAULT_SETTINGS, ...data.settings, pin: null });
    this.store.write('contacts.json', data.contacts || {});
    this.store.write('outbox.json', data.outbox || []);
    for (const [cid, list] of Object.entries(data.chats || {})) this.saveMessages(cid, list);
    for (const [id, b] of Object.entries(data.files || {})) this.store.writeBlob(id, Buffer.from(b, 'base64'));
    const hsDir = path.join(this.dataDir, 'tor', 'hs');
    fs.mkdirSync(hsDir, { recursive: true, mode: 0o700 });
    for (const [n, b] of Object.entries(data.hs || {})) fs.writeFileSync(path.join(hsDir, n), Buffer.from(b, 'base64'), { mode: 0o600 });
    this.load();
    this.locked = false;
    await this.startNetwork();
    this.changed('me');
  }

  wipe() {
    const { lang } = this.settings;
    this.tor?.stop();
    this.tor = null;
    this.transport = null;
    this.store.wipe();
    // Bahasa tetap dipakai di layar Mulai setelah semua data dihapus.
    if (lang) this.store.write('settings.json', { lang });
    this.load();
    this.locked = false;
    this.changed('me');
  }

  close() {
    clearInterval(this.retryTimer);
    clearInterval(this.presenceTimer);
    clearInterval(this.sweepTimer);
    this.tor?.stop();
  }
}
