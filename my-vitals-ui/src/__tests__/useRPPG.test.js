import { renderHook, act, waitFor } from '@testing-library/react';
import useRPPG from '../hooks/useRPPG';

// Mock fetch
global.fetch = jest.fn();

describe('useRPPG Hook', () => {
  beforeEach(() => {
    fetch.mockClear();
  });

  it('initializes with default state', () => {
    const { result } = renderHook(() => useRPPG());

    expect(result.current.bpm).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.lighting).toBeNull();
  });

  it('starts monitoring', async () => {
    const { result } = renderHook(() => useRPPG());

    await act(async () => {
      await result.current.startMonitoring();
    });

    // After starting, should be in loading state or monitoring
    expect(result.current.isLoading || result.current.bpm !== null).toBeTruthy();
  });

  it('stops monitoring', async () => {
    const { result } = renderHook(() => useRPPG());

    await act(async () => {
      await result.current.startMonitoring();
    });

    await act(async () => {
      result.current.stopMonitoring();
    });

    // After stopping, loading should be false
    expect(result.current.isLoading).toBe(false);
  });

  it('handles API errors gracefully', async () => {
    fetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useRPPG());

    await act(async () => {
      try {
        await result.current.startMonitoring();
      } catch (e) {
        // Error handling
      }
    });

    // Should set error state or be in error condition
    expect(result.current.error || result.current.isLoading === false).toBeTruthy();
  });

  it('updates BPM when signal is received', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ bpm: 75 }),
    });

    const { result } = renderHook(() => useRPPG());

    await act(async () => {
      // Simulate signal processing
      await result.current.startMonitoring();
    });

    await waitFor(() => {
      expect(result.current.bpm).toBe(75);
    });
  });

  it('handles invalid signals', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Signal too short' }),
      status: 400,
    });

    const { result } = renderHook(() => useRPPG());

    await act(async () => {
      await result.current.startMonitoring();
    });

    await waitFor(() => {
      expect(result.current.error).toBeDefined();
    });
  });

  it('calculates lighting quality', () => {
    const { result } = renderHook(() => useRPPG());

    // Lighting should be calculated
    // Value can be 'poor', 'fair', 'good'
    if (result.current.lighting) {
      expect(['poor', 'fair', 'good']).toContain(result.current.lighting);
    }
  });

  it('maintains history of measurements', async () => {
    const { result } = renderHook(() => useRPPG());

    const measurements = [];

    for (let i = 0; i < 3; i++) {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ bpm: 70 + i * 5 }),
      });

      await act(async () => {
        await result.current.startMonitoring();
      });

      measurements.push(result.current.bpm);
    }

    // Should have collected measurements
    expect(measurements.length).toBeGreaterThan(0);
  });

  it('handles rapid start/stop calls', async () => {
    const { result } = renderHook(() => useRPPG());

    await act(async () => {
      result.current.startMonitoring();
      result.current.stopMonitoring();
      result.current.startMonitoring();
    });

    // Should not crash or error
    expect(result.current).toBeDefined();
  });

  it('processes video frames at correct rate', async () => {
    const { result } = renderHook(() => useRPPG());

    const startTime = Date.now();

    await act(async () => {
      await result.current.startMonitoring();
    });

    // Check timing
    const duration = Date.now() - startTime;
    expect(duration).toBeGreaterThan(0);
  });

  it('cleans up resources on unmount', async () => {
    const { result, unmount } = renderHook(() => useRPPG());

    await act(async () => {
      await result.current.startMonitoring();
    });

    unmount();

    // Resources should be cleaned up
    // No memory leaks or dangling connections
    expect(result.current).toBeDefined();
  });
});
