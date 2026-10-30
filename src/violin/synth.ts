import { makeRoomImpulse, midiToHz } from '../guitar/synth.js';

/** Highest harmonic of the bowed tone; the body rolls off far below it anyway. */
const HARMONICS = 48;
/** The bow sits about a ninth of the string from the bridge, which silences every ninth harmonic. */
const BOW_POSITION = 1 / 9;
/** Vibrato rate (Hz) and full depth (cents either side). */
const VIBRATO_RATE = 5.6;
const VIBRATO_CENTS = 16;

/** One string's sound this frame. */
export interface StringSound {
  /** Pitch as a (possibly fractional) MIDI note. */
  midi: number;
  /** 0 silent to 1 full, from bow speed and pressure. */
  amplitude: number;
  /** 0 dark (bowing over the fingerboard, light) to 1 bright (near the bridge, pressed). */
  brightness: number;
  /** 0 to 1 vibrato depth. */
  vibrato: number;
}

interface Voice {
  osc: OscillatorNode;
  vibrato: GainNode;
  tone: BiquadFilterNode;
  level: GainNode;
  noise: GainNode;
  amplitude: number;
}

/**
 * Bowed violin strings. Each string is a voice that runs all the time; the
 * system sets its pitch, loudness, brightness and vibrato every frame as
 * the bow and fingers move. The tone is the bowed string's Helmholtz motion
 * (a sawtooth-like wave, every harmonic falling as 1/n, with notches where
 * the bow divides the string) plus rosin noise from the hair, through the
 * resonances of a violin body and a room.
 */
export class ViolinSynth {
  readonly ctx: BaseAudioContext;
  private readonly master: GainNode;
  private readonly voices: Voice[] = [];

  /**
   * Plays through a live AudioContext by default; pass an
   * OfflineAudioContext to render to a buffer instead (for listening tests).
   */
  constructor(stringCount: number, context?: BaseAudioContext) {
    this.ctx = context ?? new AudioContext({ latencyHint: 'interactive' });
    const ctx = this.ctx;
    this.master = ctx.createGain();

    const body = this.createBody();
    const wave = bowedWave(ctx);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx, 2);
    noise.loop = true;
    // The hair's scrape is a breathy hiss well above the notes.
    const scrape = ctx.createBiquadFilter();
    scrape.type = 'bandpass';
    scrape.frequency.value = 3200;
    scrape.Q.value = 0.6;
    noise.connect(scrape);
    noise.start();

    for (let s = 0; s < stringCount; s++) {
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(wave);
      osc.frequency.value = 440;
      const lfo = ctx.createOscillator();
      // Players' vibrato rates differ a little from string to string.
      lfo.frequency.value = VIBRATO_RATE * (0.96 + 0.03 * s);
      const vibrato = ctx.createGain();
      vibrato.gain.value = 0;
      lfo.connect(vibrato).connect(osc.frequency);
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.Q.value = 0.5;
      tone.frequency.value = 3000;
      const level = ctx.createGain();
      level.gain.value = 0;
      const noiseLevel = ctx.createGain();
      noiseLevel.gain.value = 0;
      osc.connect(tone).connect(level).connect(body);
      scrape.connect(noiseLevel).connect(body);
      osc.start();
      lfo.start();
      this.voices.push({ osc, vibrato, tone, level, noise: noiseLevel, amplitude: 0 });
    }
  }

  /** Browsers start audio suspended until a user gesture; call from one. */
  resume(): void {
    if (this.ctx instanceof AudioContext && this.ctx.state !== 'running') void this.ctx.resume();
  }

  dispose(): void {
    if (this.ctx instanceof AudioContext) void this.ctx.close();
  }

  get now(): number {
    return this.ctx.currentTime;
  }

  setVolume(volume: number): void {
    this.master.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.03);
  }

  /** Sets string `s`'s sound; call every frame for every string. */
  setString(s: number, sound: StringSound): void {
    const v = this.voices[s];
    const t = this.ctx.currentTime;
    const hz = midiToHz(sound.midi);
    v.osc.frequency.setTargetAtTime(hz, t, 0.006);
    v.vibrato.gain.setTargetAtTime(hz * (2 ** (VIBRATO_CENTS / 1200) - 1) * sound.vibrato, t, 0.08);
    // A bow speaks quickly; once it leaves, the string rings on briefly.
    const rising = sound.amplitude > v.amplitude;
    v.level.gain.setTargetAtTime(sound.amplitude * 0.35, t, rising ? 0.025 : 0.09);
    v.noise.gain.setTargetAtTime(sound.amplitude * 0.012, t, rising ? 0.02 : 0.03);
    v.tone.frequency.setTargetAtTime(Math.min(16000, hz * (5 + 20 * sound.brightness)), t, 0.03);
    v.amplitude = sound.amplitude;
  }

  /** Silences every string at once. */
  stopAll(): void {
    const t = this.ctx.currentTime;
    for (const v of this.voices) {
      v.level.gain.cancelScheduledValues(t);
      v.level.gain.setTargetAtTime(0, t, 0.01);
      v.noise.gain.setTargetAtTime(0, t, 0.01);
      v.amplitude = 0;
    }
  }

  /**
   * The violin's body and room: the top and back barely radiate the lowest
   * notes, then the air (A0, ~280 Hz) and main wood (B1-, B1+, ~460 and
   * ~550 Hz) resonances, a dip, and the bright "bridge hill" around 2.5 kHz
   * that gives a violin its edge. Returns the body's input.
   */
  private createBody(): AudioNode {
    const ctx = this.ctx;
    const input = ctx.createGain();
    let node: AudioNode = input;
    const filter = (type: BiquadFilterType, frequency: number, q: number, gain = 0) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = frequency;
      f.Q.value = q;
      f.gain.value = gain;
      node = node.connect(f);
    };
    filter('highpass', 190, 0.7);
    filter('peaking', 280, 2.2, 5);
    filter('peaking', 460, 3, 6);
    filter('peaking', 550, 3, 5);
    filter('peaking', 1300, 1.2, -4);
    filter('peaking', 2500, 0.9, 7);
    filter('lowpass', 7500, 0.5);

    this.master.gain.value = 0.8;
    node.connect(this.master);
    const reverb = ctx.createConvolver();
    reverb.buffer = makeRoomImpulse(ctx, 1.8);
    const wet = ctx.createGain();
    wet.gain.value = 0.3;
    this.master.connect(reverb).connect(wet);

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.15;
    this.master.connect(limiter);
    wet.connect(limiter);
    limiter.connect(ctx.destination);
    return input;
  }
}

/** One period of a bowed string's motion at the bridge, as harmonic amplitudes. */
export function bowedHarmonics(count = HARMONICS, bowPosition = BOW_POSITION): Float32Array {
  const amps = new Float32Array(count + 1);
  for (let n = 1; n <= count; n++) {
    // The sawtooth's 1/n, with the bow's comb: harmonics with a node at the
    // bow (every 1/bowPosition-th) barely sound.
    const comb = Math.abs(Math.sin(Math.PI * n * bowPosition)) / (Math.PI * n * bowPosition);
    amps[n] = (1 / n) * Math.min(1, comb * 4);
  }
  return amps;
}

function bowedWave(ctx: BaseAudioContext): PeriodicWave {
  const amps = bowedHarmonics();
  const real = new Float32Array(amps.length);
  return ctx.createPeriodicWave(real, amps, { disableNormalization: false });
}

function noiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}
