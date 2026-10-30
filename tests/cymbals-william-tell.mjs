/**
 * Plays the cymbal part for the galop theme from the William Tell Overture
 * finale (see songs/william-tell.js) on the air cymbals, with IWER's
 * emulated hands closed round the straps, in IWSDK's managed browser:
 *
 *   npx iwsdk dev up --headed --allow-browser-automation
 *   npm run play:cymbals
 *
 * Optional: WT_TEMPO=110 to slow it down. Prints each clash asked for, how
 * loud it came out and how far off the beat, and each damp.
 */

import { mkdir } from 'node:fs/promises';
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
      root: 'AirCymbalLeft',
      // Looking down at the plates in front of the chest.
      view: { pitch: -28, yaw: 0, roll: 0 },
      modules: ['/tests/songs/william-tell.js', '/tests/cymbals-performer.js'],
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
  await banner('🥁 William Tell: cymbals');

  const playing = frame.evaluate(async (t) => {
    const { WILLIAM_TELL_CYMBALS } = await import('/tests/songs/william-tell.js');
    const { perform } = await import('/tests/cymbals-performer.js');
    const el = () => document.getElementById('e2e-banner');
    const marks = WILLIAM_TELL_CYMBALS.events.map((e) => `${e.dynamic}${e.secco ? '·secco' : ''}${e.choke ? '·choke' : ''}`);
    return perform(WILLIAM_TELL_CYMBALS, {
      tempo: t,
      onEvent: (i) => {
        const shown = marks.map((n, k) => (k === i ? `[${n}]` : n));
        const from = Math.max(0, i - 5);
        if (el()) el().textContent = `🥁 bar ${260 + i}   ${shown.slice(from, from + 9).join(' ')}`;
      },
    });
  }, tempo);
  // A picture just after a crash, mid-performance.
  const outDir = path.join(workspaceRoot, 'test-results');
  await mkdir(outDir, { recursive: true });
  await wait(2900);
  const shot = path.join(outDir, 'cymbals-william-tell.png');
  await (await frame.frameElement()).screenshot({ path: shot }).catch(() => {});
  const result = await playing;

  await banner(`🥁 Done: ${result.clashesRight}/${result.clashesTotal} clashes right`);
  await frame.evaluate(() => {
    window.IWER_DEVICE.hands.left.setPin(null);
    window.IWER_DEVICE.hands.right.setPin(null);
  });
  await dispatch('set_hand_pose', { device: 'hand-left', poseId: 'default' });
  await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'default' });
  await dispatch('end_session');
  return { ...result, screenshot: path.relative(workspaceRoot, shot) };
}
