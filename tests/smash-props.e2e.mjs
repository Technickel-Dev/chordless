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

/** A point in an object's own space, in world space. */
const toWorld = (frame, name, [x, y, z]) =>
  frame.evaluate(
    ([n, p]) => {
      const o = window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName(n);
      o.updateMatrixWorld(true);
      const e = o.matrixWorld.elements;
      return {
        x: e[0] * p[0] + e[4] * p[1] + e[8] * p[2] + e[12],
        y: e[1] * p[0] + e[5] * p[1] + e[9] * p[2] + e[13],
        z: e[2] * p[0] + e[6] * p[1] + e[10] * p[2] + e[14],
      };
    },
    [name, [x, y, z]],
  );
/** How far the named object's up axis leans from vertical, in degrees. */
const lean = (frame, name) =>
  frame.evaluate((n) => {
    const o = window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName(n);
    o.updateMatrixWorld(true);
    const e = o.matrixWorld.elements;
    const len = Math.hypot(e[4], e[5], e[6]);
    return (Math.acos(Math.min(1, e[5] / len)) * 180) / Math.PI;
  }, name);

/** The stage top, where things land. */
const FLOOR = 0.035;

/** Each loose piece under `debris` that is sunk into the floor or not lying on it. */
const offFloor = (frame, debris) =>
  frame.evaluate(
    ([n, floor]) => {
      const root = window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName(n);
      root.updateMatrixWorld(true);
      const out = [];
      for (const piece of root.children) {
        let min = Infinity;
        piece.traverseVisible((o) => {
          if (!o.isMesh) return;
          const pos = o.geometry.attributes.position;
          const e = o.matrixWorld.elements;
          for (let k = 0; k < pos.count; k++) min = Math.min(min, e[1] * pos.getX(k) + e[5] * pos.getY(k) + e[9] * pos.getZ(k) + e[13]);
        });
        if (min !== Infinity && (min < floor - 0.012 || min > floor + 0.05)) out.push({ name: piece.name, min });
      }
      return { count: root.children.length, off: out };
    },
    [debris, FLOOR],
  );

/**
 * Picks up a bowed instrument by the neck with a left fist, smashes it into
 * the floor until it is wrecked, and checks the pieces land.
 */
async function bowed(ctx, { button, component, root, gripX, debris, screenshot }) {
  const { frame, dispatch, wait, press, extent, moveHand, smashState, test, expect, lookAndShoot } = ctx;
  await press(button);
  await wait(600);
  const hand = {};
  const move = async (to, duration = 0) => {
    Object.assign(hand, to);
    await moveHand('hand-left', { ...hand }, duration);
  };
  await test('A left fist round the neck picks it up', async () => {
    await dispatch('set_hand_pose', { device: 'hand-left', poseId: 'fist' });
    await move(await toWorld(frame, root, [gripX, 0, -0.01]));
    await wait(800);
    const s = await smashState(component);
    expect(s.hold === 'held', `hold ${s.hold}`);
    return 'held';
  });
  await test('Swinging it into the floor wrecks it, and the pieces land', async () => {
    let s = await smashState(component);
    for (let i = 0; i < 8 && s.condition !== 'wrecked'; i++) {
      await move({ y: hand.y + 0.35 }, 0.35);
      const drop = (await extent(root)).min - FLOOR + 0.08;
      await move({ y: hand.y - drop }, drop / 8);
      await wait(250);
      s = await smashState(component);
    }
    expect(s.condition === 'wrecked' && s.hold === 'thrown', `after ${s.impacts} hits: ${JSON.stringify(s)}`);
    expect(s.piecesOff >= 4, `${s.piecesOff} pieces off`);
    await wait(2500);
    const floor = await offFloor(frame, debris);
    expect(floor.off.length === 0, `pieces not on the floor: ${JSON.stringify(floor.off)}`);
    const body = await extent(root);
    expect(body.min > FLOOR - 0.012 && body.min < FLOOR + 0.05, `body lowest point ${body.min.toFixed(3)} m`);
    return `${s.impacts} hits (last ${s.lastImpact.toFixed(1)} m/s), ${s.piecesOff} pieces off, ${floor.count} on the floor`;
  });
  await dispatch('set_hand_pose', { device: 'hand-left', poseId: 'open' });
  await lookAndShoot(root, screenshot);
  await test('Reset on the panel puts it back together, on the player', async () => {
    await press('reset-guitar');
    await wait(300);
    const s = await smashState(component);
    expect(s.hold === 'worn' && s.piecesOff === 0 && s.health === 1, JSON.stringify(s));
    return 'whole and worn';
  });
}

/**
 * Swings an instrument played in the hand down into the floor until it is
 * wrecked and comes loose, and checks it and its pieces land.
 */
async function handHeld(ctx, { button, component, root, device, side, debris, screenshot }) {
  const { frame, dispatch, wait, press, extent, moveHand, smashState, test, expect, lookAndShoot } = ctx;
  await press(button);
  await wait(600);
  const hand = { x: side * 0.25, y: 1.3, z: -0.45 };
  await dispatch('set_hand_pose', { device, poseId: 'default' });
  await moveHand(device, { ...hand });
  await wait(400);
  await test('Swung gently down to the floor, it only knocks', async () => {
    const drop = (await extent(root)).min - FLOOR + 0.05;
    await moveHand(device, { ...hand, y: hand.y - drop }, drop / 0.8);
    await moveHand(device, { ...hand }, 0.4);
    const s = await smashState(component);
    expect(s.hold === 'worn' && s.health === 1, JSON.stringify(s));
    return 'still in hand, undamaged';
  });
  await test('Smashed into the floor it breaks up, and the pieces land', async () => {
    let s = await smashState(component);
    for (let i = 0; i < 8 && s.condition !== 'wrecked'; i++) {
      await moveHand(device, { ...hand }, 0.35);
      // Down to the floor: a horn held below the hand only reaches it with the wrist there.
      const drop = Math.max((await extent(root)).min - FLOOR + 0.1, hand.y - FLOOR);
      await moveHand(device, { ...hand, y: hand.y - drop }, drop / 8);
      await wait(200);
      s = await smashState(component);
    }
    expect(s.condition === 'wrecked' && s.hold === 'thrown', `after ${s.impacts} hits: ${JSON.stringify(s)}`);
    expect(s.piecesOff >= 2, `${s.piecesOff} pieces off`);
    await moveHand(device, { ...hand }, 0.3);
    await wait(2500);
    const floor = await offFloor(frame, debris);
    expect(floor.off.length === 0, `pieces not on the floor: ${JSON.stringify(floor.off)}`);
    const body = await extent(root);
    expect(body.min > FLOOR - 0.012 && body.min < FLOOR + 0.05, `lowest point ${body.min.toFixed(3)} m`);
    return `${s.impacts} hits (last ${s.lastImpact.toFixed(1)} m/s), ${s.piecesOff} pieces off; it lies on the floor`;
  });
  await lookAndShoot(root, screenshot);
  await test('Reset on the panel puts it back together, in the hand', async () => {
    await press('reset-guitar');
    await dispatch('set_hand_pose', { device, poseId: 'default' });
    await moveHand(device, { ...hand });
    await wait(400);
    const s = await smashState(component);
    const at = await extent(root);
    expect(s.hold === 'worn' && s.piecesOff === 0 && s.health === 1, JSON.stringify(s));
    expect(at.min > 0.5, `lowest point ${at.min.toFixed(2)} m: not back in the hand`);
    return 'whole, back in the hand';
  });
}

const SCENARIOS = {
  cymbals: (ctx) =>
    handHeld(ctx, { button: 'instrument-cymbals', component: 'AirCymbals', root: 'AirCymbalLeft', device: 'hand-left', side: -1, debris: 'AirCymbalsDebris', screenshot: 'smash-cymbals' }),
  triangle: (ctx) =>
    handHeld(ctx, { button: 'instrument-triangle', component: 'AirTriangle', root: 'AirTriangle', device: 'hand-left', side: -1, debris: 'AirTriangleDebris', screenshot: 'smash-triangle' }),
  trumpet: (ctx) =>
    handHeld(ctx, { button: 'instrument-trumpet', component: 'AirTrumpet', root: 'AirTrumpet', device: 'hand-right', side: 1, debris: 'AirTrumpetDebris', screenshot: 'smash-trumpet' }),
  trombone: (ctx) =>
    handHeld(ctx, { button: 'instrument-trombone', component: 'AirTrombone', root: 'AirTrombone', device: 'hand-left', side: -1, debris: 'AirTromboneDebris', screenshot: 'smash-trombone' }),
  horn: (ctx) =>
    handHeld(ctx, { button: 'instrument-horn', component: 'AirHorn', root: 'AirHorn', device: 'hand-left', side: -1, debris: 'AirHornDebris', screenshot: 'smash-horn' }),

  violin: (ctx) =>
    bowed(ctx, { button: 'instrument-violin', component: 'AirViolin', root: 'AirViolin', gripX: 0.17, debris: 'AirViolinDebris', screenshot: 'smash-violin' }),
  cello: (ctx) =>
    bowed(ctx, { button: 'instrument-cello', component: 'AirCello', root: 'AirCello', gripX: 0.45, debris: 'AirCelloDebris', screenshot: 'smash-cello' }),

  async piano({ frame, dispatch, wait, press, moveHand, smashState, test, expect, lookAndShoot }) {
    await press('instrument-piano');
    await wait(800);
    await test('The piano starts standing, whole', async () => {
      const s = await smashState('AirPiano');
      const tilt = await lean(frame, 'AirPiano');
      expect(s.hold === 'worn' && s.piecesOff === 0 && tilt < 1, `${JSON.stringify(s)}, lean ${tilt}`);
      return 'worn, upright';
    });
    await test('A hand resting on the case does not move it', async () => {
      await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'flat' });
      await moveHand('hand-right', await toWorld(frame, 'AirPiano', [0.1, 0.1, -0.25]));
      await wait(600);
      const s = await smashState('AirPiano');
      expect(s.hold === 'worn', `hold ${s.hold}`);
      return 'still in place';
    });
    await test('Shoving the top of the case topples it, shaking parts loose', async () => {
      await moveHand('hand-right', await toWorld(frame, 'AirPiano', [0.1, 0.1, -0.08]));
      await wait(300);
      await moveHand('hand-right', await toWorld(frame, 'AirPiano', [0.1, 0.12, -0.6]), 0.3);
      await moveHand('hand-right', { x: 0.4, y: 1.2, z: 0.3 });
      await wait(3500);
      const s = await smashState('AirPiano');
      const tilt = await lean(frame, 'AirPiano');
      expect(s.hold === 'thrown', `hold ${s.hold}`);
      expect(tilt > 60, `leans only ${tilt.toFixed(0)} degrees`);
      expect(s.impacts >= 1 && s.health < 1 && s.piecesOff > 0, JSON.stringify(s));
      return `over at ${tilt.toFixed(0)} degrees: hit at ${s.lastImpact.toFixed(1)} m/s, health ${(s.health * 100).toFixed(0)}%, ${s.piecesOff} pieces off`;
    });
    await lookAndShoot('AirPiano', 'smash-piano');
    await test('Reset on the panel stands it back up, whole', async () => {
      await press('reset-guitar');
      await wait(300);
      const s = await smashState('AirPiano');
      const tilt = await lean(frame, 'AirPiano');
      expect(s.hold === 'worn' && s.piecesOff === 0 && s.health === 1 && tilt < 1, `${JSON.stringify(s)}, lean ${tilt}`);
      return 'upright and whole';
    });
  },

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
      // Let go mid-swing.
      await dispatch('animate_to', {
        device: 'hand-right',
        position: { x: from.x + 0.3, y: from.y + 0.7, z: from.z - 0.8 },
        anchor: 'wrist',
        duration: 0.3,
      });
      await wait(150);
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
