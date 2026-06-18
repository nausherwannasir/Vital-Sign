# API Reference

Base URL: `http://localhost:3000`. No authentication. All bodies are JSON.

## POST /predict

Estimate heart rate from an rPPG signal.

**Request body**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `signal` | `number[]` | yes | Per-frame green-channel values. Min `MIN_SIGNAL_LENGTH` (50) samples; ~150 recommended (~5 s). |
| `fs` | `number` | no | Measured capture rate in Hz. Default `30`. Must be `5 ≤ fs ≤ 120`. |

```json
{ "signal": [0.123, 0.145, 0.132], "fs": 29.7 }
```

**Responses**

`200` — pulse detected:
```json
{ "bpm": 72.5 }
```

`200` — no reliable pulse (too weak, flat, or outside 40–200 BPM):
```json
{ "bpm": null, "message": "No valid heart rate detected" }
```

`400` — bad request (with `error`): non-JSON body, missing/invalid `signal`,
signal too short, non-numeric values, or `fs` out of range / non-numeric.

```bash
curl -X POST http://localhost:3000/predict \
  -H 'Content-Type: application/json' \
  -d '{"signal": [/* >=50 numbers */], "fs": 30}'
```

## GET /health

```json
{
  "status": "healthy",
  "config": {
    "min_signal_length": 50,
    "default_sampling_rate": 30,
    "frequency_range_hz": [0.8, 3.0]
  }
}
```

## Notes

- The browser measures `fs` from real frame timestamps; sending an accurate `fs`
  is what keeps the BPM correct, since rate scales the result linearly.
- Frames stay in the browser — only the 1-D signal is transmitted. The server is
  stateless and stores nothing.
