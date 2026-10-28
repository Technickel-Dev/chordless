/**
 * Plays the opening of the William Tell Overture finale on the air guitar,
 * with IWER's emulated hands, in IWSDK's managed browser:
 *
 *   npx iwsdk dev up --headed --allow-browser-automation
 *   npm run play:william-tell
 *
 * Optional: WT_TEMPO=110 to slow it down. Prints each note asked for and
 * the note the app played, plus how far off the beat it landed.
 */

export default async function run({ page, frame }) {
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
  await dispatch('set_transform', {
    device: 'headset',
    position: { x: 0, y: 1.6, z: 0 },
    orientation: { pitch: -38, yaw: 12, roll: 0 },
  });
  await wait(800);

  const audio = await frame.evaluate(() => {
    const systems = Array.from(window.FRAMEWORK_MCP_RUNTIME.world.systems ?? []);
    const guitar = systems.find((s) => s?.synth);
    return guitar?.synth.ctx.state ?? 'unknown';
  });

  const result = await frame.evaluate(async (t) => {
    const { WILLIAM_TELL } = await import('/tests/songs/william-tell.js');
    const { perform } = await import('/tests/performer.js');
    const el = () => document.getElementById('e2e-banner');
    const notes = WILLIAM_TELL.events.map((e) => (e.chord ? `${e.chord}!` : e.note.replace(/\d/, '')));
    return perform(WILLIAM_TELL, {
      tempo: t,
      onEvent: (i) => {
        const shown = notes.map((n, k) => (k === i ? `[${n}]` : n));
        const from = Math.max(0, i - 8);
        if (el()) el().textContent = `♪ ${WILLIAM_TELL.title}   ${shown.slice(from, from + 14).join(' ')}`;
      },
    });
  }, tempo);

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
