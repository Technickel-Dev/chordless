/**
 * The layout of a single B-flat French horn, shared by its model and the
 * playing logic. Horn space: +Y up, -Z forward (the leadpipe runs forward
 * and down from the mouthpiece), +Z toward the player, +X the player's
 * right. The origin is the mouthpiece receiver. The coils stand in a
 * vertical plane along the forward axis below the leadpipe; the three
 * rotary valves sit on their left face with levers up for the left hand's
 * fingers, and the bell leaves the bottom of the coils and opens back and
 * out to the right, where the right hand goes in.
 */

type Vec = readonly [number, number, number];

export const HORN = {
  /** Outer radius of the tubing. */
  tube: 0.0062,
  /** The main coil: its centre and its wraps' radii. */
  coilCenter: [0.012, -0.16, -0.14] as Vec,
  coilRadii: [0.122, 0.112, 0.102] as const,
  /** The rotary valves, first to third from the player, along Z, and their casings. */
  valveZ: [-0.15, -0.176, -0.202] as const,
  valveY: -0.075,
  valveX: -0.028,
  casingRadius: 0.0125,
  casingLength: 0.03,
  /** A lever's top (the finger spatula) at rest, its half-width, and how far a lever goes down. */
  leverX: -0.058,
  leverTop: -0.038,
  leverWidth: 0.0085,
  travel: 0.012,
  /**
   * The bell: where the flare leaves the bottom of the coils, its axis
   * (back along the coils, turned out to the right), length and rim radius
   * (12 inches across).
   */
  throat: [0.024, -0.283, -0.15] as Vec,
  bellAxis: [0.42, 0.03, 0.9] as Vec,
  flareLength: 0.3,
  bellRadius: 0.153,
  /** The mouthpiece's rim, where the lips are. */
  mouthpieceZ: 0.075,
  mouthpieceRim: 0.0092,
} as const;

/** The middle of the mouthpiece's rim: what goes to the lips. */
export const MOUTHPIECE: Vec = [0, 0, HORN.mouthpieceZ];

/** The bell's axis, unit length, pointing out of the bell. */
export const BELL_AXIS: Vec = (() => {
  const [x, y, z] = HORN.bellAxis;
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
})();

/** The centre of the bell's rim. */
export const BELL: Vec = [0, 1, 2].map((k) => HORN.throat[k] + BELL_AXIS[k] * HORN.flareLength) as unknown as Vec;

/**
 * How far a fingertip's tracked joint is above the lever it rests on: the
 * joint is in the middle of the finger, the pad's thickness up.
 */
export const FINGER_PAD = 0.007;

/**
 * Where the left hand's middle knuckle sits when its fingers rest on the
 * levers: the hand comes up from under the horn on the left, palm toward
 * the valves, knuckles just left of the levers and a little below their
 * tops, the fingers arching up and over onto them, as on the trumpet's
 * valves (mirrored).
 */
export const KNUCKLE: Vec = [HORN.leverX - 0.035, HORN.leverTop - 0.011, HORN.valveZ[1]];
