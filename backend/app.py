"""
Contactless Heart Rate Monitor — backend API.

A small Flask service that estimates heart rate from an rPPG signal (the average
green-channel value of facial skin, sampled per video frame). The browser does
the camera work and face tracking; this server does the signal processing.
"""

import os
import logging

import numpy as np
from scipy.signal import detrend, butter, filtfilt, welch
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

from config import get_config

load_dotenv()
config = get_config()

logging.basicConfig(
    level=config.LOG_LEVEL, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# The frontend is served from the built React app. Override with FRONTEND_DIST
# (used by Docker); default is the local Vite build output.
FRONTEND_DIST = os.getenv(
    "FRONTEND_DIST",
    os.path.join(os.path.dirname(__file__), "..", "my-vitals-ui", "dist"),
)

app = Flask(__name__, static_folder=None)
CORS(app, origins=config.CORS_ORIGINS)

# Plausible camera frame rates. Anything outside this is almost certainly a
# client bug, and a wrong sampling rate scales the BPM linearly.
MIN_FS = 5.0
MAX_FS = 120.0

# Upper bound on /predict input length (~5.5 min at 30 Hz). Caps memory use
# from unbounded client payloads.
MAX_SIGNAL_LENGTH = 10000


def compute_bpm(signal, fs=config.SAMPLING_RATE):
    """Estimate heart rate (BPM) from an rPPG signal.

    Args:
        signal: Per-frame green-channel values.
        fs: Sampling rate in Hz (frames per second the signal was captured at).

    Returns:
        Heart rate in BPM, or None if no reliable pulse is found.

    Raises:
        ValueError: If ``fs`` is not positive.
    """
    if fs <= 0:
        raise ValueError("Sampling frequency must be positive")

    if len(signal) < config.MIN_SIGNAL_LENGTH:
        logger.warning("Signal too short: %d < %d", len(signal), config.MIN_SIGNAL_LENGTH)
        return None

    sig = detrend(np.asarray(signal, dtype=np.float64))

    # Band-pass to the physiological heart-rate range (0.8–3.0 Hz ≈ 48–180 BPM).
    nyquist = fs / 2
    low = config.MIN_HR_FREQ / nyquist
    high = min(config.MAX_HR_FREQ / nyquist, 0.99)
    if low <= 0 or low >= high:
        logger.warning("Invalid filter band for fs=%.1f Hz", fs)
        return None
    b, a = butter(config.FILTER_ORDER, [low, high], btype="band")
    sig = filtfilt(b, a, sig)

    # Power spectrum via Welch. We zero-pad the FFT (nfft >> nperseg) so the peak
    # is resolved to a fraction of a BPM. Without padding, the bin spacing is
    # fs/N — e.g. 0.2 Hz (12 BPM!) for a 150-sample, 30 Hz buffer, which would
    # quantise every reading to a multiple of 12 BPM.
    nperseg = len(sig)
    nfft = max(nperseg, config.FFT_LENGTH)
    freqs, psd = welch(sig, fs, nperseg=nperseg, nfft=nfft)

    band = (freqs >= config.MIN_HR_FREQ) & (freqs <= config.MAX_HR_FREQ)
    if not np.any(band):
        return None
    band_freqs, band_psd = freqs[band], psd[band]

    # Reject flat / silent signals (constant or zero input).
    if band_psd.max() < config.MIN_PEAK_POWER:
        logger.info("No significant power in heart-rate band")
        return None

    peak_freq = _interpolate_peak(band_freqs, band_psd)
    bpm = float(peak_freq * 60)
    logger.info("Computed BPM: %.1f (fs=%.1f Hz)", bpm, fs)
    return bpm


def _interpolate_peak(freqs, psd):
    """Refine the spectral peak to sub-bin accuracy via parabolic interpolation."""
    k = int(np.argmax(psd))
    if 0 < k < len(psd) - 1:
        y0, y1, y2 = psd[k - 1], psd[k], psd[k + 1]
        denom = y0 - 2 * y1 + y2
        if denom != 0:
            offset = 0.5 * (y0 - y2) / denom
            return freqs[k] + offset * (freqs[1] - freqs[0])
    return freqs[k]


@app.route("/predict", methods=["POST"])
def predict():
    """Estimate heart rate from a posted rPPG signal.

    Body: ``{"signal": [float, ...], "fs": float (optional)}``.
    Returns ``{"bpm": float}``, or ``{"bpm": null, "message": str}`` when no
    reliable pulse is detected.
    """
    if not request.is_json:
        return jsonify({"error": "Content-Type must be application/json"}), 400

    data = request.get_json(silent=True)
    if data is None:
        return jsonify({"error": "Invalid JSON payload"}), 400

    signal = data.get("signal")
    if signal is None:
        return jsonify({"error": "Missing signal field"}), 400
    if not isinstance(signal, list):
        return jsonify({"error": "Signal must be an array"}), 400
    if len(signal) < config.MIN_SIGNAL_LENGTH:
        return (
            jsonify(
                {
                    "error": f"Signal too short: need >= {config.MIN_SIGNAL_LENGTH} samples",
                    "received": len(signal),
                }
            ),
            400,
        )
    if len(signal) > MAX_SIGNAL_LENGTH:
        return (
            jsonify(
                {
                    "error": f"Signal too long: max {MAX_SIGNAL_LENGTH} samples",
                    "received": len(signal),
                }
            ),
            400,
        )
    try:
        signal = [float(x) for x in signal]
    except (ValueError, TypeError):
        return jsonify({"error": "Signal values must be numeric"}), 400

    # Sampling rate is measured client-side from real frame timestamps; the
    # camera rarely runs at exactly the nominal 30 fps.
    fs = data.get("fs", config.SAMPLING_RATE)
    try:
        fs = float(fs)
    except (ValueError, TypeError):
        return jsonify({"error": "fs must be numeric"}), 400
    if not MIN_FS <= fs <= MAX_FS:
        return jsonify({"error": f"fs must be between {MIN_FS} and {MAX_FS} Hz"}), 400

    try:
        bpm = compute_bpm(signal, fs=fs)
    except Exception:  # noqa: BLE001 — never 500 on a math edge case; report no-signal.
        logger.exception("compute_bpm failed")
        return jsonify({"bpm": None, "message": "Could not process signal"})

    if bpm is None:
        return jsonify({"bpm": None, "message": "No valid heart rate detected"})
    if not 40 <= bpm <= 200:
        return jsonify(
            {"bpm": None, "message": f"Detected BPM ({bpm:.1f}) outside physiological range"}
        )
    return jsonify({"bpm": round(bpm, 1)})


@app.route("/health", methods=["GET"])
def health_check():
    """Liveness probe with the active signal-processing configuration."""
    return jsonify(
        {
            "status": "healthy",
            "config": {
                "min_signal_length": config.MIN_SIGNAL_LENGTH,
                "default_sampling_rate": config.SAMPLING_RATE,
                "frequency_range_hz": [config.MIN_HR_FREQ, config.MAX_HR_FREQ],
            },
        }
    )


@app.route("/", defaults={"path": "index.html"})
@app.route("/<path:path>")
def serve_frontend(path):
    """Serve the built React SPA, falling back to index.html for client routes."""
    if os.path.isfile(os.path.join(FRONTEND_DIST, path)):
        return send_from_directory(FRONTEND_DIST, path)
    if os.path.isfile(os.path.join(FRONTEND_DIST, "index.html")):
        return send_from_directory(FRONTEND_DIST, "index.html")
    return jsonify({"error": "Frontend not built. Run `npm run build` in my-vitals-ui."}), 404


@app.after_request
def add_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Permissions-Policy"] = "camera=(self)"
    return response


if __name__ == "__main__":
    logger.info("Starting Heart Rate Monitor on http://%s:%s", config.HOST, config.PORT)
    app.run(host=config.HOST, port=config.PORT, debug=config.DEBUG, threaded=True)
