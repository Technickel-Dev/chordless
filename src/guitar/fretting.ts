import { fretAt, GUITAR, nearestString, STRING_COUNT } from './geometry.js';

/**
 * How close a finger must come to the strings to fret them, in metres.
 * Tracked joints are the centre of the finger, roughly 8 mm above the skin,
 * and with no real neck to stop them, fingers often push through the
 * fretboard, so the press zone extends well below the surface.
 */
export const PRESS = {
  /** A point this far above the strings starts pressing. */
  above: 0.012,
  /** A string already held stays pressed until the point rises past this. */
  release: 0.02,
  /** Points further than this below the fretboard are behind the neck. */
  below: 0.04,
  /** Extra reach, in string spacings, beyond the outer strings (above the board only). */
  edgeSpacings: 0.3,
  /** A string must stay released this long before its fret drops. */
  releaseSeconds: 0.06,
};

/**
 * Turns sampled finger points (in guitar space) into the fret held on each
 * string. Call `begin()`, `addPoint()` for every sample, then `commit()`
 * once per frame. As on a real guitar, the highest fret held on a string is
 * the one that sounds.
 */
export class FretReader {
  /** Fret sounding on each string; 0 is the open string. */
  readonly frets = new Int8Array(STRING_COUNT);
  /** Whether each string has a finger within the press zone this frame. */
  readonly pressed = new Uint8Array(STRING_COUNT);
  private readonly strict = new Int8Array(STRING_COUNT);
  /** Bitmask per string of frets that have a point within the release zone. */
  private readonly held = new Uint32Array(STRING_COUNT);
  /** How long each string has wanted to drop to a lower fret. */
  private readonly releaseTime = new Float32Array(STRING_COUNT);

  begin(): void {
    this.strict.fill(0);
    this.held.fill(0);
  }

  /** Adds one finger point; returns the string it frets, or -1. */
  addPoint(x: number, y: number, z: number): number {
    const fret = fretAt(x);
    if (fret === 0) return -1;
    if (z < GUITAR.boardTopZ - PRESS.below) return -1;
    const height = z - GUITAR.stringZ;
    if (height > PRESS.release) return -1;
    let s = nearestString(x, y);
    if (s < 0) {
      // Beyond the outer strings only counts on top of the fretboard; below
      // it, the point is beside the neck (say, the base of the index finger
      // tucked under the treble edge).
      if (z < GUITAR.boardTopZ) return -1;
      s = nearestString(x, y, 0.5 + PRESS.edgeSpacings);
      if (s < 0) return -1;
    }
    this.held[s] |= 1 << fret;
    if (height <= PRESS.above && fret > this.strict[s]) this.strict[s] = fret;
    return height <= PRESS.above ? s : -1;
  }

  /**
   * Settles this frame's frets; returns true when any string changed.
   * Pressing a higher fret takes effect at once (hammer-ons stay snappy);
   * dropping to a lower fret or the open string must persist for
   * `PRESS.releaseSeconds`, so a one-frame tracking flicker cannot cut a
   * ringing note.
   */
  commit(dt = 1 / 72): boolean {
    let changed = false;
    for (let s = 0; s < STRING_COUNT; s++) {
      const current = this.frets[s];
      let next = this.strict[s];
      // Hysteresis: a held fret survives small lifts within the release zone.
      if (next < current && current > 0 && this.held[s] & (1 << current)) next = current;
      if (next < current) {
        this.releaseTime[s] += dt;
        if (this.releaseTime[s] < PRESS.releaseSeconds) next = current;
      } else {
        this.releaseTime[s] = 0;
      }
      this.pressed[s] = next > 0 ? 1 : 0;
      if (next !== current) {
        this.frets[s] = next;
        this.releaseTime[s] = 0;
        changed = true;
      }
    }
    return changed;
  }

  reset(): void {
    this.frets.fill(0);
    this.pressed.fill(0);
    this.releaseTime.fill(0);
  }
}
