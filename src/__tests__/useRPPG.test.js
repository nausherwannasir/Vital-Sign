import { renderHook, act } from '@testing-library/react';
import useRPPG from '../hooks/useRPPG';

describe('useRPPG Hook', () => {
  let nowMs;

  beforeEach(() => {
    jest.useFakeTimers();
    nowMs = 0;
    // Deterministic 30 fps frame timestamps so fs measurement is reproducible.
    jest.spyOn(performance, 'now').mockImplementation(() => nowMs);
  });

  afterEach(() => {
    performance.now.mockRestore();
    jest.useRealTimers();
  });

  // Feed `count` frames of a clean RGB pulse at `bpm` (sampled at 30 fps).
  const feedPulse = (result, count, bpm = 72) => {
    const f = bpm / 60;
    act(() => {
      for (let i = 0; i < count; i += 1) {
        const pulse = Math.sin((2 * Math.PI * f * i) / 30);
        result.current.processFrame({
          r: 0.6 * (1 + 0.005 * pulse),
          g: 0.5 * (1 + 0.02 * pulse),
          b: 0.45 * (1 + 0.008 * pulse),
          brightness: 0.6,
        });
        nowMs += 1000 / 30;
      }
    });
  };

  it('initializes with defaults', () => {
    const { result } = renderHook(() => useRPPG());

    expect(result.current.bpm).toBeNull();
    expect(result.current.quality).toBe('Initializing...');
    expect(result.current.lighting).toBe('Initializing...');
    expect(result.current.isProcessing).toBe(false);
    expect(result.current.signalStrength).toBe(0);
  });

  it('updates lighting and shows collecting progress', () => {
    const { result } = renderHook(() => useRPPG());

    act(() => {
      result.current.processFrame({ r: 0.5, g: 0.5, b: 0.5, brightness: 0.1 });
    });

    expect(result.current.lighting).toBe('Poor lighting');
    expect(result.current.quality).toMatch(/collecting data/i);
  });

  it('computes a heart rate locally from a clean pulse', () => {
    const { result } = renderHook(() => useRPPG());
    feedPulse(result, result.current.maxBufferSize);
    expect(result.current.bufferSize).toBe(result.current.maxBufferSize);

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(result.current.bpm).not.toBeNull();
    expect(Math.abs(result.current.bpm - 72)).toBeLessThan(5);
    expect(['Fair signal', 'Good signal']).toContain(result.current.quality);
    expect(result.current.signalStrength).toBeGreaterThan(0);
  });

  it('reset clears buffered state', () => {
    const { result } = renderHook(() => useRPPG());
    feedPulse(result, result.current.maxBufferSize);

    act(() => {
      result.current.reset();
    });

    expect(result.current.bpm).toBeNull();
    expect(result.current.bufferSize).toBe(0);
    expect(result.current.signalStrength).toBe(0);
    expect(result.current.quality).toBe('Initializing...');
  });
});
