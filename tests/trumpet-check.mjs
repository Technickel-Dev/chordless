/**
 * Plays the air trumpet with IWER's emulated hands and checks each control:
 * the horn meeting the lips, the valves under the right fingers, the bell's
 * tilt choosing the partial, the left pinch tonguing and blowing, and the
 * left hand over the bell muting. Each hand's wrist is pinned so that a
 * chosen joint lands where the scenario needs it. A caption names each
 * step; E2E_PACE=3 holds each one long enough to watch.
 *
 *   npx iwsdk dev up --allow-browser-automation
 *   npm run check:trumpet
 */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { startApp } from './app-start.js';

export default async function run({ page, frame, workspaceRoot }) {
  await startApp({ page, frame }, { root: 'AirTrumpet', view: { pitch: 0, yaw: 0, roll: 0 } });
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

  // Take the trumpet out: aim the right hand's ray at the panel button and pinch.
  await pose('hand-right', 'default');
  const target = await frame.evaluate(() => {
    const o = window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName('instrument-trumpet');
    if (!o) return null;
    const v = o.getWorldPosition(o.position.clone());
    return { x: v.x, y: v.y, z: v.z };
  });
  if (target == null) throw new Error('no Trumpet button on the panel');
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
  const guitarOut = await frame.evaluate(() => window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName('AirGuitar')?.visible ?? null);

  /**
   * Pins the hands so the right middle knuckle is HOLD_REACH + `reach` from
   * the lips at `elevation` degrees, and the left hand's pinch (thumb tip)
   * at `pinchAt` or its palm `palmInFront` metres in front of the bell.
   * Holds a few frames and returns what the app reads.
   */
  const measure = (s) =>
    frame.evaluate(async (s) => {
      const world = window.FRAMEWORK_MCP_RUNTIME.world;
      const sys = Array.from(world.systems).find((x) => x?.instrument === 'trumpet');
      const { HOLD_REACH, toWorld } = await import('/src/trumpet/hold.ts');
      const { BELL } = await import('/src/trumpet/geometry.ts');
      const frames = (n) => new Promise((r) => { const step = () => (n-- <= 0 ? r() : requestAnimationFrame(step)); step(); });
      const [left, right] = [window.IWER_DEVICE.hands.left, window.IWER_DEVICE.hands.right];
      const q = [0, 0, 0, 1];
      // Where a joint sits relative to its pinned wrist, in this hand pose.
      const cache = (window.__trumpetOffsets ??= {});
      const offset = async (hand, i, joint) => {
        const key = `${i}-${joint}-${s.poses[i === 0 ? 'hand-left' : 'hand-right']}`;
        if (cache[key]) return cache[key];
        hand.setPin({ anchor: 'wrist', target: [0, 1, -0.5], wristRotation: q });
        await frames(4);
        const p = sys.hands[i].positions;
        return (cache[key] = [p[joint * 3], p[joint * 3 + 1] - 1, p[joint * 3 + 2] + 0.5]);
      };
      const pinAt = (hand, off, at) => hand.setPin({ anchor: 'wrist', target: [at[0] - off[0], at[1] - off[1], at[2] - off[2]], wristRotation: q });

      const knuckleOff = await offset(right, 1, 11);
      const thumbOff = await offset(left, 0, 4);
      const el = (s.elevation * Math.PI) / 180;
      const r = HOLD_REACH + (s.reach ?? 0);
      const lips = sys.lips;
      const knuckle = [lips[0] + 0.05, lips[1] + Math.sin(el) * r, lips[2] - Math.cos(el) * r];
      pinAt(right, knuckleOff, knuckle);
      pinAt(left, thumbOff, [-0.25, 1.2, -0.3]);
      await frames(6);
      if (s.palmInFront != null) {
        const palmOff = await offset(left, 0, 0).then(async (w) => {
          const k = await offset(left, 0, 11);
          return w.map((v, i) => (v + k[i]) / 2);
        });
        const bell = toWorld(sys.pose, BELL, [0, 0, 0]);
        const at = bell.map((v, i) => v - sys.pose.z[i] * s.palmInFront);
        pinAt(left, palmOff, at);
      }
      await frames(10);
      const v = (f) => sys.entity.getValue(sys.component, f);
      return {
        atLips: v('atLips'), elevation: v('elevation'), partial: v('partial'), valves: v('valves'), written: v('written'),
        bends: Array.from(sys.valves.bend, (b) => Math.round(b)), air: v('air'), sounding: v('sounding'),
        notes: v('notes'), mute: v('mute'), level: Math.round(sys.synth.sounding * 100) / 100, visible: sys.model.trumpet.visible,
      };
    }, s);
  /** Shows `caption`, plays `s`, and shows what the trumpet did. */
  const play = async (s, caption) => {
    await banner(caption);
    const r = await measure({ ...s, poses });
    const heard = r.sounding ? `sounding ${r.written}` : r.atLips ? `${r.written} ready` : 'not at the lips';
    await banner(`${caption}: ${heard} · valves ${r.valves} · partial ${r.partial}${r.mute > 0.3 ? ' · muted' : ''}`, r.sounding ? '#3dff8f' : '#8a8f99');
    await wait(pace > 1 ? 600 * pace : 0);
    return r;
  };

  // Look down along the horn, a little to the right, where it is held.
  await dispatch('set_transform', { device: 'headset', orientation: { pitch: -30, yaw: -10, roll: 0 } });
  const results = {};
  results.panelButton = button;
  results.guitarOut = guitarOut;
  await pose('hand-right', 'default');
  await pose('hand-left', 'default');
  results.outOfReach = await play({ elevation: -10, reach: 0.25 }, 'Horn held too far out');
  results.atLipsIdle = await play({ elevation: -10 }, 'Mouthpiece to the lips');
  results.tilt = [];
  for (let e = -40; e <= 70; e += 10) {
    const r = await play({ elevation: e }, `Hand tilted ${e} degrees`);
    results.tilt.push([e, r.elevation, r.partial, r.written]);
  }
  for (const id of ['default', 'point', 'fist']) {
    await pose('hand-right', id);
    results[`right_${id}`] = await play({ elevation: 0 }, `Right hand ${id === 'default' ? 'relaxed' : id}`);
  }
  await pose('hand-right', 'default');
  await pose('hand-left', 'pinch');
  results.blowing = await play({ elevation: 0 }, 'Left hand pinches: blow');
  results.blowingAwayFromLips = await play({ elevation: 0, reach: 0.3 }, 'Pinching away from the lips');
  results.reTongued = await play({ elevation: 0 }, 'Back to the lips: a new note');
  results.plunger = await play({ elevation: 0, palmInFront: 0.02 }, 'Left hand over the bell: plunger');
  results.plungerOff = await play({ elevation: 0 }, 'Plunger off');
  await pose('hand-left', 'default');
  results.released = await play({ elevation: 0 }, 'Pinch released');

  // A picture of the horn at the lips, valves 2-3 down, looking down along it.
  await pose('hand-right', 'point');
  await dispatch('set_transform', { device: 'headset', orientation: { pitch: -35, yaw: -12, roll: 0 } });
  await play({ elevation: 10 }, 'Valves 2-3, bell up');
  const outDir = path.join(workspaceRoot, 'test-results');
  await mkdir(outDir, { recursive: true });
  await (await frame.frameElement()).screenshot({ path: path.join(outDir, 'trumpet.png') });
  results.screenshot = 'test-results/trumpet.png';
  await frame.evaluate(() => {
    window.IWER_DEVICE.hands.left.setPin(null);
    window.IWER_DEVICE.hands.right.setPin(null);
  });
  return results;
}
