/**
 * How the guitar takes damage, and how its body breaks into shards. No
 * Three.js or IWSDK imports, so the rules can be unit tested in Node.
 */

import { GUITAR, stringY } from './geometry.js';

/** Which part of the guitar struck the floor. */
export const Region = { Body: 0, Neck: 1, Head: 2 } as const;
export type Region = (typeof Region)[keyof typeof Region];

/**
 * Impact speeds are in metres per second, at the point that hit. What a hit
 * does goes with its energy, the square of its speed above `tap`: a knock
 * barely marks the guitar, a good smack takes a piece out of it, and a full
 * swing wrecks it. One unit of energy is a hit about 3.7 m/s.
 */
export const ENERGY_SCALE = 6;

/** The energy of a hit at `speed` m/s, in the units the wear rates below are per. */
export function impactEnergy(speed: number, tap: number): number {
  const force = Math.max(0, speed - tap);
  return (force * force) / ENERGY_SCALE;
}

export const SMASH = {
  /** Slower hits only knock. */
  tap: 1.2,
  /** Hits this hard snap the string nearest them, and one more for each `snapStep` faster. */
  snap: 2.5,
  snapStep: 1.6,
  /** What a neck hit takes off the neck per unit of energy: two good hits snap it, or one hard one. */
  neckWear: 1 / 5,
  /** The headstock passes on less of a blow to the neck than the neck takes itself. */
  headShare: 0.8,
  /** What a body hit takes off a shard right beside it, per unit of energy: a good 6 m/s smack takes out a few. */
  shardWear: 0.45,
  /** How far from a hit (m) the shards of the body feel it, and how much further per m/s. */
  shardReach: 0.14,
  shardReachGrowth: 0.012,
  /** Every hit also shakes the whole body by this share of its force, wherever it landed. */
  shake: 0.1,
  /** With this share of its shards gone, the rest of the body falls apart. */
  collapse: 0.65,
  /** A body hit this hard shatters it outright. */
  shatter: 11,
} as const;

export interface GuitarDamage {
  /** 1 is new, 0 is wrecked: how much of the shards and neck is left, for display. */
  health: number;
  /** Whether each string, low E first, is still on. */
  strings: boolean[];
  /** What is left of the neck, 1 to 0. */
  neck: number;
  neckBroken: boolean;
  /** What is left of each shard of the body, 1 to 0; at 0 it has come off. */
  shards: number[];
  /** The body has fallen apart: nothing of it is left to hold. */
  wrecked: boolean;
}

export interface ImpactOutcome {
  /** How hard this hit was on what it struck, above the speed that only knocks. */
  loss: number;
  /** Strings this hit snapped. */
  snapped: number[];
  /** Shards this hit knocked off. */
  shardsOff: number[];
  neckBroke: boolean;
  shattered: boolean;
}

export function freshDamage(stringCount: number, shardCount = 0): GuitarDamage {
  return {
    health: 1,
    strings: Array(stringCount).fill(true),
    neck: 1,
    neckBroken: false,
    shards: Array(shardCount).fill(1),
    wrecked: false,
  };
}

export function repairDamage(d: GuitarDamage): void {
  d.health = 1;
  d.strings.fill(true);
  d.neck = 1;
  d.neckBroken = false;
  d.shards.fill(1);
  d.wrecked = false;
}

export function newOutcome(): ImpactOutcome {
  return { loss: 0, snapped: [], shardsOff: [], neckBroke: false, shattered: false };
}

export function intactStrings(d: GuitarDamage): number {
  let n = 0;
  for (const on of d.strings) if (on) n++;
  return n;
}

/**
 * Applies one hit to `d`, writing what broke into `out` (reused, so a hit
 * allocates nothing). (x, y) is where it landed on the guitar, and
 * `shardCentres` the x, y of each shard: what is near the hit is what gets
 * hurt, so hits in one spot break that spot first. `random` varies which of
 * the nearest strings snaps.
 */
export function applyImpact(
  d: GuitarDamage,
  speed: number,
  region: Region,
  x: number,
  y: number,
  shardCentres: readonly number[],
  random: () => number,
  out: ImpactOutcome,
): ImpactOutcome {
  out.loss = 0;
  out.snapped.length = 0;
  out.shardsOff.length = 0;
  out.neckBroke = false;
  out.shattered = false;
  if (d.wrecked || speed < SMASH.tap) return out;
  const force = speed - SMASH.tap;
  const energy = impactEnergy(speed, SMASH.tap);
  const reach = SMASH.shardReach + SMASH.shardReachGrowth * force;
  out.loss = energy * SMASH.shardWear;

  if (region !== Region.Body) {
    d.neck = Math.max(0, d.neck - energy * SMASH.neckWear * (region === Region.Head ? SMASH.headShare : 1));
    if (d.neck <= 0 && !d.neckBroken) {
      d.neckBroken = true;
      out.neckBroke = true;
    }
  }

  let gone = 0;
  const shatter = region === Region.Body && speed >= SMASH.shatter;
  for (let i = 0; i < d.shards.length; i++) {
    if (d.shards[i] <= 0) {
      gone++;
      continue;
    }
    let wear = energy * SMASH.shardWear * SMASH.shake;
    if (region === Region.Body) {
      const distance = Math.hypot(shardCentres[i * 2] - x, shardCentres[i * 2 + 1] - y);
      wear += energy * SMASH.shardWear * Math.max(0, 1 - distance / reach);
    }
    d.shards[i] = shatter ? 0 : Math.max(0, d.shards[i] - wear);
    if (d.shards[i] <= 0) {
      gone++;
      out.shardsOff.push(i);
    }
  }
  if (d.shards.length > 0 && gone / d.shards.length >= SMASH.collapse) {
    for (let i = 0; i < d.shards.length; i++) {
      if (d.shards[i] <= 0) continue;
      d.shards[i] = 0;
      out.shardsOff.push(i);
    }
    d.wrecked = true;
    out.shattered = true;
    // The neck comes away from a body that has fallen apart.
    if (!d.neckBroken) {
      d.neck = 0;
      d.neckBroken = true;
      out.neckBroke = true;
    }
  }

  // A broken neck or body takes every string with it; otherwise the nearest go.
  let toSnap =
    out.neckBroke || out.shattered
      ? d.strings.length
      : speed >= SMASH.snap
        ? 1 + Math.floor((speed - SMASH.snap) / SMASH.snapStep)
        : 0;
  while (toSnap > 0) {
    let nearest = -1;
    let best = Infinity;
    for (let s = 0; s < d.strings.length; s++) {
      if (!d.strings[s]) continue;
      const distance = Math.abs(stringY(s, Math.min(x, GUITAR.nutX)) - y) + random() * 0.012;
      if (distance < best) {
        best = distance;
        nearest = s;
      }
    }
    if (nearest < 0) break;
    d.strings[nearest] = false;
    out.snapped.push(nearest);
    toSnap--;
  }

  let left = d.neck * 0.2;
  if (d.shards.length > 0) {
    let sum = 0;
    for (let i = 0; i < d.shards.length; i++) sum += d.shards[i];
    left += (sum / d.shards.length) * 0.8;
  } else {
    left += 0.8;
  }
  d.health = d.wrecked ? 0 : left;
  return out;
}

/** Deterministic PRNG (mulberry32), so the same seed breaks the same way. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A polygon as flat x, y pairs. */
export type Polygon = number[];

export function polygonArea(poly: Polygon): number {
  let a = 0;
  const n = poly.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += poly[i * 2] * poly[j * 2 + 1] - poly[j * 2] * poly[i * 2 + 1];
  }
  return Math.abs(a) / 2;
}

/** Area-weighted centre of a simple polygon. */
export function polygonCentroid(poly: Polygon): [number, number] {
  let a = 0;
  let cx = 0;
  let cy = 0;
  const n = poly.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = poly[i * 2] * poly[j * 2 + 1] - poly[j * 2] * poly[i * 2 + 1];
    a += cross;
    cx += (poly[i * 2] + poly[j * 2]) * cross;
    cy += (poly[i * 2 + 1] + poly[j * 2 + 1]) * cross;
  }
  return Math.abs(a) < 1e-12 ? [poly[0], poly[1]] : [cx / (3 * a), cy / (3 * a)];
}

export function pointInPolygon(x: number, y: number, poly: Polygon): boolean {
  let inside = false;
  const n = poly.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i * 2];
    const yi = poly[i * 2 + 1];
    const xj = poly[j * 2];
    const yj = poly[j * 2 + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Up to `count` seed points inside `outline`, at least `spacing` apart, so
 * no shard comes out a sliver.
 */
export function scatterSeeds(outline: Polygon, count: number, spacing: number, random: () => number): number[] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < outline.length; i += 2) {
    minX = Math.min(minX, outline[i]);
    maxX = Math.max(maxX, outline[i]);
    minY = Math.min(minY, outline[i + 1]);
    maxY = Math.max(maxY, outline[i + 1]);
  }
  const seeds: number[] = [];
  for (let tries = 0; tries < count * 200 && seeds.length < count * 2; tries++) {
    const x = minX + random() * (maxX - minX);
    const y = minY + random() * (maxY - minY);
    if (!pointInPolygon(x, y, outline)) continue;
    let clear = true;
    for (let i = 0; i < seeds.length && clear; i += 2) {
      clear = Math.hypot(seeds[i] - x, seeds[i + 1] - y) >= spacing;
    }
    if (clear) seeds.push(x, y);
  }
  return seeds;
}

/**
 * Splits `outline` into one cell per seed: the part of it nearer that seed
 * than any other (a Voronoi diagram clipped to the outline). Cells that
 * come out empty are dropped.
 */
export function fractureCells(outline: Polygon, seeds: number[]): Polygon[] {
  const cells: Polygon[] = [];
  for (let i = 0; i < seeds.length; i += 2) {
    let cell = outline.slice();
    for (let j = 0; j < seeds.length && cell.length >= 6; j += 2) {
      if (j === i) continue;
      // Keep the side of the bisector nearer seed i.
      const nx = seeds[j] - seeds[i];
      const ny = seeds[j + 1] - seeds[i + 1];
      const d = (nx * (seeds[i] + seeds[j])) / 2 + (ny * (seeds[i + 1] + seeds[j + 1])) / 2;
      cell = clipHalfPlane(cell, nx, ny, d);
    }
    if (cell.length >= 6 && polygonArea(cell) > 1e-6) cells.push(cell);
  }
  return cells;
}

/** Sutherland-Hodgman: the part of `poly` where nx*x + ny*y <= d. */
function clipHalfPlane(poly: Polygon, nx: number, ny: number, d: number): Polygon {
  const out: Polygon = [];
  const n = poly.length / 2;
  for (let i = 0; i < n; i++) {
    const ax = poly[i * 2];
    const ay = poly[i * 2 + 1];
    const bx = poly[((i + 1) % n) * 2];
    const by = poly[((i + 1) % n) * 2 + 1];
    const da = nx * ax + ny * ay - d;
    const db = nx * bx + ny * by - d;
    if (da <= 0) out.push(ax, ay);
    if (da <= 0 !== db <= 0) {
      const t = da / (da - db);
      out.push(ax + (bx - ax) * t, ay + (by - ay) * t);
    }
  }
  return out;
}
