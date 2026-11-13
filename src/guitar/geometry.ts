/**
 * Fretboard dimensions and maths for a fretted instrument (the guitar, the
 * bass), shared by the model, the fretting reader and the pluck detector.
 * No Three.js or IWSDK imports, so the detection logic can be unit tested
 * in Node.
 *
 * Local frame: +X runs up the neck toward the headstock, +Y across the
 * strings (the lowest string on the +Y edge), +Z out of the top face. The
 * origin is the centre of the body's top face where the strings are
 * picked: over the sound hole on the guitar.
 */

/** What makes one fretted instrument's fretboard its own. */
export interface FrettedSpec {
  /** Open strings, lowest first, as MIDI notes. */
  openMidi: readonly number[];
  /** Nut to bridge, metres. */
  scaleLength: number;
  bridgeX: number;
  fretCount: number;
  /** Height of the fretboard's playing surface. */
  boardTopZ: number;
  /** Height of the strings above the body top. */
  stringZ: number;
  /** Distance from the lowest string to the highest, at the nut and at the bridge. */
  nutSpan: number;
  bridgeSpan: number;
  neckWidthNut: number;
  neckWidthBody: number;
  /** How far up the neck, over the body, the picking hand still plucks. */
  pluckMaxX: number;
}

export interface FretboardDims {
  readonly scaleLength: number;
  readonly bridgeX: number;
  readonly nutX: number;
  readonly fretCount: number;
  readonly boardTopZ: number;
  readonly stringZ: number;
  readonly nutSpan: number;
  readonly bridgeSpan: number;
  readonly neckWidthNut: number;
  readonly neckWidthBody: number;
  /** Where the fretboard ends over the body. */
  readonly boardEndX: number;
  readonly pluckMaxX: number;
}

/** One fretted instrument's fretboard: its dimensions and the maths on them. */
export interface Fretboard {
  readonly stringCount: number;
  readonly openMidi: readonly number[];
  readonly dims: FretboardDims;
  /** X of fret wire `n` (0 = the nut). */
  fretX(n: number): number;
  /** Centre of the space behind fret wire `n`, where a finger presses for fret n. */
  fretMidX(n: number): number;
  /**
   * Fret a finger at `x` would play: 1 between the nut and the first fret
   * wire, and so on. Returns 0 when `x` is behind the nut or past the end of
   * the fretboard.
   */
  fretAt(x: number): number;
  /** Lowest-to-highest string span at `x`; strings fan out from nut to bridge. */
  stringSpan(x: number): number;
  stringSpacing(x: number): number;
  /** Y of string `s` at local `x`. */
  stringY(s: number, x: number): number;
  /**
   * Nearest string to `y` at `x`, or -1 when `y` is more than
   * `maxSpacings` string spacings from every string.
   */
  nearestString(x: number, y: number, maxSpacings?: number): number;
}

export function fretboard(spec: FrettedSpec): Fretboard {
  const stringCount = spec.openMidi.length;
  const nutX = spec.bridgeX + spec.scaleLength;
  const dims: FretboardDims = {
    scaleLength: spec.scaleLength,
    bridgeX: spec.bridgeX,
    nutX,
    fretCount: spec.fretCount,
    boardTopZ: spec.boardTopZ,
    stringZ: spec.stringZ,
    nutSpan: spec.nutSpan,
    bridgeSpan: spec.bridgeSpan,
    neckWidthNut: spec.neckWidthNut,
    neckWidthBody: spec.neckWidthBody,
    boardEndX: nutX - spec.scaleLength * (1 - 2 ** (-spec.fretCount / 12)) - 0.01,
    pluckMaxX: spec.pluckMaxX,
  };
  const centre = (stringCount - 1) / 2;

  const fretX = (n: number) => nutX - spec.scaleLength * (1 - 2 ** (-n / 12));
  const stringSpan = (x: number) => {
    const t = (x - spec.bridgeX) / (nutX - spec.bridgeX);
    return spec.bridgeSpan + (spec.nutSpan - spec.bridgeSpan) * t;
  };
  const stringY = (s: number, x: number) => ((centre - s) / (stringCount - 1)) * stringSpan(x);

  return {
    stringCount,
    openMidi: spec.openMidi,
    dims,
    fretX,
    fretMidX: (n) => (n <= 0 ? nutX : fretX(n) + (fretX(n - 1) - fretX(n)) * 0.4),
    fretAt: (x) => {
      if (x >= nutX || x <= dims.boardEndX) return 0;
      const n = Math.ceil(-12 * Math.log2(1 - (nutX - x) / spec.scaleLength));
      return Math.min(Math.max(n, 1), spec.fretCount);
    },
    stringSpan,
    stringSpacing: (x) => stringSpan(x) / (stringCount - 1),
    stringY,
    nearestString: (x, y, maxSpacings = 0.5) => {
      const span = stringSpan(x);
      const s = Math.round(centre - (y / span) * (stringCount - 1));
      const clamped = Math.min(stringCount - 1, Math.max(0, s));
      return Math.abs(y - stringY(clamped, x)) <= (span / (stringCount - 1)) * maxSpacings ? clamped : -1;
    },
  };
}

export const STRING_COUNT = 6;

/** Standard tuning, low E (string 0) to high E (string 5), as MIDI notes. */
export const OPEN_MIDI = [40, 45, 50, 55, 59, 64] as const;

/** A steel-string acoustic. */
export const GUITAR_BOARD = fretboard({
  openMidi: OPEN_MIDI,
  scaleLength: 0.648, // 25.5", a typical steel-string scale
  bridgeX: -0.13,
  fretCount: 19,
  boardTopZ: 0.014,
  stringZ: 0.019,
  // Slightly wider than a real guitar so tracked fingertips can land on a single string.
  nutSpan: 0.042,
  bridgeSpan: 0.058,
  neckWidthNut: 0.05,
  neckWidthBody: 0.064,
  pluckMaxX: 0.2,
});

export const GUITAR = GUITAR_BOARD.dims;

// The guitar's fretboard maths, as plain functions.
export const fretX = GUITAR_BOARD.fretX;
export const fretMidX = GUITAR_BOARD.fretMidX;
export const fretAt = GUITAR_BOARD.fretAt;
export const stringSpan = GUITAR_BOARD.stringSpan;
export const stringSpacing = GUITAR_BOARD.stringSpacing;
export const stringY = GUITAR_BOARD.stringY;
export const nearestString = GUITAR_BOARD.nearestString;
