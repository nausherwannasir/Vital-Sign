# Architecture

Everything runs in the browser. The camera work, the computer vision, and the
signal processing all happen client-side — there is no server.

```
Browser
───────
camera frame
  └► MediaPipe face mesh
       └► mean R/G/B over 3 ROIs (forehead, nose, chin)
       └► measure real fps from frame timestamps
       └► buffer ~150 samples (~5 s)
  └► POS pulse extraction          (RGB → 1-D pulse; shared illumination cancels)
  └► linear detrend → Hann window
  └► band-limited DFT 0.8–3.0 Hz   (48–180 BPM), parabolic peak interpolation
  └► rolling-median BPM + EMA-smoothed confidence → Dashboard
```

## Why these choices

- **POS (Plane-Orthogonal-to-Skin).** Combines the R, G and B channels so a
  brightness change shared across channels projects to zero, leaving the
  chromatic pulse. Much more robust than using the green channel alone.
- **Client measures `fs`.** Frame rate varies by device and load, and `fs`
  scales the reported BPM linearly (`bpm = peak_freq × 60`), so the app uses the
  measured fps instead of assuming 30.
- **Band-limited DFT instead of FFT + Butterworth.** The frequency grid
  (~0.0025 Hz, ≈0.15 BPM) is set directly, so the peak resolves finely without a
  DSP library — and the band restriction replaces an explicit band-pass filter.
- **Smoothing for a steady display.** Signal strength is computed once a second
  and EMA-smoothed; the BPM is the rolling median of recent confident readings,
  so neither flickers frame to frame.
- **No server.** Frames and the pulse signal never leave the device, and deploy
  is a static build.

## Components

| Path | Responsibility |
|------|----------------|
| `src/components/VideoFeed.jsx` | Camera, MediaPipe, ROI mean R/G/B + brightness |
| `src/hooks/useRPPG.js` | Buffering, fps measurement, POS call, smoothing, quality |
| `src/components/Dashboard.jsx` | BPM, signal-quality and lighting display |
| `src/lib/heartRate.js` | POS extraction, BPM estimation, confidence |

## Limitations

rPPG accuracy depends heavily on lighting, skin tone, motion, and camera
quality. This implementation uses a single dominant-frequency estimate with no
explicit motion compensation beyond POS and a confidence threshold, so expect
noticeable error in non-ideal conditions. It is a demonstrator, not a medical
instrument.
