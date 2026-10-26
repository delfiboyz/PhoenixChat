import { useRef, useState } from 'react';
import { api } from '../api.js';
import { Icon, Modal } from '../ui.jsx';

export default function Start({ onDone }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [restoreFile, setRestoreFile] = useState(null);
  const fileRef = useRef(null);

  const start = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await api.onboard(name));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <form className="start narrow" onSubmit={start}>
        <div className="brand">
          <div className="brand-mark"><Icon.logo /></div>
          <span className="brand-name">Chat Lokal</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h1 className="h-display" style={{ fontSize: 40, lineHeight: 1.05 }}>Ngobrol tanpa akun.</h1>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5, color: 'var(--muted-2)' }}>
            Tidak perlu email, nomor HP, atau kata sandi. Semua pesan disimpan hanya di perangkat ini.
          </p>
        </div>

        <div className="card promise">
          <div className="promise-row"><Icon.device /><div><strong>Tersimpan di perangkat</strong><span>Pesan ada di penyimpanan lokal, bukan di server.</span></div></div>
          <div className="promise-row"><Icon.key /><div><strong>Kunci dibuat di sini</strong><span>Identitasmu adalah kunci acak, bukan akun.</span></div></div>
          <div className="promise-row"><Icon.link /><div><strong>Lewat jaringan Tor</strong><span>Alamat IP-mu tersembunyi, pesan terenkripsi.</span></div></div>
        </div>

        <div className="field">
          <label htmlFor="nama">Nama panggilan</label>
          <input id="nama" className="input" type="text" placeholder="mis. Andi" value={name} maxLength={40}
            onChange={(e) => setName(e.target.value)} autoComplete="off" autoFocus />
          <span className="hint">Hanya terlihat oleh orang yang kamu tambahkan.</span>
          {error && <span className="error" role="alert">{error}</span>}
        </div>

        <div className="start-actions">
          <button type="submit" className="btn btn-primary btn-lg" disabled={busy || !name.trim()}>
            {busy ? 'Membuat kunci…' : 'Mulai ngobrol'}
          </button>
          <button type="button" className="btn" style={{ height: 48, borderRadius: 14 }} onClick={() => fileRef.current.click()}>
            Pulihkan dari file cadangan
          </button>
          <input ref={fileRef} type="file" hidden onChange={(e) => { setRestoreFile(e.target.files[0] || null); e.target.value = ''; }} />
          <div className="foot-id">ID perangkat dibuat otomatis saat kamu mulai</div>
        </div>
      </form>
      {restoreFile && <RestoreModal file={restoreFile} onClose={() => setRestoreFile(null)} onDone={onDone} />}
    </div>
  );
}

export function RestoreModal({ file, onClose, onDone, replacing }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await api.restore(file, password));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <Modal title="Pulihkan cadangan" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p>File: <span className="mono">{file.name}</span></p>
        {replacing && <div className="warn-box">Semua data di perangkat ini akan diganti dengan isi cadangan.</div>}
        <div className="field">
          <label htmlFor="restore-pw">Kata sandi cadangan</label>
          <input id="restore-pw" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <span className="error" role="alert">{error}</span>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Batal</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !password}>{busy ? 'Memulihkan…' : 'Pulihkan'}</button>
        </div>
      </form>
    </Modal>
  );
}
