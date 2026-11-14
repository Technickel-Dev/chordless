import { makeRoomImpulse } from '../guitar/synth.js';
import { makeNoise, playKnock } from '../smash/knock.js';
import type { Spot } from './tap.js';

/** One tap, as the synth sounds it. */
export interface TapSound {
  spot: Spot;
  /** 0 to 1, from the baton's speed. */
  loudness: number;
  /** Across the desk, -1 left to 1 right: where it sits in the stereo picture. */
  across: number;
}

/**
 * How each spot rings: the stand's steel answering the wooden baton.
 * Partials are [Hz, level, decay (s)]; the click is the baton's own crack,
 * [band centre (Hz), level, length (s)].
 */
interface SpotVoice {
  partials: readonly (readonly [number, number, number])[];
  click: readonly [number, number, number];
  level: number;
}

export const VOICES: Record<Spot, SpotVoice> = {
  // The rolled top edge: the classic conductor's tick, bright and short, the plate faintly ringing under it.
  rim: {
    partials: [
      [1240, 1, 0.07],
      [2010, 0.7, 0.05],
      [3130, 0.45, 0.04],
      [4720, 0.3, 0.025],
      [640, 0.25, 0.11],
    ],
    click: [5200, 1, 0.006],
    level: 0.8,
  },
  // The desk's face: a hollow sheet-steel tonk, softened by the music lying on it.
  desk: {
    partials: [
      [290, 1, 0.16],
      [515, 0.7, 0.12],
      [780, 0.5, 0.09],
      [1160, 0.32, 0.07],
      [1730, 0.2, 0.05],
    ],
    click: [2400, 0.55, 0.01],
    level: 0.85,
  },
  // The ledge's lip: a dry clack.
  ledge: {
    partials: [
      [1650, 1, 0.04],
      [2760, 0.6, 0.03],
      [930, 0.35, 0.05],
    ],
    click: [3600, 0.9, 0.007],
    level: 0.7,
  },
};

/** The swish of the baton through the air starts at this tip speed (m/s) and is full at FULL_SWISH. */
const SWISH_FROM = 1.8;
const FULL_SWISH = 8;

/**
 * The baton's sounds: taps on the stand, its swish through the air when
 * waved fast, and the knocks and crashes when it or the stand is smashed.
 */
export class BatonSynth {
  readonly ctx: AudioContext;
  private readonly out: GainNode;
  private readonly dry: GainNode;
  private readonly noise: AudioBuffer;
  private readonly swishGain: GainNode;
  private readonly swishBand: BiquadFilterNode;
  private swishSource: AudioBufferSourceNode | null = null;
  private volume = 0.8;

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    const ctx = this.ctx;
    this.out = ctx.createGain();
    this.out.gain.value = this.volume;
    this.dry = ctx.createGain();
    this.dry.connect(this.out);
    const reverb = ctx.createConvolver();
    reverb.buffer = makeRoomImpulse(ctx, 1.8);
    const wet = ctx.createGain();
    wet.gain.value = 0.28;
    this.dry.connect(reverb).connect(wet).connect(this.out);
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 10;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.15;
    this.out.connect(limiter).connect(ctx.destination);
    this.noise = makeNoise(ctx, 1);

    this.swishBand = ctx.createBiquadFilter();
    this.swishBand.type = 'bandpass';
    this.swishBand.frequency.value = 900;
    this.swishBand.Q.value = 1.2;
    this.swishGain = ctx.createGain();
    this.swishGain.gain.value = 0;
    this.swishBand.connect(this.swishGain).connect(this.dry);
  }

  resume(): void {
    if (this.ctx.state !== 'running') void this.ctx.resume();
    if (this.swishSource == null && this.ctx.state === 'running') {
      const source = this.ctx.createBufferSource();
      source.buffer = this.noise;
      source.loop = true;
      source.connect(this.swishBand);
      source.start();
      this.swishSource = source;
    }
  }

  setVolume(volume: number): void {
    if (volume === this.volume) return;
    this.volume = volume;
    this.out.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.02);
  }

  /** Sounds a tap at `at` (audio clock). */
  tap(sound: TapSound, at = this.ctx.currentTime): void {
    const ctx = this.ctx;
    if (ctx.state !== 'running') return;
    const voice = VOICES[sound.spot];
    const loud = Math.min(1, Math.max(0, sound.loudness));
    const level = voice.level * (0.06 + 0.94 * loud ** 1.4);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-0.6, Math.min(0.6, sound.across * 0.5));
    pan.connect(this.dry);
    let longest = 0;
    // The same stand, but no two taps quite alike.
    const detune = 1 + (Math.random() - 0.5) * 0.012;
    for (const [hz, amp, tau] of voice.partials) {
      // Harder taps reach the higher partials more.
      const bright = Math.exp(-((hz / (2500 + 6000 * loud)) ** 2));
      const osc = ctx.createOscillator();
      osc.frequency.value = hz * detune;
      const g = ctx.createGain();
      const peak = level * amp * (0.35 + 0.65 * bright) * 0.4;
      const length = tau * (0.7 + 0.5 * loud) * 6;
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(peak, at + 0.0015);
      g.gain.setTargetAtTime(0, at + 0.0015, tau * (0.7 + 0.5 * loud));
      osc.connect(g).connect(pan);
      osc.start(at);
      osc.stop(at + length);
      osc.onended = () => g.disconnect();
      longest = Math.max(longest, length);
    }
    const [band, clickLevel, clickLength] = voice.click;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = band * (0.7 + 0.4 * loud);
    filter.Q.value = 1.1;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(level * clickLevel * 1.5, at);
    cg.gain.exponentialRampToValueAtTime(0.0005, at + clickLength * (1 + loud));
    source.connect(filter).connect(cg).connect(pan);
    source.start(at, Math.random() * 0.5);
    source.stop(at + clickLength * 2 + 0.01);
    source.onended = () => {
      filter.disconnect();
      cg.disconnect();
    };
    setTimeout(() => pan.disconnect(), (longest + 0.1) * 1000);
  }

  /** The baton's tip speed this frame (m/s): fast enough, it swishes. */
  swish(speed: number): void {
    const f = Math.min(1, Math.max(0, (speed - SWISH_FROM) / (FULL_SWISH - SWISH_FROM)));
    const now = this.ctx.currentTime;
    this.swishGain.gain.setTargetAtTime(0.32 * f * f, now, 0.035);
    this.swishBand.frequency.setTargetAtTime(700 + 1600 * f, now, 0.05);
  }

  /** Something hitting the floor: a knock, or a crack when it breaks; `pitch` up for the small baton. */
  knock(intensity: number, crack: boolean, pitch = 1): void {
    playKnock(this.ctx, this.dry, this.noise, intensity, crack, pitch);
  }

  /** Silences everything (put away). */
  stopAll(): void {
    this.swishGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01);
  }

  dispose(): void {
    this.swishSource?.stop();
    void this.ctx.close();
  }
}
