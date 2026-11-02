/**
 * The layout of a B-flat trumpet, shared by its model and the playing
 * logic. Trumpet space: +Y up (out of the valve buttons), -Z toward the
 * bell, +Z toward the mouthpiece and the player, +X the player's right.
 * The origin is the middle (second) valve's axis, at the height of the
 * bell pipe. Seen from above, the bell pipe passes the valves on the left
 * and the leadpipe on the right, where the right thumb tucks under it.
 */

type Vec = readonly [number, number, number];

export const TRUMPET = {
  /** Outer radius of the tubing (a 0.460-inch bore and the wall). */
  tube: 0.0062,
  /** The valve casings, first to third from the player, along Z. */
  valveZ: [0.026, 0, -0.026] as const,
  casingRadius: 0.0115,
  casingBottom: -0.046,
  casingTop: 0.03,
  /** A finger button's top at rest, its radius, and how far a valve goes down. */
  buttonTop: 0.066,
  buttonRadius: 0.0088,
  travel: 0.016,
  /** The bell pipe, beside the valves on the left. */
  bellPipeX: -0.024,
  bellPipeY: 0.012,
  /** The bell flares from the tube from here forward to the rim. */
  flareStartZ: -0.06,
  bellRimZ: -0.25,
  bellRadius: 0.0615,
  /** The bell bow, behind the valves, turns down this far to the lower tube. */
  bellBowZ: 0.1,
  lowerY: -0.052,
  /** The leadpipe, beside the valves on the right, from the mouthpiece receiver forward and down. */
  leadpipeX: 0.012,
  receiverZ: 0.165,
  receiverY: 0.022,
  leadpipeEndZ: -0.1,
  leadpipeEndY: -0.006,
  /** The main tuning slide's crook, in front of the valves below the bell. */
  mainSlideZ: -0.13,
  /** The mouthpiece's rim, where the lips are. */
  mouthpieceZ: 0.23,
  mouthpieceRim: 0.0135,
} as const;

/** The middle of the mouthpiece's rim: what goes to the lips. */
export const MOUTHPIECE: Vec = [TRUMPET.leadpipeX, TRUMPET.receiverY, TRUMPET.mouthpieceZ];

/** The centre of the bell's rim. */
export const BELL: Vec = [TRUMPET.bellPipeX, TRUMPET.bellPipeY, TRUMPET.bellRimZ];

/**
 * How far a fingertip's tracked joint is above the button it rests on:
 * the joint is in the middle of the finger, the pad's thickness up.
 */
export const FINGER_PAD = 0.007;

/**
 * Where the right hand's middle knuckle sits when the pads of its fingers
 * rest on the buttons. The hand comes from under the horn, as a
 * trumpeter's does: wrist below and to the right beside the leadpipe, palm
 * toward the valve casings, knuckles just right of the valves and a little
 * below the buttons, the fingers arching up and over onto them. Held so, a
 * finger resting on its button bends about 57 degrees at the knuckle and
 * one pressing it fully about 77 (see VALVE_REST_BEND in playing.ts).
 */
export const KNUCKLE: Vec = [0.035, TRUMPET.buttonTop - 0.011, 0];

/** The bell points this way (trumpet space). */
export const BELL_AXIS: Vec = [0, 0, -1];
