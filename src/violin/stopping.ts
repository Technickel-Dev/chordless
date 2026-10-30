import { PRESS } from '../guitar/fretting.js';
import { boardZ, MAX_STOP, nearestString, STRING_COUNT, stopSemitones, stringZ, VIOLIN } from './geometry.js';

/**
 * In snap mode, a pitch moves to a new semitone only once the fingertip is
 * this far past halfway to it, so tracking jitter cannot flicker between two.
 */
const SNAP_HOLD = 0.2;

/**
 * Turns sampled finger points (in violin space) into where each string is
 * stopped. Call `begin()`, `addPoint()` for every sample, then `commit()`
 * once per frame. As on a real violin there are no frets: the stop nearest
 * the bridge sets the pitch, anywhere along the fingerboard.
 */
export class StopReader {
  /** Semitones above the open string each string plays (0 when open); fractional in free intonation. */
  readonly semitones = new Float32Array(STRING_COUNT);
  /** Unrounded stop of each string, in semitones (0 when open). */
  readonly raw = new Float32Array(STRING_COUNT);
  private readonly strict = new Float32Array(STRING_COUNT);
  private readonly held = new Float32Array(STRING_COUNT);
  private readonly releaseTime = new Float32Array(STRING_COUNT);
  private untracked = 0;

  begin(): void {
    this.strict.fill(0);
    this.held.fill(0);
  }

  /** Adds one finger point; returns the string it stops, or -1. */
  addPoint(x: number, y: number, z: number): number {
    if (x <= VIOLIN.boardEndX || x >= VIOLIN.nutX) return -1;
    // Behind the neck, or beside the fingerboard below its surface.
    if (z < boardZ(x) - PRESS.below) return -1;
    const s = nearestString(x, y);
    if (s < 0) return -1;
    const height = z - stringZ(s, x);
    if (height > PRESS.release) return -1;
    const stop = Math.min(MAX_STOP, stopSemitones(x));
    if (stop > this.held[s]) this.held[s] = stop;
    if (height > PRESS.above) return -1;
    if (stop > this.strict[s]) this.strict[s] = stop;
    return s;
  }

  /**
   * Settles this frame's stops; returns true when any string's note changed.
   * A finger landing nearer the bridge takes effect at once; lifting it (or
   * sliding back toward the nut) must persist for `PRESS.releaseSeconds`.
   * While the hand is untracked (`tracked` false) the stops hold for a
   * moment, so a tracking hiccup cannot change a sustained note.
   */
  commit(dt: number, tracked: boolean, snap: boolean): boolean {
    if (!tracked) {
      this.untracked += dt;
      if (this.untracked < PRESS.trackingGapSeconds) return false;
      this.strict.fill(0);
      this.held.fill(0);
    } else {
      this.untracked = 0;
    }
    let changed = false;
    for (let s = 0; s < STRING_COUNT; s++) {
      const current = this.raw[s];
      let next = this.strict[s];
      if (next > current + 1e-6) {
        this.releaseTime[s] = 0;
      } else if (this.held[s] > 0 && this.held[s] <= current + 1e-6 && current - this.held[s] < 0.6) {
        // Still on the string (within the release height), perhaps sliding:
        // follow the finger without waiting.
        next = this.held[s];
        this.releaseTime[s] = 0;
      } else if (next < current - 1e-6) {
        this.releaseTime[s] += dt;
        if (this.releaseTime[s] < PRESS.releaseSeconds) next = current;
        else this.releaseTime[s] = 0;
      }
      this.raw[s] = next;
      const note = next <= 0 ? 0 : snap ? snapSemitone(next, this.semitones[s]) : next;
      if (note !== this.semitones[s]) {
        // A free pitch moves continuously; count only a new semitone as a change.
        if (Math.round(note) !== Math.round(this.semitones[s])) changed = true;
        this.semitones[s] = note;
      }
    }
    return changed;
  }
}

/**
 * The nearest semitone to `raw`, keeping `previous` until the finger is
 * clearly nearer the next one.
 */
export function snapSemitone(raw: number, previous: number): number {
  if (previous > 0 && Math.abs(raw - previous) < 0.5 + SNAP_HOLD) return previous;
  return Math.round(raw);
}
