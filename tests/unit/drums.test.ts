import { describe, expect, it } from 'vitest';
import { NOMINAL_SNARE, PIECES, surfaceOf, TIP_REACH } from '../../src/drums/geometry.js';
import {
  articulationAt,
  createStickPose,
  FULL_STROKE_SPEED,
  restOn,
  SOUNDING_SPEED,
  strokeLoudness,
  StrokeDetector,
  TIP_RADIUS,
} from '../../src/drums/strokes.js';

type V = [number, number, number];
const piece = (id: string) => PIECES.find((p) => p.id === id)!;
/** A point `h` above `id`'s surface (tip touching at 0), `r` out from its centre toward the far rim. */
const over = (id: string, h: number, r = 0): V => {
  const s = surfaceOf(piece(id), NOMINAL_SNARE);
  const away = [s.center[0], 0, s.center[2]];
  const along = away[0] * s.normal[0] + away[2] * s.normal[2];
  const u = [away[0] - s.normal[0] * along, -s.normal[1] * along, away[2] - s.normal[2] * along];
  const ul = Math.hypot(...u);
  return [0, 1, 2].map((k) => s.center[k] + s.normal[k] * (h + TIP_RADIUS) + (u[k] / ul) * r) as V;
};
/** Moves stick `i`'s tip straight from `from` to `to` at `speed` m/s, at `hz`; returns the strokes. */
const run = (det: StrokeDetector, i: number, from: V, to: V, speed: number, hz = 72) => {
  const dt = 1 / hz;
  const steps = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]) / (speed * dt)));
  const strokes = [];
  for (let n = 0; n <= steps; n++) {
    const t = n / steps;
    const s = det.update(i, [0, 1, 2].map((k) => from[k] + (to[k] - from[k]) * t), dt);
    if (s) strokes.push({ ...s, id: s.piece.id });
  }
  return strokes;
};

describe('the kit layout', () => {
  it('keeps every playing surface clear of the others it could be struck past', () => {
    for (const a of PIECES) {
      for (const b of PIECES) {
        if (a === b) continue;
        const sa = surfaceOf(a, NOMINAL_SNARE);
        const sb = surfaceOf(b, NOMINAL_SNARE);
        const across = Math.hypot(sa.center[0] - sb.center[0], sa.center[2] - sb.center[2]);
        const between = Math.abs(sa.center[1] - sb.center[1]);
        // Either side by side, or one far enough above the other to strike it without touching the lower.
        expect(across > (a.radius + b.radius) * 0.98 || between > 0.08, `${a.id} / ${b.id}`).toBe(true);
      }
    }
  });

  it('tips each surface toward the drummer', () => {
    for (const p of PIECES) {
      const s = surfaceOf(p, NOMINAL_SNARE);
      expect(s.normal[0] * -p.x + s.normal[2] * -p.z).toBeGreaterThanOrEqual(0);
      expect(Math.hypot(...s.normal)).toBeCloseTo(1, 6);
    }
  });
});

describe('strokes', () => {
  it('sounds a stroke coming down onto a head, as loud as it was moving', () => {
    const det = new StrokeDetector(NOMINAL_SNARE);
    const fast = run(det, 1, over('snare', 0.1), over('snare', -0.01), 4);
    expect(fast.map((s) => s.id)).toEqual(['snare']);
    expect(fast[0].loudness).toBeGreaterThan(0.9);
    run(det, 1, over('snare', -0.01), over('snare', 0.1), 1);
    const slow = run(det, 1, over('snare', 0.1), over('snare', -0.01), 0.6);
    expect(slow).toHaveLength(1);
    expect(slow[0].loudness).toBeLessThan(0.4);
  });

  it('is silent for a tip lowered gently, or rising through a head from below', () => {
    const det = new StrokeDetector(NOMINAL_SNARE);
    expect(run(det, 0, over('tom2', 0.05), over('tom2', -0.01), SOUNDING_SPEED * 0.5)).toHaveLength(0);
    det.reset(0);
    expect(run(det, 0, over('floorTom', -0.08), over('floorTom', 0.1), 2)).toHaveLength(0);
  });

  it('needs the tip lifted clear before the same head sounds again', () => {
    const det = new StrokeDetector(NOMINAL_SNARE);
    expect(run(det, 0, over('snare', 0.1), over('snare', -0.002), 3)).toHaveLength(1);
    // A tip bouncing a few millimetres on the head (tracking jitter) does not restrike.
    expect(run(det, 0, over('snare', 0.005), over('snare', -0.002), 1)).toHaveLength(0);
    expect(run(det, 0, over('snare', -0.002), over('snare', 0.05), 1)).toHaveLength(0);
    expect(run(det, 0, over('snare', 0.05), over('snare', -0.002), 2)).toHaveLength(1);
  });

  it('keeps each stick to itself', () => {
    const det = new StrokeDetector(NOMINAL_SNARE);
    run(det, 0, over('hihat', 0.1), over('hihat', 0.1), 1);
    run(det, 1, over('snare', 0.1), over('snare', 0.1), 1);
    expect(run(det, 0, over('hihat', 0.1), over('hihat', -0.01), 3).map((s) => s.id)).toEqual(['hihat']);
    expect(run(det, 1, over('snare', 0.1), over('snare', -0.01), 3).map((s) => s.id)).toEqual(['snare']);
  });

  it('stops a stick on the hi-hat, so it cannot go on to strike the snare under its edge', () => {
    const det = new StrokeDetector(NOMINAL_SNARE);
    const hat = surfaceOf(piece('hihat'), NOMINAL_SNARE);
    const snare = surfaceOf(piece('snare'), NOMINAL_SNARE);
    // Over where the hi-hat's edge overhangs the snare.
    const x = (hat.center[0] + snare.center[0]) / 2 - 0.01;
    const z = (hat.center[2] + snare.center[2]) / 2;
    const strokes = run(det, 0, [x, hat.center[1] + 0.1, z], [x, snare.center[1] - 0.03, z], 3);
    expect(strokes.map((s) => s.id)).toEqual(['hihat']);
  });

  it('ignores a tip that jumps (lost tracking)', () => {
    const det = new StrokeDetector(NOMINAL_SNARE);
    det.update(0, over('crash', 0.5), 1 / 72);
    expect(det.update(0, over('crash', -0.01), 1 / 72)).toBeNull();
  });

  it('follows the rig up and down', () => {
    const det = new StrokeDetector(NOMINAL_SNARE);
    det.setSnareHeight(NOMINAL_SNARE + 0.1);
    const high = (h: number): V => {
      const p = over('snare', h);
      return [p[0], p[1] + 0.1, p[2]];
    };
    // Where the head was: below where it is now.
    expect(run(det, 1, over('snare', 0.04), over('snare', -0.01), 3)).toHaveLength(0);
    det.reset(1);
    expect(run(det, 1, high(0.1), high(-0.01), 3)).toHaveLength(1);
  });
});

describe('zones and loudness', () => {
  it('reads the snare rim, the hi-hat edge and the ride bell', () => {
    expect(articulationAt(piece('snare'), 0.05)).toBe('snare');
    expect(articulationAt(piece('snare'), 0.17)).toBe('rimshot');
    expect(articulationAt(piece('hihat'), 0.05)).toBe('hihatClosed');
    expect(articulationAt(piece('hihat'), 0.16)).toBe('hihatOpen');
    expect(articulationAt(piece('ride'), 0.03)).toBe('rideBell');
    expect(articulationAt(piece('ride'), 0.15)).toBe('ride');
    expect(articulationAt(piece('kick'), 0.02)).toBe('kick');
  });

  it('grows from silence to full with the tip speed', () => {
    expect(strokeLoudness(SOUNDING_SPEED)).toBe(0);
    expect(strokeLoudness(FULL_STROKE_SPEED)).toBe(1);
    expect(strokeLoudness(FULL_STROKE_SPEED * 2)).toBe(1);
    expect(strokeLoudness(1)).toBeGreaterThan(strokeLoudness(0.5));
  });
});

describe('a stick resting on a head', () => {
  it('turns about the grip so its tip stops on the surface', () => {
    const s = surfaceOf(piece('snare'), NOMINAL_SNARE);
    const pose = createStickPose();
    // The grip 8 cm over the head, the stick pointing steeply down through it.
    pose.grip = [s.center[0], s.center[1] + 0.08, s.center[2] + 0.2];
    const axis: V = [0, -0.6, -0.8];
    pose.axis = axis;
    pose.side = [1, 0, 0];
    for (let k = 0; k < 3; k++) pose.tip[k] = pose.grip[k] + axis[k] * TIP_REACH;
    expect(restOn(pose, s)).toBe(true);
    const h = [0, 1, 2].reduce((a, k) => a + (pose.tip[k] - s.center[k]) * s.normal[k], 0) - TIP_RADIUS;
    expect(h).toBeCloseTo(0, 6);
    expect(Math.hypot(...pose.axis)).toBeCloseTo(1, 6);
    // Still heading the same way across the head.
    expect(pose.axis[2]).toBeLessThan(0);
  });
});
