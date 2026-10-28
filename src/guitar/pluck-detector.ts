import { GUITAR, STRING_COUNT, stringSpan, stringY } from './geometry.js';

/** Where the picking fingertip interacts with the strings, in guitar space. */
export const PLUCK_ZONE = {
  /** Just in front of the bridge to the upper frets over the body. */
  minX: GUITAR.bridgeX + 0.012,
  maxX: 0.2,
  /** Depth window around the string plane. Above it the finger passes over. */
  above: 0.018,
  below: 0.03,
  /** Reach beyond the outer strings. */
  edge: 0.03,
};

/** Half-width of the dead band around a string, so jitter cannot re-pluck it. */
export const STRING_HYSTERESIS = 0.0025;
/** Resting the fingertip on a string this long damps it. */
export const TOUCH_MUTE_SECONDS = 0.12;

export interface PluckEvent {
  string: number;
  /** Fraction of the last frame at which the string was crossed, 0..1. */
  frac: number;
  /** 0..1 loudness from fingertip speed across the strings. */
  velocity: number;
}

/**
 * Plucks a string whenever the picking fingertip crosses it inside the
 * pluck zone. Each string is tracked on its own, so a fast sweep strums the
 * chord and a small flick picks one string. Lifting the finger above the
 * string plane lets it travel back without sounding anything.
 */
export class PluckDetector {
  /** Pluck events from the last `update()`, valid up to `count`. */
  readonly events: PluckEvent[] = Array.from({ length: STRING_COUNT }, () => ({
    string: 0,
    frac: 0,
    velocity: 0,
  }));
  count = 0;
  /** Strings the fingertip has rested on long enough to damp. */
  readonly damping = new Uint8Array(STRING_COUNT);
  inZone = false;

  private readonly side = new Int8Array(STRING_COUNT);
  private readonly delta = new Float32Array(STRING_COUNT);
  private readonly touch = new Float32Array(STRING_COUNT);
  private prevY = 0;
  private speed = 0;
  private started = false;
  private wasOverStrings = false;

  update(x: number, y: number, z: number, dt: number): number {
    this.count = 0;
    const height = z - GUITAR.stringZ;
    const overStrings =
      x > PLUCK_ZONE.minX &&
      x < PLUCK_ZONE.maxX &&
      height < PLUCK_ZONE.above &&
      height > -PLUCK_ZONE.below;
    const reach = stringSpan(x) / 2 + PLUCK_ZONE.edge;
    const inZone = overStrings && Math.abs(y) < reach;
    // A crossing counts when this frame's motion passes through the zone,
    // even if a fast swing starts and ends beyond the outer strings.
    const passesThrough = Math.min(y, this.prevY) < reach && Math.max(y, this.prevY) > -reach;
    const canPluck = this.started && (overStrings || this.wasOverStrings) && passesThrough;

    const instant = this.started && dt > 0 ? Math.abs(y - this.prevY) / dt : 0;
    this.speed = this.speed * 0.4 + instant * 0.6;
    const velocity = Math.min(1, 0.15 + this.speed / 1.6);

    for (let s = 0; s < STRING_COUNT; s++) {
      const d = y - stringY(s, x);
      const prevD = this.delta[s];
      this.delta[s] = d;

      const touching = inZone && Math.abs(d) < STRING_HYSTERESIS * 1.4;
      this.touch[s] = touching ? this.touch[s] + dt : 0;
      this.damping[s] = this.touch[s] > TOUCH_MUTE_SECONDS ? 1 : 0;

      if (Math.abs(d) < STRING_HYSTERESIS) continue;
      const side = d > 0 ? 1 : -1;
      const prevSide = this.side[s];
      this.side[s] = side;
      if (!canPluck || prevSide === 0 || prevSide === side) continue;

      const frac = Math.sign(prevD) !== side ? clamp01(prevD / (prevD - d)) : 1;
      const event = this.events[this.count++];
      event.string = s;
      event.frac = frac;
      event.velocity = velocity;
    }

    // Order a strum's notes by when each string was crossed.
    if (this.count > 1) {
      const used = this.events.slice(0, this.count).sort((a, b) => a.frac - b.frac);
      for (let i = 0; i < used.length; i++) this.events[i] = used[i];
    }

    this.prevY = y;
    this.started = true;
    this.wasOverStrings = overStrings;
    this.inZone = inZone;
    return this.count;
  }

  /** Forget side history, e.g. when the hand loses tracking. */
  reset(): void {
    this.side.fill(0);
    this.touch.fill(0);
    this.damping.fill(0);
    this.started = false;
    this.wasOverStrings = false;
    this.inZone = false;
    this.count = 0;
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
