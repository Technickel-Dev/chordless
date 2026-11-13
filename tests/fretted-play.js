/**
 * Plays a song on a fretted air instrument (the guitar or the bass) with
 * IWER's emulated hands, in IWSDK's managed browser: the shared body of
 * william-tell.mjs and bass-william-tell.mjs.
 *
 * Optional: WT_TEMPO=110 to slow it down; WT_SONG names another export of
 * the song module (a concert cut). Prints each note asked for and the note
 * the app played, plus how far off the beat it landed.
 */

import { startApp } from './app-start.js';

/**
 * Plays one instrument's version: { label (for the banner), instrument (its
 * system's name), root (its model's name), song ([module, default export]),
 * performer (module exporting perform), view (headset orientation) }.
 */
export async function runFrettedPlay({ page, frame }, I) {
  const tempo = Number(process.env.WT_TEMPO) || undefined;
  const song = process.env.WT_SONG || I.song[1];
  // The whole finale lasts longer than one browser run may (110 s): a run
  // with WT_PHASE=wait picks up the performance an earlier run started
  // (tests/play-long.mjs chains them).
  const phase = process.env.WT_PHASE ?? 'start';
  const dispatch = (method, params = {}) =>
    frame.evaluate(([m, p]) => window.IWER_MCP.dispatch(m, p), [method, params]);
  if (phase === 'wait') return finish(frame, dispatch, null);

  await startApp({ page, frame }, { root: I.root, view: I.view, modules: [I.song[0], I.performer] });

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

  const audio = await frame.evaluate((name) => {
    const systems = Array.from(window.FRAMEWORK_MCP_RUNTIME.world.systems ?? []);
    const system = systems.find((s) => s?.instrument === name);
    return system?.synth.ctx.state ?? 'unknown';
  }, I.instrument);

  // Start the performance and leave it playing in the page; finish() waits for it.
  await banner(`♪ William Tell: ${I.label}`);
  await frame.evaluate(
    ([t, songModule, song, performer]) => {
      const state = { done: false };
      window.__performance = state;
      (async () => {
        const SONG = (await import(songModule))[song];
        const { perform } = await import(performer);
        const el = () => document.getElementById('e2e-banner');
        const notes = SONG.events.map((e) => (e.chord ? `${e.chord}!` : e.note.replace(/\d/, '')));
        return perform(SONG, {
          tempo: t,
          onEvent: (i) => {
            const shown = notes.map((n, k) => (k === i ? `[${n}]` : n));
            const from = Math.max(0, i - 8);
            if (el()) el().textContent = `♪ ${SONG.title}   ${shown.slice(from, from + 14).join(' ')}`;
          },
        });
      })().then(
        (result) => Object.assign(state, { done: true, result }),
        (err) => Object.assign(state, { done: true, error: String(err?.stack ?? err) }),
      );
    },
    [tempo, I.song[0], song, I.performer],
  );
  return finish(frame, dispatch, audio);
}

/**
 * Waits for the performance in the page, as long as this run may; reports
 * { pending: true } if it is still playing, else the score.
 */
async function finish(frame, dispatch, audio) {
  const done = await frame
    .waitForFunction(() => window.__performance?.done, null, { timeout: 95000, polling: 500 })
    .then(
      () => true,
      () => false,
    );
  if (!done) return { pending: true };
  const result = await frame.evaluate(() => {
    if (window.__performance.error) throw new Error(window.__performance.error);
    return window.__performance.result;
  });
  const banner = (text) =>
    frame
      .evaluate((t) => {
        const el = document.getElementById('e2e-banner');
        if (el) el.textContent = t;
      }, text)
      .catch(() => {});

  await banner(`♪ Done: ${result.notes.filter((n) => n.ok !== false).length}/${result.notes.length} notes right`);
  await dispatch('end_session');

  const late = result.notes.filter((n) => n.lateMs != null).map((n) => Math.abs(n.lateMs));
  return {
    audio,
    plucks: result.plucks,
    extraPlucks: result.extraPlucks,
    fps: result.fps,
    stalls: result.stalls,
    tempoDragPct: result.tempoDragPct,
    slowestFrameMs: result.slowestFrameMs,
    damps: result.damps,
    notesRight: result.notes.filter((n) => n.ok !== false).length,
    notesTotal: result.notes.length,
    worstTimingMs: Math.max(...late),
    meanTimingMs: Math.round(late.reduce((a, b) => a + b, 0) / late.length),
    notes: result.notes,
  };
}
