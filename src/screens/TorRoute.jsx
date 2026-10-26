import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { locale, t } from '../i18n.js';
import { Icon } from '../ui.jsx';

// Bendera dari kode negara dua huruf (huruf indikator regional Unicode).
const flag = (cc) => (cc ? String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '');

function Node({ kind = '', role, name, meta, note }) {
  return (
    <li className={'route-node ' + kind}>
      <span className="route-role">{role}</span>
      {name && <span className="route-name">{name}</span>}
      {meta && <span className="route-meta">{meta}</span>}
      {note && <span className="route-note">{note}</span>}
    </li>
  );
}

function Hop({ hop, role, note }) {
  const where = [hop.country && `${flag(hop.country)} ${hop.country}`, hop.ip || t('route.noIp')].filter(Boolean).join(' · ');
  return <Node role={role} name={hop.nick || hop.fp.slice(0, 8)} meta={<span title={hop.fp}>{where}</span>} note={note} />;
}

// Rute dari perangkat ini: gerbang, relay tengah, lalu titik temu atau titik perkenalan.
function Circuit({ c, title, note }) {
  const last = c.hops.length - 1;
  const ends = c.kind === 'intro' ? 'introPoint' : 'rend';
  const peer = c.contact?.name || t('route.someone');
  return (
    <div className="card pad">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{title}</h3>
        {note && <span className="hint" style={{ fontSize: 12.5 }}>{note}</span>}
      </div>
      <ol className="route">
        <Node kind="me" role={t('route.me')} note={t('route.meNote')} />
        {c.hops.map((h, i) => {
          let role = 'middle';
          if (i === 0) role = h.bridge ? 'bridge' : 'guard';
          else if (i === last) role = ends;
          return <Hop key={h.fp + i} hop={h} role={t('route.' + role)} note={t(`route.${role}Note`)} />;
        })}
        {c.kind !== 'intro' && (
          <>
            <Node kind="hidden" role={t('route.theirHops', { name: peer })} note={t('route.theirHopsNote')} />
            <Node kind="peer" role={t(c.kind === 'in' ? 'route.contact' : 'route.peer')} name={c.contact?.name} note={t('route.peerNote')} />
          </>
        )}
      </ol>
    </div>
  );
}

const WHO = ['isp', 'guard', 'middle', 'rend', 'exit', 'e2e'];

export default function TorRoute({ cid, name, status, go }) {
  const [data, setData] = useState(null);
  const [at, setAt] = useState(null);
  const direct = status.network.direct;

  const load = useCallback(() => api.circuits().then((d) => { setData(d); setAt(Date.now()); }, () => setData({ available: false, circuits: [] })), []);
  useEffect(() => {
    if (direct) return undefined;
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [load, direct]);

  const back = () => go(cid ? { name: 'chat', id: cid } : { name: 'settings' });
  const circuits = data?.circuits || [];
  const out = circuits.filter((c) => c.kind === 'out' && (!cid || c.contact?.id === cid));
  const incoming = cid ? [] : circuits.filter((c) => c.kind === 'in');
  const intro = cid ? [] : circuits.filter((c) => c.kind === 'intro');
  const guards = [...new Map(circuits.map((c) => [c.hops[0].fp, c.hops[0]])).values()];
  const bridged = guards.some((g) => g.bridge);
  const guardIps = guards.map((g) => g.ip || g.nick || g.fp.slice(0, 8)).join(', ');

  let isp = t('route.ispNone');
  if (guards.length) isp = bridged ? t('route.ispBridge', { ip: guardIps, type: data.bridge }) : t('route.ispGuard', { ip: guardIps });

  let body;
  if (direct) body = <p className="hint">{t('route.direct')}</p>;
  else if (!data) body = <p className="hint">{t('route.loading')}</p>;
  else if (!data.available) body = <div className="warn-box">{t('route.unavailable')}</div>;
  else {
    body = (
      <>
        <div className="group">
          <h2 className="section-label">{t('route.sec.contacts')}</h2>
          {out.length
            ? out.map((c) => <Circuit key={c.id} c={c} title={t('route.toName', { name: c.contact.name })} />)
            : <p className="hint" style={{ margin: '0 4px' }}>{cid ? t('route.noContact', { name: name || t('route.someone') }) : t('route.noContacts')}</p>}
        </div>
        {incoming.length > 0 && (
          <div className="group">
            <h2 className="section-label">{t('route.sec.in')}</h2>
            {incoming.map((c) => <Circuit key={c.id} c={c} title={t('route.inTitle')} note={t('route.inNote')} />)}
          </div>
        )}
        {intro.length > 0 && (
          <div className="group">
            <h2 className="section-label">{t('route.sec.intro')}</h2>
            {intro.map((c, i) => <Circuit key={c.id} c={c} title={t('route.introTitle', { n: i + 1 })} note={t('route.introNote')} />)}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="screen">
      <div className="page narrow" style={{ gap: 18 }}>
        <div className="page-head">
          <button type="button" className="icon-btn" aria-label={t('common.back')} onClick={back}><Icon.back sw={2.2} /></button>
          <h1 className="h-display">{t('route.title')}</h1>
        </div>

        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--body-2)' }}>{t('route.intro')}</p>

        {!direct && (
          <div className="isp-box">
            <strong>{t('route.ispSees')}</strong>
            <span>{isp}</span>
          </div>
        )}

        {!direct && data && (
          <div className="row-between">
            <span className="hint" style={{ fontSize: 12.5 }}>{at && t('route.updated', { time: new Date(at).toLocaleTimeString(locale()) })}</span>
            <button type="button" className="btn" style={{ height: 36, fontSize: 13, padding: '0 12px', borderRadius: 10 }} onClick={load}>{t('route.refresh')}</button>
          </div>
        )}

        {body}

        <div className="group">
          <h2 className="section-label">{t('route.who')}</h2>
          <div className="card" style={{ overflow: 'hidden' }}>
            {WHO.map((k) => (
              <div key={k} className="who-row">
                <strong>{t(`route.w.${k}.t`)}</strong>
                <span>{t(`route.w.${k}.b`)}</span>
              </div>
            ))}
          </div>
          <p className="hint" style={{ margin: '0 4px', fontSize: 12.5 }}>{t('route.w.note')}</p>
        </div>
      </div>
    </div>
  );
}
