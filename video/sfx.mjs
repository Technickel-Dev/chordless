/**
 * Synthesized sound effects for the cut, written as WAV files: the moth fluttering
 * out of the wallet, and the layer under the rage (a building rumble, a racing
 * heartbeat, a kettle whistle as the steam starts, the steam's hisses, a whoosh on
 * every swing and a boom under every hit). Seeded, so every build makes the same sound.
 */
import { writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const RATE = 48000;

/** A seeded random source in [0, 1). */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A band-pass filter (RBJ biquad) whose centre can change sample by sample. */
function bandpass() {
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  return (x, f0, q) => {
    const w0 = (2 * Math.PI * Math.min(f0, RATE * 0.45)) / RATE;
    const al = Math.sin(w0) / (2 * q);
    const b0 = al / (1 + al);
    const a1 = (-2 * Math.cos(w0)) / (1 + al);
    const a2 = (1 - al) / (1 + al);
    const y = b0 * x - b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
}

/** Writes stereo float buffers to a 16-bit WAV at `peak` of full scale, optionally through an ffmpeg filter. */
function writeWav(file, L, R, { peak = 0.7, af } = {}) {
  const n = L.length;
  let max = 1e-9;
  for (let i = 0; i < n; i++) max = Math.max(max, Math.abs(L[i]), Math.abs(R[i]));
  const pcm = Buffer.alloc(44 + n * 4);
  pcm.write('RIFF', 0);
  pcm.writeUInt32LE(36 + n * 4, 4);
  pcm.write('WAVEfmt ', 8);
  pcm.writeUInt32LE(16, 16);
  pcm.writeUInt16LE(1, 20);
  pcm.writeUInt16LE(2, 22);
  pcm.writeUInt32LE(RATE, 24);
  pcm.writeUInt32LE(RATE * 4, 28);
  pcm.writeUInt16LE(4, 32);
  pcm.writeUInt16LE(16, 34);
  pcm.write('data', 36);
  pcm.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    pcm.writeInt16LE(Math.round((L[i] / max) * peak * 32767), 44 + i * 4);
    pcm.writeInt16LE(Math.round((R[i] / max) * peak * 32767), 46 + i * 4);
  }
  if (!af) {
    writeFileSync(file, pcm);
    return file;
  }
  const dry = `${file}.dry.wav`;
  writeFileSync(dry, pcm);
  const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', dry, '-af', af, file], { encoding: 'utf8' });
  unlinkSync(dry);
  if (r.status !== 0) throw new Error(`sfx ${file}: ${r.stderr}`);
  return file;
}

/**
 * A moth fluttering: soft, papery, irregular wingbeats (about ten a second, wavering,
 * with little pauses), more breath than buzz, drifting away to one side.
 */
export function writeMothFlutter(file, { dur = 1.3 } = {}) {
  const n = Math.ceil(dur * RATE);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const rnd = seeded(31);
  const low = bandpass();
  const high = bandpass();
  let phase = 0;
  let flap = 0;
  let amp = 1;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    // The wingbeat wanders between about 7 and 13 a second; now and then it pauses.
    const rate = 10 + 2.5 * Math.sin(t * 5.3) + 1.2 * Math.sin(t * 13.1);
    phase += rate / RATE;
    if (phase >= 1) {
      phase -= 1;
      flap++;
      // Each flap a little different, and one in five or so barely there (a glide).
      amp = rnd() < 0.2 ? 0.15 : 0.6 + 0.4 * rnd();
    }
    // A soft swell of air each downstroke, a fainter one on the way up: no sharp edge.
    const down = Math.sin(Math.PI * Math.min(1, phase / 0.55)) ** 2;
    const up = phase > 0.55 ? 0.3 * Math.sin((Math.PI * (phase - 0.55)) / 0.45) ** 2 : 0;
    const noise = rnd() * 2 - 1;
    // Mostly a low, breathy whoosh; a little papery hiss on top.
    const body = low(noise, 520, 0.6) + 0.25 * high(noise, 1900, 0.7);
    const env = Math.min(1, t / 0.08) * Math.min(1, (dur - t) / 0.4);
    const v = body * (down + up) * amp * env;
    // It flies off to the right, getting quieter.
    const away = Math.min(1, t / dur);
    L[i] = v * (1 - 0.6 * away);
    R[i] = v * (0.7 + 0.3 * away);
  }
  return writeWav(file, L, R, { peak: 0.6 });
}

/**
 * The rage's sound, `dur` seconds from the wrong note. Times are seconds from the
 * wrong note: `shake` the fist starts shaking, `steam` the steam starts, `hits` each
 * impact, `wreck` the guitar is wrecked; `puffs` when each puff of steam leaves its vent.
 */
export function writeRageSfx(file, { dur, shake, steam, hits, wreck, puffs = [] }) {
  const n = Math.ceil(dur * RATE);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const rnd = seeded(77);
  const add = (i, l, r = l) => {
    if (i >= 0 && i < n) {
      L[i] += l;
      R[i] += r;
    }
  };
  const first = hits[0] ?? wreck;

  // A low rumble, building from the wrong note to the wreck, then dying away.
  {
    const bp = bandpass();
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / RATE;
      const build = Math.min(1, t / wreck) ** 1.6;
      const fall = t < wreck ? 1 : Math.exp(-(t - wreck) * 2.2);
      ph += (38 + 14 * build) / RATE;
      const v = (0.6 * Math.sin(2 * Math.PI * ph) + bp(rnd() * 2 - 1, 70, 0.7) * 2.5) * (0.15 + 0.85 * build) * fall * Math.min(1, t / 0.4);
      add(i, v * 1.2);
    }
  }
  // A heartbeat, racing faster through the red and the shaking, stopping at the first hit.
  {
    let t = 0.35;
    while (t < first - 0.1) {
      const u = Math.min(1, t / first);
      const gap = 1.0 - 0.55 * u;
      for (const [off, amp] of [[0, 1], [0.16, 0.6]]) {
        const i0 = Math.floor((t + off) * RATE);
        for (let k = 0; k < RATE * 0.18; k++) {
          const s = k / RATE;
          const v = Math.sin(2 * Math.PI * (55 - 60 * s) * s) * Math.exp(-s * 28) * amp * (0.4 + 0.6 * u);
          add(i0 + k, v * 2.4);
        }
      }
      t += gap;
    }
  }
  // A kettle coming to the boil as the steam starts: a breathy whistle, rising and
  // swelling, cut off by the first hit.
  {
    const bp = bandpass();
    let ph = 0;
    const end = first;
    for (let i = Math.floor(steam * RATE); i < Math.min(n, Math.floor(end * RATE)); i++) {
      const t = i / RATE;
      const u = (t - steam) / Math.max(0.1, end - steam);
      const hz = 1500 + 900 * u + 25 * Math.sin(t * 31);
      ph += hz / RATE;
      const breath = bp(rnd() * 2 - 1, hz, 6) * 3;
      const tone = Math.sin(2 * Math.PI * ph) * smoothstep(0.25, 0.9, u);
      const cut = Math.min(1, (end - t) / 0.02);
      add(i, (tone * 0.35 + breath * 0.5) * u * cut * 0.9);
    }
  }
  // A hiss for each puff of steam: sharp, then trailing off.
  {
    for (const p of puffs) {
      if (p < steam - 0.05 || p > wreck + 0.6) continue;
      const bp = bandpass();
      const i0 = Math.floor(p * RATE);
      const pan = rnd() * 2 - 1;
      for (let k = 0; k < RATE * 0.5; k++) {
        const s = k / RATE;
        // (The steam fades in over its first 1.6 s, and so do its hisses.)
        const v = bp(rnd() * 2 - 1, 5200 - 1800 * s, 0.9) * Math.min(1, s / 0.01) * Math.exp(-s * 7) * 0.6 * Math.min(1, Math.max(0.15, (p - steam) / 1.6));
        add(i0 + k, v * (1 - 0.4 * pan), v * (1 + 0.4 * pan));
      }
    }
  }
  // A whoosh down each swing, and a boom under each hit (the last, the wreck, the biggest).
  hits.forEach((h, j) => {
    const big = j === hits.length - 1 ? 1 : 0.55 + 0.15 * j;
    const bp = bandpass();
    const w0 = h - 0.34;
    for (let k = 0; k < RATE * 0.36; k++) {
      const s = k / RATE;
      const u = s / 0.34;
      const v = bp(rnd() * 2 - 1, 300 + 2200 * u * u, 1.4) * u * u * Math.min(1, (0.36 - s) / 0.02) * 1.6 * big;
      add(Math.floor(w0 * RATE) + k, v);
    }
    const i0 = Math.floor(h * RATE);
    for (let k = 0; k < RATE * 0.9; k++) {
      const s = k / RATE;
      const v = (Math.sin(2 * Math.PI * (48 + 70 * Math.exp(-s * 25)) * s) * Math.exp(-s * (j === hits.length - 1 ? 4 : 7)) + (rnd() * 2 - 1) * Math.exp(-s * 45) * 0.5) * big;
      add(i0 + k, v * 1.3);
    }
  });
  // Compressed, so the build-up under the swings sits forward and the booms don't bury it.
  return writeWav(file, L, R, { peak: 0.8, af: 'acompressor=threshold=-28dB:ratio=4:attack=4:release=180:makeup=6,aecho=0.8:0.4:60|110:0.2|0.12,alimiter=limit=0.9' });
}

function smoothstep(a, b, x) {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
}
