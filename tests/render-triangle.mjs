/**
 * Renders air triangle sound samples offline (no hands, no XR) and saves
 * them as WAV files with simple spectrum and decay statistics, for
 * comparing synth changes by ear and by numbers:
 *
 *   npx iwsdk dev up --allow-browser-automation
 *   AUDIO_LABEL=after npm run render:triangle
 *
 * Writes test-results/audio/<label>-triangle-<clip>.wav: one strike each at
 * p, mf and f left to ring, a strike near a corner and one mid-side, a roll
 * stopped short, and the William Tell triangle part, timed as the
 * performer plays it.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export default async function run({ frame, workspaceRoot }) {
  const label = process.env.AUDIO_LABEL || 'sample';
  const outDir = path.join(workspaceRoot, 'test-results', 'audio');
  await mkdir(outDir, { recursive: true });

  const clips = await frame.evaluate(async () => {
    const { TriangleSynth } = await import('/src/triangle/synth.ts');
    const { BAR } = await import('/src/triangle/geometry.ts');
    const { WILLIAM_TELL_TRIANGLE } = await import('/tests/songs/william-tell.js');
    const { planPerformance } = await import('/tests/triangle-performer.js');
    const { stats, wavBase64 } = await import('/tests/audio-tools.js');
    const SR = 48000;
    // A third of the way up the right side (where the performer strikes), straight into the face.
    const SIDE = BAR.length * 0.82;

    /** Renders strikes ({ at, loudness, position, across }) and damps ({ at, damp: true } / { at, release: true }). */
    async function render(seconds, events) {
      const ctx = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR);
      const synth = new TriangleSynth(ctx);
      await synth.warm;
      synth.setVolume(0.8);
      // The resonators hear about strikes by message, which an offline render
      // does not wait for: pause it at each strike's moment to send them.
      const groups = new Map();
      for (const e of events) {
        const at = (Math.round((e.at * SR) / 128) * 128) / SR;
        groups.set(at, [...(groups.get(at) ?? []), e]);
      }
      for (const [at, group] of groups) {
        ctx.suspend(at).then(() => {
          for (const e of group) {
            if (e.damp) synth.damp(at);
            else if (e.release) synth.release(at);
            else synth.strike({ loudness: e.loudness, position: e.position ?? SIDE, across: e.across ?? 1 }, at);
          }
          ctx.resume();
        });
      }
      return ctx.startRendering();
    }
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

    const one = (loudness, extra = {}) => render(6, [{ at: 0.1, loudness, ...extra }]);
    const p = await one(0.35);
    const mf = await one(0.62);
    const f = await one(0.8);
    const cornerHit = await one(0.8, { position: BAR.length * 0.34, across: 0.2 });
    const middle = await one(0.8, { position: BAR.length * 0.17 });

    // A roll: 12 strokes a second, side to side in the top corner, for 1.2 s, then stopped.
    const roll = [];
    for (let k = 0; k < 14; k++) roll.push({ at: 0.1 + k / 12, loudness: 0.45, position: BAR.length * (k % 2 ? 0.47 : 0.53), across: 0.1 });
    roll.push({ at: 0.1 + 14 / 12 + 0.1, damp: true });
    const rolled = await render(2.5, roll);

    const plan = planPerformance(WILLIAM_TELL_TRIANGLE);
    const events = plan.strikes.map((k) => ({ at: k.time, loudness: k.loudness }));
    if (plan.roll) {
      plan.roll.contacts.forEach((c, i) => events.push({ at: c.time, loudness: 0.45, position: BAR.length * (i % 2 ? 0.47 : 0.53), across: 0.1 }));
      events.push({ at: plan.roll.chokeAt, damp: true });
    }
    events.sort((a, b) => a.at - b.at);
    const part = await render(plan.end + 1, events);
    return [
      { name: 'p', wav: wavBase64(p), stats: ringing(p, 0.1) },
      { name: 'mf', wav: wavBase64(mf), stats: ringing(mf, 0.1) },
      { name: 'f', wav: wavBase64(f), stats: ringing(f, 0.1) },
      { name: 'corner', wav: wavBase64(cornerHit), stats: ringing(cornerHit, 0.1) },
      { name: 'middle', wav: wavBase64(middle), stats: ringing(middle, 0.1) },
      { name: 'roll', wav: wavBase64(rolled), stats: { ...stats(rolled, 0.6), dB: `0.6s ${level(rolled, 0.6)}, after stop ${level(rolled, 1.6)}` } },
      { name: 'william-tell', wav: wavBase64(part), stats: null },
    ];
  });

  const report = {};
  for (const clip of clips) {
    await writeFile(path.join(outDir, `${label}-triangle-${clip.name}.wav`), Buffer.from(clip.wav, 'base64'));
    if (clip.stats) report[clip.name] = clip.stats;
  }
  return { label, dir: path.relative(workspaceRoot, outDir), report };
}
