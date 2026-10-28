/**
 * Guitar dimensions and fretboard maths, shared by the model, the fretting
 * reader and the pluck detector. No Three.js or IWSDK imports, so the
 * detection logic can be unit tested in Node.
 *
 * Local frame: +X runs up the neck toward the headstock, +Y across the
 * strings (low E on the +Y edge), +Z out of the top face. The origin is the
 * centre of the body's top face, over the sound hole.
 */

export const STRING_COUNT = 6;

/** Standard tuning, low E (string 0) to high E (string 5), as MIDI notes. */
export const OPEN_MIDI = [40, 45, 50, 55, 59, 64] as const;

const SCALE_LENGTH = 0.648; // 25.5", a typical steel-string scale
const BRIDGE_X = -0.13;
const NUT_X = BRIDGE_X + SCALE_LENGTH;
const FRET_COUNT = 19;

export const GUITAR = {
  scaleLength: SCALE_LENGTH,
  bridgeX: BRIDGE_X,
  nutX: NUT_X,
  fretCount: FRET_COUNT,
  /** Height of the fretboard's playing surface. */
  boardTopZ: 0.014,
  /** Height of the strings above the body top. */
  stringZ: 0.019,
  /**
   * Distance from the low E to the high E. Slightly wider than a real
   * guitar so tracked fingertips can land on a single string.
   */
  nutSpan: 0.042,
  bridgeSpan: 0.058,
  neckWidthNut: 0.05,
  neckWidthBody: 0.064,
  /** Where the fretboard ends over the body. */
  boardEndX: NUT_X - SCALE_LENGTH * (1 - 2 ** (-FRET_COUNT / 12)) - 0.01,
} as const;

/** X of fret wire `n` (0 = the nut). */
export function fretX(n: number): number {
  return GUITAR.nutX - GUITAR.scaleLength * (1 - 2 ** (-n / 12));
}

/** Centre of the space behind fret wire `n`, where a finger presses for fret n. */
export function fretMidX(n: number): number {
  return n <= 0 ? GUITAR.nutX : fretX(n) + (fretX(n - 1) - fretX(n)) * 0.4;
}

/**
 * Fret a finger at `x` would play: 1 between the nut and the first fret
 * wire, and so on. Returns 0 when `x` is behind the nut or past the end of
 * the fretboard.
 */
export function fretAt(x: number): number {
  if (x >= GUITAR.nutX || x <= GUITAR.boardEndX) return 0;
  const n = Math.ceil(-12 * Math.log2(1 - (GUITAR.nutX - x) / GUITAR.scaleLength));
  return Math.min(Math.max(n, 1), GUITAR.fretCount);
}

/** Low-to-high string span at `x`; strings fan out from nut to bridge. */
export function stringSpan(x: number): number {
  const t = (x - GUITAR.bridgeX) / (GUITAR.nutX - GUITAR.bridgeX);
  return GUITAR.bridgeSpan + (GUITAR.nutSpan - GUITAR.bridgeSpan) * t;
}

export function stringSpacing(x: number): number {
  return stringSpan(x) / (STRING_COUNT - 1);
}

/** Y of string `s` at local `x`. */
export function stringY(s: number, x: number): number {
  const centre = (STRING_COUNT - 1) / 2;
  return ((centre - s) / (STRING_COUNT - 1)) * stringSpan(x);
}

/**
 * Nearest string to `y` at `x`, or -1 when `y` is more than
 * `maxSpacings` string spacings from every string.
 */
export function nearestString(x: number, y: number, maxSpacings = 0.5): number {
  const spacing = stringSpacing(x);
  const centre = (STRING_COUNT - 1) / 2;
  const s = Math.round(centre - (y / stringSpan(x)) * (STRING_COUNT - 1));
  const clamped = Math.min(STRING_COUNT - 1, Math.max(0, s));
  return Math.abs(y - stringY(clamped, x)) <= spacing * maxSpacings ? clamped : -1;
}
