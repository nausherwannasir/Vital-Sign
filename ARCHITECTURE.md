# Architecture

A thin browser client does the camera and computer-vision work; a small Flask
service does the signal processing. They talk over one HTTP endpoint.

```
Browser (my-vitals-ui)                         Backend (Flask)
─────────────────────                          ───────────────
camera frame
  └► MediaPipe face mesh
       └► average green channel over 3 ROIs    POST /predict {signal, fs}
            (forehead, nose, chin)        ───►   detrend
       └► measure real fps from timestamps        4th-order Butterworth band-pass
       └► buffer ~150 samples (~5 s)              0.8–3.0 Hz (48–180 BPM)
                                                  Welch PSD, zero-padded FFT
  ◄─── {bpm} ───────────────────────────────     parabolic peak interpolation
  render Dashboard                                physiological range check (40–200)
```

## Why these choices

- **Green channel.** The green channel carries the strongest pulsatile signal in
  RGB video (haemoglobin absorption peaks near green).
- **Client measures `fs`.** Frame rate varies by device and load. The sampling
  rate scales BPM linearly (`bpm = peak_freq × 60`), so the client sends its
  measured fps instead of assuming 30.
- **Zero-padded FFT.** With a 150-sample buffer at 30 Hz, raw bin spacing is
  `30/150 = 0.2 Hz = 12 BPM`. Zero-padding to `FFT_LENGTH` (default 4096) plus
  parabolic interpolation resolves the peak to well under 1 BPM.
- **Stateless backend.** No storage, no sessions; each request is independent.
  Frames never leave the browser — only the 1-D green-channel signal is sent.

## Components

| Path | Responsibility |
|------|----------------|
| `my-vitals-ui/src/components/VideoFeed.jsx` | Camera, MediaPipe, ROI green/brightness extraction |
| `my-vitals-ui/src/hooks/useRPPG.js` | Buffering, fps measurement, quality heuristics, `/predict` calls |
| `my-vitals-ui/src/components/Dashboard.jsx` | BPM, signal-quality and lighting display |
| `backend/app.py` | `compute_bpm`, `/predict`, `/health`, serves the built UI |
| `backend/config.py` | Environment-driven configuration |

## Configuration

All tunables are environment variables (see `.env.example` and `config.py`):
filter band (`MIN_HR_FREQ`/`MAX_HR_FREQ`), `FILTER_ORDER`, `FFT_LENGTH`,
`MIN_SIGNAL_LENGTH`, default `SAMPLING_RATE`, `CORS_ORIGINS`, `LOG_LEVEL`.

## Limitations

rPPG accuracy depends heavily on lighting, skin tone, motion, and camera
quality. This implementation uses a single dominant-frequency estimate with no
motion compensation or signal-quality gating beyond a power threshold, so expect
noticeable error in non-ideal conditions. It is a demonstrator, not a medical
instrument.
