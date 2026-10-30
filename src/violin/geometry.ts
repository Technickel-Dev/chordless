/**
 * Violin dimensions and fingerboard maths, shared by the model, the
 * stopping reader and the bow. No Three.js or IWSDK imports, so the
 * detection logic can be unit tested in Node.
 *
 * Local frame, as for the guitar: +X runs up the neck toward the scroll,
 * +Y across the strings (the G string on the +Y side), +Z out of the top.
 * The origin is on the top under the bridge.
 */

export const STRING_COUNT = 4;

/** Standard tuning, G (string 0) to E (string 3), as MIDI notes. */
export const OPEN_MIDI = [55, 62, 69, 76] as const;
export const STRING_NAMES = ['G', 'D', 'A', 'E'] as const;

const STRING_LENGTH = 0.328; // nut to bridge on a full-size violin
const BRIDGE_X = 0;
const NUT_X = BRIDGE_X + STRING_LENGTH;
/** The fingerboard is 270 mm long and ends over the top. */
const BOARD_END_X = NUT_X - 0.27;

/** The bridge and fingerboard are arched to this radius, so each string can be bowed alone. */
const ARCH_RADIUS = 0.042;

export const VIOLIN = {
  stringLength: STRING_LENGTH,
  bridgeX: BRIDGE_X,
  nutX: NUT_X,
  boardEndX: BOARD_END_X,
  /** Where the body ends, at the tail (chin rest) and at the neck. */
  tailX: -0.165,
  shoulderX: 0.19,
  archRadius: ARCH_RADIUS,
  /**
   * Distance from the G to the E string. A little wider than a real violin
   * (16.5 mm at the nut) so tracked fingertips can land on one string.
   */
  nutSpan: 0.02,
  bridgeSpan: 0.036,
  /** Height above the top of the middle of the bridge and of the fingerboard at the nut. */
  bridgeZ: 0.033,
  boardNutZ: 0.019,
  boardEndZ: 0.0235,
  /** Strings clear the fingerboard by this much at the nut. */
  nutClearance: 0.0008,
  /** Width of the fingerboard at the nut and at its end. */
  boardWidthNut: 0.025,
  boardWidthEnd: 0.042,
  /** Where along the strings the bow can draw a sound: from near the bridge to over the fingerboard. */
  bowMinX: BRIDGE_X + 0.008,
  bowMaxX: BOARD_END_X + 0.03,
} as const;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0 at the bridge, 1 at the nut. */
const along = (x: number) => (x - BRIDGE_X) / STRING_LENGTH;
const sag = (y: number, radius: number) => radius - Math.sqrt(Math.max(0, radius * radius - y * y));

/** G-to-E string span at `x`; strings fan out from nut to bridge. */
export function stringSpan(x: number): number {
  return lerp(VIOLIN.bridgeSpan, VIOLIN.nutSpan, along(x));
}

/** Gap between neighbouring strings at `x`. */
export function stringSpacing(x: number): number {
  return stringSpan(x) / (STRING_COUNT - 1);
}

/** Y of string `s` at `x`. */
export function stringY(s: number, x: number): number {
  const centre = (STRING_COUNT - 1) / 2;
  return ((centre - s) / (STRING_COUNT - 1)) * stringSpan(x);
}

/** Height of the fingerboard's surface along its centre line. */
export function boardZ(x: number): number {
  return lerp(VIOLIN.boardEndZ, VIOLIN.boardNutZ, (x - BOARD_END_X) / (NUT_X - BOARD_END_X));
}

/** Height of string `s` at `x`: from the arched bridge down to just over the arched fingerboard at the nut. */
export function stringZ(s: number, x: number): number {
  const atBridge = VIOLIN.bridgeZ - sag(stringY(s, BRIDGE_X), ARCH_RADIUS);
  const atNut = VIOLIN.boardNutZ + VIOLIN.nutClearance - sag(stringY(s, NUT_X), ARCH_RADIUS);
  return lerp(atBridge, atNut, along(x));
}

/**
 * The direction string `s` faces, across the arch (in the YZ plane): a bow
 * drawn with its hair square to this touches that string alone. Strings on
 * the edges face out by about 25 degrees, the middle two by about 8.
 */
export function stringFacing(s: number): [number, number] {
  const y = stringY(s, BRIDGE_X);
  const sin = y / ARCH_RADIUS;
  return [sin, Math.sqrt(1 - sin * sin)];
}

/** Semitones above the open string that stopping it at `x` plays. */
export function stopSemitones(x: number): number {
  return 12 * Math.log2(STRING_LENGTH / Math.max(1e-4, x - BRIDGE_X));
}

/** Where to stop a string to play `semitones` above it. */
export function stopX(semitones: number): number {
  return BRIDGE_X + STRING_LENGTH * 2 ** (-semitones / 12);
}

/** The highest note the fingerboard reaches, in semitones above the open string. */
export const MAX_STOP = stopSemitones(BOARD_END_X);

/**
 * Index of the string closest to (`x`, `y`) on the fingerboard, or -1 when
 * the point is further than `maxSpacings` string gaps from every string.
 */
export function nearestString(x: number, y: number, maxSpacings = 0.5): number {
  const spacing = stringSpacing(x);
  const centre = (STRING_COUNT - 1) / 2;
  const s = Math.round(centre - (y / stringSpan(x)) * (STRING_COUNT - 1));
  const clamped = Math.min(STRING_COUNT - 1, Math.max(0, s));
  return Math.abs(y - stringY(clamped, x)) <= spacing * maxSpacings ? clamped : -1;
}
