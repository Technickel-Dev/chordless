import { describe, expect, it } from 'vitest';
import { BATON, STAND } from '../../src/baton/geometry.js';
import { restOnDesk, segmentDistance, STRIKING_LENGTH, TapDetector, tapLoudness, type Tap } from '../../src/baton/tap.js';

type V = [number, number, number];
const add = (a: V, b: V, s = 1): V => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const norm = (v: V): V => {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
};

/**
 * Moves the baton's striking length (desk space) so its tip goes from `from`
 * to `to` in a straight line at `speed` m/s, pointing along `along`, and
 * returns the taps it made.
 */
function sweep(det: TapDetector, from: V, to: V, speed: number, along: V = norm([0, -0.5, -1]), hz = 72): Tap[] {
  const dt = 1 / hz;
  const steps = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]) / (speed * dt)));
  const taps: Tap[] = [];
  for (let i = 0; i <= steps; i++) {
    const tip: V = add(from, add(to, from, -1), i / steps);
    const tap = det.update(add(tip, along, -STRIKING_LENGTH), tip, dt);
    if (tap) taps.push({ ...tap });
  }
  return taps;
}

const RIM: V = [0.05, STAND.deskHeight, -0.002];
const FACE: V = [-0.05, 0.17, 0];

describe('baton geometry', () => {
  it('is a 15-inch baton with its grip a little way up the handle', () => {
    expect((BATON.reach + BATON.behind) / 0.0254).toBeCloseTo(15, 0);
    expect(BATON.handleRadius).toBeGreaterThan(BATON.shaftRadius);
  });
  it('measures segment distances', () => {
    expect(segmentDistance([0, 1, 0], [0, 1, 1], [-1, 0, 0.5], [1, 0, 0.5])).toBeCloseTo(1, 6);
    expect(segmentDistance([0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0])).toBeCloseTo(1, 6);
  });
});

describe('tapping the stand', () => {
  it('sounds the top edge when the shaft comes down onto it', () => {
    const det = new TapDetector();
    const taps = sweep(det, add(RIM, [0, 0.06, -0.035]), add(RIM, [0, -0.012, -0.035]), 1.4);
    expect(taps.map((t) => t.spot)).toEqual(['rim']);
    expect(taps[0].speed).toBeGreaterThan(1.1);
    expect(taps[0].speed).toBeLessThan(1.7);
  });

  it('taps the top edge once when the shaft is pushed through it and drawn back', () => {
    const det = new TapDetector();
    const above = add(RIM, [0, 0.06, -0.035]);
    const below = add(RIM, [0, -0.05, -0.035]);
    expect(sweep(det, above, below, 1.4).length).toBe(1);
    expect(sweep(det, below, above, 1.4)).toEqual([]);
    expect(sweep(det, above, below, 1.4).length).toBe(1);
  });

  it('does not take a baton coming over the top edge, behind the face, for a desk tap', () => {
    const det = new TapDetector();
    // Fast enough to cross the rim between frames: it is still heard, as the rim.
    const taps = sweep(det, add(RIM, [0, 0.08, -0.025]), add(RIM, [0, -0.06, -0.025]), 5);
    expect(taps.map((t) => t.spot)).toEqual(['rim']);
  });

  it('sounds the desk from the front, louder the faster', () => {
    const soft = sweep(new TapDetector(), add(FACE, [0, 0, 0.07]), add(FACE, [0, 0, -0.006]), 0.5, norm([0, 0, -1]));
    const loud = sweep(new TapDetector(), add(FACE, [0, 0, 0.07]), add(FACE, [0, 0, -0.006]), 2.5, norm([0, 0, -1]));
    expect(soft.map((t) => t.spot)).toEqual(['desk']);
    expect(loud.map((t) => t.spot)).toEqual(['desk']);
    expect(loud[0].loudness).toBeGreaterThan(soft[0].loudness + 0.3);
  });

  it('is silent coming into the desk from behind, and resting on it', () => {
    const det = new TapDetector();
    expect(sweep(det, add(FACE, [0, 0, -0.025]), add(FACE, [0, 0, -0.004]), 1, norm([0, 0, 1]))).toEqual([]);
    const det2 = new TapDetector();
    expect(sweep(det2, add(FACE, [0, 0, 0.05]), add(FACE, [0, 0, -0.004]), 1, norm([0, 0, -1])).length).toBe(1);
    // Wiggling on the desk without coming clear of it does not tap again.
    expect(sweep(det2, add(FACE, [0, 0, -0.004]), add(FACE, [0, 0, 0.004]), 0.5, norm([0, 0, -1]))).toEqual([]);
    expect(sweep(det2, add(FACE, [0, 0, 0.004]), add(FACE, [0, 0, -0.004]), 0.5, norm([0, 0, -1]))).toEqual([]);
    expect(sweep(det2, add(FACE, [0, 0, -0.004]), add(FACE, [0, 0, 0.04]), 1, norm([0, 0, -1]))).toEqual([]);
    expect(sweep(det2, add(FACE, [0, 0, 0.04]), add(FACE, [0, 0, -0.004]), 1, norm([0, 0, -1])).length).toBe(1);
  });

  it('sounds the ledge from above', () => {
    const lip: V = [0.1, STAND.ledgeLip, STAND.ledgeDepth - 0.002];
    const taps = sweep(new TapDetector(), add(lip, [0, 0.06, 0]), add(lip, [0, -0.006, 0]), 1.3, norm([0, -0.6, -1]));
    expect(taps.map((t) => t.spot)).toEqual(['ledge']);
  });

  it('only whispers at a crawl, and is full at a flick', () => {
    expect(tapLoudness(0.1)).toBe(0);
    expect(tapLoudness(1)).toBeGreaterThan(0.2);
    expect(tapLoudness(5)).toBe(1);
  });

  it('rests the tip on the desk rather than through it', () => {
    const grip: V = [0, 0.2, 0.25];
    const tip: V = [0, 0.1, -0.02];
    expect(restOnDesk(grip, tip)).toBe(true);
    expect(tip[2]).toBeGreaterThan(0);
    expect(Math.hypot(tip[0] - grip[0], tip[1] - grip[1], tip[2] - grip[2])).toBeCloseTo(BATON.reach, 6);
  });
});
