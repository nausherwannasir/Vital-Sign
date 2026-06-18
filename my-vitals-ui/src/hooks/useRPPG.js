import { useState, useEffect, useRef, useCallback } from 'react';

const CONFIG = {
  BUFFER_SIZE: 150,
  UPDATE_INTERVAL: 1000,
  MIN_BRIGHTNESS: 0.2,
  MIN_SIGNAL_STD: 0.0002,
  API_TIMEOUT: 5000,
  DEFAULT_FPS: 30,
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

export default function useRPPG() {
  const [bpm, setBpm] = useState(null);
  const [quality, setQuality] = useState('Initializing...');
  const [lighting, setLighting] = useState('Initializing...');
  const [isProcessing, setIsProcessing] = useState(false);
  const [signalStrength, setSignalStrength] = useState(0);
  const [bufferSize, setBufferSize] = useState(0);

  const greenBufferRef = useRef([]);
  const timestampBufferRef = useRef([]);
  const processingRef = useRef(false);
  const lastUpdateRef = useRef(0);

  const detrend = useCallback((signal) => {
    if (!signal || signal.length === 0) return [];
    const mean = signal.reduce((sum, val) => sum + val, 0) / signal.length;
    return signal.map((val) => val - mean);
  }, []);

  const calculateSignalQuality = useCallback((signal) => {
    if (signal.length < 20) return 0;
    const std = Math.sqrt(signal.reduce((sum, val) => sum + val * val, 0) / signal.length);
    return Math.min(100, Math.max(0, std * 10000));
  }, []);

  const processFrame = useCallback(
    (greenValue, brightness) => {
      setLighting(brightness < CONFIG.MIN_BRIGHTNESS ? 'Poor lighting' : 'Good lighting');

      greenBufferRef.current.push(greenValue);
      timestampBufferRef.current.push(performance.now());
      if (greenBufferRef.current.length > CONFIG.BUFFER_SIZE) {
        greenBufferRef.current.shift();
        timestampBufferRef.current.shift();
      }
      setBufferSize(greenBufferRef.current.length);

      const currentSignal = greenBufferRef.current.slice(-30);
      const detrendedSignal = detrend(currentSignal);
      const strength = calculateSignalQuality(detrendedSignal);
      setSignalStrength(strength);

      if (greenBufferRef.current.length < CONFIG.BUFFER_SIZE) {
        setQuality(`Collecting data... ${greenBufferRef.current.length}/${CONFIG.BUFFER_SIZE}`);
      } else if (strength < 5) {
        setQuality('Weak signal - stay still');
      } else if (strength < 20) {
        setQuality('Fair signal');
      } else {
        setQuality('Good signal');
      }
    },
    [calculateSignalQuality, detrend]
  );

  const computeHeartRate = useCallback(async () => {
    const now = Date.now();
    if (now - lastUpdateRef.current < CONFIG.UPDATE_INTERVAL || processingRef.current) {
      return;
    }
    if (greenBufferRef.current.length < CONFIG.BUFFER_SIZE) {
      return;
    }

    processingRef.current = true;
    setIsProcessing(true);
    lastUpdateRef.current = now;

    try {
      const signal = detrend([...greenBufferRef.current]);
      const signalStd = Math.sqrt(signal.reduce((sum, val) => sum + val * val, 0) / signal.length);

      if (signalStd < CONFIG.MIN_SIGNAL_STD) {
        setBpm(null);
        setQuality('Signal too weak - check lighting and remain still');
        return;
      }

      // Measure the real capture rate — the camera rarely runs at exactly
      // 30 fps, and a wrong fs scales the reported BPM linearly.
      const fs = measureSamplingRate(timestampBufferRef.current);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT);

      const response = await fetch('/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal, fs }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('API error:', errorData);
        setBpm(null);
        setQuality(`Error: ${errorData.error || 'Unknown error'}`);
        return;
      }

      const result = await response.json();

      if (result.bpm !== null && result.bpm !== undefined) {
        setBpm(Math.round(result.bpm * 10) / 10);
        setQuality('Heart rate detected');
      } else {
        setBpm(null);
        setQuality(result.message || 'No heart rate detected');
      }
    } catch (error) {
      console.error('Heart rate computation failed:', error);
      setBpm(null);

      if (error.name === 'AbortError') {
        setQuality('Request timeout');
      } else if (error.message.includes('fetch')) {
        setQuality('Connection error');
      } else {
        setQuality('Processing error');
      }
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
    }
  }, [detrend]);

  useEffect(() => {
    const interval = setInterval(computeHeartRate, CONFIG.UPDATE_INTERVAL);
    return () => clearInterval(interval);
  }, [computeHeartRate]);

  const reset = useCallback(() => {
    greenBufferRef.current = [];
    timestampBufferRef.current = [];
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
