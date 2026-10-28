/**
 * Renders guitar sound samples offline (no hands, no XR) and saves them as
 * WAV files with simple spectrum statistics, for comparing synth changes
 * by ear and by numbers:
 *
 *   npx iwsdk dev up --allow-browser-automation
 *   AUDIO_LABEL=after npm run render:audio
 *
 * Writes test-results/audio/<label>-<clip>.wav.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export default async function run({ frame, workspaceRoot }) {
  const label = process.env.AUDIO_LABEL || 'sample';
  const outDir = path.join(workspaceRoot, 'test-results', 'audio');
  await mkdir(outDir, { recursive: true });

  const clips = await frame.evaluate(async () => {
    const { GuitarSynth } = await import('/src/guitar/synth.ts');
    const { OPEN_MIDI } = await import('/src/guitar/geometry.ts');
    const { WILLIAM_TELL } = await import('/tests/songs/william-tell.js');
    const SR = 48000;

    /** Renders `seconds` of audio after `play(synth)` schedules notes. */
    async function render(seconds, play) {
      const ctx = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR);
      const synth = new GuitarSynth(6, ctx);
      synth.setTone('clean');
      synth.setVolume(0.8);
      play(synth);
      return ctx.startRendering();
    }
    const strum = (synth, frets, at, velocity, from = 0) => {
      frets.forEach((f, s) => {
        if (s < from || f == null) return;
        synth.pluck(s, OPEN_MIDI[s] + f, velocity, at + (s - from) * 0.012, false);
      });
    };

    const chords = await render(7, (synth) => {
      strum(synth, [0, 2, 2, 1, 0, 0], 0.2, 0.7);
      strum(synth, [null, 3, 2, 0, 1, 0], 2.4, 0.7, 1);
      strum(synth, [3, 2, 0, 0, 0, 3], 4.6, 0.7);
    });
    const beat = 60 / WILLIAM_TELL.tempo;
    const melody = await render(7.5, (synth) => {
      for (const e of WILLIAM_TELL.events) {
        if (e.chord || e.beat > 16) continue;
        synth.pluck(e.string, OPEN_MIDI[e.string] + e.fret, 0.42, 0.4 + (e.beat + 0.5) * beat, false);
      }
    });
    const singles = await render(6, (synth) => {
      synth.pluck(0, OPEN_MIDI[0], 0.6, 0.2, false); // E2
      synth.pluck(5, OPEN_MIDI[5], 0.6, 3.2, false); // E4
    });

    /** Spectral centroid and band shares over `seconds` from `start`. */
    function stats(buffer, start, seconds = 0.68) {
      const N = 32768;
      const data = buffer.getChannelData(0);
      const re = new Float64Array(N);
      const im = new Float64Array(N);
      const s0 = Math.floor(start * SR);
      for (let i = 0; i < N && s0 + i < data.length; i++) {
        re[i] = data[s0 + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
      }
      // Iterative radix-2 FFT.
      for (let i = 1, j = 0; i < N; i++) {
        let bit = N >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
          [re[i], re[j]] = [re[j], re[i]];
          [im[i], im[j]] = [im[j], im[i]];
        }
      }
      for (let len = 2; len <= N; len <<= 1) {
        const ang = (-2 * Math.PI) / len;
        for (let i = 0; i < N; i += len) {
          for (let k = 0; k < len / 2; k++) {
            const wr = Math.cos(ang * k);
            const wi = Math.sin(ang * k);
            const ur = re[i + k];
            const ui = im[i + k];
            const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
            const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
            re[i + k] = ur + vr;
            im[i + k] = ui + vi;
            re[i + k + len / 2] = ur - vr;
            im[i + k + len / 2] = ui - vi;
          }
        }
      }
      let total = 0;
      let weighted = 0;
      const bands = { low: 0, mid: 0, high: 0 };
      for (let k = 1; k < N / 2; k++) {
        const hz = (k * SR) / N;
        const p = re[k] ** 2 + im[k] ** 2;
        total += p;
        weighted += p * hz;
        if (hz < 400) bands.low += p;
        else if (hz < 2500) bands.mid += p;
        else bands.high += p;
      }
      const pct = (v) => Math.round((100 * v) / total);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v));
      return {
        centroidHz: Math.round(weighted / total),
        lowPct: pct(bands.low),
        midPct: pct(bands.mid),
        highPct: pct(bands.high),
        peak: +peak.toFixed(2),
      };
    }

    function wavBase64(buffer) {
      const ch = buffer.numberOfChannels;
      const len = buffer.length;
      const bytes = new DataView(new ArrayBuffer(44 + len * ch * 2));
      const str = (o, s) => [...s].forEach((c, i) => bytes.setUint8(o + i, c.charCodeAt(0)));
      str(0, 'RIFF');
      bytes.setUint32(4, 36 + len * ch * 2, true);
      str(8, 'WAVEfmt ');
      bytes.setUint32(16, 16, true);
      bytes.setUint16(20, 1, true);
      bytes.setUint16(22, ch, true);
      bytes.setUint32(24, SR, true);
      bytes.setUint32(28, SR * ch * 2, true);
      bytes.setUint16(32, ch * 2, true);
      bytes.setUint16(34, 16, true);
      str(36, 'data');
      bytes.setUint32(40, len * ch * 2, true);
      const chans = Array.from({ length: ch }, (_, c) => buffer.getChannelData(c));
      for (let i = 0, o = 44; i < len; i++) {
        for (let c = 0; c < ch; c++, o += 2) {
          const v = Math.max(-1, Math.min(1, chans[c][i]));
          bytes.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
        }
      }
      let bin = '';
      const u8 = new Uint8Array(bytes.buffer);
      for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
      return btoa(bin);
    }

    return [
      { name: 'chords', wav: wavBase64(chords), stats: stats(chords, 0.25) },
      { name: 'melody', wav: wavBase64(melody), stats: stats(melody, 0.6, 2) },
      { name: 'low-e', wav: '', stats: stats(singles, 0.25) },
      { name: 'high-e', wav: '', stats: stats(singles, 3.25) },
      { name: 'singles', wav: wavBase64(singles), stats: null },
    ];
  });

  const report = {};
  for (const clip of clips) {
    if (clip.wav) {
      const file = path.join(outDir, `${label}-${clip.name}.wav`);
      await writeFile(file, Buffer.from(clip.wav, 'base64'));
    }
    if (clip.stats) report[clip.name] = clip.stats;
  }
  return { label, dir: path.relative(workspaceRoot, outDir), report };
}
