import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { mkdirSync, readdirSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// MediaPipe FaceMesh fetches its wasm/data/loader assets at runtime via
// locateFile(). Copy them out of node_modules into public/mediapipe so they are
// served from our own origin (/mediapipe/face_mesh/...) instead of a CDN.
//
// This runs as a Vite plugin (buildStart) rather than an npm prebuild hook so it
// fires no matter how the build is invoked — including Vercel, which runs
// `vite build` directly and skips npm lifecycle hooks.
function copyMediaPipeAssets() {
  return {
    name: 'copy-mediapipe-assets',
    buildStart() {
      const srcDir = join(process.cwd(), 'node_modules', '@mediapipe', 'face_mesh');
      const destDir = join(process.cwd(), 'public', 'mediapipe', 'face_mesh');
      if (!existsSync(srcDir)) {
        this.warn(`@mediapipe/face_mesh not found at ${srcDir}; run "npm install".`);
        return;
      }
      rmSync(destDir, { recursive: true, force: true });
      mkdirSync(destDir, { recursive: true });
      let copied = 0;
      for (const file of readdirSync(srcDir)) {
        if (!/\.(js|wasm|data|binarypb)$/.test(file)) continue;
        copyFileSync(join(srcDir, file), join(destDir, file));
        copied += 1;
      }
      this.info?.(`copied ${copied} MediaPipe asset(s) to public/mediapipe/face_mesh`);
    },
  };
}

// Pure static SPA: all rPPG processing runs in the browser, so there is no API
// to proxy. `vite build` emits to dist/, which Vercel (or any static host)
// serves directly.
export default defineConfig({
  plugins: [copyMediaPipeAssets(), react(), tailwindcss()],
});
