/**
 * Plays the galop theme from the William Tell Overture finale (see
 * songs/william-tell.js) on the air trumpet, with IWER's emulated hands, in
 * IWSDK's managed browser: the right hand holding the horn to the lips and
 * fingering the valves, the left hand's pinch tonguing each note.
 *
 *   npx iwsdk dev up --headed --allow-browser-automation
 *   npm run play:trumpet
 *
 * Optional: WT_TEMPO=110 to slow it down. Prints each note asked for, its
 * fingering and partial, and the note the app played.
 */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { startApp } from './app-start.js';

export default async function run({ page, frame, workspaceRoot }) {
  const tempo = Number(process.env.WT_TEMPO) || undefined;
  // The whole finale lasts longer than one browser run may (110 s): a run
  // with WT_PHASE=wait picks up the performance an earlier run started
  // (tests/play-long.mjs chains them).
  const phase = process.env.WT_PHASE ?? 'start';
  const dispatch = (method, params = {}) =>
    frame.evaluate(([m, p]) => window.IWER_MCP.dispatch(m, p), [method, params]);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (phase === 'wait') return finish(frame, dispatch, workspaceRoot, 95000);

  await startApp(
    { page, frame },
    {
      root: 'AirTrumpet',
      // Looking down along the horn, a little to the right, where it is held.
      view: { pitch: -30, yaw: -10, roll: 0 },
      modules: ['/tests/songs/william-tell.js', '/tests/trumpet-performer.js'],
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
  await banner('🎺 William Tell: trumpet');

  // Start the performance and leave it playing in the page; finish() waits for it.
  await frame.evaluate((t) => {
    const state = { done: false };
    window.__performance = state;
    (async () => {
      const { WILLIAM_TELL_TRUMPET } = await import('/tests/songs/william-tell.js');
      const { perform } = await import('/tests/trumpet-performer.js');
      const el = () => document.getElementById('e2e-banner');
      const names = WILLIAM_TELL_TRUMPET.events.map((e) => e.note);
      return perform(WILLIAM_TELL_TRUMPET, {
        tempo: t,
        onEvent: (i) => {
          const shown = names.map((n, k) => (k === i ? `[${n}]` : n));
          const from = Math.max(0, i - 8);
          if (el()) el().textContent = `🎺 ${WILLIAM_TELL_TRUMPET.title}   ${shown.slice(from, from + 12).join(' ')}`;
        },
      });
    })().then(
      (result) => Object.assign(state, { done: true, result }),
      (err) => Object.assign(state, { done: true, error: String(err?.stack ?? err) }),
    );
  }, tempo);
  // A picture of the loud section, mid-performance.
  const outDir = path.join(workspaceRoot, 'test-results');
  await mkdir(outDir, { recursive: true });
  await wait(16000);
  const shot = path.join(outDir, 'trumpet-william-tell.png');
  await (await frame.frameElement()).screenshot({ path: shot }).catch(() => {});
  return finish(frame, dispatch, workspaceRoot, 80000);
}

/**
 * Waits for the performance in the page, at most `timeout` ms (what is left
 * of this run); reports { pending: true } if it is still playing, else the
 * score.
 */
async function finish(frame, dispatch, workspaceRoot, timeout) {
  const done = await frame
    .waitForFunction(() => window.__performance?.done, null, { timeout, polling: 500 })
    .then(
      () => true,
      () => false,
    );
  if (!done) return { pending: true };
  const result = await frame.evaluate(() => {
    if (window.__performance.error) throw new Error(window.__performance.error);
    return window.__performance.result;
  });
  const shot = path.join(workspaceRoot, 'test-results', 'trumpet-william-tell.png');
  const banner = (text) =>
    frame
      .evaluate((t) => {
        const el = document.getElementById('e2e-banner');
        if (el) el.textContent = t;
      }, text)
      .catch(() => {});

  await banner(`🎺 Done: ${result.notesRight}/${result.notesTotal} notes right`);
  await frame.evaluate(() => {
    window.IWER_DEVICE.hands.left.setPin(null);
    window.IWER_DEVICE.hands.right.setPin(null);
  });
  await dispatch('end_session');
  return { ...result, screenshot: path.relative(workspaceRoot, shot) };
}
