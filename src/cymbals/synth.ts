import { makeRoomImpulse } from '../guitar/synth.js';

/** One clash, as the synth sounds it. */
export interface ClashSound {
  /** 0 to 1, from the closing speed. */
  loudness: number;
  /** The plates met flat and centred: an air pocket muffles the clash. */
  flush: boolean;
}

/**
 * Pre-rendered clashes, soft to loud. Harder clashes are not only louder:
 * they excite the high modes more and ring longer, so each layer is its own
 * recording and playback crossfades between neighbours.
 */
export const LAYERS = [
  { loudness: 0.2, seconds: 5 },
  { loudness: 0.55, seconds: 7.5 },
  { loudness: 1, seconds: 10 },
] as const;

/**
 * The wash, as noise bands: centre frequency (Hz), level, how long the band
 * takes to bloom after the impact (s) and its decay time constant at
 * fortissimo (s). Energy spreads upward through the plate in the first tens
 * of milliseconds, and the highs die first.
 */
const BANDS: [number, number, number, number][] = [
  [380, 0.42, 0.004, 1.7],
  [750, 0.62, 0.006, 1.6],
  [1500, 0.78, 0.012, 1.35],
  [2900, 0.92, 0.022, 1.05],
  [5000, 0.85, 0.04, 0.8],
  [7800, 0.6, 0.055, 0.55],
  [11500, 0.32, 0.065, 0.36],
];
/** Inharmonic partials over the wash: the shimmer that makes it metal, not hiss. */
const PARTIALS = 150;
const PARTIAL_LOW = 320;
const PARTIAL_HIGH = 9500;
/** The plate's lowest modes, each a slightly split pair that beats. */
const GONG_MODES = [121, 178, 243, 309, 392, 466, 548];
/** How long the ringing takes to fall by 1/e, overall, at fortissimo (s): for the HUD and tests. */
export const RING_TAU = 2.2;
/** How fast a damped cymbal falls silent (time constant, s). */
const DAMP_TAU = 0.045;
/** A new clash re-strikes the plates, damping what was ringing to this much. */
const RESTRIKE_KEEP = 0.35;
const MAX_VOICES = 4;

/** A seeded random source, so every load renders the same cymbal. */
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

/** Renders one layer of the clash offline (off the main thread). */
export async function renderClash(sampleRate: number, loudness: number, seconds: number): Promise<AudioBuffer> {
  const length = Math.floor(sampleRate * seconds);
  const ctx = new OfflineAudioContext(2, length, sampleRate);
  const rand = seeded(1811);
  const bus = ctx.createGain();
  bus.connect(ctx.destination);
  // Softer clashes ring for less time and bloom less far up.
  const decay = 0.55 + 0.45 * loudness;
  const bloom = 0.6 + 0.4 * loudness;
  const darker = (hz: number) => (0.45 + 0.55 * loudness) ** (Math.max(0, Math.log2(hz / 700)) * 0.55);

  const noise = ctx.createBuffer(2, length, sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = noise.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = rand() * 2 - 1;
  }
  for (const [hz, level, rise, tau] of BANDS) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = hz;
    band.Q.value = 1.3;
    const env = ctx.createGain();
    // A band's width grows with its frequency, and so does the noise it passes: offset most of that.
    const peak = level * darker(hz) * (1000 / hz) ** 0.3;
    env.gain.setValueAtTime(0, 0);
    env.gain.linearRampToValueAtTime(peak, rise * bloom);
    env.gain.setTargetAtTime(0, rise * bloom, tau * decay);
    src.connect(band).connect(env).connect(bus);
    src.start(0);
  }

  const ring = (hz: number, level: number, rise: number, tau: number, pan: number) => {
    const osc = ctx.createOscillator();
    osc.frequency.value = hz;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, 0);
    env.gain.linearRampToValueAtTime(level, rise);
    env.gain.setTargetAtTime(0, rise, tau);
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    osc.connect(env).connect(panner).connect(bus);
    osc.start(0);
  };
  for (let i = 0; i < PARTIALS; i++) {
    const hz = PARTIAL_LOW * (PARTIAL_HIGH / PARTIAL_LOW) ** rand();
    const level = (0.09 * (hz / 1000) ** -0.2 * (0.4 + 0.6 * rand()) * darker(hz)) / Math.sqrt(PARTIALS / 40);
    const tau = 2.4 * (1000 / hz) ** 0.45 * (0.7 + 0.6 * rand()) * decay;
    ring(hz, level, 0.002 + 0.03 * (hz / PARTIAL_HIGH) * rand() * bloom, tau, rand() * 1.2 - 0.6);
  }
  for (const hz of GONG_MODES) {
    const beat = 0.35 + 0.55 * rand();
    for (const side of [-1, 1]) ring(hz + (side * beat) / 2, 0.03 * loudness ** 0.5, 0.003, 3.2 * decay, side * 0.3);
  }

  // The impact: a crack as the rims meet, and the low thump of the plates.
  const crack = ctx.createBufferSource();
  crack.buffer = noise;
  const high = ctx.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = 1800;
  const crackEnv = ctx.createGain();
  crackEnv.gain.setValueAtTime(0, 0);
  crackEnv.gain.linearRampToValueAtTime(1.3 * loudness, 0.0005);
  crackEnv.gain.setTargetAtTime(0, 0.0005, 0.006);
  crack.connect(high).connect(crackEnv).connect(bus);
  crack.start(0);
  ring(85, 0.25 * loudness, 0.001, 0.03, 0);

  const out = await ctx.startRendering();
  // Normalized, with a taper so the tail ends in silence; playback sets the level.
  let peak = 0;
  for (let ch = 0; ch < 2; ch++) for (const v of out.getChannelData(ch)) peak = Math.max(peak, Math.abs(v));
  const taper = Math.floor(length * 0.2);
  for (let ch = 0; ch < 2; ch++) {
    const data = out.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const fade = i < length - taper ? 1 : 0.5 + 0.5 * Math.cos((Math.PI * (i - (length - taper))) / taper);
      data[i] *= (0.9 / (peak || 1)) * fade;
    }
  }
  return out;
}

/** The air pocket's whump: a short burst of low noise (rendered on the main thread; it is tiny). */
function makeWhump(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const length = Math.floor(sr * 0.25);
  const buf = ctx.createBuffer(1, length, sr);
  const data = buf.getChannelData(0);
  const rand = seeded(7);
  const k = 1 - Math.exp((-2 * Math.PI * 160) / sr);
  let lp = 0;
  let peak = 0;
  for (let i = 0; i < length; i++) {
    lp += k * (rand() * 2 - 1 - lp);
    const t = i / sr;
    data[i] = lp * Math.min(1, t / 0.004) * Math.exp(-t / 0.04);
    peak = Math.max(peak, Math.abs(data[i]));
  }
  for (let i = 0; i < length; i++) data[i] /= peak || 1;
  return buf;
}

interface Voice {
  sources: AudioBufferSourceNode[];
  /** Scales the voice as later clashes and damping cut it. */
  damper: GainNode;
  keep: number;
}

/**
 * Plays the clashes: each is the pre-rendered layers either side of its
 * loudness, crossfaded, through a lowpass that opens as clashes get harder,
 * into a hall. Damping chokes everything ringing.
 */
export class CymbalSynth {
  readonly ctx: AudioContext;
  /** Resolves once every layer is rendered; clashes before then are silent. */
  readonly warm: Promise<void>;
  private layers: AudioBuffer[] = [];
  private readonly whump: AudioBuffer;
  private readonly dry: GainNode;
  private voices: Voice[] = [];
  /** The ringing's level and when it was last set, for `ringing`. */
  private ringLevel = 0;
  private ringAt = 0;
  private ringTau = RING_TAU;

  constructor(context?: AudioContext) {
    this.ctx = context ?? new AudioContext({ latencyHint: 'interactive' });
    const ctx = this.ctx;
    this.whump = makeWhump(ctx);
    this.dry = ctx.createGain();
    this.dry.gain.value = 0.8;

    const reverb = ctx.createConvolver();
    reverb.buffer = makeRoomImpulse(ctx, 2.6);
    const wet = ctx.createGain();
    wet.gain.value = 0.3;
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

    this.warm = Promise.all(LAYERS.map((l) => renderClash(ctx.sampleRate, l.loudness, l.seconds))).then((layers) => {
      this.layers = layers;
    });
  }

  /** Sounds a clash at `at` (audio clock). */
  clash(sound: ClashSound, at = this.ctx.currentTime): void {
    if (this.layers.length === 0) return;
    const ctx = this.ctx;
    const loudness = Math.min(1, Math.max(0, sound.loudness));
    // The plates strike again: whatever was ringing is mostly stopped.
    for (const v of this.voices) {
      v.keep *= RESTRIKE_KEEP;
      v.damper.gain.setTargetAtTime(v.keep, at, 0.015);
    }
    while (this.voices.length >= MAX_VOICES) this.release(this.voices.shift()!, at, 0.02);

    const level = (loudness * (sound.flush ? 0.55 : 1)) ** 1.4;
    const damper = ctx.createGain();
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = sound.flush ? 2200 : 4500 + 10500 * loudness;
    tone.Q.value = 0.5;
    tone.connect(damper).connect(this.dry);
    const voice: Voice = { sources: [], damper, keep: 1 };
    const play = (buffer: AudioBuffer, gain: number) => {
      if (gain <= 0.001) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(g).connect(tone);
      src.start(at);
      voice.sources.push(src);
    };
    let i = 0;
    while (i < LAYERS.length - 2 && loudness > LAYERS[i + 1].loudness) i++;
    const span = LAYERS[i + 1].loudness - LAYERS[i].loudness;
    const w = Math.min(1, Math.max(0, (loudness - LAYERS[i].loudness) / span));
    play(this.layers[i], level * (1 - w));
    play(this.layers[i + 1], level * w);
    if (sound.flush) play(this.whump, 0.7 * loudness);
    this.voices.push(voice);
    // The voice is done when its longest recording ends (the whump is short).
    const longest = voice.sources.reduce<AudioBufferSourceNode | null>(
      (best, s) => (best == null || s.buffer!.duration > best.buffer!.duration ? s : best),
      null,
    );
    if (longest) longest.onended = () => (this.voices = this.voices.filter((v) => v !== voice));

    this.ringLevel = Math.min(1, this.ringing(at) * RESTRIKE_KEEP + level ** (1 / 1.4));
    this.ringAt = at;
    this.ringTau = RING_TAU * (0.55 + 0.45 * loudness);
  }

  /** Chokes everything ringing, as a hand or the chest on the plates does. */
  damp(at = this.ctx.currentTime): void {
    for (const v of this.voices) this.release(v, at, DAMP_TAU);
    this.voices = [];
    this.ringLevel = 0;
    this.ringAt = at;
  }

  /** Roughly how loud the cymbals still ring, 0 to 1. */
  ringing(now = this.ctx.currentTime): number {
    return this.ringLevel * Math.exp(-Math.max(0, now - this.ringAt) / this.ringTau);
  }

  setVolume(volume: number): void {
    this.dry.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.03);
  }

  /** Browsers start audio suspended until a user gesture; call from one. */
  resume(): void {
    if (this.ctx.state !== 'running') void this.ctx.resume();
  }

  stopAll(): void {
    this.damp();
  }

  dispose(): void {
    void this.ctx.close();
  }

  private release(v: Voice, at: number, tau: number): void {
    v.damper.gain.cancelScheduledValues(at);
    v.damper.gain.setTargetAtTime(0, at, tau);
    for (const s of v.sources) s.stop(at + tau * 10);
  }
}
