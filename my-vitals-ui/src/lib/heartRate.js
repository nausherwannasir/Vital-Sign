/**
 * In-browser heart-rate estimation from an rPPG signal.
 *
 * This replaces the former Flask `/predict` endpoint: the pulse signal never
 * leaves the device. The pipeline mirrors the original server-side one —
 * detrend, restrict to the physiological band, find the spectral peak, refine
 * it to sub-bin accuracy — but uses a direct band-limited DFT instead of an
 * FFT + Butterworth filter, so the frequency resolution is set explicitly and
 * no DSP library is needed.
 */

export const MIN_SIGNAL_LENGTH = 50;
export const MIN_HR_FREQ = 0.8; // 48 BPM
export const MAX_HR_FREQ = 3.0; // 180 BPM
const MIN_BPM = 40;
const MAX_BPM = 200;
const FREQ_STEP = 0.0025; // Hz (~0.15 BPM grid resolution)
const FLAT_SIGNAL_STD = 1e-7; // reject constant / silent input
const EDGE_MARGIN = 5; // grid points scanned past the band so edges have neighbours

/** Remove the least-squares linear trend from a signal. */
function linearDetrend(signal) {
  const n = signal.length;
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumXY = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += signal[i];
    sumXX += i * i;
    sumXY += i * signal[i];
  }
  const denom = n * sumXX - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return signal.map((v, i) => v - (slope * i + intercept));
}

/** Standard deviation of a zero-trend signal (used to reject flat input). */
function std(signal) {
  const n = signal.length;
  let sumSq = 0;
  for (let i = 0; i < n; i++) sumSq += signal[i] * signal[i];
  return Math.sqrt(sumSq / n);
}

/**
 * Estimate heart rate (BPM) from a 1-D rPPG signal.
 *
 * @param {number[]} signal - per-frame pulse samples
 * @param {number} fs - sampling rate in Hz (measured camera frame rate)
 * @returns {number|null} BPM, or null when no reliable pulse is found
 */
export function computeBpm(signal, fs) {
  if (!(fs > 0)) {
    throw new Error('Sampling frequency must be positive');
  }
  if (!signal || signal.length < MIN_SIGNAL_LENGTH) {
    return null;
  }

  const detrended = linearDetrend(Array.from(signal, Number));
  if (std(detrended) < FLAT_SIGNAL_STD) {
    return null;
  }

  // Hann window to suppress spectral leakage from the finite buffer.
  const n = detrended.length;
  const windowed = detrended.map((v, i) => v * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))));

  // Direct DFT power on a fine grid across (a little past) the HR band.
  const fStart = MIN_HR_FREQ - EDGE_MARGIN * FREQ_STEP;
  const fEnd = MAX_HR_FREQ + EDGE_MARGIN * FREQ_STEP;
  const freqs = [];
  const power = [];
  for (let f = fStart; f <= fEnd + 1e-9; f += FREQ_STEP) {
    let re = 0;
    let im = 0;
    const w = (2 * Math.PI * f) / fs;
    for (let i = 0; i < n; i++) {
      re += windowed[i] * Math.cos(w * i);
      im += windowed[i] * Math.sin(w * i);
    }
    freqs.push(f);
    power.push(re * re + im * im);
  }

  // Peak search is restricted to the true band; interpolation may use the
  // margin points on either side.
  let peak = -1;
  let peakPower = -Infinity;
  for (let k = 0; k < freqs.length; k++) {
    if (freqs[k] < MIN_HR_FREQ || freqs[k] > MAX_HR_FREQ) continue;
    if (power[k] > peakPower) {
      peakPower = power[k];
      peak = k;
    }
  }
  if (peak < 0) return null;

  // Parabolic interpolation refines the peak to sub-grid accuracy.
  let peakFreq = freqs[peak];
  if (peak > 0 && peak < power.length - 1) {
    const y0 = power[peak - 1];
    const y1 = power[peak];
    const y2 = power[peak + 1];
    const denom = y0 - 2 * y1 + y2;
    if (denom !== 0) {
      peakFreq += (0.5 * (y0 - y2) * FREQ_STEP) / denom;
    }
  }

  const bpm = peakFreq * 60;
  if (bpm < MIN_BPM || bpm > MAX_BPM) return null;
  return Math.round(bpm * 10) / 10;
}
