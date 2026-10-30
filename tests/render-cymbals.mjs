/**
 * Renders air cymbal sound samples offline (no hands, no XR) and saves them
 * as WAV files with simple spectrum and decay statistics, for comparing
 * synth changes by ear and by numbers:
 *
 *   npx iwsdk dev up --allow-browser-automation
 *   AUDIO_LABEL=after npm run render:cymbals
 *
 * Writes test-results/audio/<label>-cymbals-<clip>.wav: one clash each at
 * pp, mf and ff left to ring, a flat (air-pocket) clash, and the William
 * Tell cymbal part with its secco and its choke, timed as the performer
 * plays it.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export default async function run({ frame, workspaceRoot }) {
  const label = process.env.AUDIO_LABEL || 'sample';
  const outDir = path.join(workspaceRoot, 'test-results', 'audio');
  await mkdir(outDir, { recursive: true });

  const clips = await frame.evaluate(async () => {
    const { CymbalSynth } = await import('/src/cymbals/synth.ts');
    const { HOLD_TO_DAMP } = await import('/src/cymbals/clash.ts');
    const { WILLIAM_TELL_CYMBALS } = await import('/tests/songs/william-tell.js');
    const { planPerformance } = await import('/tests/cymbals-performer.js');
    const { stats, wavBase64 } = await import('/tests/audio-tools.js');
    const SR = 48000;

    /** Renders clashes ({ at, loudness, flush }) and damps ({ at, damp: true }). */
    async function render(seconds, events) {
      const ctx = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR);
      const synth = new CymbalSynth(ctx);
      await synth.warm;
      synth.setVolume(0.8);
      for (const e of events) {
        if (e.damp) synth.damp(e.at);
        else synth.clash({ loudness: e.loudness, flush: e.flush ?? false }, e.at);
      }
      return ctx.startRendering();
    }
    /** RMS level (dBFS) over 0.1 s from `t`. */
    const level = (buffer, t) => {
      let sum = 0;
      let n = 0;
      for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        const d = buffer.getChannelData(ch);
        for (let i = Math.floor(t * SR); i < Math.min(d.length, Math.floor((t + 0.1) * SR)); i++, n++) sum += d[i] * d[i];
      }
      return Math.round(10 * Math.log10(sum / Math.max(1, n) + 1e-12) * 10) / 10;
    };
    const ringing = (buffer, at) => ({
      ...stats(buffer, at + 0.02),
      dB: [0.05, 0.5, 1, 2, 4].map((t) => `${t}s ${level(buffer, at + t)}`).join(', '),
    });

    const one = (loudness, flush = false) => render(7, [{ at: 0.1, loudness, flush }]);
    const pp = await one(0.2);
    const mf = await one(0.62);
    const ff = await one(1);
    const flat = await render(3, [{ at: 0.1, loudness: 0.8, flush: true }]);

    const plan = planPerformance(WILLIAM_TELL_CYMBALS);
    const events = plan.clashes.flatMap((k) => [
      { at: k.time, loudness: k.loudness },
      ...(k.secco ? [{ at: k.contact + HOLD_TO_DAMP, damp: true }] : []),
      ...(k.choke != null ? [{ at: k.choke, damp: true }] : []),
    ]);
    const part = await render(plan.end + 1.5, events);
    return [
      { name: 'pp', wav: wavBase64(pp), stats: ringing(pp, 0.1) },
      { name: 'mf', wav: wavBase64(mf), stats: ringing(mf, 0.1) },
      { name: 'ff', wav: wavBase64(ff), stats: ringing(ff, 0.1) },
      { name: 'flat', wav: wavBase64(flat), stats: ringing(flat, 0.1) },
      { name: 'william-tell', wav: wavBase64(part), stats: null },
    ];
  });

  const report = {};
  for (const clip of clips) {
    await writeFile(path.join(outDir, `${label}-cymbals-${clip.name}.wav`), Buffer.from(clip.wav, 'base64'));
    if (clip.stats) report[clip.name] = clip.stats;
  }
  return { label, dir: path.relative(workspaceRoot, outDir), report };
}
