/**
 * The drum kit's layout and the drumstick's shape, shared by their models
 * and the stroke detection. Kit space: the origin is on the floor where
 * the drummer stands, +X to their right, +Y up, -Z ahead toward the kit.
 * Playing surfaces sit relative to the snare's head height; the kit is
 * modelled with the snare at NOMINAL_SNARE, and raising or lowering the
 * rig (everything carried on the stands' inner tubes) suits it to the
 * player.
 */

export type PieceId = 'kick' | 'snare' | 'hihat' | 'tom1' | 'tom2' | 'floorTom' | 'crash' | 'ride';

export interface Piece {
  id: PieceId;
  /** As the HUD names it. */
  label: string;
  kind: 'drum' | 'cymbal' | 'pad';
  /** Centre of the playing surface: across, height above the snare head, and ahead (m). */
  x: number;
  rise: number;
  z: number;
  radius: number;
  /** How far the surface tips toward the drummer (radians). */
  tilt: number;
  /** A drum's shell depth, or a cymbal's bell radius (m). */
  depth: number;
  /** Where it sits in the stereo picture, from the drummer's seat: -1 left to 1 right. */
  pan: number;
}

const deg = (d: number) => (d * Math.PI) / 180;

/** The snare's head height the kit is modelled at (m). */
export const NOMINAL_SNARE = 0.9;
/** How far the rig's stands telescope either way from nominal (m). */
export const RIG_TRAVEL = { down: 0.25, up: 0.2 } as const;

/**
 * The kit, as a drummer standing at the origin sees it: hi-hat and snare
 * to the left, toms over the bass drum, floor tom and ride to the right,
 * crash high left. The kick is played on a small trigger pad in front of
 * the right knee, since hands cannot reach a pedal.
 */
export const PIECES: readonly Piece[] = [
  { id: 'snare', label: 'Snare', kind: 'drum', x: -0.2, rise: 0, z: -0.34, radius: 0.178, tilt: deg(7), depth: 0.14, pan: -0.1 },
  { id: 'hihat', label: 'Hi-hat', kind: 'cymbal', x: -0.5, rise: 0.1, z: -0.3, radius: 0.178, tilt: deg(4), depth: 0.05, pan: -0.55 },
  { id: 'kick', label: 'Kick', kind: 'pad', x: 0.08, rise: -0.12, z: -0.33, radius: 0.075, tilt: deg(20), depth: 0.03, pan: 0 },
  { id: 'tom1', label: 'High tom', kind: 'drum', x: -0.13, rise: 0.2, z: -0.66, radius: 0.127, tilt: deg(20), depth: 0.2, pan: -0.15 },
  { id: 'tom2', label: 'Mid tom', kind: 'drum', x: 0.17, rise: 0.2, z: -0.66, radius: 0.152, tilt: deg(20), depth: 0.23, pan: 0.15 },
  { id: 'floorTom', label: 'Floor tom', kind: 'drum', x: 0.42, rise: -0.03, z: -0.4, radius: 0.203, tilt: deg(3), depth: 0.4, pan: 0.35 },
  { id: 'crash', label: 'Crash', kind: 'cymbal', x: -0.52, rise: 0.44, z: -0.68, radius: 0.229, tilt: deg(15), depth: 0.06, pan: -0.45 },
  { id: 'ride', label: 'Ride', kind: 'cymbal', x: 0.7, rise: 0.3, z: -0.62, radius: 0.254, tilt: deg(10), depth: 0.065, pan: 0.55 },
];

/** The bass drum, on the floor under the toms: its axis runs along Z. */
export const BASS_DRUM = { x: 0.02, z: -0.85, radius: 0.279, depth: 0.46 } as const;

/** Outer zones that change the sound: a rimshot on the snare, the hi-hat's edge (opened), the ride's bell. */
export const ZONES = {
  rimshot: 0.84,
  hihatOpen: 0.78,
} as const;

type Vec = [number, number, number];

/** A piece's playing surface in kit space, with the snare's head at `snare`. */
export interface Surface {
  piece: Piece;
  center: Vec;
  /** Out of the playing surface. */
  normal: Vec;
}

/** Where `piece`'s surface is with the snare's head at `snare` (m). */
export function surfaceOf(piece: Piece, snare: number, out?: Surface): Surface {
  const s = out ?? { piece, center: [0, 0, 0], normal: [0, 1, 0] };
  s.piece = piece;
  s.center[0] = piece.x;
  s.center[1] = snare + piece.rise;
  s.center[2] = piece.z;
  // Tipped toward the drummer at the origin.
  const toward = Math.hypot(piece.x, piece.z) || 1;
  const sin = Math.sin(piece.tilt);
  s.normal[0] = (-piece.x / toward) * sin;
  s.normal[1] = Math.cos(piece.tilt);
  s.normal[2] = (-piece.z / toward) * sin;
  return s;
}

/**
 * A 5A hickory stick. Stick space: the origin is where the fist holds it,
 * a third of the way up from the butt; +Y runs toward the tip.
 */
export const STICK = {
  length: 0.406,
  /** From the grip back to the butt. */
  butt: 0.13,
  radius: 0.00725,
  /** Where the taper toward the tip begins, from the grip. */
  taperStart: 0.17,
  neckRadius: 0.0034,
  /** The acorn tip's bead. */
  tipRadius: 0.0055,
  tipLength: 0.014,
} as const;

/** From the grip to the centre of the tip's bead, which is what strikes. */
export const TIP_REACH = STICK.length - STICK.butt - STICK.tipLength / 2;
