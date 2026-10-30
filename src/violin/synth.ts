import { makeRoomImpulse, midiToHz } from '../guitar/synth.js';

/** Highest harmonic of the bowed tone; the body rolls off far below it anyway. */
const HARMONICS = 48;
/** The bow sits about a ninth of the string from the bridge, which silences every ninth harmonic. */
const BOW_POSITION = 1 / 9;
/** Vibrato rate (Hz) and full depth (cents either side). */
const VIBRATO_RATE = 5.6;
const VIBRATO_CENTS = 16;
/**
 * A real bow never draws a perfectly steady tone: the stick-slip of the hair
 * wanders the pitch by a cent or so and the loudness by a few percent, a
 * few dozen times a second. A perfectly steady oscillator sounds synthetic.
 */
const FLUTTER_CENTS = 2.5;
const SHIMMER = 0.05;

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
  flutter: GainNode;
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
 * the bow divides the string), wandering a little as a real bow does, plus
 * rosin noise from the hair. It sounds through a violin body, modelled as
 * its many resonances, and a room.
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
    const noise = noiseBuffer(ctx, 3);
    const hiss = ctx.createBufferSource();
    hiss.buffer = noise;
    hiss.loop = true;
    // The hair's scrape is a breathy hiss well above the notes.
    const scrape = ctx.createBiquadFilter();
    scrape.type = 'bandpass';
    scrape.frequency.value = 3500;
    scrape.Q.value = 0.7;
    hiss.connect(scrape);
    hiss.start();

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

      // The bow's wander: slow noise, its own for each string, on the pitch
      // and (scaled with the note) on the loudness.
      const wander = ctx.createBufferSource();
      wander.buffer = noise;
      wander.loop = true;
      wander.playbackRate.value = 0.37 + 0.11 * s;
      const slow = ctx.createBiquadFilter();
      slow.type = 'lowpass';
      slow.frequency.value = 18;
      wander.connect(slow);
      const flutter = ctx.createGain();
      flutter.gain.value = 0;
      slow.connect(flutter).connect(osc.frequency);

      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.Q.value = 0.5;
      tone.frequency.value = 3000;
      const level = ctx.createGain();
      level.gain.value = 0;
      const shimmer = ctx.createGain();
      shimmer.gain.value = 1;
      const shimmerDepth = ctx.createGain();
      // The filtered noise is quiet (about 0.05 rms), so this gives a few percent.
      shimmerDepth.gain.value = SHIMMER * 12;
      slow.connect(shimmerDepth).connect(shimmer.gain);
      const noiseLevel = ctx.createGain();
      noiseLevel.gain.value = 0;
      osc.connect(tone).connect(level).connect(shimmer).connect(body);
      scrape.connect(noiseLevel).connect(body);
      osc.start();
      lfo.start();
      wander.start(0, (s * 0.7) % 3);
      this.voices.push({ osc, vibrato, flutter, tone, level, noise: noiseLevel, amplitude: 0 });
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

  /**
   * Sets string `s`'s sound; call every frame for every string. `at` (now by
   * default) lets an offline render schedule a whole performance ahead.
   */
  setString(s: number, sound: StringSound, at = this.ctx.currentTime): void {
    const v = this.voices[s];
    const t = at;
    const hz = midiToHz(sound.midi);
    const cent = 2 ** (1 / 1200) - 1;
    v.osc.frequency.setTargetAtTime(hz, t, 0.006);
    v.vibrato.gain.setTargetAtTime(hz * cent * VIBRATO_CENTS * sound.vibrato, t, 0.08);
    // The filtered noise is about 0.05 rms: scale it to a few cents.
    v.flutter.gain.setTargetAtTime(hz * cent * FLUTTER_CENTS * 20, t, 0.05);
    // A bow speaks quickly; once it leaves, the string rings on briefly.
    const rising = sound.amplitude > v.amplitude;
    v.level.gain.setTargetAtTime(sound.amplitude * 0.35, t, rising ? 0.025 : 0.09);
    v.noise.gain.setTargetAtTime(sound.amplitude * 0.009, t, rising ? 0.02 : 0.03);
    // Brighter with the bow near the bridge, but a string's own harmonics
    // fade above a few kHz however it is bowed: high notes stay sweet.
    const cutoff = Math.min(hz * (5 + 20 * sound.brightness), 2600 + 5000 * sound.brightness);
    v.tone.frequency.setTargetAtTime(Math.min(16000, cutoff), t, 0.03);
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

  /** The violin's body (its resonances, see violinBodyImpulse) and a room. Returns the body's input. */
  private createBody(): AudioNode {
    const ctx = this.ctx;
    const input = ctx.createGain();
    const body = ctx.createConvolver();
    body.normalize = false;
    body.buffer = violinBodyImpulse(ctx);
    // The top and back barely radiate below the air resonance.
    const radiation = ctx.createBiquadFilter();
    radiation.type = 'highpass';
    radiation.frequency.value = 180;
    radiation.Q.value = 0.7;
    input.connect(body).connect(radiation).connect(this.master);
    this.master.gain.value = 0.8;

    const reverb = ctx.createConvolver();
    reverb.buffer = makeRoomImpulse(ctx, 2.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.32;
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

/**
 * How strongly a violin body radiates each frequency, in dB, smoothed: little
 * below the air resonance, the air and main wood resonances (A0 near 280 Hz,
 * B1- and B1+ near 460 and 550 Hz), a dip around 1.5 kHz, the broad "bridge
 * hill" around 2.5 kHz that gives a violin its ring, and a fall above 4 kHz.
 */
const BODY_CURVE: [number, number][] = [
  [150, -22],
  [230, -6],
  [280, 2],
  [350, -1],
  [460, 4],
  [550, 4],
  [700, 1],
  [1000, -1],
  [1500, -4],
  [2000, -1],
  [2600, 2],
  [3200, 1],
  [4000, -4],
  [5500, -13],
  [8000, -26],
];

export function bodyCurveDb(hz: number): number {
  const l = Math.log(hz);
  if (hz <= BODY_CURVE[0][0]) return BODY_CURVE[0][1];
  for (let i = 1; i < BODY_CURVE.length; i++) {
    const [f1, d1] = BODY_CURVE[i];
    if (hz <= f1) {
      const [f0, d0] = BODY_CURVE[i - 1];
      return d0 + ((d1 - d0) * (l - Math.log(f0))) / (Math.log(f1) - Math.log(f0));
    }
  }
  return BODY_CURVE[BODY_CURVE.length - 1][1];
}

/**
 * A violin body as its resonances: the few strong low modes, then a dense
 * crowd of narrower ones whose levels scatter a few dB either side of the
 * body curve, as a real instrument's do. A note's harmonics land on some
 * and between others, and vibrato sweeps them across the peaks: that is
 * much of what makes a violin sound rich rather than synthetic.
 * Deterministic: the same instrument every time.
 */
export function violinBodyImpulse(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const length = Math.floor(sr * 0.25);
  const out = new Float32Array(length);
  let seed = 4021;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // [frequency, extra dB above the curve, Q]
  const modes: [number, number, number][] = [
    [275, 6, 16], // A0, the air in the box
    [405, 2, 20], // CBR
    [465, 5, 24], // B1-
    [545, 5, 24], // B1+
    [650, 1, 26],
  ];
  const DENSE = 125;
  for (let i = 0; i < DENSE; i++) {
    const f = 560 * (7500 / 560) ** ((i + random()) / DENSE);
    modes.push([f, (random() - 0.5) * 8, 22 + random() * 26]);
  }
  for (const [f, extra, q] of modes) {
    if (f >= sr / 2.2) continue;
    // A damped sinusoid's peak is about a * Q / (2 pi f): give each mode its
    // place on the curve.
    const gain = 10 ** ((bodyCurveDb(f) + extra) / 20);
    const a = (gain * 2 * Math.PI * f) / q / sr;
    const w = (2 * Math.PI * f) / sr;
    const r = Math.exp(-w / (2 * q));
    // Two-pole recurrence: no trigonometry per sample.
    const c = 2 * r * Math.cos(w);
    const r2 = r * r;
    const phase = random() * Math.PI * 2;
    let y1 = a * Math.sin(phase);
    let y2 = a * Math.sin(phase - w) / r;
    for (let n = 0; n < length; n++) {
      const y = c * y1 - r2 * y2;
      out[n] += y1;
      y2 = y1;
      y1 = y;
      if (n > 64 && Math.abs(y1) < 1e-7 && Math.abs(y2) < 1e-7) break;
    }
  }
  // Level: unity gain on average across the middle of the range.
  let sum = 0;
  let count = 0;
  for (let f = 600; f <= 2400; f *= 1.06) {
    let re = 0;
    let im = 0;
    const w = (2 * Math.PI * f) / sr;
    for (let n = 0; n < length; n += 1) {
      re += out[n] * Math.cos(w * n);
      im -= out[n] * Math.sin(w * n);
    }
    sum += Math.hypot(re, im) / 10 ** (bodyCurveDb(f) / 20);
    count++;
  }
  const norm = count / sum;
  const buffer = ctx.createBuffer(1, length, sr);
  const data = buffer.getChannelData(0);
  for (let n = 0; n < length; n++) data[n] = out[n] * norm;
  return buffer;
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
