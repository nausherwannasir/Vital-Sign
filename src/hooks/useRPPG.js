import { useState, useEffect, useRef, useCallback } from 'react';
import { posPulse, analyzePulse } from '../lib/heartRate';

const CONFIG = {
  BUFFER_SIZE: 150, // ~5 s at 30 fps
  UPDATE_INTERVAL: 1000, // ms between heart-rate estimates
  MIN_BRIGHTNESS: 0.2,
  DEFAULT_FPS: 30,
  STRENGTH_SMOOTHING: 0.3, // EMA weight for the signal-strength bar (lower = steadier)
  MIN_CONFIDENCE: 0.2, // readings below this are treated as unreliable
  BPM_MEMORY_MS: 10000, // rolling-median window that steadies the displayed BPM
};

/**
 * Estimate the capture frame rate from frame timestamps (ms).
 * Falls back to the nominal rate when timestamps are degenerate.
 */
function measureSamplingRate(timestamps) {
  if (timestamps.length < 2) return CONFIG.DEFAULT_FPS;
  const elapsedSec = (timestamps[timestamps.length - 1] - timestamps[0]) / 1000;
  if (elapsedSec <= 0) return CONFIG.DEFAULT_FPS;
  const fps = (timestamps.length - 1) / elapsedSec;
  return Math.min(120, Math.max(5, fps));
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * rPPG state machine: buffers per-frame RGB means, then once a second derives a
 * pulse signal (POS), estimates BPM, and smooths both the heart rate (rolling
 * median) and the signal-strength bar (EMA) so the UI reads steadily instead of
 * flickering frame to frame. All processing is on-device — nothing is uploaded.
 */
export default function useRPPG() {
  const [bpm, setBpm] = useState(null);
  const [quality, setQuality] = useState('Initializing...');
  const [lighting, setLighting] = useState('Initializing...');
  const [isProcessing, setIsProcessing] = useState(false);
  const [signalStrength, setSignalStrength] = useState(0);
  const [bufferSize, setBufferSize] = useState(0);

  const rRef = useRef([]);
  const gRef = useRef([]);
  const bRef = useRef([]);
  const tRef = useRef([]);
  const strengthRef = useRef(0);
  const bpmHistoryRef = useRef([]); // [{ bpm, t }]
  const lastUpdateRef = useRef(0);

  const processFrame = useCallback((frame) => {
    const { r, g, b, brightness } = frame;
    setLighting(brightness < CONFIG.MIN_BRIGHTNESS ? 'Poor lighting' : 'Good lighting');

    rRef.current.push(r);
    gRef.current.push(g);
    bRef.current.push(b);
    tRef.current.push(performance.now());
    if (rRef.current.length > CONFIG.BUFFER_SIZE) {
      rRef.current.shift();
      gRef.current.shift();
      bRef.current.shift();
      tRef.current.shift();
    }
    setBufferSize(rRef.current.length);

    if (rRef.current.length < CONFIG.BUFFER_SIZE) {
      setQuality(`Collecting data... ${rRef.current.length}/${CONFIG.BUFFER_SIZE}`);
    }
  }, []);

  const computeHeartRate = useCallback(() => {
    const now = Date.now();
    if (now - lastUpdateRef.current < CONFIG.UPDATE_INTERVAL) return;
    if (rRef.current.length < CONFIG.BUFFER_SIZE) return;
    lastUpdateRef.current = now;

    // The camera rarely runs at exactly 30 fps, and a wrong fs scales BPM
    // linearly, so measure it from the real frame timestamps.
    const fs = measureSamplingRate(tRef.current);
    const pulse = posPulse(rRef.current, gRef.current, bRef.current);
    const { bpm: reading, confidence } = analyzePulse(pulse, fs);

    // EMA-smooth the strength bar so it settles instead of jittering.
    const target = reading !== null ? confidence * 100 : 0;
    strengthRef.current =
      CONFIG.STRENGTH_SMOOTHING * target + (1 - CONFIG.STRENGTH_SMOOTHING) * strengthRef.current;
    setSignalStrength(strengthRef.current);

    // Keep a short rolling history of confident readings; show their median so
    // a single noisy estimate can't make the number jump.
    const history = bpmHistoryRef.current;
    if (reading !== null && confidence >= CONFIG.MIN_CONFIDENCE) {
      history.push({ bpm: reading, t: now });
    }
    while (history.length && now - history[0].t > CONFIG.BPM_MEMORY_MS) {
      history.shift();
    }
    setBpm(history.length ? Math.round(median(history.map((h) => h.bpm)) * 10) / 10 : null);

    if (confidence < CONFIG.MIN_CONFIDENCE) {
      setQuality('Weak signal - hold still');
    } else if (confidence < 0.4) {
      setQuality('Fair signal');
    } else {
      setQuality('Good signal');
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(computeHeartRate, CONFIG.UPDATE_INTERVAL);
    return () => clearInterval(interval);
  }, [computeHeartRate]);

  const reset = useCallback(() => {
    rRef.current = [];
    gRef.current = [];
    bRef.current = [];
    tRef.current = [];
    strengthRef.current = 0;
    bpmHistoryRef.current = [];
    lastUpdateRef.current = 0;
    setBpm(null);
    setQuality('Initializing...');
    setLighting('Initializing...');
    setSignalStrength(0);
    setBufferSize(0);
    setIsProcessing(false);
  }, []);

  return {
    bpm,
    quality,
    lighting,
    isProcessing,
    signalStrength,
    bufferSize,
    maxBufferSize: CONFIG.BUFFER_SIZE,
    processFrame,
    reset,
  };
}
