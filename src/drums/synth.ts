import { makeRoomImpulse } from '../guitar/synth.js';
import { makeNoise, playKnock } from '../smash/knock.js';
import type { Articulation } from './strokes.js';

/**
 * Each articulation is pre-rendered soft and hard. Harder strokes are not
 * only louder: they excite the higher modes more (a brighter attack, more
 * snare wire, more cymbal shimmer), so playback crossfades between the two.
 */
export const LAYERS = [0.3, 1] as const;

/** A drum: a pitched membrane plus the noise of the stick and, on a snare, the wires. */
interface DrumSpec {
  kind: 'drum';
  seconds: number;
  /** The head's fundamental (Hz), and how much higher it starts as the head is struck. */
  hz: number;
  bend: number;
  bendTau: number;
  /** Decay time constant of the fundamental (s). */
  tau: number;
  /** Overtones: ratio to the fundamental, level, decay as a fraction of `tau`. */
  modes: [number, number, number][];
  /** The stick's crack: band centre (Hz), level, decay (s). */
  crack: [number, number, number];
  /** Snare wires: level and decay (s); 0 for none. */
  wires: [number, number];
}

/** A cymbal: noise bands for the wash, inharmonic partials for the shimmer, and bell partials. */
interface MetalSpec {
  kind: 'metal';
  seconds: number;
  /** Centre (Hz), level, decay (s). */
  bands: [number, number, number][];
  partials: number;
  low: number;
  high: number;
  partialLevel: number;
  /** Decay of a 1 kHz partial (s); higher partials die sooner. */
  partialTau: number;
  /** Strong individual partials (a bell, a ride's ping): Hz, level, decay (s). */
  bell: [number, number, number][];
  /** The stick's tick on the metal: level, decay (s). */
  tick: [number, number];
  seed: number;
}

type Spec = DrumSpec | MetalSpec;

const TOM_MODES: [number, number, number][] = [
  [1.59, 0.35, 0.5],
  [2.14, 0.18, 0.35],
  [2.65, 0.08, 0.25],
];

export const SPECS: Record<Articulation, Spec> = {
  kick: {
    kind: 'drum', seconds: 0.9, hz: 52, bend: 2.6, bendTau: 0.025, tau: 0.17,
    modes: [[1.5, 0.12, 0.4]], crack: [3200, 0.35, 0.004], wires: [0, 0],
  },
  snare: {
    kind: 'drum', seconds: 0.8, hz: 185, bend: 1.15, bendTau: 0.015, tau: 0.08,
    modes: [[1.78, 0.55, 0.7], [2.5, 0.25, 0.5]], crack: [2400, 0.45, 0.006], wires: [0.75, 0.13],
  },
  rimshot: {
    kind: 'drum', seconds: 0.9, hz: 192, bend: 1.2, bendTau: 0.012, tau: 0.09,
    modes: [[1.78, 0.6, 0.7], [4.7, 0.45, 0.35], [9.1, 0.3, 0.25]], crack: [1800, 1.1, 0.009], wires: [0.9, 0.16],
  },
  tom1: {
    kind: 'drum', seconds: 1.3, hz: 196, bend: 1.12, bendTau: 0.06, tau: 0.32,
    modes: TOM_MODES, crack: [1500, 0.3, 0.005], wires: [0.05, 0.08],
  },
  tom2: {
    kind: 'drum', seconds: 1.5, hz: 150, bend: 1.12, bendTau: 0.07, tau: 0.38,
    modes: TOM_MODES, crack: [1300, 0.3, 0.005], wires: [0.05, 0.08],
  },
  floorTom: {
    kind: 'drum', seconds: 2, hz: 98, bend: 1.14, bendTau: 0.08, tau: 0.55,
    modes: TOM_MODES, crack: [1100, 0.3, 0.006], wires: [0.04, 0.08],
  },
  hihatClosed: {
    kind: 'metal', seconds: 0.35, seed: 3,
    bands: [[7500, 0.8, 0.03], [10500, 0.7, 0.025], [13500, 0.35, 0.02]],
    partials: 40, low: 3000, high: 12000, partialLevel: 0.5, partialTau: 0.06,
    bell: [], tick: [0.5, 0.004],
  },
  hihatOpen: {
    kind: 'metal', seconds: 2.4, seed: 3,
    bands: [[5000, 0.5, 0.5], [7500, 0.8, 0.45], [10500, 0.7, 0.35], [13500, 0.35, 0.25]],
    partials: 60, low: 2500, high: 12000, partialLevel: 0.6, partialTau: 0.9,
    bell: [], tick: [0.4, 0.004],
  },
  crash: {
    kind: 'metal', seconds: 4.5, seed: 18,
    bands: [[600, 0.4, 1.4], [1300, 0.65, 1.3], [2600, 0.85, 1.1], [4600, 0.85, 0.9], [7500, 0.6, 0.6], [11000, 0.35, 0.4]],
    partials: 120, low: 400, high: 10000, partialLevel: 0.7, partialTau: 2.2,
    bell: [], tick: [0.6, 0.005],
  },
  ride: {
    kind: 'metal', seconds: 5, seed: 20,
    bands: [[3200, 0.18, 1.6], [5200, 0.22, 1.2], [8000, 0.15, 0.7]],
    partials: 90, low: 500, high: 9000, partialLevel: 0.55, partialTau: 3.2,
    bell: [[3540, 0.35, 0.9], [4930, 0.28, 0.7], [6220, 0.2, 0.5]], tick: [1, 0.006],
  },
  rideBell: {
    kind: 'metal', seconds: 5, seed: 21,
    bands: [[2600, 0.12, 1.2], [5200, 0.12, 0.9]],
    partials: 40, low: 700, high: 8000, partialLevel: 0.3, partialTau: 2.5,
    bell: [[742, 0.7, 2.6], [1690, 0.55, 2.2], [2590, 0.5, 1.8], [3420, 0.35, 1.4], [4610, 0.2, 1]], tick: [0.8, 0.004],
  },
};

/** A seeded random source, so every load renders the same kit. */
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

/** Renders one articulation at `loudness` offline (off the main thread). */
export async function renderStroke(sampleRate: number, spec: Spec, loudness: number): Promise<AudioBuffer> {
  const length = Math.floor(sampleRate * spec.seconds);
  const ctx = new OfflineAudioContext(1, length, sampleRate);
  const rand = seeded(spec.kind === 'metal' ? spec.seed : Math.round(spec.hz));
  const bus = ctx.createGain();
  bus.connect(ctx.destination);
  const noise = ctx.createBuffer(1, length, sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = rand() * 2 - 1;
  /** Softer strokes are darker: highs fall away above 700 Hz. */
  const darker = (hz: number) => (0.4 + 0.6 * loudness) ** (Math.max(0, Math.log2(hz / 700)) * 0.6);

  const decayingNoise = (type: BiquadFilterType, hz: number, q: number, level: number, tau: number, rise = 0.0005) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = hz;
    filter.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, 0);
    env.gain.linearRampToValueAtTime(level, rise);
    env.gain.setTargetAtTime(0, rise, tau);
    src.connect(filter).connect(env).connect(bus);
    src.start(0);
  };
  const tone = (hz: number, level: number, tau: number, bend = 1, bendTau = 0.01, rise = 0.0008) => {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(hz * bend, 0);
    if (bend !== 1) osc.frequency.setTargetAtTime(hz, 0, bendTau);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, 0);
    env.gain.linearRampToValueAtTime(level, rise);
    env.gain.setTargetAtTime(0, rise, tau);
    osc.connect(env).connect(bus);
    osc.start(0);
  };

  if (spec.kind === 'drum') {
    // Harder strokes bend the pitch further and ring a little longer.
    const bend = 1 + (spec.bend - 1) * (0.6 + 0.4 * loudness);
    const ring = 0.85 + 0.15 * loudness;
    tone(spec.hz, 1, spec.tau * ring, bend, spec.bendTau);
    for (const [ratio, level, tau] of spec.modes) {
      tone(spec.hz * ratio, level * darker(spec.hz * ratio), spec.tau * tau * ring, bend, spec.bendTau);
    }
    const [crackHz, crackLevel, crackTau] = spec.crack;
    decayingNoise('bandpass', crackHz, 0.8, crackLevel * (0.4 + 0.6 * loudness), crackTau);
    const [wires, wireTau] = spec.wires;
    if (wires > 0) {
      decayingNoise('bandpass', 5200, 0.6, wires * darker(5200), wireTau * ring, 0.003);
      decayingNoise('bandpass', 2600, 0.9, wires * 0.5, wireTau * ring * 0.8, 0.003);
    }
  } else {
    const decay = 0.6 + 0.4 * loudness;
    for (const [hz, level, tau] of spec.bands) {
      // A band's width grows with its frequency, and so does the noise it passes: offset most of that.
      decayingNoise('bandpass', hz, 1.3, level * darker(hz) * (1000 / hz) ** 0.3, tau * decay, 0.002);
    }
    for (let i = 0; i < spec.partials; i++) {
      const hz = spec.low * (spec.high / spec.low) ** rand();
      const level = (0.09 * spec.partialLevel * (hz / 1000) ** -0.2 * (0.4 + 0.6 * rand()) * darker(hz)) / Math.sqrt(spec.partials / 40);
      const tau = spec.partialTau * (1000 / hz) ** 0.45 * (0.7 + 0.6 * rand()) * decay;
      tone(hz, level, tau, 1, 0.01, 0.001 + 0.01 * rand());
    }
    for (const [hz, level, tau] of spec.bell) tone(hz, level * 0.25 * darker(hz), tau * decay);
    const [tick, tickTau] = spec.tick;
    decayingNoise('highpass', 3000, 0.7, tick * (0.3 + 0.7 * loudness), tickTau);
  }

  const out = await ctx.startRendering();
  // Normalized, with a taper so the tail ends in silence; playback sets the level.
  const samples = out.getChannelData(0);
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  const taper = Math.floor(length * 0.2);
  for (let i = 0; i < length; i++) {
    const fade = i < length - taper ? 1 : 0.5 + 0.5 * Math.cos((Math.PI * (i - (length - taper))) / taper);
    samples[i] *= (0.9 / (peak || 1)) * fade;
  }
  return out;
}

/** How loud each articulation plays at full stroke, so the kit balances. */
const LEVELS: Record<Articulation, number> = {
  kick: 1,
  snare: 0.8,
  rimshot: 0.95,
  tom1: 0.75,
  tom2: 0.78,
  floorTom: 0.85,
  hihatClosed: 0.38,
  hihatOpen: 0.4,
  crash: 0.6,
  ride: 0.42,
  rideBell: 0.45,
};

/** Strokes that cut what the same piece was still sounding, and how much of it they keep. */
const RESTRIKE: Partial<Record<Articulation, number>> = {
  hihatClosed: 0,
  hihatOpen: 0,
  crash: 0.5,
  ride: 0.7,
  rideBell: 0.7,
};
const MAX_VOICES = 24;

interface Voice {
  piece: string;
  sources: AudioBufferSourceNode[];
  /** Cuts the voice short when a restrike or the voice limit stops it. */
  damper: GainNode;
  keep: number;
  ended: boolean;
}

/** One stroke, as the synth sounds it. */
export interface StrokeSound {
  articulation: Articulation;
  /** 0 to 1, from the tip's speed. */
  loudness: number;
  /** Which piece was struck, for choking: closing the hi-hat stops it ringing open. */
  piece: string;
  /** Where the piece is, -1 left to 1 right. */
  pan: number;
}

/**
 * Plays the kit: each stroke is its articulation's two pre-rendered layers,
 * crossfaded by loudness, through a lowpass that opens as strokes get
 * harder, panned to where the piece stands, into a small room.
 */
export class DrumSynth {
  readonly ctx: AudioContext;
  /** Resolves once every layer is rendered; strokes before then are silent. */
  readonly warm: Promise<void>;
  private readonly samples = new Map<Articulation, AudioBuffer[]>();
  private readonly dry: GainNode;
  private voices: Voice[] = [];
  /** White noise for knocks and cracks when the kit hits the floor. */
  private readonly noise: AudioBuffer;

  constructor(context?: AudioContext) {
    this.ctx = context ?? new AudioContext({ latencyHint: 'interactive' });
    const ctx = this.ctx;
    this.dry = ctx.createGain();
    this.dry.gain.value = 0.8;

    const reverb = ctx.createConvolver();
    reverb.buffer = makeRoomImpulse(ctx, 1.4);
    const wet = ctx.createGain();
    wet.gain.value = 0.2;
    this.dry.connect(reverb).connect(wet);

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 10;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.15;
    this.dry.connect(limiter);
    wet.connect(limiter);
    limiter.connect(ctx.destination);
    this.noise = makeNoise(ctx);

    const names = Object.keys(SPECS) as Articulation[];
    this.warm = Promise.all(
      names.map(async (name) => {
        const layers = await Promise.all(LAYERS.map((l) => renderStroke(ctx.sampleRate, SPECS[name], l)));
        this.samples.set(name, layers);
      }),
    ).then(() => {});
  }

  /** Something of the kit hitting the floor: a knock, or a crack when it breaks. */
  knock(intensity: number, crack: boolean): void {
    playKnock(this.ctx, this.dry, this.noise, intensity, crack, 0.8);
  }

  /** Sounds a stroke at `at` (audio clock). */
  play(sound: StrokeSound, at = this.ctx.currentTime): void {
    const layers = this.samples.get(sound.articulation);
    if (layers == null) return;
    const ctx = this.ctx;
    const loudness = Math.min(1, Math.max(0, sound.loudness));
    const keep = RESTRIKE[sound.articulation];
    if (keep != null) {
      for (const v of this.voices) {
        if (v.piece !== sound.piece) continue;
        v.keep *= keep;
        v.damper.gain.setTargetAtTime(v.keep, at, keep === 0 ? 0.012 : 0.03);
      }
    }
    this.voices = this.voices.filter((v) => !v.ended && v.keep > 0.01);
    while (this.voices.length >= MAX_VOICES) this.release(this.voices.shift()!, at);

    const level = LEVELS[sound.articulation] * loudness ** 1.3;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 3000 + 15000 * loudness;
    tone.Q.value = 0.5;
    const damper = ctx.createGain();
    const panner = ctx.createStereoPanner();
    panner.pan.value = sound.pan;
    tone.connect(damper).connect(panner).connect(this.dry);
    const voice: Voice = { piece: sound.piece, sources: [], damper, keep: 1, ended: false };
    const w = Math.min(1, Math.max(0, (loudness - LAYERS[0]) / (LAYERS[1] - LAYERS[0])));
    for (const [buffer, gain] of [
      [layers[0], level * (1 - w)],
      [layers[1], level * w],
    ] as const) {
      if (gain <= 0.001) continue;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(g).connect(tone);
      src.start(at);
      voice.sources.push(src);
    }
    voice.sources[0]?.addEventListener('ended', () => (voice.ended = true));
    this.voices.push(voice);
  }

  setVolume(volume: number): void {
    this.dry.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.03);
  }

  /** Browsers start audio suspended until a user gesture; call from one. */
  resume(): void {
    if (this.ctx.state !== 'running') void this.ctx.resume();
  }

  stopAll(): void {
    const at = this.ctx.currentTime;
    for (const v of this.voices) this.release(v, at);
    this.voices = [];
  }

  dispose(): void {
    void this.ctx.close();
  }

  private release(v: Voice, at: number): void {
    v.damper.gain.cancelScheduledValues(at);
    v.damper.gain.setTargetAtTime(0, at, 0.02);
    for (const s of v.sources) s.stop(at + 0.2);
    v.ended = true;
  }
}
