/**
 * End-to-end test for the hand-played air triangle, run inside IWSDK's
 * managed Chromium with the IWER Quest 3 emulator in hand-tracking mode:
 *
 *   npx iwsdk dev up --allow-browser-automation
 *   npm run test:triangle
 *
 * The triangle is chosen on the panel with a hand-ray pinch. The left hand
 * pinches the clip and the right makes a fist round the beater; each is
 * held still once to learn where the app puts the clip and the beater
 * relative to the wrist, and from that the wrists are placed frame by frame
 * so the beater follows a scripted path against the triangle: struck hard
 * and soft, rolled in the top corner, rested on the bar, and the triangle
 * touched with the free fingers. Results and screenshots go to
 * test-results/.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { reloadApp } from './app-start.js';

/** Where the clip is held, in front of the player (m, world). */
const HANG = [-0.04, 1.36, -0.4];

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
  /** Which of the guitar, the left cymbal, the triangle and the beater are showing. */
  const showing = async () => Promise.all(['AirGuitar', 'AirCymbalLeft', 'AirTriangle', 'AirTriangleBeater'].map(visible));

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

  /**
   * Holds the clip at HANG (the left wrist turned by `leftQ`, its hand pose
   * `leftPose`) and moves the beater along `keys` ({ t, g grip, a along },
   * in triangle space), then holds the last key `after` seconds. Returns
   * what the app did.
   */
  const move = (keys, { after = 0.15, leftPose = 'pinch', leftQ = [0, 0, 0, 1] } = {}) =>
    frame.evaluate(
      async ([keys, o, HANG]) => {
        const world = window.FRAMEWORK_MCP_RUNTIME.world;
        const sys = Array.from(world.systems ?? []).find((s) => s?.instrument === 'triangle');
        const tri = sys.model.triangle;
        const V = (x = 0, y = 0, z = 0) => tri.position.clone().set(x, y, z);
        const M = () => tri.matrixWorld.clone().identity();
        const Q = () => tri.quaternion.clone().identity();
        const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
        const [left, right] = [window.IWER_DEVICE.hands.left, window.IWER_DEVICE.hands.right];
        const ref = { p: [0, 1.0, -0.5], q: [0, 0, 0, 1] };

        // Once per hand pose: hold the wrist still and see where the pinch and the beater are.
        window.__triPinch ??= {};
        if (!window.__triPinch[o.leftPose] || !window.__beaterInWrist) {
          left.setPin({ anchor: 'wrist', target: ref.p, wristRotation: ref.q });
          right.setPin({ anchor: 'wrist', target: [0.3, 1.0, -0.5], wristRotation: ref.q });
          for (let i = 0; i < 6; i++) await nextFrame();
          const j = sys.left.positions;
          window.__triPinch[o.leftPose] = [0, 1, 2].map((k) => (j[4 * 3 + k] + j[9 * 3 + k]) / 2 - ref.p[k]);
          const wrist = M().compose(V(0.3, 1.0, -0.5), Q(), V(1, 1, 1)).invert();
          window.__beaterInWrist = wrist.multiply(sys.model.beater.matrixWorld);
        }
        const pinch = V(...window.__triPinch[o.leftPose]);
        const leftRot = Q().set(...o.leftQ);
        const leftAt = V(...HANG).sub(pinch.clone().applyQuaternion(leftRot));
        const wristFromBeater = window.__beaterInWrist.clone().invert();

        const lerp = (a, b, u) => a.map((v, k) => v + (b[k] - v) * u);
        const at = (t) => {
          let i = 0;
          while (i < keys.length - 2 && t > keys[i + 1].t) i++;
          const [k0, k1] = [keys[i], keys[i + 1] ?? keys[i]];
          const u = k1.t > k0.t ? Math.min(1, Math.max(0, (t - k0.t) / (k1.t - k0.t))) : 1;
          return { g: lerp(k0.g, k1.g, u), a: lerp(k0.a, k1.a, u) };
        };
        const place = (key) => {
          left.setPin({ anchor: 'wrist', target: [leftAt.x, leftAt.y, leftAt.z], wristRotation: o.leftQ });
          tri.updateMatrixWorld(true);
          const g = V(...key.g).applyMatrix4(tri.matrixWorld);
          const X = V(...key.a).transformDirection(tri.matrixWorld);
          const Y = V(0, 1, 0).addScaledVector(X, -X.y);
          if (Y.lengthSq() < 1e-6) Y.set(1, 0, 0).addScaledVector(X, -X.x);
          Y.normalize();
          const Z = V().crossVectors(X, Y);
          const wrist = M().makeBasis(X, Y, Z).setPosition(g).multiply(wristFromBeater);
          const p = V();
          const q = Q();
          wrist.decompose(p, q, V());
          right.setPin({ anchor: 'wrist', target: [p.x, p.y, p.z], wristRotation: [q.x, q.y, q.z, q.w] });
        };

        const c = sys.component;
        const before = { strikes: sys.entity.getValue(c, 'strikes'), damps: sys.entity.getValue(c, 'damps') };
        const calls = [];
        const strike = sys.synth.strike;
        sys.synth.strike = function (sound, when) {
          calls.push({ loudness: Math.round(sound.loudness * 100) / 100, side: sys.strike.side, across: Math.round(sound.across * 100) / 100 });
          return strike.call(this, sound, when);
        };
        let peakRinging = 0;
        const end = keys.at(-1).t + o.after;
        const start = performance.now();
        try {
          for (;;) {
            const t = (performance.now() - start) / 1000;
            place(at(Math.min(t, keys.at(-1).t)));
            await nextFrame();
            peakRinging = Math.max(peakRinging, sys.synth.ringing());
            if (t >= end) break;
          }
          for (let i = 0; i < 3; i++) await nextFrame();
        } finally {
          sys.synth.strike = strike;
        }
        return {
          calls,
          strikes: sys.entity.getValue(c, 'strikes') - before.strikes,
          damps: sys.entity.getValue(c, 'damps') - before.damps,
          lastStrike: sys.entity.getValue(c, 'lastStrike'),
          lastSpeed: sys.entity.getValue(c, 'lastSpeed'),
          lastSide: sys.entity.getValue(c, 'lastSide'),
          peakRinging: Math.round(peakRinging * 100) / 100,
          ringing: Math.round(sys.synth.ringing() * 100) / 100,
        };
      },
      [keys, { after, leftPose, leftQ }, HANG],
    );

  // Triangle space (see src/triangle/geometry.ts): a point a third of the way up the
  // right side, the side's outward normal, and the inside of the top corner.
  const RIGHT = [0.06, -0.1489];
  const OUT = [0.866, 0.5];
  const ROLL_Y = -0.095;
  /** The beater across the right side, its middle on it, `z` in front of the face. */
  const across = (z) => ({ g: [RIGHT[0] + OUT[0] * 0.13, RIGHT[1] + OUT[1] * 0.13, z], a: [-OUT[0], -OUT[1], 0] });
  /** Keyframes for a strike into the face: settle, in at `speed`, `hold` there, back out. */
  const strikeKeys = (speed, { from = 0.08, to = -0.012, hold = 0, back = true } = {}) => {
    const settle = 0.25;
    const hit = settle + (from - to) / speed;
    const keys = [
      { t: 0, ...across(from) },
      { t: settle, ...across(from) },
      { t: hit, ...across(to) },
      { t: hit + hold, ...across(to) },
    ];
    if (back) keys.push({ t: hit + hold + 0.25, ...across(from) });
    return keys;
  };
  /** The beater pointing into the top corner from the front, `x` across, its grip `z` in front. */
  const corner = (x, z = 0.09) => ({ g: [x, ROLL_Y, z], a: [0, 0, -1] });
  /** A roll: side to side in the top corner, `hz` cycles a second, for `seconds`. */
  const rollKeys = (hz, seconds, width = 0.026) => {
    const keys = [
      { t: 0, ...across(0.3) },
      { t: 0.3, ...corner(0, 0.3) },
      { t: 0.6, ...corner(0) },
    ];
    for (let t = 0; t <= seconds; t += 0.005) keys.push({ t: 0.6 + t, ...corner(width * Math.sin(2 * Math.PI * hz * t)) });
    keys.push({ t: 0.6 + seconds + 0.1, ...corner(0) });
    return keys;
  };
  /** Back out of the corner, to rest in front of the right side. */
  const leaveCorner = () => [
    { t: 0, ...corner(0) },
    { t: 0.3, ...corner(0, 0.3) },
    { t: 0.6, ...across(0.3) },
    { t: 0.9, ...across(0.08) },
  ];
  /** Lets any ringing die: the beater laid on the bar (too slowly to sound), rested, then lifted off. */
  const quiet = () =>
    move(
      [
        { t: 0, ...across(0.08) },
        { t: 1.0, ...across(0.006) },
        { t: 1.3, ...across(0.006) },
        { t: 1.6, ...across(0.08) },
      ],
      { after: 0 },
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

  await reloadApp({ page, frame }, 'AirTriangle');
  await frame.evaluate(() => Array.from(window.FRAMEWORK_MCP_RUNTIME.world.systems).find((s) => s?.instrument === 'triangle')?.synth.warm);
  page.on('console', onConsole);
  page.on('pageerror', onPageError);

  try {
    await test('Entering XR shows the guitar, the triangle put away', async () => {
      await dispatch('accept_session');
      await frame.waitForFunction(() => window.FRAMEWORK_MCP_RUNTIME.world.renderer?.xr?.isPresenting, null, { timeout: 10000 });
      await dispatch('set_input_mode', { mode: 'hand' });
      await dispatch('set_transform', { device: 'headset', position: { x: 0, y: 1.6, z: 0 }, orientation: { pitch: -35, yaw: 15, roll: 0 } });
      await wait(300);
      expectEq(await showing(), [true, false, false, false], '[guitar, cymbal, triangle, beater] visible');
      return 'guitar out';
    });

    await test('The panel Triangle button swaps instruments: the clip pinched, the beater in the fist', async () => {
      await aimAndPinch('instrument-triangle');
      const tr = await state('AirTriangle');
      const gtr = await state('AirGuitar');
      expectEq([tr.active, gtr.active], [true, false], '[triangle, guitar] active');
      await dispatch('set_hand_pose', { device: 'hand-left', poseId: 'pinch' });
      await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'fist' });
      await dispatch('set_transform', { device: 'headset', position: { x: 0, y: 1.6, z: 0 }, orientation: { pitch: -22, yaw: 0, roll: 0 } });
      await move([{ t: 0, ...across(0.08) }, { t: 0.2, ...across(0.08) }]);
      expectEq(await showing(), [false, false, true, true], '[guitar, cymbal, triangle, beater] visible');
      const after = await state('AirTriangle');
      expectEq([after.leftHand, after.rightHand, after.touching], [true, true, false], '[left, right tracked, touching]');
      return 'triangle hanging, beater ready';
    });

    await test('A hard strike into the face rings fortissimo', async () => {
      const r = await move(strikeKeys(2.4), { after: 0.3 });
      expectEq(r.strikes, 1, 'strikes');
      expectEq(r.calls.length, 1, 'strikes sounded');
      expectRange(r.lastStrike, 0.85, 1, 'loudness');
      expectEq(r.lastSide, 'right side', 'side');
      expectRange(r.calls[0].across, 0.9, 1, 'square to the face');
      expectRange(r.ringing, 0.4, 1, 'ringing after');
      const file = await shot('triangle-01-strike');
      await quiet();
      return `${r.lastSpeed} m/s, loudness ${r.lastStrike}; ${file}`;
    });

    await test('A gentle strike is soft', async () => {
      const r = await move(strikeKeys(0.4), { after: 0.2 });
      expectEq(r.strikes, 1, 'strikes');
      expectRange(r.lastStrike, 0.05, 0.45, 'loudness');
      await quiet();
      return `${r.lastSpeed} m/s, loudness ${r.lastStrike}`;
    });

    await test('A roll in the top corner strikes side to side and keeps it ringing', async () => {
      const r = await move(rollKeys(7, 1), { after: 0 });
      if (r.strikes < 12) throw new Error(`only ${r.strikes} strikes`);
      const sides = r.calls.map((c) => c.side);
      const alternating = sides.every((s, i) => i === 0 || s !== sides[i - 1]);
      expectEq([alternating, new Set(sides).size], [true, 2], '[alternating, sides]');
      expectRange(r.ringing, 0.6, 1, 'ringing at the end');
      const file = await shot('triangle-02-roll');
      await move(leaveCorner(), { after: 0 });
      await quiet();
      return `${r.strikes} strikes, ringing ${r.ringing}; ${file}`;
    });

    await test('Resting the beater on the bar stops the ringing', async () => {
      const r = await move(strikeKeys(1.8, { to: 0.006, hold: 0.4, back: false }), { after: 0.1 });
      expectEq(r.strikes, 1, 'strikes');
      expectEq(r.damps, 1, 'damps');
      expectRange(r.ringing, 0, 0.02, 'ringing after');
      await move([{ t: 0, ...across(0.006) }, { t: 0.3, ...across(0.08) }], { after: 0 });
      return `peak ringing ${r.peakRinging}, then ${r.ringing}`;
    });

    await test("The holding hand's free fingers on the bar stop the ringing", async () => {
      // Find how to turn the hand so its free fingers lie on the bar, holding the clip in place.
      await dispatch('set_hand_pose', { device: 'hand-left', poseId: 'ok' });
      const grip = await frame.evaluate(async (HANG) => {
        const sys = Array.from(window.FRAMEWORK_MCP_RUNTIME.world.systems).find((s) => s?.instrument === 'triangle');
        const { DAMPING_JOINTS, touchesBar } = await import('/src/triangle/strike.ts');
        const tri = sys.model.triangle;
        const V = (x = 0, y = 0, z = 0) => tri.position.clone().set(x, y, z);
        const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
        const left = window.IWER_DEVICE.hands.left;
        const ref = [0, 1.0, -0.5];
        left.setPin({ anchor: 'wrist', target: ref, wristRotation: [0, 0, 0, 1] });
        for (let i = 0; i < 6; i++) await nextFrame();
        const j = sys.left.positions;
        const pinch = [0, 1, 2].map((k) => (j[4 * 3 + k] + j[9 * 3 + k]) / 2 - ref[k]);
        window.__triPinch.ok = pinch;
        const deg = Math.PI / 180;
        for (const pitch of [-90, -75, -60, -45, -30, 0, 30, 45, 60, 75, 90]) {
          for (const roll of [0, -30, 30, -60, 60, 90, -90]) {
            for (const yaw of [0, 30, -30, 60, -60]) {
              const q = tri.quaternion.clone().setFromEuler(tri.rotation.clone().set(pitch * deg, yaw * deg, roll * deg, 'YXZ'));
              const at = V(...HANG).sub(V(...pinch).applyQuaternion(q));
              left.setPin({ anchor: 'wrist', target: [at.x, at.y, at.z], wristRotation: [q.x, q.y, q.z, q.w] });
              for (let i = 0; i < 3; i++) await nextFrame();
              if (touchesBar(sys.fingers, DAMPING_JOINTS.length)) return { q: [q.x, q.y, q.z, q.w], pitch, yaw, roll };
            }
          }
        }
        return null;
      }, HANG);
      if (grip == null) throw new Error('no way to lay the free fingers on the bar while holding the clip');
      await dispatch('set_hand_pose', { device: 'hand-left', poseId: 'pinch' });
      const r = await move(strikeKeys(1.8), { after: 0.2 });
      expectEq(r.strikes, 1, 'strikes');
      await dispatch('set_hand_pose', { device: 'hand-left', poseId: 'ok' });
      const d = await move([{ t: 0, ...across(0.08) }, { t: 0.3, ...across(0.08) }], { leftPose: 'ok', leftQ: grip.q, after: 0.1 });
      expectEq(d.damps, 1, 'damps');
      expectRange(d.ringing, 0, 0.02, 'ringing after');
      const file = await shot('triangle-03-fingers');
      await dispatch('set_hand_pose', { device: 'hand-left', poseId: 'pinch' });
      await move([{ t: 0, ...across(0.08) }, { t: 0.2, ...across(0.08) }], { after: 0 });
      return `ringing ${r.ringing} until the fingers touched (hand turned ${grip.pitch}/${grip.yaw}/${grip.roll} deg); ${file}`;
    });

    await test('The panel Guitar button brings the guitar back', async () => {
      await aimAndPinch('instrument-guitar');
      expectEq(await showing(), [true, false, false, false], '[guitar, cymbal, triangle, beater] visible');
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
  await writeFile(path.join(outDir, 'triangle-results.json'), JSON.stringify(summary, null, 2));
  return summary;
}
