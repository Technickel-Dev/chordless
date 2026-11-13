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

/** A string stopped outright (a new note plucked on it), in seconds. */
const SNAP_SECONDS = 0.025;

/**
 * What makes one plucked instrument sound like itself: the clean chain's
 * tone shaping, the drive's cabinet, and how its strings are plucked.
 */
export interface GuitarVoice {
  /** Run the clean sound through the modelled acoustic body (the guitar), or straight to the filters (an electric). */
  acousticBody: boolean;
  /** Highpass on the clean sound: how low the instrument radiates. */
  radiationHz: number;
  /** Low shelf at `lowShelfHz`, dB. */
  lowShelfHz: number;
  lowShelfDb: number;
  /** A peak at `presenceHz`, dB. */
  presenceHz: number;
  presenceDb: number;
  /** High shelf from 1.5 kHz, dB. */
  brightDb: number;
  /** Lowpass on the clean sound. */
  topHz: number;
  cleanLevel: number;
  /** The drive's mid peak and speaker-cabinet lowpass. */
  driveMidHz: number;
  cabinetHz: number;
  driveLevel: number;
  /** Per note: the pluck filter opens from `pluckToneHz` by up to `pluckToneRange` with velocity. */
  pluckToneHz: number;
  pluckToneRange: number;
  /** Where the string is plucked, as a fraction of its length from the bridge. */
  pluckPosition: number;
  /** How round the plucking finger is: 0 a sharp pick, toward 1 a soft pad. */
  softness: number;
  /** Loop filter blend; 0.5 is the classic two-point average, lower is brighter. */
  loopBlend: number;
  /** Seconds each rendered note lasts. */
  noteSeconds: number;
  /**
   * How long a damped string takes to fall silent: a finger lifting off it,
   * or a fingertip resting on it. A steel string stops almost at once; a
   * bass string's long, low wave dies away under the finger.
   */
  releaseSeconds: number;
  /** A cut (or boost) at `mudHz`, dB, where low-mid mud builds up; 0 leaves the sound alone. */
  mudHz: number;
  mudDb: number;
  /** How much of the room reverb is mixed in. */
  roomWet: number;
  /**
   * The safety limiter before the speakers: where it starts (dBFS), its
   * knee (dB), and how fast it grabs and lets go (seconds). A limiter that
   * grabs within a cycle of a low note reshapes the wave, which a bass
   * hears as distortion.
   */
  limiter: { threshold: number; knee: number; attack: number; release: number };
}

/** The steel-string acoustic. */
export const ACOUSTIC_VOICE: GuitarVoice = {
  acousticBody: true,
  // A guitar top radiates high frequencies far better than low ones: it
  // barely radiates below its air resonance (a real low E is heard mostly
  // through its harmonics), stays light in the bass, and is strongest in
  // the 1-3 kHz presence region.
  radiationHz: 95,
  lowShelfHz: 250,
  lowShelfDb: -5,
  presenceHz: 2200,
  presenceDb: 4,
  brightDb: 5,
  topHz: 9000,
  cleanLevel: 0.7,
  driveMidHz: 850,
  cabinetHz: 4200,
  driveLevel: 0.22,
  pluckToneHz: 3000,
  pluckToneRange: 16000,
  pluckPosition: 0.2,
  softness: 0.15,
  loopBlend: 0.4,
  noteSeconds: 3.5,
  releaseSeconds: SNAP_SECONDS,
  mudHz: 250,
  mudDb: 0,
  roomWet: 0.25,
  limiter: { threshold: -10, knee: 6, attack: 0.002, release: 0.15 },
};

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

const MUTED_SECONDS = 0.35;

export class GuitarSynth {
  readonly ctx: BaseAudioContext;
  private readonly input: GainNode;
  private readonly cleanBus: GainNode;
  private readonly driveBus: GainNode;
  private readonly master: GainNode;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly voices: (Voice | null)[];
  /** White noise for knocks and cracks when the guitar hits something. */
  private readonly noise: AudioBuffer;
  private readonly voice: GuitarVoice;
  /** The end of the chain, just before the speakers: what a listener hears. */
  readonly output: AudioNode;

  /**
   * Plays through a live AudioContext by default; pass an
   * OfflineAudioContext to render to a buffer instead (for listening tests).
   */
  constructor(stringCount: number, context?: BaseAudioContext, voice: GuitarVoice = ACOUSTIC_VOICE) {
    this.ctx = context ?? new AudioContext({ latencyHint: 'interactive' });
    this.voice = voice;
    const ctx = this.ctx;
    this.voices = Array(stringCount).fill(null);

    this.input = ctx.createGain();

    // Clean: the string through a model of an acoustic guitar body (or,
    // for an electric, straight from the pickup), with the very top rolled
    // off as a real top plate and room do (or as an amp's speaker does).
    const topRolloff = ctx.createBiquadFilter();
    topRolloff.type = 'lowpass';
    topRolloff.frequency.value = voice.topHz;
    topRolloff.Q.value = 0.5;
    const radiation = ctx.createBiquadFilter();
    radiation.type = 'highpass';
    radiation.frequency.value = voice.radiationHz;
    radiation.Q.value = 0.7;
    const lightBass = ctx.createBiquadFilter();
    lightBass.type = 'lowshelf';
    lightBass.frequency.value = voice.lowShelfHz;
    lightBass.gain.value = voice.lowShelfDb;
    const presence = ctx.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = voice.presenceHz;
    presence.Q.value = 0.7;
    presence.gain.value = voice.presenceDb;
    const steel = ctx.createBiquadFilter();
    steel.type = 'highshelf';
    steel.frequency.value = 1500;
    steel.gain.value = voice.brightDb;
    const cleanLevel = ctx.createGain();
    cleanLevel.gain.value = voice.cleanLevel;
    this.cleanBus = ctx.createGain();
    let pickup: AudioNode = this.input;
    if (voice.acousticBody) {
      const body = ctx.createConvolver();
      body.normalize = false;
      body.buffer = makeBodyImpulse(ctx);
      pickup = this.input.connect(body);
    }
    if (voice.mudDb !== 0) {
      const mud = ctx.createBiquadFilter();
      mud.type = 'peaking';
      mud.frequency.value = voice.mudHz;
      mud.Q.value = 1;
      mud.gain.value = voice.mudDb;
      pickup = pickup.connect(mud);
    }
    pickup
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
    mid.frequency.value = voice.driveMidHz;
    mid.Q.value = 0.8;
    mid.gain.value = 5;
    const cabinet = ctx.createBiquadFilter();
    cabinet.type = 'lowpass';
    cabinet.frequency.value = voice.cabinetHz;
    cabinet.Q.value = 0.9;
    const driveLevel = ctx.createGain();
    driveLevel.gain.value = voice.driveLevel;
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
    wet.gain.value = voice.roomWet;
    this.master.connect(reverb).connect(wet);

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = voice.limiter.threshold;
    limiter.knee.value = voice.limiter.knee;
    limiter.ratio.value = 12;
    limiter.attack.value = voice.limiter.attack;
    limiter.release.value = voice.limiter.release;
    this.master.connect(limiter);
    wet.connect(limiter);
    limiter.connect(ctx.destination);
    this.output = limiter;

    this.noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.6), ctx.sampleRate);
    const samples = this.noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;

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
    // The pick or finger stops the old note as it plucks the new one.
    this.choke(stringIndex, when, SNAP_SECONDS);

    const source = this.ctx.createBufferSource();
    source.buffer = this.getBuffer(midi, muted);
    const tone = this.ctx.createBiquadFilter();
    tone.type = 'lowpass';
    const v = this.voice;
    tone.frequency.value = v.pluckToneHz * (legato ? 2 / 3 : 1) + v.pluckToneRange * velocity ** 1.5;
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

  /**
   * Damps a string, like resting a palm on it, falling silent over
   * `release` seconds (the voice's release unless given). A short release
   * ramps straight down; a longer one dies away exponentially, as a string
   * does under a finger, so a low note ends without a click.
   */
  choke(stringIndex: number, when = this.ctx.currentTime, release = this.voice.releaseSeconds): void {
    const voice = this.voices[stringIndex];
    if (voice == null) return;
    const t = Math.max(when, this.ctx.currentTime);
    const gain = voice.gain.gain;
    gain.cancelScheduledValues(t);
    gain.setValueAtTime(gain.value, t);
    if (release <= SNAP_SECONDS) {
      gain.linearRampToValueAtTime(0, t + release);
      voice.source.stop(t + release + 0.005);
    } else {
      // Down 60 dB over the release.
      gain.setTargetAtTime(0, t, release / 6.9);
      voice.source.stop(t + release);
    }
    this.voices[stringIndex] = null;
  }

  chokeAll(): void {
    for (let s = 0; s < this.voices.length; s++) this.choke(s);
  }

  /**
   * The guitar hitting something: a burst of noise through the body, a dull
   * knock for a blow the wood survives and a longer, brighter crack for one
   * that splinters it. `intensity` runs 0 to 1.
   */
  knock(intensity: number, crack: boolean, when = this.ctx.currentTime): void {
    if (this.ctx instanceof AudioContext && this.ctx.state !== 'running') return;
    const level = Math.min(1, Math.max(0, intensity));
    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;
    source.playbackRate.value = crack ? 1 : 0.5 + 0.3 * level;
    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = crack ? 1800 + 1500 * level : 140 + 260 * level;
    band.Q.value = crack ? 0.7 : 1.4;
    const gain = this.ctx.createGain();
    const length = crack ? 0.45 : 0.12;
    gain.gain.setValueAtTime((crack ? 1.6 : 2.4) * level + 0.001, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + length);
    source.connect(band).connect(gain).connect(this.input);
    source.start(when);
    source.stop(when + length + 0.02);
    source.onended = () => {
      band.disconnect();
      gain.disconnect();
    };
  }

  private getBuffer(midi: number, muted: boolean): AudioBuffer {
    const key = `${midi}:${muted ? 'm' : 'o'}`;
    let buffer = this.buffers.get(key);
    if (buffer == null) {
      buffer = renderPluck(this.ctx, midiToHz(midi), muted, this.voice);
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

/** Detune of the second vibration direction, in cents. */
const POLARIZATION_DETUNE = 0.8;
/** Loudness every rendered note is matched to, over its attack. */
const NOTE_RMS = 0.3;

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
export function renderPluck(
  ctx: BaseAudioContext,
  freq: number,
  muted: boolean,
  voice: GuitarVoice = ACOUSTIC_VOICE,
): AudioBuffer {
  const sr = ctx.sampleRate;
  const length = Math.floor(sr * (muted ? MUTED_SECONDS : voice.noteSeconds));
  const buffer = ctx.createBuffer(1, length, sr);
  const out = buffer.getChannelData(0);

  const t60 = decaySeconds(freq, muted);
  const softness = muted ? 0.75 : voice.softness;
  const pluck = { position: voice.pluckPosition, blend: voice.loopBlend };
  const across = renderString(sr, freq, length, t60 * 0.55, softness, pluck);
  const along = renderString(sr, freq * 2 ** (POLARIZATION_DETUNE / 1200), length, t60 * 1.15, softness, pluck);
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
 * real string's (and vanish at multiples of one over the pluck position), rather than
 * the flat, hissy spectrum of a noise burst. A little noise adds the
 * finger's attack, and `softness` rounds the corner like a fingertip.
 */
function renderString(
  sr: number,
  freq: number,
  length: number,
  t60: number,
  softness: number,
  pluck: { position: number; blend: number },
): Float32Array {
  const LOOP_BLEND = pluck.blend;
  const out = new Float32Array(length);
  // The loop filter (1 - b) x[n] + b x[n-1] delays by b samples; b < 0.5
  // lets high harmonics ring longer, as on a steel string.
  const loopDelay = sr / freq - LOOP_BLEND;
  const n = Math.floor(loopDelay - 0.1);
  const frac = loopDelay - n;
  const c = (1 - frac) / (1 + frac);
  const loss = 0.001 ** (1 / (t60 * freq));

  const shape = new Float32Array(n);
  const apex = Math.max(1, Math.round(n * pluck.position));
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
export function makeRoomImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
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
