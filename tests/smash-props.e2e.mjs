/**
 * End-to-end tests for smashing the instruments other than the guitar
 * (see guitar-smash.e2e.mjs), in IWSDK's managed Chromium with the IWER
 * Quest 3 emulator in hand-tracking mode. SMASH picks the instrument:
 *
 *   npx iwsdk dev up --allow-browser-automation
 *   SMASH=drums npm run test:smash-props
 *
 * Results and screenshots go to test-results/.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { startApp } from './app-start.js';

export default async function run({ page, frame, workspaceRoot }) {
  const which = process.env.SMASH ?? 'drums';
  const outDir = path.join(workspaceRoot, 'test-results');
  await mkdir(outDir, { recursive: true });
  const errors = [];
  const onConsole = (msg) => {
    if (msg.type() === 'error' && !/ERR_ABORTED/.test(msg.text())) errors.push(msg.text());
  };
  const onPageError = (err) => errors.push(String(err));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const dispatch = (method, params = {}) =>
    frame.evaluate(([m, p]) => window.IWER_MCP.dispatch(m, p), [method, params]);
  const shot = async (name) => {
    const file = path.join(outDir, `${name}.png`);
    await (await frame.frameElement()).screenshot({ path: file });
    return path.relative(workspaceRoot, file);
  };
  /** The named components' values on the entity carrying `component`. */
  const values = async (component, names) => {
    const found = await dispatch('ecs_find_entities', { withComponents: [component] });
    const q = await dispatch('ecs_query_entity', { entityIndex: found.entities[0].entityIndex });
    const out = {};
    for (const name of names) out[name] = q.components.find((c) => c.componentId === name)?.values;
    return out;
  };
  const smashState = async (component) => (await values(component, ['Smashable'])).Smashable;
  /** A panel button, aimed at with the right hand's ray and pinched. */
  const press = async (id) => {
    await frame.evaluate(() => {
      window.IWER_DEVICE.hands.left.setPin(null);
      window.IWER_DEVICE.hands.right.setPin(null);
    });
    await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'default' });
    const target = await frame.evaluate((n) => {
      const o = window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName(n);
      if (!o) return null;
      const v = o.getWorldPosition(o.position.clone());
      return { x: v.x, y: v.y, z: v.z };
    }, id);
    if (target == null) throw new Error(`no panel element named ${id}`);
    await dispatch('set_transform', { device: 'hand-right', position: { x: 0.3, y: 1.3, z: -0.4 } });
    await dispatch('look_at', { device: 'hand-right', target });
    await wait(200);
    await dispatch('select', { device: 'hand-right', duration: 0.15 });
    await wait(500);
  };
  /** World position of the named object, or null. */
  const where = (name) =>
    frame.evaluate((n) => {
      const o = window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName(n);
      if (!o) return null;
      o.updateWorldMatrix(true, false);
      const v = o.getWorldPosition(o.position.clone());
      return { x: v.x, y: v.y, z: v.z };
    }, name);
  /** Lowest and highest vertex of the named object's visible meshes. */
  const extent = (name) =>
    frame.evaluate((n) => {
      const object = window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName(n);
      object.updateMatrixWorld(true);
      let min = Infinity;
      let max = -Infinity;
      object.traverseVisible((o) => {
        if (!o.isMesh) return;
        const pos = o.geometry.attributes.position;
        const e = o.matrixWorld.elements;
        for (let k = 0; k < pos.count; k++) {
          const y = e[1] * pos.getX(k) + e[5] * pos.getY(k) + e[9] * pos.getZ(k) + e[13];
          min = Math.min(min, y);
          max = Math.max(max, y);
        }
      });
      return { min, max };
    }, name);
  const moveHand = async (device, to, duration = 0) => {
    if (duration > 0) {
      await dispatch('animate_to', { device, position: to, anchor: 'wrist', duration });
      await wait(duration * 1000 + 150);
    } else {
      await dispatch('set_transform', { device, position: to, anchor: 'wrist' });
    }
  };
  /** Turns the headset to look at the named object, screenshots, and looks ahead again. */
  const lookAndShoot = async (name, file) => {
    const at = await where(name);
    if (at) await dispatch('look_at', { device: 'headset', target: at });
    await wait(300);
    const out = await shot(file);
    await dispatch('set_transform', { device: 'headset', position: { x: 0, y: 1.6, z: 0 }, orientation: { pitch: 0, yaw: 0, roll: 0 } });
    return out;
  };

  const results = [];
  const test = async (name, fn) => {
    const started = Date.now();
    try {
      results.push({ name, pass: true, detail: (await fn()) ?? '' });
    } catch (err) {
      results.push({ name, pass: false, detail: err.message });
    }
    results.at(-1).ms = Date.now() - started;
  };
  const expect = (ok, message) => {
    if (!ok) throw new Error(message);
  };

  await startApp({ page, frame }, { root: 'AirGuitar', view: { pitch: 0, yaw: 0, roll: 0 } });
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  const ctx = { dispatch, wait, press, where, extent, moveHand, smashState, values, test, expect, shot, lookAndShoot, frame };
  try {
    await SCENARIOS[which](ctx);
    await test('No console errors during the run', async () => {
      expect(errors.length === 0, errors.slice(0, 3).join(' | '));
      return '0 errors';
    });
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    await press('reset-guitar').catch(() => {});
    await press('instrument-guitar').catch(() => {});
  }
  const passed = results.filter((r) => r.pass).length;
  const summary = { which, passed, failed: results.length - passed, total: results.length, results };
  await writeFile(path.join(outDir, `smash-${which}.json`), JSON.stringify(summary, null, 2));
  return summary;
}

const SCENARIOS = {
  async drums({ dispatch, wait, press, where, extent, moveHand, smashState, test, expect, lookAndShoot }) {
    await press('instrument-drums');
    await wait(500);
    await test('The kit starts whole', async () => {
      const s = await smashState('AirDrums');
      expect(s.hold === 'worn' && s.piecesOff === 0, JSON.stringify(s));
      return 'worn, nothing off';
    });
    let from;
    await test('A fist held on the snare pulls it off its stand', async () => {
      from = await where('Snare');
      await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'fist' });
      await moveHand('hand-right', { x: from.x, y: from.y + 0.03, z: from.z });
      await wait(1000);
      const s = await smashState('AirDrums');
      const loose = await where('SnareLoose');
      expect(s.piecesOff === 1 && loose != null, JSON.stringify(s));
      return `snare in hand at ${loose.y.toFixed(2)} m`;
    });
    await test('Opening the hand mid-swing throws it across the room', async () => {
      await moveHand('hand-right', { x: from.x, y: from.y + 0.3, z: from.z + 0.1 }, 0.3);
      await dispatch('animate_to', {
        device: 'hand-right',
        position: { x: from.x + 0.2, y: from.y + 0.6, z: from.z - 0.5 },
        anchor: 'wrist',
        duration: 0.15,
      });
      await wait(120);
      await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'open' });
      await wait(3000);
      const at = await where('SnareLoose');
      const e = await extent('SnareLoose');
      const moved = Math.hypot(at.x - from.x, at.z - from.z);
      expect(moved > 0.4, `moved only ${moved.toFixed(2)} m`);
      expect(e.min > -0.012 && e.min < 0.05, `lowest point ${e.min.toFixed(3)} m`);
      return `landed ${moved.toFixed(2)} m away, lowest point ${e.min.toFixed(3)} m`;
    });
    await lookAndShoot('SnareLoose', 'smash-drums');
    await test('Reset on the panel puts the snare back on its stand', async () => {
      await press('reset-guitar');
      const s = await smashState('AirDrums');
      const back = await where('Snare');
      expect(s.piecesOff === 0 && (await where('SnareLoose')) == null, JSON.stringify(s));
      expect(Math.hypot(back.x - from.x, back.y - from.y, back.z - from.z) < 0.01, `snare at ${JSON.stringify(back)}`);
      return 'snare back where it was';
    });
  },
};
