import { type Piece, PIECES, type Surface, surfaceOf, TIP_REACH, ZONES } from './geometry.js';

type Vec = [number, number, number];

/** Where a stick is: where the fist holds it, which way it points, and its tip. */
export interface StickPose {
  grip: Vec;
  /** From the grip toward the tip (stick +Y). */
  axis: Vec;
  /** Across the back of the hand, completing the stick's frame (stick +Z). */
  side: Vec;
  /** The tip bead's centre. */
  tip: Vec;
}

export function createStickPose(): StickPose {
  return { grip: [0, 0, 0], axis: [0, 0, -1], side: [0, 1, 0], tip: [0, 0, -TIP_REACH] };
}

/** Joint indices stickPose reads (WebXR XRHand order). */
const WRIST = 0;
const INDEX_KNUCKLE = 6;
const MIDDLE_JOINTS = [11, 12, 13, 14];
const PINKY_KNUCKLE = 21;
/**
 * How far the stick leans from straight across the fist toward where the
 * fingers point: it leaves the fist between thumb and forefinger, angled
 * forward, as in a matched grip.
 */
export const STICK_LEAN = 0.85;

// Scratch vectors, reused every frame.
const fwd: Vec = [0, 0, 0];
const lat: Vec = [0, 0, 0];
const d: Vec = [0, 0, 0];

/**
 * A stick held in a closed hand (from the hand's joint positions, xyz per
 * joint, any space). It runs through the curled middle finger, across the
 * palm from the little finger's side, and out past the thumb, leaning
 * forward toward where the knuckles point.
 */
export function stickPose(joints: ArrayLike<number>, out: StickPose): StickPose {
  const p = (j: number, k: number) => joints[j * 3 + k];
  for (let k = 0; k < 3; k++) {
    fwd[k] = p(MIDDLE_JOINTS[0], k) - p(WRIST, k);
    lat[k] = p(INDEX_KNUCKLE, k) - p(PINKY_KNUCKLE, k);
    let g = 0;
    for (const j of MIDDLE_JOINTS) g += p(j, k);
    out.grip[k] = g / MIDDLE_JOINTS.length;
  }
  normalize(fwd);
  const l = dot(lat, fwd);
  for (let k = 0; k < 3; k++) lat[k] -= fwd[k] * l;
  normalize(lat);
  for (let k = 0; k < 3; k++) out.axis[k] = lat[k] + fwd[k] * STICK_LEAN;
  normalize(out.axis);
  cross(out.axis, fwd, out.side);
  normalize(out.side);
  tipOf(out);
  return out;
}

/** Puts the tip at the end of the axis. */
export function tipOf(pose: StickPose): void {
  for (let k = 0; k < 3; k++) pose.tip[k] = pose.grip[k] + pose.axis[k] * TIP_REACH;
}

/** The tip bead's radius, for contact: it touches a surface this far from its centre. */
export const TIP_RADIUS = 0.006;
/** After a stroke, the tip must rise this far off the surface before it can strike it again. */
export const REARM_HEIGHT = 0.012;
/** Approach speed (m/s) under which the tip only rests on a surface, without sounding. */
export const SOUNDING_SPEED = 0.2;
/** Approach speed (m/s) of a fortissimo stroke. */
export const FULL_STROKE_SPEED = 4;
/** Faster than a stick tip moves (m/s): a tip that seems to, jumped in tracking. */
export const MAX_TIP_SPEED = 16;
/** A stroke this far outside a surface's rim still lands on it (fraction of the radius). */
const REACH = 1.04;

/** How loud a stroke is, 0 to 1, from the tip's approach speed (m/s). */
export function strokeLoudness(speed: number): number {
  return Math.min(1, Math.max(0, (speed - SOUNDING_SPEED) / (FULL_STROKE_SPEED - SOUNDING_SPEED))) ** 0.6;
}

/** What a stroke played: the piece and, where it has zones, which one. */
export type Articulation =
  | 'kick'
  | 'snare'
  | 'rimshot'
  | 'tom1'
  | 'tom2'
  | 'floorTom'
  | 'hihatClosed'
  | 'hihatOpen'
  | 'crash'
  | 'ride'
  | 'rideBell';

/** The articulation for a stroke on `piece` at `r` metres from its centre. */
export function articulationAt(piece: Piece, r: number): Articulation {
  const f = r / piece.radius;
  switch (piece.id) {
    case 'snare':
      return f > ZONES.rimshot ? 'rimshot' : 'snare';
    case 'hihat':
      return f > ZONES.hihatOpen ? 'hihatOpen' : 'hihatClosed';
    case 'ride':
      return r < piece.depth ? 'rideBell' : 'ride';
    default:
      return piece.id;
  }
}

/** One stroke, as the detector found it. */
export interface Stroke {
  piece: Piece;
  articulation: Articulation;
  loudness: number;
  /** Approach speed (m/s). */
  speed: number;
  /** Where on the surface it landed, from the centre (m). */
  r: number;
}

/** What the detector keeps for each stick. */
class StickTrack {
  readonly prev: Vec = [0, 0, 0];
  has = false;
  /** Per surface: may strike it (has risen clear since the last stroke). */
  readonly armed: boolean[];
  /** Per surface: approach speed measured the frame before. */
  readonly lastApproach: Float32Array;
  /** The surface this stick's tip landed on and has not yet left, or -1. */
  resting = -1;
  constructor(n: number) {
    this.armed = new Array<boolean>(n).fill(true);
    this.lastApproach = new Float32Array(n);
  }
}

/**
 * Watches both sticks' tips for strokes. Feed it each tip once a frame, in
 * kit space. A stroke lands the frame a tip crosses a playing surface from
 * above, within its rim, as loud as the tip was approaching; that surface
 * must be risen clear of before it can sound again. Tips that pass into a
 * surface from below or the side (through a shell, under a cymbal) are
 * silent, and so is anything a tip passes through while it rests on the
 * surface it landed on (a real stick stops there).
 */
export class StrokeDetector {
  readonly surfaces: Surface[];
  /** Set on the frame of a stroke, per stick (0 left, 1 right). */
  readonly strokes: (Stroke | null)[] = [null, null];
  private readonly sticks = [new StickTrack(PIECES.length), new StickTrack(PIECES.length)];
  private readonly found: Stroke[] = PIECES.map((piece) => ({ piece, articulation: 'snare', loudness: 0, speed: 0, r: 0 }));

  constructor(snare: number) {
    this.surfaces = PIECES.map((p) => surfaceOf(p, snare));
  }

  /** Moves every surface for the snare's head at `snare` (m). */
  setSnareHeight(snare: number): void {
    for (const s of this.surfaces) surfaceOf(s.piece, snare, s);
  }

  /** The surface stick `i` landed on and has not yet left, or null. */
  restingOn(i: number): Surface | null {
    const r = this.sticks[i].resting;
    return r < 0 ? null : this.surfaces[r];
  }

  update(i: number, tip: ArrayLike<number>, dt: number): Stroke | null {
    const t = this.sticks[i];
    this.strokes[i] = null;
    if (!t.has || dt <= 0) {
      t.prev[0] = tip[0];
      t.prev[1] = tip[1];
      t.prev[2] = tip[2];
      t.has = true;
      t.resting = -1;
      return null;
    }
    const jump = Math.hypot(tip[0] - t.prev[0], tip[1] - t.prev[1], tip[2] - t.prev[2]) / dt > MAX_TIP_SPEED;
    const stoppedOn = t.resting;
    let best: Stroke | null = null;
    let bestAt = 2;
    let bestIndex = -1;
    for (let s = 0; s < this.surfaces.length; s++) {
      const { center, normal, piece } = this.surfaces[s];
      for (let k = 0; k < 3; k++) d[k] = t.prev[k] - center[k];
      const before = dot(d, normal) - TIP_RADIUS;
      for (let k = 0; k < 3; k++) d[k] = tip[k] - center[k];
      const now = dot(d, normal) - TIP_RADIUS;
      const approach = (before - now) / dt;
      // The tip slows as it lands; a stroke is as fast as it was coming in.
      const speed = Math.max(approach, t.lastApproach[s]);
      t.lastApproach[s] = approach;
      if (now > REARM_HEIGHT) t.armed[s] = true;
      if (t.resting === s && (now > 0 || radial(d, normal) > piece.radius * REACH)) t.resting = -1;
      if (!(before > 0 && now <= 0)) continue;
      // Where the tip crossed the surface's plane.
      const u = before / (before - now);
      for (let k = 0; k < 3; k++) d[k] = t.prev[k] + (tip[k] - t.prev[k]) * u - center[k];
      const r = radial(d, normal);
      if (r > piece.radius * REACH) continue;
      const armed = t.armed[s];
      t.armed[s] = false;
      if (!armed || jump || u >= bestAt || (stoppedOn >= 0 && stoppedOn !== s && t.resting >= 0)) continue;
      // Even a stroke too slow to sound lands the stick on the surface.
      bestAt = u;
      bestIndex = s;
      const stroke = this.found[s];
      stroke.speed = speed;
      stroke.loudness = strokeLoudness(speed);
      stroke.r = r;
      stroke.articulation = articulationAt(piece, r);
      best = stroke;
    }
    if (bestIndex >= 0) t.resting = bestIndex;
    t.prev[0] = tip[0];
    t.prev[1] = tip[1];
    t.prev[2] = tip[2];
    if (best != null && best.speed >= SOUNDING_SPEED) this.strokes[i] = best;
    return this.strokes[i];
  }

  /** Forgets stick `i`'s motion (after tracking is lost, or the kit moves or is put away). */
  reset(i: number): void {
    const t = this.sticks[i];
    t.has = false;
    t.resting = -1;
    t.armed.fill(true);
    t.lastApproach.fill(0);
    this.strokes[i] = null;
  }
}

/** Distance of `v` from the axis along `n`. */
function radial(v: Vec, n: Vec): number {
  const h = dot(v, n);
  return Math.hypot(v[0] - n[0] * h, v[1] - n[1] * h, v[2] - n[2] * h);
}

/**
 * Turns a stick about its grip so its tip rests on `surface` instead of
 * passing through it, as a real stick stops on a head. Leaves the stick
 * alone if its tip is above the surface, or the grip is not.
 */
export function restOn(pose: StickPose, surface: Surface): boolean {
  const { center, normal } = surface;
  for (let k = 0; k < 3; k++) d[k] = pose.tip[k] - center[k];
  if (dot(d, normal) - TIP_RADIUS >= 0) return false;
  for (let k = 0; k < 3; k++) d[k] = pose.grip[k] - center[k];
  const grip = dot(d, normal) - TIP_RADIUS;
  if (grip <= 0) return false;
  // The axis keeps its heading across the surface and dips only enough to reach it.
  const b = -grip / TIP_REACH;
  const a = dot(pose.axis, normal);
  for (let k = 0; k < 3; k++) d[k] = pose.axis[k] - normal[k] * a;
  const across = Math.hypot(d[0], d[1], d[2]);
  if (across < 1e-6 || b <= -1) return false;
  const along = Math.sqrt(1 - b * b) / across;
  for (let k = 0; k < 3; k++) pose.axis[k] = d[k] * along + normal[k] * b;
  // Keep the frame square.
  const s = dot(pose.side, pose.axis);
  for (let k = 0; k < 3; k++) pose.side[k] -= pose.axis[k] * s;
  normalize(pose.side);
  tipOf(pose);
  return true;
}

function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
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
