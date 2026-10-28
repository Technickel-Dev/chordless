import { GUITAR, STRING_COUNT, stringSpan, stringY } from './geometry.js';

/** Where the picking fingertip interacts with the strings, in guitar space. */
export const PLUCK_ZONE = {
  /** Just in front of the bridge to the upper frets over the body. */
  minX: GUITAR.bridgeX + 0.012,
  maxX: 0.2,
  /** Depth window around the string plane. Above it the finger passes over. */
  above: 0.018,
  below: 0.035,
  /** Reach beyond the outer strings, for the near-strings visual. */
  edge: 0.03,
  /**
   * Once a strum is under way, the rest of that stroke may run deeper or
   * shallower: with nothing to strike, a fast follow-through drifts off the
   * string plane, and the strings it crosses should still sound.
   */
  strumAbove: 0.035,
  strumBelow: 0.08,
  /** How long after a pluck the stroke counts as still under way. */
  strumHold: 0.15,
};

/** Half-width of the dead band around a string, so jitter cannot re-pluck it. */
export const STRING_HYSTERESIS = 0.0025;
/** Minimum time between two plucks of the same string. */
export const REPLUCK_SECONDS = 0.05;
/** Resting the fingertip back on a ringing string this long damps it. */
export const TOUCH_MUTE_SECONDS = 0.15;
/** Resting means nearly still across the strings, not a slow strum passing by. */
export const REST_SPEED = 0.012;
/** A tracking dropout this short keeps the stroke going. */
export const TRACKING_GAP_SECONDS = 0.25;
/** Strings crossed during one long frame or dropout spread over at most this long. */
const MAX_STRUM_SPREAD = 0.04;

export interface PluckEvent {
  string: number;
  /** Seconds from now to sound the note, keeping a strum's spacing. */
  delay: number;
  /** 0..1 loudness from fingertip speed across the strings. */
  velocity: number;
}

export interface PluckDetectorOptions {
  /** Smooth tracking jitter with a One Euro filter (default true). */
  smoothing?: boolean;
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
    delay: 0,
    velocity: 0,
  }));
  count = 0;
  /** Strings the fingertip has deliberately rested on long enough to damp. */
  readonly damping = new Uint8Array(STRING_COUNT);
  inZone = false;

  private readonly smoothing: boolean;
  private readonly fx = new OneEuroFilter(4, 30, 5);
  private readonly fy = new OneEuroFilter(4, 30, 5);
  private readonly fz = new OneEuroFilter(4, 30, 5);
  private readonly side = new Int8Array(STRING_COUNT);
  private readonly lastPluck = new Float64Array(STRING_COUNT).fill(-Infinity);
  private readonly touchStart = new Float64Array(STRING_COUNT).fill(-1);
  private px = 0;
  private py = 0;
  private pz = 0;
  private speed = 0;
  private started = false;
  private time = 0;
  private gap = 0;
  private strumDir = 0;
  private strumUntil = -Infinity;

  constructor(options: PluckDetectorOptions = {}) {
    this.smoothing = options.smoothing ?? true;
  }

  update(rawX: number, rawY: number, rawZ: number, dt: number): number {
    this.count = 0;
    this.time += dt;
    // After a dropout, the motion since the last sample spans the whole gap.
    const span = this.gap + dt;
    const resumed = this.gap > 0;
    this.gap = 0;
    if (resumed) {
      this.fx.reset();
      this.fy.reset();
      this.fz.reset();
    }
    const x = this.smoothing ? this.fx.filter(rawX, dt) : rawX;
    const y = this.smoothing ? this.fy.filter(rawY, dt) : rawY;
    const z = this.smoothing ? this.fz.filter(rawZ, dt) : rawZ;

    const height = z - GUITAR.stringZ;
    this.inZone =
      inX(x) &&
      height < PLUCK_ZONE.above &&
      height > -PLUCK_ZONE.below &&
      Math.abs(y) < stringSpan(x) / 2 + PLUCK_ZONE.edge;

    if (!this.started) {
      for (let s = 0; s < STRING_COUNT; s++) {
        const d = y - stringY(s, x);
        this.side[s] = Math.abs(d) < STRING_HYSTERESIS ? 0 : d > 0 ? 1 : -1;
      }
      this.px = x;
      this.py = y;
      this.pz = z;
      this.started = true;
      return 0;
    }

    const instant = span > 0 ? Math.abs(y - this.py) / span : 0;
    this.speed = this.speed * 0.4 + instant * 0.6;
    const velocity = Math.min(1, 0.15 + this.speed / 1.6);
    const dir = y < this.py ? -1 : 1;
    const spread = Math.min(span, MAX_STRUM_SPREAD);

    for (let s = 0; s < STRING_COUNT; s++) {
      const d0 = this.py - stringY(s, this.px);
      const d1 = y - stringY(s, x);
      if (Math.abs(d1) >= STRING_HYSTERESIS) this.crossString(s, d0, d1, x, z, dir, velocity, spread);

      // Damp only a ringing string the fingertip comes back to rest on,
      // never the one it is moving away from after plucking it. Decided
      // after this frame's plucks, so a pluck can never damp itself.
      const touching =
        this.inZone && this.speed < REST_SPEED && Math.abs(d1) < STRING_HYSTERESIS * 1.4;
      if (!touching) this.touchStart[s] = -1;
      else if (this.touchStart[s] < 0) this.touchStart[s] = this.time;
      this.damping[s] =
        touching &&
        this.time - this.touchStart[s] > TOUCH_MUTE_SECONDS &&
        this.touchStart[s] > this.lastPluck[s] + 0.1
          ? 1
          : 0;
    }

    // Order a strum's notes by when each string was crossed.
    if (this.count > 1) {
      const used = this.events.slice(0, this.count).sort((a, b) => a.delay - b.delay);
      for (let i = 0; i < used.length; i++) this.events[i] = used[i];
    }

    this.px = x;
    this.py = y;
    this.pz = z;
    return this.count;
  }

  /** Updates string `s`'s side and records a pluck if the finger crossed it on the strings. */
  private crossString(
    s: number,
    d0: number,
    d1: number,
    x: number,
    z: number,
    dir: number,
    velocity: number,
    spread: number,
  ): void {
    const newSide = d1 > 0 ? 1 : -1;
    const prevSide = this.side[s];
    this.side[s] = newSide;
    if (prevSide === 0 || prevSide === newSide) return;

    // Where along this frame's motion the string was crossed, and whether
    // that point was on the strings.
    const t = Math.sign(d0) !== newSide && d0 !== d1 ? clamp01(d0 / (d0 - d1)) : 0;
    const cx = this.px + (x - this.px) * t;
    const ch = this.pz + (z - this.pz) * t - GUITAR.stringZ;
    const striking = dir === this.strumDir && this.time <= this.strumUntil;
    const above = striking ? PLUCK_ZONE.strumAbove : PLUCK_ZONE.above;
    const below = striking ? PLUCK_ZONE.strumBelow : PLUCK_ZONE.below;
    if (!inX(cx) || ch >= above || ch <= -below) return;
    if (this.time - this.lastPluck[s] < REPLUCK_SECONDS) return;

    const event = this.events[this.count++];
    event.string = s;
    event.delay = t * spread;
    event.velocity = velocity;
    this.lastPluck[s] = this.time;
    this.strumDir = dir;
    this.strumUntil = this.time + PLUCK_ZONE.strumHold;
  }

  /**
   * The fingertip was not tracked this frame. A short gap keeps the stroke
   * going; the next tracked sample is treated as motion across the gap.
   */
  lost(dt: number): void {
    this.count = 0;
    this.inZone = false;
    this.damping.fill(0);
    if (!this.started) return;
    this.gap += dt;
    this.time += dt;
    if (this.gap > TRACKING_GAP_SECONDS) this.reset();
  }

  reset(): void {
    this.side.fill(0);
    this.touchStart.fill(-1);
    this.damping.fill(0);
    this.fx.reset();
    this.fy.reset();
    this.fz.reset();
    this.started = false;
    this.gap = 0;
    this.inZone = false;
    this.count = 0;
  }
}

function inX(x: number): boolean {
  return x > PLUCK_ZONE.minX && x < PLUCK_ZONE.maxX;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * One Euro filter (Casiez et al.): heavy smoothing when the input moves
 * slowly, where jitter is noticeable, and little when it moves fast, where
 * lag is.
 */
export class OneEuroFilter {
  private value: number | null = null;
  private derivative = 0;

  constructor(
    private readonly minCutoff: number,
    private readonly beta: number,
    private readonly derivativeCutoff: number,
  ) {}

  filter(input: number, dt: number): number {
    if (this.value == null || dt <= 0) {
      this.value = input;
      this.derivative = 0;
      return input;
    }
    const rate = (input - this.value) / dt;
    this.derivative += alpha(this.derivativeCutoff, dt) * (rate - this.derivative);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.derivative);
    this.value += alpha(cutoff, dt) * (input - this.value);
    return this.value;
  }

  reset(): void {
    this.value = null;
    this.derivative = 0;
  }
}

function alpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}
