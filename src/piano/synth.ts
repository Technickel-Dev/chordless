/**
 * The air piano's voice, on the Web Audio API.
 *
 * Every third key is rendered offline (off the main thread) at a soft and a
 * hard blow and cached; the keys between play their neighbour's recording a
 * semitone up or down. A rendered note is the string's partials, each a
 * little sharper than a true harmonic (a piano string is stiff), each made
 * of the unison strings slightly out of tune with one another: they beat,
 * and their sound falls fast at first and then rings on (a piano's
 * two-stage decay). A harder blow flattens the felt hammer and brings out
 * the upper partials, so the two recordings differ in colour, not only in
 * level, and playback crossfades between them. Letting a key up drops its
 * damper, except in the top octave and a half, which has none.
 */

import { makeRoomImpulse, midiToHz } from '../guitar/synth.js';
import { PIANO } from './geometry.js';

/** The keys that are rendered: every third, so no key is more than a semitone from one. */
export const ROOTS: number[] = [];
for (let m = PIANO.lowest + 1; m - 1 <= PIANO.highest; m += 3) ROOTS.push(m);
/** The blows each root is rendered at. */
export const LAYERS = [0.3, 1] as const;
/** Keys from here up have no dampers, as on a real piano. */
export const UNDAMPED_FROM = 89;
/** Loudness every rendered note is matched to, over its attack. */
const NOTE_RMS = 0.2;
const MAX_VOICES = 32;
const MAX_PARTIALS = 40;

/** How stiff the string is (the inharmonicity coefficient B), lowest in the bass, rising up the treble. */
export function inharmonicity(midi: number): number {
  const t = Math.min(1, Math.max(0, (midi - 33) / 75));
  return 10 ** (-3.8 + 1.9 * t);
}

/** The nth partial of a stiff string whose fundamental would be `f0`. */
export function partialHz(f0: number, n: number, b: number): number {
  return n * f0 * Math.sqrt(1 + b * n * n);
}

/** How long a note's fundamental takes to fall by 1/e once its first, fast fall is over (s). */
export function sustainSeconds(midi: number): number {
  return Math.min(6, Math.max(0.35, 3.4 * 2 ** ((-(midi - 60) / 12) * 0.8)));
}

/** How long a note is rendered (s). Softer blows fade into silence sooner. */
export function noteSeconds(midi: number, velocity: number): number {
  return Math.min(6, Math.max(1.2, 3 * sustainSeconds(midi))) * (0.7 + 0.3 * velocity);
}

/** Which rendered root plays a key, and how much faster. */
export function sampleFor(midi: number): { root: number; rate: number } {
  const i = Math.min(ROOTS.length - 1, Math.max(0, Math.round((midi - ROOTS[0]) / 3)));
  return { root: i, rate: 2 ** ((midi - ROOTS[i]) / 12) };
}

/**
 * The soundboard and case as a short impulse response: the direct sound
 * plus a few dozen damped resonances, strongest in the low mids and
 * thinning out into the treble. Every note is played through the same one,
 * so each pitch is coloured by it differently, as on a real instrument.
 */
function soundboardImpulse(ctx: BaseAudioContext): AudioBuffer {
  const rate = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, Math.floor(rate * 0.4), rate);
  const data = buffer.getChannelData(0);
  const rand = seeded(88);
  const modes = 70;
  for (let m = 0; m < modes; m++) {
    const f = 80 * (4200 / 80) ** rand();
    const amp = (0.4 + rand()) / Math.sqrt(1 + (f / 250) ** 2);
    const decay = (0.02 + 0.14 * rand()) * (250 / Math.max(250, f)) ** 0.35;
    const phase = rand() * Math.PI * 2;
    for (let i = 0; i < data.length; i++) {
      const t = i / rate;
      data[i] += amp * Math.exp(-t / decay) * Math.sin(2 * Math.PI * f * t + phase);
    }
  }
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  for (let i = 0; i < data.length; i++) data[i] *= 0.3 / (peak || 1);
  data[0] += 1;
  return buffer;
}

/** A seeded random source, so every load renders the same piano. */
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

/** The level of a note's partials, before the attack is normalized. */
export function partialLevels(midi: number, velocity: number, sampleRate = 48000): { hz: number[]; level: number[] } {
  const f0 = midiToHz(midi);
  const b = inharmonicity(midi);
  // The hammer strikes about an eighth of the way along: partials near
  // multiples of 8 are weak. A harder blow compresses the felt, which
  // then acts as a brighter (higher) lowpass.
  const strike = 0.122;
  const felt = (600 + 3800 * velocity ** 1.4) * (f0 / 262) ** 0.3;
  const top = Math.min(14000, sampleRate * 0.45);
  const hz: number[] = [];
  const level: number[] = [];
  for (let n = 1; n <= MAX_PARTIALS; n++) {
    const f = partialHz(f0, n, b);
    if (f > top) break;
    // The soundboard radiates the lowest bass poorly: a low note is heard mostly through its overtones.
    const radiation = 1 / (1 + (110 / f) ** 2);
    const a = (Math.abs(Math.sin(Math.PI * n * strike)) / n ** 0.6) * radiation / (1 + (f / felt) ** 2.5);
    if (a < 0.002) continue;
    hz.push(f);
    level.push(a);
  }
  return { hz, level };
}

/** Renders one note at one blow, mono, normalized. */
export async function renderNote(sampleRate: number, midi: number, velocity: number): Promise<AudioBuffer> {
  const seconds = noteSeconds(midi, velocity);
  const length = Math.floor(sampleRate * seconds);
  const ctx = new OfflineAudioContext(1, length, sampleRate);
  const rand = seeded(midi * 131 + Math.round(velocity * 100));
  const bus = ctx.createGain();
  const board = ctx.createConvolver();
  board.normalize = false;
  board.buffer = soundboardImpulse(ctx);
  bus.connect(board).connect(ctx.destination);
  const tau = sustainSeconds(midi);
  const f0 = midiToHz(midi);
  // A soft blow pushes the string more gently: a slower attack.
  const attack = 0.0035 - 0.002 * velocity;

  const ring = (hz: number, level: number, decay: number) => {
    const osc = ctx.createOscillator();
    osc.frequency.value = hz;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, 0);
    env.gain.linearRampToValueAtTime(level, attack);
    env.gain.setTargetAtTime(0, attack, decay);
    osc.connect(env).connect(bus);
    osc.start(0);
  };
  const { hz, level } = partialLevels(midi, velocity, sampleRate);
  for (let k = 0; k < hz.length; k++) {
    const f = hz[k];
    // Higher partials die much sooner, so the tone mellows as it rings.
    const slow = Math.max(0.12, tau * (f0 / f) ** 0.95);
    const prompt = Math.max(0.03, slow * 0.12);
    // The unison strings start in step (the fast fall) and drift apart (the long ring, beating).
    const cents = 0.35 + 0.9 * rand();
    ring(f, level[k] * 0.7, prompt);
    if (k < 4) {
      ring(f * 2 ** (cents / 1200), level[k] * 0.18, slow);
      ring(f * 2 ** (-cents / 1900), level[k] * 0.12, slow * 0.9);
    } else {
      ring(f * 2 ** (cents / 1200), level[k] * 0.3, slow);
    }
  }

  // The hammer's knock: a short burst of noise, darker for softer blows.
  const noise = ctx.createBuffer(1, Math.floor(sampleRate * 0.08), sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = rand() * 2 - 1;
  const knock = ctx.createBufferSource();
  knock.buffer = noise;
  const knockTone = ctx.createBiquadFilter();
  knockTone.type = 'lowpass';
  knockTone.frequency.value = 900 + 2600 * velocity;
  const knockEnv = ctx.createGain();
  knockEnv.gain.setValueAtTime(0, 0);
  knockEnv.gain.linearRampToValueAtTime(0.05 * velocity ** 1.5, 0.0008);
  knockEnv.gain.setTargetAtTime(0, 0.0008, 0.009);
  knock.connect(knockTone).connect(knockEnv).connect(bus);
  knock.start(0);
  // And the felt's dull thud, which a low note carries more of.
  const thud = ctx.createBufferSource();
  thud.buffer = noise;
  const thudTone = ctx.createBiquadFilter();
  thudTone.type = 'lowpass';
  thudTone.frequency.value = 220 + 200 * velocity;
  const thudEnv = ctx.createGain();
  const thudLevel = 0.16 * velocity ** 1.2 * Math.min(1, Math.max(0.25, (96 - midi) / 48));
  thudEnv.gain.setValueAtTime(0, 0);
  thudEnv.gain.linearRampToValueAtTime(thudLevel, 0.002);
  thudEnv.gain.setTargetAtTime(0, 0.002, 0.014);
  thud.connect(thudTone).connect(thudEnv).connect(bus);
  thud.start(0);

  const out = await ctx.startRendering();
  const samples = out.getChannelData(0);
  // Match every note's attack to the same loudness, never clipping, then taper the tail into silence.
  const window = Math.min(length, Math.floor(sampleRate * 0.25));
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < length; i++) {
    if (i < window) sum += samples[i] * samples[i];
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  const gain = Math.min(NOTE_RMS / (Math.sqrt(sum / window) || 1), 0.95 / (peak || 1));
  const taper = Math.floor(length * 0.2);
  for (let i = 0; i < length; i++) {
    const fade = i < length - taper ? 1 : 0.5 + 0.5 * Math.cos((Math.PI * (i - (length - taper))) / taper);
    samples[i] *= gain * fade;
  }
  return out;
}

interface Voice {
  sources: AudioBufferSourceNode[];
  /** The damper: falls to silence when the key comes up. */
  damper: GainNode;
  /** When it started, for stealing the oldest. */
  started: number;
}

/**
 * Plays the keys: each struck key starts a voice that plays its root's two
 * recordings, crossfaded by how hard it was struck, at its pitch, panned
 * across the keyboard as the player hears it, through the piano's lid and
 * soundboard colour into a room.
 */
export class PianoSynth {
  readonly ctx: BaseAudioContext;
  private rendering: Promise<void> | null = null;
  /** Rendered recordings by root, then by layer; null until rendered. */
  private readonly buffers: (AudioBuffer[] | null)[] = ROOTS.map(() => null);
  private readonly voices: (Voice | null)[] = Array(PIANO.highest - PIANO.lowest + 1).fill(null);
  private readonly dry: GainNode;
  private count = 0;

  /**
   * Plays through a live AudioContext by default; pass an
   * OfflineAudioContext to render to a buffer instead (for listening tests).
   */
  constructor(context?: BaseAudioContext) {
    this.ctx = context ?? new AudioContext({ latencyHint: 'interactive' });
    const ctx = this.ctx;
    this.dry = ctx.createGain();
    this.dry.gain.value = 0.8;
    // The soundboard and open lid: a little body in the low mids, a little air on top.
    const body = ctx.createBiquadFilter();
    body.type = 'peaking';
    body.frequency.value = 220;
    body.Q.value = 0.8;
    body.gain.value = 1;
    const air = ctx.createBiquadFilter();
    air.type = 'highshelf';
    air.frequency.value = 4000;
    air.gain.value = 0.5;
    this.dry.connect(body).connect(air);

    const reverb = ctx.createConvolver();
    reverb.buffer = makeRoomImpulse(ctx, 2.8);
    const wet = ctx.createGain();
    wet.gain.value = 0.3;
    air.connect(reverb).connect(wet);

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    air.connect(limiter);
    wet.connect(limiter);
    limiter.connect(ctx.destination);

  }

  /**
   * Starts rendering the voice, if it has not started, and resolves once
   * every root is rendered; until then keys play the nearest one that is.
   * Nothing is rendered until the piano is wanted, so the other instruments
   * do not wait on it.
   */
  warm(): Promise<void> {
    this.rendering ??= this.renderAll();
    return this.rendering;
  }

  /** Renders the roots from the middle of the keyboard outward, so the keys played most are ready first. */
  private async renderAll(): Promise<void> {
    const middle = (ROOTS.length - 1) / 2;
    const order = ROOTS.map((_, i) => i).sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle));
    for (const i of order) {
      this.buffers[i] = await Promise.all(LAYERS.map((v) => renderNote(this.ctx.sampleRate, ROOTS[i], v)));
    }
  }

  /** Strikes a key, `velocity` 0.1 to 1, at `at` (audio clock). */
  noteOn(midi: number, velocity: number, at = this.ctx.currentTime): void {
    let { root, rate } = sampleFor(midi);
    if (this.buffers[root] == null) {
      // Not rendered yet: the nearest root that is, further transposed.
      let best = -1;
      for (let i = 0; i < ROOTS.length; i++) {
        if (this.buffers[i] != null && (best < 0 || Math.abs(i - root) < Math.abs(best - root))) best = i;
      }
      if (best < 0) return;
      root = best;
      rate = 2 ** ((midi - ROOTS[root]) / 12);
    }
    const layers = this.buffers[root]!;
    const ctx = this.ctx;
    const index = midi - PIANO.lowest;
    // Striking a key that still sounds: the hammer stops the old vibration and starts a new one.
    const old = this.voices[index];
    if (old) this.release(old, at, 0.012);
    if (this.count >= MAX_VOICES) this.stealOldest(at);

    const v = Math.min(1, Math.max(0, velocity));
    const damper = ctx.createGain();
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-0.6, Math.min(0.6, (midi - 66) / 50));
    damper.connect(pan).connect(this.dry);
    const voice: Voice = { sources: [], damper, started: at };
    // Equal-power crossfade between the soft and hard recordings.
    const w = Math.min(1, Math.max(0, (v - LAYERS[0]) / (LAYERS[1] - LAYERS[0])));
    const level = v ** 1.7;
    const play = (buffer: AudioBuffer, gain: number) => {
      if (gain < 0.001) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = rate;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(g).connect(damper);
      src.start(at);
      voice.sources.push(src);
    };
    play(layers[0], level * Math.cos((w * Math.PI) / 2));
    play(layers[1], level * Math.sin((w * Math.PI) / 2));
    if (voice.sources.length === 0) return;
    const last = voice.sources[voice.sources.length - 1];
    last.onended = () => {
      if (this.voices[index] === voice) {
        this.voices[index] = null;
        this.count--;
      }
    };
    if (old == null) this.count++;
    this.voices[index] = voice;
  }

  /** Lets a key up: its damper stops the strings, unless it is one of the top keys, which ring on. */
  noteOff(midi: number, at = this.ctx.currentTime): void {
    if (midi >= UNDAMPED_FROM) return;
    const index = midi - PIANO.lowest;
    const voice = this.voices[index];
    if (voice == null) return;
    // Heavier bass strings take a little longer to stop.
    const tau = 0.05 + 0.1 * Math.min(1, Math.max(0, (60 - midi) / 24));
    this.release(voice, at, tau);
    this.voices[index] = null;
    this.count--;
  }

  /** How many keys are sounding. */
  get sounding(): number {
    return this.count;
  }

  setVolume(volume: number): void {
    this.dry.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.03);
  }

  /** Browsers start audio suspended until a user gesture; call from one. */
  resume(): void {
    if (this.ctx instanceof AudioContext && this.ctx.state !== 'running') void this.ctx.resume();
  }

  stopAll(): void {
    const at = this.ctx.currentTime;
    for (let i = 0; i < this.voices.length; i++) {
      const voice = this.voices[i];
      if (voice) this.release(voice, at, 0.05);
      this.voices[i] = null;
    }
    this.count = 0;
  }

  dispose(): void {
    if (this.ctx instanceof AudioContext) void this.ctx.close();
  }

  private stealOldest(at: number): void {
    let oldest = -1;
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      if (v && (oldest < 0 || v.started < this.voices[oldest]!.started)) oldest = i;
    }
    if (oldest < 0) return;
    this.release(this.voices[oldest]!, at, 0.03);
    this.voices[oldest] = null;
    this.count--;
  }

  private release(v: Voice, at: number, tau: number): void {
    v.damper.gain.cancelScheduledValues(at);
    v.damper.gain.setTargetAtTime(0, at, tau);
    for (const s of v.sources) {
      s.onended = null;
      s.stop(at + tau * 8);
    }
  }
}
