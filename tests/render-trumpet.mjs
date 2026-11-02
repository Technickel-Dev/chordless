/**
 * Renders air trumpet sound samples offline (no hands, no XR) and saves them
 * as WAV files with simple spectrum statistics, for comparing synth changes
 * by ear and by numbers:
 *
 *   npx iwsdk dev up --allow-browser-automation
 *   AUDIO_LABEL=after npm run render:trumpet
 *
 * Writes test-results/audio/<label>-trumpet-<clip>.wav: a held written C5 at
 * pp, mf and ff, a tongued scale, a held note under the plunger opening and
 * closing, and the William Tell trumpet part, played as the performer
 * plays it.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export default async function run({ frame, workspaceRoot }) {
  const label = process.env.AUDIO_LABEL || 'sample';
  const outDir = path.join(workspaceRoot, 'test-results', 'audio');
  await mkdir(outDir, { recursive: true });

  const clips = await frame.evaluate(async () => {
    const { TrumpetSynth } = await import('/src/trumpet/synth.ts');
    const { AIR_STOP } = await import('/src/trumpet/playing.ts');
    const { WILLIAM_TELL_TRUMPET } = await import('/tests/songs/william-tell.js');
    const { planPerformance, handsAt } = await import('/tests/trumpet-performer.js');
    const { stats, wavBase64 } = await import('/tests/audio-tools.js');
    const SR = 48000;
    const STEP = 1 / 90;
    /** The app's loudness for an amount of air (see AirTrumpetSystem). */
    const loudness = (air) => (air <= 0 ? 0 : 0.15 + 0.85 * Math.max(0, (air - AIR_STOP) / (1 - AIR_STOP)));

    /** Renders `seconds`, asking `at(t)` for { midi, amplitude, mute } every frame, tonguing as the air starts. */
    async function render(seconds, at) {
      const ctx = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR);
      const synth = new TrumpetSynth(ctx);
      synth.setVolume(0.8);
      let was = 0;
      for (let t = 0; t < seconds; t += STEP) {
        const s = at(t);
        synth.set({ midi: s.midi, amplitude: s.amplitude, mute: s.mute ?? 0, tongued: s.amplitude > 0 && was === 0 }, t);
        was = s.amplitude;
      }
      return ctx.startRendering();
    }
    const held = (amplitude) => render(3, (t) => ({ midi: 70, amplitude: t >= 0.1 && t < 2.6 ? amplitude : 0 }));
    const pp = await held(0.35);
    const mf = await held(0.65);
    const ff = await held(1);
    // A written C major scale, C4 to C5, each note tongued: quarter notes at 120.
    const scale = [60, 62, 64, 65, 67, 69, 71, 72].map((m) => m - 2);
    const scaleClip = await render(4.6, (t) => {
      const i = Math.floor((t - 0.1) / 0.5);
      const within = (t - 0.1) % 0.5;
      return { midi: scale[Math.min(7, Math.max(0, i))], amplitude: t >= 0.1 && i < 8 && within < 0.44 ? 0.65 : 0 };
    });
    // The plunger opening and closing twice on a held note: wah-wah.
    const plunger = await render(3.4, (t) => ({
      midi: 70,
      amplitude: t >= 0.1 && t < 3 ? 0.8 : 0,
      mute: 0.5 - 0.5 * Math.cos(Math.max(0, t - 0.4) * Math.PI * 1.4),
    }));
    const plan = planPerformance(WILLIAM_TELL_TRUMPET);
    const tell = await render(plan.end + 1.2, (t) => {
      const { note, air } = handsAt(plan, t);
      return { midi: note.midi, amplitude: loudness(air) };
    });
    return [
      { name: 'pp', wav: wavBase64(pp), stats: stats(pp, 0.8) },
      { name: 'mf', wav: wavBase64(mf), stats: stats(mf, 0.8) },
      { name: 'ff', wav: wavBase64(ff), stats: stats(ff, 0.8) },
      { name: 'scale', wav: wavBase64(scaleClip), stats: null },
      { name: 'plunger', wav: wavBase64(plunger), stats: null },
      { name: 'william-tell', wav: wavBase64(tell), stats: null },
    ];
  });

  const report = {};
  for (const clip of clips) {
    await writeFile(path.join(outDir, `${label}-trumpet-${clip.name}.wav`), Buffer.from(clip.wav, 'base64'));
    if (clip.stats) report[clip.name] = clip.stats;
  }
  return { label, dir: path.relative(workspaceRoot, outDir), report };
}
