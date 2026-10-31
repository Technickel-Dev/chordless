/**
 * The shape of a 7-inch orchestral triangle and its beater, shared by the
 * models, the strike detection and the performer.
 *
 * Triangle space: the origin is where the hand pinches the clip, +Y is up
 * (the triangle hangs plumb), +Z points toward the player (the face they
 * see) and +X to their right. The triangle hangs from its top corner on a
 * loop; the open corner is bottom right.
 *
 * Beater space: the origin is where the fist grips it, +X runs along the
 * rod toward its tip.
 */

type Vec = [number, number, number];

export const TRIANGLE = {
  /** Centre line, corner to corner (7 inches). */
  side: 0.18,
  barRadius: 0.005,
  /** The corners are bent round this radius (centre line). */
  cornerRadius: 0.012,
  /** From the pinched clip down the loop to the top corner's centre line. */
  loop: 0.045,
  /** The open corner: the base stops this short of it, the right side this short. */
  baseEnd: 0.006,
  legEnd: 0.014,
} as const;

/** The triangle's sides, as the bar's segments are tagged. */
export const SIDE_NAMES = ['base', 'left side', 'right side'] as const;

export const BEATER = {
  /** A steel rod. */
  length: 0.2,
  radius: 0.003,
  /** The rubber grip at the butt end. */
  gripLength: 0.075,
  gripRadius: 0.0055,
  /** The butt end sticks out this far behind the fist. */
  behind: 0.03,
  /** How far the rod angles from straight across the fist toward the fingertips, as with the bow. */
  lean: 0.45,
} as const;

/** The triangle's corners (centre line): top, bottom left, bottom right (the open one). */
const HEIGHT = (TRIANGLE.side * Math.sqrt(3)) / 2;
export const CORNERS: { top: Vec; left: Vec; right: Vec } = {
  top: [0, -TRIANGLE.loop, 0],
  left: [-TRIANGLE.side / 2, -TRIANGLE.loop - HEIGHT, 0],
  right: [TRIANGLE.side / 2, -TRIANGLE.loop - HEIGHT, 0],
};

/**
 * The bar's centre line as a polyline: from the open end of the base,
 * round the bottom-left corner, up the left side, over the top corner and
 * down the right side to its open end. `points` is xyz per point, `s` the
 * distance along the bar to each point, `side` the side each segment
 * belongs to (index into SIDE_NAMES; each corner is split between its two
 * sides).
 */
export const BAR = buildBar();

function buildBar() {
  const { top, left, right } = CORNERS;
  const rc = TRIANGLE.cornerRadius;
  const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], 0];
  const unit = (v: Vec): Vec => {
    const l = Math.hypot(v[0], v[1]);
    return [v[0] / l, v[1] / l, 0];
  };
  const at = (p: Vec, d: Vec, t: number): Vec => [p[0] + d[0] * t, p[1] + d[1] * t, 0];
  // A 60-degree corner's arc meets each side this far from the corner.
  const tangent = rc * Math.sqrt(3);
  const pts: Vec[] = [];
  const sides: number[] = [];
  /** An arc round `corner` from the side toward `from` to the side toward `to`, split between two sides. */
  const corner = (c: Vec, from: Vec, to: Vec, sideA: number, sideB: number) => {
    const a = unit(sub(from, c));
    const b = unit(sub(to, c));
    const p0 = at(c, a, tangent);
    const p1 = at(c, b, tangent);
    const bis = unit([a[0] + b[0], a[1] + b[1], 0]);
    const centre = at(c, bis, 2 * rc);
    const a0 = Math.atan2(p0[1] - centre[1], p0[0] - centre[0]);
    let a1 = Math.atan2(p1[1] - centre[1], p1[0] - centre[0]);
    // The short way round.
    if (a1 - a0 > Math.PI) a1 -= 2 * Math.PI;
    if (a0 - a1 > Math.PI) a1 += 2 * Math.PI;
    const n = 8;
    for (let k = 0; k <= n; k++) {
      const ang = a0 + ((a1 - a0) * k) / n;
      pts.push([centre[0] + rc * Math.cos(ang), centre[1] + rc * Math.sin(ang), 0]);
      if (k > 0) sides.push(k <= n / 2 ? sideA : sideB);
    }
  };
  pts.push(at(right, unit(sub(left, right)), TRIANGLE.baseEnd));
  corner(left, right, top, 0, 1);
  sides.splice(0, 0, 0); // the straight run of the base, before the corner's first point
  corner(top, left, right, 1, 2);
  sides.splice(sides.length - 8, 0, 1); // the left side's straight run
  pts.push(at(right, unit(sub(top, right)), TRIANGLE.legEnd));
  sides.push(2);

  const count = pts.length;
  const points = new Float32Array(count * 3);
  const s = new Float32Array(count);
  pts.forEach((p, i) => {
    points.set(p, i * 3);
    if (i > 0) s[i] = s[i - 1] + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
  });
  return { points, s, side: Int8Array.from(sides), count, length: s[count - 1] };
}
