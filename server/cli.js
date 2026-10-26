// Menjalankan Phoenix Chat tanpa Electron, antarmukanya dibuka di browser.
//   node server/cli.js [--profile nama] [--ui-port 5301] [--no-tor] [--data-dir path]
// --no-tor hanya untuk pengembangan: pesan dikirim langsung lewat 127.0.0.1.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startApp } from './index.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};

const profile = opt('--profile', 'default');

// Folder data bernama phoenix-chat; folder lama chat-lokal tetap dipakai jika sudah ada.
function defaultDataDir(name) {
  const base = path.join(os.homedir(), '.local', 'share');
  const legacy = path.join(base, 'chat-lokal', name);
  return fs.existsSync(legacy) ? legacy : path.join(base, 'phoenix-chat', name);
}
const direct = args.includes('--no-tor');
const dataDir = path.resolve(opt('--data-dir', direct
  ? path.join(process.cwd(), '.data', profile)
  : defaultDataDir(profile)));

const app = await startApp({ dataDir, uiPort: Number(opt('--ui-port', 0)), direct });
console.log(`Phoenix Chat (${direct ? 'mode langsung, TANPA Tor' : 'lewat Tor'})`);
console.log(`Data   : ${dataDir}`);
console.log(`Buka   : ${app.url}`);

const stop = () => { app.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
