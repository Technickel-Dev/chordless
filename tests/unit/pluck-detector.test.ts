import { describe, expect, it } from 'vitest';
import { GUITAR, stringY } from '../../src/guitar/geometry.js';
import { PluckDetector, PLUCK_ZONE, TOUCH_MUTE_SECONDS } from '../../src/guitar/pluck-detector.js';

const X = 0; // over the sound hole
const DT = 1 / 72;

/** Moves the fingertip in a straight line over `frames` frames; returns plucked strings. */
function move(
  d: PluckDetector,
  from: [number, number],
  to: [number, number],
  frames: number,
  x = X,
): number[] {
  const plucked: number[] = [];
  for (let i = 1; i <= frames; i++) {
    const t = i / frames;
    d.update(x, from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, DT);
    for (let e = 0; e < d.count; e++) plucked.push(d.events[e].string);
  }
  return plucked;
}

const Z = GUITAR.stringZ;
const above = (s: number) => stringY(s, X) + 0.004;
const below = (s: number) => stringY(s, X) - 0.004;

describe('PluckDetector', () => {
  it('strums all six strings, low to high, on a down sweep', () => {
    const d = new PluckDetector();
    d.update(X, stringY(0, X) + 0.03, Z, DT);
    expect(move(d, [stringY(0, X) + 0.03, Z], [stringY(5, X) - 0.03, Z], 10)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('orders strings crossed in one frame by crossing time', () => {
    const d = new PluckDetector();
    d.update(X, stringY(5, X) - 0.03, Z, DT);
    expect(move(d, [stringY(5, X) - 0.03, Z], [stringY(0, X) + 0.03, Z], 1)).toEqual([5, 4, 3, 2, 1, 0]);
  });

  it('picks a single string', () => {
    const d = new PluckDetector();
    d.update(X, above(3), Z, DT);
    expect(move(d, [above(3), Z], [below(3), Z], 4)).toEqual([3]);
  });

  it('passes back over the strings without sounding when lifted', () => {
    const d = new PluckDetector();
    d.update(X, below(3), Z, DT);
    const lift = Z + PLUCK_ZONE.above + 0.02;
    const plucked = [
      ...move(d, [below(3), Z], [below(3), lift], 3),
      ...move(d, [below(3), lift], [above(0), lift], 6),
      ...move(d, [above(0), lift], [above(0), Z], 3),
    ];
    expect(plucked).toEqual([]);
  });

  it('does not re-pluck from jitter on a string', () => {
    const d = new PluckDetector();
    const y = stringY(2, X);
    const plucked: number[] = [];
    for (let i = 0; i < 60; i++) {
      d.update(X, y + Math.sin(i) * 0.0015, Z, DT);
      for (let e = 0; e < d.count; e++) plucked.push(d.events[e].string);
    }
    expect(plucked).toEqual([]);
  });

  it('damps a string the fingertip rests on', () => {
    const d = new PluckDetector();
    const frames = Math.ceil(TOUCH_MUTE_SECONDS / DT) + 2;
    for (let i = 0; i < frames; i++) d.update(X, stringY(4, X), Z, DT);
    expect(Array.from(d.damping)).toEqual([0, 0, 0, 0, 1, 0]);
  });

  it('is louder for faster strums', () => {
    const slow = new PluckDetector();
    const fast = new PluckDetector();
    slow.update(X, above(2), Z, DT);
    fast.update(X, above(2), Z, DT);
    move(slow, [above(2), Z], [below(2), Z], 20);
    const slowV = slow.events[0].velocity;
    move(fast, [above(2) + 0.04, Z], [below(2) - 0.04, Z], 2);
    expect(fast.events[0].velocity).toBeGreaterThan(slowV);
  });

  it('ignores sweeps away from the body', () => {
    const d = new PluckDetector();
    d.update(0.4, stringY(0, 0.4) + 0.03, Z, DT);
    expect(move(d, [stringY(0, 0.4) + 0.03, Z], [stringY(5, 0.4) - 0.03, Z], 10, 0.4)).toEqual([]);
  });
});
