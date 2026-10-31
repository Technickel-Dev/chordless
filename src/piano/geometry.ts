/**
 * The keyboard of the air piano: 61 keys, C2 to C7, at real piano scale,
 * shared by its model and the key-press detection.
 *
 * Piano space: the origin is the middle of the keyboard's front edge, level
 * with the tops of the white keys. +X runs up the keyboard (bass to treble,
 * the player's right), +Y is up and +Z points toward the player, so the
 * keys reach back along -Z.
 */

export const PIANO = {
  /** MIDI numbers of the lowest and highest keys. */
  lowest: 36,
  highest: 96,
  /** White keys repeat every 23.5 mm: 164.5 mm to the octave. */
  whitePitch: 0.0235,
  /** The gap between neighbouring keys. */
  keyGap: 0.0012,
  whiteLength: 0.15,
  whiteThickness: 0.022,
  /** Black keys: wider at the base than on top, shorter, and standing proud of the whites. */
  blackWidth: 0.0137,
  blackTopWidth: 0.0098,
  blackLength: 0.095,
  blackHeight: 0.0125,
  /** How far a key goes down. */
  travel: 0.01,
  /** The keys pivot this far behind their back ends, inside the case. */
  pivotBehind: 0.22,
  /** The wooden blocks at each end of the keyboard. */
  cheekWidth: 0.05,
  /** The tops of the white keys are this high above the floor in the model as authored. */
  keyHeight: 0.95,
} as const;

export const KEY_COUNT = PIANO.highest - PIANO.lowest + 1;

const BLACK_IN_OCTAVE = [false, true, false, true, false, false, true, false, true, false, true, false];
/** White keys before each pitch class within the octave. */
const WHITES_BEFORE = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];

export function isBlack(midi: number): boolean {
  return BLACK_IN_OCTAVE[((midi % 12) + 12) % 12];
}

/** White keys below `midi` on this keyboard. */
function whiteIndex(midi: number): number {
  const fromC = midi - PIANO.lowest;
  return Math.floor(fromC / 12) * 7 + WHITES_BEFORE[fromC % 12];
}

export const WHITE_COUNT = whiteIndex(PIANO.highest) + 1;
/** Across all the keys, cheeks excluded. */
export const KEYBOARD_WIDTH = WHITE_COUNT * PIANO.whitePitch;

/**
 * The middle of a key, across the keyboard. White keys sit on a regular
 * pitch. Black keys, as on a real piano, are spread evenly within their
 * group: the two over C-E share three white keys' width in five equal
 * parts, the three over F-B four whites' width in seven.
 */
export function keyCenterX(midi: number): number {
  const left = -KEYBOARD_WIDTH / 2;
  const pc = midi % 12;
  if (!isBlack(midi)) return left + (whiteIndex(midi) + 0.5) * PIANO.whitePitch;
  const octave = left + Math.floor((midi - PIANO.lowest) / 12) * 7 * PIANO.whitePitch;
  if (pc < 5) return octave + ((pc + 0.5) * 3 * PIANO.whitePitch) / 5;
  return octave + 3 * PIANO.whitePitch + ((pc - 5 + 0.5) * 4 * PIANO.whitePitch) / 7;
}

/** The height of a key's top at rest. */
export function keyTop(midi: number): number {
  return isBlack(midi) ? PIANO.blackHeight : 0;
}

/**
 * A white key's outline, seen from above: full width at the front, cut
 * back round the black keys either side of it. `notchZ` is where the cuts
 * start (the black keys' front ends).
 */
export function whiteKeyOutline(midi: number): { left: number; right: number; backLeft: number; backRight: number; notchZ: number } {
  const half = PIANO.whitePitch / 2;
  const cx = keyCenterX(midi);
  const g = PIANO.keyGap / 2;
  const blackHalf = PIANO.blackWidth / 2;
  const below = midi - 1 >= PIANO.lowest && isBlack(midi - 1);
  const above = midi + 1 <= PIANO.highest && isBlack(midi + 1);
  return {
    left: cx - half + g,
    right: cx + half - g,
    backLeft: below ? keyCenterX(midi - 1) + blackHalf + g : cx - half + g,
    backRight: above ? keyCenterX(midi + 1) - blackHalf - g : cx + half - g,
    notchZ: -(PIANO.whiteLength - PIANO.blackLength),
  };
}

/**
 * The key whose top is at (x, z) in piano space, or -1 for none. Black
 * keys win inside their own outline, which is how a finger finds them: they
 * stand above the whites.
 */
export function keyAt(x: number, z: number): number {
  if (z > 0 || z < -PIANO.whiteLength) return -1;
  const half = KEYBOARD_WIDTH / 2;
  if (x < -half || x > half) return -1;
  const white = Math.min(WHITE_COUNT - 1, Math.floor((x + half) / PIANO.whitePitch));
  const octave = Math.floor(white / 7);
  const whiteMidi = PIANO.lowest + octave * 12 + [0, 2, 4, 5, 7, 9, 11][white % 7];
  if (z < -(PIANO.whiteLength - PIANO.blackLength)) {
    for (const b of [whiteMidi - 1, whiteMidi + 1]) {
      if (b < PIANO.lowest || b > PIANO.highest || !isBlack(b)) continue;
      if (Math.abs(x - keyCenterX(b)) <= PIANO.blackWidth / 2) return b;
    }
  }
  return whiteMidi;
}

/** Distance from a key's pivot to its front end, for turning a dip at the front into an angle. */
export function keyLever(midi: number): number {
  return PIANO.pivotBehind + (isBlack(midi) ? PIANO.blackLength : PIANO.whiteLength);
}
