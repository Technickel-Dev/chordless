/**
 * How the guitar takes damage, and how its body breaks into shards. No
 * Three.js or IWSDK imports, so the rules can be unit tested in Node.
 */

/** Which part of the guitar struck the floor. */
export const Region = { Body: 0, Neck: 1, Head: 2 } as const;
export type Region = (typeof Region)[keyof typeof Region];

/** Impact speeds are in metres per second, at the point that hit. */
export const SMASH = {
  /** Slower hits only knock on the wood. */
  tap: 1.2,
  /** Hits this hard snap a string, and one more for each `snapStep` faster. */
  snap: 2.5,
  snapStep: 1.6,
  /** A neck or headstock hit this hard snaps the neck... */
  neckBreak: 6,
  /** ...or this hard once the guitar is down to half health. */
  weakNeckBreak: 4,
  /** A body hit this hard shatters it outright. */
  shatter: 11,
  /** Health lost per m/s above `tap`: a hard 8 m/s swing takes about half. */
  wear: 1 / 14,
} as const;

/** The body takes the full blow; the neck and headstock pass some to the hand. */
const REGION_WEAR = [1, 0.8, 0.6];

export interface GuitarDamage {
  /** 1 is new, 0 is wrecked. */
  health: number;
  /** Whether each string, low E first, is still on. */
  strings: boolean[];
  neckBroken: boolean;
  /** The body has shattered: nothing is left to hold. */
  wrecked: boolean;
}

export interface ImpactOutcome {
  /** Health this hit took. */
  loss: number;
  /** Strings this hit snapped. */
  snapped: number[];
  neckBroke: boolean;
  shattered: boolean;
}

export function freshDamage(stringCount: number): GuitarDamage {
  return { health: 1, strings: Array(stringCount).fill(true), neckBroken: false, wrecked: false };
}

export function repairDamage(d: GuitarDamage): void {
  d.health = 1;
  d.strings.fill(true);
  d.neckBroken = false;
  d.wrecked = false;
}

export function newOutcome(): ImpactOutcome {
  return { loss: 0, snapped: [], neckBroke: false, shattered: false };
}

export function intactStrings(d: GuitarDamage): number {
  let n = 0;
  for (const on of d.strings) if (on) n++;
  return n;
}

/**
 * Applies one hit to `d`, writing what broke into `out` (reused, so a hit
 * allocates nothing). `random` picks which strings snap.
 */
export function applyImpact(
  d: GuitarDamage,
  speed: number,
  region: Region,
  random: () => number,
  out: ImpactOutcome,
): ImpactOutcome {
  out.loss = 0;
  out.snapped.length = 0;
  out.neckBroke = false;
  out.shattered = false;
  if (d.wrecked || speed < SMASH.tap) return out;

  out.loss = Math.min(d.health, (speed - SMASH.tap) * SMASH.wear * REGION_WEAR[region]);
  d.health -= out.loss;

  if (
    !d.neckBroken &&
    region !== Region.Body &&
    (speed >= SMASH.neckBreak || (d.health < 0.5 && speed >= SMASH.weakNeckBreak))
  ) {
    d.neckBroken = true;
    out.neckBroke = true;
  }
  if ((region === Region.Body && speed >= SMASH.shatter) || d.health <= 0) {
    d.health = 0;
    d.wrecked = true;
    out.shattered = true;
    // The neck comes away from a shattered body too.
    if (!d.neckBroken) {
      d.neckBroken = true;
      out.neckBroke = true;
    }
  }

  // A broken neck or body takes every string with it.
  let toSnap =
    out.neckBroke || out.shattered
      ? d.strings.length
      : speed >= SMASH.snap
        ? 1 + Math.floor((speed - SMASH.snap) / SMASH.snapStep)
        : 0;
  while (toSnap > 0) {
    const left = intactStrings(d);
    if (left === 0) break;
    let pick = Math.min(left - 1, Math.floor(random() * left));
    for (let s = 0; s < d.strings.length; s++) {
      if (!d.strings[s]) continue;
      if (pick-- === 0) {
        d.strings[s] = false;
        out.snapped.push(s);
        break;
      }
    }
    toSnap--;
  }
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
