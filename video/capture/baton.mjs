/**
 * The conductor's baton take: the baton chosen on the panel, three taps on
 * the music stand's top edge for attention, taps on the desk and ledge soft
 * and loud, a fast conducting pattern (the baton swishes), then the stand
 * shoved over and the baton swung into the floor until it snaps.
 *
 *   node video/capture/take.mjs baton            (records video/build/takes/baton.webm)
 *   node video/capture/take.mjs baton-check      (the same moves, not recorded)
 *
 * Each step's result (taps, spot, loudness, smash state) is logged and
 * returned, so the check run doubles as an end-to-end test.
 */
import { startApp } from '../../tests/app-start.js';
import { choose } from './clips.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** The baton's reach from grip to tip (m), as in src/baton/geometry.ts. */
const REACH = 0.34;
/** The wrist's turn while tapping: knuckles forward and down, so the baton points over the desk. */
const TAP_TURN = { pitch: -38, yaw: -16, roll: 0 };

export async function baton({ page, frame }, app, { record = true } = {}) {
  const log = (m) => console.log(`[baton] ${m}`);
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && !/ERR_ABORTED/.test(m.text()) && errors.push(m.text().slice(0, 200)));
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  const dispatch = (method, params = {}) => frame.evaluate(([m, p]) => window.IWER_MCP.dispatch(m, p), [method, params]);
  const values = (name, component) =>
    frame.evaluate(
      async ([n, c]) => {
        const found = await window.IWER_MCP.dispatch('ecs_find_entities', { withComponents: [c] });
        const e = found.entities.find((x) => x.name === n) ?? found.entities[0];
        const q = await window.IWER_MCP.dispatch('ecs_query_entity', { entityIndex: e.entityIndex });
        return q.components.find((x) => x.componentId === c).values;
      },
      [name, component],
    );
  const baton = () => values('AirBaton', 'AirBaton');
  const smash = (name) => values(name, 'Smashable');
  const mark = async (what, extra) => {
    if (record) await app.mark(what, extra);
    log(what + (extra ? ' ' + JSON.stringify(extra) : ''));
  };
  /** World points on the desk (desk space: +Y up the plate, +Z out of its face), and its axes. */
  const desk = () =>
    frame.evaluate(() => {
      const d = window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName('Desk');
      d.updateWorldMatrix(true, false);
      const e = d.matrixWorld.elements;
      const at = (x, y, z) => ({ x: e[0] * x + e[4] * y + e[8] * z + e[12], y: e[1] * x + e[5] * y + e[9] * z + e[13], z: e[2] * x + e[6] * y + e[10] * z + e[14] });
      const n = Math.hypot(e[8], e[9], e[10]);
      return { rim: at(0.06, 0.32, -0.002), face: at(-0.05, 0.17, 0), lip: at(0.1, 0.012, 0.048), up: { x: e[4], y: e[5], z: e[6] }, out: { x: e[8] / n, y: e[9] / n, z: e[10] / n } };
    });
  /** Where the baton's tip is, from the wrist, at the tapping turn. */
  const batonTip = () =>
    frame.evaluate((reach) => {
      const b = window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName('AirBaton');
      b.updateWorldMatrix(true, false);
      const e = b.matrixWorld.elements;
      return { x: e[12] + e[0] * reach, y: e[13] + e[1] * reach, z: e[14] + e[2] * reach };
    }, REACH);
  const frames = (n = 3) => frame.evaluate((k) => new Promise((r) => { const f = () => (--k <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
  const add = (a, b, s = 1) => ({ x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s });
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
  const right = (position, orientation = TAP_TURN) => dispatch('set_transform', { device: 'hand-right', position, orientation, anchor: 'wrist' });
  const glide = async (device, position, orientation, seconds) => {
    await dispatch('animate_to', { device, position, orientation, anchor: 'wrist', duration: seconds });
    await wait(seconds * 1000 + 60);
  };

  await startApp({ page, frame }, { root: 'AirBaton', view: { pitch: -15, yaw: 0, roll: 0 } });
  await app.hideBanner?.();
  await choose(frame, dispatch, 'instrument-baton');
  // The hint strip folded away, so the stand is in clear view.
  await choose(frame, dispatch, 'hint-toggle');
  // First person, looking down at the stand.
  await dispatch('set_transform', { device: 'headset', position: { x: 0.05, y: 1.6, z: 0.05 }, orientation: { pitch: -24, yaw: 4, roll: 0 } });
  await dispatch('set_transform', { device: 'hand-left', position: { x: -0.35, y: 0.95, z: 0.05 }, orientation: { pitch: 0, yaw: 0, roll: 0 }, anchor: 'wrist' });
  await dispatch('set_hand_pose', { device: 'hand-left', poseId: 'default' });
  await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'fist' });
  const rest = { x: 0.16, y: 1.12, z: -0.05 };
  await right(rest);
  await frames(4);
  const d = await desk();
  const offset = sub(await batonTip(), rest);
  log(`desk rim ${JSON.stringify(d.rim)} offset ${JSON.stringify(offset)} state ${JSON.stringify(await baton())}`);
  const wristFor = (tip) => sub(tip, offset);
  const results = [];

  if (record) await app.startCapture();
  await wait(1500);

  /** One tap: the tip from `clear` above (or off) the spot down to `into` past it, in `seconds`. */
  // Well above and in front of the desk: the way between spots, clear of the stand.
  const clear = add(add(d.rim, d.up, 0.15), d.out, 0.2);
  let at = null;
  const tap = async (spot, from, to, seconds) => {
    if (at !== from) {
      await glide('hand-right', wristFor(clear), TAP_TURN, 0.3);
      await glide('hand-right', wristFor(from), TAP_TURN, 0.3);
      at = from;
    }
    const before = (await baton()).taps;
    await glide('hand-right', wristFor(to), TAP_TURN, seconds);
    await frames(2);
    const s = await baton();
    results.push({ spot, taps: s.taps - before, heard: s.lastSpot, loud: s.lastTap, speed: s.lastSpeed });
    await glide('hand-right', wristFor(from), TAP_TURN, 0.12);
    return s;
  };
  // Over the top edge, the shaft's end crossing it, a little behind the desk.
  const rimAbove = add(add(d.rim, d.up, 0.06), d.out, -0.035);
  const rimBelow = add(add(d.rim, d.up, -0.012), d.out, -0.035);
  await mark('attention');
  for (let i = 0; i < 3; i++) {
    await tap('rim', rimAbove, rimBelow, 0.05);
    await wait(260);
  }
  await wait(900);
  await mark('desk');
  for (const [seconds, label] of [[0.16, 'soft'], [0.09, 'mid'], [0.04, 'loud']]) {
    await tap('desk', add(d.face, d.out, 0.07), add(d.face, d.out, -0.006), seconds);
    log(`desk ${label}`);
    await wait(380);
  }
  await mark('ledge');
  for (let i = 0; i < 2; i++) {
    await tap('ledge', add(d.lip, d.up, 0.06), add(d.lip, d.up, -0.006), 0.05);
    await wait(300);
  }
  await glide('hand-right', wristFor(clear), TAP_TURN, 0.3);
  await wait(300);

  // A conducting pattern in four, quick: down, left, right, up.
  results.push({ step: 'taps before conducting', taps: (await baton()).taps });
  await mark('conduct');
  const beat = [
    [{ x: 0.12, y: 1.05, z: 0.1 }, { pitch: -35, yaw: -10, roll: 0 }],
    [{ x: -0.12, y: 1.14, z: 0.1 }, { pitch: -10, yaw: 30, roll: 0 }],
    [{ x: 0.36, y: 1.14, z: 0.12 }, { pitch: -10, yaw: -45, roll: 0 }],
    [{ x: 0.16, y: 1.4, z: 0.12 }, { pitch: 25, yaw: -15, roll: 0 }],
  ];
  await glide('hand-right', { x: 0.16, y: 1.3, z: 0.12 }, { pitch: 10, yaw: -15, roll: 0 }, 0.4);
  for (let bar = 0; bar < 2; bar++) for (const [p, o] of beat) await glide('hand-right', p, o, 0.16);
  await glide('hand-right', { x: 0.3, y: 1.0, z: 0.15 }, { pitch: -10, yaw: -15, roll: 0 }, 0.4);
  await wait(600);

  results.push({ step: 'taps after conducting', taps: (await baton()).taps });
  // The stand shoved over by the left hand, from the front.
  await mark('shove');
  await dispatch('set_transform', { device: 'headset', position: { x: 0.95, y: 1.15, z: -0.3 }, orientation: { pitch: 0, yaw: 0, roll: 0 } });
  await dispatch('look_at', { device: 'headset', target: { x: -0.05, y: 0.55, z: -1.0 } });
  await right({ x: 0.3, y: 1.0, z: 0.1 });
  await dispatch('set_hand_pose', { device: 'hand-left', poseId: 'flat' }).catch(() => dispatch('set_hand_pose', { device: 'hand-left', poseId: 'open' }));
  await wait(600);
  let stand = await smash('AirMusicStand');
  for (let i = 0; i < 4 && stand.hold !== 'thrown'; i++) {
    const front = add(d.face, d.out, 0.14);
    await dispatch('set_transform', { device: 'hand-left', position: add(front, { x: 0, y: -0.05, z: 0.06 }), orientation: { pitch: 0, yaw: 0, roll: 0 }, anchor: 'wrist' });
    await frames(3);
    await glide('hand-left', add(front, { x: 0, y: -0.05, z: -0.42 }), { pitch: 0, yaw: 0, roll: 0 }, 0.28);
    await wait(300);
    stand = await smash('AirMusicStand');
  }
  await dispatch('set_transform', { device: 'hand-left', position: { x: -0.4, y: 0.95, z: 0.2 }, orientation: { pitch: 0, yaw: 0, roll: 0 }, anchor: 'wrist' });
  await wait(3200);
  stand = await smash('AirMusicStand');
  results.push({ step: 'shove', hold: stand.hold, condition: stand.condition, impacts: stand.impacts, piecesOff: stand.piecesOff, health: +stand.health.toFixed(2) });

  // The baton swung down into the floor until it snaps.
  await mark('snap');
  // First person again, looking down at the floor in front, where it lands.
  await dispatch('set_transform', { device: 'headset', position: { x: 0.02, y: 1.6, z: 0.12 }, orientation: { pitch: -58, yaw: -14, roll: 0 } });
  let b = await smash('AirBaton');
  const up = { x: 0.22, y: 1.2, z: -0.15 };
  const swingTurn = { pitch: -70, yaw: -10, roll: 0 };
  for (let i = 0; i < 10 && b.condition !== 'wrecked'; i++) {
    await glide('hand-right', up, { pitch: 30, yaw: -10, roll: 0 }, 0.3);
    await wait(150);
    await glide('hand-right', { x: 0.24, y: 0.2, z: -0.32 }, swingTurn, 0.18);
    await wait(600);
    b = await smash('AirBaton');
    log(`swing ${i + 1}: ${b.condition} health ${b.health.toFixed(2)} impacts ${b.impacts}`);
  }
  await glide('hand-right', { x: 0.3, y: 1.0, z: 0.1 }, { pitch: 0, yaw: 0, roll: 0 }, 0.4);
  await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'open' }).catch(() => {});
  await wait(2500);
  b = await smash('AirBaton');
  results.push({ step: 'snap', hold: b.hold, condition: b.condition, impacts: b.impacts, piecesOff: b.piecesOff });
  await mark('end');
  await wait(800);
  const final = await baton();
  log(`results ${JSON.stringify(results)} taps ${final.taps} errors ${JSON.stringify(errors)}`);
  return { results, taps: final.taps, errors };
}

/** The same moves, not recorded: an end-to-end check. */
export const batonCheck = (ctx, app) => baton(ctx, app, { record: false });
