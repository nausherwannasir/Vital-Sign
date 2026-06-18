# Contactless Heart Rate Monitor

[![CI](https://github.com/nausherwannasir/Vital-Sign/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/nausherwannasir/Vital-Sign/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Estimate heart rate from a webcam using remote photoplethysmography (rPPG) —
**entirely in your browser, with no server and no uploads.** The camera picks up
tiny colour changes in facial skin caused by blood flow, and the app turns that
signal into beats per minute.

> **Educational project — not a medical device.** Readings are sensitive to
> lighting, motion, and camera quality. Do not use for diagnosis.

## How it works

```
Webcam ─► MediaPipe face mesh ─► mean R/G/B over forehead/nose/chin (per frame)
       ─► POS pulse extraction (combines RGB; cancels motion/lighting)
       ─► detrend ─► Hann window ─► band-limited DFT (0.8–3.0 Hz) ─► peak ─► BPM
```

The app measures the **actual** camera frame rate (cameras rarely run at exactly
30 fps, and a wrong rate scales the BPM linearly), shows a rolling-median BPM so
the number stays steady, and does all of this on-device — the pulse signal never
leaves the browser.

## Quick start

```bash
npm install
npm run dev
# open http://localhost:5173
```

Production build:

```bash
npm run build     # outputs static files to dist/
npm run preview   # serve the build locally
```

## Deploy to Vercel

It's a static Vite app, so going live is one step:

```bash
npm i -g vercel
vercel            # first run links the project; later runs deploy
```

Or import the repo at [vercel.com](https://vercel.com): it auto-detects Vite
(build `npm run build`, output `dist`). `vercel.json` adds the SPA rewrite.
No environment variables, no backend.

## Project layout

```
index.html            Vite entry
src/
  components/         VideoFeed (camera + RGB extraction), Dashboard
  hooks/useRPPG.js    buffering, fps measurement, smoothing, quality heuristics
  lib/heartRate.js    POS extraction + BPM estimation (the former backend, in JS)
vercel.json           static SPA config
```

## Accuracy

rPPG from a webcam is sensitive to lighting, motion, skin tone, and camera
quality. Expect roughly **±3–8 BPM** when you are still and evenly lit, and
unreliable readings otherwise. The pipeline uses POS extraction with a single
dominant-frequency estimate, a rolling-median BPM, and a smoothed confidence —
a demonstrator, not a clinical instrument. See [ARCHITECTURE.md](ARCHITECTURE.md).

## Testing

```bash
npm test
```

## License

MIT — see [LICENSE](LICENSE).
