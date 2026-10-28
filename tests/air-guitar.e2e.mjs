/**
 * End-to-end test for the air guitar, run inside IWSDK's managed Chromium
 * with the IWER Quest 3 emulator:
 *
 *   npx iwsdk dev up --allow-browser-automation
 *   npx iwsdk browser run tests/air-guitar.e2e.mjs --timeout 180000
 *
 * It drives the emulated headset and controllers through IWER's command
 * dispatcher, reads the AirGuitar component through the ECS inspector, and
 * writes screenshots plus results.json to test-results/.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const HEAD = { x: 0, y: 1.6, z: 0 };
const LEFT_ORIENT = { pitch: 0, yaw: 60, roll: -30 };
const RIGHT_ORIENT = { pitch: -20, yaw: 0, roll: 0 };
/** Left-hand spots along the neck: at the nut, mid-neck, near the body. */
const LEFT_AT = {
  nut: { x: -0.62, y: 1.3, z: -0.4 },
  mid: { x: -0.42, y: 1.22, z: -0.38 },
  body: { x: -0.25, y: 1.12, z: -0.3 },
};
const PICK_ABOVE = { x: 0.12, y: 1.3, z: -0.12 };
const PICK_BELOW = { x: 0.12, y: 0.8, z: -0.12 };
/** Gamepad button indices used by IWER. */
const BTN = { trigger: 0, squeeze: 1, thumbstick: 2, ax: 3, by: 4 };

export default async function run({ page, frame, workspaceRoot }) {
  const outDir = path.join(workspaceRoot, 'test-results');
  await mkdir(outDir, { recursive: true });

  const errors = [];
  const onConsole = (msg) => {
    if (msg.type() === 'error' && !/ERR_ABORTED/.test(msg.text())) errors.push(msg.text());
  };
  const onPageError = (err) => errors.push(String(err));

  const dispatch = (method, params = {}) =>
    frame.evaluate(([m, p]) => window.IWER_MCP.dispatch(m, p), [method, params]);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const guitar = async () => {
    const found = await dispatch('ecs_find_entities', { withComponents: ['AirGuitar'] });
    const entityIndex = found.entities[0].entityIndex;
    const q = await dispatch('ecs_query_entity', { entityIndex });
    return q.components.find((c) => c.componentId === 'AirGuitar').values;
  };
  const visible = (name) =>
    frame.evaluate((n) => {
      const obj = window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName(n);
      return obj ? obj.visible : null;
    }, name);
  const move = (device, position, orientation) =>
    dispatch('set_transform', { device, position, ...(orientation ? { orientation } : {}) });
  const sweep = (position, duration) =>
    dispatch('animate_to', { device: 'controller-right', position, duration });
  const press = (device, index, value) =>
    dispatch('set_gamepad_state', { device, buttons: [{ index, value }] });
  const tap = async (device, index) => {
    await press(device, index, 1);
    await wait(250);
    await press(device, index, 0);
    await wait(250);
  };
  const stick = async (device, x, y) => {
    await dispatch('set_gamepad_state', {
      device,
      axes: [
        { index: 0, value: x },
        { index: 1, value: y },
      ],
    });
    await wait(250);
    await dispatch('set_gamepad_state', {
      device,
      axes: [
        { index: 0, value: 0 },
        { index: 1, value: 0 },
      ],
    });
    await wait(250);
  };
  const shot = async (name) => {
    const file = path.join(outDir, `${name}.png`);
    await (await frame.frameElement()).screenshot({ path: file });
    return path.relative(workspaceRoot, file);
  };
  const playingStance = async (left = LEFT_AT.mid) => {
    await move('headset', HEAD, { pitch: -35, yaw: 0, roll: 0 });
    await move('controller-left', left, LEFT_ORIENT);
    await move('controller-right', PICK_ABOVE, RIGHT_ORIENT);
    await wait(400);
  };

  const results = [];
  const test = async (name, fn) => {
    const started = Date.now();
    try {
      const detail = await fn();
      results.push({ name, pass: true, ms: Date.now() - started, detail: detail ?? '' });
    } catch (err) {
      results.push({ name, pass: false, ms: Date.now() - started, detail: err.message });
    }
  };
  const expectEq = (actual, expected, label) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  };

  // Fresh page so every run starts from the app's initial state.
  await frame.evaluate(() => window.IWER_MCP.dispatch('reload_page', {}));
  await wait(1500);
  await frame.waitForFunction(() => window.FRAMEWORK_MCP_RUNTIME?.world?.scene != null, null, {
    timeout: 60000,
  });
  await wait(1500);
  page.on('console', onConsole);
  page.on('pageerror', onPageError);

  try {
    await test('Guitar is hidden before entering XR', async () => {
      expectEq(await visible('AirGuitar'), false, 'AirGuitar.visible');
      const g = await guitar();
      expectEq([g.key, g.tone, g.strums], [7, 'clean', 0], '[key, tone, strums]');
      return `key ${g.key} (G), tone ${g.tone}, strums ${g.strums}; ${await shot('01-browser')}`;
    });

    await test('Entering XR shows the guitar', async () => {
      await dispatch('accept_session');
      await wait(1000);
      await playingStance();
      expectEq(await visible('AirGuitar'), true, 'AirGuitar.visible');
      expectEq(await visible('ChordDisplay'), true, 'ChordDisplay.visible');
      return shot('02-playing-stance');
    });

    await test('Left hand position along the neck picks the chord', async () => {
      const seen = [];
      for (const [spot, chord] of [
        ['nut', 'G'],
        ['mid', 'D'],
        ['body', 'Bm'],
      ]) {
        await move('controller-left', LEFT_AT[spot], LEFT_ORIENT);
        await wait(400);
        const g = await guitar();
        expectEq(g.chord, chord, `chord with left hand at ${spot}`);
        seen.push(`${spot} → ${g.chord} (zone ${g.zone})`);
      }
      return seen.join(', ');
    });

    await test('Fast down strum plucks every string of D (xx0232)', async () => {
      await playingStance();
      const before = (await guitar()).strums;
      await sweep(PICK_BELOW, 0.12);
      await wait(300);
      const plucked = (await guitar()).strums - before;
      expectEq(plucked, 4, 'strings plucked');
      return `${plucked} strings in a 0.12 s swing`;
    });

    await test('Fast up strum plucks every string of D', async () => {
      const before = (await guitar()).strums;
      await sweep(PICK_ABOVE, 0.12);
      await wait(300);
      const plucked = (await guitar()).strums - before;
      expectEq(plucked, 4, 'strings plucked');
      return `${plucked} strings in a 0.12 s swing`;
    });

    await test('Slow strum (arpeggio) also plucks every string', async () => {
      const before = (await guitar()).strums;
      await sweep(PICK_BELOW, 0.8);
      await wait(300);
      const mid = await shot('03-after-strum');
      await sweep(PICK_ABOVE, 0.8);
      await wait(300);
      const plucked = (await guitar()).strums - before;
      expectEq(plucked, 8, 'strings plucked over down + up');
      return `${plucked} strings over two 0.8 s swings; ${mid}`;
    });

    await test('Swinging outside the guitar body plays nothing', async () => {
      const before = (await guitar()).strums;
      await move('controller-right', { x: 0.7, y: 1.3, z: -0.1 }, RIGHT_ORIENT);
      await wait(300);
      await sweep({ x: 0.7, y: 0.8, z: -0.1 }, 0.12);
      await wait(300);
      await move('controller-right', PICK_ABOVE, RIGHT_ORIENT);
      await wait(300);
      expectEq((await guitar()).strums - before, 0, 'strings plucked');
      return 'no plucks with the pick 60 cm to the right of the body';
    });

    await test('Squeeze, X and Y change the chord quality', async () => {
      await move('controller-left', LEFT_AT.body, LEFT_ORIENT);
      await wait(400);
      const seen = [];
      for (const [index, label, chord] of [
        [BTN.squeeze, 'squeeze', 'B'],
        [BTN.ax, 'X', 'B5'],
        [BTN.by, 'Y', 'Bm7'],
      ]) {
        await press('controller-left', index, 1);
        await wait(300);
        const g = await guitar();
        await press('controller-left', index, 0);
        await wait(300);
        expectEq(g.chord, chord, `chord while holding ${label}`);
        seen.push(`${label} → ${g.chord}`);
      }
      expectEq((await guitar()).chord, 'Bm', 'chord after release');
      return `${seen.join(', ')}, release → Bm`;
    });

    await test('Left thumbstick changes key', async () => {
      await stick('controller-left', 1, 0);
      let g = await guitar();
      expectEq([g.key, g.chord], [8, 'Cm'], '[key, chord] after right');
      await stick('controller-left', -1, 0);
      g = await guitar();
      expectEq([g.key, g.chord], [7, 'Bm'], '[key, chord] after left');
      return 'G → Ab (Bm → Cm) → G';
    });

    await test('Right thumbstick changes volume', async () => {
      // WebXR reports a stick pushed forward (up) as negative Y.
      await stick('controller-right', 0, -1);
      const up = (await guitar()).volume;
      await stick('controller-right', 0, 1);
      await stick('controller-right', 0, 1);
      const down = (await guitar()).volume;
      await stick('controller-right', 0, -1);
      expectEq([up.toFixed(2), down.toFixed(2)], ['0.90', '0.70'], '[after up, after 2× down]');
      return `0.80 → ${up.toFixed(2)} → ${down.toFixed(2)} → 0.80`;
    });

    await test('B toggles overdrive', async () => {
      await tap('controller-right', BTN.by);
      const drive = (await guitar()).tone;
      const file = await shot('04-overdrive');
      await tap('controller-right', BTN.by);
      const clean = (await guitar()).tone;
      expectEq([drive, clean], ['drive', 'clean'], '[after 1st tap, after 2nd tap]');
      return `clean → drive → clean; ${file}`;
    });

    await test('Trigger and A auto-strum the whole chord', async () => {
      await move('controller-left', LEFT_AT.mid, LEFT_ORIENT);
      await wait(400);
      let before = (await guitar()).strums;
      await tap('controller-right', BTN.trigger);
      const down = (await guitar()).strums - before;
      before = (await guitar()).strums;
      await tap('controller-right', BTN.ax);
      const up = (await guitar()).strums - before;
      expectEq([down, up], [4, 4], '[trigger, A] strings plucked on D');
      return `trigger plucked ${down}, A plucked ${up}`;
    });

    await test('Exiting XR hides the guitar', async () => {
      await dispatch('end_session');
      await wait(800);
      expectEq(await visible('AirGuitar'), false, 'AirGuitar.visible');
      return 'hidden after exit';
    });

    await test('No console errors during the run', async () => {
      if (errors.length) throw new Error(errors.slice(0, 3).join(' | '));
      return '0 errors';
    });
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    await dispatch('set_device_state', {}).catch(() => {});
  }

  const passed = results.filter((r) => r.pass).length;
  const summary = { passed, failed: results.length - passed, total: results.length, results };
  await writeFile(path.join(outDir, 'results.json'), JSON.stringify(summary, null, 2));
  return summary;
}
