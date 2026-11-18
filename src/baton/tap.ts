import { BATON, STAND } from './geometry.js';

type Vec = [number, number, number];

/** Where the baton is: the grip, the way it points, and its tip. */
export interface BatonPose {
  grip: Vec;
  along: Vec;
  tip: Vec;
}

export function createBatonPose(): BatonPose {
  return { grip: [0, 0, 0], along: [0, 0, -1], tip: [0, 0, -BATON.reach] };
}

/** Joint indices batonPose reads (WebXR XRHand order). */
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_KNUCKLE = 6;
const MIDDLE_KNUCKLE = 11;
const MIDDLE_MIDDLE = 12;
const PINKY_KNUCKLE = 21;

const a: Vec = [0, 0, 0];
const b: Vec = [0, 0, 0];

/**
 * The baton in the right hand (joint positions, xyz per joint, any space):
 * gripped between the thumb and the curled fingers, pointing where the
 * knuckles point, leaning a little toward the thumb.
 */
export function batonPose(joints: ArrayLike<number>, out: BatonPose): BatonPose {
  const p = (j: number, k: number) => joints[j * 3 + k];
  for (let k = 0; k < 3; k++) {
    out.grip[k] = (p(THUMB_TIP, k) + p(MIDDLE_MIDDLE, k)) / 2;
    a[k] = p(INDEX_KNUCKLE, k) - p(PINKY_KNUCKLE, k);
    b[k] = p(MIDDLE_KNUCKLE, k) - p(WRIST, k);
  }
  normalize(b);
  const l = dot(a, b);
  for (let k = 0; k < 3; k++) a[k] -= b[k] * l;
  normalize(a);
  for (let k = 0; k < 3; k++) out.along[k] = b[k] + a[k] * BATON.lean;
  normalize(out.along);
  tipOf(out);
  return out;
}

export function tipOf(pose: BatonPose): void {
  for (let k = 0; k < 3; k++) pose.tip[k] = pose.grip[k] + pose.along[k] * BATON.reach;
}

/** The part of the stand a tap lands on. */
export type Spot = 'rim' | 'desk' | 'ledge';
export const SPOTS: readonly Spot[] = ['rim', 'desk', 'ledge'];
export const SPOT_NAMES: Record<Spot, string> = { rim: 'Top edge', desk: 'Desk', ledge: 'Ledge' };

/** How much of the baton, back from the tip, can strike the stand (m): the rest is in the hand. */
export const STRIKING_LENGTH = 0.22;
/** The shaft's radius along the striking length, about. */
const SHAFT = 0.0022;
/** After a tap, the baton must come this far off that spot before it can tap it again. */
export const REARM_GAP = 0.01;
/** Approach speed (m/s) under which the baton only rests on the stand. */
export const SOUNDING_SPEED = 0.15;
/** Approach speed (m/s) of the loudest tap. */
export const FULL_TAP_SPEED = 3.2;
/** Faster than a baton moves (m/s): a baton that seems to, jumped in tracking. */
export const MAX_SPEED = 25;
/** The baton is swept between frames in steps no longer than this (m), so it cannot pass through an edge. */
const STEP = 0.006;
const MAX_STEPS = 24;
/** Points along the striking length tested against the desk's face. */
const SAMPLES = 8;
/** Deeper behind the desk's face than this, a point is behind the stand, not in the desk. */
const BEHIND = 0.03;

/** How loud a tap is, 0 to 1, from the baton's approach speed (m/s). */
export function tapLoudness(speed: number): number {
  return Math.min(1, Math.max(0, (speed - SOUNDING_SPEED) / (FULL_TAP_SPEED - SOUNDING_SPEED))) ** 0.6;
}

/** The edges, in desk space (see geometry.ts): from, to, radius. */
const W = STAND.deskWidth / 2;
const EDGES: Record<'rim' | 'ledge', { from: Vec; to: Vec; radius: number }> = {
  rim: { from: [-W, STAND.deskHeight, -0.002], to: [W, STAND.deskHeight, -0.002], radius: STAND.rimRadius + SHAFT },
  ledge: { from: [-W, STAND.ledgeLip, STAND.ledgeDepth - 0.002], to: [W, STAND.ledgeLip, STAND.ledgeDepth - 0.002], radius: 0.003 + SHAFT },
};

/** One tap, as the detector found it. */
export interface Tap {
  spot: Spot;
  loudness: number;
  /** Approach speed (m/s). */
  speed: number;
  /** Across the desk, -1 at its left edge to 1 at its right. */
  across: number;
}

// Scratch, reused every frame.
const base: Vec = [0, 0, 0];
const tip: Vec = [0, 0, 0];
const pBase: Vec = [0, 0, 0];
const pTip: Vec = [0, 0, 0];
const point: Vec = [0, 0, 0];
const found = { gap: 0, approach: 0, across: 0, crossed: false };
/** From an edge to the nearest point of the baton, as segmentDistance last found it, and the step before. */
const offset: Vec = [0, 0, 0];
const offsetBefore: Vec = [0, 0, 0];

/**
 * How far the striking length (base to tip, desk space) is from `spot`, how
 * fast it is closing on it, and whether it came into it from outside, given
 * where it was a moment `h` (s) before. Sets `found`. A point of the baton
 * only strikes the desk by passing through its face from the front: one
 * that comes over the top edge, or round a side, behind the face does not.
 */
function measure(spot: Spot, b: Vec, t: Vec, pb: Vec, pt: Vec, h: number): void {
  if (spot === 'desk') {
    found.gap = Infinity;
    found.approach = 0;
    found.crossed = false;
    for (let i = 0; i < SAMPLES; i++) {
      const f = i / (SAMPLES - 1);
      for (let k = 0; k < 3; k++) point[k] = b[k] + (t[k] - b[k]) * f;
      if (Math.abs(point[0]) > W || point[1] < STAND.ledgeLip || point[1] > STAND.deskHeight || point[2] < -BEHIND) continue;
      const gap = point[2] - SHAFT;
      const before = pb[2] + (pt[2] - pb[2]) * f - SHAFT;
      const crossing = before > 0 && gap <= 0;
      // The first point to pass through the face is the one that struck it.
      if (found.crossed && !crossing) {
        found.gap = Math.min(found.gap, gap);
        continue;
      }
      if (gap >= found.gap && crossing === found.crossed) continue;
      found.gap = Math.min(found.gap, gap);
      found.crossed ||= crossing;
      found.across = point[0] / W;
      found.approach = (before - gap) / h;
    }
    return;
  }
  const edge = EDGES[spot];
  const before = segmentDistance(pb, pt, edge.from, edge.to);
  offsetBefore[0] = offset[0];
  offsetBefore[1] = offset[1];
  offsetBefore[2] = offset[2];
  const now = segmentDistance(b, t, edge.from, edge.to);
  const across = closestOnEdge * 2 - 1;
  found.gap = now - edge.radius;
  found.across = across;
  found.approach = (before - now) / h;
  found.crossed = before - edge.radius > 0 && found.gap <= 0;
}

/**
 * Watches the baton for taps on the stand. Feed it the striking length's
 * ends once a frame, in desk space. The baton is swept from where it was
 * in small steps, so a quick flick cannot pass through the top edge
 * unheard. A tap lands when it comes into contact with a spot it had come
 * clear of, as loud as it was closing in; that spot must be cleared again
 * before it sounds again. Coming into the desk from behind is silent.
 */
export class TapDetector {
  /** The baton is in contact with the stand. */
  touching = false;
  taps = 0;
  private has = false;
  private readonly prevBase: Vec = [0, 0, 0];
  private readonly prevTip: Vec = [0, 0, 0];
  private readonly gaps = new Float64Array(SPOTS.length);
  private readonly approachBefore = new Float64Array(SPOTS.length);
  /** Per edge: which way the baton came at it from when it last struck it (unit), or zero. */
  private readonly struckFrom = new Float64Array(SPOTS.length * 3);
  private readonly armed = SPOTS.map(() => true);
  private readonly lastApproach = new Float64Array(SPOTS.length);
  private readonly tap: Tap = { spot: 'rim', loudness: 0, speed: 0, across: 0 };

  update(strikeBase: ArrayLike<number>, strikeTip: ArrayLike<number>, dt: number): Tap | null {
    if (!this.has || dt <= 0) {
      for (let k = 0; k < 3; k++) {
        this.prevBase[k] = strikeBase[k];
        this.prevTip[k] = strikeTip[k];
      }
      for (let s = 0; s < SPOTS.length; s++) {
        measure(SPOTS[s], this.prevBase, this.prevTip, this.prevBase, this.prevTip, 1);
        this.gaps[s] = found.gap;
        this.armed[s] = found.gap > REARM_GAP;
      }
      this.has = true;
      this.touching = false;
      return null;
    }
    let travel = 0;
    for (let k = 0; k < 3; k++) {
      travel = Math.max(travel, Math.abs(strikeTip[k] - this.prevTip[k]), Math.abs(strikeBase[k] - this.prevBase[k]));
    }
    travel *= Math.sqrt(3);
    const jump = travel / dt > MAX_SPEED;
    const steps = Math.min(MAX_STEPS, Math.max(1, Math.ceil(travel / STEP)));
    const h = dt / steps;
    let hit = -1;
    let speed = 0;
    let across = 0;
    for (let i = 1; i <= steps; i++) {
      const f = i / steps;
      const g = (i - 1) / steps;
      for (let k = 0; k < 3; k++) {
        base[k] = this.prevBase[k] + (strikeBase[k] - this.prevBase[k]) * f;
        tip[k] = this.prevTip[k] + (strikeTip[k] - this.prevTip[k]) * f;
        pBase[k] = this.prevBase[k] + (strikeBase[k] - this.prevBase[k]) * g;
        pTip[k] = this.prevTip[k] + (strikeTip[k] - this.prevTip[k]) * g;
      }
      for (let s = 0; s < SPOTS.length; s++) {
        measure(SPOTS[s], base, tip, pBase, pTip, h);
        this.gaps[s] = found.gap;
        if (i === steps) this.lastApproach[s] = found.approach;
        // A baton pushed right through an edge must come back round to the side it struck from.
        const back = SPOTS[s] === 'desk' || this.struckFrom[s * 3] * offset[0] + this.struckFrom[s * 3 + 1] * offset[1] + this.struckFrom[s * 3 + 2] * offset[2] >= 0;
        if (found.gap > REARM_GAP && back) this.armed[s] = true;
        if (!found.crossed) continue;
        if (SPOTS[s] !== 'desk' && this.armed[s]) {
          const l = Math.hypot(offsetBefore[0], offsetBefore[1], offsetBefore[2]) || 1;
          for (let k = 0; k < 3; k++) this.struckFrom[s * 3 + k] = offsetBefore[k] / l;
        }
        if (hit < 0 && this.armed[s]) {
          hit = s;
          // The baton slows as it lands; a tap is as fast as it was coming in.
          speed = Math.max(found.approach, this.approachBefore[s]);
          across = found.across;
        }
        this.armed[s] = false;
      }
    }
    this.touching = false;
    for (let s = 0; s < SPOTS.length; s++) {
      this.approachBefore[s] = this.lastApproach[s];
      if (this.gaps[s] <= 0.002) this.touching = true;
    }
    for (let k = 0; k < 3; k++) {
      this.prevBase[k] = strikeBase[k];
      this.prevTip[k] = strikeTip[k];
    }
    if (hit < 0 || jump || speed < SOUNDING_SPEED) return null;
    const tap = this.tap;
    tap.spot = SPOTS[hit];
    tap.speed = speed;
    tap.loudness = tapLoudness(speed);
    tap.across = Math.max(-1, Math.min(1, across));
    this.taps++;
    return tap;
  }

  /** Forgets the baton's motion (after tracking is lost, or the stand moves or is put away). */
  reset(): void {
    this.has = false;
    this.touching = false;
    this.armed.fill(true);
    this.lastApproach.fill(0);
    this.approachBefore.fill(0);
    this.struckFrom.fill(0);
  }
}

/**
 * Turns the baton about its grip so its tip rests on the desk's face
 * instead of passing into it (desk space; changes `tipPoint`). Leaves it
 * alone if the tip is not into the desk, or the grip is not in front of it.
 */
export function restOnDesk(grip: ArrayLike<number>, tipPoint: Vec): boolean {
  const z = tipPoint[2] - SHAFT;
  if (z >= 0 || tipPoint[2] < -BEHIND || Math.abs(tipPoint[0]) > W || tipPoint[1] < STAND.ledgeLip || tipPoint[1] > STAND.deskHeight) return false;
  if (grip[2] <= SHAFT) return false;
  const bz = (SHAFT - grip[2]) / BATON.reach;
  if (bz <= -1) return false;
  const dx = tipPoint[0] - grip[0];
  const dy = tipPoint[1] - grip[1];
  const flat = Math.hypot(dx, dy);
  if (flat < 1e-6) return false;
  const s = (Math.sqrt(1 - bz * bz) * BATON.reach) / flat;
  tipPoint[0] = grip[0] + dx * s;
  tipPoint[1] = grip[1] + dy * s;
  tipPoint[2] = grip[2] + bz * BATON.reach;
  return true;
}

/** Where on the edge the last segmentDistance found the closest point, 0 to 1. */
let closestOnEdge = 0;
const d1: Vec = [0, 0, 0];
const d2: Vec = [0, 0, 0];
const r: Vec = [0, 0, 0];

/** The shortest distance between segments p1-q1 and p2-q2 (after Ericson, Real-Time Collision Detection 5.1.9). */
export function segmentDistance(p1: ArrayLike<number>, q1: ArrayLike<number>, p2: ArrayLike<number>, q2: ArrayLike<number>): number {
  for (let k = 0; k < 3; k++) {
    d1[k] = q1[k] - p1[k];
    d2[k] = q2[k] - p2[k];
    r[k] = p1[k] - p2[k];
  }
  const aa = dot(d1, d1);
  const ee = dot(d2, d2);
  const ff = dot(d2, r);
  let s = 0;
  let t = 0;
  if (aa <= 1e-12 && ee > 1e-12) {
    t = clamp01(ff / ee);
  } else if (aa > 1e-12) {
    const c = dot(d1, r);
    if (ee <= 1e-12) {
      s = clamp01(-c / aa);
    } else {
      const bb = dot(d1, d2);
      const denom = aa * ee - bb * bb;
      s = denom > 1e-12 ? clamp01((bb * ff - c * ee) / denom) : 0;
      t = (bb * s + ff) / ee;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / aa);
      } else if (t > 1) {
        t = 1;
        s = clamp01((bb - c) / aa);
      }
    }
  }
  closestOnEdge = t;
  let sum = 0;
  for (let k = 0; k < 3; k++) {
    const v = p1[k] + d1[k] * s - (p2[k] + d2[k] * t);
    offset[k] = v;
    sum += v * v;
  }
  return Math.sqrt(sum);
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function dot(x: ArrayLike<number>, y: ArrayLike<number>): number {
  return x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
}

function normalize(v: Vec): Vec {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  v[0] /= l;
  v[1] /= l;
  v[2] /= l;
  return v;
}
