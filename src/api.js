// Klien API lokal. Token diberikan lewat #token=… saat aplikasi dibuka.
const fromHash = new URLSearchParams(location.hash.slice(1)).get('token');
if (fromHash) {
  try { sessionStorage.setItem('token', fromHash); } catch {}
  history.replaceState(null, '', location.pathname);
}
let token = fromHash;
if (!token) {
  try { token = sessionStorage.getItem('token'); } catch {}
}

export const hasToken = () => Boolean(token);

async function call(method, path, body, headers = {}) {
  const isRaw = body instanceof Blob || body instanceof ArrayBuffer;
  const res = await fetch(path, {
    method,
    headers: { 'x-token': token, ...(body && !isRaw ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? (isRaw ? body : JSON.stringify(body)) : undefined,
  });
  if (res.headers.get('content-type')?.includes('application/json')) {
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal');
    return data;
  }
  if (!res.ok) throw new Error('Gagal');
  return res.blob();
}

export const api = {
  status: () => call('GET', '/api/status'),
  unlock: (pin) => call('POST', '/api/unlock', { pin }),
  onboard: (name) => call('POST', '/api/onboard', { name }),
  restore: (file, password) => call('POST', '/api/restore', file, { 'x-password': encodeURIComponent(password) }),
  chats: (q) => call('GET', '/api/chats' + (q ? `?q=${encodeURIComponent(q)}` : '')),
  chat: (id) => call('GET', `/api/chats/${id}`),
  markRead: (id) => call('POST', `/api/chats/${id}/read`),
  send: (id, text) => call('POST', `/api/chats/${id}/messages`, { text }),
  sendFile: (id, file) => call('POST', `/api/chats/${id}/files`, file, {
    'x-name': encodeURIComponent(file.name), 'content-type': file.type || 'application/octet-stream',
  }),
  requestFile: (id, fid) => call('POST', `/api/chats/${id}/files/${fid}/request`),
  addContact: (code) => call('POST', '/api/contacts', { code }),
  accept: (id) => call('POST', `/api/contacts/${id}/accept`),
  block: (id) => call('POST', `/api/contacts/${id}/block`),
  removeContact: (id) => call('DELETE', `/api/contacts/${id}`),
  settings: () => call('GET', '/api/settings'),
  patchSettings: (patch) => call('PATCH', '/api/settings', patch),
  setName: (name) => call('POST', '/api/me', { name }),
  setPin: (pin) => call('POST', '/api/pin', { pin }),
  retryNetwork: () => call('POST', '/api/network/retry'),
  exportBackup: (password) => call('POST', '/api/backup/export', { password }),
  wipe: () => call('POST', '/api/wipe'),
};

export const fileUrl = (id, type) => `/api/files/${id}?token=${encodeURIComponent(token)}${type ? `&type=${encodeURIComponent(type)}` : ''}`;
export const qrUrl = (v) => `/api/qr?token=${encodeURIComponent(token)}&v=${v || 0}`;

export function subscribe(onEvent) {
  let es;
  let stopped = false;
  const connect = () => {
    es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
    es.addEventListener('change', (e) => onEvent('change', JSON.parse(e.data)));
    es.addEventListener('notify', (e) => onEvent('notify', JSON.parse(e.data)));
    es.onerror = () => {
      es.close();
      if (!stopped) setTimeout(connect, 2000);
    };
  };
  connect();
  return () => { stopped = true; es.close(); };
}
