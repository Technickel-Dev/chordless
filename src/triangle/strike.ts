import { BAR, BEATER, TRIANGLE } from './geometry.js';

type Vec = [number, number, number];

/** Where the triangle hangs: the clip (triangle-space origin) and its axes, in world space. */
export interface TrianglePose {
  origin: Vec;
  x: Vec;
  y: Vec;
  z: Vec;
}

export function createTrianglePose(): TrianglePose {
  return { origin: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
}

/** Where the beater is: the grip, the way it points, and the rod's ends. */
export interface BeaterPose {
  grip: Vec;
  along: Vec;
  butt: Vec;
  tip: Vec;
}

export function createBeaterPose(): BeaterPose {
  return { grip: [0, 0, 0], along: [1, 0, 0], butt: [0, 0, 0], tip: [0, 0, 0] };
}

/** Joint indices read here (WebXR XRHand order). */
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_KNUCKLE = 6;
const INDEX_TIP = 9;
const MIDDLE_KNUCKLE = 11;
const MIDDLE_MIDDLE = 12;
const PINKY_KNUCKLE = 21;
/** The holding hand's free fingers, which damp the triangle by touching it (tips and last joints). */
export const DAMPING_JOINTS = [13, 14, 18, 19, 23, 24] as const;

// Scratch vectors, reused every frame.
const a: Vec = [0, 0, 0];
const b: Vec = [0, 0, 0];

/**
 * The triangle in the left hand: the clip pinched between the thumb and
 * index tips, the triangle hanging plumb below it and turned to face the
 * player's head, as a player holds it up to see it and the conductor.
 */
export function trianglePose(joints: ArrayLike<number>, head: ArrayLike<number>, out: TrianglePose): TrianglePose {
  for (let k = 0; k < 3; k++) out.origin[k] = (joints[THUMB_TIP * 3 + k] + joints[INDEX_TIP * 3 + k]) / 2;
  out.y[0] = 0;
  out.y[1] = 1;
  out.y[2] = 0;
  let zx = head[0] - out.origin[0];
  let zz = head[2] - out.origin[2];
  const l = Math.hypot(zx, zz);
  if (l < 1e-4) {
    zx = 0;
    zz = 1;
  } else {
    zx /= l;
    zz /= l;
  }
  out.z[0] = zx;
  out.z[1] = 0;
  out.z[2] = zz;
  // x = y cross z.
  out.x[0] = zz;
  out.x[1] = 0;
  out.x[2] = -zx;
  return out;
}

/**
 * The beater in the right fist, held like a drumstick: it runs from the
 * pinky side of the fist out past the thumb and index, angled a little
 * toward the fingertips.
 */
export function beaterPose(joints: ArrayLike<number>, out: BeaterPose): BeaterPose {
  const p = (j: number, k: number) => joints[j * 3 + k];
  for (let k = 0; k < 3; k++) {
    out.grip[k] = (p(THUMB_TIP, k) + p(MIDDLE_MIDDLE, k)) / 2;
    a[k] = p(INDEX_KNUCKLE, k) - p(PINKY_KNUCKLE, k);
    b[k] = p(MIDDLE_KNUCKLE, k) - p(WRIST, k);
  }
  normalize(a);
  normalize(b);
  for (let k = 0; k < 3; k++) out.along[k] = a[k] + b[k] * BEATER.lean;
  normalize(out.along);
  for (let k = 0; k < 3; k++) {
    out.butt[k] = out.grip[k] - out.along[k] * BEATER.behind;
    out.tip[k] = out.grip[k] + out.along[k] * (BEATER.length - BEATER.behind);
  }
  return out;
}

/** A world point into triangle space. */
export function toTriangle(t: TrianglePose, p: ArrayLike<number>, out: Vec): Vec {
  const dx = p[0] - t.origin[0];
  const dy = p[1] - t.origin[1];
  const dz = p[2] - t.origin[2];
  out[0] = dx * t.x[0] + dy * t.x[1] + dz * t.x[2];
  out[1] = dx * t.y[0] + dy * t.y[1] + dz * t.y[2];
  out[2] = dx * t.z[0] + dy * t.z[1] + dz * t.z[2];
  return out;
}

function normalize(v: Vec): Vec {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  v[0] /= l;
  v[1] /= l;
  v[2] /= l;
  return v;
}

/** The beater touches the bar from this close, centre line to centre line (with tracking's slack). */
export const CONTACT = TRIANGLE.barRadius + BEATER.radius + 0.0015;
/**
 * After a strike, the beater must come this far off that side, back on the
 * side it struck from, before it can strike it again: a hand follows
 * through a bar it cannot feel, and pulling back is not another strike.
 */
export const REARM = CONTACT + 0.006;
/** Further than this from a side, the beater can strike it again whichever side it is on. */
const CLEAR = 0.08;
/** Beater speed into the bar (m/s) under which it touches silently. */
export const SOUNDING_SPEED = 0.08;
/** Beater speed into the bar (m/s) of a fortissimo strike. */
export const FULL_STRIKE_SPEED = 2.4;
/** Faster than a beater moves (m/s): a jump in tracking, which makes no sound. */
export const MAX_STRIKE_SPEED = 12;
/** A beater resting on the bar this long damps it. */
export const REST_TO_DAMP = 0.1;
/** The holding hand's fingers damp the triangle from this close to the bar's centre line. */
export const FINGER_DAMP = TRIANGLE.barRadius + 0.012;
/** One long frame (a hitch) adds at most this to how long the beater has rested on the bar. */
const MAX_HOLD_STEP = 1 / 30;
/** Each frame's motion is checked in this many steps, so a fast beater cannot pass through the bar unseen. */
const SUBSTEPS = 12;
const SIDES = 3;
/**
 * A strike's speed is the beater's average approach over about this long
 * before it touched (s): tracked positions jitter frame to frame, and what
 * the beater does after touching (stopping, bouncing) is not the strike.
 */
const SPEED_WINDOW = 0.02;
/** Frames of the beater's past kept for that. */
const HISTORY = 8;

/** How loud a strike is, 0 to 1, from the beater's speed into the bar (m/s). */
export function strikeLoudness(speed: number): number {
  return Math.min(1, Math.max(0, (speed - SOUNDING_SPEED) / (FULL_STRIKE_SPEED - SOUNDING_SPEED))) ** 0.6;
}

/** The bar's segments on each side. */
const SEGMENTS_OF: number[][] = Array.from({ length: SIDES }, (_, side) =>
  Array.from(BAR.side.keys()).filter((i) => BAR.side[i] === side),
);

// Closest points between two segments: results, reused.
const near = { dist: 0, u: 0, v: 0 };
const d1: Vec = [0, 0, 0];
const d2: Vec = [0, 0, 0];
const r: Vec = [0, 0, 0];

/** Closest approach between segments p0-p1 and q0-q1 (Ericson); fills `near` (u on p, v on q). */
function segmentDistance(p0: ArrayLike<number>, p1: ArrayLike<number>, q0: ArrayLike<number>, q1: ArrayLike<number>): void {
  for (let k = 0; k < 3; k++) {
    d1[k] = p1[k] - p0[k];
    d2[k] = q1[k] - q0[k];
    r[k] = p0[k] - q0[k];
  }
  const aa = dot(d1, d1);
  const ee = dot(d2, d2);
  const ff = dot(d2, r);
  let u = 0;
  let v = 0;
  if (aa < 1e-12 && ee < 1e-12) {
    u = 0;
    v = 0;
  } else if (aa < 1e-12) {
    v = clamp01(ff / ee);
  } else {
    const cc = dot(d1, r);
    if (ee < 1e-12) {
      u = clamp01(-cc / aa);
    } else {
      const bb = dot(d1, d2);
      const den = aa * ee - bb * bb;
      u = den > 1e-12 ? clamp01((bb * ff - cc * ee) / den) : 0;
      v = (bb * u + ff) / ee;
      if (v < 0) {
        v = 0;
        u = clamp01(-cc / aa);
      } else if (v > 1) {
        v = 1;
        u = clamp01((bb - cc) / aa);
      }
    }
  }
  let s = 0;
  for (let k = 0; k < 3; k++) {
    const x = p0[k] + d1[k] * u - (q0[k] + d2[k] * v);
    s += x * x;
  }
  near.dist = Math.sqrt(s);
  near.u = u;
  near.v = v;
}

const q0: Vec = [0, 0, 0];
const q1: Vec = [0, 0, 0];
const r2: Vec = [0, 0, 0];
/** Closest approach of a beater segment to one side; returns the distance, fills `hit`. */
function sideDistance(butt: Vec, tip: Vec, side: number, hit: { u: number; bar: Vec; s: number }): number {
  let best = Infinity;
  for (const i of SEGMENTS_OF[side]) {
    for (let k = 0; k < 3; k++) {
      q0[k] = BAR.points[i * 3 + k];
      q1[k] = BAR.points[(i + 1) * 3 + k];
    }
    segmentDistance(butt, tip, q0, q1);
    if (near.dist < best) {
      best = near.dist;
      hit.u = near.u;
      for (let k = 0; k < 3; k++) hit.bar[k] = q0[k] + (q1[k] - q0[k]) * near.v;
      hit.s = BAR.s[i] + (BAR.s[i + 1] - BAR.s[i]) * near.v;
    }
  }
  return best;
}

/** Whether any of `points` (xyz each, triangle space) touches the bar: the holding hand's fingers damping it. */
export function touchesBar(points: ArrayLike<number>, count: number): boolean {
  for (let j = 0; j < count; j++) {
    for (let i = 0; i < BAR.count - 1; i++) {
      for (let k = 0; k < 3; k++) {
        q0[k] = BAR.points[i * 3 + k];
        q1[k] = BAR.points[(i + 1) * 3 + k];
        r2[k] = points[j * 3 + k];
      }
      segmentDistance(r2, r2, q0, q1);
      if (near.dist <= FINGER_DAMP) return true;
    }
  }
  return false;
}

function dot(x: ArrayLike<number>, y: ArrayLike<number>): number {
  return x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * Watches the beater against the triangle. Feed it the beater's ends in
 * triangle space once a frame (the triangle moves with the hand, so only
 * the beater's motion relative to it counts). The frame's motion is
 * checked in small steps; a strike sounds the moment the rod reaches a
 * side's surface, as loud as it was moving into the bar (on average over
 * the last few hundredths of a second before it touched), and each
 * side must be left, back the way it came, before it can be struck again
 * (so a roll inside a corner, side to side, strikes every time, and
 * following through does not). A beater resting on the bar damps it.
 */
export class StrikeDetector {
  /** Set on the frame of a strike, with how it sounded. */
  struck = false;
  loudness = 0;
  /** Beater speed into the bar at the last strike (m/s). */
  speed = 0;
  /** The side last struck (index into SIDE_NAMES), and where along the bar (m from the base's open end). */
  side = -1;
  position = 0;
  /** How square to the triangle's face the last strike was: 1 straight into the face, 0 within its plane. */
  across = 0;
  strikes = 0;
  touching = false;
  damping = false;

  private readonly prevButt: Vec = [0, 0, 0];
  private readonly prevTip: Vec = [0, 0, 0];
  private hasPrev = false;
  /** The beater's ends at the end of recent frames, and each frame's length: a ring, newest at `head`. */
  private readonly pastButt = new Float32Array(HISTORY * 3);
  private readonly pastTip = new Float32Array(HISTORY * 3);
  private readonly pastDt = new Float32Array(HISTORY);
  private head = 0;
  private count = 0;
  private readonly armed = [true, true, true];
  /** The way each side was struck from (unit, triangle space), until it is armed again. */
  private readonly from: Vec[] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  private touchTime = 0;
  private readonly hit = { u: 0, bar: [0, 0, 0] as Vec, s: 0 };
  private readonly sb: Vec = [0, 0, 0];
  private readonly st: Vec = [0, 0, 0];

  update(butt: Vec, tip: Vec, dt: number): void {
    this.struck = false;
    if (!this.hasPrev) {
      this.remember(butt, tip);
      this.settle(butt, tip);
      return;
    }
    let best = 0;
    const step = dt / SUBSTEPS;
    for (let k = 1; k <= SUBSTEPS && step > 0; k++) {
      lerp(this.prevButt, butt, k / SUBSTEPS, this.sb);
      lerp(this.prevTip, tip, k / SUBSTEPS, this.st);
      for (let side = 0; side < SIDES; side++) {
        if (!this.armed[side]) continue;
        const dist = sideDistance(this.sb, this.st, side, this.hit);
        if (dist > CONTACT) continue;
        this.armed[side] = false;
        // Which way the rod touched the bar from, and how fast it came in.
        const u = this.hit.u;
        let len = 0;
        for (let j = 0; j < 3; j++) {
          const n = this.sb[j] + (this.st[j] - this.sb[j]) * u - this.hit.bar[j];
          this.from[side][j] = n;
          len += n * n;
        }
        len = Math.sqrt(len) || 1;
        for (let j = 0; j < 3; j++) this.from[side][j] /= len;
        const normal = this.from[side][2];
        const into = this.approach(u, this.from[side], k * step);
        if (into < SOUNDING_SPEED || into > MAX_STRIKE_SPEED || into <= best) continue;
        best = into;
        this.side = side;
        this.position = this.hit.s;
        this.across = Math.abs(normal);
      }
    }
    if (best > 0) {
      this.struck = true;
      this.strikes++;
      this.speed = best;
      this.loudness = strikeLoudness(best);
      this.touchTime = 0;
    }
    this.settle(butt, tip);
    this.touchTime = this.touching ? this.touchTime + Math.min(dt, MAX_HOLD_STEP) : 0;
    this.damping = this.touching && this.touchTime >= REST_TO_DAMP;
    this.remember(butt, tip, dt);
  }

  /**
   * How fast the rod's point at `u` (0 butt, 1 tip) was moving along `n`
   * into the bar, on average over SPEED_WINDOW up to the moment it
   * touched, `into` seconds into this frame (where it is at this.sb-st).
   */
  private approach(u: number, n: Vec, into: number): number {
    // Where the rod's point was SPEED_WINDOW ago: within this frame (moving
    // linearly from its start), or back through the past frames, between the
    // two frame ends either side of that moment.
    const point = (i: number, j: number) => this.pastButt[i * 3 + j] + (this.pastTip[i * 3 + j] - this.pastButt[i * 3 + j]) * u;
    let along = 0;
    if (into >= SPEED_WINDOW || this.count < 2) {
      const span = into >= SPEED_WINDOW ? SPEED_WINDOW : into;
      if (span <= 0) return 0;
      const f = into > 0 ? span / into : 1;
      for (let j = 0; j < 3; j++) {
        const now = this.sb[j] + (this.st[j] - this.sb[j]) * u;
        along += (point(this.head, j) - now) * f * n[j];
      }
      return along / span;
    }
    let need = SPEED_WINDOW - into;
    let span = into;
    let i = this.head;
    let left = this.count;
    let f = 0;
    let older = i;
    while (left > 1) {
      older = (i - 1 + HISTORY) % HISTORY;
      const d = this.pastDt[i];
      if (d >= need) {
        f = d > 0 ? need / d : 0;
        span += need;
        break;
      }
      need -= d;
      span += d;
      i = older;
      left--;
      f = 0;
    }
    if (span <= 0) return 0;
    for (let j = 0; j < 3; j++) {
      const then = point(i, j) + (point(older, j) - point(i, j)) * f;
      const now = this.sb[j] + (this.st[j] - this.sb[j]) * u;
      along += (then - now) * n[j];
    }
    return along / span;
  }

  /** Forgets the beater's motion (after tracking is lost, or the triangle is put away). */
  reset(): void {
    this.hasPrev = false;
    this.count = 0;
    this.touching = false;
    this.damping = false;
    this.struck = false;
    this.touchTime = 0;
    this.armed.fill(true);
  }

  /** Where the beater now is against each side: touching, or far enough off to strike it again. */
  private settle(butt: Vec, tip: Vec): void {
    this.touching = false;
    for (let side = 0; side < SIDES; side++) {
      const dist = sideDistance(butt, tip, side, this.hit);
      if (dist <= CONTACT) {
        this.touching = true;
        if (this.armed[side]) {
          // Touched without striking (it arrived too slowly): it may leave either way.
          this.from[side].fill(0);
        }
        this.armed[side] = false;
      } else if (!this.armed[side] && dist > REARM) {
        let back = 0;
        for (let j = 0; j < 3; j++) back += (butt[j] + (tip[j] - butt[j]) * this.hit.u - this.hit.bar[j]) * this.from[side][j];
        const fromAnywhere = this.from[side][0] === 0 && this.from[side][1] === 0 && this.from[side][2] === 0;
        if (back > 0 || fromAnywhere || dist > CLEAR) this.armed[side] = true;
      }
    }
  }

  private remember(butt: Vec, tip: Vec, dt = 0): void {
    for (let k = 0; k < 3; k++) {
      this.prevButt[k] = butt[k];
      this.prevTip[k] = tip[k];
    }
    this.hasPrev = true;
    // The ring keeps each frame's end; its dt is how long the frame that ended there took.
    this.head = (this.head + 1) % HISTORY;
    this.pastButt.set(butt, this.head * 3);
    this.pastTip.set(tip, this.head * 3);
    this.pastDt[this.head] = dt;
    this.count = Math.min(HISTORY, this.count + 1);
  }
}

function lerp(x: ArrayLike<number>, y: ArrayLike<number>, u: number, out: Vec): Vec {
  for (let k = 0; k < 3; k++) out[k] = x[k] + (y[k] - x[k]) * u;
  return out;
}
