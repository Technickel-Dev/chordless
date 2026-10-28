/**
 * End-to-end test for the hand-played air guitar, run inside IWSDK's managed
 * Chromium with the IWER Quest 3 emulator in hand-tracking mode:
 *
 *   npx iwsdk dev up --allow-browser-automation
 *   npm run test:e2e
 *
 * Fingertips are placed at exact fret and string positions by loading the
 * app's own geometry module through Vite and converting guitar-space points
 * to world space with the live guitar transform. Results and screenshots
 * go to test-results/.
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

  // E2E_PACE > 1 slows the run down to watch it (e.g. E2E_PACE=3).
  const pace = Math.max(1, Number(process.env.E2E_PACE) || 1);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms * pace));
  /** Shows the running step over the page, for anyone watching. */
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
          el.style.display = t ? 'block' : 'none';
        },
        [text, color],
      )
      .catch(() => {});
  const dispatch = (method, params = {}) =>
    frame.evaluate(([m, p]) => window.IWER_MCP.dispatch(m, p), [method, params]);
  const guitar = async () => {
    const found = await dispatch('ecs_find_entities', { withComponents: ['AirGuitar'] });
    const q = await dispatch('ecs_query_entity', { entityIndex: found.entities[0].entityIndex });
    return q.components.find((c) => c.componentId === 'AirGuitar').values;
  };
  const visible = (name) =>
    frame.evaluate((n) => window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName(n)?.visible ?? null, name);
  const shot = async (name) => {
    const file = path.join(outDir, `${name}.png`);
    await (await frame.frameElement()).screenshot({ path: file });
    return path.relative(workspaceRoot, file);
  };

  /**
   * Converts a point on the guitar to world space. `fret` 0 is over the sound
   * hole (where the right hand picks); `height` is metres above the strings;
   * `across` shifts toward the low E (+) or high E (-) in metres.
   */
  const spot = ({ string, fret = 0, height = 0, across = 0 }) =>
    frame.evaluate(
      async ([s, f, h, a]) => {
        const g = await import('/src/guitar/geometry.ts');
        const root = window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName('AirGuitar');
        root.updateMatrixWorld(true);
        const x = f > 0 ? g.fretMidX(f) : 0;
        const p = root.position
          .clone()
          .set(x, g.stringY(s, x) + a, g.GUITAR.stringZ + h)
          .applyMatrix4(root.matrixWorld);
        const e = root.matrixWorld.elements;
        return {
          position: { x: p.x, y: p.y, z: p.z },
          // Fingers point into the top face; palms face the low E edge.
          orientation: { fingers: [-e[8], -e[9], -e[10]], palm: [e[4], e[5], e[6]] },
        };
      },
      [string, fret, height, across],
    );
  const placeTip = async (device, where) => {
    const { position, orientation } = await spot(where);
    await dispatch('set_transform', { device, position, orientation, anchor: 'index-tip' });
    await wait(250);
  };
  const sweepTip = async (where, duration) => {
    const { position, orientation } = await spot(where);
    await dispatch('animate_to', { device: 'hand-right', position, orientation, anchor: 'index-tip', duration });
    await wait(250);
  };
  /** Left hand well away from the neck, so every string is open. */
  const leftAway = () => placeTip('hand-left', { string: 5, fret: 5, height: 0.12 });

  const results = [];
  const test = async (name, fn) => {
    const step = `${results.length + 1}. ${name}`;
    await banner(step);
    const started = Date.now();
    try {
      results.push({ name, pass: true, ms: Date.now() - started, detail: (await fn()) ?? '' });
      results.at(-1).ms = Date.now() - started;
    } catch (err) {
      results.push({ name, pass: false, ms: Date.now() - started, detail: err.message });
    }
    const r = results.at(-1);
    await banner(`${r.pass ? '✓' : '✗'} ${step}`, r.pass ? '#3dff8f' : '#ff4d4f');
    await wait(pace > 1 ? 500 : 0);
  };
  const expectEq = (actual, expected, label) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  };

  // A window behind other windows renders at about 1 fps; bring it forward.
  await page.bringToFront();

  // Fresh page so every run starts from the app's initial state.
  await frame.evaluate(() => {
    try {
      localStorage.removeItem('chordless.placement');
    } catch {}
    return window.IWER_MCP.dispatch('reload_page', {});
  });
  await wait(1500);
  await frame.waitForFunction(() => window.FRAMEWORK_MCP_RUNTIME?.world?.scene != null, null, { timeout: 60000 });
  await wait(1200);
  page.on('console', onConsole);
  page.on('pageerror', onPageError);

  try {
    await test('Guitar is hidden before entering XR', async () => {
      expectEq(await visible('AirGuitar'), false, 'AirGuitar.visible');
      return 'hidden in the 2D page';
    });

    await test('Entering XR with hand tracking shows the guitar and tracks both hands', async () => {
      await dispatch('accept_session');
      await wait(600);
      await dispatch('set_input_mode', { mode: 'hand' });
      await dispatch('set_transform', {
        device: 'headset',
        position: { x: 0, y: 1.6, z: 0 },
        orientation: { pitch: -35, yaw: 15, roll: 0 },
      });
      await dispatch('set_hand_pose', { device: 'hand-left', poseId: 'point' });
      await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'point' });
      await leftAway();
      await placeTip('hand-right', { string: 0, height: 0.06, across: 0.03 });
      await wait(300);
      const g = await guitar();
      expectEq([await visible('AirGuitar'), g.leftHand, g.rightHand], [true, true, true], '[visible, left, right]');
      expectEq(g.frets, '0 0 0 0 0 0', 'frets with the left hand away');
      return 'guitar visible, both hands tracked, all strings open';
    });

    await test('A fingertip on the low E behind fret 3 frets G', async () => {
      await placeTip('hand-left', { string: 0, fret: 3 });
      const g = await guitar();
      expectEq(g.frets, '3 0 0 0 0 0', 'frets');
      return `frets ${g.frets}, shape reads ${g.chord}; ${await shot('01-fretting-g')}`;
    });

    await test('Index fingertip picks just the low E', async () => {
      const before = (await guitar()).plucks;
      await placeTip('hand-right', { string: 0, across: 0.006 });
      await sweepTip({ string: 0, across: -0.004 }, 0.15);
      const g = await guitar();
      expectEq([g.plucks - before, g.lastNote], [1, 'G2'], '[plucks, last note]');
      return `1 pluck, ${g.lastNote}`;
    });

    await test('Sweeping down through all strings strums six notes', async () => {
      await placeTip('hand-right', { string: 0, across: 0.02 });
      const before = (await guitar()).plucks;
      await sweepTip({ string: 5, across: -0.02 }, 0.15);
      const g = await guitar();
      expectEq(g.plucks - before, 6, 'plucks');
      return `6 plucks, ringing chord ${g.chord}; ${await shot('02-strum')}`;
    });

    await test('Moving back above the strings plays nothing', async () => {
      const before = (await guitar()).plucks;
      await sweepTip({ string: 5, across: -0.02, height: 0.05 }, 0.1);
      await sweepTip({ string: 0, across: 0.02, height: 0.05 }, 0.2);
      await sweepTip({ string: 0, across: 0.02 }, 0.1);
      expectEq((await guitar()).plucks - before, 0, 'plucks');
      return 'finger lifted 5 cm: no plucks';
    });

    await test('Fretting the D string at fret 2 sounds E3', async () => {
      await placeTip('hand-left', { string: 2, fret: 2 });
      expectEq((await guitar()).frets, '0 0 2 0 0 0', 'frets');
      await placeTip('hand-right', { string: 2, across: 0.005 });
      await sweepTip({ string: 2, across: -0.004 }, 0.12);
      expectEq((await guitar()).lastNote, 'E3', 'last note');
      return 'frets 0 0 2 0 0 0, plucked E3';
    });

    await test('Hammer-on to fret 4 changes the ringing note without a pluck', async () => {
      await placeTip('hand-right', { string: 2, across: 0.012 });
      await sweepTip({ string: 2, across: -0.006 }, 0.05);
      const before = (await guitar()).plucks;
      await placeTip('hand-left', { string: 2, fret: 4 });
      const g = await guitar();
      expectEq([g.frets, g.lastNote, g.plucks - before], ['0 0 4 0 0 0', 'F#3', 0], '[frets, last note, plucks]');
      return 'E3 → F#3 legato';
    });

    await test('Lifting the fretting finger opens the string', async () => {
      await placeTip('hand-left', { string: 2, fret: 4, height: 0.04 });
      expectEq((await guitar()).frets, '0 0 0 0 0 0', 'frets');
      return 'finger 4 cm above the string: open';
    });

    await test('Pinching both hands for a second moves the guitar', async () => {
      const before = await frame.evaluate(() => {
        const p = window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName('AirGuitar').position;
        return [p.x, p.y, p.z];
      });
      await dispatch('set_hand_pose', { device: 'hand-left', poseId: 'pinch' });
      await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'pinch' });
      await dispatch('set_transform', { device: 'hand-right', position: { x: 0.15, y: 1.15, z: -0.3 }, anchor: 'grasp' });
      await dispatch('set_transform', { device: 'hand-left', position: { x: -0.45, y: 1.3, z: -0.45 }, anchor: 'grasp' });
      // Poll: the hold takes a second, then the guitar eases into place.
      let after = before;
      let moved = Infinity;
      for (let i = 0; i < 20 && moved > 0.03; i++) {
        await wait(250);
        after = await frame.evaluate(() => {
          const p = window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName('AirGuitar').position;
          return [p.x, p.y, p.z];
        });
        moved = Math.hypot(after[0] - 0.15, after[1] - 1.15, after[2] + 0.3);
      }
      if (moved > 0.03) throw new Error(`body ended ${moved.toFixed(3)} m from the right pinch`);
      const file = await shot('03-placed');
      await dispatch('set_hand_pose', { device: 'hand-left', poseId: 'point' });
      await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'point' });
      const fmt = (v) => v.map((n) => n.toFixed(2)).join(', ');
      return `body (${fmt(before)}) → (${fmt(after)}); ${file}`;
    });

    await test('Panel buttons set overdrive, volume and reset the guitar', async () => {
      const aimAndPinch = async (id) => {
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
      await aimAndPinch('tone-drive');
      await aimAndPinch('volume-down');
      await aimAndPinch('reset-guitar');
      await wait(400);
      const g = await guitar();
      const pos = await frame.evaluate(() => {
        const p = window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName('AirGuitar').position;
        return [p.x, p.y, p.z];
      });
      expectEq([g.tone, Number(g.volume.toFixed(2))], ['drive', 0.7], '[tone, volume]');
      // Default placement: body ~0.6 m below the head.
      if (Math.abs(pos[1] - 1.0) > 0.05) throw new Error(`reset left body at y=${pos[1].toFixed(2)}`);
      await aimAndPinch('tone-clean');
      await aimAndPinch('volume-up');
      return `overdrive, volume 0.70, guitar back at y=${pos[1].toFixed(2)}; ${await shot('04-panel')}`;
    });

    await test('Losing hand tracking is reported', async () => {
      await dispatch('set_connected', { device: 'hand-left', connected: false });
      await wait(400);
      const g = await guitar();
      await dispatch('set_connected', { device: 'hand-left', connected: true });
      expectEq(g.leftHand, false, 'leftHand');
      return 'leftHand false while disconnected';
    });

    await test('Exiting XR hides the guitar', async () => {
      await dispatch('end_session');
      await wait(600);
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
  await banner(
    `${passed}/${results.length} passed`,
    passed === results.length ? '#3dff8f' : '#ff4d4f',
  );
  const summary = { passed, failed: results.length - passed, total: results.length, results };
  await writeFile(path.join(outDir, 'results.json'), JSON.stringify(summary, null, 2));
  return summary;
}
