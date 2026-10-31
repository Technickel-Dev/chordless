import { type BowedGeometry, VIOLIN_GEOMETRY } from './geometry.js';

/** How a bow is made and held. */
export interface BowSpec {
  hairLength: number;
  frogToHair: number;
  buttonLength: number;
  hairDrop: number;
  fingerLean: number;
}

/** A full-size violin bow. */
export const BOW: BowSpec = {
  /** Playing length of the hair. */
  hairLength: 0.65,
  /** The hair starts this far out from where the hand holds the frog. */
  frogToHair: 0.02,
  /** The stick behind the frog (the button end). */
  buttonLength: 0.05,
  /** How far the hair lies from the stick at the frog (toward the palm side). */
  hairDrop: 0.014,
  /**
   * How much the bow angles from straight across the hand toward the
   * fingertips: the stick lies diagonally over the fingers in a bow hold.
   */
  fingerLean: 0.3,
};

/** The hair counts as touching a string from this far off it (tracked hands are never exact). */
export const CONTACT_GAP = 0.002;
/** Beyond this the hair would be through the string, the instrument or both: no sound. */
export const MAX_PRESS = 0.03;
/**
 * Strings within this much of the deepest-pressed one sound together (a
 * double stop). The arch drops the next string about 1.6 mm below a bow
 * square to one string, so this leaves about 5 degrees of tilt per string.
 */
export const DOUBLE_STOP = 0.0008;
/**
 * Bow speed (m/s) under which a string does not speak: a bow resting on a
 * string, with tracking jitter, stays silent.
 */
export const SPEAKING_SPEED = 0.05;
/** A stroke starts once the bow moves this fast (m/s), and lasts until it nearly stops. */
export const STROKE_SPEED = 0.1;
/** Bow speed (m/s) for full volume. */
export const FULL_SPEED = 0.5;

/**
 * How loud a string sounds, 0 to 1, under a bow drawn at `speed` m/s and
 * pressed `press` metres into it: barely touching gives a thin, airy tone,
 * pressed in a full one.
 */
export function bowedAmplitude(speed: number, press: number): number {
  const drive = Math.min(1, Math.max(0, (speed - SPEAKING_SPEED) / (FULL_SPEED - SPEAKING_SPEED))) ** 0.6;
  const pressure = Math.min(1, Math.max(0, (press + CONTACT_GAP) / (CONTACT_GAP + 0.003)));
  return drive * (0.3 + 0.7 * pressure);
}
/**
 * Faster than any real bow stroke (m/s). The hand moving faster than this
 * between frames is a jump in tracking, not a stroke: it makes no sound
 * and counts no stroke.
 */
export const MAX_BOW_SPEED = 3;

type Vec = [number, number, number];

/** A bow's place: where the hand holds it, which way it points and the hair. */
export interface BowPose {
  /** Where the frog sits in the hand. */
  frog: Vec;
  /** Along the bow, from the frog toward the tip. */
  along: Vec;
  /** The side the hair is on, away from the stick. */
  hairSide: Vec;
  /** Ends of the hair, frog end first. */
  hair0: Vec;
  hair1: Vec;
}

export function createBowPose(): BowPose {
  return { frog: [0, 0, 0], along: [1, 0, 0], hairSide: [0, 0, -1], hair0: [0, 0, 0], hair1: [0, 0, 0] };
}

// Scratch vectors, reused every frame.
const lateral: Vec = [0, 0, 0];
const forward: Vec = [0, 0, 0];
const a: Vec = [0, 0, 0];
const u: Vec = [0, 0, 0];
const v: Vec = [0, 0, 0];
const w: Vec = [0, 0, 0];
const m: Vec = [0, 0, 0];

/** Joint indices bowPose reads (WebXR XRHand order). */
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_KNUCKLE = 6;
const MIDDLE_KNUCKLE = 11;
const MIDDLE_MIDDLE = 12;
const PINKY_KNUCKLE = 21;

/**
 * The bow in a right hand's grip, from its joint positions (xyz per joint,
 * any space). The frog sits between the thumb tip and the middle finger's
 * middle joint; the stick runs out past the index knuckle, across the hand
 * and a little toward the fingertips; the hair hangs on the palm side.
 */
export function bowPose(joints: ArrayLike<number>, out: BowPose, bow: BowSpec = BOW): BowPose {
  const p = (j: number, k: number) => joints[j * 3 + k];
  for (let k = 0; k < 3; k++) {
    out.frog[k] = (p(THUMB_TIP, k) + p(MIDDLE_MIDDLE, k)) / 2;
    lateral[k] = p(INDEX_KNUCKLE, k) - p(PINKY_KNUCKLE, k);
    forward[k] = p(MIDDLE_KNUCKLE, k) - p(WRIST, k);
  }
  normalize(lateral);
  normalize(forward);
  for (let k = 0; k < 3; k++) out.along[k] = lateral[k] + forward[k] * bow.fingerLean;
  normalize(out.along);
  // The palm faces this way (for a right hand); the hair hangs on that side.
  cross(lateral, forward, out.hairSide);
  const d = dot(out.hairSide, out.along);
  for (let k = 0; k < 3; k++) out.hairSide[k] -= out.along[k] * d;
  normalize(out.hairSide);
  for (let k = 0; k < 3; k++) {
    out.hair0[k] = out.frog[k] + out.hairSide[k] * bow.hairDrop + out.along[k] * bow.frogToHair;
    out.hair1[k] = out.hair0[k] + out.along[k] * bow.hairLength;
  }
  return out;
}

/**
 * Which strings a bow's hair is drawing, and how. Feed it the hair once a
 * frame in violin space. A string sounds when the hair crosses it between
 * the bridge and the fingerboard and is pressed into it (or within
 * `CONTACT_GAP` of it): the arched bridge means a bow tilted toward a
 * string meets that string first. Bow speed is the hair's motion along
 * itself, which is what draws the string.
 */
export class BowContact {
  /** How far the hair presses into each string, in metres (negative: clear of it). */
  readonly press: Float32Array;
  /** Where along each string the hair crosses it (x), when it does. */
  readonly contactX: Float32Array;
  /** 1 for each string the bow is sounding. */
  readonly sounding: Uint8Array;
  /** Bow speed along its length, m/s, smoothed; positive toward the tip (an up-bow). */
  velocity = 0;
  /** Strokes drawn so far: each new contact or change of bow direction on a string. */
  strokes = 0;
  /** Whether the bow touched any string this frame. */
  touching = false;

  private readonly prevFrog: Vec = [0, 0, 0];

  constructor(private readonly geo: BowedGeometry = VIOLIN_GEOMETRY) {
    this.press = new Float32Array(geo.STRING_COUNT);
    this.contactX = new Float32Array(geo.STRING_COUNT);
    this.sounding = new Uint8Array(geo.STRING_COUNT);
  }
  private started = false;
  private stroking = false;
  private direction = 0;

  update(pose: BowPose, dt: number): void {
    // Speed: the hand moving the bow along itself. A move faster than any
    // bow stroke is a jump in tracking: the bow starts again from rest.
    let jumped = false;
    if (this.started && dt > 0) {
      let along = 0;
      let moved = 0;
      for (let k = 0; k < 3; k++) {
        const d = pose.frog[k] - this.prevFrog[k];
        along += d * pose.along[k];
        moved += d * d;
      }
      jumped = Math.sqrt(moved) / dt > MAX_BOW_SPEED;
      if (jumped) this.velocity = 0;
      else this.velocity += (along / dt - this.velocity) * (1 - Math.exp(-dt / 0.03));
    }
    for (let k = 0; k < 3; k++) this.prevFrog[k] = pose.frog[k];
    this.started = true;

    let deepest = -Infinity;
    for (let s = 0; s < this.geo.STRING_COUNT; s++) {
      this.press[s] = this.pressOn(s, pose);
      if (this.press[s] > deepest) deepest = this.press[s];
    }
    this.touching = deepest > -CONTACT_GAP && deepest < MAX_PRESS;
    for (let s = 0; s < this.geo.STRING_COUNT; s++) {
      const p = this.press[s];
      this.sounding[s] = this.touching && p > -CONTACT_GAP && p >= deepest - DOUBLE_STOP ? 1 : 0;
    }

    // A stroke: one continuous draw in one direction on the strings.
    const speed = Math.abs(this.velocity);
    if (!this.touching || jumped || speed < SPEAKING_SPEED) this.stroking = false;
    if (this.touching && speed > STROKE_SPEED) {
      const direction = Math.sign(this.velocity);
      if (!this.stroking || direction !== this.direction) this.strokes++;
      this.stroking = true;
      this.direction = direction;
    }
  }

  reset(): void {
    this.started = false;
    this.velocity = 0;
    this.direction = 0;
    this.stroking = false;
    this.touching = false;
    this.sounding.fill(0);
    this.press.fill(-1);
  }

  /** How far the hair presses into string `s` where it crosses it, or -1 when it does not cross it on the bowing stretch. */
  private pressOn(s: number, pose: BowPose): number {
    // The string's bowing stretch is close enough to straight to treat as a line.
    const { stringY, stringZ, stringFacing, dims } = this.geo;
    const x0 = dims.bowMinX;
    const x1 = dims.bowMaxX;
    set(a, x0, stringY(s, x0), stringZ(s, x0));
    set(u, x1 - x0, stringY(s, x1) - a[1], stringZ(s, x1) - a[2]);
    const b = pose.hair0;
    set(v, pose.hair1[0] - b[0], pose.hair1[1] - b[1], pose.hair1[2] - b[2]);
    // Closest points between the string (a + u*t) and the hair (b + v*h).
    set(w, a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const uu = dot(u, u);
    const uv = dot(u, v);
    const vv = dot(v, v);
    const uw = dot(u, w);
    const vw = dot(v, w);
    const denom = uu * vv - uv * uv;
    if (denom < 1e-12) return -1; // bow along the string
    const t = (uv * vw - vv * uw) / denom;
    const h = (uu * vw - uv * uw) / denom;
    if (t < 0 || t > 1 || h < 0 || h > 1) return -1;
    this.contactX[s] = x0 + (x1 - x0) * t;
    // Signed gap across both lines, measured outward from the arch: the
    // hair under the string's outer side is pressing into it.
    cross(u, v, m);
    normalize(m);
    const [fy, fz] = stringFacing(s);
    if (m[1] * fy + m[2] * fz < 0) for (let k = 0; k < 3; k++) m[k] = -m[k];
    let gap = 0;
    for (let k = 0; k < 3; k++) gap += (b[k] + v[k] * h - (a[k] + u[k] * t)) * m[k];
    return -gap;
  }
}

function set(out: number[], x: number, y: number, z: number): void {
  out[0] = x;
  out[1] = y;
  out[2] = z;
}

function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: ArrayLike<number>, b: ArrayLike<number>, out: number[]): number[] {
  const x = a[1] * b[2] - a[2] * b[1];
  const y = a[2] * b[0] - a[0] * b[2];
  const z = a[0] * b[1] - a[1] * b[0];
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}

function normalize(a: number[]): number[] {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  a[0] /= l;
  a[1] /= l;
  a[2] /= l;
  return a;
}
