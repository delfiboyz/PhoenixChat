import { useCallback, useEffect, useState } from 'react';
import { api, qrUrl } from '../api.js';
import { Icon, android, copyText } from '../ui.jsx';
import { t } from '../i18n.js';

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
      toast(t('add.copyFail'));
    }
  };

  const share = async () => {
    if (android) {
      android.share(me.code);
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: t('add.shareTitle'), text: me.code });
        return;
      } catch {
        // dibatalkan: jatuh ke salin
      }
    }
    copy(me.code, t('add.linkCopied'));
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
          <button type="button" className="icon-btn" aria-label={t('common.back')} onClick={() => go(null)}><Icon.back sw={2.2} /></button>
          <h1 className="h-display">{t('add.title')}</h1>
        </div>

        <div className="segmented">
          <button type="button" aria-pressed={tab === 'mine'} onClick={() => setTab('mine')}>{t('add.mine')}</button>
          <button type="button" aria-pressed={tab === 'paste'} onClick={() => setTab('paste')}>{android ? t('add.scan') : t('add.paste')}</button>
        </div>

        {tab === 'mine' ? (
          <div className="card qr-card">
            {me.code
              ? <img src={qrUrl(me.deviceId)} alt={t('add.qrAlt', { name: me.name })} />
              : <p className="hint" style={{ height: 210, display: 'flex', alignItems: 'center' }}>{t('add.waiting')}</p>}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ fontWeight: 600, fontSize: 18 }}>{me.name}</span>
              <span className="qr-id">{me.deviceId || '····-····-····'}</span>
            </div>
            <div className="two">
              <button type="button" className="btn" disabled={!me.code} onClick={() => copy(me.code, t('add.copied'))}><Icon.copy size={18} />{t('add.copy')}</button>
              <button type="button" className="btn btn-primary" disabled={!me.code} onClick={share}><Icon.share size={18} />{t('add.share')}</button>
            </div>
          </div>
        ) : (
          <form className="card pad" onSubmit={add}>
            {android && (
              <>
                <button type="button" className="btn btn-primary btn-lg" onClick={() => android.scanQr()}><Icon.scan size={20} />{t('add.scanBtn')}</button>
                <div className="divider" />
              </>
            )}
            <div className="field">
              <label htmlFor="kode">{t('add.codeLabel')}</label>
              <textarea id="kode" className="input" placeholder="chatlokal:…" value={code} onChange={(e) => setCode(e.target.value)} autoFocus={!android} />
              <span className="hint">{android ? t('add.hintAndroid') : t('add.hint')}</span>
              {error && <span className="error" role="alert">{error}</span>}
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy || !code.trim()}>{t('add.submit')}</button>
          </form>
        )}

        <div className="steps">
          <h2>{t('add.howTitle')}</h2>
          <div className="step"><span className="step-n">1</span><span>{t('add.step1')}</span></div>
          <div className="step"><span className="step-n">2</span><span>{t('add.step2')}</span></div>
          <div className="step"><span className="step-n">3</span><span>{t('add.step3')}</span></div>
        </div>
      </div>
    </div>
  );
}
