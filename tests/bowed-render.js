/**
 * Renders a bowed instrument's sound samples offline (no hands, no XR) and
 * saves them as WAV files with simple spectrum statistics, for comparing
 * synth changes by ear and by numbers (see render-violin.mjs and
 * render-cello.mjs). Writes test-results/audio/<label>-<instrument>-<clip>.wav:
 * long bowed notes up the top string (high), the loud William Tell passage
 * in detache (melody), and the two lowest open strings (low).
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Renders one instrument: { instrument, synth, geometry, song ([module,
 * export]), high (four MIDI notes up the top string), from (the loud
 * passage's first beat) }.
 */
export async function runBowedRender({ frame, workspaceRoot }, instrument) {
  const label = process.env.AUDIO_LABEL || 'sample';
  const outDir = path.join(workspaceRoot, 'test-results', 'audio');
  await mkdir(outDir, { recursive: true });

  const clips = await frame.evaluate(async (I) => {
    const { BowedSynth } = await import('/src/violin/synth.ts');
    const voice = (await import(I.synth[0]))[I.synth[1]];
    const { OPEN_MIDI } = (await import(I.geometry[0]))[I.geometry[1]];
    const WILLIAM_TELL_VIOLIN = (await import(I.song[0]))[I.song[1]];
    const { midiOf } = await import('/tests/bowed-performer.js');
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
      const synth = new BowedSynth(4, ctx, voice);
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
    const high = await render(7, I.high.map((midi, i) => long(3, midi, 0.2 + 1.7 * i)));
    const low = await render(3.6, [long(0, OPEN_MIDI[0], 0.2), long(1, OPEN_MIDI[1], 1.9)]);

    const beat = 60 / WILLIAM_TELL_VIOLIN.tempo;
    const loud = WILLIAM_TELL_VIOLIN.events.filter((e) => e.note && e.beat >= I.from && e.beat < I.from + 16);
    const melody = await render(
      (loud.at(-1).beat - loud[0].beat + 1.5) * beat,
      loud.map((e, i) => {
        const midi = midiOf(e.note);
        const string = [3, 2, 1, 0].find((s) => midi >= OPEN_MIDI[s]);
        const next = loud[i + 1]?.beat ?? e.beat + 0.5;
        return { string, midi, start: 0.2 + (e.beat - loud[0].beat) * beat, seconds: (next - e.beat) * beat, level: 0.9, brightness: 0.7 };
      }),
    );

    const { midiName } = await import('/src/guitar/chords.ts');
    return [
      { name: 'high', wav: wavBase64(high), stats: null },
      ...I.high.map((midi, i) => ({ name: midiName(midi), stats: stats(high, 0.75 + 1.7 * i) })),
      { name: 'low', wav: wavBase64(low), stats: null },
      { name: midiName(OPEN_MIDI[0]), stats: stats(low, 0.75) },
      { name: 'melody', wav: wavBase64(melody), stats: stats(melody, 0.6) },
    ];
  }, instrument);

  const report = {};
  for (const clip of clips) {
    if (clip.wav) await writeFile(path.join(outDir, `${label}-${instrument.instrument}-${clip.name}.wav`), Buffer.from(clip.wav, 'base64'));
    if (clip.stats) report[clip.name] = clip.stats;
  }
  return { label, dir: path.relative(workspaceRoot, outDir), report };
}
