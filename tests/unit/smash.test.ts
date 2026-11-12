import { describe, expect, it } from 'vitest';
import {
  applyImpact,
  fractureCells,
  freshDamage,
  impactEnergy,
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
import { dentPositions } from '../../src/smash/dent.js';
import { GRAVITY, RigidBody } from '../../src/smash/tumble.js';

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
  // Three shards along the body: toward the tail, the middle, and toward the neck.
  const SHARDS = [-0.2, 0, 0, 0, 0.15, 0];
  const hit = (d: ReturnType<typeof freshDamage>, speed: number, region: Region, x = -0.2, y = 0, out = newOutcome()) =>
    applyImpact(d, speed, region, x, y, SHARDS, always, out);

  it('does damage as the energy of the hit: twice as hard is four times the damage', () => {
    const soft = hit(freshDamage(6, 3), SMASH.tap + 2, Region.Body);
    const hard = hit(freshDamage(6, 3), SMASH.tap + 4, Region.Body);
    expect(hard.loss / soft.loss).toBeCloseTo(4, 5);
    expect(impactEnergy(SMASH.tap + 4, SMASH.tap) / impactEnergy(SMASH.tap + 2, SMASH.tap)).toBeCloseTo(4, 5);
  });

  it('takes a piece out with one good smack, where a knock barely marks it', () => {
    const knocked = freshDamage(6, 3);
    hit(knocked, 2.5, Region.Body);
    expect(knocked.shards[0]).toBeGreaterThan(0.85);
    const smacked = freshDamage(6, 3);
    const out = hit(smacked, 8, Region.Body);
    expect(out.shardsOff).toContain(0);
  });

  it('only knocks below the tap speed', () => {
    const d = freshDamage(6, 3);
    const out = hit(d, SMASH.tap - 0.1, Region.Body);
    expect(out.loss).toBe(0);
    expect(d.health).toBe(1);
    expect(d.shards).toEqual([1, 1, 1]);
  });

  it('snaps more strings the harder it hits', () => {
    const soft = freshDamage(6, 3);
    const hard = freshDamage(6, 3);
    hit(soft, SMASH.snap, Region.Body);
    hit(hard, SMASH.snap + SMASH.snapStep * 2, Region.Body);
    expect(intactStrings(soft)).toBe(5);
    expect(intactStrings(hard)).toBe(3);
  });

  it('snaps the strings nearest the hit', () => {
    // Low E is on the +Y edge, high E on the -Y edge.
    const lowSide = freshDamage(6, 3);
    const highSide = freshDamage(6, 3);
    const a = hit(lowSide, SMASH.snap, Region.Body, -0.1, 0.1);
    const b = hit(highSide, SMASH.snap, Region.Body, -0.1, -0.1);
    expect(a.snapped).toEqual([0]);
    expect(b.snapped).toEqual([5]);
  });

  it('wears the shard a hit lands on far more than the ones away from it', () => {
    const d = freshDamage(6, 3);
    hit(d, 3, Region.Body);
    expect(d.shards[0]).toBeLessThan(d.shards[1]);
    expect(d.shards[1]).toBeLessThanOrEqual(d.shards[2]);
    expect(1 - d.shards[0]).toBeGreaterThan((1 - d.shards[2]) * 3);
  });

  it('breaks the spot it keeps hitting first', () => {
    const d = freshDamage(6, 3);
    const out = newOutcome();
    const off: number[] = [];
    for (let i = 0; i < 3 && off.length === 0; i++) off.push(...hit(d, 4, Region.Body, -0.2, 0, out).shardsOff);
    expect(off).toEqual([0]);
    expect(d.wrecked).toBe(false);
    expect(d.shards[2]).toBeGreaterThan(0);
  });

  it('takes more than one hard hit to snap the neck, and only neck hits count', () => {
    const d = freshDamage(6, 3);
    for (let i = 0; i < 2; i++) hit(d, 6, Region.Body);
    expect(d.neck).toBe(1);
    const first = hit(d, 6, Region.Neck, 0.3, 0);
    expect(first.neckBroke).toBe(false);
    expect(d.neck).toBeLessThan(1);
    const second = hit(d, 6, Region.Neck, 0.3, 0);
    expect(second.neckBroke).toBe(true);
    expect(intactStrings(d)).toBe(0);
  });

  it('shatters on one huge body hit', () => {
    const d = freshDamage(6, 3);
    const out = hit(d, SMASH.shatter, Region.Body);
    expect(out.shattered).toBe(true);
    expect(out.shardsOff).toEqual([0, 1, 2]);
    expect(d.wrecked).toBe(true);
    expect(d.health).toBe(0);
  });

  it('falls apart once most of its shards are gone', () => {
    const d = freshDamage(6, 3);
    d.shards[0] = 0;
    const out = hit(d, 8, Region.Body, 0, 0);
    expect(d.wrecked).toBe(true);
    expect(d.shards).toEqual([0, 0, 0]);
    expect(out.neckBroke).toBe(true);
    // Nothing more happens to a wreck.
    expect(hit(d, 20, Region.Body).loss).toBe(0);
  });
});

describe('dentPositions', () => {
  it('pushes what is at the hit most, fades out, and leaves the rest alone', () => {
    const p = Float64Array.from([0, 0, 0, 0.05, 0, 0, 0.2, 0, 0]);
    const moved = dentPositions(p, 0, 0, 0, 0, 1, 0, 0.1, 0.02);
    expect(moved).toBe(2);
    expect(p[1]).toBeGreaterThan(0.012);
    expect(p[4]).toBeGreaterThan(0);
    expect(p[4]).toBeLessThan(p[1]);
    expect(p[7]).toBe(0);
  });

  it('adds up over repeated hits', () => {
    const p = Float64Array.from([0, 0, 0]);
    dentPositions(p, 0, 0, 0, 0, 1, 0, 0.1, 0.01);
    const once = p[1];
    dentPositions(p, 0, 0, 0, 0, 1, 0, 0.1, 0.01);
    expect(p[1]).toBeGreaterThan(once);
  });

  it('moves copies of a vertex together, so non-indexed meshes do not tear', () => {
    const p = Float64Array.from([0.03, 0.01, 0, 0.03, 0.01, 0]);
    dentPositions(p, 0, 0, 0, 0, 1, 0, 0.1, 0.02);
    expect(p[1]).toBe(p[4]);
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
