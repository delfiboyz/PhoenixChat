// Huruf dibundel lokal: memuat Google Fonts akan membocorkan IP di luar Tor.
import '@fontsource/bricolage-grotesque/500.css';
import '@fontsource/bricolage-grotesque/700.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles.css';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

// Di Android, status bar dan keyboard sudah diberi ruang oleh aplikasi.
if (window.ChatLokalAndroid) document.documentElement.classList.add('is-android');

createRoot(document.getElementById('root')).render(<App />);
