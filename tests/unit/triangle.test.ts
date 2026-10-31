import { describe, expect, it } from 'vitest';
import { BAR, BEATER, CORNERS, TRIANGLE } from '../../src/triangle/geometry.js';
import {
  beaterPose,
  CONTACT,
  createBeaterPose,
  createTrianglePose,
  StrikeDetector,
  strikeLoudness,
  touchesBar,
  trianglePose,
} from '../../src/triangle/strike.js';

type V = [number, number, number];
const add = (a: V, b: V, s = 1): V => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

/** A point a third of the way up the left side. */
const LEFT: V = add(CORNERS.left, [CORNERS.top[0] - CORNERS.left[0], CORNERS.top[1] - CORNERS.left[1], 0], 1 / 3);

/** Moves a horizontal beater, crossing the left side, from `from` to `to` in front of the face (z) at `speed`. */
const intoFace = (det: StrikeDetector, from: number, to: number, speed: number, hz = 72, hold = 0) => {
  const dt = 1 / hz;
  const steps = Math.ceil(Math.abs(to - from) / (speed * dt));
  const at = (z: number) => det.update(add(LEFT, [-0.1, 0, z]), add(LEFT, [0.1, 0, z]), dt);
  let struck = 0;
  for (let i = 0; i <= steps; i++) {
    at(from + ((to - from) * i) / steps);
    if (det.struck) struck++;
  }
  for (let t = 0; t < hold; t += dt) at(to);
  return { struck, actual: (Math.abs(to - from) * hz) / steps };
};

describe('triangle geometry', () => {
  it('is a 7-inch triangle bent from one bar, open at a corner', () => {
    expect(TRIANGLE.side / 0.0254).toBeCloseTo(7, 0);
    expect(BAR.count - 1).toBe(BAR.side.length);
    expect(Array.from(new Set(BAR.side))).toEqual([0, 1, 2]);
    // Three sides less what the corners cut off and the open corner.
    expect(BAR.length).toBeGreaterThan(3 * TRIANGLE.side - 0.06);
    expect(BAR.length).toBeLessThan(3 * TRIANGLE.side);
    const end = (i: number): V => [BAR.points[i * 3], BAR.points[i * 3 + 1], 0];
    const gap = Math.hypot(end(0)[0] - end(BAR.count - 1)[0], end(0)[1] - end(BAR.count - 1)[1]);
    expect(gap).toBeGreaterThan(2 * TRIANGLE.barRadius);
  });
});

describe('holding the triangle and the beater', () => {
  it('hangs plumb from the pinch, facing the player', () => {
    const joints = new Float32Array(75);
    joints.set([0.1, 1.4, -0.4], 4 * 3);
    joints.set([0.12, 1.4, -0.4], 9 * 3);
    const p = trianglePose(joints, [0, 1.6, 0], createTrianglePose());
    expect(p.origin).toEqual([0.11, 1.4, -0.4].map((v) => expect.closeTo(v, 6)));
    expect(p.y).toEqual([0, 1, 0]);
    expect(p.z[1]).toBe(0);
    expect(p.z[2]).toBeGreaterThan(0.9);
  });

  it('holds the beater like a drumstick, out past the thumb', () => {
    const joints = new Float32Array(75);
    const set = (j: number, v: V) => joints.set(v, j * 3);
    // A right fist, palm down, pointing forward (-Z): the index on its left.
    set(0, [0, 0, 0]);
    set(4, [-0.03, -0.01, -0.07]);
    set(6, [-0.022, 0, -0.085]);
    set(11, [0, 0, -0.09]);
    set(12, [0, -0.02, -0.1]);
    set(21, [0.035, 0, -0.075]);
    const b = beaterPose(joints, createBeaterPose());
    expect(b.along[0]).toBeLessThan(-0.6);
    expect(b.along[2]).toBeLessThan(-0.2);
    expect(Math.hypot(b.tip[0] - b.grip[0], b.tip[1] - b.grip[1], b.tip[2] - b.grip[2])).toBeCloseTo(BEATER.length - BEATER.behind, 6);
  });
});

describe('striking', () => {
  it('strikes once, square into the face, as loud as the beater was moving', () => {
    for (const hz of [90, 72, 60]) {
      const det = new StrikeDetector();
      const r = intoFace(det, 0.08, -0.004, 1.2, hz);
      expect(r.struck).toBe(1);
      expect(det.side).toBe(1);
      expect(det.across).toBeGreaterThan(0.95);
      expect(det.speed).toBeCloseTo(r.actual, 1);
      expect(det.loudness).toBeCloseTo(strikeLoudness(r.actual), 1);
    }
  });

  it('catches a fast strike that passes right through the bar in one frame', () => {
    const det = new StrikeDetector();
    det.update(add(LEFT, [-0.1, 0, 0.03]), add(LEFT, [0.1, 0, 0.03]), 1 / 72);
    det.update(add(LEFT, [-0.1, 0, -0.03]), add(LEFT, [0.1, 0, -0.03]), 1 / 72);
    expect(det.struck).toBe(true);
    expect(det.loudness).toBeGreaterThan(0.9);
  });

  it('rolls inside the top corner, side to side, striking every time', () => {
    const det = new StrikeDetector();
    const y = CORNERS.top[1] - 0.05;
    const dt = 1 / 90;
    const sides: number[] = [];
    // 7 cycles a second, wide enough to reach both sides.
    for (let t = 0; t < 1; t += dt) {
      const x = 0.026 * Math.sin(2 * Math.PI * 7 * t);
      det.update([x, y, 0.15], [x, y, -0.05], dt);
      if (det.struck) sides.push(det.side);
    }
    expect(sides.length).toBeGreaterThanOrEqual(13);
    sides.forEach((s, i) => i > 0 && expect(s).not.toBe(sides[i - 1]));
    expect(new Set(sides)).toEqual(new Set([1, 2]));
  });

  it('touches silently when slow, and damps once it rests on the bar', () => {
    const det = new StrikeDetector();
    const r = intoFace(det, 0.02, CONTACT - 0.002, 0.04, 72, 0.15);
    expect(r.struck).toBe(0);
    expect(det.damping).toBe(true);
  });

  it('damps a beater left on the bar after a strike, not one that comes away', () => {
    const rest = new StrikeDetector();
    intoFace(rest, 0.08, 0.008, 1.2, 72, 0.15);
    expect(rest.damping).toBe(true);
    const away = new StrikeDetector();
    intoFace(away, 0.08, 0.008, 1.2);
    intoFace(away, 0.008, 0.08, 1.2, 72, 0.15);
    expect(away.damping).toBe(false);
  });

  it('does not take one long frame for the beater resting', () => {
    const det = new StrikeDetector();
    intoFace(det, 0.08, 0.008, 1.2);
    det.update(add(LEFT, [-0.1, 0, 0.008]), add(LEFT, [0.1, 0, 0.008]), 0.2);
    expect(det.damping).toBe(false);
  });

  it('ignores a jump in tracking', () => {
    const det = new StrikeDetector();
    det.update(add(LEFT, [-0.1, 0, 0.2]), add(LEFT, [0.1, 0, 0.2]), 1 / 72);
    det.update(add(LEFT, [-0.1, 0, -0.01]), add(LEFT, [0.1, 0, -0.01]), 1 / 72);
    expect(det.strikes).toBe(0);
  });

  it('misses a beater that passes beside the triangle', () => {
    const det = new StrikeDetector();
    for (let z = 0.1; z > -0.1; z -= 0.01) det.update([0.2, -0.1, z], [0.35, -0.1, z], 1 / 72);
    expect(det.strikes).toBe(0);
  });
});

describe('damping with the fingers', () => {
  it('touches the bar from a fingertip on it', () => {
    expect(touchesBar(Float32Array.from(add(LEFT, [0, 0, 0.012])), 1)).toBe(true);
    expect(touchesBar(Float32Array.from(add(LEFT, [0, 0, 0.03])), 1)).toBe(false);
  });
});

describe('following through and stopping short', () => {
  it('strikes once when the beater follows through the bar and comes back', () => {
    const det = new StrikeDetector();
    intoFace(det, 0.08, -0.04, 1.2);
    intoFace(det, -0.04, 0.08, 1.2);
    expect(det.strikes).toBe(1);
    // And again once it is back in front.
    intoFace(det, 0.08, -0.04, 1.2);
    expect(det.strikes).toBe(2);
  });

  it('sounds as fast as the beater came in, though it stopped dead on the bar', () => {
    const det = new StrikeDetector();
    const at = (z: number) => det.update(add(LEFT, [-0.1, 0, z]), add(LEFT, [0.1, 0, z]), 1 / 72);
    for (const z of [0.1, 0.08, 0.06, 0.04, 0.02, 0.008]) at(z);
    expect(det.strikes).toBe(1);
    // Its last frame was slower (it stopped on the bar); the strike is measured on the way in.
    expect(det.speed).toBeGreaterThan(1.0);
    expect(det.speed).toBeLessThan(0.02 * 72 + 0.05);
  });
});
