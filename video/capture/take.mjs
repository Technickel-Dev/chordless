#!/usr/bin/env node
/**
 * Records one take: node video/capture/take.mjs <name> [seconds]
 * Takes are defined in takes.mjs. Needs the dev server (npx iwsdk dev up --no-open).
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { openApp, ROOT } from './lib.mjs';
import { TAKE_LIST } from './takes.mjs';

const [name, secondsArg] = process.argv.slice(2);
const def = TAKE_LIST[name];
if (!def) {
  console.error(`unknown take ${name}; known: ${Object.keys(TAKE_LIST).join(', ')}`);
  process.exit(2);
}
const limit = Number(secondsArg) || def.seconds || null;

const app = await openApp({ name, query: def.scene ? `scene=${def.scene}` : '' });
const { page, frame } = app;
const started = Date.now();
let meta;
try {
  // The existing play scripts expect IWSDK's managed window, where the app is a
  // frame inside the page; here the app is the page, so give them a frame that
  // can still be screenshotted.
  const shim = Object.create(frame);
  shim.frameElement = async () => ({ screenshot: (o) => page.screenshot(o) });
  const ctx = { page, frame: shim, workspaceRoot: ROOT };
  const finished = (async () => {
    if (def.run) return def.run(ctx, app);
    const mod = await import(pathToFileURL(path.join(ROOT, def.script)).href);
    Object.assign(process.env, def.env ?? {});
    process.env.WT_PHASE = 'start';
    let r = await mod.default(ctx);
    process.env.WT_PHASE = 'wait';
    while (r?.pending) r = await mod.default(ctx);
    return r;
  })();
  const result = await Promise.race([
    finished,
    limit ? new Promise((r) => setTimeout(() => r({ stoppedAt: limit }), limit * 1000)) : new Promise(() => {}),
  ]);
  console.log(name, 'finished after', ((Date.now() - started) / 1000).toFixed(0), 's', JSON.stringify(result).slice(0, 300));
} catch (err) {
  console.error(name, 'failed:', err.message);
  process.exitCode = 1;
} finally {
  const audio = await page.evaluate(() => window.__stopRec?.()).catch(() => null);
  meta = await app.save(audio);
  console.log('saved', JSON.stringify(meta));
  process.exit(0); // a lingering handle otherwise keeps the process (and the queue) alive forever
}
