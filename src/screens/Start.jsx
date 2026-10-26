import { useRef, useState } from 'react';
import { api } from '../api.js';
import { LANGS, t } from '../i18n.js';
import { Icon, Modal, PhoenixLogo } from '../ui.jsx';

// Pemilih bahasa: dipakai di layar Mulai dan di Pengaturan.
export function LangPicker({ lang, onLang, label }) {
  return (
    <div className="lang-pick" role="group" aria-label={label}>
      <span className="label"><Icon.globe size={16} />{label}</span>
      <div className="segmented">
        {LANGS.map((l) => (
          <button type="button" key={l.id} lang={l.id} aria-pressed={lang === l.id} onClick={() => onLang(l.id)}>{l.label}</button>
        ))}
      </div>
    </div>
  );
}

export default function Start({ onDone, lang, onLang }) {
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
          <div className="brand-mark"><PhoenixLogo size={30} /></div>
          <span className="brand-name">Phoenix Chat</span>
        </div>

        <LangPicker lang={lang} onLang={onLang} label={t('lang.pick')} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h1 className="h-display" style={{ fontSize: 40, lineHeight: 1.05 }}>{t('start.title')}</h1>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5, color: 'var(--muted-2)' }}>{t('start.lead')}</p>
        </div>

        <div className="card promise">
          <div className="promise-row"><Icon.device /><div><strong>{t('start.p1t')}</strong><span>{t('start.p1d')}</span></div></div>
          <div className="promise-row"><Icon.key /><div><strong>{t('start.p2t')}</strong><span>{t('start.p2d')}</span></div></div>
          <div className="promise-row"><Icon.link /><div><strong>{t('start.p3t')}</strong><span>{t('start.p3d')}</span></div></div>
        </div>

        <div className="field">
          <label htmlFor="nama">{t('start.nameLabel')}</label>
          <input id="nama" className="input" type="text" placeholder={t('start.namePh')} value={name} maxLength={40}
            onChange={(e) => setName(e.target.value)} autoComplete="off" />
          <span className="hint">{t('start.nameHint')}</span>
          {error && <span className="error" role="alert">{error}</span>}
        </div>

        <div className="start-actions">
          <button type="submit" className="btn btn-primary btn-lg" disabled={busy || !name.trim()}>
            {busy ? t('start.making') : t('start.go')}
          </button>
          <button type="button" className="btn" style={{ height: 48, borderRadius: 14 }} onClick={() => fileRef.current.click()}>
            {t('start.restore')}
          </button>
          <input ref={fileRef} type="file" hidden onChange={(e) => { setRestoreFile(e.target.files[0] || null); e.target.value = ''; }} />
          <div className="foot-id">{t('start.idNote')}</div>
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
    <Modal title={t('restore.title')} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p>{t('restore.file')} <span className="mono">{file.name}</span></p>
        {replacing && <div className="warn-box">{t('restore.replace')}</div>}
        <div className="field">
          <label htmlFor="restore-pw">{t('restore.pw')}</label>
          <input id="restore-pw" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <span className="error" role="alert">{error}</span>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !password}>{busy ? t('restore.busy') : t('restore.go')}</button>
        </div>
      </form>
    </Modal>
  );
}
