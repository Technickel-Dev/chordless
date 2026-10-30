/**
 * End-to-end test for the hand-played air violin, run inside IWSDK's managed
 * Chromium with the IWER Quest 3 emulator in hand-tracking mode:
 *
 *   npx iwsdk dev up --allow-browser-automation
 *   npm run test:violin
 *
 * The violin is chosen on the panel with a hand-ray pinch. The left index
 * fingertip is placed at exact stopping points using the app's own geometry
 * module. For the bow, the right hand is held still once to learn where the
 * app puts the bow relative to the wrist; from that, the wrist is placed so
 * the hair crosses a chosen string at a chosen tilt, and drawn along the
 * bow frame by frame. Results and screenshots go to test-results/.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export default async function run({ page, frame, workspaceRoot }) {
  const outDir = path.join(workspaceRoot, 'test-results');
  await mkdir(outDir, { recursive: true });

  const errors = [];
  const onConsole = (msg) => {
    if (msg.type() === 'error' && !/ERR_ABORTED/.test(msg.text())) errors.push(msg.text());
  };
  const onPageError = (err) => errors.push(String(err));
  const pace = Math.max(1, Number(process.env.E2E_PACE) || 1);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms * pace));
  const banner = (text, color = '#ffb000') =>
    frame
      .evaluate(
        ([t, c]) => {
          let el = document.getElementById('e2e-banner');
          if (!el) {
            el = document.createElement('div');
            el.id = 'e2e-banner';
            el.style.cssText =
              'position:fixed;left:16px;top:16px;z-index:99999;padding:10px 16px;border-radius:10px;' +
              'font:600 18px system-ui,sans-serif;color:#fff;background:rgba(20,20,24,.85);pointer-events:none;';
            document.body.appendChild(el);
          }
          el.style.borderLeft = `6px solid ${c}`;
          el.textContent = t;
        },
        [text, color],
      )
      .catch(() => {});
  const dispatch = (method, params = {}) =>
    frame.evaluate(([m, p]) => window.IWER_MCP.dispatch(m, p), [method, params]);
  const state = async (component) => {
    const found = await dispatch('ecs_find_entities', { withComponents: [component] });
    const q = await dispatch('ecs_query_entity', { entityIndex: found.entities[0].entityIndex });
    return q.components.find((c) => c.componentId === component).values;
  };
  const visible = (name) =>
    frame.evaluate((n) => window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName(n)?.visible ?? null, name);
  const shot = async (name) => {
    const file = path.join(outDir, `${name}.png`);
    await (await frame.frameElement()).screenshot({ path: file });
    return path.relative(workspaceRoot, file);
  };

  /** Puts the left index fingertip on string `s`, `semitones` up, `height` above it (negative presses). */
  const stop = async (s, semitones, height = -0.002) => {
    const { position, orientation } = await frame.evaluate(
      async ([s, n, h]) => {
        const g = await import('/src/violin/geometry.ts');
        const root = window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName('AirViolin');
        root.updateMatrixWorld(true);
        const x = g.stopX(n);
        const p = root.position.clone().set(x, g.stringY(s, x), g.stringZ(s, x) + h).applyMatrix4(root.matrixWorld);
        const e = root.matrixWorld.elements;
        // Fingers point down into the fingerboard; the palm faces the G side.
        return { position: { x: p.x, y: p.y, z: p.z }, orientation: { fingers: [-e[8], -e[9], -e[10]], palm: [e[4], e[5], e[6]] } };
      },
      [s, semitones, height],
    );
    await dispatch('set_transform', { device: 'hand-left', position, orientation, anchor: 'index-tip' });
    await wait(250);
  };
  const leftAway = async () => {
    await dispatch('set_transform', { device: 'hand-left', position: { x: -0.35, y: 1.0, z: -0.2 } });
    await wait(200);
  };

  /**
   * Draws the bow across `strings` (one, or two neighbours for a double
   * stop) at `x` along them, pressed `press` metres into them, the contact
   * moving along the hair from `from` to `to` (0 frog, 1 tip) over
   * `seconds`; `lift` raises it clear of the strings instead. Returns what
   * the app did, frame by frame.
   */
  const bowStroke = (opts) =>
    frame.evaluate(async (o) => {
      const g = await import('/src/violin/geometry.ts');
      const { BOW } = await import('/src/violin/bow.ts');
      const { AirViolin } = await import('/src/violin/air-violin-component.ts');
      const world = window.FRAMEWORK_MCP_RUNTIME.world;
      const sys = Array.from(world.systems ?? []).find((x) => x?.stops && x?.bow && x?.synth);
      const root = world.scene.getObjectByName('AirViolin');
      const hand = window.IWER_DEVICE.hands.right;
      const V = (x = 0, y = 0, z = 0) => root.position.clone().set(x, y, z);
      const M = () => root.matrixWorld.clone();
      const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
      const basis = (frog, along, hairSide) => {
        const X = along.clone().normalize();
        const Z = hairSide.clone().negate();
        const Y = V().crossVectors(Z, X).normalize();
        Z.crossVectors(X, Y);
        return M().makeBasis(X, Y, Z).setPosition(frog);
      };

      // Once: hold the wrist still and see where the app puts the bow.
      if (!window.__bowInWrist) {
        const ref = { p: [0.45, 0.8, 0.25], q: [0, 0, 0, 1] };
        hand.setPin({ anchor: 'wrist', target: ref.p, wristRotation: ref.q });
        for (let i = 0; i < 6; i++) await nextFrame();
        const w = sys.worldPose;
        const bow = basis(V(...w.frog), V(...w.along), V(...w.hairSide));
        const wrist = M().compose(V(...ref.p), root.quaternion.clone().set(...ref.q), V(1, 1, 1));
        window.__bowInWrist = wrist.invert().multiply(bow);
      }
      const wristFromBow = window.__bowInWrist.clone().invert();

      // The hair's line across the strings, in violin space.
      const at = (s) => V(o.x, g.stringY(s, o.x), g.stringZ(s, o.x));
      let along;
      let outward;
      let contact;
      if (o.strings.length === 2) {
        along = at(o.strings[1]).sub(at(o.strings[0])).normalize();
        contact = at(o.strings[0]).add(at(o.strings[1])).multiplyScalar(0.5);
        outward = V(0, -along.z, along.y);
      } else {
        const [fy, fz] = g.stringFacing(o.strings[0]);
        outward = V(0, fy, fz);
        along = V(0, fz, -fy);
        contact = at(o.strings[0]);
      }
      if (along.y < 0) along.negate(); // the tip toward the G side, the frog by the E
      if (outward.z < 0) outward.negate();
      contact.addScaledVector(outward, o.lift ?? -o.press);
      const hairSide = outward.clone().negate();

      const before = sys.entity.getValue(AirViolin, 'strokes');
      const loud = [0, 0, 0, 0];
      const setString = sys.synth.setString;
      sys.synth.setString = function (s, sound) {
        loud[s] = Math.max(loud[s], sound.amplitude);
        return setString.call(this, s, sound);
      };
      const bowing = new Set();
      let topSpeed = 0;
      // Set the bow on the string and let it rest a moment, then draw.
      const settle = 0.2;
      const start = performance.now();
      try {
        for (;;) {
          const elapsed = (performance.now() - start) / 1000;
          const t = Math.min(1, Math.max(0, elapsed - settle) / o.seconds);
          const u = o.from + (o.to - o.from) * t;
          const hair0 = contact.clone().addScaledVector(along, -u * BOW.hairLength);
          const frog = hair0.addScaledVector(hairSide, -BOW.hairDrop).addScaledVector(along, -BOW.frogToHair);
          root.updateMatrixWorld(true);
          const bowWorld = root.matrixWorld.clone().multiply(basis(frog, along, hairSide));
          const wrist = bowWorld.multiply(wristFromBow);
          const p = V();
          const q = root.quaternion.clone();
          wrist.decompose(p, q, V());
          hand.setPin({ anchor: 'wrist', target: [p.x, p.y, p.z], wristRotation: [q.x, q.y, q.z, q.w] });
          await nextFrame();
          const b = sys.entity.getValue(AirViolin, 'bowing');
          if (b) bowing.add(b);
          if (elapsed > settle) topSpeed = Math.max(topSpeed, Math.abs(sys.bow.velocity));
          if (t >= 1) break;
        }
        for (let i = 0; i < 3; i++) await nextFrame();
      } finally {
        sys.synth.setString = setString;
      }
      return {
        bowing: [...bowing],
        strokes: sys.entity.getValue(AirViolin, 'strokes') - before,
        lastNote: sys.entity.getValue(AirViolin, 'lastNote'),
        stops: sys.entity.getValue(AirViolin, 'stops'),
        loudest: loud.map((a) => Math.round(a * 100) / 100),
        topSpeed: Math.round(topSpeed * 100) / 100,
      };
    }, { x: 0.025, press: 0.0015, from: 0.15, to: 0.75, seconds: 0.9, ...opts });

  /** Points the right hand's ray at a panel button and pinches. */
  const aimAndPinch = async (id) => {
    await frame.evaluate(() => window.IWER_DEVICE.hands.right.setPin(null));
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
    await wait(400);
  };
  const lookAtViolin = () =>
    dispatch('set_transform', { device: 'headset', position: { x: 0, y: 1.6, z: 0 }, orientation: { pitch: -32, yaw: 28, roll: 0 } });

  const results = [];
  const test = async (name, fn) => {
    const step = `${results.length + 1}. ${name}`;
    await banner(step);
    const started = Date.now();
    try {
      results.push({ name, pass: true, ms: 0, detail: (await fn()) ?? '' });
    } catch (err) {
      results.push({ name, pass: false, ms: 0, detail: err.message });
    }
    const r = results.at(-1);
    r.ms = Date.now() - started;
    await banner(`${r.pass ? '✓' : '✗'} ${step}`, r.pass ? '#3dff8f' : '#ff4d4f');
    await wait(pace > 1 ? 500 : 0);
  };
  const expectEq = (actual, expected, label) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  };
  /** A stroke on one string must sound that string, loudly, and nothing else. */
  const expectSounded = (r, s, name, note) => {
    expectEq(r.bowing, [name], `${name} stroke: strings bowed`);
    expectEq(r.lastNote, note, `${name} stroke: last note`);
    if (r.loudest[s] < 0.3) throw new Error(`${name} stroke too quiet: ${r.loudest[s]}`);
    r.loudest.forEach((a, i) => {
      if (i !== s && a > 0.05) throw new Error(`${name} stroke also sounded string ${i} (${a})`);
    });
  };

  await page.bringToFront();
  await frame.evaluate(() => window.IWER_MCP.dispatch('reload_page', {}));
  await wait(1500);
  await frame.waitForFunction(() => window.FRAMEWORK_MCP_RUNTIME?.world?.scene != null, null, { timeout: 60000 });
  await wait(1200);
  const box = await (await frame.frameElement()).boundingBox();
  await page.mouse.click(box.x + 12, box.y + box.height / 2); // lets audio start
  page.on('console', onConsole);
  page.on('pageerror', onPageError);

  try {
    await test('Entering XR shows the guitar, the violin put away', async () => {
      await dispatch('accept_session');
      await wait(600);
      await dispatch('set_input_mode', { mode: 'hand' });
      await dispatch('set_transform', { device: 'headset', position: { x: 0, y: 1.6, z: 0 }, orientation: { pitch: -35, yaw: 15, roll: 0 } });
      await wait(500);
      expectEq([await visible('AirGuitar'), await visible('AirViolin'), await visible('AirBow')], [true, false, false], '[guitar, violin, bow] visible');
      return 'guitar out';
    });

    await test('The panel Violin button swaps instruments', async () => {
      await aimAndPinch('instrument-violin');
      const v = await state('AirViolin');
      const gtr = await state('AirGuitar');
      expectEq([v.active, gtr.active], [true, false], '[violin, guitar] active');
      expectEq([await visible('AirGuitar'), await visible('AirViolin'), await visible('AirBow')], [false, true, true], '[guitar, violin, bow] visible');
      await lookAtViolin();
      await wait(300);
      return 'violin under the chin, bow in the right hand';
    });

    await test('Bowing the open A string plays A4', async () => {
      await leftAway();
      const r = await bowStroke({ strings: [2] });
      expectSounded(r, 2, 'A', 'A4');
      if (r.strokes < 1) throw new Error('no stroke counted');
      return `bow speed ${r.topSpeed} m/s, loudness ${r.loudest[2]}`;
    });

    await test('Tilting the bow picks each string: G, D, A, E', async () => {
      const notes = ['G3', 'D4', 'A4', 'E5'];
      const names = ['G', 'D', 'A', 'E'];
      for (let s = 0; s < 4; s++) {
        const r = await bowStroke({ strings: [s], from: s % 2 ? 0.75 : 0.15, to: s % 2 ? 0.15 : 0.75 });
        expectSounded(r, s, names[s], notes[s]);
      }
      return notes.join(' ');
    });

    await test('Tilted between two strings, the bow plays both (a double stop)', async () => {
      const r = await bowStroke({ strings: [1, 2] });
      expectEq(r.bowing.includes('D A'), true, `strings bowed ${JSON.stringify(r.bowing)} include "D A"`);
      expectEq(r.lastNote, 'D4+A4', 'last note');
      return `${r.lastNote}, loudness ${r.loudest[1]} and ${r.loudest[2]}`;
    });

    await test('Stopping the A string plays B4, then E5 higher up', async () => {
      await stop(2, 2.3); // a little sharp: snaps to B
      let r = await bowStroke({ strings: [2] });
      expectEq(r.stops.split(' ')[2], 'B4', 'A string stop');
      expectSounded(r, 2, 'A', 'B4');
      await stop(2, 7);
      r = await bowStroke({ strings: [2], from: 0.75, to: 0.15 });
      expectSounded(r, 2, 'A', 'E5');
      const file = await shot('violin-01-stopped');
      await leftAway();
      return `B4 then E5; ${file}`;
    });

    await test('A bow held above the strings is silent', async () => {
      const r = await bowStroke({ strings: [2], lift: 0.012 });
      expectEq(r.bowing, [], 'strings bowed');
      if (Math.max(...r.loudest) > 0.02) throw new Error(`sounded: ${r.loudest}`);
      return 'no sound';
    });

    await test('Each change of bow direction is a new stroke', async () => {
      const down = await bowStroke({ strings: [1], from: 0.15, to: 0.75 });
      const up = await bowStroke({ strings: [1], from: 0.75, to: 0.15 });
      expectEq([down.strokes, up.strokes], [1, 1], '[down, up] strokes');
      return 'down-bow, up-bow';
    });

    await test('The panel Guitar button brings the guitar back', async () => {
      await aimAndPinch('instrument-guitar');
      expectEq([await visible('AirGuitar'), await visible('AirViolin'), await visible('AirBow')], [true, false, false], '[guitar, violin, bow] visible');
      return 'guitar out again';
    });

    await test('No console errors during the run', async () => {
      if (errors.length) throw new Error(errors.slice(0, 3).join(' | '));
      return '0 errors';
    });
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    await frame.evaluate(() => window.IWER_DEVICE?.hands?.right?.setPin(null)).catch(() => {});
    await dispatch('end_session').catch(() => {});
  }

  const passed = results.filter((r) => r.pass).length;
  await banner(`${passed}/${results.length} passed`, passed === results.length ? '#3dff8f' : '#ff4d4f');
  const summary = { passed, failed: results.length - passed, total: results.length, results };
  await writeFile(path.join(outDir, 'violin-results.json'), JSON.stringify(summary, null, 2));
  return summary;
}
