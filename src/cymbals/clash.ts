import { BELL_TOP, CYMBAL } from './geometry.js';

type Vec = [number, number, number];

/** Where a cymbal is: the centre of its rim's plane and its axes (see geometry.ts). */
export interface CymbalPose {
  center: Vec;
  /** Out of the playing face (cymbal +Z). */
  normal: Vec;
  /** Across the strap handle (cymbal +X). */
  across: Vec;
  /** Cymbal +Y, completing the frame. */
  up: Vec;
}

export function createCymbalPose(): CymbalPose {
  return { center: [0, 0, 0], normal: [0, 0, 1], across: [1, 0, 0], up: [0, 1, 0] };
}

/** Joint indices cymbalPose reads (WebXR XRHand order). */
const WRIST = 0;
const INDEX_KNUCKLE = 6;
const MIDDLE_KNUCKLE = 11;
const MIDDLE_MIDDLE = 12;
const PINKY_KNUCKLE = 21;
/** From the middle finger's middle joint to the front of the closed fist. */
export const FIST_FRONT = 0.011;

// Scratch vectors, reused every frame.
const fwd: Vec = [0, 0, 0];
const lat: Vec = [0, 0, 0];
const d: Vec = [0, 0, 0];

/**
 * A cymbal in a hand that holds it by the strap (from the hand's joint
 * positions, xyz per joint, any space). The fist closes round the strap
 * handle with the front of the fist against the pad, so the cymbal hangs
 * beyond the knuckles: its face points the way the hand does (wrist to
 * knuckles) and the handle runs across the hand.
 */
export function cymbalPose(joints: ArrayLike<number>, out: CymbalPose): CymbalPose {
  const p = (j: number, k: number) => joints[j * 3 + k];
  for (let k = 0; k < 3; k++) {
    fwd[k] = p(MIDDLE_KNUCKLE, k) - p(WRIST, k);
    lat[k] = p(INDEX_KNUCKLE, k) - p(PINKY_KNUCKLE, k);
  }
  normalize(fwd);
  const l = dot(lat, fwd);
  for (let k = 0; k < 3; k++) {
    out.normal[k] = fwd[k];
    out.across[k] = lat[k] - fwd[k] * l;
  }
  normalize(out.across);
  cross(out.normal, out.across, out.up);
  const reach = FIST_FRONT + BELL_TOP + CYMBAL.padThickness;
  for (let k = 0; k < 3; k++) out.center[k] = p(MIDDLE_MIDDLE, k) + fwd[k] * reach;
  return out;
}

/** The rims count as touching from this close (the edges' thickness, plus tracking's slack). */
export const TOUCH_GAP = 0.004;
/** After a clash, the plates must part this far before they can clash again. */
export const REARM_GAP = 0.02;
/** Closing speed (m/s) under which the plates meet silently: a touch, not a clash. */
export const SOUNDING_SPEED = 0.12;
/** Closing speed (m/s) of a fortissimo clash. */
export const FULL_CLASH_SPEED = 2.2;
/**
 * Faster than hands can close (m/s): plates that seem to close faster than
 * this jumped in tracking, which makes no sound.
 */
export const MAX_CLOSING_SPEED = 9;
/** Plates held together this long after a clash stop ringing (secco). */
export const HOLD_TO_DAMP = 0.15;
/** A silent touch damps sooner: plates laid together. */
export const TOUCH_TO_DAMP = 0.05;
/** Plates more nearly flat than this, and centred on each other, trap air: a muffled clash. */
export const FLUSH_FACING = 0.985;
export const FLUSH_OFFSET = 0.025;
/** The closing speed is measured over about this long, so one jittery frame cannot set it. */
const SPEED_WINDOW = 0.024;
const HISTORY = 8;
/**
 * A frame adds at most this much to how long the plates have been held
 * together, so one long frame (a hitch) cannot pass for holding them.
 */
const MAX_HOLD_STEP = 1 / 30;

/** How loud a clash is, 0 to 1, from the plates' closing speed (m/s). */
export function clashLoudness(speed: number): number {
  return Math.min(1, Math.max(0, (speed - SOUNDING_SPEED) / (FULL_CLASH_SPEED - SOUNDING_SPEED))) ** 0.6;
}

/**
 * Watches a pair of cymbals for clashes. Feed it both cymbals' poses once a
 * frame. The rims meet first, since the plates are dished: the gap is the
 * nearest rim of either plate to the other's rim plane, while the plates
 * face each other and overlap. A clash sounds the frame the gap closes,
 * as loud as the plates were closing; they must part again before the next.
 * Plates held together, or laid together gently, damp the ringing.
 */
export class ClashDetector {
  /** Gap between the plates (m); 1 when they do not face each other. */
  gap = 1;
  touching = false;
  /** How squarely the plates face each other: 1 face to face. */
  facing = 0;
  /** How far apart their centres are across the faces (m). */
  offset = 0;
  clashes = 0;
  /** Set on the frame of a clash, with how it sounded. */
  clashed = false;
  loudness = 0;
  /** Closing speed of the last clash (m/s). */
  speed = 0;
  /** The last clash was flat and centred: an air pocket muffles it. */
  flush = false;
  /** Set while the plates' contact is damping the ringing. */
  damping = false;

  private armed = true;
  private touchTime = 0;
  private silentTouch = false;
  private readonly gaps = new Float32Array(HISTORY);
  private readonly dts = new Float32Array(HISTORY);
  private count = 0;
  private head = 0;
  /** Closing speed over the last frame alone, to catch jumps. */
  private frameSpeed = 0;
  /** The closing speed measured the frame before. */
  private lastClosing = 0;

  update(a: CymbalPose, b: CymbalPose, dt: number): void {
    this.clashed = false;
    for (let k = 0; k < 3; k++) d[k] = b.center[k] - a.center[k];
    const cos = dot(a.normal, b.normal);
    this.facing = -cos;
    const along = dot(d, a.normal);
    this.offset = Math.hypot(d[0] - a.normal[0] * along, d[1] - a.normal[1] * along, d[2] - a.normal[2] * along);
    const facingEachOther = this.facing > 0.5 && this.offset < CYMBAL.radius * 1.6;
    let gap = 1;
    if (facingEachOther) {
      // A tilted plate's nearest rim dips toward the other by radius x sin(tilt).
      const dip = CYMBAL.radius * Math.sqrt(Math.max(0, 1 - cos * cos));
      gap = Math.min(along, -dot(d, b.normal)) - dip - CYMBAL.edgeThickness;
    }
    const before = this.gap;
    this.gap = gap;
    // Hands slow down as the plates meet; a clash is as loud as they were
    // approaching, so a frame that lands as they stop does not set it.
    const measured = this.closingSpeed(gap, dt);
    const closing = Math.max(measured, this.lastClosing);
    this.lastClosing = measured;
    const wasTouching = this.touching;
    this.touching = facingEachOther && gap <= TOUCH_GAP;

    if (!facingEachOther || gap > REARM_GAP) this.armed = true;
    if (this.touching && !wasTouching) {
      // Plates that come face to face already through each other did not meet.
      const met = before > TOUCH_GAP && before < 1;
      const jumped = this.frameSpeed > MAX_CLOSING_SPEED;
      if (met && this.armed && !jumped && closing >= SOUNDING_SPEED) {
        this.clashed = true;
        this.clashes++;
        this.speed = closing;
        this.loudness = clashLoudness(closing);
        this.flush = this.facing > FLUSH_FACING && this.offset < FLUSH_OFFSET;
        this.silentTouch = false;
      } else {
        this.silentTouch = closing < SOUNDING_SPEED;
      }
      this.armed = false;
      this.touchTime = 0;
    }
    this.touchTime = this.touching ? this.touchTime + Math.min(dt, MAX_HOLD_STEP) : 0;
    this.damping = this.touching && this.touchTime >= (this.silentTouch ? TOUCH_TO_DAMP : HOLD_TO_DAMP);
  }

  /** Forgets the plates' motion (after tracking is lost, or the cymbals are put away). */
  reset(): void {
    this.count = 0;
    this.lastClosing = 0;
    this.gap = 1;
    this.touching = false;
    this.damping = false;
    this.clashed = false;
    this.armed = true;
    this.touchTime = 0;
  }

  /** How fast the gap is closing (m/s), over the last few frames. */
  private closingSpeed(gap: number, dt: number): number {
    if (gap >= 1) {
      this.count = 0;
      return 0;
    }
    this.head = (this.head + 1) % HISTORY;
    this.gaps[this.head] = gap;
    this.dts[this.head] = dt;
    this.count = Math.min(HISTORY, this.count + 1);
    const prev = (this.head - 1 + HISTORY) % HISTORY;
    this.frameSpeed = this.count > 1 ? (this.gaps[prev] - gap) / dt : 0;
    let span = 0;
    for (let i = 0; i < this.count - 1; i++) {
      const at = (this.head - i + HISTORY) % HISTORY;
      span += this.dts[at];
      const from = (at - 1 + HISTORY) % HISTORY;
      if (span >= SPEED_WINDOW || i === this.count - 2) return (this.gaps[from] - gap) / span;
    }
    return 0;
  }
}

/** The chest, for damping: a sphere this far below and behind the head (m). */
export const CHEST = { below: 0.4, behind: 0.08, radius: 0.13 };

/** Whether a cymbal's plate is pressed against a sphere (the chest, to damp it). */
export function touchesSphere(c: CymbalPose, center: ArrayLike<number>, radius: number): boolean {
  for (let k = 0; k < 3; k++) d[k] = center[k] - c.center[k];
  const h = dot(d, c.normal);
  const r = Math.hypot(d[0] - c.normal[0] * h, d[1] - c.normal[1] * h, d[2] - c.normal[2] * h);
  return Math.hypot(h, Math.max(0, r - CYMBAL.radius)) <= radius;
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
