import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, fileUrl } from '../api.js';
import { Avatar, Icon, Modal, clock, dayLabel, downloadFile, formatBytes } from '../ui.jsx';

const STATUS = {
  local: { text: 'Tersimpan lokal', warn: true },
  queued: { text: 'Antre', warn: true },
  sent: { text: 'Terkirim' },
  read: { text: 'Dibaca' },
};

function Attachment({ chatId, m, toast, onLoad }) {
  const f = m.file;
  const isImage = f.state === 'have' && /^image\/(png|jpeg|gif|webp)$/.test(f.mime);
  const request = () => api.requestFile(chatId, f.id).catch((e) => toast(e.message));
  const save = () => downloadFile(fileUrl(f.id, f.mime), f.name).catch((e) => toast(e.message));
  return (
    <div className={'bubble' + (isImage ? ' media' : '')}>
      {isImage && (
        <button type="button" className="attach-img-btn" aria-label={`Simpan ${f.name}`} onClick={save}>
          <img className="attach-img" src={fileUrl(f.id, f.mime)} alt={f.name} onLoad={onLoad} />
        </button>
      )}
      {!isImage && (
        <div className="attach">
          <Icon.file />
          <div className="attach-info">
            <span className="attach-name">{f.name}</span>
            <span className="attach-size">{formatBytes(f.size)}{f.state === 'offered' ? ' · di atas batas, tidak diunduh otomatis' : ''}</span>
          </div>
          {f.state === 'have' && <button type="button" className="attach-btn" onClick={save}>Simpan</button>}
          {f.state === 'offered' && <button type="button" className="attach-btn" onClick={request}>Unduh</button>}
          {f.state === 'downloading' && <span className="attach-size">Mengunduh…</span>}
        </div>
      )}
    </div>
  );
}

export default function ChatRoom({ id, rev, go, toast, status }) {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState('');
  const [info, setInfo] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const listRef = useRef(null);
  const fileRef = useRef(null);
  const lastCount = useRef(0);

  useEffect(() => {
    let live = true;
    api.chat(id).then((d) => { if (live) setData(d); }, () => go(null));
    return () => { live = false; };
  }, [id, rev, go]);

  // Tandai dibaca selama obrolan terbuka dan jendela aktif.
  useEffect(() => {
    if (!data) return;
    const hasUnseen = data.messages.some((m) => !m.mine && !m.seen);
    if (hasUnseen && document.hasFocus()) api.markRead(id).catch(() => {});
  }, [data, id]);
  useEffect(() => {
    const onFocus = () => api.markRead(id).catch(() => {});
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [id]);

  useLayoutEffect(() => {
    if (!data || !listRef.current) return;
    if (data.messages.length !== lastCount.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
      lastCount.current = data.messages.length;
    }
  }, [data]);

  // Gambar menambah tinggi setelah dimuat; tetap di bawah jika sebelumnya di bawah.
  const stickToBottom = () => {
    const el = listRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 400) el.scrollTop = el.scrollHeight;
  };

  if (!data) return <div className="placeholder-main"><p>Memuat…</p></div>;
  const { contact, messages } = data;
  const pending = contact.status === 'pending';
  const direct = status.network.direct;

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    try {
      await api.send(id, text);
    } catch (e) {
      setDraft(text);
      toast(e.message);
    }
  };

  const attach = async (file) => {
    if (!file) return;
    try {
      await api.sendFile(id, file);
    } catch (e) {
      toast(e.message);
    }
  };

  let statusLine;
  if (pending) statusLine = <span className="room-status off">Belum disetujui</span>;
  else if (contact.online === true) statusLine = <span className="room-status"><span className="dot" />{direct ? 'Terhubung langsung (mode uji)' : 'Terhubung via Tor'}</span>;
  else if (contact.online === false) statusLine = <span className="room-status off"><span className="dot off" />Offline · pesan akan diantre</span>;
  else statusLine = <span className="room-status off"><span className="dot warn" />Memeriksa koneksi…</span>;

  let lastDay = null;

  return (
    <>
      <div className="room-head">
        <button type="button" className="icon-btn only-mobile" aria-label="Kembali ke daftar obrolan" onClick={() => go(null)}><Icon.back sw={2.2} /></button>
        <Avatar name={contact.name} color={contact.color} size={40} />
        <div className="room-title">
          <strong>{contact.name}</strong>
          {statusLine}
        </div>
        <button type="button" className="icon-btn" aria-label="Info kontak" aria-expanded={info} onClick={() => setInfo(!info)}><Icon.info /></button>
      </div>

      {info && (
        <div className="side-panel">
          <div className="kv"><span>ID kontak</span><span>{contact.deviceId}</span></div>
          <div className="kv"><span>Alamat</span><span>{contact.address}</span></div>
          <p className="hint" style={{ margin: 0 }}>Cocokkan ID ini dengan yang tampil di perangkat temanmu untuk memastikan kalian terhubung ke orang yang benar.</p>
          <div className="two">
            <button type="button" className="btn" onClick={() => setConfirm('block')}>Blokir</button>
            <button type="button" className="btn" style={{ color: 'var(--danger)', borderColor: 'var(--danger-line)' }} onClick={() => setConfirm('delete')}>Hapus kontak</button>
          </div>
        </div>
      )}

      <div className="messages" ref={listRef}>
        <div className="messages-inner">
          <div className="notice">
            <Icon.lock size={16} sw={2.2} />
            <span>Pesan hanya disimpan di perangkat ini dan perangkat {contact.name}. Tidak ada salinan di server.</span>
          </div>
          {messages.map((m) => {
            const day = dayLabel(m.ts);
            const showDay = day !== lastDay;
            lastDay = day;
            const st = STATUS[m.status];
            return (
              <Fragment key={m.id}>
                {showDay && <div className="day">{day}</div>}
                <div className={'msg ' + (m.mine ? 'mine' : 'theirs')}>
                  {m.file ? <Attachment chatId={id} m={m} toast={toast} onLoad={stickToBottom} /> : <div className="bubble">{m.text}</div>}
                  <span className={'meta' + (m.mine && st?.warn ? ' warn' : '')}>
                    {clock(m.ts)}{m.mine && st ? ` · ${st.text}` : ''}
                  </span>
                </div>
              </Fragment>
            );
          })}
        </div>
      </div>

      {pending ? (
        <div className="request-bar">
          <span style={{ fontSize: 14, lineHeight: 1.5 }}><strong>{contact.name}</strong> ingin menambahkanmu. Cocokkan ID <span className="mono">{contact.deviceId}</span> dengan temanmu sebelum menerima.</span>
          <div className="row">
            <button type="button" className="btn" onClick={() => api.block(id).then(() => go(null))}>Blokir</button>
            <button type="button" className="btn btn-primary" onClick={() => api.accept(id)}>Terima</button>
          </div>
        </div>
      ) : (
        <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <button type="button" className="icon-btn" style={{ color: 'var(--muted)' }} aria-label="Lampirkan file" onClick={() => fileRef.current.click()}><Icon.clip /></button>
          <input ref={fileRef} type="file" hidden onChange={(e) => { attach(e.target.files[0]); e.target.value = ''; }} />
          <label htmlFor="pesan" className="sr-only">Tulis pesan</label>
          <input id="pesan" type="text" placeholder="Tulis pesan…" autoComplete="off" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
          <button type="submit" className="send-btn" aria-label="Kirim pesan" disabled={!draft.trim()}><Icon.send size={20} sw={2.2} /></button>
        </form>
      )}

      {confirm && (
        <Modal title={confirm === 'block' ? `Blokir ${contact.name}?` : `Hapus ${contact.name}?`} onClose={() => setConfirm(null)}>
          <p>{confirm === 'block'
            ? 'Pesan dari kontak ini akan diabaikan tanpa memberi tahu mereka. Antrean pesan untuknya dibatalkan.'
            : 'Kontak dan seluruh riwayat obrolan dengannya dihapus dari perangkat ini. Ini tidak bisa dibatalkan.'}</p>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setConfirm(null)}>Batal</button>
            <button type="button" className="btn btn-danger-solid" onClick={async () => {
              if (confirm === 'block') await api.block(id); else await api.removeContact(id);
              go(null);
            }}>{confirm === 'block' ? 'Blokir' : 'Hapus'}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
