import { KNUCKLE, MOUTHPIECE } from './geometry.js';

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
  /** The bell's elevation, degrees above level. */
  elevation: number;
}

export function createHornPose(): HornPose {
  return { origin: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1], atLips: false, blend: 0, reachError: 0, elevation: 0 };
}

// In trumpet space: from the mouthpiece to the knuckle, and a frame round it.
const reach = sub(KNUCKLE, MOUTHPIECE, [0, 0, 0]);
export const HOLD_REACH = Math.hypot(...reach);
const ta = normalize([...reach]);
const tb = normalize(orthogonal([0, 1, 0], ta, [0, 0, 0]));
const tc = cross(ta, tb, [0, 0, 0]);

// Scratch, reused every frame.
const wa: Vec = [0, 0, 0];
const wb: Vec = [0, 0, 0];
const wc: Vec = [0, 0, 0];
const d: Vec = [0, 0, 0];
const atHand: Vec = [0, 0, 0];
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
export function holdHorn(
  lips: ArrayLike<number>,
  knuckle: ArrayLike<number>,
  forward: ArrayLike<number>,
  dt: number,
  out: HornPose,
): HornPose {
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

  out.reachError = dist - HOLD_REACH;
  const inFront = d[0] * forward[0] + d[1] * forward[1] + d[2] * forward[2] >= LIPS_IN_FRONT;
  const slack = out.atLips ? LIPS_RELEASE : 0;
  out.atLips = inFront && out.reachError >= -LIPS_NEARER - slack && out.reachError <= LIPS_FARTHER + slack;
  out.blend += ((out.atLips ? 1 : 0) - out.blend) * (1 - Math.exp(-dt / SLIDE_TAU));

  // Carried, the knuckle is where the hand is; at the lips, the mouthpiece is on them.
  for (let k = 0; k < 3; k++) {
    atHand[k] = knuckle[k] - (out.x[k] * KNUCKLE[0] + out.y[k] * KNUCKLE[1] + out.z[k] * KNUCKLE[2]);
    atMouth[k] = lips[k] - (out.x[k] * MOUTHPIECE[0] + out.y[k] * MOUTHPIECE[1] + out.z[k] * MOUTHPIECE[2]);
    out.origin[k] = atHand[k] + (atMouth[k] - atHand[k]) * out.blend;
  }
  // The bell points along trumpet -Z.
  out.elevation = (Math.asin(Math.min(1, Math.max(-1, -out.z[1]))) * 180) / Math.PI;
  return out;
}

/** A trumpet-space point `p` in the world, for `pose`. */
export function toWorld(pose: HornPose, p: ArrayLike<number>, outV: Vec): Vec {
  for (let k = 0; k < 3; k++) outV[k] = pose.origin[k] + pose.x[k] * p[0] + pose.y[k] * p[1] + pose.z[k] * p[2];
  return outV;
}

/** A world point `p` in trumpet space, for `pose` (whose axes are orthonormal). */
export function toTrumpet(pose: HornPose, p: ArrayLike<number>, outV: Vec): Vec {
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
