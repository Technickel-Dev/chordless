import { describe, expect, it } from 'vitest';
import { GUITAR, stringY } from '../../src/guitar/geometry.js';
import {
  PluckDetector,
  PLUCK_ZONE,
  TOUCH_MUTE_SECONDS,
  TRACKING_GAP_SECONDS,
} from '../../src/guitar/pluck-detector.js';

const X = 0; // over the sound hole
const DT = 1 / 72;
const Z = GUITAR.stringZ;
const above = (s: number) => stringY(s, X) + 0.004;
const below = (s: number) => stringY(s, X) - 0.004;
const TOP = stringY(0, X) + 0.03;
const BOTTOM = stringY(5, X) - 0.03;

/** Deterministic noise in [-1, 1]. */
function noise(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return (state / 4294967296) * 2 - 1;
  };
}

interface Step {
  y: number;
  z?: number;
  x?: number;
  lost?: boolean;
}

/** Feeds samples; returns the plucked strings in order. */
function play(d: PluckDetector, steps: Step[], onFrame?: (d: PluckDetector) => void): number[] {
  const plucked: number[] = [];
  for (const step of steps) {
    if (step.lost) d.lost(DT);
    else d.update(step.x ?? X, step.y, step.z ?? Z, DT);
    for (let e = 0; e < d.count; e++) plucked.push(d.events[e].string);
    onFrame?.(d);
  }
  return plucked;
}

/** A straight line of `frames` samples from `from` to `to` (excluding `from`). */
function line(from: Step, to: Step, frames: number): Step[] {
  return Array.from({ length: frames }, (_, i) => {
    const t = (i + 1) / frames;
    return {
      x: (from.x ?? X) + ((to.x ?? X) - (from.x ?? X)) * t,
      y: from.y + (to.y - from.y) * t,
      z: (from.z ?? Z) + ((to.z ?? Z) - (from.z ?? Z)) * t,
    };
  });
}

describe('PluckDetector geometry (no smoothing)', () => {
  const raw = () => new PluckDetector({ smoothing: false });

  it('strums all six strings, low to high, on a down sweep', () => {
    const d = raw();
    expect(play(d, [{ y: TOP }, ...line({ y: TOP }, { y: BOTTOM }, 10)])).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('orders strings crossed in one frame by crossing time', () => {
    const d = raw();
    expect(play(d, [{ y: BOTTOM }, { y: TOP }])).toEqual([5, 4, 3, 2, 1, 0]);
  });

  it('picks a single string', () => {
    const d = raw();
    expect(play(d, [{ y: above(3) }, ...line({ y: above(3) }, { y: below(3) }, 4)])).toEqual([3]);
  });

  it('passes back over the strings without sounding when lifted', () => {
    const d = raw();
    const lift = Z + PLUCK_ZONE.above + 0.02;
    const path = [
      { y: below(3) },
      ...line({ y: below(3) }, { y: below(3), z: lift }, 3),
      ...line({ y: below(3), z: lift }, { y: above(0), z: lift }, 6),
      ...line({ y: above(0), z: lift }, { y: above(0) }, 3),
    ];
    expect(play(d, path)).toEqual([]);
  });

  it('keeps a fast strum going when its follow-through drifts deep', () => {
    const d = raw();
    // Starts on the string plane and sinks 7 cm as it sweeps through.
    const path = [{ y: TOP }, ...line({ y: TOP }, { y: BOTTOM, z: Z - 0.07 }, 4)];
    expect(play(d, path)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('does not start a strum deep below the strings', () => {
    const d = raw();
    const deep = Z - PLUCK_ZONE.below - 0.01;
    expect(play(d, [{ y: TOP, z: deep }, ...line({ y: TOP, z: deep }, { y: BOTTOM, z: deep }, 5)])).toEqual([]);
  });

  it('plays the strings crossed during a short tracking dropout', () => {
    const d = raw();
    const path: Step[] = [
      { y: TOP },
      { y: stringY(1, X) - 0.004 },
      { y: 0, lost: true },
      { y: 0, lost: true },
      { y: BOTTOM },
    ];
    expect(play(d, path)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('starts fresh after a long tracking loss', () => {
    const d = raw();
    const lostFrames = Math.ceil(TRACKING_GAP_SECONDS / DT) + 2;
    const path: Step[] = [{ y: TOP }, ...Array.from({ length: lostFrames }, () => ({ y: 0, lost: true })), { y: BOTTOM }];
    expect(play(d, path)).toEqual([]);
  });

  it('damps a ringing string the fingertip comes back to rest on', () => {
    const d = raw();
    play(d, [{ y: above(4) }, { y: below(4) }]);
    // Move away, come back, and rest on string 4.
    const away = line({ y: below(4) }, { y: below(4) - 0.006 }, 10);
    // Long enough for the fingertip to settle, then to count as resting.
    const rest = Array.from({ length: Math.ceil(TOUCH_MUTE_SECONDS / DT) + 12 }, () => ({ y: stringY(4, X) }));
    let damped = 0;
    play(d, [...away, ...rest], (dd) => (damped = dd.damping[4]));
    expect(damped).toBe(1);
  });

  it('never damps the string it just plucked, however slowly it moves on', () => {
    const d = raw();
    let damped = 0;
    let plucked = false;
    const slow = line({ y: above(2) }, { y: below(2) - 0.003 }, 120); // 1.7 s for 1.1 cm
    play(d, [{ y: above(2) }, ...slow], (dd) => {
      if (dd.count > 0) plucked = true;
      if (plucked) damped |= dd.damping[2];
    });
    expect([plucked, damped]).toEqual([true, 0]);
  });

  it('is louder for faster strums', () => {
    const slow = raw();
    const fast = raw();
    play(slow, [{ y: above(2) }, ...line({ y: above(2) }, { y: below(2) }, 20)]);
    const slowV = slow.events[0].velocity;
    play(fast, [{ y: above(2) + 0.04 }, ...line({ y: above(2) + 0.04 }, { y: below(2) - 0.04 }, 2)]);
    expect(fast.events[0].velocity).toBeGreaterThan(slowV);
  });

  it('ignores sweeps away from the body', () => {
    const d = raw();
    const x = 0.4;
    expect(play(d, [{ x, y: TOP }, ...line({ x, y: TOP }, { x, y: BOTTOM }, 10)])).toEqual([]);
  });
});

describe('PluckDetector with tracking noise (smoothing on)', () => {
  it('plucks each string exactly once on a very slow, jittery strum', () => {
    const d = new PluckDetector();
    const n = noise(7);
    const frames = Math.round(4 / DT); // 4 seconds, about 2 cm/s
    const path = line({ y: TOP }, { y: BOTTOM }, frames).map((p) => ({
      ...p,
      y: p.y + n() * 0.0015,
      z: (p.z ?? Z) + n() * 0.002,
    }));
    let damped = 0;
    const plucked = play(d, [{ y: TOP }, ...path], (dd) => {
      for (const v of dd.damping) damped |= v;
    });
    expect([plucked, damped]).toEqual([[0, 1, 2, 3, 4, 5], 0]);
  });

  it('does not re-pluck from jitter resting on a string', () => {
    const d = new PluckDetector();
    const n = noise(3);
    const y = stringY(2, X);
    const path = Array.from({ length: 150 }, () => ({ y: y + n() * 0.002, z: Z + n() * 0.002 }));
    expect(play(d, path)).toEqual([]);
  });

  it('keeps every string on fast strums back and forth', () => {
    const d = new PluckDetector();
    const n = noise(11);
    const path: Step[] = [{ y: TOP }];
    // Four strokes at about 2.5 m/s: 12 cm in 3 frames, with depth wobble.
    for (let k = 0; k < 4; k++) {
      const from = k % 2 === 0 ? TOP : BOTTOM;
      const to = k % 2 === 0 ? BOTTOM : TOP;
      path.push(...line({ y: from }, { y: to }, 3).map((p) => ({ ...p, z: Z + n() * 0.02 })));
      path.push({ y: to }, { y: to });
    }
    const plucked = play(d, path);
    expect(plucked.length).toBe(24);
  });
});
