/**
 * Bowed-string instrument dimensions and fingerboard maths, shared by the
 * models, the stopping reader and the bow. No Three.js or IWSDK imports, so
 * the detection logic can be unit tested in Node. The violin's geometry is
 * exported directly (as VIOLIN_GEOMETRY and the plain functions below); the
 * cello builds its own from CELLO in src/cello/geometry.ts.
 *
 * Local frame, as for the guitar: +X runs up the neck toward the scroll,
 * +Y across the strings, +Z out of the top. The origin is on the top under
 * the bridge. The lowest string is on the `lowSide` of Y: +Y on a violin,
 * which the player looks down from the chin, and -Y on a cello, which
 * faces away from the player (so its C string is on the player's left).
 */

/** What makes one bowed instrument differ from another. */
export interface BowedSpec {
  /** Open strings, lowest first, as MIDI notes, and their names. */
  openMidi: readonly number[];
  names: readonly string[];
  /** Which side of Y the lowest string is on. */
  lowSide: 1 | -1;
  /** Nut to bridge. */
  stringLength: number;
  /** Fingerboard length from the nut. */
  boardLength: number;
  /** Where the body ends, at the tail and at the neck. */
  tailX: number;
  shoulderX: number;
  /** The bridge and fingerboard are arched to this radius, so each string can be bowed alone. */
  archRadius: number;
  /** Lowest-to-highest string span at the nut and at the bridge. */
  nutSpan: number;
  bridgeSpan: number;
  /** Height above the top of the middle of the bridge, and of the fingerboard at the nut and at its end. */
  bridgeZ: number;
  boardNutZ: number;
  boardEndZ: number;
  /** Strings clear the fingerboard by this much at the nut. */
  nutClearance: number;
  /** Width of the fingerboard at the nut and at its end. */
  boardWidthNut: number;
  boardWidthEnd: number;
  /** Where along the strings the bow draws a sound, from the bridge: nearest, and past the fingerboard's end. */
  bowNearBridge: number;
  bowPastBoard: number;
}

/** A full-size violin. */
export const VIOLIN_SPEC: BowedSpec = {
  openMidi: [55, 62, 69, 76],
  names: ['G', 'D', 'A', 'E'],
  lowSide: 1,
  stringLength: 0.328,
  boardLength: 0.27,
  tailX: -0.165,
  shoulderX: 0.19,
  archRadius: 0.042,
  // A little wider than a real violin (16.5 mm at the nut) so tracked
  // fingertips can land on one string.
  nutSpan: 0.02,
  bridgeSpan: 0.036,
  bridgeZ: 0.033,
  boardNutZ: 0.019,
  boardEndZ: 0.0235,
  nutClearance: 0.0008,
  boardWidthNut: 0.025,
  boardWidthEnd: 0.042,
  bowNearBridge: 0.008,
  bowPastBoard: 0.03,
};

export type BowedGeometry = ReturnType<typeof bowedGeometry>;

/** The fingerboard maths for one instrument. */
export function bowedGeometry(spec: BowedSpec) {
  const STRING_COUNT = spec.openMidi.length;
  const BRIDGE_X = 0;
  const NUT_X = BRIDGE_X + spec.stringLength;
  const BOARD_END_X = NUT_X - spec.boardLength;
  const dims = {
    ...spec,
    bridgeX: BRIDGE_X,
    nutX: NUT_X,
    boardEndX: BOARD_END_X,
    bowMinX: BRIDGE_X + spec.bowNearBridge,
    bowMaxX: BOARD_END_X + spec.bowPastBoard,
  };
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  /** 0 at the bridge, 1 at the nut. */
  const along = (x: number) => (x - BRIDGE_X) / spec.stringLength;
  const sag = (y: number) => spec.archRadius - Math.sqrt(Math.max(0, spec.archRadius ** 2 - y * y));
  const centre = (STRING_COUNT - 1) / 2;

  /** Lowest-to-highest string span at `x`; strings fan out from nut to bridge. */
  const stringSpan = (x: number) => lerp(spec.bridgeSpan, spec.nutSpan, along(x));
  /** Gap between neighbouring strings at `x`. */
  const stringSpacing = (x: number) => stringSpan(x) / (STRING_COUNT - 1);
  /** Y of string `s` at `x`. */
  const stringY = (s: number, x: number) => (spec.lowSide * (centre - s) * stringSpan(x)) / (STRING_COUNT - 1);
  /** Height of the fingerboard's surface along its centre line. */
  const boardZ = (x: number) => lerp(spec.boardEndZ, spec.boardNutZ, (x - BOARD_END_X) / (NUT_X - BOARD_END_X));
  /** Height of string `s` at `x`: from the arched bridge down to just over the arched fingerboard at the nut. */
  const stringZ = (s: number, x: number) => {
    const atBridge = spec.bridgeZ - sag(stringY(s, BRIDGE_X));
    const atNut = spec.boardNutZ + spec.nutClearance - sag(stringY(s, NUT_X));
    return lerp(atBridge, atNut, along(x));
  };
  /**
   * The direction string `s` faces, across the arch (in the YZ plane): a bow
   * drawn with its hair square to this touches that string alone.
   */
  const stringFacing = (s: number): [number, number] => {
    const sin = stringY(s, BRIDGE_X) / spec.archRadius;
    return [sin, Math.sqrt(1 - sin * sin)];
  };
  /** Semitones above the open string that stopping it at `x` plays. */
  const stopSemitones = (x: number) => 12 * Math.log2(spec.stringLength / Math.max(1e-4, x - BRIDGE_X));
  /** Where to stop a string to play `semitones` above it. */
  const stopX = (semitones: number) => BRIDGE_X + spec.stringLength * 2 ** (-semitones / 12);
  /**
   * Index of the string closest to (`x`, `y`) on the fingerboard, or -1 when
   * the point is further than `maxSpacings` string gaps from every string.
   */
  const nearestString = (x: number, y: number, maxSpacings = 0.5) => {
    const s = Math.round(centre - (spec.lowSide * y * (STRING_COUNT - 1)) / stringSpan(x));
    const clamped = Math.min(STRING_COUNT - 1, Math.max(0, s));
    return Math.abs(y - stringY(clamped, x)) <= stringSpacing(x) * maxSpacings ? clamped : -1;
  };

  return {
    dims,
    STRING_COUNT,
    OPEN_MIDI: spec.openMidi,
    STRING_NAMES: spec.names,
    /** The highest note the fingerboard reaches, in semitones above the open string. */
    MAX_STOP: stopSemitones(BOARD_END_X),
    stringSpan,
    stringSpacing,
    stringY,
    boardZ,
    stringZ,
    stringFacing,
    stopSemitones,
    stopX,
    nearestString,
  };
}

export const VIOLIN_GEOMETRY = bowedGeometry(VIOLIN_SPEC);

export const STRING_COUNT = VIOLIN_GEOMETRY.STRING_COUNT;
/** Standard tuning, G (string 0) to E (string 3), as MIDI notes. */
export const OPEN_MIDI = VIOLIN_GEOMETRY.OPEN_MIDI;
export const STRING_NAMES = VIOLIN_GEOMETRY.STRING_NAMES;
export const VIOLIN = VIOLIN_GEOMETRY.dims;
export const MAX_STOP = VIOLIN_GEOMETRY.MAX_STOP;
export const {
  stringSpan,
  stringSpacing,
  stringY,
  boardZ,
  stringZ,
  stringFacing,
  stopSemitones,
  stopX,
  nearestString,
} = VIOLIN_GEOMETRY;
