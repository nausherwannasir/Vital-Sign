import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Pure static SPA: all rPPG processing runs in the browser, so there is no API
// to proxy. `vite build` emits to dist/, which Vercel (or any static host)
// serves directly.
export default defineConfig({
  plugins: [react(), tailwindcss()],
});
