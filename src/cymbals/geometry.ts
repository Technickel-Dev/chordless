/**
 * The shape of an 18-inch orchestral clash cymbal, shared by its model and
 * the clash detection. Cymbal space: the origin is the centre of the plane
 * through the rim, on the plate's mid-thickness; +Z points out of the
 * concave playing face (toward the other cymbal), and the bell rises toward
 * -Z, where the strap and the hand are. X runs across the strap loop.
 */

export const CYMBAL = {
  /** 18 inches across. */
  radius: 0.2286,
  /** Where the bell meets the bow. */
  bellRadius: 0.064,
  /** The strap's hole through the top of the bell. */
  holeRadius: 0.006,
  /** The bow rises this far from the rim to the bell's base (mid-thickness). */
  bowHeight: 0.024,
  /** And the bell this much more to its top. */
  bellHeight: 0.025,
  edgeThickness: 0.0013,
  bowThickness: 0.0026,
  bellThickness: 0.003,
  /** The leather pad between the bell and the hand. */
  padRadius: 0.042,
  padThickness: 0.007,
  /** How far beyond the pad the hand closes round the strap. */
  gripBeyondPad: 0.012,
} as const;

/** How far the plate's mid-thickness rises toward the bell (toward -Z) at radius `r`. */
export function midlineHeight(r: number): number {
  const { radius, bellRadius, holeRadius, bowHeight, bellHeight } = CYMBAL;
  if (r >= bellRadius) {
    // The bow: a shallow cone, a little fuller toward the bell.
    const t = Math.min(1, (radius - r) / (radius - bellRadius));
    return bowHeight * t ** 1.12;
  }
  // The bell: a dome rising from the bow, rounded over at the top.
  const t = Math.max(0, (r - holeRadius) / (bellRadius - holeRadius));
  return bowHeight + bellHeight * (1 - t ** 2.2) ** 0.62;
}

/** The plate's thickness at radius `r`: thin at the edge, thickest in the bell. */
export function thicknessAt(r: number): number {
  const { radius, bellRadius, edgeThickness, bowThickness, bellThickness } = CYMBAL;
  if (r >= bellRadius) {
    const t = (radius - r) / (radius - bellRadius);
    return edgeThickness + (bowThickness - edgeThickness) * Math.min(1, t) ** 0.8;
  }
  return bellThickness;
}

/** The top of the bell, on its outer (hand) side, as a distance toward -Z. */
export const BELL_TOP = midlineHeight(CYMBAL.holeRadius) + CYMBAL.bellThickness / 2;

/** From the face's centre back to where the hand closes round the strap (along -Z). */
export const GRIP_DEPTH = BELL_TOP + CYMBAL.padThickness + CYMBAL.gripBeyondPad;
