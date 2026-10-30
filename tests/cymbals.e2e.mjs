/**
 * End-to-end test for the hand-played air cymbals, run inside IWSDK's
 * managed Chromium with the IWER Quest 3 emulator in hand-tracking mode:
 *
 *   npx iwsdk dev up --allow-browser-automation
 *   npm run test:cymbals
 *
 * The cymbals are chosen on the panel with a hand-ray pinch. Both hands make
 * a fist; each hand is held still once to learn where the app puts its
 * cymbal relative to the wrist, and from that the wrists are placed frame by
 * frame so the plates follow a scripted path: brought together at a chosen
 * speed, held, parted, or pressed to the chest. Results and screenshots go
 * to test-results/.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { reloadApp } from './app-start.js';

/** Where the plates meet, in front of the player (m, world). */
const MEET = [0, 1.22, -0.42];

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
  /** Which of the guitar, the violin, the cello and the two cymbals are showing. */
  const showing = async () =>
    Promise.all(['AirGuitar', 'AirViolin', 'AirCello', 'AirCymbalLeft', 'AirCymbalRight'].map(visible));

  /** Points the right hand's ray at a panel button and pinches. */
  const aimAndPinch = async (id) => {
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

  /** Both cymbals facing each other across X at `MEET`, rims `gap` apart, the right one `lift` higher. */
  const pairAt = (gap, lift = 0.04) => {
    const half = (gap + 0.0013) / 2;
    return {
      left: { c: [MEET[0] - half, MEET[1], MEET[2]], n: [1, 0, 0], a: [0, 1, 0] },
      right: { c: [MEET[0] + half, MEET[1] + lift, MEET[2]], n: [-1, 0, 0], a: [0, 1, 0] },
    };
  };
  /**
   * Keyframes for a clash: settle `from` apart, close at `speed` m/s to
   * `to`, hold `hold` seconds, then part back out.
   */
  const clashKeys = (speed, { from = 0.25, to = -0.003, hold = 0.05, lift = 0.04, part = true } = {}) => {
    const settle = 0.25;
    const meet = settle + (from - to) / speed;
    const keys = [
      { t: 0, ...pairAt(from, lift) },
      { t: settle, ...pairAt(from, lift) },
      { t: meet, ...pairAt(to, lift) },
      { t: meet + hold, ...pairAt(to, lift) },
    ];
    if (part) keys.push({ t: meet + hold + 0.25, ...pairAt(from, lift) });
    return keys;
  };

  /**
   * Moves both fists so the cymbals follow `keys` ({ t, left, right }, each
   * cymbal { c centre, n face normal, a across the strap }), then holds the
   * last key `after` seconds. Returns what the app did.
   */
  const move = (keys, after = 0.15) =>
    frame.evaluate(
      async ([keys, after]) => {
        const world = window.FRAMEWORK_MCP_RUNTIME.world;
        const sys = Array.from(world.systems ?? []).find((s) => s?.instrument === 'cymbals');
        const sample = sys.model.cymbals[0];
        const V = (x = 0, y = 0, z = 0) => sample.position.clone().set(x, y, z);
        const M = () => sample.matrixWorld.clone().identity();
        const Q = () => sample.quaternion.clone().identity();
        const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
        const hands = [window.IWER_DEVICE.hands.left, window.IWER_DEVICE.hands.right];
        const frameOf = ({ c, n, a }) => {
          const Z = V(...n).normalize();
          const X = V(...a).addScaledVector(Z, -V(...a).dot(Z)).normalize();
          const Y = V().crossVectors(Z, X);
          return M().makeBasis(X, Y, Z).setPosition(V(...c));
        };

        // Once: hold each fist still and see where the app puts its cymbal.
        if (!window.__cymbalInWrist) {
          const ref = { p: [0, 1.0, -0.5], q: [0, 0, 0, 1] };
          for (const hand of hands) hand.setPin({ anchor: 'wrist', target: ref.p, wristRotation: ref.q });
          for (let i = 0; i < 6; i++) await nextFrame();
          const wrist = M().compose(V(...ref.p), Q().set(...ref.q), V(1, 1, 1)).invert();
          window.__cymbalInWrist = sys.model.cymbals.map((c) => wrist.clone().multiply(c.matrixWorld));
        }
        const wristOf = window.__cymbalInWrist.map((m) => m.clone().invert());
        const place = (key) => {
          ['left', 'right'].forEach((side, i) => {
            const wrist = frameOf(key[side]).multiply(wristOf[i]);
            const p = V();
            const q = Q();
            wrist.decompose(p, q, V());
            hands[i].setPin({ anchor: 'wrist', target: [p.x, p.y, p.z], wristRotation: [q.x, q.y, q.z, q.w] });
          });
        };
        const lerp = (a, b, u) => a.map((v, k) => v + (b[k] - v) * u);
        const at = (t) => {
          let i = 0;
          while (i < keys.length - 2 && t > keys[i + 1].t) i++;
          const [k0, k1] = [keys[i], keys[i + 1] ?? keys[i]];
          const u = k1.t > k0.t ? Math.min(1, Math.max(0, (t - k0.t) / (k1.t - k0.t))) : 1;
          const mix = (side) => ({ c: lerp(k0[side].c, k1[side].c, u), n: lerp(k0[side].n, k1[side].n, u), a: lerp(k0[side].a, k1[side].a, u) });
          return { left: mix('left'), right: mix('right') };
        };

        const c = sys.component;
        const before = { clashes: sys.entity.getValue(c, 'clashes'), damps: sys.entity.getValue(c, 'damps') };
        const calls = [];
        const clash = sys.synth.clash;
        sys.synth.clash = function (sound, when) {
          calls.push({ loudness: Math.round(sound.loudness * 100) / 100, flush: sound.flush });
          return clash.call(this, sound, when);
        };
        let peakRinging = 0;
        let minGap = 1;
        let touched = false;
        const end = keys.at(-1).t + after;
        const start = performance.now();
        try {
          for (;;) {
            const t = (performance.now() - start) / 1000;
            place(at(Math.min(t, keys.at(-1).t)));
            await nextFrame();
            peakRinging = Math.max(peakRinging, sys.synth.ringing());
            minGap = Math.min(minGap, sys.clash.gap);
            touched ||= sys.clash.touching;
            if (t >= end) break;
          }
          for (let i = 0; i < 3; i++) await nextFrame();
        } finally {
          sys.synth.clash = clash;
        }
        return {
          calls,
          clashes: sys.entity.getValue(c, 'clashes') - before.clashes,
          damps: sys.entity.getValue(c, 'damps') - before.damps,
          lastClash: sys.entity.getValue(c, 'lastClash'),
          lastSpeed: sys.entity.getValue(c, 'lastSpeed'),
          peakRinging: Math.round(peakRinging * 100) / 100,
          ringing: Math.round(sys.synth.ringing() * 100) / 100,
          minGap: Math.round(minGap * 1000) / 1000,
          touched,
        };
      },
      [keys, after],
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
  /** Lets any ringing die (the plates laid together), then opens them again. */
  const silence = async () => {
    await move(clashKeys(0.05, { from: 0.01, hold: 0.3, part: false }), 0);
    await move([{ t: 0, ...pairAt(-0.003) }, { t: 0.3, ...pairAt(0.25) }], 0);
  };

  await reloadApp({ page, frame }, 'AirCymbalLeft');
  await frame.evaluate(() => Array.from(window.FRAMEWORK_MCP_RUNTIME.world.systems).find((s) => s?.instrument === 'cymbals')?.synth.warm);
  page.on('console', onConsole);
  page.on('pageerror', onPageError);

  try {
    await test('Entering XR shows the guitar, the cymbals put away', async () => {
      await dispatch('accept_session');
      await frame.waitForFunction(() => window.FRAMEWORK_MCP_RUNTIME.world.renderer?.xr?.isPresenting, null, { timeout: 10000 });
      await dispatch('set_input_mode', { mode: 'hand' });
      await dispatch('set_transform', { device: 'headset', position: { x: 0, y: 1.6, z: 0 }, orientation: { pitch: -35, yaw: 15, roll: 0 } });
      await wait(300);
      expectEq(await showing(), [true, false, false, false, false], '[guitar, violin, cello, left cymbal, right cymbal] visible');
      return 'guitar out';
    });

    await test('The panel Cymbals button swaps instruments: a cymbal in each fist', async () => {
      await aimAndPinch('instrument-cymbals');
      const cy = await state('AirCymbals');
      const gtr = await state('AirGuitar');
      expectEq([cy.active, gtr.active], [true, false], '[cymbals, guitar] active');
      await dispatch('set_hand_pose', { device: 'hand-left', poseId: 'fist' });
      await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'fist' });
      await dispatch('set_transform', { device: 'headset', position: { x: 0, y: 1.6, z: 0 }, orientation: { pitch: -25, yaw: 0, roll: 0 } });
      await move([{ t: 0, ...pairAt(0.25) }, { t: 0.2, ...pairAt(0.25) }]);
      expectEq(await showing(), [false, false, false, true, true], '[guitar, violin, cello, left cymbal, right cymbal] visible');
      const after = await state('AirCymbals');
      expectEq([after.leftHand, after.rightHand], [true, true], '[left, right] hands tracked');
      expectRange(after.gap, 0.23, 0.27, 'gap');
      return `gap ${after.gap} m`;
    });

    await test('A fast clash rings fortissimo', async () => {
      const r = await move(clashKeys(2.4), 0.3);
      expectEq(r.clashes, 1, 'clashes');
      expectEq(r.calls.length, 1, 'clashes sounded');
      expectRange(r.lastClash, 0.85, 1, 'loudness');
      expectRange(r.ringing, 0.4, 1, 'ringing after');
      expectEq(r.calls[0].flush, false, 'flush');
      const file = await shot('cymbals-01-clash');
      await silence();
      return `${r.lastSpeed} m/s, loudness ${r.lastClash}; ${file}`;
    });

    await test('A slow clash is soft', async () => {
      const r = await move(clashKeys(0.45), 0.2);
      expectEq(r.clashes, 1, 'clashes');
      expectRange(r.lastClash, 0.05, 0.45, 'loudness');
      await silence();
      return `${r.lastSpeed} m/s, loudness ${r.lastClash}`;
    });

    await test('Plates that meet flat and centred clash muffled (an air pocket)', async () => {
      const r = await move(clashKeys(1.5, { lift: 0 }), 0.2);
      expectEq(r.calls.map((c) => c.flush), [true], 'flush');
      await silence();
      return `loudness ${r.lastClash}`;
    });

    await test('Plates passing edge-on, not face to face, make no sound', async () => {
      const edge = (x) => ({
        left: { c: [MEET[0] - x, MEET[1], MEET[2]], n: [0, 0, 1], a: [0, 1, 0] },
        right: { c: [MEET[0] + x, MEET[1] + 0.04, MEET[2]], n: [0, 0, 1], a: [0, 1, 0] },
      });
      const r = await move([{ t: 0, ...edge(0.3) }, { t: 0.25, ...edge(0.3) }, { t: 0.45, ...edge(0) }, { t: 0.7, ...edge(0.3) }]);
      expectEq([r.clashes, r.calls.length], [0, 0], '[clashes, sounded]');
      await move([{ t: 0, ...edge(0.3) }, { t: 0.3, ...pairAt(0.25) }], 0);
      return 'silent';
    });

    await test('Held together after a clash, the plates stop ringing (secco)', async () => {
      const r = await move(clashKeys(1.6, { hold: 0.45, part: false }), 0.1);
      expectEq(r.clashes, 1, 'clashes');
      expectEq(r.damps, 1, 'damps');
      expectRange(r.ringing, 0, 0.02, 'ringing after');
      await move([{ t: 0, ...pairAt(-0.003) }, { t: 0.3, ...pairAt(0.25) }], 0);
      return `peak ringing ${r.peakRinging}, then ${r.ringing}`;
    });

    await test('Pressed to the chest, a ringing cymbal stops', async () => {
      const r = await move(clashKeys(1.8), 0.2);
      expectEq(r.clashes, 1, 'clashes');
      const open = pairAt(0.25);
      // The face against the chest, the hand outside it.
      const chest = { ...open, left: { c: [-0.02, 1.2, -0.03], n: [0, 0, 1], a: [0, 1, 0] } };
      const d = await move([{ t: 0, ...open }, { t: 0.3, ...chest }, { t: 0.6, ...chest }], 0.1);
      expectEq(d.damps, 1, 'damps');
      expectRange(d.ringing, 0, 0.02, 'ringing after');
      await move([{ t: 0, ...chest }, { t: 0.3, ...open }], 0);
      return `ringing ${r.ringing} until pressed to the chest`;
    });

    await test('The panel Guitar button brings the guitar back', async () => {
      await aimAndPinch('instrument-guitar');
      expectEq(await showing(), [true, false, false, false, false], '[guitar, violin, cello, left cymbal, right cymbal] visible');
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
  await writeFile(path.join(outDir, 'cymbals-results.json'), JSON.stringify(summary, null, 2));
  return summary;
}
