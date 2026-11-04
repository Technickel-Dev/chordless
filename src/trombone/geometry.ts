/**
 * The layout of a B-flat tenor trombone, shared by its model and the
 * playing logic. Trombone space: +Y up, -Z forward along the slide toward
 * the bell, +Z toward the player, +X the player's right. The origin is the
 * mouthpiece receiver, where the slide's upper tube begins. The slide's two
 * tubes run forward one above the other; the bell section is on the left,
 * its tube passing back beside the head to the tuning slide behind it and
 * forward again to the bell, which faces the same way as the slide.
 */

type Vec = readonly [number, number, number];

export const TROMBONE = {
  /** Outer radius of the inner slide tubes (a 0.547-inch bore and the wall), and of the outer slide over them. */
  innerTube: 0.0072,
  outerTube: 0.0084,
  /** The bell section's tubing. */
  tube: 0.0078,
  /** The slide's lower tube is this far below the upper one. */
  slideGap: 0.07,
  /** The inner slide tubes run from the receiver forward to here. */
  innerEndZ: -0.7,
  /** The outer slide, closed (first position): from here forward to its crook. */
  outerStartZ: -0.035,
  outerEndZ: -0.715,
  /** The inner slide's brace, where the left hand holds the slide. */
  innerBraceZ: -0.065,
  /** The outer slide's brace, which the right hand moves, closed. */
  braceZ: -0.23,
  /** The slide can go out this far (m) before it would come off. */
  maxSlide: 0.6,
  /** The bell's axis, on the left of the slide. */
  bellX: -0.145,
  bellY: 0.004,
  /** The bell flares from the tube from here forward to the rim. */
  flareStartZ: -0.2,
  bellRimZ: -0.6,
  bellRadius: 0.108,
  /** The tuning slide's crook, behind the head. */
  tuningZ: 0.32,
  /** The bell brace, across from the slide to the bell tube, where the left thumb hooks round. */
  bellBraceZ: -0.11,
  /** The mouthpiece's rim, where the lips are. */
  mouthpieceZ: 0.085,
  mouthpieceRim: 0.0135,
} as const;

/** The middle of the mouthpiece's rim: what goes to the lips. */
export const MOUTHPIECE: Vec = [0, 0, TROMBONE.mouthpieceZ];

/** The centre of the bell's rim. */
export const BELL: Vec = [TROMBONE.bellX, TROMBONE.bellY, TROMBONE.bellRimZ];

/** The middle of the outer slide's brace, closed: where the right hand's fingertips hold it. */
export const BRACE: Vec = [0, -TROMBONE.slideGap / 2, TROMBONE.braceZ];

/**
 * Where the left hand's middle knuckle sits as it holds the trombone, as
 * trombonists do: the hand comes up from below on the left, its fingers
 * wrapped round the inner slide's brace and the upper tube just in front of
 * the receiver, the thumb hooked round the bell brace.
 */
export const KNUCKLE: Vec = [-0.042, 0.012, -0.075];
