// Ikon garis dan komponen kecil yang dipakai di banyak layar.
import { useEffect, useRef } from 'react';
import { getLang, locale, t } from './i18n.js';

const Svg = ({ size = 22, sw = 2, children, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>{children}</svg>
);

export const Icon = {
  logo: (p) => <Svg {...p}><path d="M4 5h16v11H9l-5 4z" /><path d="M9 10h6" /></Svg>,
  device: (p) => <Svg {...p}><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 18v3" /></Svg>,
  key: (p) => <Svg {...p}><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9" /><path d="M17 6l3 3" /></Svg>,
  link: (p) => <Svg {...p}><circle cx="5" cy="12" r="2.5" /><circle cx="19" cy="12" r="2.5" /><path d="M7.5 12h9" /></Svg>,
  scan: (p) => <Svg {...p}><path d="M4 8V5a1 1 0 0 1 1-1h3" /><path d="M16 4h3a1 1 0 0 1 1 1v3" /><path d="M20 16v3a1 1 0 0 1-1 1h-3" /><path d="M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M4 12h16" /></Svg>,
  gear: (p) => <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></Svg>,
  search: (p) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Svg>,
  lock: (p) => <Svg {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Svg>,
  plus: (p) => <Svg {...p}><path d="M12 5v14" /><path d="M5 12h14" /></Svg>,
  back: (p) => <Svg {...p}><path d="M15 5l-7 7 7 7" /></Svg>,
  info: (p) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></Svg>,
  clip: (p) => <Svg {...p}><path d="M21 11.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.5 3.5 0 0 1 5 5l-8.6 8.6a2 2 0 0 1-2.8-2.8l7.9-7.9" /></Svg>,
  send: (p) => <Svg {...p}><path d="M5 12h13" /><path d="M13 6l6 6-6 6" /></Svg>,
  copy: (p) => <Svg {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a1 1 0 0 1 1-1h9" /></Svg>,
  share: (p) => <Svg {...p}><path d="M12 3v12" /><path d="M7 8l5-5 5 5" /><path d="M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" /></Svg>,
  onion: (p) => <Svg {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5.5" /><circle cx="12" cy="12" r="2" /></Svg>,
  download: (p) => <Svg {...p}><path d="M12 15V3" /><path d="M7 10l5 5 5-5" /><path d="M5 19h14" /></Svg>,
  upload: (p) => <Svg {...p}><path d="M12 3v12" /><path d="M7 8l5-5 5 5" /><path d="M5 19h14" /></Svg>,
  devices: (p) => <Svg {...p}><rect x="2" y="6" width="8" height="13" rx="1.5" /><rect x="14" y="4" width="8" height="15" rx="1.5" /><path d="M10 12h4" /></Svg>,
  file: (p) => <Svg {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></Svg>,
  chat: (p) => <Svg {...p}><path d="M4 5h16v11H9l-5 4z" /></Svg>,
  globe: (p) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z" /></Svg>,
};

export const AVATAR_COLORS = [
  { bg: '#F6D9C4', fg: '#6B3413' },
  { bg: '#D6E4F5', fg: '#1F3F6B' },
  { bg: '#DCEBD2', fg: '#2F5219' },
  { bg: '#EBD9EF', fg: '#5A2766' },
  { bg: '#F3E7B8', fg: '#5C4708' },
  { bg: '#D3ECEA', fg: '#1C5450' },
];

export function Avatar({ name, color = 0, size = 48, accent }) {
  const c = accent ? { bg: 'var(--accent)', fg: '#FFFFFF' } : AVATAR_COLORS[color % AVATAR_COLORS.length];
  return (
    <div className="avatar" style={{ width: size, height: size, background: c.bg, color: c.fg, fontSize: Math.round(size * 0.36) }} aria-hidden="true">
      {(name || '?').trim().charAt(0).toUpperCase()}
    </div>
  );
}

export function Modal({ title, children, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    el?.querySelector('input, button')?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    el?.addEventListener('keydown', onKey);
    return () => el?.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <h2 className="modal-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function formatBytes(n) {
  if (n == null) return '';
  const nf = new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 });
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${nf.format(n / 1024)} KB`;
  if (n < 1024 * 1024 * 1024) return `${nf.format(n / 1024 / 1024)} MB`;
  return `${nf.format(n / 1024 / 1024 / 1024)} GB`;
}

const pad = (n) => String(n).padStart(2, '0');
const sameDay = (a, b) => a.toDateString() === b.toDateString();
// Jam: 13.48 dalam bahasa Indonesia, 13:48 dalam bahasa Inggris.
export const clock = (ts) => {
  const d = new Date(ts);
  return `${pad(d.getHours())}${getLang() === 'en' ? ':' : '.'}${pad(d.getMinutes())}`;
};

export function listTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  if (sameDay(d, now)) return clock(ts);
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return t('day.yesterday');
  if (now - d < 6 * 864e5) return d.toLocaleDateString(locale(), { weekday: 'short' });
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

export function dayLabel(ts) {
  const d = new Date(ts);
  const now = new Date();
  if (sameDay(d, now)) return t('day.today');
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return t('day.yesterday');
  return d.toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

// Jembatan ke aplikasi Android (null di desktop/browser).
export const android = typeof window !== 'undefined' ? window.ChatLokalAndroid || null : null;

export function saveBlob(blob, name) {
  if (android) {
    // WebView tidak bisa mengunduh blob:, jadi isi file diserahkan ke Android.
    const reader = new FileReader();
    reader.onload = () => android.saveFile(name, blob.type || 'application/octet-stream', String(reader.result).split(',')[1] || '');
    reader.readAsDataURL(blob);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function downloadFile(url, name) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(t('err.attachRead'));
  saveBlob(await res.blob(), name);
}

export async function copyText(text) {
  if (android) {
    android.copyText(text);
    return;
  }
  await navigator.clipboard.writeText(text);
}
