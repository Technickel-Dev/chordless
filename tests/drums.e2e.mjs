/**
 * End-to-end test for the hand-played air drums, run inside IWSDK's
 * managed Chromium with the IWER Quest 3 emulator in hand-tracking mode:
 *
 *   npx iwsdk dev up --allow-browser-automation
 *   npm run test:drums
 *
 * The drums are chosen on the panel with a hand-ray pinch. Both hands make
 * a fist; each hand is held still once, well clear of the kit, to learn
 * where the app puts its stick relative to the wrist, and from that the
 * wrists are placed frame by frame so the stick tips follow a scripted
 * stroke: held above a piece, brought down through its surface at a chosen
 * speed and lifted off again. Results and screenshots go to test-results/.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { reloadApp } from './app-start.js';

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
  /** Which of the guitar, the cymbals and the drum kit are showing. */
  const showing = async () => Promise.all(['AirGuitar', 'AirCymbalLeft', 'AirDrums'].map(visible));

  /** Points the right hand's ray at a panel button and pinches. */
  const aimAndPinch = async (id) => {
    // The menu folds away once an instrument is chosen; open it to reach a control in it.
    const folded = await frame.evaluate((n) => {
      // UIKit hides an element (or its section) through isVisible, not Object3D.visible.
      return window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName(n)?.isVisible?.value === false;
    }, id);
    if (folded && id !== 'menu-open') await aimAndPinch('menu-open');
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
    await wait(400);
  };

  /**
   * Plays `strokes` in turn, each { hand, piece, r, speed, from, to, hold }:
   * the hand's stick tip held `from` metres over `piece` at `r` (a fraction
   * of its radius, out toward the far rim), brought down at `speed` m/s to
   * `to` (below the surface when negative), held `hold` seconds and lifted
   * back (or left at `to`, with `stay`). The stick points from the drummer
   * toward the piece, tipped down.
   * The idle hand waits behind the player. Returns what the app did.
   */
  const play = (strokes, after = 0.15) =>
    frame.evaluate(
      async ([strokes, after]) => {
        const { TIP_REACH } = await import('/src/drums/geometry.ts');
        const world = window.FRAMEWORK_MCP_RUNTIME.world;
        const sys = Array.from(world.systems ?? []).find((s) => s?.instrument === 'drums');
        const root = sys.model.root;
        const V = (x = 0, y = 0, z = 0) => root.position.clone().set(x, y, z);
        const M = () => root.matrixWorld.clone().identity();
        const Q = () => root.quaternion.clone().identity();
        const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
        const hands = { left: window.IWER_DEVICE.hands.left, right: window.IWER_DEVICE.hands.right };
        const PARK = { left: [-0.35, 1.45, 0.35], right: [0.35, 1.45, 0.35] };

        // Once: hold each fist still, clear of the kit, and see where the app puts its stick.
        if (!window.__stickInWrist) {
          const ref = { p: [0, 1.75, 0.4], q: [0, 0, 0, 1] };
          for (const hand of Object.values(hands)) hand.setPin({ anchor: 'wrist', target: ref.p, wristRotation: ref.q });
          for (let i = 0; i < 6; i++) await nextFrame();
          const wrist = M().compose(V(...ref.p), Q().set(...ref.q), V(1, 1, 1)).invert();
          window.__stickInWrist = sys.model.sticks.map((s) => wrist.clone().multiply(s.matrixWorld));
        }
        const wristOf = { left: window.__stickInWrist[0].clone().invert(), right: window.__stickInWrist[1].clone().invert() };
        const pin = (side, frame) => {
          const p = V();
          const q = Q();
          frame.multiply(wristOf[side]).decompose(p, q, V());
          hands[side].setPin({ anchor: 'wrist', target: [p.x, p.y, p.z], wristRotation: [q.x, q.y, q.z, q.w] });
        };
        /** A stick frame (world) with its tip at `tip` (kit space), pointing along `axis` (kit space). */
        const stickAt = (tip, axis) => {
          const a = axis.clone().normalize();
          const side = V().crossVectors(a, V(0, 1, 0)).normalize();
          const x = V().crossVectors(a, side);
          const grip = tip.clone().addScaledVector(a, -TIP_REACH);
          return root.matrixWorld.clone().multiply(M().makeBasis(x, a, side).setPosition(grip));
        };
        const park = (side) => {
          const q = Q();
          hands[side].setPin({ anchor: 'wrist', target: PARK[side], wristRotation: [q.x, q.y, q.z, q.w] });
        };

        const c = sys.component;
        const before = sys.entity.getValue(c, 'hits');
        const calls = [];
        const play = sys.synth.play;
        sys.synth.play = function (sound, when) {
          calls.push({ articulation: sound.articulation, loudness: Math.round(sound.loudness * 100) / 100 });
          return play.call(this, sound, when);
        };
        let restGap = null;
        try {
          for (const s of strokes) {
            const surface = sys.detector.surfaces.find((x) => x.piece.id === s.piece);
            const center = V(...surface.center);
            const normal = V(...surface.normal);
            // Out toward the far rim, along the surface.
            const away = V(center.x, 0, center.z).normalize();
            away.addScaledVector(normal, -away.dot(normal)).normalize();
            const spot = center.clone().addScaledVector(away, (s.r ?? 0) * surface.piece.radius);
            const axis = V(center.x, 0, center.z).normalize().multiplyScalar(Math.cos(0.35)).add(V(0, -Math.sin(0.35), 0));
            const from = s.from ?? 0.12;
            const to = s.to ?? -0.01;
            const settle = 0.25;
            const travel = Math.abs(from - to) / s.speed;
            const hold = s.hold ?? 0.05;
            const other = s.hand === 'left' ? 'right' : 'left';
            const tipAt = (h) => spot.clone().addScaledVector(normal, h);
            const start = performance.now();
            for (;;) {
              const t = (performance.now() - start) / 1000;
              let h;
              if (t < settle) h = from;
              else if (t < settle + travel) h = from + (to - from) * ((t - settle) / travel);
              else if (t < settle + travel + hold) h = to;
              else h = s.stay ? to : to + (from - to) * Math.min(1, (t - settle - travel - hold) / 0.2);
              park(other);
              pin(s.hand, stickAt(tipAt(h), axis));
              await nextFrame();
              if (s.measureRest && t >= settle + travel && t < settle + travel + hold) {
                // How far the drawn stick's tip is off the surface while held below it.
                const stick = sys.model.sticks[s.hand === 'left' ? 0 : 1];
                const tipKit = V(0, TIP_REACH, 0).applyMatrix4(stick.matrixWorld).applyMatrix4(root.matrixWorld.clone().invert());
                restGap = Math.round((tipKit.sub(center).dot(normal) - 0.006) * 1000) / 1000;
              }
              if (t >= settle + travel + hold + 0.2 + after) break;
            }
          }
        } finally {
          sys.synth.play = play;
        }
        return {
          calls,
          hits: sys.entity.getValue(c, 'hits') - before,
          lastPiece: sys.entity.getValue(c, 'lastPiece'),
          lastHit: sys.entity.getValue(c, 'lastHit'),
          lastSpeed: sys.entity.getValue(c, 'lastSpeed'),
          restGap,
        };
      },
      [strokes, after],
    );

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
  const expectRange = (value, lo, hi, label) => {
    if (!(value >= lo && value <= hi)) throw new Error(`${label}: ${value} not in [${lo}, ${hi}]`);
  };

  await reloadApp({ page, frame }, 'AirDrums');
  await frame.evaluate(() => Array.from(window.FRAMEWORK_MCP_RUNTIME.world.systems).find((s) => s?.instrument === 'drums')?.synth.warm);
  page.on('console', onConsole);
  page.on('pageerror', onPageError);

  try {
    await test('Entering XR shows the guitar, the kit put away', async () => {
      await dispatch('accept_session');
      await frame.waitForFunction(() => window.FRAMEWORK_MCP_RUNTIME.world.renderer?.xr?.isPresenting, null, { timeout: 10000 });
      await dispatch('set_input_mode', { mode: 'hand' });
      await dispatch('set_transform', { device: 'headset', position: { x: 0, y: 1.6, z: 0 }, orientation: { pitch: -35, yaw: 15, roll: 0 } });
      await wait(300);
      expectEq(await showing(), [true, false, false], '[guitar, cymbals, drums] visible');
      return 'guitar out';
    });

    await test('The panel Drums button sets the kit out at the player, a stick in each fist', async () => {
      await aimAndPinch('instrument-drums');
      const dr = await state('AirDrums');
      const gtr = await state('AirGuitar');
      expectEq([dr.active, gtr.active], [true, false], '[drums, guitar] active');
      await dispatch('set_hand_pose', { device: 'hand-left', poseId: 'fist' });
      await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'fist' });
      await dispatch('set_transform', { device: 'headset', position: { x: 0, y: 1.6, z: 0 }, orientation: { pitch: -40, yaw: 0, roll: 0 } });
      await play([{ hand: 'right', piece: 'snare', speed: 0.5, from: 0.15, to: 0.1 }]);
      expectEq(await showing(), [false, false, true], '[guitar, cymbals, drums] visible');
      const after = await state('AirDrums');
      expectEq([after.leftHand, after.rightHand], [true, true], '[left, right] hands tracked');
      // 1.6 m eyes on the 3.5 cm stage: the snare 72 cm below them.
      expectRange(after.snareHeight, 0.84, 0.85, 'snare height');
      expectEq(await visible('AirDrumstickRight'), true, 'right stick visible');
      return `snare at ${after.snareHeight} m; ${await shot('drums-01-kit')}`;
    });

    await test('A fast stroke on the snare sounds loud', async () => {
      const r = await play([{ hand: 'right', piece: 'snare', speed: 3.5 }]);
      expectEq(r.calls.map((c) => c.articulation), ['snare'], 'sounded');
      expectRange(r.lastHit, 0.8, 1, 'loudness');
      return `${r.lastSpeed} m/s, loudness ${r.lastHit}`;
    });

    await test('A slow stroke is soft, and a resting tip is silent', async () => {
      const r = await play([{ hand: 'right', piece: 'snare', speed: 0.7 }]);
      expectEq(r.hits, 1, 'strokes');
      expectRange(r.lastHit, 0.05, 0.5, 'loudness');
      const rest = await play([{ hand: 'right', piece: 'snare', speed: 0.08, from: 0.04 }]);
      expectEq(rest.hits, 0, 'strokes from a tip lowered onto the head');
      return `slow: ${r.lastSpeed} m/s, loudness ${r.lastHit}`;
    });

    await test('A stick pushed into a head stops on it', async () => {
      const r = await play([{ hand: 'left', piece: 'tom1', speed: 2, to: -0.06, hold: 0.3, measureRest: true }]);
      expectEq(r.calls.map((c) => c.articulation), ['tom1'], 'sounded');
      expectRange(r.restGap, -0.003, 0.003, 'tip off the head while pushed 6 cm into it');
      return `tip ${r.restGap} m off the head`;
    });

    await test('Every piece sounds its own way, zones included', async () => {
      const r = await play([
        { hand: 'right', piece: 'snare', r: 0.92, speed: 3 },
        { hand: 'left', piece: 'hihat', r: 0.3, speed: 2.5 },
        { hand: 'left', piece: 'hihat', r: 0.88, speed: 2.5 },
        { hand: 'right', piece: 'kick', speed: 2.5 },
        { hand: 'left', piece: 'tom1', speed: 2.5 },
        { hand: 'right', piece: 'tom2', speed: 2.5 },
        { hand: 'right', piece: 'floorTom', speed: 2.5 },
        { hand: 'left', piece: 'crash', r: 0.7, speed: 3 },
        { hand: 'right', piece: 'ride', r: 0.6, speed: 2 },
        { hand: 'right', piece: 'ride', r: 0.1, speed: 2 },
      ]);
      expectEq(
        r.calls.map((c) => c.articulation),
        ['rimshot', 'hihatClosed', 'hihatOpen', 'kick', 'tom1', 'tom2', 'floorTom', 'crash', 'ride', 'rideBell'],
        'articulations',
      );
      return `${r.hits} strokes; ${await shot('drums-02-ride-bell')}`;
    });

    await test('A tip coming up through a drum from below is silent', async () => {
      // First into the shell from the side (a jump there in one slow frame could cross the snare).
      await play([{ hand: 'right', piece: 'floorTom', speed: 1, from: -0.08, to: -0.08, hold: 0 }]);
      const r = await play([{ hand: 'right', piece: 'floorTom', speed: 1.5, from: -0.08, to: 0.1, hold: 0, stay: true }]);
      expectEq(r.hits, 0, 'strokes');
      return 'silent';
    });

    await test('Reset position moves the kit to the player, at their height', async () => {
      await dispatch('set_transform', { device: 'headset', position: { x: 0.3, y: 1.4, z: 0.1 }, orientation: { pitch: -10, yaw: 0, roll: 0 } });
      await aimAndPinch('reset-guitar');
      await wait(200);
      const s = await state('AirDrums');
      // 1.4 m eyes would put the snare at 0.645 m; the stands go no lower than 0.65 m.
      expectRange(s.snareHeight, 0.649, 0.651, 'snare height');
      const at = await frame.evaluate(() => {
        const o = window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName('AirDrums');
        return [Math.round(o.position.x * 100) / 100, Math.round(o.position.z * 100) / 100];
      });
      expectEq(at, [0.3, 0.1], 'kit position (x, z)');
      await dispatch('set_transform', { device: 'headset', position: { x: 0, y: 1.6, z: 0 }, orientation: { pitch: -10, yaw: 0, roll: 0 } });
      await aimAndPinch('reset-guitar');
      return `snare at ${s.snareHeight} m`;
    });

    await test('The panel Guitar button brings the guitar back', async () => {
      await aimAndPinch('instrument-guitar');
      expectEq(await showing(), [true, false, false], '[guitar, cymbals, drums] visible');
      return 'guitar out again';
    });

    await test('No console errors during the run', async () => {
      if (errors.length) throw new Error(errors.slice(0, 3).join(' | '));
      return '0 errors';
    });
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    await frame
      .evaluate(() => {
        window.IWER_DEVICE?.hands?.left?.setPin(null);
        window.IWER_DEVICE?.hands?.right?.setPin(null);
      })
      .catch(() => {});
    await dispatch('set_hand_pose', { device: 'hand-left', poseId: 'default' }).catch(() => {});
    await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'default' }).catch(() => {});
    await dispatch('end_session').catch(() => {});
  }

  const passed = results.filter((r) => r.pass).length;
  await banner(`${passed}/${results.length} passed`, passed === results.length ? '#3dff8f' : '#ff4d4f');
  const summary = { passed, failed: results.length - passed, total: results.length, results };
  await writeFile(path.join(outDir, 'drums-results.json'), JSON.stringify(summary, null, 2));
  return summary;
}
