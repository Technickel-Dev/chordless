/**
 * Plays the galop theme from the William Tell Overture finale on a bowed
 * air instrument (see violin-william-tell.mjs and cello-william-tell.mjs),
 * with IWER's emulated hands in IWSDK's managed browser: the left hand
 * stopping the strings, the right hand drawing the bow.
 *
 * Optional: WT_TEMPO=110 to slow it down. Prints each note asked for, the
 * string, finger and hand position used, and the note the app played.
 */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';

/** Plays one instrument's version: { instrument, song ([module, export]), performer (module), view (headset orientation) }. */
export async function runBowedPlay({ page, frame, workspaceRoot }, I) {
  const tempo = Number(process.env.WT_TEMPO) || undefined;
  const dispatch = (method, params = {}) =>
    frame.evaluate(([m, p]) => window.IWER_MCP.dispatch(m, p), [method, params]);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // A window behind others renders at about 1 fps.
  await page.bringToFront();
  await frame.evaluate(() => window.IWER_MCP.dispatch('reload_page', {}));
  await wait(1500);
  await frame.waitForFunction(() => window.FRAMEWORK_MCP_RUNTIME?.world?.scene != null, null, { timeout: 60000 });
  await wait(1000);

  // A real click lets the browser start audio if it is still suspended.
  const box = await (await frame.frameElement()).boundingBox();
  await page.mouse.click(box.x + 12, box.y + box.height / 2);

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

  await dispatch('accept_session');
  await wait(600);
  await dispatch('set_input_mode', { mode: 'hand' });
  await dispatch('set_transform', { device: 'headset', position: { x: 0, y: 1.6, z: 0 }, orientation: I.view });
  await wait(800);

  const playing = frame.evaluate(async ([t, I]) => {
    const WILLIAM_TELL_VIOLIN = (await import(I.song[0]))[I.song[1]];
    const { perform } = await import(I.performer);
    const el = () => document.getElementById('e2e-banner');
    const names = WILLIAM_TELL_VIOLIN.events.map((e) => (e.notes ? e.notes.join('+') : e.note));
    return perform(WILLIAM_TELL_VIOLIN, {
      tempo: t,
      onEvent: (i) => {
        const shown = names.map((n, k) => (k === i ? `[${n}]` : n));
        const from = Math.max(0, i - 8);
        if (el()) el().textContent = `🎻 ${WILLIAM_TELL_VIOLIN.title}   ${shown.slice(from, from + 12).join(' ')}`;
      },
    });
  }, [tempo, I]);
  // A picture of the loud section, mid-performance.
  const outDir = path.join(workspaceRoot, 'test-results');
  await mkdir(outDir, { recursive: true });
  await wait(17000);
  const shot = path.join(outDir, `${I.instrument}-william-tell.png`);
  await (await frame.frameElement()).screenshot({ path: shot }).catch(() => {});
  const result = await playing;

  await banner(`🎻 Done: ${result.notesRight}/${result.notesTotal} notes right`);
  await frame.evaluate(() => {
    window.IWER_DEVICE.hands.left.setPin(null);
    window.IWER_DEVICE.hands.right.setPin(null);
  });
  await dispatch('end_session');
  return { ...result, screenshot: path.relative(workspaceRoot, shot) };
}
