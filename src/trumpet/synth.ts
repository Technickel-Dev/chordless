import { makeRoomImpulse, midiToHz } from '../guitar/synth.js';

/** Harmonics in each spectrum; the bell rolls them off long before the top one. */
const HARMONICS = 32;
/** A tongued note starts this flat and the lips settle onto pitch (cents, and the time constant in s). */
const SCOOP_CENTS = -25;
const SCOOP_TAU = 0.02;
/** Slurs (a valve or the tilt changing mid-note) move the pitch this fast (s). */
const SLUR_TAU = 0.01;
/**
 * A tongued note's upper harmonics build up this far below the note's
 * final spectrum (in spectrum steps, see SPECTRA) and reach it with this
 * time constant (s): the low harmonics speak first, as in a real attack.
 */
const ATTACK_DARK = 0.7;
const ATTACK_TAU = 0.022;
/** A held note gains a little vibrato after a moment: depth (cents either side), rate (Hz), delay (s). */
const VIBRATO_CENTS = 7;
const VIBRATO_RATE = 5.3;
const VIBRATO_DELAY = 0.6;
/** The lips and the breath never hold perfectly still: slow wander in pitch (cents), loudness and tone (fractions). */
const WANDER_CENTS = 3;
const SHIMMER = 0.035;
const TONE_WANDER = 0.08;
/** The plunger shut takes the bell's output down to about this (Hz). */
const PLUNGER_HZ = 600;
const OPEN_HZ = 9000;

/** The trumpet's sound this frame. */
export interface TrumpetSound {
  /** Sounding pitch as a MIDI note. */
  midi: number;
  /** 0 silent to 1 fortissimo, from the air. */
  amplitude: number;
  /** 0 open to 1 the plunger shut over the bell. */
  mute: number;
  /** The note was tongued this frame (rather than slurred to or held). */
  tongued: boolean;
}

/**
 * A trumpet's spectrum, softly, moderately and loudly played: the level of
 * the strongest harmonic (`peak`, by number), how fast the harmonics below
 * it fall away (`rise`, dB per harmonic) and above it (`fall`). Played
 * softly the fundamental leads and the rest drop off steeply, a round,
 * almost flute-like tone; as the player blows harder the energy climbs
 * into the upper harmonics (the sound waves steepen in the long tube), the
 * strongest moving to the third or fourth, and the tone turns brassy.
 */
export const SPECTRA = [
  { peak: 1, rise: 0, fall: 7 },
  { peak: 2, rise: 3, fall: 3.4 },
  { peak: 3.5, rise: 3.5, fall: 2.1 },
] as const;

/** One of SPECTRA as harmonic amplitudes (index n is harmonic n). */
export function trumpetSpectrum(spec: { peak: number; rise: number; fall: number }, count = HARMONICS): Float32Array {
  const amps = new Float32Array(count + 1);
  for (let n = 1; n <= count; n++) {
    const dB = n <= spec.peak ? -spec.rise * (spec.peak - n) : -spec.fall * (n - spec.peak) * (1 + (n - spec.peak) / 40);
    amps[n] = 10 ** (dB / 20);
  }
  return amps;
}

/**
 * How much of each of SPECTRA to sound at an amplitude (0 to 1), as weights
 * summing to 1: soft to moderate over the lower half, moderate to loud over
 * the upper. `offset` (in spectrum steps) shifts it darker, as at an attack.
 */
export function spectrumWeights(amplitude: number, offset = 0, out: number[] = [0, 0, 0]): number[] {
  const x = Math.min(2, Math.max(0, amplitude * 2 - offset));
  out[0] = Math.max(0, 1 - x);
  out[1] = 1 - Math.abs(x - 1);
  out[2] = Math.max(0, x - 1);
  return out;
}

/**
 * What makes a brass instrument sound like itself here: its spectra (see
 * SPECTRA) and how many harmonics they reach, the mouthpiece cup's
 * resonance, where the brilliance of loud playing sits, how low the bell
 * radiates, how far above the note the tone reaches (`toneLow` softly to
 * `toneLow + toneHigh` loudly, as multiples of the pitch), the vibrato on
 * held notes, how flat a tongued note starts, and the breath noise's band.
 */
export interface BrassVoice {
  harmonics: number;
  spectra: readonly { peak: number; rise: number; fall: number }[];
  cupHz: number;
  cupGain: number;
  brillianceHz: number;
  bellHz: number;
  toneLow: number;
  toneHigh: number;
  vibratoCents: number;
  scoopCents: number;
  breathHz: number;
}

/** The trumpet's voice. */
export const TRUMPET_VOICE: BrassVoice = {
  harmonics: HARMONICS,
  spectra: SPECTRA,
  cupHz: 1250,
  cupGain: 4,
  brillianceHz: 2700,
  bellHz: 190,
  toneLow: 6,
  toneHigh: 14,
  vibratoCents: VIBRATO_CENTS,
  scoopCents: SCOOP_CENTS,
  breathHz: 1700,
};

/**
 * A trumpet, as one voice that runs all the time; the system sets its
 * pitch, loudness and mute every frame. Three phase-locked oscillators
 * carry the soft, moderate and loud spectra (SPECTRA), blended by how hard
 * the player blows, so the tone opens up continuously as it gets louder,
 * and at each attack the low harmonics speak a moment before the high
 * ones. The mix passes the mouthpiece cup's resonance, a brilliance that
 * grows with loudness, the bell (which radiates little below about 200 Hz),
 * the plunger as a resonant lowpass, then a room. Breath noise, a puff at
 * each tongued attack, slow wander in pitch, loudness and tone, and a
 * little delayed vibrato on held notes keep it from sounding like an
 * oscillator. Another BrassVoice makes it another horn (see TromboneSynth).
 */
export class TrumpetSynth {
  readonly ctx: BaseAudioContext;
  private readonly master: GainNode;
  private readonly oscs: OscillatorNode[] = [];
  private readonly layers: GainNode[] = [];
  private readonly vibrato: GainNode;
  private readonly tone: BiquadFilterNode;
  private readonly brilliance: BiquadFilterNode;
  private readonly plunger: BiquadFilterNode;
  private readonly plungerLevel: GainNode;
  private readonly level: GainNode;
  private readonly breath: GainNode;
  private readonly chiff: GainNode;
  private readonly weights = [0, 0, 0];
  private readonly attackWeights = [0, 0, 0];
  private amplitude = 0;
  private hz = 0;

  /**
   * Plays through a live AudioContext by default; pass an
   * OfflineAudioContext to render to a buffer instead (for listening tests).
   */
  constructor(
    context?: BaseAudioContext,
    private readonly voice: BrassVoice = TRUMPET_VOICE,
  ) {
    this.ctx = context ?? new AudioContext({ latencyHint: 'interactive' });
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    const noise = noiseBuffer(ctx, 3);
    /** Slow random wander, its own for each use: about 0.05 rms below `hz`. */
    const slowNoise = (rate: number, hz: number, offset: number) => {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      src.playbackRate.value = rate;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = hz;
      src.connect(lp);
      src.start(0, offset);
      return lp;
    };

    const mix = ctx.createGain();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = VIBRATO_RATE;
    this.vibrato = ctx.createGain();
    this.vibrato.gain.value = 0;
    lfo.connect(this.vibrato);
    const wanderDepth = ctx.createGain();
    // The filtered noise is about 0.05 rms: scale it to a few cents.
    wanderDepth.gain.value = WANDER_CENTS * 20;
    slowNoise(0.41, 12, 0).connect(wanderDepth);
    for (const spec of voice.spectra) {
      const amps = trumpetSpectrum(spec, voice.harmonics);
      // Each spectrum at the same loudness, so blending them changes only the tone.
      let power = 0;
      for (const a of amps) power += (a * a) / 2;
      const scale = 0.3 / Math.sqrt(power);
      const osc = ctx.createOscillator();
      // Sine phases for every harmonic in every spectrum: the three stay in phase and blend smoothly.
      osc.setPeriodicWave(ctx.createPeriodicWave(new Float32Array(amps.length), amps.map((a) => a * scale), { disableNormalization: true }));
      osc.frequency.value = 466;
      this.vibrato.connect(osc.detune);
      wanderDepth.connect(osc.detune);
      const layer = ctx.createGain();
      layer.gain.value = 0;
      osc.connect(layer).connect(mix);
      this.oscs.push(osc);
      this.layers.push(layer);
    }

    // The breath's unsteadiness: a few percent in loudness.
    const shimmer = ctx.createGain();
    shimmer.gain.value = 1;
    const shimmerDepth = ctx.createGain();
    shimmerDepth.gain.value = SHIMMER * 20;
    slowNoise(0.53, 9, 1.3).connect(shimmerDepth).connect(shimmer.gain);

    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.Q.value = 0.5;
    this.tone.frequency.value = 6000;
    // And in tone: the lowpass wanders by a few percent (its detune is in cents).
    const toneDepth = ctx.createGain();
    toneDepth.gain.value = 1200 * Math.log2(1 + TONE_WANDER) * 20;
    slowNoise(0.29, 7, 2.1).connect(toneDepth).connect(this.tone.detune);
    // The mouthpiece cup's resonance, the trumpet's "ah".
    const cup = ctx.createBiquadFilter();
    cup.type = 'peaking';
    cup.frequency.value = voice.cupHz;
    cup.Q.value = 1;
    cup.gain.value = voice.cupGain;
    this.brilliance = ctx.createBiquadFilter();
    this.brilliance.type = 'peaking';
    this.brilliance.frequency.value = voice.brillianceHz;
    this.brilliance.Q.value = 1.3;
    this.brilliance.gain.value = 0;
    const bell = ctx.createBiquadFilter();
    bell.type = 'highpass';
    bell.frequency.value = voice.bellHz;
    bell.Q.value = 0.6;
    this.level = ctx.createGain();
    this.level.gain.value = 0;
    this.plunger = ctx.createBiquadFilter();
    this.plunger.type = 'lowpass';
    this.plunger.frequency.value = OPEN_HZ;
    this.plunger.Q.value = 0.7;
    this.plungerLevel = ctx.createGain();
    this.plungerLevel.gain.value = 1;
    mix.connect(shimmer).connect(this.tone).connect(cup).connect(this.brilliance).connect(bell).connect(this.level);
    this.level.connect(this.plunger).connect(this.plungerLevel).connect(this.master);

    // Breath: a quiet hiss with the tone, and a puff of it as the tongue releases.
    const hiss = ctx.createBufferSource();
    hiss.buffer = noise;
    hiss.loop = true;
    const breathBand = ctx.createBiquadFilter();
    breathBand.type = 'bandpass';
    breathBand.frequency.value = voice.breathHz;
    breathBand.Q.value = 0.7;
    hiss.connect(breathBand);
    this.breath = ctx.createGain();
    this.breath.gain.value = 0;
    this.chiff = ctx.createGain();
    this.chiff.gain.value = 0;
    breathBand.connect(this.breath).connect(this.plunger);
    breathBand.connect(this.chiff).connect(this.plunger);

    const reverb = ctx.createConvolver();
    reverb.buffer = makeRoomImpulse(ctx, 2.2);
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

    for (const osc of this.oscs) osc.start(0);
    lfo.start(0);
    hiss.start(0);
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

  /** How loud the trumpet is sounding, 0 to 1, as last set. */
  get sounding(): number {
    return this.amplitude;
  }

  setVolume(volume: number): void {
    this.master.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.03);
  }

  /**
   * Sets the trumpet's sound; call every frame. `at` (now by default) lets
   * an offline render schedule a whole performance ahead.
   */
  set(sound: TrumpetSound, at = this.ctx.currentTime): void {
    const t = at;
    const hz = midiToHz(sound.midi);
    const amp = Math.min(1, Math.max(0, sound.amplitude));
    const target = spectrumWeights(amp, 0, this.weights);
    if (sound.tongued) {
      // The lips speak a little flat and settle; the low harmonics come first; the tongue's release puffs air.
      for (const osc of this.oscs) {
        osc.frequency.cancelScheduledValues(t);
        osc.frequency.setValueAtTime(hz * 2 ** (this.voice.scoopCents / 1200), t);
        osc.frequency.setTargetAtTime(hz, t, SCOOP_TAU);
      }
      const start = spectrumWeights(amp, ATTACK_DARK, this.attackWeights);
      this.layers.forEach((layer, i) => {
        layer.gain.cancelScheduledValues(t);
        layer.gain.setValueAtTime(start[i], t);
        layer.gain.setTargetAtTime(target[i], t, ATTACK_TAU);
      });
      this.chiff.gain.cancelScheduledValues(t);
      this.chiff.gain.setValueAtTime(0.03 + 0.05 * amp, t);
      this.chiff.gain.setTargetAtTime(0, t, 0.018);
      this.vibrato.gain.cancelScheduledValues(t);
      this.vibrato.gain.setValueAtTime(0, t);
      this.vibrato.gain.setTargetAtTime(this.voice.vibratoCents, t + VIBRATO_DELAY, 0.35);
      this.level.gain.cancelScheduledValues(t);
      this.level.gain.setTargetAtTime(amp * 0.42, t, 0.014);
    } else {
      if (hz !== this.hz) for (const osc of this.oscs) osc.frequency.setTargetAtTime(hz, t, SLUR_TAU);
      this.layers.forEach((layer, i) => layer.gain.setTargetAtTime(target[i], t, 0.04));
      const rising = amp > this.amplitude;
      this.level.gain.setTargetAtTime(amp * 0.42, t, rising ? 0.03 : amp === 0 ? 0.035 : 0.05);
    }
    this.hz = hz;
    this.breath.gain.setTargetAtTime(amp * 0.008, t, 0.03);
    // High notes keep fewer harmonics in the band the bell radiates well.
    this.tone.frequency.setTargetAtTime(Math.min(12000, hz * (this.voice.toneLow + this.voice.toneHigh * amp)), t, 0.04);
    this.brilliance.gain.setTargetAtTime(5 * amp ** 2, t, 0.04);

    const mute = Math.min(1, Math.max(0, sound.mute));
    this.plunger.frequency.setTargetAtTime(OPEN_HZ * (PLUNGER_HZ / OPEN_HZ) ** mute, t, 0.025);
    // Half shut, the cupped hand rings like a vowel: the wah.
    this.plunger.Q.setTargetAtTime(0.7 + 12 * mute * (1 - mute), t, 0.025);
    this.plungerLevel.gain.setTargetAtTime(1 - 0.45 * mute, t, 0.025);
    this.amplitude = amp;
  }

  /** Silences the trumpet at once. */
  stopAll(): void {
    const t = this.ctx.currentTime;
    this.level.gain.cancelScheduledValues(t);
    this.level.gain.setTargetAtTime(0, t, 0.01);
    this.breath.gain.setTargetAtTime(0, t, 0.01);
    this.amplitude = 0;
  }
}

function noiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}
