/**
 * Plays the air trombone with IWER's emulated hands and checks each
 * control: the panel button, the horn meeting the lips, its tilt choosing
 * the partial, the right fingertips moving the slide through the seven
 * positions (and leaving it where it is when they let go), and the left
 * pinch tonguing and blowing. Each hand's wrist is pinned so that a chosen
 * joint lands where the scenario needs it. A caption names each step;
 * E2E_PACE=3 holds each one long enough to watch.
 *
 *   npx iwsdk dev up --allow-browser-automation
 *   npm run check:trombone
 */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { screenshotApp, startApp } from './app-start.js';

export default async function run({ page, frame, workspaceRoot }) {
  await startApp({ page, frame }, { root: 'AirTrombone', view: { pitch: 0, yaw: 0, roll: 0 } });
  const dispatch = (method, params = {}) =>
    frame.evaluate(([m, p]) => window.IWER_MCP.dispatch(m, p), [method, params]);
  /** The hand poses in use, so each pose's joint offsets are measured only once. */
  const poses = { 'hand-left': 'default', 'hand-right': 'default' };
  const pose = (device, poseId) => {
    poses[device] = poseId;
    return dispatch('set_hand_pose', { device, poseId });
  };
  const pace = Math.max(1, Number(process.env.E2E_PACE) || 1);
  const banner = (text, color = '#ffb000') =>
    frame
      .evaluate(
        ([t, c]) => {
          let el = document.getElementById('e2e-banner');
          if (!el) {
            el = document.createElement('div');
            el.id = 'e2e-banner';
            el.style.cssText =
              'position:fixed;left:16px;top:16px;z-index:99999;padding:10px 16px;border-radius:10px;max-width:70%;' +
              'font:600 18px system-ui,sans-serif;color:#fff;background:rgba(20,20,24,.85);pointer-events:none;';
            document.body.appendChild(el);
          }
          el.style.borderLeft = `6px solid ${c}`;
          el.textContent = t;
        },
        [text, color],
      )
      .catch(() => {});
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // Take the trombone out: aim the right hand's ray at the panel button and pinch.
  await pose('hand-right', 'default');
  const target = await frame.evaluate(() => {
    const o = window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName('instrument-trombone');
    if (!o) return null;
    const v = o.getWorldPosition(o.position.clone());
    return { x: v.x, y: v.y, z: v.z };
  });
  if (target == null) throw new Error('no Trombone button on the panel');
  await dispatch('set_transform', { device: 'hand-right', position: { x: 0.3, y: 1.3, z: -0.4 } });
  await dispatch('look_at', { device: 'hand-right', target });
  await wait(200);
  await dispatch('select', { device: 'hand-right', duration: 0.15 });
  await wait(400);
  const button = await frame.evaluate(() =>
    Array.from(window.FRAMEWORK_MCP_RUNTIME.world.systems)
      .filter((s) => s?.instrument && s.entity && s.component)
      .map((s) => [s.instrument, s.entity.getValue(s.component, 'active')]),
  );

  /**
   * Pins the left middle knuckle HOLD_REACH + `reach` from the lips at
   * `elevation` degrees, then the right fingertips (between the thumb and
   * index tips) on the slide brace `slide` metres out, or off to the side
   * if `slide` is null. Holds a few frames and returns what the app reads.
   */
  const measure = (s) =>
    frame.evaluate(async (s) => {
      const world = window.FRAMEWORK_MCP_RUNTIME.world;
      const sys = Array.from(world.systems).find((x) => x?.instrument === 'trombone');
      const { HOLD_REACH, toWorld } = await import('/src/trombone/hold.ts');
      const { BRACE } = await import('/src/trombone/geometry.ts');
      const frames = (n) => new Promise((r) => { const step = () => (n-- <= 0 ? r() : requestAnimationFrame(step)); step(); });
      const [left, right] = [window.IWER_DEVICE.hands.left, window.IWER_DEVICE.hands.right];
      const q = [0, 0, 0, 1];
      // Where joints sit relative to their pinned wrist, in this hand pose (averaged if several).
      const cache = (window.__tromboneOffsets ??= {});
      const offset = async (hand, i, joints) => {
        const key = `${i}-${joints}-${s.poses[i === 0 ? 'hand-left' : 'hand-right']}`;
        if (cache[key]) return cache[key];
        hand.setPin({ anchor: 'wrist', target: [0, 1, -0.5], wristRotation: q });
        await frames(4);
        const p = sys.hands[i].positions;
        const at = [0, 1, 2].map((k) => joints.reduce((a, j) => a + p[j * 3 + k], 0) / joints.length);
        return (cache[key] = [at[0], at[1] - 1, at[2] + 0.5]);
      };
      const pinAt = (hand, off, at) => hand.setPin({ anchor: 'wrist', target: [at[0] - off[0], at[1] - off[1], at[2] - off[2]], wristRotation: q });

      const knuckleOff = await offset(left, 0, [11]);
      const gripOff = await offset(right, 1, [4, 9]);
      const el = (s.elevation * Math.PI) / 180;
      const r = HOLD_REACH + (s.reach ?? 0);
      const lips = sys.lips;
      pinAt(left, knuckleOff, [lips[0] - 0.04, lips[1] + Math.sin(el) * r, lips[2] - Math.cos(el) * r]);
      await frames(6);
      if (s.slide == null) pinAt(right, gripOff, [0.4, 1.0, -0.2]);
      else pinAt(right, gripOff, toWorld(sys.pose, [BRACE[0], BRACE[1], BRACE[2] - s.slide], [0, 0, 0]));
      await frames(10);
      const v = (f) => sys.entity.getValue(sys.component, f);
      return {
        atLips: v('atLips'), elevation: v('elevation'), partial: v('partial'), note: v('note'), cents: v('cents'),
        slide: v('slide'), position: v('position'), holding: v('holdingSlide'), air: v('air'), sounding: v('sounding'),
        notes: v('notes'), level: Math.round(sys.synth.sounding * 100) / 100, visible: sys.model.trombone.visible,
        slideZ: Math.round(sys.model.slide.position.z * 1000) / 1000,
      };
    }, s);
  /** Shows `caption`, plays `s`, and shows what the trombone did. */
  const play = async (s, caption) => {
    await banner(caption);
    const r = await measure({ ...s, poses });
    const heard = r.sounding ? `sounding ${r.note}` : r.atLips ? `${r.note} ready` : 'not at the lips';
    await banner(`${caption}: ${heard} · position ${r.position} · partial ${r.partial}`, r.sounding ? '#3dff8f' : '#8a8f99');
    await wait(pace > 1 ? 600 * pace : 0);
    return r;
  };

  // Look ahead and a little down along the slide.
  await dispatch('set_transform', { device: 'headset', orientation: { pitch: -15, yaw: 0, roll: 0 } });
  const results = { panelButton: button };
  await pose('hand-right', 'default');
  await pose('hand-left', 'default');
  results.outOfReach = await play({ elevation: 0, reach: 0.25, slide: 0 }, 'Horn held too far out');
  results.atLipsIdle = await play({ elevation: 0, slide: 0 }, 'Mouthpiece to the lips');
  results.tilt = [];
  for (let e = -40; e <= 40; e += 10) {
    const r = await play({ elevation: e, slide: 0 }, `Tilted ${e} degrees`);
    results.tilt.push([e, r.elevation, r.partial, r.note]);
  }
  results.positions = [];
  for (let n = 1; n <= 7; n++) {
    const out = await frame.evaluate(async (n) => (await import('/src/trombone/playing.ts')).slideFor(n - 1), n);
    const r = await play({ elevation: -8, slide: out }, `Slide to position ${n}`);
    results.positions.push([n, r.position, r.note, r.cents, r.holding, r.slideZ]);
  }
  results.letGo = await play({ elevation: -8, slide: null }, 'Right hand off the brace: the slide stays');
  results.backToFirst = await play({ elevation: -8, slide: 0 }, 'Slide back to first');
  await pose('hand-left', 'pinch');
  results.blowing = await play({ elevation: -8, slide: 0 }, 'Left hand pinches: blow');
  results.glide = await play({ elevation: -8, slide: 0.1 }, 'Slide out while blowing');
  results.blowingAwayFromLips = await play({ elevation: -8, reach: 0.3, slide: 0 }, 'Pinching away from the lips');
  results.reTongued = await play({ elevation: -8, slide: 0 }, 'Back to the lips: a new note');
  await pose('hand-left', 'default');
  results.released = await play({ elevation: -8, slide: 0 }, 'Pinch released');

  // A picture of the trombone at the lips, the slide in fourth position.
  await dispatch('set_transform', { device: 'headset', orientation: { pitch: -20, yaw: 8, roll: 0 } });
  const fourth = await frame.evaluate(async () => (await import('/src/trombone/playing.ts')).slideFor(3));
  await play({ elevation: -5, slide: fourth }, 'Fourth position');
  const outDir = path.join(workspaceRoot, 'test-results');
  await mkdir(outDir, { recursive: true });
  await screenshotApp({ page, frame }, { path: path.join(outDir, 'trombone.png') });
  results.screenshot = 'test-results/trombone.png';
  await frame.evaluate(() => {
    window.IWER_DEVICE.hands.left.setPin(null);
    window.IWER_DEVICE.hands.right.setPin(null);
  });
  return results;
}
