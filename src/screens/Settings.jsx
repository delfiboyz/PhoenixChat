import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { t } from '../i18n.js';
import { Avatar, Icon, Modal, android, formatBytes, saveBlob } from '../ui.jsx';
import { LangPicker, RestoreModal } from './Start.jsx';

const LIMITS = [
  { id: '5', label: '5 MB' },
  { id: '25', label: '25 MB' },
  { id: '100', label: '100 MB' },
  { id: 'none', labelKey: 'set.noLimit' },
];

const BRIDGES = [
  { id: 'none', labelKey: 'set.bridge.none', noteKey: 'set.bridge.noneNote' },
  { id: 'obfs4', label: 'obfs4', noteKey: 'set.bridge.obfs4Note' },
  { id: 'snowflake', label: 'Snowflake', noteKey: 'set.bridge.snowflakeNote' },
];

function ExportModal({ onClose, toast, intro }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    if (pw !== pw2) { setError(t('exp.mismatch')); return; }
    setBusy(true);
    try {
      const blob = await api.exportBackup(pw);
      const d = new Date();
      saveBlob(blob, `chat-lokal-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.clbak`);
      toast(t('exp.done'));
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <Modal title={t('exp.title')} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p>{intro || t('exp.intro')}</p>
        <div className="field">
          <label htmlFor="pw1">{t('exp.pw1')}</label>
          <input id="pw1" className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pw2">{t('exp.pw2')}</label>
          <input id="pw2" className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </div>
        {error && <span className="error" role="alert">{error}</span>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={busy || pw.length < 8}>{busy ? t('exp.busy') : t('exp.go')}</button>
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
    <Modal title={t('pin.title')} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p>{t('pin.body')}</p>
        <div className="field">
          <label htmlFor="newpin">{t('pin.new')}</label>
          <input id="newpin" className="input mono" type="password" inputMode="numeric" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
        </div>
        {error && <span className="error" role="alert">{error}</span>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={pin.length < 4}>{t('pin.save')}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Settings({ status, rev, go, toast, refresh, lang, onLang }) {
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

  if (!s) return <div className="placeholder-main"><p>{t('common.loading')}</p></div>;
  const patch = (p) => api.patchSettings(p).then(setS, (e) => toast(e.message));
  const u = status.usage;
  const pct = (n) => (u.total ? `${Math.max(2, (n / u.total) * 100)}%` : '0%');
  const net = status.network;
  const lowSpace = u.free != null && u.free < 500 * 1024 * 1024;
  const bridgeDirty = bridgeType !== s.bridge.type || (bridgeType !== 'none' && bridgeLines !== (s.bridge.lines || ''));

  let netText = t('set.netWaiting');
  if (net.direct) netText = t('set.netDirect');
  else if (net.phase === 'ready') netText = t('set.netReady');
  else if (net.phase === 'error') netText = t('set.netError');
  else if (net.phase === 'connecting') netText = t('set.netConnecting', { p: net.progress });

  const toggles = [
    { key: 'autoDelete', label: t('set.autoDelete'), on: s.autoDelete, flip: () => patch({ autoDelete: !s.autoDelete }) },
    { key: 'readReceipts', label: t('set.readReceipts'), on: s.readReceipts, flip: () => patch({ readReceipts: !s.readReceipts }) },
    {
      key: 'pin', label: t('set.pin'), on: s.hasPin,
      flip: () => (s.hasPin ? api.setPin(null).then(setS) : setModal('pin')),
    },
  ];
  if (android) {
    toggles.push({
      key: 'battery', label: t('set.battery'), on: s.battery,
      note: s.battery ? t('set.batteryOn') : t('set.batteryOff'),
      flip: () => patch({ battery: !s.battery }),
    });
  }

  const bridgeName = s.bridge.type === 'none' ? t('set.noBridge') : t('set.bridgeX', { name: s.bridge.type });

  return (
    <div className="screen">
      <div className="page narrow" style={{ gap: 18 }}>
        <div className="page-head">
          <button type="button" className="icon-btn" aria-label={t('common.back')} onClick={() => go(null)}><Icon.back sw={2.2} /></button>
          <h1 className="h-display">{t('common.settings')}</h1>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px' }}>
          <Avatar name={status.me.name} size={48} accent />
          {editName === null ? (
            <>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ fontWeight: 600, fontSize: 16 }}>{status.me.name}</span>
                <span className="mono muted" style={{ fontSize: 12.5 }}>{status.me.deviceId || '····'} · {t('set.noAccount')}</span>
              </div>
              <button type="button" className="btn" style={{ height: 36, fontSize: 13, padding: '0 12px', borderRadius: 10 }} onClick={() => setEditName(status.me.name)}>{t('set.edit')}</button>
            </>
          ) : (
            <form style={{ flex: 1, display: 'flex', gap: 8 }} onSubmit={(e) => {
              e.preventDefault();
              api.setName(editName).then(() => { setEditName(null); refresh(); }, (err) => toast(err.message));
            }}>
              <label htmlFor="nama-baru" className="sr-only">{t('start.nameLabel')}</label>
              <input id="nama-baru" className="input" style={{ height: 40 }} value={editName} maxLength={40} onChange={(e) => setEditName(e.target.value)} autoFocus />
              <button type="submit" className="btn btn-primary" style={{ height: 40 }}>{t('common.save')}</button>
            </form>
          )}
        </div>

        <div className="card pad">
          <LangPicker lang={lang} onLang={onLang} label={t('lang.title')} />
        </div>

        <div className="card pad">
          <div className="row-between" style={{ alignItems: 'baseline' }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{t('set.storage')}</h2>
            <span className="mono" style={{ fontSize: 13, color: 'var(--body-2)' }}>{t('set.used', { size: formatBytes(u.total) })}</span>
          </div>
          <div className="meter" role="img" aria-label={t('set.meter', { m: formatBytes(u.messages), f: formatBytes(u.files), k: formatBytes(u.keys) })}>
            <div style={{ width: pct(u.messages), background: '#1E6B51' }} />
            <div style={{ width: pct(u.files), background: '#6FB396' }} />
            <div style={{ width: pct(u.keys), background: '#B9D6C8' }} />
          </div>
          <div className="legend">
            <span><i style={{ background: '#1E6B51' }} />{t('set.messages')} {formatBytes(u.messages)}</span>
            <span><i style={{ background: '#6FB396' }} />{t('set.files')} {formatBytes(u.files)}</span>
            <span><i style={{ background: '#B9D6C8' }} />{t('set.keys')} {formatBytes(u.keys)}</span>
          </div>
          {lowSpace && <div className="warn-box">{t('set.lowSpace', { free: formatBytes(u.free) })}</div>}
          <div className="divider" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{t('set.limitTitle')}</h3>
            <span className="hint" style={{ fontSize: 12.5 }}>{t('set.limitHint')}</span>
          </div>
          <div className="choices">
            {LIMITS.map((o) => (
              <button type="button" key={o.id} className="choice" aria-pressed={s.limit === o.id} onClick={() => patch({ limit: o.id })}>{o.labelKey ? t(o.labelKey) : o.label}</button>
            ))}
          </div>
        </div>

        <div className="group">
          <h2 className="section-label">{t('set.tor')}</h2>
          <div className="card pad" style={{ gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon.onion size={20} /></span>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 600 }}>
                  <span className={'dot' + (net.phase === 'ready' ? '' : net.phase === 'error' ? ' off' : ' warn')} />{netText}
                </span>
                <span className="mono muted" style={{ fontSize: 12 }}>
                  {net.direct
                    ? t('set.onionNone')
                    : t('set.onion', { state: net.phase === 'ready' ? t('set.onionActive') : t('set.onionWaiting'), bridge: bridgeName })}
                </span>
              </div>
              {net.phase === 'error' && <button type="button" className="btn" style={{ height: 36, fontSize: 13 }} onClick={() => api.retryNetwork()}>{t('net.retry')}</button>}
            </div>
            {net.phase === 'error' && net.error && <span className="error">{net.error}</span>}
            <div className="divider" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{t('set.bridgeTitle')}</h3>
              <span className="hint" style={{ fontSize: 12.5 }}>{t('set.bridgeHint')}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {BRIDGES.map((b) => (
                <button type="button" key={b.id} className="radio" aria-pressed={bridgeType === b.id} onClick={() => setBridgeType(b.id)}>
                  <span className="radio-ring" />
                  <span className="radio-text"><strong>{b.labelKey ? t(b.labelKey) : b.label}</strong><span>{t(b.noteKey)}</span></span>
                </button>
              ))}
            </div>
            {bridgeType !== 'none' && (
              <div className="field">
                <label htmlFor="bridge-lines">{t('set.bridgeLines', { type: bridgeType })}</label>
                <textarea id="bridge-lines" className="input" value={bridgeLines} onChange={(e) => setBridgeLines(e.target.value)}
                  placeholder={bridgeType === 'obfs4' ? 'obfs4 IP:PORT FINGERPRINT cert=… iat-mode=0' : 'snowflake 192.0.2.3:80 FINGERPRINT fingerprint=… url=…'} />
                <span className="hint">
                  {t('set.bridgeLinesHint')}
                  {!android && ` ${bridgeType === 'snowflake' ? t('set.needSnowflake') : t('set.needObfs4')}`}
                </span>
              </div>
            )}
            {bridgeDirty && (
              <button type="button" className="btn btn-primary" onClick={() => patch({ bridge: { type: bridgeType, lines: bridgeLines } }).then(() => toast(t('set.reconnecting')))}>
                {t('set.apply')}
              </button>
            )}
          </div>
        </div>

        <div className="group">
          <h2 className="section-label">{t('set.backup')}</h2>
          <div className="card" style={{ overflow: 'hidden' }}>
            <button type="button" className="list-btn" onClick={() => setModal('export')}>
              <Icon.download size={20} />
              <span className="t"><strong>{t('set.export')}</strong><span>{t('set.exportNote')}</span></span>
            </button>
            <button type="button" className="list-btn" onClick={() => importRef.current.click()}>
              <Icon.upload size={20} />
              <span className="t"><strong>{t('set.import')}</strong><span>{t('set.importNote')}</span></span>
            </button>
            <input ref={importRef} type="file" hidden onChange={(e) => { setRestoreFile(e.target.files[0] || null); e.target.value = ''; }} />
            <button type="button" className="list-btn" onClick={() => setModal('move')}>
              <Icon.devices size={20} />
              <span className="t"><strong>{t('set.move')}</strong><span>{t('set.moveNote')}</span></span>
            </button>
          </div>
        </div>

        <div className="group">
          <h2 className="section-label">{t('set.privacy')}</h2>
          <div className="card" style={{ overflow: 'hidden' }}>
            {toggles.map((x) => (
              <button type="button" key={x.key} className="list-btn" aria-pressed={x.on} onClick={x.flip}>
                <span className="t"><strong>{x.label}</strong>{x.note && <span>{x.note}</span>}</span>
                <span className="switch" />
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: '0 4px', fontSize: 13, lineHeight: 1.5, color: 'var(--muted-2)' }}>{t('set.noRecovery')}</p>
          <button type="button" className="btn btn-danger" onClick={() => setModal('wipe')}>{t('set.wipe')}</button>
        </div>
      </div>

      {modal === 'export' && <ExportModal onClose={() => setModal(null)} toast={toast} />}
      {modal === 'move' && <ExportModal onClose={() => setModal(null)} toast={toast} intro={t('set.moveIntro')} />}
      {modal === 'pin' && <PinModal onClose={() => setModal(null)} onDone={(v) => { setS(v); setModal(null); toast(t('pin.on')); }} />}
      {modal === 'wipe' && (
        <Modal title={t('wipe.title')} onClose={() => setModal(null)}>
          <p>{t('wipe.body1', { id: status.me.deviceId })}</p>
          <p>{t('wipe.body2')}</p>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setModal(null)}>{t('common.cancel')}</button>
            <button type="button" className="btn btn-danger-solid" onClick={() => setModal('wipe2')}>{t('common.continue')}</button>
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
  const word = t('wipe.word');
  return (
    <Modal title={t('wipe.confirmTitle')} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); api.wipe().then(onDone); }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="field">
          <label htmlFor="wipe-confirm">{t('wipe.typeLabel', { word })}</label>
          <input id="wipe-confirm" className="input mono" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn btn-danger-solid" disabled={text.trim().toUpperCase() !== word}>{t('wipe.go')}</button>
        </div>
      </form>
    </Modal>
  );
}
