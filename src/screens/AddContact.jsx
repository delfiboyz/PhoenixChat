import { useCallback, useEffect, useState } from 'react';
import { api, qrUrl } from '../api.js';
import { Icon, android, copyText } from '../ui.jsx';

export default function AddContact({ status, go, toast, initialCode }) {
  const [tab, setTab] = useState(initialCode ? 'paste' : 'mine');
  const [code, setCode] = useState(initialCode || '');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const me = status.me;

  const copy = async (text, msg) => {
    try {
      await copyText(text);
      toast(msg);
    } catch {
      toast('Tidak bisa menyalin ke papan klip');
    }
  };

  const share = async () => {
    if (android) {
      android.share(me.code);
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Kode Chat Lokal', text: me.code });
        return;
      } catch {
        // dibatalkan: jatuh ke salin
      }
    }
    copy(me.code, 'Tautan disalin. Kirim lewat aplikasi lain.');
  };

  const addCode = useCallback(async (value) => {
    setBusy(true);
    setError(null);
    try {
      const c = await api.addContact(value);
      go({ name: 'chat', id: c.id });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }, [go]);
  const add = (e) => {
    e.preventDefault();
    addCode(code);
  };

  // Hasil pemindaian QR dari kamera Android.
  useEffect(() => {
    const onScan = (e) => {
      setCode(e.detail);
      addCode(e.detail);
    };
    window.addEventListener('chatlokal:scan', onScan);
    return () => window.removeEventListener('chatlokal:scan', onScan);
  }, [addCode]);

  return (
    <div className="screen">
      <div className="page narrow">
        <div className="page-head">
          <button type="button" className="icon-btn" aria-label="Kembali" onClick={() => go(null)}><Icon.back sw={2.2} /></button>
          <h1 className="h-display">Tambah kontak</h1>
        </div>

        <div className="segmented">
          <button type="button" aria-pressed={tab === 'mine'} onClick={() => setTab('mine')}>Kode saya</button>
          <button type="button" aria-pressed={tab === 'paste'} onClick={() => setTab('paste')}>{android ? 'Pindai kode' : 'Tempel kode'}</button>
        </div>

        {tab === 'mine' ? (
          <div className="card qr-card">
            {me.code
              ? <img src={qrUrl(me.deviceId)} alt={`Kode QR berisi alamat perangkat ${me.name}`} />
              : <p className="hint" style={{ height: 210, display: 'flex', alignItems: 'center' }}>Menunggu alamat .onion dari Tor…</p>}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ fontWeight: 600, fontSize: 18 }}>{me.name}</span>
              <span className="qr-id">{me.deviceId || '····-····-····'}</span>
            </div>
            <div className="two">
              <button type="button" className="btn" disabled={!me.code} onClick={() => copy(me.code, 'Kode disalin')}><Icon.copy size={18} />Salin kode</button>
              <button type="button" className="btn btn-primary" disabled={!me.code} onClick={share}><Icon.share size={18} />Bagikan tautan</button>
            </div>
          </div>
        ) : (
          <form className="card pad" onSubmit={add}>
            {android && (
              <>
                <button type="button" className="btn btn-primary btn-lg" onClick={() => android.scanQr()}><Icon.scan size={20} />Pindai kode QR teman</button>
                <div className="divider" />
              </>
            )}
            <div className="field">
              <label htmlFor="kode">Kode atau tautan teman</label>
              <textarea id="kode" className="input" placeholder="chatlokal:…" value={code} onChange={(e) => setCode(e.target.value)} autoFocus={!android} />
              <span className="hint">{android ? 'Atau tempel kode/tautan yang dikirim temanmu.' : 'Minta temanmu menekan “Salin kode” lalu kirimkan kepadamu, atau tempel tautan yang dia bagikan.'}</span>
              {error && <span className="error" role="alert">{error}</span>}
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy || !code.trim()}>Tambahkan</button>
          </form>
        )}

        <div className="steps">
          <h2>Cara menambah teman</h2>
          <div className="step"><span className="step-n">1</span><span>Tunjukkan kode ini, atau kirim tautannya lewat aplikasi lain.</span></div>
          <div className="step"><span className="step-n">2</span><span>Temanmu menempel kodenya. Kunci kalian ditukar langsung antar perangkat, lalu kamu menyetujui permintaannya.</span></div>
          <div className="step"><span className="step-n">3</span><span>Tidak ada direktori pengguna, jadi orang asing tidak bisa menemukanmu.</span></div>
        </div>
      </div>
    </div>
  );
}
