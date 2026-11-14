/** The takes video/build.mjs cuts from. Each is recorded by `node video/capture/take.mjs <name>`. */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { startApp } from '../../tests/app-start.js';
import { meltdown, swingtest } from './meltdown.mjs';
import { CLIPS } from './clips.mjs';
import { baton, batonCheck } from './baton.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** The tune: Ode to Joy on the air guitar, ending on the wrong note. */
async function tune({ page, frame }, app, song = 'ODE_TO_JOY_FLUB') {
  const t0 = Date.now();
  const log = (m) => console.log(`[tune +${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
  page.on('console', (m) => m.type() === 'error' && log('console error: ' + m.text().slice(0, 200)));
  await startApp({ page, frame }, {
    root: 'AirGuitar',
    view: { pitch: -38, yaw: 12, roll: 0 },
    modules: ['/tests/songs/ode-to-joy.js', '/tests/performer.js'],
  });
  log('app started');
  await app.hideBanner();
  const result = await frame.evaluate(async (name) => {
    const songs = await import('/tests/songs/ode-to-joy.js');
    const { perform } = await import('/tests/performer.js');
    return perform(songs[name], {});
  }, song);
  log('performed');
  await wait(2500);
  return { notes: result.notes.length, fps: result.fps, stalls: result.stalls, drag: result.tempoDragPct, slowest: result.slowestFrameMs, right: result.notes.filter((n) => n.ok !== false).length };
}

/** One instrument playing the finale through its existing play script, for about 3 minutes. */
const wt = (script, scene, env = {}) => ({ script, scene, env, seconds: 185 });

export const TAKE_LIST = {
  meltdown: { scene: 'stage', run: meltdown, seconds: 220, capture: 'canvas' },
  baton: { scene: 'stage', run: baton, seconds: 120, capture: 'canvas' },
  'baton-check': { scene: 'stage', run: batonCheck, seconds: 120 },
  swingtest: { scene: 'stage', run: swingtest, seconds: 90 },
  'tune-ode': { scene: 'cliffside', run: tune, seconds: 70 },
  'wt-guitar': wt('tests/william-tell.mjs', 'cliffside'),
  'wt-trumpet': wt('tests/trumpet-william-tell.mjs', 'pirate-ship'),
  'wt-cello': wt('tests/cello-william-tell.mjs', 'balloon-basket'),
  'wt-violin': wt('tests/violin-william-tell.mjs', 'underwater'),
  'wt-piano': wt('tests/piano-william-tell.mjs', 'clock-tower'),
  'wt-drums': wt('tests/drums-william-tell.mjs', 'living-room'),
  'wt-triangle': wt('tests/triangle-william-tell.mjs', 'fridge'),
  'wt-cymbals': wt('tests/cymbals-william-tell.mjs', 'library'),
};

/** A scripted smash, from the destruction work's own end-to-end tests (about 1-2 minutes each). */
const smash = (script, scene, env = {}) => ({ script, scene, env, seconds: 150 });

/** A scene on its own: the headset in, an instrument in hand, a few seconds. */
const environment = (scene) => ({
  scene,
  seconds: 40,
  async run({ page, frame }, app) {
    await startApp({ page, frame }, { root: 'AirGuitar', view: { pitch: -20, yaw: 0, roll: 0 } });
    await app.hideBanner();
    await wait(5000);
    return { scene };
  },
});

Object.assign(TAKE_LIST, {
  'smash-guitar': smash('tests/guitar-smash.e2e.mjs', 'stage'),
  'smash-drums': smash('tests/smash-props.e2e.mjs', 'living-room', { SMASH: 'drums' }),
  'smash-piano': smash('tests/smash-props.e2e.mjs', 'clock-tower', { SMASH: 'piano' }),
  'smash-violin': smash('tests/smash-props.e2e.mjs', 'underwater', { SMASH: 'violin' }),
  'smash-trumpet': smash('tests/smash-props.e2e.mjs', 'pirate-ship', { SMASH: 'trumpet' }),
  'smash-cymbals': smash('tests/smash-props.e2e.mjs', 'library', { SMASH: 'cymbals' }),
});
for (const scene of ['space-station', 'volcano-rim', 'pinball', 'bouncy-castle', 'snow-globe', 'lava-lamp', 'giant-turtle', 'upside-down-room', 'stadium', 'desert-canyon', 'ice-cave', 'record-player', 'stage', 'cliffside']) {
  TAKE_LIST[`env-${scene}`] = environment(scene);
}

Object.assign(TAKE_LIST, CLIPS);
