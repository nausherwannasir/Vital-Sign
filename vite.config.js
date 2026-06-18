import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Pure static SPA: all rPPG processing runs in the browser, so there is no API
// to proxy. `vite build` emits to dist/, which Vercel (or any static host)
// serves directly.
//
// MediaPipe FaceMesh fetches its wasm/data assets at runtime. The predev/prebuild
// hook (scripts/copy-mediapipe-assets.mjs) copies them into public/mediapipe so
// they're served from our own origin instead of a CDN — no runtime CDN dependency.
export default defineConfig({
  plugins: [react(), tailwindcss()],
});
