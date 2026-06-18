import { computeBpm, posPulse } from '../lib/heartRate';

/** Build a pure sinusoid at `bpm` beats per minute, sampled at `fs` Hz. */
function sine(bpm, fs, seconds, amp = 0.1, offset = 0.5) {
  const f = bpm / 60;
  const n = Math.round(seconds * fs);
  return Array.from({ length: n }, (_, i) => offset + amp * Math.sin((2 * Math.PI * f * i) / fs));
}

describe('computeBpm', () => {
  it('recovers a clean 60 BPM signal', () => {
    const bpm = computeBpm(sine(60, 30, 5), 30);
    expect(bpm).not.toBeNull();
    expect(bpm).toBeGreaterThan(55);
    expect(bpm).toBeLessThan(65);
  });

  it('recovers 90 BPM within the physiological range', () => {
    const bpm = computeBpm(sine(90, 30, 10), 30);
    expect(bpm).not.toBeNull();
    expect(Math.abs(bpm - 90)).toBeLessThan(3);
  });

  it('recovers the low edge (48 BPM / 0.8 Hz)', () => {
    const bpm = computeBpm(sine(48, 30, 10), 30);
    expect(bpm).not.toBeNull();
    expect(bpm).toBeGreaterThan(40);
    expect(bpm).toBeLessThan(56);
  });

  it('recovers the high edge (180 BPM / 3 Hz)', () => {
    const bpm = computeBpm(sine(180, 30, 10), 30);
    expect(bpm).not.toBeNull();
    expect(bpm).toBeGreaterThan(170);
    expect(bpm).toBeLessThan(190);
  });

  it('resolves off-bin rates accurately (no coarse-bin snapping)', () => {
    for (const trueBpm of [67, 77, 83]) {
      const bpm = computeBpm(sine(trueBpm, 30, 5), 30);
      expect(bpm).not.toBeNull();
      expect(Math.abs(bpm - trueBpm)).toBeLessThan(3);
    }
  });

  it('scales linearly with the sampling rate', () => {
    const samples = sine(72, 30, 6); // 1.2 Hz -> 72 BPM at 30 fps
    expect(Math.abs(computeBpm(samples, 30) - 72)).toBeLessThan(3);
    // The same samples read as 24 fps -> 0.96 Hz -> ~57.6 BPM
    expect(Math.abs(computeBpm(samples, 24) - 57.6)).toBeLessThan(3);
  });

  it('returns null for a signal that is too short', () => {
    expect(computeBpm(new Array(25).fill(0.5), 30)).toBeNull();
  });

  it('returns null for an empty signal', () => {
    expect(computeBpm([], 30)).toBeNull();
  });

  it('returns null for a constant signal', () => {
    expect(computeBpm(new Array(150).fill(0.5), 30)).toBeNull();
  });

  it('returns null for an all-zero signal', () => {
    expect(computeBpm(new Array(150).fill(0), 30)).toBeNull();
  });

  it('throws on a non-positive sampling rate', () => {
    expect(() => computeBpm(new Array(150).fill(0.5), 0)).toThrow();
  });
});

describe('posPulse (RGB -> pulse)', () => {
  const fs = 30;
  const seconds = 8;
  const n = seconds * fs;
  const fPulse = 1.2; // 72 BPM
  const fFlicker = 2.0; // 120 BPM common illumination flicker

  // Skin model: a faint per-channel pulse plus a *stronger* illumination
  // flicker shared equally (fractionally) across R, G and B.
  function rgb() {
    const r = [];
    const g = [];
    const b = [];
    for (let i = 0; i < n; i++) {
      const t = i / fs;
      const pulse = Math.sin(2 * Math.PI * fPulse * t);
      const flicker = 0.05 * Math.sin(2 * Math.PI * fFlicker * t);
      r.push(0.6 * (1 + 0.005 * pulse + flicker));
      g.push(0.5 * (1 + 0.02 * pulse + flicker));
      b.push(0.45 * (1 + 0.008 * pulse + flicker));
    }
    return { r, g, b };
  }

  it('preserves signal length', () => {
    const { r, g, b } = rgb();
    expect(posPulse(r, g, b)).toHaveLength(n);
  });

  it('cancels common illumination flicker and recovers the pulse', () => {
    const { r, g, b } = rgb();
    const bpm = computeBpm(posPulse(r, g, b), fs);
    expect(bpm).not.toBeNull();
    expect(Math.abs(bpm - 72)).toBeLessThan(4);
  });

  it('beats green-only, which the flicker fools', () => {
    const { g } = rgb();
    const greenBpm = computeBpm(g, fs);
    // Green alone locks onto the stronger 120 BPM flicker, not the pulse.
    expect(Math.abs(greenBpm - 72)).toBeGreaterThan(10);
  });

  it('returns zeros for all-zero channels (no false pulse)', () => {
    const z = new Array(n).fill(0);
    const pulse = posPulse(z, z, z);
    expect(computeBpm(pulse, fs)).toBeNull();
  });
});
