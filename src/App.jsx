import { useCallback, useEffect, useState } from 'react';
import { api, hasToken, subscribe } from './api.js';
import { Icon } from './ui.jsx';
import Start from './screens/Start.jsx';
import Lock from './screens/Lock.jsx';
import ChatList from './screens/ChatList.jsx';
import ChatRoom from './screens/ChatRoom.jsx';
import AddContact from './screens/AddContact.jsx';
import Settings from './screens/Settings.jsx';

export default function App() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [view, setView] = useState(null); // null | {name:'chat',id} | {name:'add'} | {name:'settings'}
  const [rev, setRev] = useState(0);
  const [toast, setToast] = useState(null);

  const refresh = useCallback(() => api.status().then(setStatus, (e) => setError(e.message)), []);

  useEffect(() => {
    if (!hasToken()) return undefined;
    refresh();
    return subscribe((type, data) => {
      if (type === 'change') {
        setRev((r) => r + 1);
        if (['me', 'network', 'settings', 'messages'].includes(data.kind)) refresh();
      } else if (type === 'notify' && (document.hidden || !document.hasFocus())) {
        if ('Notification' in window && Notification.permission === 'granted') new Notification(data.title, { body: data.body });
      }
    });
  }, [refresh]);

  // Android membuka tautan chatlokal:… dengan mengirim event ini.
  useEffect(() => {
    const onCode = (e) => setView({ name: 'add', code: e.detail });
    window.addEventListener('chatlokal:code', onCode);
    return () => window.removeEventListener('chatlokal:code', onCode);
  }, []);

  // Tombol kembali Android: tutup layar yang terbuka dulu sebelum keluar.
  useEffect(() => {
    window.__chatlokalBack = () => {
      if (!view) return false;
      setView(null);
      return true;
    };
  }, [view]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  if (!hasToken()) {
    return <div className="placeholder-main"><p>Buka Chat Lokal lewat aplikasinya. Alamat ini butuh token akses dari aplikasi.</p></div>;
  }
  if (error && !status) return <div className="placeholder-main"><p>{error}</p></div>;
  if (!status) return <div className="placeholder-main"><p>Memuat…</p></div>;
  if (status.locked) return <Lock onUnlock={setStatus} />;
  if (!status.onboarded) {
    return <Start onDone={(s) => { setStatus(s); setView(null); if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); }} />;
  }

  const ctx = { status, rev, go: setView, toast: setToast, refresh };
  let main;
  if (view?.name === 'chat') main = <ChatRoom key={view.id} id={view.id} {...ctx} />;
  else if (view?.name === 'add') main = <AddContact key={view.code || 'add'} initialCode={view.code} {...ctx} />;
  else if (view?.name === 'settings') main = <Settings {...ctx} />;
  else {
    main = (
      <div className="placeholder-main">
        <div className="empty-art"><Icon.chat size={40} /></div>
        <p>Pilih obrolan, atau tambahkan kontak dengan bertukar kode.</p>
      </div>
    );
  }

  return (
    <div className={'shell' + (view ? ' has-main' : '')}>
      <aside className="pane-list"><ChatList {...ctx} active={view} /></aside>
      <main className="pane-main">{main}</main>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
