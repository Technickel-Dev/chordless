/**
 * Plays the galop theme from the William Tell Overture finale (see
 * songs/william-tell.js) on the air French horn, with IWER's emulated hands, in
 * IWSDK's managed browser: the left hand holding the horn to the lips and
 * fingering the valves, the right hand in the bell, its pinch tonguing
 * each note.
 *
 *   npx iwsdk dev up --headed --allow-browser-automation
 *   npm run play:horn       (the whole finale)
 *   npm run play:horn-cut   (bars 316-390 cut: WT_SONG=WILLIAM_TELL_HORN_CUT)
 *
 * Optional: WT_TEMPO=110 to slow it down. Prints each note asked for, its
 * fingering and partial, and the note the app played.
 */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { screenshotApp, startApp } from './app-start.js';

export default async function run({ page, frame, workspaceRoot }) {
  const tempo = Number(process.env.WT_TEMPO) || undefined;
  const song = process.env.WT_SONG || 'WILLIAM_TELL_HORN';
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
      root: 'AirHorn',
      // Looking down at the horn, where the left fingers work the levers.
      view: { pitch: -35, yaw: 0, roll: 0 },
      modules: ['/tests/songs/william-tell.js', '/tests/horn-performer.js'],
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
  await banner('William Tell: French horn');

  // Start the performance and leave it playing in the page; finish() waits for it.
  await frame.evaluate(([t, song]) => {
    const state = { done: false };
    window.__performance = state;
    (async () => {
      const WILLIAM_TELL_HORN = (await import('/tests/songs/william-tell.js'))[song];
      const { perform } = await import('/tests/horn-performer.js');
      const el = () => document.getElementById('e2e-banner');
      const names = WILLIAM_TELL_HORN.events.map((e) => e.note);
      return perform(WILLIAM_TELL_HORN, {
        tempo: t,
        onEvent: (i) => {
          const shown = names.map((n, k) => (k === i ? `[${n}]` : n));
          const from = Math.max(0, i - 8);
          if (el()) el().textContent = `${WILLIAM_TELL_HORN.title}   ${shown.slice(from, from + 12).join(' ')}`;
        },
      });
    })().then(
      (result) => Object.assign(state, { done: true, result }),
      (err) => Object.assign(state, { done: true, error: String(err?.stack ?? err) }),
    );
  }, [tempo, song]);
  // A picture of the loud section, mid-performance.
  const outDir = path.join(workspaceRoot, 'test-results');
  await mkdir(outDir, { recursive: true });
  await wait(16000);
  const shot = path.join(outDir, 'horn-william-tell.png');
  await screenshotApp({ page, frame }, { path: shot }).catch(() => {});
  // What is left of this run, with room for a slow start; a wait run picks up the rest.
  return finish(frame, dispatch, workspaceRoot, 60000);
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
  const shot = path.join(workspaceRoot, 'test-results', 'horn-william-tell.png');
  const banner = (text) =>
    frame
      .evaluate((t) => {
        const el = document.getElementById('e2e-banner');
        if (el) el.textContent = t;
      }, text)
      .catch(() => {});

  await banner(`Horn done: ${result.notesRight}/${result.notesTotal} notes right`);
  await frame.evaluate(() => {
    window.IWER_DEVICE.hands.left.setPin(null);
    window.IWER_DEVICE.hands.right.setPin(null);
  });
  await dispatch('end_session');
  return { ...result, screenshot: path.relative(workspaceRoot, shot) };
}
