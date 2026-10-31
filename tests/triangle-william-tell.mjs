/**
 * Plays the triangle part for the galop theme from the William Tell
 * Overture finale (see songs/william-tell.js) on the air triangle, with
 * IWER's emulated hands (the left pinching the clip, the right holding the
 * beater), in IWSDK's managed browser:
 *
 *   npx iwsdk dev up --headed --allow-browser-automation
 *   npm run play:triangle
 *
 * Optional: WT_TEMPO=110 to slow it down. Prints each strike asked for, how
 * loud it came out and how far off the beat, and the roll.
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
      root: 'AirTriangle',
      // Looking down at the triangle held in front of the chest.
      view: { pitch: -22, yaw: 0, roll: 0 },
      modules: ['/tests/songs/william-tell.js', '/tests/triangle-performer.js'],
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
  await banner('🔺 William Tell: triangle');

  const playing = frame.evaluate(async (t) => {
    const { WILLIAM_TELL_TRIANGLE } = await import('/tests/songs/william-tell.js');
    const { perform } = await import('/tests/triangle-performer.js');
    const el = () => document.getElementById('e2e-banner');
    const events = WILLIAM_TELL_TRIANGLE.events;
    return perform(WILLIAM_TELL_TRIANGLE, {
      tempo: t,
      onEvent: (i) => {
        const e = events[i];
        const bar = 244 + Math.floor(e.beat / 2);
        if (el()) el().textContent = `🔺 bar ${bar}   ${e.roll ? `${e.dynamic} roll` : e.dynamic}   (${i + 1}/${events.length})`;
      },
    });
  }, tempo);
  // A picture in the tutti, mid-performance.
  const outDir = path.join(workspaceRoot, 'test-results');
  await mkdir(outDir, { recursive: true });
  await wait(9200);
  const shot = path.join(outDir, 'triangle-william-tell.png');
  await (await frame.frameElement()).screenshot({ path: shot }).catch(() => {});
  const result = await playing;

  await banner(`🔺 Done: ${result.strikesRight}/${result.strikesTotal} right`);
  await frame.evaluate(() => {
    window.IWER_DEVICE.hands.left.setPin(null);
    window.IWER_DEVICE.hands.right.setPin(null);
  });
  await dispatch('set_hand_pose', { device: 'hand-left', poseId: 'default' });
  await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'default' });
  await dispatch('end_session');
  return { ...result, screenshot: path.relative(workspaceRoot, shot) };
}
