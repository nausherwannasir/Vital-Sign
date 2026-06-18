// Copy MediaPipe FaceMesh runtime assets (wasm/data/loader) out of node_modules
// into public/ so they are served from our own origin instead of a CDN. Runs
// automatically via the predev/prebuild npm hooks, so the app is self-contained
// in dev and in production (e.g. Vercel) without committing ~16 MB of binaries.

import { mkdirSync, readdirSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const srcDir = join(process.cwd(), 'node_modules', '@mediapipe', 'face_mesh');
const destDir = join(process.cwd(), 'public', 'mediapipe', 'face_mesh');

if (!existsSync(srcDir)) {
  console.error(
    `[copy-mediapipe-assets] ${srcDir} not found — run "npm install" first.`
  );
  process.exit(1);
}

// Assets FaceMesh fetches at runtime via locateFile(). Skip package metadata.
const ASSET_PATTERN = /\.(js|wasm|data|binarypb)$/;

rmSync(destDir, { recursive: true, force: true });
mkdirSync(destDir, { recursive: true });

let copied = 0;
for (const file of readdirSync(srcDir)) {
  if (!ASSET_PATTERN.test(file)) continue;
  copyFileSync(join(srcDir, file), join(destDir, file));
  copied += 1;
}

console.log(`[copy-mediapipe-assets] Copied ${copied} file(s) to public/mediapipe/face_mesh`);
