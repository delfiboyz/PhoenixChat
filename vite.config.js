import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `npm run dev:ui` meneruskan /api ke server UI yang sedang berjalan
// (default profil a di port 5301; ubah dengan CHAT_API=http://127.0.0.1:5302).
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    proxy: { '/api': { target: process.env.CHAT_API || 'http://127.0.0.1:5301', changeOrigin: true } },
  },
});
