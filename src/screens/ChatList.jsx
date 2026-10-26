import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Avatar, Icon, formatBytes, listTime } from '../ui.jsx';

export function NetworkBanner({ network, go }) {
  if (!network || network.phase === 'ready' || network.phase === 'idle') return null;
  if (network.phase === 'error') {
    return (
      <div className="net-banner error" role="alert">
        <span>{network.error || 'Tidak bisa terhubung ke jaringan Tor. Periksa koneksi internet atau aktifkan bridge.'}</span>
        <div className="net-actions">
          <button type="button" className="btn" onClick={() => api.retryNetwork()}>Coba lagi</button>
          <button type="button" className="btn" onClick={() => go({ name: 'settings' })}>Pengaturan bridge</button>
        </div>
      </div>
    );
  }
  return (
    <div className="net-banner connecting" role="status">
      <span>Menyambung ke jaringan Tor… {network.progress || 0}%. Pesan yang kamu tulis sekarang langsung masuk antrean.</span>
      <div className="progress"><div style={{ width: `${network.progress || 0}%` }} /></div>
    </div>
  );
}

export default function ChatList({ status, rev, go, active }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => api.chats(q).then((r) => { if (live) setRows(r); }, () => {}), q ? 150 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [q, rev]);

  const empty = rows && rows.length === 0 && !q;

  return (
    <>
      <div className="list-head">
        <div className="row-between">
          <h1 className="h-display" style={{ fontSize: 32 }}>Obrolan</h1>
          <div style={{ display: 'flex', gap: 4 }}>
            <button type="button" className="icon-btn" aria-label="Kode QR dan tambah kontak" onClick={() => go({ name: 'add' })}><Icon.scan /></button>
            <button type="button" className="icon-btn" aria-label="Pengaturan" onClick={() => go({ name: 'settings' })}><Icon.gear /></button>
          </div>
        </div>
        {!empty && (
          <div className="search">
            <label htmlFor="cari" className="sr-only">Cari obrolan</label>
            <Icon.search size={18} />
            <input id="cari" type="search" placeholder="Cari di perangkat ini" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        )}
        <button type="button" className="pill" style={{ alignSelf: 'flex-start' }} onClick={() => go({ name: 'settings' })}>
          <Icon.lock size={14} sw={2.2} />
          Semua tersimpan lokal · {formatBytes(status.usage.total)}
        </button>
      </div>
      <NetworkBanner network={status.network} go={go} />

      {empty ? (
        <div className="empty">
          <div className="empty-art"><Icon.chat size={40} /></div>
          <h2>Belum ada obrolan</h2>
          <p>Tidak ada direktori pengguna. Tukar kode dengan temanmu untuk mulai mengobrol.</p>
          <button type="button" className="btn btn-primary" onClick={() => go({ name: 'add' })}>Tambah kontak pertamamu</button>
        </div>
      ) : (
        <div className="chat-rows">
          {rows && rows.length === 0 && <p className="hint" style={{ padding: 20 }}>Tidak ada yang cocok dengan “{q}”.</p>}
          {(rows || []).map((c) => (
            <button type="button" key={c.id} className={'chat-row' + (active?.name === 'chat' && active.id === c.id ? ' active' : '')}
              onClick={() => go({ name: 'chat', id: c.id })}>
              <Avatar name={c.name} color={c.color} />
              <div className="chat-row-body">
                <div className="row-between">
                  <span className="chat-row-name">{c.name}</span>
                  <span className="chat-row-time">{listTime(c.ts)}</span>
                </div>
                <div className="row-between">
                  <span className="chat-row-last">{c.status === 'pending' ? 'Ingin menambahkanmu sebagai kontak' : (c.last || 'Kontak baru · belum ada pesan')}</span>
                  {c.status === 'pending' && <span className="tag-request">Permintaan</span>}
                  {c.unread > 0 && c.status !== 'pending' && <span className="badge" aria-label={`${c.unread} belum dibaca`}>{c.unread}</span>}
                  {c.queued && <span className="tag-warn">Antre</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {!empty && (
        <button type="button" className="fab" onClick={() => go({ name: 'add' })}>
          <Icon.plus size={20} sw={2.2} />
          Tambah kontak
        </button>
      )}
    </>
  );
}
