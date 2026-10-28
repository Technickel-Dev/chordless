/**
 * Plucked-string guitar synth on the Web Audio API.
 *
 * Each note is rendered once with the Karplus-Strong algorithm (a noise burst
 * circulating through a filtered delay line tuned to the note's period) and
 * cached as an AudioBuffer. Playback runs through a clean or overdriven
 * chain, then a short reverb and a limiter.
 */

export type GuitarTone = 'clean' | 'drive';

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

const NOTE_SECONDS = 3.5;
const MUTED_SECONDS = 0.35;

export class GuitarSynth {
  readonly ctx: AudioContext;
  private readonly input: GainNode;
  private readonly cleanBus: GainNode;
  private readonly driveBus: GainNode;
  private readonly master: GainNode;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly voices: (Voice | null)[];

  constructor(stringCount: number) {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    const ctx = this.ctx;
    this.voices = Array(stringCount).fill(null);

    this.input = ctx.createGain();

    // Clean: a gentle body resonance and a bit of top-end sparkle.
    const body = ctx.createBiquadFilter();
    body.type = 'peaking';
    body.frequency.value = 180;
    body.Q.value = 1.2;
    body.gain.value = 4;
    const air = ctx.createBiquadFilter();
    air.type = 'highshelf';
    air.frequency.value = 3500;
    air.gain.value = 3;
    this.cleanBus = ctx.createGain();
    this.input.connect(body).connect(air).connect(this.cleanBus);

    // Drive: preamp gain into a soft clipper, then a speaker-cabinet lowpass.
    const preamp = ctx.createGain();
    preamp.gain.value = 14;
    const clipper = ctx.createWaveShaper();
    clipper.curve = makeDriveCurve(2.5);
    clipper.oversample = '4x';
    const mid = ctx.createBiquadFilter();
    mid.type = 'peaking';
    mid.frequency.value = 850;
    mid.Q.value = 0.8;
    mid.gain.value = 5;
    const cabinet = ctx.createBiquadFilter();
    cabinet.type = 'lowpass';
    cabinet.frequency.value = 4200;
    cabinet.Q.value = 0.9;
    const driveLevel = ctx.createGain();
    driveLevel.gain.value = 0.22;
    this.driveBus = ctx.createGain();
    this.input
      .connect(preamp)
      .connect(clipper)
      .connect(mid)
      .connect(cabinet)
      .connect(driveLevel)
      .connect(this.driveBus);

    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.cleanBus.connect(this.master);
    this.driveBus.connect(this.master);

    const reverb = ctx.createConvolver();
    reverb.buffer = makeImpulse(ctx, 1.8);
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
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

    this.setTone('clean');
  }

  /** Browsers start audio suspended until a user gesture; call from one. */
  resume(): void {
    if (this.ctx.state !== 'running') void this.ctx.resume();
  }

  get now(): number {
    return this.ctx.currentTime;
  }

  setTone(tone: GuitarTone): void {
    const t = this.ctx.currentTime;
    this.cleanBus.gain.setTargetAtTime(tone === 'clean' ? 1 : 0, t, 0.02);
    this.driveBus.gain.setTargetAtTime(tone === 'drive' ? 1 : 0, t, 0.02);
  }

  setVolume(volume: number): void {
    this.master.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.03);
  }

  /** Renders the notes ahead of time so the first strum does not hitch. */
  prepare(midiNotes: Iterable<number | null>): void {
    for (const midi of midiNotes) {
      if (midi == null) continue;
      this.getBuffer(midi, false);
      this.getBuffer(midi, true);
    }
  }

  /**
   * Plays `midi` on `stringIndex` at audio time `when`, cutting off whatever
   * that string was already playing (a real string sounds one note at a time).
   * Harder plucks are brighter. A legato note (hammer-on, pull-off, slide)
   * starts past the pick attack, since the string is already vibrating.
   */
  pluck(
    stringIndex: number,
    midi: number,
    velocity: number,
    when: number,
    muted: boolean,
    legato = false,
  ): void {
    if (this.ctx.state !== 'running') return;
    this.choke(stringIndex, when);

    const source = this.ctx.createBufferSource();
    source.buffer = this.getBuffer(midi, muted);
    const tone = this.ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = (legato ? 700 : 1100) + 9000 * velocity ** 1.5;
    tone.Q.value = 0.5;
    const gain = this.ctx.createGain();
    gain.gain.value = (muted ? 0.9 : 0.55) * velocity;
    source.connect(tone).connect(gain).connect(this.input);
    source.start(when, legato ? 0.04 : 0);
    const voice: Voice = { source, gain };
    source.onended = () => {
      tone.disconnect();
      gain.disconnect();
      if (this.voices[stringIndex] === voice) this.voices[stringIndex] = null;
    };
    this.voices[stringIndex] = voice;
  }

  /** Whether a string currently has a note sounding. */
  isRinging(stringIndex: number): boolean {
    return this.voices[stringIndex] != null;
  }

  /** Damps a string quickly, like resting a palm on it. */
  choke(stringIndex: number, when = this.ctx.currentTime): void {
    const voice = this.voices[stringIndex];
    if (voice == null) return;
    const t = Math.max(when, this.ctx.currentTime);
    voice.gain.gain.cancelScheduledValues(t);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, t);
    voice.gain.gain.linearRampToValueAtTime(0, t + 0.025);
    voice.source.stop(t + 0.03);
    this.voices[stringIndex] = null;
  }

  chokeAll(): void {
    for (let s = 0; s < this.voices.length; s++) this.choke(s);
  }

  private getBuffer(midi: number, muted: boolean): AudioBuffer {
    const key = `${midi}:${muted ? 'm' : 'o'}`;
    let buffer = this.buffers.get(key);
    if (buffer == null) {
      buffer = renderPluck(this.ctx, midiToHz(midi), muted);
      this.buffers.set(key, buffer);
    }
    return buffer;
  }
}

/**
 * Seconds for a plucked note to fall by 60 dB. Low strings ring longer than
 * high ones; palm-muted notes die fast.
 */
export function decaySeconds(freq: number, muted = false): number {
  return muted ? 0.12 : 2.2 + 3.5 * Math.min(1, 110 / freq);
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * Karplus-Strong with a first-order allpass for fractional-delay tuning, so
 * high notes stay in tune, and a pick-position comb on the excitation.
 */
function renderPluck(ctx: BaseAudioContext, freq: number, muted: boolean): AudioBuffer {
  const sr = ctx.sampleRate;
  const length = Math.floor(sr * (muted ? MUTED_SECONDS : NOTE_SECONDS));
  const buffer = ctx.createBuffer(1, length, sr);
  const out = buffer.getChannelData(0);

  // The two-point average in the loop adds half a sample of delay.
  const loopDelay = sr / freq - 0.5;
  const n = Math.floor(loopDelay - 0.1);
  const frac = loopDelay - n;
  const c = (1 - frac) / (1 + frac);

  const t60 = decaySeconds(freq, muted);
  const loss = 0.001 ** (1 / (t60 * freq));

  // Excitation: lowpassed noise with a pick-position notch.
  const excitation = new Float32Array(n);
  const smoothing = muted ? 0.75 : 0.35;
  let lp = 0;
  for (let i = 0; i < n; i++) {
    lp += (1 - smoothing) * (Math.random() * 2 - 1 - lp);
    excitation[i] = lp;
  }
  const pickOffset = Math.max(1, Math.round(n * 0.14));
  let peak = 0;
  for (let i = n - 1; i >= pickOffset; i--) {
    excitation[i] -= excitation[i - pickOffset];
  }
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(excitation[i]));
  const norm = peak > 0 ? 1 / peak : 1;

  let prevV = 0;
  let prevA = 0;
  for (let i = 0; i < length; i++) {
    const y1 = i >= n ? out[i - n] : 0;
    const y2 = i >= n + 1 ? out[i - n - 1] : 0;
    const v = loss * 0.5 * (y1 + y2);
    const a = c * v + prevV - c * prevA;
    prevV = v;
    prevA = a;
    out[i] = (i < n ? excitation[i] * norm : 0) + a;
  }

  // Short fade-out so cached buffers never end on a click.
  const fade = Math.min(length, Math.floor(sr * 0.05));
  for (let i = 0; i < fade; i++) out[length - 1 - i] *= i / fade;
  return buffer;
}

function makeDriveCurve(amount: number): Float32Array<ArrayBuffer> {
  const samples = 2048;
  const curve = new Float32Array(samples);
  const norm = Math.tanh(amount);
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    // Slightly asymmetric clipping adds even harmonics, like a tube stage.
    const y = Math.tanh(amount * (x + 0.08 * x * x)) / norm;
    curve[i] = Math.max(-1, Math.min(1, y));
  }
  return curve;
}

function makeImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const length = Math.floor(sr * seconds);
  const impulse = ctx.createBuffer(2, length, sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
    }
  }
  return impulse;
}
