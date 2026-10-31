/**
 * Which keys the fingertips are pressing, and how hard. Pure logic in
 * piano space (see geometry.ts), no IWSDK or DOM imports.
 *
 * A fingertip takes hold of the key it comes down onto from above, and
 * keeps it until it lifts off or slides well away, so a finger rocking on a
 * key does not slip onto its neighbour. A tip that arrives at a key from
 * the side or from below, already lower than its top, takes nothing: that
 * is a hand passing through the keyboard, not playing it. The key goes down
 * as far as the tip pushes it; the note sounds when it passes the point
 * where a real action lets the hammer fly, as loud as the tip was moving,
 * and stops when the key comes most of the way back up.
 */

import { midiName, recognizeChord } from '../guitar/chords.js';
import { KEY_COUNT, keyAt, keyCenterX, keyTop, isBlack, PIANO } from './geometry.js';

export const PRESS = {
  /** The tracked tip joint sits about this far inside the fingertip's pad. */
  fingerRadius: 0.008,
  /** Key dip at which the note sounds, and below which it stops again. */
  onDepth: 0.0065,
  offDepth: 0.003,
  /** A held key is let go when the tip lifts this far above its top. */
  liftOff: 0.002,
  /** Or slides this far beyond its edges. */
  slideOff: 0.012,
  /** Smoothing of the tip's downward speed, per frame at 72 Hz. */
  speedSmoothing: 0.55,
  /** How long a fast movement still counts toward a strike (time constant, s). */
  peakHold: 0.05,
} as const;

/** Fingertips per hand: thumb, index, middle, ring and little finger. */
export const TIPS_PER_HAND = 5;
export const TIP_COUNT = TIPS_PER_HAND * 2;

/**
 * How hard a strike is, 0.1 to 1, from the fingertip's downward speed
 * (m/s). A gentle press is about 0.1 m/s, a firm one 0.5 and a hard,
 * fast strike 1 or more.
 */
export function strikeVelocity(speed: number): number {
  const t = Math.min(1, Math.max(0, (speed - 0.02) / 0.95));
  return 0.1 + 0.9 * t ** 0.75;
}

interface Tip {
  /** The key this tip holds, or -1. */
  key: number;
  /** The tip's lowest point last frame; NaN when it was not tracked. */
  bottom: number;
  /** Smoothed downward speed (m/s). */
  speed: number;
  /** The fastest it has just been moving down (m/s), falling away over PRESS.peakHold. */
  peak: number;
}

/** A key that went down or came up this frame. */
export interface KeyEvent {
  midi: number;
  /** For a strike, 0.1 to 1. */
  velocity: number;
  /** Which tip did it, 0-4 the left hand thumb to little finger, 5-9 the right. */
  tip: number;
}

export class Keyboard {
  /** How far each key is down (m), indexed by midi - PIANO.lowest. */
  readonly depth = new Float32Array(KEY_COUNT);
  /** Whether each key's note is sounding. */
  readonly down = new Uint8Array(KEY_COUNT);
  /** This frame's strikes and releases; only the first `struckCount` / `releasedCount` are current. */
  readonly struck: KeyEvent[] = Array.from({ length: KEY_COUNT }, () => ({ midi: 0, velocity: 0, tip: 0 }));
  readonly released: KeyEvent[] = Array.from({ length: KEY_COUNT }, () => ({ midi: 0, velocity: 0, tip: 0 }));
  struckCount = 0;
  releasedCount = 0;
  /** The key each tip holds, or -1. */
  readonly held = new Int16Array(TIP_COUNT).fill(-1);
  private readonly tips: Tip[] = Array.from({ length: TIP_COUNT }, () => ({ key: -1, bottom: NaN, speed: 0, peak: 0 }));
  /** Which tip pushes each key furthest this frame. */
  private readonly pusher = new Int8Array(KEY_COUNT);

  /**
   * `positions` holds xyz per tip in piano space; `tracked[i]` says whether
   * tip i's hand is tracked this frame.
   */
  update(positions: ArrayLike<number>, tracked: ArrayLike<boolean>, dt: number): void {
    this.depth.fill(0);
    this.pusher.fill(-1);
    this.struckCount = 0;
    this.releasedCount = 0;
    const smoothing = 1 - (1 - PRESS.speedSmoothing) ** (Math.max(dt, 1e-4) * 72);

    for (let i = 0; i < TIP_COUNT; i++) {
      const tip = this.tips[i];
      if (!tracked[i]) {
        tip.key = -1;
        tip.bottom = NaN;
        tip.speed = 0;
        tip.peak = 0;
        this.held[i] = -1;
        continue;
      }
      const x = positions[i * 3];
      const z = positions[i * 3 + 2];
      const bottom = positions[i * 3 + 1] - PRESS.fingerRadius;
      if (!Number.isNaN(tip.bottom) && dt > 0) {
        const now = (tip.bottom - bottom) / dt;
        tip.speed += (now - tip.speed) * smoothing;
        tip.peak = Math.max(now, tip.peak * Math.exp(-dt / PRESS.peakHold));
      }

      if (tip.key >= 0 && this.letsGo(tip.key, x, z, bottom)) tip.key = -1;
      if (tip.key < 0) {
        const k = keyAt(x, z);
        // Only from above: last frame the tip was over this key's top.
        if (k >= 0 && bottom < keyTop(k) && tip.bottom >= keyTop(k) - 0.001) tip.key = k;
      }
      tip.bottom = bottom;
      this.held[i] = tip.key;
      if (tip.key < 0) continue;

      const index = tip.key - PIANO.lowest;
      const d = Math.min(PIANO.travel, Math.max(0, keyTop(tip.key) - bottom));
      if (d >= this.depth[index]) {
        this.depth[index] = d;
        this.pusher[index] = i;
      }
    }

    for (let index = 0; index < KEY_COUNT; index++) {
      const d = this.depth[index];
      if (!this.down[index] && d >= PRESS.onDepth) {
        this.down[index] = 1;
        const tip = this.pusher[index];
        const e = this.struck[this.struckCount++];
        e.midi = index + PIANO.lowest;
        e.tip = tip;
        // A fast strike is over in two or three frames, before the smoothing
        // catches up, and a finger slows as the key bottoms out: count how
        // fast it was going just before.
        e.velocity = strikeVelocity(Math.max(this.tips[tip].speed, this.tips[tip].peak));
      } else if (this.down[index] && d < PRESS.offDepth) {
        this.down[index] = 0;
        const e = this.released[this.releasedCount++];
        e.midi = index + PIANO.lowest;
        e.tip = this.pusher[index];
        e.velocity = 0;
      }
    }
  }

  /** Lets every key up at once, reporting the ones that were sounding. */
  reset(): void {
    this.releasedCount = 0;
    this.struckCount = 0;
    for (let index = 0; index < KEY_COUNT; index++) {
      if (this.down[index]) {
        const e = this.released[this.releasedCount++];
        e.midi = index + PIANO.lowest;
        e.tip = -1;
        e.velocity = 0;
      }
    }
    this.depth.fill(0);
    this.down.fill(0);
    this.held.fill(-1);
    for (const tip of this.tips) {
      tip.key = -1;
      tip.bottom = NaN;
      tip.speed = 0;
      tip.peak = 0;
    }
  }

  /** Has the tip lifted off its key, or slid off it? */
  private letsGo(key: number, x: number, z: number, bottom: number): boolean {
    if (bottom > keyTop(key) + PRESS.liftOff) return true;
    const half = (isBlack(key) ? PIANO.blackWidth : PIANO.whitePitch) / 2;
    if (Math.abs(x - keyCenterX(key)) > half + PRESS.slideOff) return true;
    const front = isBlack(key) ? -(PIANO.whiteLength - PIANO.blackLength) : 0;
    return z > front + PRESS.slideOff || z < -PIANO.whiteLength - PRESS.slideOff;
  }
}

/**
 * What the HUD calls the keys held: a chord's name for three or more keys
 * that make one, otherwise the notes themselves (a fifth named as a power
 * chord, "C5", would read as the note C5), or just how many.
 */
export function heldName(held: readonly number[]): string {
  const chord = held.length >= 3 ? recognizeChord(held) : null;
  if (chord != null) return chord;
  if (held.length <= 4) return held.map(midiName).join(' ');
  return `${held.length} keys`;
}
