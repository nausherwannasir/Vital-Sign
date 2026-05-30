import { renderHook, act, waitFor } from '@testing-library/react';
import useRPPG from '../hooks/useRPPG';

// Mock fetch
global.fetch = jest.fn();

describe('useRPPG Hook', () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  beforeEach(() => {
    fetch.mockClear();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  const fillSignalBuffer = (result, generator) => {
    act(() => {
      for (let i = 0; i < result.current.maxBufferSize; i += 1) {
        result.current.processFrame(generator(i), 0.6);
      }
    });
  };

  it('initializes with current hook defaults', () => {
    const { result } = renderHook(() => useRPPG());

    expect(result.current.bpm).toBeNull();
    expect(result.current.quality).toBe('Initializing...');
    expect(result.current.lighting).toBe('Initializing...');
    expect(result.current.isProcessing).toBe(false);
    expect(result.current.signalStrength).toBe(0);
  });

  it('updates lighting and quality while collecting data', () => {
    const { result } = renderHook(() => useRPPG());

    act(() => {
      result.current.processFrame(0.55, 0.1);
    });

    expect(result.current.lighting).toBe('Poor lighting');
    expect(result.current.quality).toMatch(/collecting data/i);
  });

  it('classifies stable pulse signal as fair or good after buffer is full', () => {
    const { result } = renderHook(() => useRPPG());
    fillSignalBuffer(result, (i) => 0.55 + Math.sin(i / 4) * 0.01);

    expect(result.current.bufferSize).toBe(result.current.maxBufferSize);
    expect(['Fair signal', 'Good signal']).toContain(result.current.quality);
    expect(result.current.signalStrength).toBeGreaterThan(0);
  });

  it('computes heart rate and updates bpm from API response', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ bpm: 72.34 }),
    });

    const { result } = renderHook(() => useRPPG());
    fillSignalBuffer(result, (i) => 0.55 + Math.sin(i / 4) * 0.01);

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(result.current.bpm).toBe(72.3);
    });
    expect(result.current.quality).toBe('Heart rate detected');
  });

  it('reset clears buffered state', () => {
    const { result } = renderHook(() => useRPPG());
    fillSignalBuffer(result, (i) => 0.55 + Math.sin(i / 5) * 0.01);

    act(() => {
      result.current.reset();
    });

    expect(result.current.bpm).toBeNull();
    expect(result.current.bufferSize).toBe(0);
    expect(result.current.signalStrength).toBe(0);
    expect(result.current.quality).toBe('Initializing...');
  });
});
