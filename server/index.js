// Menyalakan aplikasi: Core + server peer + server UI. Dipakai oleh Electron
// (electron/main.cjs) dan oleh mode baris perintah (server/cli.js).
import crypto from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Core } from './core.js';
import { Store } from './store.js';
import { createPeerServer, createUiServer } from './http.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

const listen = (server, port) => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(port, '127.0.0.1', () => resolve(server.address().port));
});

export async function startApp({ dataDir, uiPort = 0, direct = false, distDir = path.join(here, '..', 'dist') }) {
  // Port peer tetap per perangkat, karena layanan onion memetakan ke port ini.
  const identity = new Store(dataDir).read('identity.json', null);
  const peerPort = identity?.peerPort || await freePort();
  const socksPort = direct ? 0 : await freePort();
  const controlPort = direct ? 0 : await freePort();
  const core = new Core({ dataDir, direct, socksPort, controlPort, peerPort });

  const peer = createPeerServer(core);
  await listen(peer, peerPort);

  const token = crypto.randomBytes(24).toString('base64url');
  const ui = createUiServer(core, { token, distDir, allowedHosts: ['127.0.0.1', 'localhost'] });
  const port = await listen(ui, uiPort);

  if (identity) core.startNetwork();

  return {
    core,
    url: `http://127.0.0.1:${port}/#token=${token}`,
    close() {
      core.close();
      peer.close();
      ui.close();
    },
  };
}
