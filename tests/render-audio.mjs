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
    const { stats, wavBase64 } = await import('/tests/audio-tools.js');
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
