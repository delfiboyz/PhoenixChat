import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Avatar, Icon, Modal, android, formatBytes, saveBlob } from '../ui.jsx';
import { RestoreModal } from './Start.jsx';

const LIMITS = [
  { id: '5', label: '5 MB' },
  { id: '25', label: '25 MB' },
  { id: '100', label: '100 MB' },
  { id: 'none', label: 'Bebas' },
];

const BRIDGES = [
  { id: 'none', label: 'Tanpa bridge', note: 'Paling cepat, untuk jaringan biasa' },
  { id: 'obfs4', label: 'obfs4', note: 'Menyamarkan lalu lintas Tor' },
  { id: 'snowflake', label: 'Snowflake', note: 'Lewat relawan, cocok jika obfs4 diblokir' },
];

function ExportModal({ onClose, toast, intro }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    if (pw !== pw2) { setError('Kata sandi tidak sama'); return; }
    setBusy(true);
    try {
      const blob = await api.exportBackup(pw);
      const d = new Date();
      saveBlob(blob, `chat-lokal-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.clbak`);
      toast('Cadangan dibuat');
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <Modal title="Ekspor cadangan" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p>{intro || 'File berisi kunci, kontak, pesan, dan lampiran, dienkripsi dengan kata sandi ini. Tanpa kata sandi, file tidak bisa dibuka — termasuk oleh kamu.'}</p>
        <div className="field">
          <label htmlFor="pw1">Kata sandi (min. 8 karakter)</label>
          <input id="pw1" className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pw2">Ulangi kata sandi</label>
          <input id="pw2" className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </div>
        {error && <span className="error" role="alert">{error}</span>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Batal</button>
          <button type="submit" className="btn btn-primary" disabled={busy || pw.length < 8}>{busy ? 'Mengenkripsi…' : 'Ekspor'}</button>
        </div>
      </form>
    </Modal>
  );
}

function PinModal({ onClose, onDone }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    try {
      onDone(await api.setPin(pin));
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <Modal title="Kunci dengan PIN" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p>PIN diminta setiap kali aplikasi dibuka. PIN tidak bisa dipulihkan; jika lupa, pulihkan dari cadangan.</p>
        <div className="field">
          <label htmlFor="newpin">PIN baru (4–8 angka)</label>
          <input id="newpin" className="input mono" type="password" inputMode="numeric" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
        </div>
        {error && <span className="error" role="alert">{error}</span>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Batal</button>
          <button type="submit" className="btn btn-primary" disabled={pin.length < 4}>Simpan PIN</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Settings({ status, rev, go, toast, refresh }) {
  const [s, setS] = useState(null);
  const [modal, setModal] = useState(null);
  const [editName, setEditName] = useState(null);
  const [bridgeLines, setBridgeLines] = useState('');
  const [bridgeType, setBridgeType] = useState('none');
  const [restoreFile, setRestoreFile] = useState(null);
  const importRef = useRef(null);

  useEffect(() => {
    api.settings().then((v) => {
      setS(v);
      setBridgeType(v.bridge.type);
      setBridgeLines(v.bridge.lines || '');
    }, () => {});
  }, [rev]);

  if (!s) return <div className="placeholder-main"><p>Memuat…</p></div>;
  const patch = (p) => api.patchSettings(p).then(setS, (e) => toast(e.message));
  const u = status.usage;
  const pct = (n) => (u.total ? `${Math.max(2, (n / u.total) * 100)}%` : '0%');
  const net = status.network;
  const lowSpace = u.free != null && u.free < 500 * 1024 * 1024;
  const bridgeDirty = bridgeType !== s.bridge.type || (bridgeType !== 'none' && bridgeLines !== (s.bridge.lines || ''));

  let netText = 'Menyambung…';
  if (net.direct) netText = 'Mode uji tanpa Tor';
  else if (net.phase === 'ready') netText = 'Tersambung ke Tor';
  else if (net.phase === 'error') netText = 'Tidak tersambung';
  else if (net.phase === 'connecting') netText = `Menyambung ke Tor… ${net.progress}%`;

  const toggles = [
    { key: 'autoDelete', label: 'Hapus pesan setelah 30 hari', on: s.autoDelete, flip: () => patch({ autoDelete: !s.autoDelete }) },
    { key: 'readReceipts', label: 'Kirim tanda “Dibaca”', on: s.readReceipts, flip: () => patch({ readReceipts: !s.readReceipts }) },
    {
      key: 'pin', label: 'Kunci aplikasi dengan PIN', on: s.hasPin,
      flip: () => (s.hasPin ? api.setPin(null).then(setS) : setModal('pin')),
    },
  ];
  if (android) {
    toggles.push({
      key: 'battery', label: 'Mode hemat baterai (Android)', on: s.battery,
      note: s.battery ? 'Pesan baru hanya diterima saat aplikasi terbuka.' : 'Tor tetap berjalan di latar agar pesan selalu diterima.',
      flip: () => patch({ battery: !s.battery }),
    });
  }

  return (
    <div className="screen">
      <div className="page narrow" style={{ gap: 18 }}>
        <div className="page-head">
          <button type="button" className="icon-btn" aria-label="Kembali" onClick={() => go(null)}><Icon.back sw={2.2} /></button>
          <h1 className="h-display">Pengaturan</h1>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px' }}>
          <Avatar name={status.me.name} size={48} accent />
          {editName === null ? (
            <>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ fontWeight: 600, fontSize: 16 }}>{status.me.name}</span>
                <span className="mono muted" style={{ fontSize: 12.5 }}>{status.me.deviceId || '····'} · tanpa akun</span>
              </div>
              <button type="button" className="btn" style={{ height: 36, fontSize: 13, padding: '0 12px', borderRadius: 10 }} onClick={() => setEditName(status.me.name)}>Ubah</button>
            </>
          ) : (
            <form style={{ flex: 1, display: 'flex', gap: 8 }} onSubmit={(e) => {
              e.preventDefault();
              api.setName(editName).then(() => { setEditName(null); refresh(); }, (err) => toast(err.message));
            }}>
              <label htmlFor="nama-baru" className="sr-only">Nama panggilan</label>
              <input id="nama-baru" className="input" style={{ height: 40 }} value={editName} maxLength={40} onChange={(e) => setEditName(e.target.value)} autoFocus />
              <button type="submit" className="btn btn-primary" style={{ height: 40 }}>Simpan</button>
            </form>
          )}
        </div>

        <div className="card pad">
          <div className="row-between" style={{ alignItems: 'baseline' }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Penyimpanan perangkat</h2>
            <span className="mono" style={{ fontSize: 13, color: 'var(--body-2)' }}>{formatBytes(u.total)} dipakai</span>
          </div>
          <div className="meter" role="img" aria-label={`Pesan ${formatBytes(u.messages)}, lampiran ${formatBytes(u.files)}, kunci ${formatBytes(u.keys)}`}>
            <div style={{ width: pct(u.messages), background: '#1E6B51' }} />
            <div style={{ width: pct(u.files), background: '#6FB396' }} />
            <div style={{ width: pct(u.keys), background: '#B9D6C8' }} />
          </div>
          <div className="legend">
            <span><i style={{ background: '#1E6B51' }} />Pesan {formatBytes(u.messages)}</span>
            <span><i style={{ background: '#6FB396' }} />Lampiran {formatBytes(u.files)}</span>
            <span><i style={{ background: '#B9D6C8' }} />Kunci {formatBytes(u.keys)}</span>
          </div>
          {lowSpace && (
            <div className="warn-box">Ruang disk hampir penuh ({formatBytes(u.free)} tersisa). Hapus obrolan berisi lampiran lama, turunkan batas lampiran, atau ekspor cadangan lalu bersihkan.</div>
          )}
          <div className="divider" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Batas ukuran lampiran</h3>
            <span className="hint" style={{ fontSize: 12.5 }}>Lampiran di atas batas ini tidak diunduh otomatis. Kamu bisa mengunduhnya manual.</span>
          </div>
          <div className="choices">
            {LIMITS.map((o) => (
              <button type="button" key={o.id} className="choice" aria-pressed={s.limit === o.id} onClick={() => patch({ limit: o.id })}>{o.label}</button>
            ))}
          </div>
        </div>

        <div className="group">
          <h2 className="section-label">Jaringan Tor</h2>
          <div className="card pad" style={{ gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon.onion size={20} /></span>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 600 }}>
                  <span className={'dot' + (net.phase === 'ready' ? '' : net.phase === 'error' ? ' off' : ' warn')} />{netText}
                </span>
                <span className="mono muted" style={{ fontSize: 12 }}>
                  {net.direct ? 'tanpa layanan onion' : `Layanan onion ${net.phase === 'ready' ? 'aktif' : 'menunggu'} · ${s.bridge.type === 'none' ? 'tanpa bridge' : 'bridge ' + s.bridge.type}`}
                </span>
              </div>
              {net.phase === 'error' && <button type="button" className="btn" style={{ height: 36, fontSize: 13 }} onClick={() => api.retryNetwork()}>Coba lagi</button>}
            </div>
            {net.phase === 'error' && net.error && <span className="error">{net.error}</span>}
            <div className="divider" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Bridge</h3>
              <span className="hint" style={{ fontSize: 12.5 }}>Pakai bridge jika Tor diblokir di jaringanmu, misalnya di kantor atau sekolah.</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {BRIDGES.map((b) => (
                <button type="button" key={b.id} className="radio" aria-pressed={bridgeType === b.id} onClick={() => setBridgeType(b.id)}>
                  <span className="radio-ring" />
                  <span className="radio-text"><strong>{b.label}</strong><span>{b.note}</span></span>
                </button>
              ))}
            </div>
            {bridgeType !== 'none' && (
              <div className="field">
                <label htmlFor="bridge-lines">Alamat bridge {bridgeType}</label>
                <textarea id="bridge-lines" className="input" value={bridgeLines} onChange={(e) => setBridgeLines(e.target.value)}
                  placeholder={bridgeType === 'obfs4' ? 'obfs4 IP:PORT FINGERPRINT cert=… iat-mode=0' : 'snowflake 192.0.2.3:80 FINGERPRINT fingerprint=… url=…'} />
                <span className="hint">Satu baris per bridge. Dapatkan dari bridges.torproject.org atau dari orang yang kamu percaya. {bridgeType === 'snowflake' ? 'Butuh program snowflake-client terpasang.' : 'Butuh program obfs4proxy atau lyrebird terpasang.'}</span>
              </div>
            )}
            {bridgeDirty && (
              <button type="button" className="btn btn-primary" onClick={() => patch({ bridge: { type: bridgeType, lines: bridgeLines } }).then(() => toast('Menyambung ulang ke Tor…'))}>
                Terapkan dan sambung ulang
              </button>
            )}
          </div>
        </div>

        <div className="group">
          <h2 className="section-label">Cadangan</h2>
          <div className="card" style={{ overflow: 'hidden' }}>
            <button type="button" className="list-btn" onClick={() => setModal('export')}>
              <Icon.download size={20} />
              <span className="t"><strong>Ekspor cadangan</strong><span>File terenkripsi dengan kata sandi</span></span>
            </button>
            <button type="button" className="list-btn" onClick={() => importRef.current.click()}>
              <Icon.upload size={20} />
              <span className="t"><strong>Impor cadangan</strong><span>Mengganti semua data di perangkat ini</span></span>
            </button>
            <input ref={importRef} type="file" hidden onChange={(e) => { setRestoreFile(e.target.files[0] || null); e.target.value = ''; }} />
            <button type="button" className="list-btn" onClick={() => setModal('move')}>
              <Icon.devices size={20} />
              <span className="t"><strong>Pindahkan ke perangkat baru</strong><span>Ekspor di sini, lalu pulihkan di perangkat baru</span></span>
            </button>
          </div>
        </div>

        <div className="group">
          <h2 className="section-label">Privasi</h2>
          <div className="card" style={{ overflow: 'hidden' }}>
            {toggles.map((t) => (
              <button type="button" key={t.key} className="list-btn" aria-pressed={t.on} onClick={t.flip}>
                <span className="t"><strong>{t.label}</strong>{t.note && <span>{t.note}</span>}</span>
                <span className="switch" />
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: '0 4px', fontSize: 13, lineHeight: 1.5, color: 'var(--muted-2)' }}>
            Tanpa akun berarti tidak ada pemulihan dari server. Jika aplikasi dihapus tanpa cadangan, semua pesan hilang.
          </p>
          <button type="button" className="btn btn-danger" onClick={() => setModal('wipe')}>Hapus semua data di perangkat ini</button>
        </div>
      </div>

      {modal === 'export' && <ExportModal onClose={() => setModal(null)} toast={toast} />}
      {modal === 'move' && (
        <ExportModal onClose={() => setModal(null)} toast={toast}
          intro="Buat file cadangan di sini, salin ke perangkat baru, lalu pilih “Pulihkan dari file cadangan” di layar Mulai. Setelah pindah, hapus data di perangkat lama agar tidak ada dua perangkat dengan identitas yang sama." />
      )}
      {modal === 'pin' && <PinModal onClose={() => setModal(null)} onDone={(v) => { setS(v); setModal(null); toast('PIN aktif'); }} />}
      {modal === 'wipe' && (
        <Modal title="Hapus semua data?" onClose={() => setModal(null)}>
          <p>Kunci identitas, kontak, semua pesan, dan lampiran dihapus permanen dari perangkat ini. Teman-temanmu tidak bisa menghubungimu lagi di ID <span className="mono">{status.me.deviceId}</span>.</p>
          <p>Tidak ada salinan di server. Jika belum punya cadangan, ekspor dulu.</p>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setModal(null)}>Batal</button>
            <button type="button" className="btn btn-danger-solid" onClick={() => setModal('wipe2')}>Lanjutkan</button>
          </div>
        </Modal>
      )}
      {modal === 'wipe2' && <WipeConfirm onClose={() => setModal(null)} onDone={() => { go(null); refresh(); }} />}
      {restoreFile && <RestoreModal file={restoreFile} replacing onClose={() => setRestoreFile(null)} onDone={() => { setRestoreFile(null); go(null); refresh(); }} />}
    </div>
  );
}

function WipeConfirm({ onClose, onDone }) {
  const [text, setText] = useState('');
  return (
    <Modal title="Konfirmasi terakhir" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); api.wipe().then(onDone); }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="field">
          <label htmlFor="wipe-confirm">Ketik HAPUS untuk menghapus semuanya</label>
          <input id="wipe-confirm" className="input mono" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Batal</button>
          <button type="submit" className="btn btn-danger-solid" disabled={text.trim().toUpperCase() !== 'HAPUS'}>Hapus permanen</button>
        </div>
      </form>
    </Modal>
  );
}
