import { describe, expect, it } from 'vitest';
import {
  isBlack,
  KEY_COUNT,
  keyAt,
  keyCenterX,
  KEYBOARD_WIDTH,
  keyTop,
  PIANO,
  WHITE_COUNT,
  whiteKeyOutline,
} from '../../src/piano/geometry.js';
import { heldName, Keyboard, PRESS, strikeVelocity, TIP_COUNT } from '../../src/piano/keys.js';
import { inharmonicity, noteSeconds, partialHz, partialLevels, ROOTS, sampleFor } from '../../src/piano/synth.js';

describe('piano keyboard', () => {
  it('runs C2 to C7: 61 keys, 36 white, an octave 164.5 mm wide', () => {
    expect(KEY_COUNT).toBe(61);
    expect(WHITE_COUNT).toBe(36);
    expect(keyCenterX(72) - keyCenterX(60)).toBeCloseTo(0.1645, 6);
    expect(KEYBOARD_WIDTH).toBeCloseTo(0.846, 6);
    // Symmetric about E4-F4: C3 mirrors C6.
    expect(keyCenterX(48) + keyCenterX(84)).toBeCloseTo(0, 6);
  });

  it('puts each black key between its white neighbours, and the keys in order', () => {
    for (let m = PIANO.lowest; m < PIANO.highest; m++) expect(keyCenterX(m + 1)).toBeGreaterThan(keyCenterX(m));
    for (let m = PIANO.lowest + 1; m < PIANO.highest; m++) {
      if (!isBlack(m)) continue;
      expect(keyCenterX(m)).toBeGreaterThan(keyCenterX(m - 1));
      expect(keyCenterX(m)).toBeLessThan(keyCenterX(m + 1));
    }
  });

  it('cuts the white keys back round the black ones, and leaves the end keys whole', () => {
    const c = whiteKeyOutline(60);
    expect(c.backLeft).toBeCloseTo(c.left, 6);
    expect(c.backRight).toBeLessThan(c.right - 0.005);
    const d = whiteKeyOutline(62);
    expect(d.backLeft).toBeGreaterThan(d.left + 0.003);
    expect(d.backRight).toBeLessThan(d.right - 0.003);
    const top = whiteKeyOutline(PIANO.highest);
    expect(top.backRight - top.backLeft).toBeCloseTo(top.right - top.left, 6);
  });

  it('finds the key under a point: black ones at the back, whites at the front', () => {
    expect(keyAt(keyCenterX(60), -0.02)).toBe(60);
    // In front of the black keys, only whites.
    expect([60, 62]).toContain(keyAt(keyCenterX(61), -0.02));
    expect(keyAt(keyCenterX(61), -0.12)).toBe(61);
    expect(keyAt(keyCenterX(66), -0.12)).toBe(66);
    expect(keyAt(keyCenterX(64), -0.12)).toBe(64);
    expect(keyAt(keyCenterX(60), 0.01)).toBe(-1);
    expect(keyAt(KEYBOARD_WIDTH, -0.05)).toBe(-1);
    expect(keyTop(61)).toBeGreaterThan(keyTop(60));
  });
});

/** Ten tips, all tracked, all far above the keys except those given. */
function tips(at: Record<number, [number, number, number]> = {}): Float32Array {
  const p = new Float32Array(TIP_COUNT * 3);
  for (let i = 0; i < TIP_COUNT; i++) p.set(at[i] ?? [i * 0.05 - 0.25, 0.2, -0.05], i * 3);
  return p;
}
const ALL = Array(TIP_COUNT).fill(true);
/** The tip's joint height for its pad to be `depth` into a key whose top is at `top`. */
const padAt = (top: number, depth: number) => top - depth + PRESS.fingerRadius;

/** Moves tip 1 from `from` to `to` height over (x, z) at `speed` m/s, at 72 Hz. */
function stroke(kb: Keyboard, x: number, z: number, from: number, to: number, speed: number) {
  const dt = 1 / 72;
  const events: { struck: number[]; velocity: number[]; released: number[] } = { struck: [], velocity: [], released: [] };
  const steps = Math.max(1, Math.ceil(Math.abs(to - from) / (speed * dt)));
  for (let s = 0; s <= steps; s++) {
    kb.update(tips({ 1: [x, from + ((to - from) * s) / steps, z] }), ALL, dt);
    for (let i = 0; i < kb.struckCount; i++) {
      events.struck.push(kb.struck[i].midi);
      events.velocity.push(kb.struck[i].velocity);
    }
    for (let i = 0; i < kb.releasedCount; i++) events.released.push(kb.released[i].midi);
  }
  return events;
}

describe('pressing keys', () => {
  const x = keyCenterX(60);
  const z = -0.03;

  it('sounds a key once its dip passes the strike point, and stops it when let up', () => {
    const kb = new Keyboard();
    const down = stroke(kb, x, z, 0.05, padAt(0, PIANO.travel + 0.005), 0.3);
    expect(down.struck).toEqual([60]);
    expect(kb.depth[60 - PIANO.lowest]).toBeCloseTo(PIANO.travel, 6);
    const up = stroke(kb, x, z, padAt(0, PIANO.travel), 0.05, 0.3);
    expect(up.released).toEqual([60]);
    expect(kb.down[60 - PIANO.lowest]).toBe(0);
  });

  it('does not sound a key pushed only part of the way', () => {
    const kb = new Keyboard();
    expect(stroke(kb, x, z, 0.05, padAt(0, PRESS.onDepth - 0.002), 0.3).struck).toEqual([]);
  });

  it('strikes louder for a faster finger', () => {
    const soft = stroke(new Keyboard(), x, z, 0.05, padAt(0, PIANO.travel), 0.1).velocity[0];
    const hard = stroke(new Keyboard(), x, z, 0.05, padAt(0, PIANO.travel), 1.2).velocity[0];
    expect(soft).toBeLessThan(0.35);
    expect(hard).toBeGreaterThan(0.85);
    expect(strikeVelocity(0)).toBeCloseTo(0.1, 6);
    expect(strikeVelocity(5)).toBeCloseTo(1, 6);
  });

  it('plays a black key from above at the back of the keyboard', () => {
    const kb = new Keyboard();
    expect(stroke(kb, keyCenterX(61), -0.12, 0.05, padAt(keyTop(61), PIANO.travel), 0.4).struck).toEqual([61]);
  });

  it('ignores a fingertip that comes in under the tops of the keys from the front', () => {
    const kb = new Keyboard();
    const y = padAt(0, PIANO.travel);
    kb.update(tips({ 1: [x, y, 0.05] }), ALL, 1 / 72);
    for (let zz = 0.04; zz > -0.05; zz -= 0.01) kb.update(tips({ 1: [x, y, zz] }), ALL, 1 / 72);
    expect(kb.down[60 - PIANO.lowest]).toBe(0);
    expect(kb.held[1]).toBe(-1);
  });

  it('keeps hold of its key while the finger rocks toward a neighbour', () => {
    const kb = new Keyboard();
    stroke(kb, x, z, 0.05, padAt(0, PIANO.travel), 0.4);
    const y = padAt(0, PIANO.travel);
    kb.update(tips({ 1: [x + PIANO.whitePitch * 0.7, y, z] }), ALL, 1 / 72);
    expect(kb.held[1]).toBe(60);
    expect(kb.down[62 - PIANO.lowest]).toBe(0);
  });

  it('lets every key up when the hands are lost', () => {
    const kb = new Keyboard();
    stroke(kb, x, z, 0.05, padAt(0, PIANO.travel), 0.4);
    kb.update(tips(), Array(TIP_COUNT).fill(false), 1 / 72);
    expect(kb.releasedCount).toBe(1);
    expect(kb.released[0].midi).toBe(60);
  });
});

describe('piano voice', () => {
  it('renders every third key, so every key is within a semitone of a recording', () => {
    expect(ROOTS.length).toBe(21);
    for (let m = PIANO.lowest; m <= PIANO.highest; m++) {
      const { root, rate } = sampleFor(m);
      expect(Math.abs(m - ROOTS[root])).toBeLessThanOrEqual(1);
      expect(rate).toBeCloseTo(2 ** ((m - ROOTS[root]) / 12), 9);
    }
  });

  it('stretches the partials of a stiff string, more in the treble', () => {
    expect(inharmonicity(90)).toBeGreaterThan(inharmonicity(40));
    expect(partialHz(100, 10, inharmonicity(60))).toBeGreaterThan(1000);
  });

  it('is brighter for a harder blow, and rings longer in the bass', () => {
    const centroid = (v: number) => {
      const { hz, level } = partialLevels(60, v);
      const total = level.reduce((a, b) => a + b, 0);
      return hz.reduce((a, f, i) => a + f * level[i], 0) / total;
    };
    expect(centroid(1)).toBeGreaterThan(centroid(0.3) * 1.3);
    expect(noteSeconds(40, 1)).toBeGreaterThan(noteSeconds(90, 1));
    expect(noteSeconds(60, 1)).toBeLessThanOrEqual(6);
  });
});

describe('piano HUD', () => {
  it('names chords of three or more keys, and spells out fewer', () => {
    expect(heldName([60])).toBe('C4');
    expect(heldName([48, 55])).toBe('C3 G3');
    expect(heldName([60, 64, 67])).toBe('C');
    expect(heldName([60, 61, 62, 63, 64])).toBe('5 keys');
  });
});
