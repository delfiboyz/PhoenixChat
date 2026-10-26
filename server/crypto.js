// Kunci identitas, enkripsi ujung ke ujung, dan enkripsi file cadangan.
import crypto from 'node:crypto';
import nacl from 'tweetnacl';

const b64 = (u8) => Buffer.from(u8).toString('base64');
const unb64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));

export function newBoxKeys() {
  const kp = nacl.box.keyPair();
  return { publicKey: b64(kp.publicKey), secretKey: b64(kp.secretKey) };
}

// Enkripsi pesan untuk satu kontak. nacl.box sekaligus membuktikan pengirim:
// hanya pemilik kunci privat pengirim yang bisa membuat ciphertext yang valid.
export function seal(obj, theirPublic, mySecret) {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const msg = new TextEncoder().encode(JSON.stringify(obj));
  const box = nacl.box(msg, nonce, unb64(theirPublic), unb64(mySecret));
  return { nonce: b64(nonce), box: b64(box) };
}

export function open(envelope, theirPublic, mySecret) {
  const out = nacl.box.open(unb64(envelope.box), unb64(envelope.nonce), unb64(theirPublic), unb64(mySecret));
  if (!out) return null;
  try {
    return JSON.parse(new TextDecoder().decode(out));
  } catch {
    return null;
  }
}

// ID perangkat yang ditampilkan: ringkasan alamat, mis. 7F3A-91C2-B04E.
export function deviceId(address) {
  const h = crypto.createHash('sha256').update(address).digest('hex').slice(0, 12).toUpperCase();
  return `${h.slice(0, 4)}-${h.slice(4, 8)}-${h.slice(8, 12)}`;
}

// Kode kontak = alamat + kunci publik + nama, dikodekan base64url.
export function encodeContactCode({ name, address, publicKey }) {
  const json = JSON.stringify({ v: 1, n: name, a: address, k: publicKey });
  return 'chatlokal:' + Buffer.from(json).toString('base64url');
}

export function decodeContactCode(code) {
  const raw = String(code || '').trim().replace(/^chatlokal:(\/\/add\?c=)?/, '');
  try {
    const obj = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (obj.v !== 1 || typeof obj.a !== 'string' || typeof obj.k !== 'string') return null;
    if (unb64(obj.k).length !== nacl.box.publicKeyLength) return null;
    return { name: String(obj.n || '').slice(0, 40), address: obj.a, publicKey: obj.k };
  } catch {
    return null;
  }
}

// File cadangan: scrypt(kata sandi) -> AES-256-GCM.
export function encryptBackup(buf, password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(password, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([Buffer.from('CLB1'), salt, iv, c.getAuthTag(), body]);
}

export function decryptBackup(buf, password) {
  if (buf.subarray(0, 4).toString() !== 'CLB1') throw new Error('Bukan file cadangan Chat Lokal');
  const salt = buf.subarray(4, 20);
  const iv = buf.subarray(20, 32);
  const tag = buf.subarray(32, 48);
  const key = crypto.scryptSync(password, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  try {
    return Buffer.concat([d.update(buf.subarray(48)), d.final()]);
  } catch {
    throw new Error('Kata sandi salah atau file rusak');
  }
}

export function hashPin(pin, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(pin), salt, 32).toString('hex');
  return { salt, hash };
}

export function checkPin(pin, rec) {
  if (!rec) return true;
  const { hash } = hashPin(pin, rec.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(rec.hash, 'hex'));
}

export const randomId = () => crypto.randomBytes(9).toString('base64url');
