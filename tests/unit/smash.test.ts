import { describe, expect, it } from 'vitest';
import {
  applyImpact,
  fractureCells,
  freshDamage,
  intactStrings,
  newOutcome,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  Region,
  scatterSeeds,
  seededRandom,
  SMASH,
} from '../../src/guitar/smash.js';
import { GRAVITY, RigidBody } from '../../src/guitar/tumble.js';

/** Corners of a box centred on its centre of mass. */
function boxPoints(x: number, y: number, z: number): Float32Array {
  const out: number[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) out.push((sx * x) / 2, (sy * y) / 2, (sz * z) / 2);
  return Float32Array.from(out);
}

function boxBody(): RigidBody {
  const m = 1;
  const [x, y, z] = [0.3, 0.1, 0.2];
  return new RigidBody(boxPoints(x, y, z), m, [(m / 12) * (y * y + z * z), (m / 12) * (x * x + z * z), (m / 12) * (x * x + y * y)]);
}

function run(body: RigidBody, seconds: number, onStep?: () => void): void {
  for (let t = 0; t < seconds; t += 1 / 72) {
    body.step(1 / 72);
    onStep?.();
  }
}

describe('tumble', () => {
  it('reports a dropped box striking the floor at the speed it fell', () => {
    const body = boxBody();
    body.setPose(0, 1.05, 0, 0, 0, 0, 1);
    let fastest = 0;
    run(body, 1.5, () => (fastest = Math.max(fastest, body.impactSpeed)));
    expect(fastest).toBeCloseTo(Math.sqrt(2 * GRAVITY * 1), 0);
  });

  it('comes to rest on the floor, not in it, and goes to sleep', () => {
    const body = boxBody();
    body.setPose(0, 1, 0, 0.3, 0.2, 0.1, 0.92);
    body.setVelocity(2, 1, -1, 4, -6, 3);
    run(body, 6);
    expect(body.asleep).toBe(true);
    // Resting on a face: the centre is half a short side up.
    expect(body.p[1]).toBeGreaterThan(0.04);
    expect(body.p[1]).toBeLessThan(0.16);
  });

  it('slides to a stop on friction', () => {
    const body = boxBody();
    body.setPose(0, 0.05, 0, 0, 0, 0, 1);
    body.setVelocity(3, 0, 0, 0, 0, 0);
    run(body, 3);
    expect(Math.abs(body.v[0])).toBeLessThan(0.01);
    expect(body.p[0]).toBeGreaterThan(0.2);
    expect(body.p[0]).toBeLessThan(2);
  });
});

describe('applyImpact', () => {
  const always = () => 0.5;

  it('only knocks below the tap speed', () => {
    const d = freshDamage(6);
    const out = applyImpact(d, SMASH.tap - 0.1, Region.Body, always, newOutcome());
    expect(out.loss).toBe(0);
    expect(d.health).toBe(1);
  });

  it('snaps more strings the harder it hits', () => {
    const soft = freshDamage(6);
    const hard = freshDamage(6);
    applyImpact(soft, SMASH.snap, Region.Body, always, newOutcome());
    applyImpact(hard, SMASH.snap + SMASH.snapStep * 2, Region.Body, always, newOutcome());
    expect(intactStrings(soft)).toBe(5);
    expect(intactStrings(hard)).toBe(3);
  });

  it('snaps the neck on a hard headstock hit, taking every string', () => {
    const d = freshDamage(6);
    const out = applyImpact(d, SMASH.neckBreak, Region.Head, always, newOutcome());
    expect(out.neckBroke).toBe(true);
    expect(d.neckBroken).toBe(true);
    expect(intactStrings(d)).toBe(0);
    expect(d.wrecked).toBe(false);
  });

  it('does not snap the neck on a body hit', () => {
    const d = freshDamage(6);
    applyImpact(d, 9, Region.Body, always, newOutcome());
    expect(d.neckBroken).toBe(false);
  });

  it('shatters on one huge body hit', () => {
    const d = freshDamage(6);
    const out = applyImpact(d, SMASH.shatter, Region.Body, always, newOutcome());
    expect(out.shattered).toBe(true);
    expect(d.wrecked).toBe(true);
    expect(d.health).toBe(0);
  });

  it('wears down to a wreck over a few hard swings', () => {
    const d = freshDamage(6);
    const out = newOutcome();
    let hits = 0;
    while (!d.wrecked && hits < 10) {
      applyImpact(d, 8, Region.Body, always, out);
      hits++;
    }
    expect(hits).toBeGreaterThanOrEqual(2);
    expect(hits).toBeLessThanOrEqual(4);
    // Nothing more happens to a wreck.
    expect(applyImpact(d, 20, Region.Body, always, out).loss).toBe(0);
  });
});

describe('fracture', () => {
  // A figure-of-eight-ish outline, like the guitar body's.
  const outline: number[] = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const r = 0.18 + 0.03 * Math.cos(2 * a);
    outline.push(r * Math.cos(a) * 1.4, r * Math.sin(a));
  }

  it('splits the outline into cells that cover it exactly', () => {
    const seeds = scatterSeeds(outline, 9, 0.07, seededRandom(7));
    expect(seeds.length / 2).toBeGreaterThanOrEqual(6);
    const cells = fractureCells(outline, seeds);
    expect(cells.length).toBe(seeds.length / 2);
    const total = cells.reduce((sum, c) => sum + polygonArea(c), 0);
    expect(total).toBeCloseTo(polygonArea(outline), 5);
    for (const cell of cells) {
      const [cx, cy] = polygonCentroid(cell);
      expect(pointInPolygon(cx, cy, outline)).toBe(true);
    }
  });

  it('breaks the same way every time for one seed', () => {
    const a = fractureCells(outline, scatterSeeds(outline, 9, 0.07, seededRandom(7)));
    const b = fractureCells(outline, scatterSeeds(outline, 9, 0.07, seededRandom(7)));
    expect(a).toEqual(b);
  });
});
