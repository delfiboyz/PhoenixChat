// Penyimpanan lokal berbasis file JSON. Tidak ada database: setiap jenis data
// adalah satu file di folder data perangkat, ditulis secara atomik.
import fs from 'node:fs';
import path from 'node:path';

export class Store {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(path.join(dir, 'chats'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'files'), { recursive: true });
  }

  file(name) {
    return path.join(this.dir, name);
  }

  read(name, fallback) {
    try {
      return JSON.parse(fs.readFileSync(this.file(name), 'utf8'));
    } catch {
      return fallback;
    }
  }

  write(name, value) {
    const target = this.file(name);
    const tmp = target + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 });
    fs.renameSync(tmp, target);
  }

  remove(name) {
    fs.rmSync(this.file(name), { force: true, recursive: true });
  }

  // Lampiran disimpan sebagai file biner terpisah, nama = id lampiran.
  writeBlob(id, buf) {
    fs.writeFileSync(path.join(this.dir, 'files', id), buf, { mode: 0o600 });
  }

  readBlob(id) {
    try {
      return fs.readFileSync(path.join(this.dir, 'files', id));
    } catch {
      return null;
    }
  }

  removeBlob(id) {
    fs.rmSync(path.join(this.dir, 'files', id), { force: true });
  }

  sizeOf(rel) {
    const p = path.join(this.dir, rel);
    let total = 0;
    const walk = (q) => {
      let st;
      try { st = fs.statSync(q); } catch { return; }
      if (st.isDirectory()) fs.readdirSync(q).forEach((n) => walk(path.join(q, n)));
      else total += st.size;
    };
    walk(p);
    return total;
  }

  // Ukuran per jenis data, untuk meteran di layar Pengaturan.
  usage() {
    const messages = this.sizeOf('chats') + this.sizeOf('contacts.json');
    const files = this.sizeOf('files');
    const keys = this.sizeOf('identity.json') + this.sizeOf('tor/hs');
    let free = null;
    try {
      const st = fs.statfsSync(this.dir);
      free = st.bavail * st.bsize;
    } catch {}
    return { messages, files, keys, total: messages + files + keys, free };
  }

  wipe() {
    for (const name of fs.readdirSync(this.dir)) {
      fs.rmSync(path.join(this.dir, name), { recursive: true, force: true });
    }
    fs.mkdirSync(path.join(this.dir, 'chats'), { recursive: true });
    fs.mkdirSync(path.join(this.dir, 'files'), { recursive: true });
  }
}
