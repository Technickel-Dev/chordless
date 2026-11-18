/**
 * The conductor's baton and the music stand it is tapped on, shared by
 * their models and the tap detection.
 *
 * Baton space: the origin is where the fist grips the handle, +X toward
 * the tip.
 *
 * Stand space: the origin is on the floor under the column, +Y up, +Z
 * toward the player, who stands in front of the desk. The stand is
 * modelled with the desk's ledge at NOMINAL_LEDGE; raising or lowering the
 * rig (the inner tube and everything on it) suits it to the player.
 */

const deg = (d: number) => (d * Math.PI) / 180;

/** A 15-inch white baton with a pear-shaped cork handle. */
export const BATON = {
  /** From the grip to the tip (m). */
  reach: 0.34,
  /** The handle runs this far behind the grip, into the palm... */
  behind: 0.045,
  /** ...and this far in front of it, under the thumb and forefinger. */
  handleFront: 0.03,
  /** The handle's widest radius, at its bulb in the palm. */
  handleRadius: 0.0085,
  /** The shaft's radius where it leaves the handle, and at the tip. */
  shaftRadius: 0.0032,
  tipRadius: 0.0011,
  /**
   * How far the baton leans from where the knuckles point toward the thumb
   * side: held between thumb and forefinger, it points a little across.
   */
  lean: 0.3,
} as const;

/** The music stand: a tripod base, a telescoping column and a tilted desk with a ledge. */
export const STAND = {
  /** How far the tripod's feet reach from the column (m). */
  legReach: 0.3,
  /** Where the legs meet the column. */
  hubHeight: 0.24,
  /** The outer tube's top, where the clamp knob is. */
  outerTop: 0.62,
  outerRadius: 0.013,
  innerRadius: 0.0095,
  /** The desk: a steel plate, tilted back from upright, top away from the player. */
  deskWidth: 0.5,
  deskHeight: 0.32,
  deskTilt: deg(22),
  deskThickness: 0.0025,
  /** The rolled lip along the desk's top edge. */
  rimRadius: 0.004,
  /** The ledge the music stands on, along the desk's bottom. */
  ledgeDepth: 0.05,
  ledgeLip: 0.012,
  /** The desk's back is this far in front of the column's axis, at the ledge. */
  deskAhead: 0.03,
} as const;

/** The ledge height the stand is modelled at (m), and how far the inner tube lets it travel. */
export const NOMINAL_LEDGE = 1.05;
export const RIG_TRAVEL = { down: 0.3, up: 0.2 } as const;

type Vec = readonly [number, number, number];

/** Where the desk is, in stand space with the rig at nominal height. */
export function deskFrame(): { ledge: Vec; up: Vec; normal: Vec; top: Vec } {
  const t = STAND.deskTilt;
  // Up the plate: mostly up, leaning away from the player (-Z).
  const up: Vec = [0, Math.cos(t), -Math.sin(t)];
  // Out of its face, toward the player.
  const normal: Vec = [0, Math.sin(t), Math.cos(t)];
  const ledge: Vec = [0, NOMINAL_LEDGE, STAND.deskAhead];
  const top: Vec = [0, ledge[1] + up[1] * STAND.deskHeight, ledge[2] + up[2] * STAND.deskHeight];
  return { ledge, up, normal, top };
}
