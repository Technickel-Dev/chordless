import { KNUCKLE, MOUTHPIECE } from "./geometry.js";

type Vec = [number, number, number];

/** The lips, from the head (the point between the eyes): this far below and in front (m). */
export const LIPS = { below: 0.075, forward: 0.025 };

/**
 * The mouthpiece reaches the lips when the knuckle is about as far from
 * them as it is from the mouthpiece on the trumpet: within this much
 * nearer or farther (m), the horn slides along its axis to meet them.
 * Leaving takes a little more, so the lips do not chatter on and off.
 */
export const LIPS_NEARER = 0.09;
export const LIPS_FARTHER = 0.07;
export const LIPS_RELEASE = 0.02;
/** The knuckle must be at least this far in front of the lips (m): the horn is held out, not beside the head. */
export const LIPS_IN_FRONT = 0.08;
/** How fast the horn slides to the lips or back into the hand (time constant, s). */
const SLIDE_TAU = 0.05;

/** Where the trumpet is: its axes and origin in the world, and how it is held. */
export interface HornPose {
  origin: Vec;
  /** Trumpet +X, +Y and +Z in the world. */
  x: Vec;
  y: Vec;
  z: Vec;
  /** The mouthpiece is at the lips. */
  atLips: boolean;
  /** 0 carried in the hand to 1 at the lips: how far the horn has slid. */
  blend: number;
  /** How much farther the knuckle is from the lips than the trumpet holds it (m). */
  reachError: number;
  /**
   * Where along the horn the hand took hold (m): how far the knuckle was from
   * where the trumpet rests it, when the mouthpiece met the lips. The hand may
   * then move this way and that from where it closed, not from one fixed spot.
   * Eases back to 0 once the horn leaves the lips.
   */
  grip: number;
  /** The bell's elevation, degrees above level. */
  elevation: number;
}

export function createHornPose(): HornPose {
  return {
    origin: [0, 0, 0],
    x: [1, 0, 0],
    y: [0, 1, 0],
    z: [0, 0, 1],
    atLips: false,
    blend: 0,
    reachError: 0,
    grip: 0,
    elevation: 0,
  };
}

/** Holds a horn between the lips and a hand; see holdHorn. */
export type HornHold = (
  lips: ArrayLike<number>,
  knuckle: ArrayLike<number>,
  forward: ArrayLike<number>,
  dt: number,
  out: HornPose,
) => HornPose;

// Scratch, reused every frame.
const wa: Vec = [0, 0, 0];
const wb: Vec = [0, 0, 0];
const wc: Vec = [0, 0, 0];
const d: Vec = [0, 0, 0];
const atHand: Vec = [0, 0, 0];
const held: Vec = [0, 0, 0];
const atMouth: Vec = [0, 0, 0];
const UP: Vec = [0, 1, 0];

/**
 * Holds the trumpet between the lips and the right hand. The horn always
 * points from the lips through the hand, kept upright (its valves up, as
 * near as that direction allows), so lifting the hand tilts the bell up,
 * as a trumpet pivots on the lips. Held out at about the trumpet's length
 * the mouthpiece meets the lips; otherwise the horn rides in the hand,
 * pointing back toward the mouth.
 *
 * `lips` and `knuckle` (the right middle knuckle) are world positions;
 * `forward` is the way the head faces. Call once a frame.
 */
export const holdHorn: HornHold = createHornHold(KNUCKLE, MOUTHPIECE);
/** How far the trumpet holds the right middle knuckle from the mouthpiece (m). */
export const HOLD_REACH = Math.hypot(
  KNUCKLE[0] - MOUTHPIECE[0],
  KNUCKLE[1] - MOUTHPIECE[1],
  KNUCKLE[2] - MOUTHPIECE[2],
);

/**
 * A hold like holdHorn's for any horn: `knuckleAt` is where the holding
 * hand's middle knuckle sits and `mouthpiece` the middle of the rim, both
 * in the horn's own space (+Y up, -Z toward the bell).
 */
export function createHornHold(
  knuckleAt: ArrayLike<number>,
  mouthpiece: ArrayLike<number>,
): HornHold {
  // In horn space: from the mouthpiece to the knuckle, and a frame round it.
  const reach = sub(knuckleAt, mouthpiece, [0, 0, 0]);
  const holdReach = Math.hypot(...reach);
  const ta = normalize([...reach]);
  const tb = normalize(orthogonal([0, 1, 0], ta, [0, 0, 0]));
  const tc = cross(ta, tb, [0, 0, 0]);
  return (lips, knuckle, forward, dt, out) => {
    for (let k = 0; k < 3; k++) d[k] = knuckle[k] - lips[k];
    const dist = Math.hypot(d[0], d[1], d[2]);
    if (dist < 1e-4) return out;
    for (let k = 0; k < 3; k++) wa[k] = d[k] / dist;
    orthogonal(UP, wa, wb);
    if (Math.hypot(wb[0], wb[1], wb[2]) < 0.05) {
      // Pointing straight up or down: keep the valves toward the way the head faces.
      orthogonal(forward, wa, wb);
    }
    normalize(wb);
    cross(wa, wb, wc);
    // The rotation that takes the trumpet's frame (ta, tb, tc) onto the world's (wa, wb, wc).
    for (let k = 0; k < 3; k++) {
      out.x[k] = wa[k] * ta[0] + wb[k] * tb[0] + wc[k] * tc[0];
      out.y[k] = wa[k] * ta[1] + wb[k] * tb[1] + wc[k] * tc[1];
      out.z[k] = wa[k] * ta[2] + wb[k] * tb[2] + wc[k] * tc[2];
    }

    out.reachError = dist - holdReach;
    const inFront =
      d[0] * forward[0] + d[1] * forward[1] + d[2] * forward[2] >=
      LIPS_IN_FRONT;
    if (out.atLips) {
      // Held at the lips: the hand may range from where it closed, not from the rest spot.
      const rel = out.reachError - out.grip;
      out.atLips =
        inFront &&
        rel >= -LIPS_NEARER - LIPS_RELEASE &&
        rel <= LIPS_FARTHER + LIPS_RELEASE;
    } else if (
      inFront &&
      out.reachError >= -LIPS_NEARER &&
      out.reachError <= LIPS_FARTHER
    ) {
      // The mouthpiece just met the lips: the grip is wherever the hand is now.
      out.atLips = true;
      out.grip = out.reachError;
    }
    // Off the lips the horn settles back to its usual place in the hand.
    if (!out.atLips) out.grip *= Math.exp(-dt / SLIDE_TAU);
    out.blend +=
      ((out.atLips ? 1 : 0) - out.blend) * (1 - Math.exp(-dt / SLIDE_TAU));

    // Carried, the knuckle is where the hand is; at the lips, the mouthpiece is on them.
    for (let k = 0; k < 3; k++) held[k] = knuckleAt[k] + ta[k] * out.grip;
    for (let k = 0; k < 3; k++) {
      atHand[k] =
        knuckle[k] -
        (out.x[k] * held[0] + out.y[k] * held[1] + out.z[k] * held[2]);
      atMouth[k] =
        lips[k] -
        (out.x[k] * mouthpiece[0] +
          out.y[k] * mouthpiece[1] +
          out.z[k] * mouthpiece[2]);
      out.origin[k] = atHand[k] + (atMouth[k] - atHand[k]) * out.blend;
    }
    // The bell points along trumpet -Z.
    out.elevation =
      (Math.asin(Math.min(1, Math.max(-1, -out.z[1]))) * 180) / Math.PI;
    return out;
  };
}

/** A trumpet-space point `p` in the world, for `pose`. */
export function toWorld(pose: HornPose, p: ArrayLike<number>, outV: Vec): Vec {
  for (let k = 0; k < 3; k++)
    outV[k] =
      pose.origin[k] + pose.x[k] * p[0] + pose.y[k] * p[1] + pose.z[k] * p[2];
  return outV;
}

/** A world point `p` in trumpet space, for `pose` (whose axes are orthonormal). */
export function toTrumpet(
  pose: HornPose,
  p: ArrayLike<number>,
  outV: Vec,
): Vec {
  const x = p[0] - pose.origin[0];
  const y = p[1] - pose.origin[1];
  const z = p[2] - pose.origin[2];
  outV[0] = x * pose.x[0] + y * pose.x[1] + z * pose.x[2];
  outV[1] = x * pose.y[0] + y * pose.y[1] + z * pose.y[2];
  outV[2] = x * pose.z[0] + y * pose.z[1] + z * pose.z[2];
  return outV;
}

function sub(a: ArrayLike<number>, b: ArrayLike<number>, out: Vec): Vec {
  for (let k = 0; k < 3; k++) out[k] = a[k] - b[k];
  return out;
}

/** `v` with its part along the unit vector `n` taken out. */
function orthogonal(v: ArrayLike<number>, n: ArrayLike<number>, out: Vec): Vec {
  const t = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
  for (let k = 0; k < 3; k++) out[k] = v[k] - n[k] * t;
  return out;
}

function cross(a: ArrayLike<number>, b: ArrayLike<number>, out: Vec): Vec {
  const x = a[1] * b[2] - a[2] * b[1];
  const y = a[2] * b[0] - a[0] * b[2];
  const z = a[0] * b[1] - a[1] * b[0];
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}

function normalize(v: Vec): Vec {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  v[0] /= l;
  v[1] /= l;
  v[2] /= l;
  return v;
}
