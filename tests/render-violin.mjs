/**
 * Renders violin sound samples offline (no hands, no XR) and saves them as
 * WAV files with simple spectrum statistics, for comparing synth changes
 * by ear and by numbers:
 *
 *   npx iwsdk dev up --allow-browser-automation
 *   AUDIO_LABEL=after npm run render:violin
 *
 * Writes test-results/audio/<label>-violin-<clip>.wav: long bowed notes
 * up the E string (high), the loud William Tell passage in detache
 * (melody), and the open G and D strings (low).
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export default async function run({ frame, workspaceRoot }) {
  const label = process.env.AUDIO_LABEL || 'sample';
  const outDir = path.join(workspaceRoot, 'test-results', 'audio');
  await mkdir(outDir, { recursive: true });

  const clips = await frame.evaluate(async () => {
    const { ViolinSynth } = await import('/src/violin/synth.ts');
    const { OPEN_MIDI } = await import('/src/violin/geometry.ts');
    const { WILLIAM_TELL_VIOLIN } = await import('/tests/songs/william-tell.js');
    const { midiOf } = await import('/tests/violin-performer.js');
    const { stats, wavBase64 } = await import('/tests/audio-tools.js');
    const SR = 48000;
    const STEP = 1 / 90; // the app sets each string once a frame

    /**
     * Renders bowed notes: { string, midi, start, seconds, level, brightness }.
     * Each stroke's loudness follows a smooth bow speed, fastest mid-stroke,
     * and a held note grows vibrato, as the app does.
     */
    async function render(seconds, notes) {
      const ctx = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR);
      const synth = new ViolinSynth(4, ctx);
      synth.setVolume(0.8);
      for (let t = 0; t < seconds; t += STEP) {
        for (let s = 0; s < 4; s++) {
          const n = notes.find((m) => m.string === s && t >= m.start && t < m.start + m.seconds);
          if (!n) {
            synth.setString(s, { midi: OPEN_MIDI[s], amplitude: 0, brightness: 0.5, vibrato: 0 }, t);
            continue;
          }
          const p = (t - n.start) / n.seconds;
          const speed = Math.min(1, 30 * p * p * (1 - p) * (1 - p) * 0.75 + (n.seconds > 0.6 ? 0.55 : 0));
          const vibrato = Math.min(1, Math.max(0, (t - n.start - 0.35) / 0.4));
          synth.setString(s, { midi: n.midi, amplitude: n.level * speed ** 0.6, brightness: n.brightness, vibrato }, t);
        }
      }
      return ctx.startRendering();
    }

    const long = (string, midi, start) => ({ string, midi, start, seconds: 1.5, level: 0.85, brightness: 0.6 });
    const high = await render(7, [long(3, 76, 0.2), long(3, 81, 1.9), long(3, 85, 3.6), long(3, 88, 5.3)]);
    const low = await render(3.6, [long(0, 55, 0.2), long(1, 62, 1.9)]);

    const beat = 60 / WILLIAM_TELL_VIOLIN.tempo;
    const loud = WILLIAM_TELL_VIOLIN.events.filter((e) => e.note && e.beat >= 30 && e.beat < 46);
    const melody = await render(
      (loud.at(-1).beat - loud[0].beat + 1.5) * beat,
      loud.map((e, i) => {
        const midi = midiOf(e.note);
        const string = [3, 2, 1, 0].find((s) => midi >= OPEN_MIDI[s]);
        const next = loud[i + 1]?.beat ?? e.beat + 0.5;
        return { string, midi, start: 0.2 + (e.beat - loud[0].beat) * beat, seconds: (next - e.beat) * beat, level: 0.9, brightness: 0.7 };
      }),
    );

    return [
      { name: 'high', wav: wavBase64(high), stats: null },
      { name: 'E5', stats: stats(high, 0.75) },
      { name: 'A5', stats: stats(high, 2.45) },
      { name: 'C#6', stats: stats(high, 4.15) },
      { name: 'E6', stats: stats(high, 5.85) },
      { name: 'low', wav: wavBase64(low), stats: null },
      { name: 'G3', stats: stats(low, 0.75) },
      { name: 'melody', wav: wavBase64(melody), stats: stats(melody, 0.6) },
    ];
  });

  const report = {};
  for (const clip of clips) {
    if (clip.wav) await writeFile(path.join(outDir, `${label}-violin-${clip.name}.wav`), Buffer.from(clip.wav, 'base64'));
    if (clip.stats) report[clip.name] = clip.stats;
  }
  return { label, dir: path.relative(workspaceRoot, outDir), report };
}
