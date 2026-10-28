import { describe, expect, it } from 'vitest';
import { OPEN_MIDI } from '../../src/guitar/geometry.js';
import { midiToHz, renderPluck } from '../../src/guitar/synth.js';

const SR = 48000;

/** Just enough of BaseAudioContext for renderPluck. */
const ctx = {
  sampleRate: SR,
  createBuffer: (_channels: number, length: number) => {
    const data = new Float32Array(length);
    return { getChannelData: () => data, length };
  },
} as unknown as BaseAudioContext;

const note = (midi: number) => renderPluck(ctx, midiToHz(midi), false).getChannelData(0);

/** Pitch by autocorrelation around the expected period, with interpolation. */
function pitch(data: Float32Array, expected: number): number {
  const start = Math.floor(0.3 * SR);
  const win = Math.floor(0.2 * SR);
  const minLag = Math.floor(SR / (expected * 1.1));
  const maxLag = Math.ceil(SR / (expected / 1.1));
  const ac: number[] = [];
  let bestLag = minLag;
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let i = 0; i < win; i++) s += data[start + i] * data[start + i + lag];
    ac[lag] = s;
    if (lag >= minLag && lag <= maxLag && s > ac[bestLag]) bestLag = lag;
  }
  const [a, b, c] = [ac[bestLag - 1], ac[bestLag], ac[bestLag + 1]];
  return SR / (bestLag + (0.5 * (a - c)) / (a - 2 * b + c));
}

/** Share of energy in the first `harmonics` harmonics, by Goertzel. */
function lowHarmonicShare(data: Float32Array, f0: number, harmonics: number): number {
  const start = Math.floor(0.05 * SR);
  const n = Math.floor(0.5 * SR);
  const power = (hz: number) => {
    const w = (2 * Math.PI * hz) / SR;
    let s1 = 0;
    let s2 = 0;
    for (let i = 0; i < n; i++) {
      const s = data[start + i] + 2 * Math.cos(w) * s1 - s2;
      s2 = s1;
      s1 = s;
    }
    return s1 * s1 + s2 * s2 - 2 * Math.cos(w) * s1 * s2;
  };
  let low = 0;
  let all = 0;
  for (let h = 1; h * f0 < 8000; h++) {
    const p = power(h * f0);
    all += p;
    if (h <= harmonics) low += p;
  }
  return low / all;
}

describe('plucked string synthesis', () => {
  it.each([...OPEN_MIDI, 68, 76, 83])('MIDI %i is in tune within 2 cents', (midi) => {
    const f = midiToHz(midi);
    const cents = 1200 * Math.log2(pitch(note(midi), f) / f);
    expect(Math.abs(cents)).toBeLessThan(2);
  });

  it.each([40, 52, 64, 76])('MIDI %i is loudness-matched and starts without a DC offset', (midi) => {
    const data = note(midi);
    const n = Math.floor(SR * 0.15);
    let energy = 0;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      energy += data[i] * data[i];
      sum += data[i];
    }
    expect(Math.sqrt(energy / n)).toBeGreaterThan(0.2);
    expect(Math.sqrt(energy / n)).toBeLessThan(0.35);
    expect(Math.abs(sum / n)).toBeLessThan(0.01);
  });

  it('gives a low E a steel-string balance: mostly low harmonics, not dull', () => {
    // A noise-burst pluck (the old synth) put only ~24% here and sounded
    // tinny; a pure plucked shape puts ~100% and sounds muffled.
    const share = lowHarmonicShare(note(40), midiToHz(40), 4);
    expect(share).toBeGreaterThan(0.5);
    expect(share).toBeLessThan(0.95);
  });
});
