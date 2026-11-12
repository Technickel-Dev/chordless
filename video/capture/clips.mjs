/**
 * Short takes for the trailer's second half, each recorded in the page itself
 * (lib.mjs, capture: 'canvas') so its picture and sound share one clock:
 *
 *   orch-<instrument>  on the stage, playing its trailer part (video/score.mjs)
 *   crash-<instrument> on the stage, smashed until it is wrecked
 *   scn-<scene>        an instrument playing two bars of the tutti in a scene
 *
 * Each take marks its moments (ms from the start of the recording) and the
 * performers log their clock every frame, so video/build.mjs can put every
 * beat where the score has it.
 */
import { startApp } from '../../tests/app-start.js';
import { PARTS, SCENE_RUN, trailerPart, firstBeat } from '../score.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Plays an instrument's trailer part (or bars of it) from the start of a recording. */
async function playPart({ page, frame }, app, { inst, fromBar, toBar, view }) {
  const part = PARTS[inst];
  await startApp({ page, frame }, { root: part.root, view: view ?? part.view, modules: [part.performer] });
  await app.hideBanner();
  // Picked from the menu, as a player would, so the menu folds out of the picture.
  await choose(frame, dispatcher(frame), `instrument-${inst}`);
  await wait(600);
  await app.startCapture();
  await wait(1500);
  const song = trailerPart(inst, { fromBar, toBar });
  await app.mark('perform', { inst, firstBeat: firstBeat(song), leadIn: part.leadIn, tempo: song.tempo });
  const r = await frame.evaluate(
    async ([mod, s]) => {
      const { perform } = await import(mod);
      const out = await perform(s, {});
      for (const side of ['left', 'right']) window.IWER_DEVICE.hands[side].setPin(null);
      return { fps: out.fps, drag: out.tempoDragPct, stalls: out.stalls };
    },
    [part.performer, song],
  );
  await wait(1800);
  return r;
}

// ------------------------------------------------------------------ smashing
const dispatcher = (frame) => (method, params = {}) => frame.evaluate(([m, p]) => window.IWER_MCP.dispatch(m, p), [method, params]);
const values = async (dispatch, component) => {
  const found = await dispatch('ecs_find_entities', { withComponents: [component] });
  const q = await dispatch('ecs_query_entity', { entityIndex: found.entities[0].entityIndex });
  return q.components.find((c) => c.componentId === 'Smashable')?.values ?? {};
};
const where = (frame, name) =>
  frame.evaluate((n) => {
    const o = window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName(n);
    if (!o) return null;
    o.updateWorldMatrix(true, false);
    const v = o.getWorldPosition(o.position.clone());
    return { x: v.x, y: v.y, z: v.z };
  }, name);
const lowest = (frame, name) =>
  frame.evaluate((n) => {
    const object = window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName(n);
    object.updateMatrixWorld(true);
    let min = Infinity;
    object.traverseVisible((o) => {
      if (!o.isMesh || o.userData.scar) return;
      const pos = o.geometry.attributes.position;
      const e = o.matrixWorld.elements;
      for (let k = 0; k < pos.count; k++) min = Math.min(min, e[1] * pos.getX(k) + e[5] * pos.getY(k) + e[9] * pos.getZ(k) + e[13]);
    });
    return min;
  }, name);
const toWorld = (frame, name, p) =>
  frame.evaluate(
    ([n, q]) => {
      const o = window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName(n);
      o.updateMatrixWorld(true);
      const e = o.matrixWorld.elements;
      return { x: e[0] * q[0] + e[4] * q[1] + e[8] * q[2] + e[12], y: e[1] * q[0] + e[5] * q[1] + e[9] * q[2] + e[13], z: e[2] * q[0] + e[6] * q[1] + e[10] * q[2] + e[14] };
    },
    [name, p],
  );
const FLOOR = 0.035;

/** Picks the instrument from the menu, before the recording starts (the menu then folds away). */
export async function choose(frame, dispatch, button) {
  // The panel is built a moment after the app starts.
  let target = null;
  for (let i = 0; i < 100 && !target; i++) {
    target = await where(frame, button);
    if (!target) await wait(100);
  }
  if (!target) throw new Error(`no ${button}`);
  await frame.evaluate(() => ['left', 'right'].forEach((s) => window.IWER_DEVICE.hands[s].setPin(null)));
  await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'default' });
  await dispatch('set_transform', { device: 'hand-right', position: { x: 0.3, y: 1.3, z: -0.4 } });
  await dispatch('look_at', { device: 'hand-right', target });
  await wait(250);
  await dispatch('select', { device: 'hand-right', duration: 0.15 });
  await wait(900);
}

/** The camera for a smash: low, off to the side, so the whole swing and the blow fill the frame. */
const sideCam = async (dispatch, position, target) => {
  await dispatch('set_transform', { device: 'headset', position, orientation: { pitch: 0, yaw: 0, roll: 0 } });
  await dispatch('look_at', { device: 'headset', target });
};

/** Swings a hand-held instrument down into the floor, hard, until it is wrecked. */
async function smashHeld({ frame }, app, { button, component, root, device, side }) {
  const dispatch = dispatcher(frame);
  await choose(frame, dispatch, button);
  const hand = { x: side * 0.22, y: 1.35, z: -0.42 };
  await dispatch('set_hand_pose', { device, poseId: 'default' });
  await dispatch('set_transform', { device, position: hand, anchor: 'wrist' });
  await sideCam(dispatch, { x: side * 0.95, y: 0.55, z: -0.12 }, { x: side * 0.22, y: 0.35, z: -0.5 });
  await wait(800);
  await app.startCapture();
  await wait(1500);
  let s = await values(dispatch, component);
  for (let i = 0; i < 8 && s.condition !== 'wrecked'; i++) {
    const up = { ...hand, y: 1.8, z: hand.z + 0.15 };
    await dispatch('animate_to', { device, position: up, anchor: 'wrist', duration: 0.45 });
    await wait(650);
    const drop = Math.max((await lowest(frame, root)) - FLOOR + 0.12, up.y - FLOOR + 0.2);
    const dur = Math.max(0.08, drop / 9);
    await dispatch('animate_to', { device, position: { ...hand, y: up.y - drop }, anchor: 'wrist', duration: dur });
    await wait(dur * 1000);
    await app.mark('impact', { n: i + 1 });
    await wait(300);
    s = await values(dispatch, component);
  }
  await app.mark('wrecked', { condition: s.condition });
  await dispatch('animate_to', { device, position: hand, anchor: 'wrist', duration: 0.5 });
  await wait(2500);
  return { condition: s.condition, impacts: s.impacts };
}

/** A bowed instrument taken by the neck in a left fist and brought down on the floor. */
async function smashBowed({ frame }, app, { button, component, root, gripX, cam }) {
  const dispatch = dispatcher(frame);
  await choose(frame, dispatch, button);
  await dispatch('set_hand_pose', { device: 'hand-left', poseId: 'fist' });
  const grip = await toWorld(frame, root, [gripX, 0, -0.01]);
  await dispatch('set_transform', { device: 'hand-left', position: grip, anchor: 'wrist' });
  for (let i = 0; i < 30 && (await values(dispatch, component)).hold !== 'held'; i++) await wait(100);
  await wait(300);
  await sideCam(dispatch, ...(cam ?? [{ x: -1.3, y: 1.05, z: -0.25 }, { x: -0.2, y: 0.8, z: -0.4 }]));
  const hand = { x: -0.2, y: 1.45, z: -0.35 };
  await dispatch('animate_to', { device: 'hand-left', position: hand, anchor: 'wrist', duration: 0.4 });
  await wait(600);
  await app.startCapture();
  await wait(1500);
  let s = await values(dispatch, component);
  for (let i = 0; i < 8 && s.condition !== 'wrecked'; i++) {
    const up = { ...hand, y: 1.85, z: hand.z + 0.1 };
    await dispatch('animate_to', { device: 'hand-left', position: up, anchor: 'wrist', duration: 0.4 });
    await wait(600);
    const drop = (await lowest(frame, root)) - FLOOR + 0.1;
    const dur = Math.max(0.08, drop / 9);
    await dispatch('animate_to', { device: 'hand-left', position: { ...up, y: up.y - drop, z: hand.z - 0.1 }, anchor: 'wrist', duration: dur });
    await wait(dur * 1000);
    await app.mark('impact', { n: i + 1 });
    await wait(300);
    s = await values(dispatch, component);
  }
  await app.mark('wrecked', { condition: s.condition });
  await dispatch('set_hand_pose', { device: 'hand-left', poseId: 'open' });
  await wait(2500);
  return { condition: s.condition, impacts: s.impacts };
}

/** The piano shoved over. */
async function smashPiano({ frame }, app) {
  const dispatch = dispatcher(frame);
  await choose(frame, dispatch, 'instrument-piano');
  const at = await where(frame, 'AirPiano');
  await sideCam(dispatch, { x: at.x + 0.7, y: 1.25, z: at.z + 0.95 }, { x: at.x, y: 0.35, z: at.z - 0.45 });
  await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'flat' });
  await wait(800);
  await app.startCapture();
  await wait(1500);
  let tilt = 0;
  for (let i = 0; i < 4 && tilt < 60; i++) {
    await dispatch('set_transform', { device: 'hand-right', position: await toWorld(frame, 'AirPiano', [0.1, 0.1, -0.08]), anchor: 'wrist' });
    await wait(300);
    await app.mark('shove', { n: i + 1 });
    await dispatch('animate_to', { device: 'hand-right', position: await toWorld(frame, 'AirPiano', [0.1, 0.12, -0.6]), anchor: 'wrist', duration: 0.25 });
    await wait(350);
    await dispatch('set_transform', { device: 'hand-right', position: { x: 0.4, y: 1.2, z: 0.3 }, anchor: 'wrist' });
    await wait(2000);
    tilt = await frame.evaluate(() => {
      const o = window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName('AirPiano');
      o.updateMatrixWorld(true);
      const e = o.matrixWorld.elements;
      return (Math.acos(Math.min(1, e[5] / Math.hypot(e[4], e[5], e[6]))) * 180) / Math.PI;
    });
  }
  await app.mark('wrecked', { tilt });
  await wait(1000);
  return { tilt };
}

/** The snare torn off the kit and hurled across the stage. */
async function smashDrums({ frame }, app) {
  const dispatch = dispatcher(frame);
  await choose(frame, dispatch, 'instrument-drums');
  const from = await where(frame, 'Snare');
  await sideCam(dispatch, { x: from.x + 0.55, y: 0.75, z: from.z - 1.7 }, { x: from.x, y: 0.6, z: from.z });
  await wait(800);
  await app.startCapture();
  await wait(1500);
  await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'fist' });
  await dispatch('set_transform', { device: 'hand-right', position: { x: from.x, y: from.y + 0.03, z: from.z }, anchor: 'wrist' });
  await wait(900);
  await dispatch('animate_to', { device: 'hand-right', position: { x: from.x, y: from.y + 0.55, z: from.z + 0.15 }, anchor: 'wrist', duration: 0.35 });
  await wait(450);
  await app.mark('throw');
  await dispatch('animate_to', { device: 'hand-right', position: { x: from.x + 0.3, y: from.y + 0.1, z: from.z - 0.9 }, anchor: 'wrist', duration: 0.22 });
  await wait(110);
  await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'open' });
  await wait(3200);
  await app.mark('wrecked');
  return {};
}

const smash = (fn, opts) => ({
  scene: 'stage',
  capture: 'canvas',
  seconds: 120,
  run: async (ctx, app) => {
    await startApp(ctx, { root: 'AirGuitar', view: { pitch: -20, yaw: 0, roll: 0 } });
    await app.hideBanner();
    return fn(ctx, app, opts);
  },
});

export const CLIPS = {
  'crash-trumpet': smash(smashHeld, { button: 'instrument-trumpet', component: 'AirTrumpet', root: 'AirTrumpet', device: 'hand-right', side: 1 }),
  'crash-cymbals': smash(smashHeld, { button: 'instrument-cymbals', component: 'AirCymbals', root: 'AirCymbalLeft', device: 'hand-left', side: -1 }),
  'crash-violin': smash(smashBowed, { button: 'instrument-violin', component: 'AirViolin', root: 'AirViolin', gripX: 0.17, cam: [{ x: -0.95, y: 0.6, z: -0.1 }, { x: -0.2, y: 0.4, z: -0.5 }] }),
  'crash-cello': smash(smashBowed, { button: 'instrument-cello', component: 'AirCello', root: 'AirCello', gripX: 0.45 }),
  'crash-piano': smash(smashPiano),
  'crash-drums': smash(smashDrums),
};
for (const inst of Object.keys(PARTS)) {
  CLIPS[`orch-${inst}`] = { scene: 'stage', capture: 'canvas', seconds: 150, run: (ctx, app) => playPart(ctx, app, { inst }) };
}
for (const [scene, inst, bar] of SCENE_RUN) {
  CLIPS[`scn-${scene}`] = { scene, capture: 'canvas', seconds: 90, run: (ctx, app) => playPart(ctx, app, { inst, fromBar: bar - 2, toBar: bar + 3 }) };
}
/** A few seconds of the trumpet on the stage, to check the capture. */
CLIPS['probe-canvas'] = { scene: 'stage', capture: 'canvas', seconds: 90, run: (ctx, app) => playPart(ctx, app, { inst: 'trumpet', fromBar: 226, toBar: 233 }) };
