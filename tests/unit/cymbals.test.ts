import { describe, expect, it } from 'vitest';
import {
  CHEST,
  clashLoudness,
  ClashDetector,
  createCymbalPose,
  cymbalPose,
  type CymbalPose,
  FIST_FRONT,
  touchesSphere,
} from '../../src/cymbals/clash.js';
import { BELL_TOP, CYMBAL, GRIP_DEPTH, midlineHeight, thicknessAt } from '../../src/cymbals/geometry.js';

type V = [number, number, number];
const norm = (v: V): V => {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
};
/** A cymbal at `center` facing `normal`. */
const pose = (center: V, normal: V): CymbalPose => {
  const p = createCymbalPose();
  const n = norm(normal);
  p.center = [...center];
  p.normal = n;
  const hint: V = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const a = norm([hint[1] * n[2] - hint[2] * n[1], hint[2] * n[0] - hint[0] * n[2], hint[0] * n[1] - hint[1] * n[0]]);
  p.across = a;
  p.up = [n[1] * a[2] - n[2] * a[1], n[2] * a[0] - n[0] * a[2], n[0] * a[1] - n[1] * a[0]];
  return p;
};
/**
 * Two cymbals facing each other across X, their rims `gap` apart, the
 * right one `lift` higher (an offset clash).
 */
const pair = (gap: number, lift = 0.04): [CymbalPose, CymbalPose] => {
  const half = (gap + CYMBAL.edgeThickness) / 2;
  return [pose([-half, 1.2, -0.4], [1, 0, 0]), pose([half, 1.2 + lift, -0.4], [-1, 0, 0])];
};
/** Runs the plates from `from` to `to` (gap, m) at `speed` m/s, then holds them `hold` s. */
const run = (det: ClashDetector, from: number, to: number, speed: number, hz = 72, hold = 0, lift = 0.04) => {
  const dt = 1 / hz;
  const frames: { clashed: boolean; damping: boolean }[] = [];
  const steps = Math.ceil(Math.abs(to - from) / (speed * dt));
  for (let i = 0; i <= steps; i++) {
    det.update(...pair(from + ((to - from) * i) / steps, lift), dt);
    frames.push({ clashed: det.clashed, damping: det.damping });
  }
  for (let t = 0; t < hold; t += dt) {
    det.update(...pair(to, lift), dt);
    frames.push({ clashed: det.clashed, damping: det.damping });
  }
  return frames;
};

describe('cymbal geometry', () => {
  it('is an 18-inch plate, dished toward the bell, thickest at the bell', () => {
    expect(CYMBAL.radius * 2 / 0.0254).toBeCloseTo(18, 1);
    expect(midlineHeight(CYMBAL.radius)).toBeCloseTo(0, 6);
    expect(midlineHeight(CYMBAL.bellRadius)).toBeCloseTo(CYMBAL.bowHeight, 6);
    expect(midlineHeight(CYMBAL.holeRadius)).toBeCloseTo(CYMBAL.bowHeight + CYMBAL.bellHeight, 6);
    expect(thicknessAt(CYMBAL.radius)).toBeLessThan(thicknessAt(0.1));
    expect(GRIP_DEPTH).toBeGreaterThan(BELL_TOP);
  });
});

describe('cymbal in the hand', () => {
  it('faces the way the hand points, the strap across the knuckles', () => {
    const joints = new Float32Array(25 * 3);
    const set = (j: number, v: V) => joints.set(v, j * 3);
    // A right hand, palm down, pointing forward (-Z): the index on its left.
    set(0, [0, 0, 0]);
    set(6, [-0.022, 0, -0.085]);
    set(11, [0, 0, -0.09]);
    set(12, [0, -0.02, -0.11]);
    set(21, [0.035, 0, -0.075]);
    const p = cymbalPose(joints, createCymbalPose());
    expect(p.normal[2]).toBeCloseTo(-1, 6);
    expect(p.across[0]).toBeCloseTo(-1, 2);
    const reach = FIST_FRONT + BELL_TOP + CYMBAL.padThickness;
    expect(p.center[2]).toBeCloseTo(-0.11 - reach, 6);
    expect(p.center[1]).toBeCloseTo(-0.02, 6);
  });
});

describe('clashing', () => {
  it('clashes once, as loud as the plates were closing', () => {
    for (const hz of [90, 72, 60]) {
      const det = new ClashDetector();
      const frames = run(det, 0.15, -0.002, 1.5, hz);
      // The speed the plates actually moved at, in whole frames.
      const actual = (0.152 * hz) / Math.ceil(0.152 / (1.5 / hz));
      expect(frames.filter((f) => f.clashed).length).toBe(1);
      expect(det.speed).toBeCloseTo(actual, 2);
      expect(det.loudness).toBeCloseTo(clashLoudness(actual), 2);
      expect(det.flush).toBe(false);
    }
  });

  it('is louder the faster the plates close', () => {
    const soft = new ClashDetector();
    run(soft, 0.1, -0.002, 0.4);
    const loud = new ClashDetector();
    run(loud, 0.15, -0.002, 2.2);
    expect(soft.loudness).toBeLessThan(0.45);
    expect(loud.loudness).toBeGreaterThan(0.95);
  });

  it('muffles plates that meet flat and centred', () => {
    const det = new ClashDetector();
    run(det, 0.1, -0.002, 1.2, 72, 0, 0);
    expect(det.clashes).toBe(1);
    expect(det.flush).toBe(true);
  });

  it('meets plates laid together gently in silence, and damps them', () => {
    const det = new ClashDetector();
    const frames = run(det, 0.03, -0.001, 0.05, 72, 0.1);
    expect(frames.some((f) => f.clashed)).toBe(false);
    expect(frames.at(-1)!.damping).toBe(true);
  });

  it('damps plates held together after a clash (secco), not ones that part', () => {
    const held = new ClashDetector();
    const frames = run(held, 0.1, -0.002, 1.5, 72, 0.25);
    expect(frames.at(-1)!.damping).toBe(true);
    const parted = new ClashDetector();
    const out = [...run(parted, 0.1, -0.002, 1.5), ...run(parted, -0.002, 0.1, 1.5, 72, 0.25)];
    expect(out.some((f) => f.damping)).toBe(false);
  });

  it('must part before it clashes again', () => {
    const det = new ClashDetector();
    run(det, 0.1, -0.002, 1.5);
    run(det, -0.002, 0.01, 1);
    run(det, 0.01, -0.002, 1.5);
    expect(det.clashes).toBe(1);
    run(det, -0.002, 0.05, 1);
    run(det, 0.05, -0.002, 1.5);
    expect(det.clashes).toBe(2);
  });

  it('ignores a jump in tracking', () => {
    const det = new ClashDetector();
    det.update(...pair(0.1), 1 / 72);
    det.update(...pair(0.1), 1 / 72);
    det.update(...pair(-0.05), 1 / 72);
    expect(det.clashes).toBe(0);
  });

  it('meets tilted plates at the near rims first', () => {
    const tilt = (20 * Math.PI) / 180;
    const det = new ClashDetector();
    const at = (x: number) => det.update(pose([-x / 2, 1.2, -0.4], [1, 0, 0]), pose([x / 2, 1.2, -0.4], [-Math.cos(tilt), Math.sin(tilt), 0]), 1 / 72);
    at(0.12);
    expect(det.touching).toBe(false);
    at(0.07);
    expect(det.touching).toBe(true);
  });

  it('only counts plates that face each other', () => {
    const det = new ClashDetector();
    det.update(pose([-0.01, 1.2, -0.4], [1, 0, 0]), pose([0.01, 1.2, -0.4], [0, 0, 1]), 1 / 72);
    expect(det.gap).toBe(1);
    expect(det.touching).toBe(false);
  });
});

describe('damping on the chest', () => {
  it('touches a sphere the plate is pressed against', () => {
    const chest: V = [0, 1.2, 0];
    expect(touchesSphere(pose([0, 1.2, -0.1], [0, 0, -1]), chest, CHEST.radius)).toBe(true);
    expect(touchesSphere(pose([0, 1.2, -0.3], [0, 0, -1]), chest, CHEST.radius)).toBe(false);
    // Edge-on, its rim reaching back to the chest.
    expect(touchesSphere(pose([0.05, 1.2, -0.3], [1, 0, 0]), chest, CHEST.radius)).toBe(true);
    expect(touchesSphere(pose([0.05, 1.2, -0.45], [1, 0, 0]), chest, CHEST.radius)).toBe(false);
  });
});

describe('hitches', () => {
  it('does not take one long frame for plates held together', () => {
    const det = new ClashDetector();
    run(det, 0.1, -0.002, 1.5);
    det.update(...pair(-0.002), 0.2);
    expect(det.damping).toBe(false);
  });
});
