import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Avatar, Icon, formatBytes, listTime } from '../ui.jsx';
import { t } from '../i18n.js';

// Pratinjau pesan terakhir; server mengirim datanya, kalimatnya disusun di sini.
function lastLine(last) {
  if (!last) return null;
  const body = last.file ? t('list.attachment', { name: last.file }) : last.text;
  return (last.mine ? t('list.you') : '') + body;
}

export function NetworkBanner({ network, go }) {
  if (!network || network.phase === 'ready' || network.phase === 'idle') return null;
  if (network.phase === 'error') {
    return (
      <div className="net-banner error" role="alert">
        <span>{network.error || t('net.error')}</span>
        <div className="net-actions">
          <button type="button" className="btn" onClick={() => api.retryNetwork()}>{t('net.retry')}</button>
          <button type="button" className="btn" onClick={() => go({ name: 'settings' })}>{t('net.bridgeSettings')}</button>
        </div>
      </div>
    );
  }
  return (
    <div className="net-banner connecting" role="status">
      <span>{t('net.connecting', { p: network.progress || 0 })}</span>
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
          <h1 className="h-display" style={{ fontSize: 32 }}>{t('list.title')}</h1>
          <div style={{ display: 'flex', gap: 4 }}>
            <button type="button" className="icon-btn" aria-label={t('list.qr')} onClick={() => go({ name: 'add' })}><Icon.scan /></button>
            <button type="button" className="icon-btn" aria-label={t('common.settings')} onClick={() => go({ name: 'settings' })}><Icon.gear /></button>
          </div>
        </div>
        {!empty && (
          <div className="search">
            <label htmlFor="cari" className="sr-only">{t('list.searchLabel')}</label>
            <Icon.search size={18} />
            <input id="cari" type="search" placeholder={t('list.searchPh')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        )}
        <button type="button" className="pill" style={{ alignSelf: 'flex-start' }} onClick={() => go({ name: 'settings' })}>
          <Icon.lock size={14} sw={2.2} />
          {t('list.storage', { size: formatBytes(status.usage.total) })}
        </button>
      </div>
      <NetworkBanner network={status.network} go={go} />

      {empty ? (
        <div className="empty">
          <div className="empty-art"><Icon.chat size={40} /></div>
          <h2>{t('list.emptyTitle')}</h2>
          <p>{t('list.emptyBody')}</p>
          <button type="button" className="btn btn-primary" onClick={() => go({ name: 'add' })}>{t('list.emptyCta')}</button>
        </div>
      ) : (
        <div className="chat-rows">
          {rows && rows.length === 0 && <p className="hint" style={{ padding: 20 }}>{t('list.noMatch', { q })}</p>}
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
                  <span className="chat-row-last">{c.status === 'pending' ? t('list.wantsAdd') : (lastLine(c.last) || t('list.newContact'))}</span>
                  {c.status === 'pending' && <span className="tag-request">{t('list.request')}</span>}
                  {c.unread > 0 && c.status !== 'pending' && <span className="badge" aria-label={t('list.unread', { n: c.unread })}>{c.unread}</span>}
                  {c.queued && <span className="tag-warn">{t('list.queued')}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {!empty && (
        <button type="button" className="fab" onClick={() => go({ name: 'add' })}>
          <Icon.plus size={20} sw={2.2} />
          {t('list.add')}
        </button>
      )}
    </>
  );
}
