# Contactless Heart Rate Monitor

[![CI](https://github.com/nausherwannasir/Vital-Sign/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/nausherwannasir/Vital-Sign/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Estimate heart rate from a webcam using remote photoplethysmography (rPPG): the
camera picks up tiny colour changes in facial skin caused by blood flow, and the
backend turns that signal into beats per minute.

> **Educational project — not a medical device.** Readings are sensitive to
> lighting, motion, and camera quality. Do not use for diagnosis.

## How it works

```
Webcam ─► MediaPipe face mesh ─► average green channel over forehead/nose/chin
       ─► (per-frame samples buffered in the browser, ~5 s)
       ─► POST /predict {signal, fs}
       ─► detrend ─► 0.8–3.0 Hz band-pass ─► Welch PSD (zero-padded) ─► peak ─► BPM
```

The browser also measures the **actual** camera frame rate and sends it as `fs`,
because cameras rarely run at exactly 30 fps and a wrong rate scales the BPM
linearly. The FFT is zero-padded so the peak resolves to a fraction of a BPM
instead of snapping to coarse frequency bins.

## Quick start

### Docker (one command)

```bash
docker compose up --build
# open http://localhost:3000   (Flask serves both the API and the UI)
```

### Local development

Backend (Flask API, port 3000):

```bash
cd backend
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Frontend (Vite dev server, port 5173, proxies `/predict` → :3000):

```bash
cd my-vitals-ui
npm install
npm run dev
# open http://localhost:5173
```

To serve the production build from Flask instead, run `npm run build` in
`my-vitals-ui/`, then open the backend at http://localhost:3000.

## Project layout

```
backend/            Flask API
  app.py            /predict + /health, serves the built UI
  config.py         env-driven configuration
  tests/            pytest suite
my-vitals-ui/       React UI (Vite + Tailwind)
  src/components/   VideoFeed (camera + rPPG extraction), Dashboard
  src/hooks/        useRPPG (buffering, fps measurement, API calls)
Dockerfile.backend  multi-stage: build UI, serve from Flask
docker-compose.yml  single service
```

## API

`POST /predict` — body `{"signal": [float, ...], "fs": 30.0}` (`fs` optional,
defaults to 30). Returns `{"bpm": 72.5}` or `{"bpm": null, "message": "..."}`.
`GET /health` returns status and active config. See
[API_DOCUMENTATION.md](API_DOCUMENTATION.md) and [ARCHITECTURE.md](ARCHITECTURE.md).

## Testing

```bash
cd backend && pytest -q              # signal processing + API
cd my-vitals-ui && npm test          # hook + components
```

## License

MIT — see [LICENSE](LICENSE).
