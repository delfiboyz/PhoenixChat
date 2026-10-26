import { useState } from 'react';
import { api } from '../api.js';
import { PhoenixLogo } from '../ui.jsx';
import { t } from '../i18n.js';

export default function Lock({ onUnlock }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    try {
      onUnlock(await api.unlock(pin));
    } catch (err) {
      setError(err.message);
      setPin('');
    }
  };
  return (
    <form className="lock" onSubmit={submit}>
      <div className="brand-mark" style={{ width: 64, height: 64, borderRadius: 18 }}><PhoenixLogo size={46} /></div>
      <h1 className="h-display" style={{ fontSize: 28 }}>{t('lock.title')}</h1>
      <label htmlFor="pin" className="hint">{t('lock.enter')}</label>
      <input id="pin" className="input" type="password" inputMode="numeric" autoFocus maxLength={8}
        value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
      {error && <span className="error" role="alert">{error}</span>}
      <button type="submit" className="btn btn-primary btn-lg" style={{ width: 240 }} disabled={pin.length < 4}>{t('lock.open')}</button>
    </form>
  );
}
