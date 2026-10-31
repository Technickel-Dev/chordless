import { makeRoomImpulse } from '../guitar/synth.js';
import { BAR } from './geometry.js';

/** One strike, as the synth sounds it. */
export interface StrikeSound {
  /** 0 to 1, from the beater's speed. */
  loudness: number;
  /** Where along the bar it was struck (m from the base's open end). */
  position: number;
  /** How square to the face: 1 straight into it, 0 within the triangle's plane. */
  across: number;
}

/**
 * The bar's bending modes, as a free steel rod 10 mm thick and as long as
 * the triangle's bar (beta L for free-free modes 1 to 16). Bending the rod
 * into a triangle splits each into an in-plane and an out-of-plane mode,
 * and the corners couple them into a third (and, higher up, where the
 * corners matter more, into a cluster).
 */
const BETA_L = [4.73, 7.853, 10.996, 14.137, 17.279, 20.42, 23.562, 26.704, 29.845, 32.987, 36.128, 39.27, 42.412, 45.553, 48.695, 51.836];
/** sqrt(E I / rho A) for a 10 mm steel rod (m^2/s). */
const ROD = 0.0025 * 5100;
const TOP_HZ = 17500;
/** A damped triangle dies away with this time constant (s). */
const DAMP_TAU = 0.035;
/** How long the ringing takes to fall by 1/e, overall (s): for the HUD and tests. */
export const RING_TAU = 2.6;

export interface Mode {
  hz: number;
  /** Decay time constant (s). */
  tau: number;
  /** Which bending mode (1-based), for its shape along the bar. */
  n: number;
  /** 0 in-plane, 1 out-of-plane, 0.5 the coupled one. */
  plane: number;
  pan: number;
}

/** A seeded random source, so every load makes the same triangle. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The triangle's modes. */
export function triangleModes(): Mode[] {
  const rand = seeded(7);
  const L = BAR.length;
  const modes: Mode[] = [];
  BETA_L.forEach((bl, i) => {
    const base = ((bl * bl) / (2 * Math.PI * L * L)) * ROD;
    const split = 0.012 + 0.02 * rand();
    const planes = i >= 4 ? [0, 1, 0.5, 0.5, 0.5] : [0, 1, 0.5];
    for (const plane of planes) {
      const offset = plane === 0 ? -split : plane === 1 ? split : (rand() - 0.5) * 0.12;
      const hz = base * (1 + offset) * (1 + (rand() - 0.5) * 0.03);
      if (hz > TOP_HZ) continue;
      modes.push({ hz, tau: 2.2 * (2000 / hz) ** 0.35 * (0.8 + 0.4 * rand()), n: i + 1, plane, pan: (rand() - 0.5) * 0.9 });
    }
  });
  return modes;
}

/** How much a strike excites each mode: where along the bar, how square to the face, and how hard. */
export function strikeAmplitudes(modes: Mode[], sound: StrikeSound, out = new Float32Array(modes.length)): Float32Array {
  const xi = Math.min(1, Math.max(0, sound.position / BAR.length));
  const loud = Math.min(1, Math.max(0, sound.loudness));
  // A harder strike is a shorter contact: it reaches higher modes.
  const cutoff = 4500 + 13000 * loud;
  let energy = 0;
  modes.forEach((m, i) => {
    const bl = BETA_L[m.n - 1];
    // Free-free bending shapes, alternately symmetric and not about the bar's middle.
    const shape = Math.max(0.12, Math.abs(Math.cos(bl * (xi - 0.5) - ((m.n - 1) * Math.PI) / 2)));
    const facing = m.plane === 0.5 ? 0.5 : m.plane === 1 ? 0.2 + 0.8 * sound.across : 0.2 + 0.8 * (1 - sound.across);
    // Low modes barely radiate from a thin rod; a hard steel beater favours the high ones.
    const radiates = (m.hz * m.hz) / (m.hz * m.hz + 1400 * 1400);
    const w = shape * facing * radiates * Math.exp(-((m.hz / cutoff) ** 2)) * (m.hz / 1000) ** 0.05;
    out[i] = w;
    energy += w * w;
  });
  const level = (0.32 * loud ** 1.3) / Math.sqrt(energy || 1);
  for (let i = 0; i < out.length; i++) out[i] *= level;
  return out;
}

/**
 * The audio-thread side: one two-pole resonator per mode, struck by
 * impulses and summed to stereo, plus the beater's tink (a few
 * milliseconds of high noise). Damping switches every resonator to a fast
 * decay until released. Loaded from a string, so it needs no bundler
 * support.
 */
const WORKLET = `
class TriangleProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.n = 0;
    this.events = [];
    this.damped = false;
    this.tink = 0;
    this.tinkPrev = 0;
    this.seed = 12345;
    this.tinkDecay = Math.exp(-1 / (0.0015 * sampleRate));
    // The modes come with the node, so it rings from its first sample.
    this.setModes(options.processorOptions);
    this.port.onmessage = (e) => {
      const m = e.data;
      {
        this.events.push(m);
        this.events.sort((a, b) => a.at - b.at);
      }
    };
  }
  setModes(m) {
    const n = m.hz.length;
    this.n = n;
    for (const k of ['c1', 'c2', 'd1', 'd2', 'y1', 'y2', 'gain', 'pl', 'pr']) this[k] = new Float64Array(n);
    const rd = Math.exp(-1 / (m.dampTau * sampleRate));
    for (let i = 0; i < n; i++) {
      const w = (2 * Math.PI * m.hz[i]) / sampleRate;
      const r = Math.exp(-1 / (m.tau[i] * sampleRate));
      this.c1[i] = 2 * r * Math.cos(w);
      this.c2[i] = -r * r;
      this.d1[i] = 2 * rd * Math.cos(w);
      this.d2[i] = -rd * rd;
      this.gain[i] = Math.sin(w);
      const a = ((m.pan[i] + 1) * Math.PI) / 4;
      this.pl[i] = Math.cos(a);
      this.pr[i] = Math.sin(a);
    }
  }
  apply(e) {
    if (e.type === 'strike') {
      for (let i = 0; i < this.n; i++) this.y1[i] += e.amps[i] * this.gain[i];
      this.tink += e.tink;
    } else if (e.type === 'damp') this.damped = true;
    else if (e.type === 'undamp') this.damped = false;
    else if (e.type === 'stop') {
      this.y1.fill(0);
      this.y2.fill(0);
      this.tink = 0;
    }
  }
  process(inputs, outputs) {
    const out = outputs[0];
    const L = out[0];
    const R = out[1] || out[0];
    const n = this.n;
    for (let i = 0; i < L.length; i++) {
      const t = currentTime + i / sampleRate;
      while (this.events.length && this.events[0].at <= t) this.apply(this.events.shift());
      const c1 = this.damped ? this.d1 : this.c1;
      const c2 = this.damped ? this.d2 : this.c2;
      let l = 0;
      let r = 0;
      for (let k = 0; k < n; k++) {
        const y = c1[k] * this.y1[k] + c2[k] * this.y2[k];
        this.y2[k] = this.y1[k];
        this.y1[k] = y;
        l += y * this.pl[k];
        r += y * this.pr[k];
      }
      if (this.tink > 1e-5) {
        this.seed = (this.seed * 16807) % 2147483647;
        const x = (this.seed / 2147483647 - 0.5) * this.tink;
        const high = x - this.tinkPrev;
        this.tinkPrev = x;
        l += high;
        r += high;
        this.tink *= this.tinkDecay;
      }
      L[i] = l;
      if (R !== L) R[i] = r;
    }
    return true;
  }
}
registerProcessor('air-triangle', TriangleProcessor);
`;

/**
 * Plays the triangle: its modes ring on the audio thread, struck where and
 * how the beater hits, into a hall. Strikes add to what is already
 * ringing, as on a real triangle, so a roll builds and sustains.
 */
export class TriangleSynth {
  readonly ctx: BaseAudioContext;
  /** Resolves once the resonators are running; strikes before then are silent. */
  readonly warm: Promise<void>;
  readonly modes = triangleModes();
  private node: AudioWorkletNode | null = null;
  private readonly amps = new Float32Array(this.modes.length);
  private readonly dry: GainNode;
  private damped = false;
  private ringLevel = 0;
  private ringAt = 0;

  constructor(context?: BaseAudioContext) {
    this.ctx = context ?? new AudioContext({ latencyHint: 'interactive' });
    const ctx = this.ctx;
    this.dry = ctx.createGain();
    this.dry.gain.value = 0.8;
    const reverb = ctx.createConvolver();
    reverb.buffer = makeRoomImpulse(ctx, 2.6);
    const wet = ctx.createGain();
    wet.gain.value = 0.28;
    this.dry.connect(reverb).connect(wet);
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 10;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.2;
    this.dry.connect(limiter);
    wet.connect(limiter);
    limiter.connect(ctx.destination);

    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
    this.warm = ctx.audioWorklet.addModule(url).then(() => {
      const node = new AudioWorkletNode(ctx, 'air-triangle', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: {
          hz: this.modes.map((m) => m.hz),
          tau: this.modes.map((m) => m.tau),
          pan: this.modes.map((m) => m.pan),
          dampTau: DAMP_TAU,
        },
      });
      node.connect(this.dry);
      this.node = node;
      URL.revokeObjectURL(url);
    });
  }

  /** Strikes the triangle at `at` (audio clock). */
  strike(sound: StrikeSound, at = this.ctx.currentTime): void {
    if (!this.node) return;
    strikeAmplitudes(this.modes, sound, this.amps);
    const loud = Math.min(1, Math.max(0, sound.loudness));
    this.node.port.postMessage({ type: 'strike', at, amps: this.amps, tink: 0.35 * loud ** 1.2 });
    if (!this.damped) {
      this.ringLevel = Math.min(1, this.ringing(at) + loud * (1 - 0.5 * this.ringing(at)));
      this.ringAt = at;
    }
  }

  /** Starts damping (a hand or the beater on the bar), until `release`. */
  damp(at = this.ctx.currentTime): void {
    if (this.damped) return;
    this.damped = true;
    this.node?.port.postMessage({ type: 'damp', at });
    this.ringLevel = 0;
    this.ringAt = at;
  }

  release(at = this.ctx.currentTime): void {
    if (!this.damped) return;
    this.damped = false;
    this.node?.port.postMessage({ type: 'undamp', at });
  }

  /** Roughly how loud the triangle still rings, 0 to 1. */
  ringing(now = this.ctx.currentTime): number {
    return this.ringLevel * Math.exp(-Math.max(0, now - this.ringAt) / RING_TAU);
  }

  setVolume(volume: number): void {
    this.dry.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.03);
  }

  /** Browsers start audio suspended until a user gesture; call from one. */
  resume(): void {
    if (this.ctx instanceof AudioContext && this.ctx.state !== 'running') void this.ctx.resume();
  }

  stopAll(): void {
    this.node?.port.postMessage({ type: 'stop', at: 0 });
    this.ringLevel = 0;
  }

  dispose(): void {
    if (this.ctx instanceof AudioContext) void this.ctx.close();
  }
}
