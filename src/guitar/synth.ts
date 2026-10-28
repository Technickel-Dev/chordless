/**
 * Plucked-string guitar synth on the Web Audio API.
 *
 * Each note is rendered once with the Karplus-Strong algorithm (a plucked
 * string shape circulating through a filtered delay line tuned to the note's
 * period, for both directions the string vibrates in) and cached as an
 * AudioBuffer. Playback runs through a clean chain (a modelled acoustic
 * body) or an overdriven one, then a small room and a limiter.
 */

export type GuitarTone = 'clean' | 'drive';

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

const NOTE_SECONDS = 3.5;
const MUTED_SECONDS = 0.35;

export class GuitarSynth {
  readonly ctx: BaseAudioContext;
  private readonly input: GainNode;
  private readonly cleanBus: GainNode;
  private readonly driveBus: GainNode;
  private readonly master: GainNode;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly voices: (Voice | null)[];

  /**
   * Plays through a live AudioContext by default; pass an
   * OfflineAudioContext to render to a buffer instead (for listening tests).
   */
  constructor(stringCount: number, context?: BaseAudioContext) {
    this.ctx = context ?? new AudioContext({ latencyHint: 'interactive' });
    const ctx = this.ctx;
    this.voices = Array(stringCount).fill(null);

    this.input = ctx.createGain();

    // Clean: the string through a model of an acoustic guitar body, with
    // the very top rolled off as a real top plate and room do.
    const body = ctx.createConvolver();
    body.normalize = false;
    body.buffer = makeBodyImpulse(ctx);
    const topRolloff = ctx.createBiquadFilter();
    topRolloff.type = 'lowpass';
    topRolloff.frequency.value = 9000;
    topRolloff.Q.value = 0.5;
    // A guitar top radiates high frequencies far better than low ones: it
    // barely radiates below its air resonance (a real low E is heard mostly
    // through its harmonics), stays light in the bass, and is strongest in
    // the 1-3 kHz presence region.
    const radiation = ctx.createBiquadFilter();
    radiation.type = 'highpass';
    radiation.frequency.value = 95;
    radiation.Q.value = 0.7;
    const lightBass = ctx.createBiquadFilter();
    lightBass.type = 'lowshelf';
    lightBass.frequency.value = 250;
    lightBass.gain.value = -5;
    const presence = ctx.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = 2200;
    presence.Q.value = 0.7;
    presence.gain.value = 4;
    const steel = ctx.createBiquadFilter();
    steel.type = 'highshelf';
    steel.frequency.value = 1500;
    steel.gain.value = 5;
    const cleanLevel = ctx.createGain();
    cleanLevel.gain.value = 0.7;
    this.cleanBus = ctx.createGain();
    this.input
      .connect(body)
      .connect(radiation)
      .connect(lightBass)
      .connect(presence)
      .connect(steel)
      .connect(topRolloff)
      .connect(cleanLevel)
      .connect(this.cleanBus);

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
    reverb.buffer = makeRoomImpulse(ctx, 1.4);
    const wet = ctx.createGain();
    wet.gain.value = 0.25;
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
    if (this.ctx instanceof AudioContext && this.ctx.state !== 'running') void this.ctx.resume();
  }

  dispose(): void {
    if (this.ctx instanceof AudioContext) void this.ctx.close();
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

  /** Resolves once `prewarm` has rendered every note it was given. */
  warm: Promise<void> = Promise.resolve();

  /**
   * Renders notes ahead of time, one at a time in the browser's idle time
   * between frames, so neither the first pluck of a note nor the rendering
   * itself hitches a frame.
   */
  prewarm(midiNotes: Iterable<number>): void {
    const queue = [...midiNotes];
    const idle = (fn: () => void) =>
      typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 500 }) : setTimeout(fn, 0);
    this.warm = new Promise((resolve) => {
      const next = () => {
        const midi = queue.shift();
        if (midi == null) {
          resolve();
          return;
        }
        this.getBuffer(midi, false);
        idle(next);
      };
      idle(next);
    });
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
    // A live context plays nothing until a user gesture starts it; an
    // offline one is suspended until rendering, which is fine.
    if (this.ctx instanceof AudioContext && this.ctx.state !== 'running') return;
    this.choke(stringIndex, when);

    const source = this.ctx.createBufferSource();
    source.buffer = this.getBuffer(midi, muted);
    const tone = this.ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = (legato ? 2000 : 3000) + 16000 * velocity ** 1.5;
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

/** Where the string is plucked, as a fraction of its length from the bridge. */
const PLUCK_POSITION = 0.2;
/** Detune of the second vibration direction, in cents. */
const POLARIZATION_DETUNE = 0.8;
/** Loudness every rendered note is matched to, over its attack. */
const NOTE_RMS = 0.3;
/** Loop filter blend; 0.5 is the classic two-point average. */
const LOOP_BLEND = 0.4;

/**
 * A plucked note: two Karplus-Strong strings, one per direction the real
 * string vibrates in. The one across the top (into the body) loses energy
 * faster, which gives the bright "pling" that settles into a longer, mellow
 * tail; their slight detune adds a slow shimmer.
 *
 * What we hear is the force the string puts on the bridge, which follows
 * the string's slope rather than its displacement, so the output is the
 * displacement's rate of change. That keeps a steel string's upper
 * harmonics (falling as 1/n, not 1/n^2) without the hiss of a noise burst.
 */
export function renderPluck(ctx: BaseAudioContext, freq: number, muted: boolean): AudioBuffer {
  const sr = ctx.sampleRate;
  const length = Math.floor(sr * (muted ? MUTED_SECONDS : NOTE_SECONDS));
  const buffer = ctx.createBuffer(1, length, sr);
  const out = buffer.getChannelData(0);

  const t60 = decaySeconds(freq, muted);
  const softness = muted ? 0.75 : 0.15;
  const across = renderString(sr, freq, length, t60 * 0.55, softness);
  const along = renderString(sr, freq * 2 ** (POLARIZATION_DETUNE / 1200), length, t60 * 1.15, softness);
  let peak = 0;
  // Start the slope from the first sample, not from silence: the shape's
  // first value is not zero, and a step out of silence would be a click.
  let previous = 0.62 * across[0] + 0.38 * along[0];
  for (let i = 0; i < length; i++) {
    const displacement = 0.62 * across[i] + 0.38 * along[i];
    out[i] = displacement - previous;
    previous = displacement;
    peak = Math.max(peak, Math.abs(out[i]));
  }
  // Match notes by loudness over the attack, not by peak: the slope signal
  // is spiky, so peak-normalising would leave it quiet once filtered.
  let energy = 0;
  const attack = Math.min(length, Math.floor(sr * 0.15));
  for (let i = 0; i < attack; i++) energy += out[i] * out[i];
  const rms = Math.sqrt(energy / attack);
  // Float buffers may exceed 1; the tone filter and limiter tame the peaks.
  const norm = rms > 0 ? Math.min(NOTE_RMS / rms, 3 / peak) : 1;
  for (let i = 0; i < length; i++) out[i] *= norm;

  // Short fade-out so cached buffers never end on a click.
  const fade = Math.min(length, Math.floor(sr * 0.05));
  for (let i = 0; i < fade; i++) out[length - 1 - i] *= i / fade;
  return buffer;
}

/**
 * One Karplus-Strong string: a delay line tuned to the period, with a
 * two-point average (high harmonics die faster) and a first-order allpass
 * for the fractional part of the delay, so high notes stay in tune.
 *
 * It starts from the shape of a plucked string: pulled into a triangle at
 * the pluck point and let go, which gives harmonics that fall off like a
 * real string's (and vanish at multiples of 1/PLUCK_POSITION), rather than
 * the flat, hissy spectrum of a noise burst. A little noise adds the
 * finger's attack, and `softness` rounds the corner like a fingertip.
 */
function renderString(
  sr: number,
  freq: number,
  length: number,
  t60: number,
  softness: number,
): Float32Array {
  const out = new Float32Array(length);
  // The loop filter (1 - b) x[n] + b x[n-1] delays by b samples; b < 0.5
  // lets high harmonics ring longer, as on a steel string.
  const loopDelay = sr / freq - LOOP_BLEND;
  const n = Math.floor(loopDelay - 0.1);
  const frac = loopDelay - n;
  const c = (1 - frac) / (1 + frac);
  const loss = 0.001 ** (1 / (t60 * freq));

  const shape = new Float32Array(n);
  const apex = Math.max(1, Math.round(n * PLUCK_POSITION));
  // The output is the shape's slope, so the attack noise is sized against
  // the triangle's slope (1 / apex), not its height, or it would be hiss.
  const noise = 0.25 / apex;
  let lp = 0;
  let mean = 0;
  for (let i = 0; i < n; i++) {
    const triangle = i < apex ? i / apex : (n - i) / (n - apex);
    lp += (1 - softness) * (triangle + (Math.random() * 2 - 1) * noise - lp);
    shape[i] = lp;
    mean += lp;
  }
  // No DC: an offset would circulate in the loop as a slow drift.
  mean /= n;
  for (let i = 0; i < n; i++) shape[i] -= mean;

  // The first period is the shape itself; then the loop takes over as if
  // the shape had already been circulating (wrapping around, with the
  // allpass warmed up), so the hand-over has no jolt.
  out.set(shape.subarray(0, Math.min(n, length)));
  const wrap = (k: number) => (k >= 0 ? out[k] : shape[n + k]);
  let prevV = loss * ((1 - LOOP_BLEND) * shape[n - 1] + LOOP_BLEND * shape[n - 2]);
  let prevA = prevV;
  for (let i = n; i < length; i++) {
    const v = loss * ((1 - LOOP_BLEND) * out[i - n] + LOOP_BLEND * wrap(i - n - 1));
    const a = c * v + prevV - c * prevA;
    prevV = v;
    prevA = a;
    out[i] = a;
  }
  return out;
}

/**
 * Body resonances of a steel-string acoustic: the air cavity near 100 Hz,
 * then the top and back plate modes, each a decaying sinusoid added to the
 * direct sound. Gains are the boost each mode gives at its own frequency,
 * in dB.
 */
const BODY_MODES = [
  { hz: 100, q: 18, db: 3 },
  { hz: 196, q: 28, db: 3 },
  { hz: 280, q: 30, db: 2 },
  { hz: 395, q: 32, db: 2 },
  { hz: 550, q: 35, db: 2 },
  { hz: 800, q: 40, db: 2 },
  { hz: 1150, q: 40, db: 2 },
  { hz: 1600, q: 45, db: 2 },
  // Upper top-plate modes: the sparkle of a steel-string top.
  { hz: 2400, q: 45, db: 2 },
  { hz: 3200, q: 50, db: 2 },
];

function makeBodyImpulse(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const length = Math.floor(sr * 0.35);
  const ir = ctx.createBuffer(1, length, sr);
  const data = ir.getChannelData(0);
  data[0] = 1; // the string's direct sound
  for (const { hz, q, db } of BODY_MODES) {
    // A decaying sinusoid e^(-t/tau) sin(wt) peaks at about tau/2 in the
    // spectrum, so this amplitude gives the wanted boost over the direct path.
    const tau = q / (Math.PI * hz);
    const amp = ((10 ** (db / 20) - 1) * 2) / tau / sr;
    const w = 2 * Math.PI * hz;
    for (let i = 1; i < length; i++) {
      const time = i / sr;
      data[i] += amp * Math.exp(-time / tau) * Math.sin(w * time);
    }
  }
  return ir;
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

/**
 * A small room: a short gap, then a dense tail that loses its highs as it
 * decays, as real rooms do.
 */
function makeRoomImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const length = Math.floor(sr * seconds);
  const preDelay = Math.floor(sr * 0.012);
  const impulse = ctx.createBuffer(2, length, sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    let lp = 0;
    for (let i = preDelay; i < length; i++) {
      const progress = (i - preDelay) / (length - preDelay);
      // The lowpass closes as the tail decays.
      const k = 0.2 - 0.17 * progress;
      lp += k * (Math.random() * 2 - 1 - lp);
      data[i] = lp * (1 - progress) ** 2.5;
    }
  }
  return impulse;
}
