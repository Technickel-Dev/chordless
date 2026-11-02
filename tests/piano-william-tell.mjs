/**
 * Plays the galop theme from the William Tell Overture finale (see
 * songs/william-tell.js) on the air piano, the melody in the right hand and
 * the galop bass in the left, with IWER's emulated hands, all five fingers
 * each (the guitar's hand rig), in IWSDK's managed browser:
 *
 *   npx iwsdk dev up --headed --allow-browser-automation
 *   npm run play:piano
 *
 * Optional: WT_TEMPO=110 to slow it down. Prints how many keys were struck
 * on time and as loud as asked, any wrong ones, and renders what the piano
 * played to test-results/piano-william-tell.wav.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { startApp } from './app-start.js';

export default async function run({ page, frame, workspaceRoot }) {
  const tempo = Number(process.env.WT_TEMPO) || undefined;
  const dispatch = (method, params = {}) =>
    frame.evaluate(([m, p]) => window.IWER_MCP.dispatch(m, p), [method, params]);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  await startApp(
    { page, frame },
    {
      root: 'AirPiano',
      // Looking down at the keys, as a pianist does.
      view: { pitch: -35, yaw: 0, roll: 0 },
      modules: ['/tests/songs/william-tell.js', '/tests/piano-performer.js', '/tests/audio-tools.js'],
    },
  );

  const banner = (text) =>
    frame
      .evaluate((t) => {
        let el = document.getElementById('e2e-banner');
        if (!el) {
          el = document.createElement('div');
          el.id = 'e2e-banner';
          el.style.cssText =
            'position:fixed;left:16px;top:16px;z-index:99999;padding:10px 16px;border-radius:10px;' +
            'font:600 20px system-ui,sans-serif;color:#fff;background:rgba(20,20,24,.85);' +
            'border-left:6px solid #ffb000;pointer-events:none;';
          document.body.appendChild(el);
        }
        el.textContent = t;
      }, text)
      .catch(() => {});
  await banner('🎹 William Tell: piano');

  const started = Date.now();
  const playing = frame.evaluate(async (t) => {
    const { WILLIAM_TELL_PIANO } = await import('/tests/songs/william-tell.js');
    const { perform } = await import('/tests/piano-performer.js');
    const el = () => document.getElementById('e2e-banner');
    // Strikes are due in the song's order (by beat, left hand first).
    const events = WILLIAM_TELL_PIANO.events;
    return perform(WILLIAM_TELL_PIANO, {
      tempo: t,
      onEvent: (i) => {
        const e = events[i];
        if (el() && e.hand === 'right') el().textContent = `🎹 bar ${244 + Math.floor(e.beat / 2)}   ${e.dynamic}   ${e.note}`;
      },
    });
  }, tempo);
  // A picture in the loud section, both hands at work.
  const outDir = path.join(workspaceRoot, 'test-results');
  await mkdir(outDir, { recursive: true });
  const loudAt = (0.8 + 33 * (60 / (tempo ?? 152))) * 1000;
  await wait(Math.max(0, loudAt + 2500 - (Date.now() - started)));
  const shot = path.join(outDir, 'piano-william-tell.png');
  await (await frame.frameElement()).screenshot({ path: shot }).catch(() => {});
  const result = await playing;
  await banner(`🎹 Done: ${result.notesRight}/${result.notesTotal} keys right; rendering`);

  // What the piano played, rendered offline from the same recordings.
  const wav = await frame.evaluate(async ({ heard, released }) => {
    const { PianoSynth } = await import('/src/piano/synth.ts');
    const { wavBase64 } = await import('/tests/audio-tools.js');
    const live = Array.from(window.FRAMEWORK_MCP_RUNTIME.world.systems).find((s) => s?.instrument === 'piano').synth;
    const start = heard[0].t - 0.3;
    const seconds = Math.max(...released.map((r) => r.t), ...heard.map((h) => h.t)) - start + 3;
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * live.ctx.sampleRate), live.ctx.sampleRate);
    const synth = new PianoSynth(ctx);
    // The live piano's voice, already rendered: no need to render it again.
    live.buffers.forEach((b, i) => (synth.buffers[i] = b));
    synth.rendering = Promise.resolve();
    synth.setVolume(0.8);
    const events = [...heard.map((h) => ({ ...h, on: true })), ...released.map((r) => ({ ...r, on: false }))].sort((a, b) => a.t - b.t || a.on - b.on);
    for (const e of events) {
      if (e.on) synth.noteOn(e.midi, e.velocity, e.t - start);
      else synth.noteOff(e.midi, e.t - start);
    }
    return wavBase64(await ctx.startRendering());
  }, result);
  const wavFile = path.join(outDir, 'piano-william-tell.wav');
  await writeFile(wavFile, Buffer.from(wav, 'base64'));

  await banner(`🎹 Done: ${result.notesRight}/${result.notesTotal} keys right`);
  await frame.evaluate(() => {
    for (const hand of [window.IWER_DEVICE.hands.left, window.IWER_DEVICE.hands.right]) {
      hand.setPin(null);
      for (const f of ['thumb', 'middle', 'ring', 'pinky']) hand.setFingerPose(f, 'fist', 0);
    }
  });
  await dispatch('set_hand_pose', { device: 'hand-left', poseId: 'default' });
  await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'default' });
  await dispatch('end_session');
  const { heard, released, ...summary } = result;
  return {
    ...summary,
    notesHeard: heard.length,
    screenshot: path.relative(workspaceRoot, shot),
    audio: path.relative(workspaceRoot, wavFile),
  };
}
