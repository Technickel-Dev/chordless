/**
 * The unbroken take in the theatre, for video/build.mjs:
 * Ode to Joy for its first phrase, a wrong note, a short fury, the guitar
 * smashed in real overhead swings, then the player opens the menu, picks the
 * trumpet, and plays the trailer's William Tell (video/score.mjs) on it.
 * Recorded in the page (canvas capture); its marks and the performers' clock
 * logs go into meltdown.json.
 */
import { startApp } from '../../tests/app-start.js';
import { trailerPart, firstBeat, PARTS } from '../score.mjs';
import { chooseAndFold } from './clips.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** The camera for the smash: a step behind the player, a little above, looking out over the swing. */
export const SWING_VIEW = { position: { x: 0, y: 1.7, z: 0.5 }, orientation: { pitch: -30, yaw: 0, roll: 0 } };

/** What the hand and guitar do: grab, tremble, swing. Shared by the full take and the swing test. */
export function rig({ frame, mark }) {
  const dispatch = (method, params = {}) => frame.evaluate(([m, p]) => window.IWER_MCP.dispatch(m, p), [method, params]);
  const guitar = async () => {
    const found = await dispatch('ecs_find_entities', { withComponents: ['AirGuitar'] });
    const q = await dispatch('ecs_query_entity', { entityIndex: found.entities[0].entityIndex });
    return q.components.find((c) => c.componentId === 'AirGuitar').values;
  };
  const neckPoint = (x) =>
    frame.evaluate((px) => {
      const root = window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName('AirGuitar');
      root.updateMatrixWorld(true);
      const e = root.matrixWorld.elements;
      const [lx, ly, lz] = [px, 0, -0.01];
      return { x: e[0] * lx + e[4] * ly + e[8] * lz + e[12], y: e[1] * lx + e[5] * ly + e[9] * lz + e[13], z: e[2] * lx + e[6] * ly + e[10] * lz + e[14] };
    }, x);
  const lowest = () =>
    frame.evaluate(() => {
      const object = window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName('AirGuitar');
      object.updateMatrixWorld(true);
      let min = Infinity;
      object.traverseVisible((o) => {
        if (!o.isMesh || o.userData.scar) return;
        const pos = o.geometry.attributes.position;
        const e = o.matrixWorld.elements;
        for (let k = 0; k < pos.count; k++) min = Math.min(min, e[1] * pos.getX(k) + e[5] * pos.getY(k) + e[9] * pos.getZ(k) + e[13]);
      });
      return min;
    });
  const hand = { x: 0, y: 0, z: 0, yaw: 0, roll: 0 };
  const put = (p, yaw, roll) => {
    Object.assign(hand, p, { yaw, roll });
    return dispatch('set_transform', { device: 'hand-right', position: { x: hand.x, y: hand.y, z: hand.z }, anchor: 'wrist', orientation: { pitch: 0, yaw, roll } });
  };
  const lerp = (a, b, s) => a + (b - a) * s;
  const smooth = (s) => s * s * (3 - 2 * s);
  /** Moves the fist from where it is to a pose over `ms`. */
  const tween = async (to, ms, ease = smooth) => {
    const from = { ...hand };
    const t0 = Date.now();
    for (;;) {
      const s = Math.min(1, (Date.now() - t0) / ms);
      const e = ease(s);
      await put({ x: lerp(from.x, to.x, e), y: lerp(from.y, to.y, e), z: lerp(from.z, to.z, e) }, lerp(from.yaw, to.yaw, e), lerp(from.roll, to.roll, e));
      if (s >= 1) break;
    }
  };

  /** Fists round the neck; the right hand takes the guitar up. */
  const grab = async () => {
    await dispatch('set_hand_pose', { device: 'hand-left', poseId: 'fist' });
    await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'fist' });
    const neck = await neckPoint(0.42);
    Object.assign(hand, neck, { yaw: 0, roll: 0 });
    await put(neck, 0, 0);
    await wait(350);
    await mark('grip', { hold: (await guitar()).hold });
    return neck;
  };
  /** A shaking fist for `ms`, a tremor that grows. */
  const tremble = async (at, ms) => {
    const t0 = Date.now();
    for (let i = 0; Date.now() - t0 < ms; i++) {
      const j = 0.008 + 0.03 * ((Date.now() - t0) / ms);
      await put({ x: at.x + (i % 2 ? j : -j), y: at.y + (i % 3 ? j / 2 : -j / 2), z: at.z }, 0, 0);
      await wait(35);
    }
  };
  /** Where the fist is at the top of the wind-up: raised high over the head, the guitar back behind it. */
  const WIND = { x: 0.08, y: 2.0, z: -0.04, yaw: 20, roll: 150 };
  /** The shoulder the arm swings round, how long the arm is, and where the fist ends up, out in front and low. */
  const SHOULDER = { x: 0.1, y: 1.5, z: -0.1 };
  const ARM = 0.5;
  const FLOOR_FRONT = { x: 0.05, z: -0.5 };
  /**
   * One overhead smash: the guitar wound up high behind the head, then swung over and down
   * in a fast arc round the shoulder, the wrist whipping it through, to put its lowest point
   * through the floor. A full swing breaks a guitar in one. Given `hit` (m/s), the arc stops a
   * hand's breadth short of the floor, and the guitar is driven the rest of the way a step per
   * rendered frame at that speed (a frame or two, too quick to see), so the blow lands at that
   * speed and cracks the guitar instead.
   */
  /** How fast a full blow lands (m/s): a body hit over 11 m/s shatters the guitar. */
  const FULL = 15;
  const swing = async (n, { dur = 430, hit = 0 } = {}) => {
    await tween(WIND, 400);
    await wait(90);
    // The guitar's lowest point, read again if a frame reports it badly (it can, just after a big turn).
    const low = async () => {
      for (let k = 0; k < 6; k++) {
        const v = await lowest();
        if (Number.isFinite(v)) return v;
        await wait(20);
      }
      return null;
    };
    // Faster and faster round the shoulder, over the top and out in front, to just short of the floor.
    const a0 = Math.atan2(-(WIND.z - SHOULDER.z), WIND.y - SHOULDER.y);
    const a1 = Math.atan2(-(FLOOR_FRONT.z - SHOULDER.z), -0.35);
    const t0 = Date.now();
    for (;;) {
      const s = Math.min(1, (Date.now() - t0) / dur);
      const e = s * s;
      const a = lerp(a0, a1, e);
      hand.y = SHOULDER.y + ARM * Math.cos(a);
      await put({ x: lerp(WIND.x, FLOOR_FRONT.x, e), y: hand.y, z: SHOULDER.z - ARM * Math.sin(a) }, lerp(WIND.yaw, 8, e), lerp(WIND.roll, -78, Math.min(1, e * 1.05)));
      if (s >= 1) break;
    }
    // Then straight down into the floor at the blow's speed: `hit` m/s for a checked blow that
    // cracks the guitar, `FULL` for one that breaks it. The app counts a blow when the guitar
    // meets the floor, at the speed the hand moved over that frame, and holds the guitar up
    // while the hand goes on. So the drive is the emulator's own linear move, which advances the
    // hand by the speed times each frame's own time step (exact even when frames come unevenly,
    // as they do while the canvas records), on past the gap left under the guitar by two
    // frames' travel: one blow, at that speed, and only one.
    const gap = (await low()) ?? 0.6;
    const speed = hit || FULL;
    const drop = gap + Math.max(0.08, (2 * speed) / 60);
    const to = { x: hand.x, y: hand.y - drop, z: hand.z };
    await dispatch('animate_to', { device: 'hand-right', position: to, orientation: { pitch: 0, yaw: hand.yaw, roll: hand.roll }, anchor: 'wrist', duration: drop / speed });
    hand.y = to.y;
    await mark('impact', { n });
    await wait(240);
    return guitar();
  };
  return { dispatch, guitar, neckPoint, lowest, hand, put, tween, grab, tremble, swing };
}

/**
 * Moves devices together over `seconds`, in the page, a step every frame: each one
 * from where it is to `to` (a position) and/or turning from where it faces now to
 * face `lookTo`. A frame's commands are sent together, so they land in the same frame
 * (timed commands like animate_to run one at a time, so two devices can't share one).
 */
export const glide = (frame, moves, seconds) =>
  frame.evaluate(
    async ([moves, seconds]) => {
      const send = (m, p) => window.IWER_MCP.dispatch(m, p);
      const lerp = (a, b, s) => a + (b - a) * s;
      const at = (a, b, s) => ({ x: lerp(a.x, b.x, s), y: lerp(a.y, b.y, s), z: lerp(a.z, b.z, s) });
      const ease = (s) => s * s * (3 - 2 * s);
      for (const m of moves) {
        const { position: p, orientation: q } = await send('get_transform', { device: m.device });
        m.from = { x: p.x, y: p.y, z: p.z };
        // Where it faces now: a metre along its -Z.
        const t = { x: 2 * -q.y, y: 2 * q.x, z: 0 };
        const fwd = { x: t.x * q.w + (q.y * t.z - q.z * t.y), y: t.y * q.w + (q.z * t.x - q.x * t.z), z: -1 + t.z * q.w + (q.x * t.y - q.y * t.x) };
        m.lookFrom = { x: p.x + fwd.x, y: p.y + fwd.y, z: p.z + fwd.z };
      }
      const t0 = performance.now();
      for (;;) {
        const s = Math.min(1, (performance.now() - t0) / (seconds * 1000));
        const e = ease(s);
        const sent = [];
        for (const m of moves) {
          if (m.to) sent.push(send('set_transform', { device: m.device, position: at(m.from, m.to, e) }));
          if (m.lookTo) sent.push(send('look_at', { device: m.device, target: at(m.lookFrom, m.lookTo, e) }));
        }
        await Promise.all(sent);
        if (s >= 1) return;
      }
    },
    [moves, seconds],
  );

/**
 * Works the menu the way a player does on a Quest with their hands: the head turns
 * to the panel as the right hand comes up in front of the chest, and the hand's ray
 * is aimed at each button in turn and pinched. The hand never reaches out to the
 * panel. `ids` are pressed in order (say, the menu button, then an instrument).
 */
export async function rayPick({ frame, dispatch }, ids) {
  const where = (n) =>
    frame.evaluate((name) => {
      const o = window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName(name);
      if (!o) return null;
      o.updateWorldMatrix(true, false);
      const v = o.getWorldPosition(o.position.clone());
      return { x: v.x, y: v.y, z: v.z, shown: o.isVisible?.value !== false };
    }, n);
  // A button that isn't showing (the menu button, with the menu already open) is passed over.
  let first = await where(ids[0]);
  if (!first) throw new Error(`no panel element named ${ids[0]}`);
  if (!first.shown && ids.length > 1) {
    ids = ids.slice(1);
    first = await where(ids[0]);
  }
  // Standing where they started, facing the panel.
  const head = { x: 0, y: 1.6, z: 0 };
  const flat = Math.hypot(first.x - head.x, first.z - head.z);
  const f = { x: (first.x - head.x) / flat, z: (first.z - head.z) / flat };
  const r = { x: -f.z, z: f.x };
  const body = (fwd, right, up) => ({ x: head.x + f.x * fwd + r.x * right, y: head.y + up, z: head.z + f.z * fwd + r.z * right });
  await frame.evaluate(() => {
    window.IWER_DEVICE.hands.left.setPin(null);
    window.IWER_DEVICE.hands.right.setPin(null);
  });
  await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'default' });
  await glide(
    frame,
    [
      // The panel a little right of centre, so the hand and its ray are in the shot too.
      { device: 'headset', to: head, lookTo: { x: first.x - r.x * 0.3, y: first.y - 0.28, z: first.z - r.z * 0.3 } },
      // In front of the chest, a little right: where a hand points from.
      { device: 'hand-right', to: body(0.34, 0.15, -0.34), lookTo: first },
      // Down by the side, out of the shot.
      { device: 'hand-left', to: body(0.2, -0.75, -0.6) },
    ],
    0.5,
  );
  for (const [k, id] of ids.entries()) {
    if (k > 0) {
      let next = await where(id);
      for (let i = 0; i < 30 && !next?.shown; i++) {
        await wait(40);
        next = await where(id);
      }
      if (!next) throw new Error(`no panel element named ${id}`);
      // The ray swept across to it.
      await glide(frame, [{ device: 'hand-right', lookTo: next }], 0.3);
    }
    await wait(80);
    await dispatch('select', { device: 'hand-right', duration: 0.12 });
    await wait(160);
  }
}

/**
 * From the smash to the trumpet, with the hand's ray: the menu opened, the trumpet
 * picked, and the hints that come up with it folded away (the help button).
 */
const menuToTrumpet = ({ frame, dispatch }) => rayPick({ frame, dispatch }, ['menu-open', 'instrument-trumpet', 'hint-toggle']);

/**
 * Just the menu pick, recorded: the guitar chosen (the menu folds away), the view and
 * the right hand left where the smash leaves them, then the menu opened and the
 * trumpet picked with the hand's ray. About fifteen seconds; for checking the pick.
 */
export async function menupick({ page, frame }, app) {
  await startApp({ page, frame }, { root: 'AirGuitar', view: { pitch: -38, yaw: 12, roll: 0 } });
  await app.hideBanner?.();
  const dispatch = (method, params = {}) => frame.evaluate(([m, p]) => window.IWER_MCP.dispatch(m, p), [method, params]);
  // As in the take, the guitar chosen and the menu and hints folded away.
  await chooseAndFold(frame, dispatch, 'guitar');
  await dispatch('set_transform', { device: 'headset', ...SWING_VIEW });
  await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'open' });
  await dispatch('set_transform', { device: 'hand-right', position: { x: 0.1, y: 0.45, z: -0.4 }, anchor: 'wrist', orientation: { pitch: 0, yaw: 8, roll: -78 } });
  await wait(800);
  await app.startCapture();
  await wait(1000);
  await app.mark('menuStart');
  const t0 = Date.now();
  await menuToTrumpet({ frame, dispatch });
  await app.mark('trumpetChosen');
  const took = (Date.now() - t0) / 1000;
  await dispatch('animate_to', { device: 'headset', position: { x: 0, y: 1.6, z: 0 }, orientation: PARTS.trumpet.view, duration: 0.45 });
  await wait(1500);
  const chosen = await frame.evaluate(() => !!window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName('AirTrumpet')?.visible);
  console.log(`[menupick] took ${took.toFixed(2)} s, trumpet showing: ${chosen}`);
  return { took, chosen };
}

/** Looks at a panel button with the headset, reaches the right hand to it and pinches. */
export async function pressButton({ frame, dispatch }, id) {
  const folded = await frame.evaluate((n) => window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName(n)?.isVisible?.value === false, id);
  if (folded && id !== 'menu-open') await pressButton({ frame, dispatch }, 'menu-open');
  await frame.evaluate(() => {
    window.IWER_DEVICE.hands.left.setPin(null);
    window.IWER_DEVICE.hands.right.setPin(null);
  });
  await dispatch('set_hand_pose', { device: 'hand-left', poseId: 'default' });
  await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'default' });
  const target = await frame.evaluate((n) => {
    const o = window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName(n);
    if (!o) return null;
    const v = o.getWorldPosition(o.position.clone());
    return { x: v.x, y: v.y, z: v.z };
  }, id);
  if (target == null) throw new Error(`no panel element named ${id}`);
  // The panel in view, a little right of centre.
  await dispatch('look_at', { device: 'headset', target: { x: target.x - 0.35, y: target.y - 0.1, z: target.z } });
  await dispatch('set_transform', { device: 'hand-right', position: { x: target.x + 0.25, y: target.y - 0.55, z: target.z + 0.45 }, anchor: 'wrist' });
  await wait(250);
  await dispatch('animate_to', { device: 'hand-right', position: { x: target.x + 0.05, y: target.y - 0.12, z: target.z + 0.3 }, anchor: 'wrist', duration: 0.9 });
  await wait(1000);
  await dispatch('look_at', { device: 'hand-right', target });
  await wait(300);
  await dispatch('select', { device: 'hand-right', duration: 0.15 });
  await wait(700);
}

export async function meltdown({ page, frame }, app) {
  page.on('console', (m) => m.type() === 'error' && console.log('console error:', m.text().slice(0, 160)));
  const trumpet = PARTS.trumpet;
  await startApp({ page, frame }, {
    root: 'AirGuitar',
    view: { pitch: -38, yaw: 12, roll: 0 },
    modules: ['/tests/songs/ode-to-joy.js', '/tests/performer.js', trumpet.performer],
  });
  await app.hideBanner();
  const mark = async (what, extra) => {
    await app.mark(what, extra);
    console.log(`[meltdown] ${what}`);
  };
  const r = rig({ frame, mark });
  const { dispatch } = r;
  // The guitar picked from the menu before the recording, and the menu and hints folded away for the tune.
  await chooseAndFold(frame, dispatch, 'guitar');
  await dispatch('set_transform', { device: 'headset', position: { x: 0, y: 1.6, z: 0 }, orientation: { pitch: -38, yaw: 12, roll: 0 } });
  await wait(1000);
  await app.startCapture();
  await wait(2500);

  // 1. The tune's first phrase, its last note wrong.
  const ode = await frame.evaluate(async () => {
    const { ODE_TO_JOY_FLUB } = await import('/tests/songs/ode-to-joy.js');
    const events = ODE_TO_JOY_FLUB.events;
    return { firstBeat: events[0].beat, flubBeat: events.at(-1).beat, tempo: ODE_TO_JOY_FLUB.tempo };
  });
  await mark('perform', { inst: 'ode', leadIn: 0.4, ...ode });
  await frame.evaluate(async () => {
    const { ODE_TO_JOY_FLUB } = await import('/tests/songs/ode-to-joy.js');
    const { perform } = await import('/tests/performer.js');
    await perform(ODE_TO_JOY_FLUB, {});
    // The performer pins both hands to its last pose; let go of them.
    for (const s of ['left', 'right']) window.IWER_DEVICE.hands[s].setPin(null);
  });
  await mark('odeDone');
  await wait(700);

  // 2. The fury: a fist round the neck, shaking, briefly.
  const neck = await r.grab();
  await r.tremble(neck, 1800);
  await mark('shakingDone');

  // 3. The smash: overhead swings, building up, until it is wrecked. Looking out over where it
  // lands. A full swing breaks the guitar in one (a body hit over 11 m/s shatters it), so the
  // first two check themselves just before they land: they crack it, snap strings and knock
  // pieces off; full swings finish it.
  await dispatch('set_transform', { device: 'headset', ...SWING_VIEW });
  let g = await r.guitar();
  // Two checked hits that crack it and knock pieces off (aimed at about 6.5 m/s, nudged by
  // what the last one did), then full swings to finish it.
  let aim = 6.5;
  let breaking = 0;
  for (let i = 0; i < 12 && g.condition !== 'wrecked'; i++) {
    const full = breaking >= 2;
    g = await r.swing(i + 1, { hit: full ? 0 : aim });
    if (!full) {
      if (g.lastImpact >= 5) breaking++;
      if (g.lastImpact < 5) aim += 1.5;
      else if (g.lastImpact > 8.5) aim -= 1.5;
    }
    console.log(`[meltdown] swing ${i + 1}: ${g.condition}, ${g.lastImpact?.toFixed(1)} m/s, ${g.strings} strings left, ${g.shardsOff} pieces off`);
  }
  await wait(500);
  await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'open' });
  await dispatch('set_hand_pose', { device: 'hand-left', poseId: 'open' });
  await wait(700);
  await mark('wrecked', { condition: g.condition });

  // 4. The menu, worked as on a Quest: the hand's ray aimed and pinched, at the menu button and then the trumpet.
  await mark('menuStart');
  await menuToTrumpet({ frame, dispatch });
  await mark('trumpetChosen');
  await dispatch('animate_to', { device: 'headset', position: { x: 0, y: 1.6, z: 0 }, orientation: trumpet.view, duration: 0.45 });

  // 5. William Tell on the trumpet: the trailer's whole part.
  const song = trailerPart('trumpet');
  await mark('perform', { inst: 'trumpet', firstBeat: firstBeat(song), leadIn: trumpet.leadIn, tempo: song.tempo });
  const perf = await frame.evaluate(
    async ([mod, s]) => {
      const { perform } = await import(mod);
      const out = await perform(s, {});
      return { fps: out.fps, drag: out.tempoDragPct, stalls: out.stalls };
    },
    [trumpet.performer, song],
  );
  await wait(2500);
  return { condition: g.condition, ...perf };
}

/** Just the grab, tremble and a few swings, to check how the arc looks (about a minute). */
export async function swingtest({ page, frame }, app) {
  await startApp({ page, frame }, { root: 'AirGuitar', view: { pitch: -30, yaw: 0, roll: 0 } });
  await app.hideBanner();
  const r = rig({ frame, mark: async (w) => console.log('[swingtest]', w) });
  // (Recording the canvas as the real take does, when the take asks for it.)
  if (app.startCapture && process.env.SWING_CAPTURE) await app.startCapture();
  await wait(1500);
  const neck = await r.grab();
  await r.tremble(neck, 1200);
  await r.dispatch('set_transform', { device: 'headset', ...SWING_VIEW });
  let g = await r.guitar();
  // SWING_HITS (m/s, comma-separated; 0 = a full swing) tries a build-up of hits.
  const hits = (process.env.SWING_HITS ?? '0,0,0,0').split(',').map(Number);
  for (let i = 0; i < hits.length && g.condition !== 'wrecked'; i++) {
    g = await r.swing(i + 1, { hit: hits[i] });
    console.log('swing', i + 1, 'aim', hits[i], ':', g.condition, 'speed', g.lastImpact?.toFixed(1), 'health', g.health?.toFixed(2), 'strings', g.strings, 'shardsOff', g.shardsOff, 'neckBroken', g.neckBroken);
  }
  await wait(1500);
  return { condition: g.condition };
}
