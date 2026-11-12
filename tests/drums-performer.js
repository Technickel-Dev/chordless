/**
 * Plays a drum part on the air drums (see songs/william-tell.js), planning
 * each stick's path round the kit the way a drummer moves, and performs it
 * live with IWER's emulated hands closed round the sticks, or offline for
 * the check (drums-check.mjs).
 *
 * Each stroke starts from a height over its spot that grows with its
 * dynamic, speeds up toward the surface, then holds a steady speed for the
 * last 25 ms, so the app measures exactly the speed that gives the stroke
 * its loudness, and carries on a little into the surface before stopping
 * within 25 ms (the app stops the drawn stick on it). Between strokes the tip lifts off
 * along the surface's normal, glides over to its next spot no lower than it
 * lifted, so it never comes down onto anything on the way, and drops onto
 * the next stroke's starting height. The stick points from the drummer
 * toward the piece it plays, tipped down, and turns as it travels.
 */

import { PIECES, surfaceOf, TIP_REACH } from '/src/drums/geometry.ts';
import { FULL_STROKE_SPEED, REARM_HEIGHT, SOUNDING_SPEED, TIP_RADIUS } from '/src/drums/strokes.ts';

/** The player's head during a performance (world, m), looking along -Z; the kit is set out for it. */
export const HEAD = [0, 1.6, 0];
/** Where the app puts the snare for HEAD (see AirDrumsSystem: the stage top, 72 cm below the eyes). */
export const SNARE = HEAD[1] - 0.035 - 0.72;

/** Which piece each articulation is played on, and where: a fraction of its radius out toward the far rim. */
const SPOTS = {
  kick: ['kick', 0.2],
  snare: ['snare', 0.25],
  rimshot: ['snare', 0.93],
  tom1: ['tom1', 0.2],
  tom2: ['tom2', 0.2],
  floorTom: ['floorTom', 0.2],
  hihatClosed: ['hihat', 0.35],
  hihatOpen: ['hihat', 0.9],
  crash: ['crash', 0.7],
  ride: ['ride', 0.6],
  rideBell: ['ride', 0.1],
};
/** Loudness each dynamic aims for. */
export const STROKE_TARGET = { pp: 0.2, p: 0.3, mf: 0.55, f: 0.75, ff: 0.95 };
/**
 * How high the tip starts over its spot for each dynamic (m): at least
 * what its steady stretch needs, and clear of the height the app needs a
 * tip lifted to before it can strike again.
 */
const HEIGHT = { pp: 0.02, p: 0.03, mf: 0.06, f: 0.09, ff: 0.14 };
const MIN_HEIGHT = REARM_HEIGHT + 0.006;
/** The last stretch before contact is at a steady speed, this long. */
const STEADY = 0.025;
/** After contact the tip carries on at speed this long, then eases to a stop over STOP. */
const THROUGH = 0.008;
const STOP = 0.016;
/** After a stroke the tip lifts this far off along the surface's normal before gliding on. */
const LIFT = 0.03;
/** The stick leans down from level toward the piece by this much (radians). */
const STICK_DIP = 0.35;
/** The app hears the hands a few milliseconds late, so strokes are aimed this much early. */
const STROKE_LEAD = 0.004;
/** How close a stroke's loudness must come to its dynamic's. */
const LOUDNESS_TOLERANCE = 0.12;
/** How close (s) a stroke must come to its time to count. */
const ON_TIME = 0.04;

/** The approach speed (m/s) that gives `loudness` (see strokeLoudness). */
export const speedFor = (loudness) => SOUNDING_SPEED + (FULL_STROKE_SPEED - SOUNDING_SPEED) * loudness ** (1 / 0.6);

const clamp01 = (u) => Math.min(1, Math.max(0, u));
const ease = (u) => u * u * (3 - 2 * u);
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const norm = (a) => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
/** A cubic from value a (slope va) to b (slope vb) over `span` seconds, at u in [0, 1]. */
const hermite = (a, va, b, vb, span, u) => {
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * a + (u3 - 2 * u2 + u) * span * va + (-2 * u3 + 3 * u2) * b + (u3 - u2) * span * vb;
};

/** Where a stroke lands (kit space): the tip's centre at `point` on contact, the surface's normal, and the stick's axis. */
function spotFor(hit) {
  const [id, r] = SPOTS[hit];
  const piece = PIECES.find((p) => p.id === id);
  const s = surfaceOf(piece, SNARE);
  const out = norm([s.center[0], 0, s.center[2]]);
  const along = out[0] * s.normal[0] + out[2] * s.normal[2];
  const away = norm([out[0] - s.normal[0] * along, -s.normal[1] * along, out[2] - s.normal[2] * along]);
  const point = add(add(s.center, away, r * piece.radius), s.normal, TIP_RADIUS);
  const axis = norm([out[0] * Math.cos(STICK_DIP), -Math.sin(STICK_DIP), out[2] * Math.cos(STICK_DIP)]);
  return { piece: id, point, normal: s.normal, axis };
}

/**
 * Plans a performance: for each hand, when each stroke lands, how fast and
 * from how high, and when its down-stroke starts. Times are seconds from
 * the start.
 */
export function planPerformance(song, tempo = song.tempo) {
  const beat = 60 / tempo;
  const first = Math.min(...song.events.map((e) => e.beat));
  // The hands settle over their first strokes before the clock starts.
  const LEAD_IN = 0.6;
  const strokes = song.events.map((e, index) => {
    const time = LEAD_IN + (e.beat - first) * beat;
    const loudness = STROKE_TARGET[e.dynamic];
    const speed = speedFor(loudness);
    const steadyFrom = speed * STEADY;
    const height = Math.max(HEIGHT[e.dynamic], steadyFrom * 1.25, MIN_HEIGHT);
    // Steady for the last stretch; before that, speeding up from rest over about 1.5x the distance's time.
    const accel = (1.5 * (height - steadyFrom)) / speed;
    const contact = time - STROKE_LEAD;
    // How deep the tip goes: on at speed, then easing to a stop.
    const through = speed * THROUGH;
    const depth = through + (speed * STOP) / 2;
    const stopped = contact + THROUGH + STOP;
    return { index, beat: e.beat, hand: e.hand, hit: e.hit, dynamic: e.dynamic, time, contact, speed, loudness, steadyFrom, height, accel, start: contact - STEADY - accel, through, depth, stopped, ...spotFor(e.hit) };
  });
  const hands = { left: strokes.filter((s) => s.hand === 'left'), right: strokes.filter((s) => s.hand === 'right') };
  // Each travel between strokes must fit: report the tightest, and how fast the tip glides.
  let tightest = Infinity;
  let fastest = 0;
  for (const list of Object.values(hands)) {
    for (let i = 0; i + 1 < list.length; i++) {
      const gap = list[i + 1].start - list[i].stopped;
      tightest = Math.min(tightest, gap);
      fastest = Math.max(fastest, (1.5 * pathLength(travelPath(list[i], list[i + 1]))) / gap);
    }
  }
  const end = Math.max(...strokes.map((s) => s.stopped)) + 0.6;
  return { strokes, hands, end, beat, tightestGap: Math.round(tightest * 1000) / 1000, fastestGlide: Math.round(fastest * 10) / 10 };
}

/** The way from one stroke's bottom to the next one's start: lift off, glide over no lower, drop on. */
function travelPath(from, to) {
  const bottom = add(from.point, from.normal, -from.depth);
  const lifted = add(from.point, from.normal, LIFT);
  const top = add(to.point, to.normal, to.height);
  const over = [top[0], Math.max(lifted[1], top[1]), top[2]];
  return [bottom, lifted, over, top];
}

const pathLength = (pts) => pts.slice(1).reduce((sum, p, i) => sum + dist(pts[i], p), 0);

/** The point `u` (0 to 1) of the way along a polyline, by length. */
function alongPath(pts, u) {
  let left = pathLength(pts) * u;
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i]);
    if (left <= d && d > 0) return add(pts[i - 1], [pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]], left / d);
    left -= d;
  }
  return pts.at(-1);
}

/**
 * Where each stick is at time t (kit space): { left, right }, each { tip,
 * axis }, the axis from the grip toward the tip.
 */
export function sticksAt(plan) {
  const one = (list) => (t) => {
    let i = -1;
    while (i < list.length - 1 && t >= list[i + 1].start) i++;
    if (i < 0) {
      const k = list[0];
      return { tip: add(k.point, k.normal, k.height), axis: k.axis };
    }
    const k = list[i];
    const next = list[i + 1];
    let h;
    if (t < k.contact - STEADY) h = hermite(k.height, 0, k.steadyFrom, -k.speed, k.accel, (t - k.start) / k.accel);
    else if (t < k.contact + THROUGH) h = -k.speed * (t - k.contact);
    else if (t < k.stopped) h = hermite(-k.through, -k.speed, -k.depth, 0, STOP, (t - k.contact - THROUGH) / STOP);
    else if (next == null) {
      h = -k.depth + (LIFT + k.depth) * ease(clamp01((t - k.stopped) / 0.2));
    } else {
      const u = ease(clamp01((t - k.stopped) / (next.start - k.stopped)));
      return { tip: alongPath(travelPath(k, next), u), axis: norm(add(k.axis.map((v) => v * (1 - u)), next.axis, u)) };
    }
    return { tip: add(k.point, k.normal, h), axis: k.axis };
  };
  const left = one(plan.hands.left);
  const right = one(plan.hands.right);
  return (t) => ({ left: left(t), right: right(t) });
}

/**
 * Scores the strokes heard ({ t, hit, loudness }) against the plan: each
 * stroke once, on time, with its articulation, as loud as its dynamic.
 */
export function scoreStrokes(plan, heard) {
  const used = new Set();
  const report = plan.strokes.map((k) => {
    let best = -1;
    heard.forEach((h, j) => {
      if (used.has(j) || h.hit !== k.hit || Math.abs(h.t - k.time) > ON_TIME) return;
      if (best < 0 || Math.abs(h.t - k.time) < Math.abs(heard[best].t - k.time)) best = j;
    });
    if (best >= 0) used.add(best);
    const h = heard[best];
    return {
      beat: k.beat,
      hand: k.hand,
      hit: k.hit,
      dynamic: k.dynamic,
      want: k.loudness,
      heard: h ? Math.round(h.loudness * 100) / 100 : null,
      lateMs: h ? Math.round((h.t - k.time) * 1000) : null,
      ok: h != null && Math.abs(h.loudness - k.loudness) <= LOUDNESS_TOLERANCE,
    };
  });
  const extra = heard.filter((_, j) => !used.has(j)).map((h) => ({ t: Math.round(h.t * 1000) / 1000, hit: h.hit, loudness: Math.round(h.loudness * 100) / 100 }));
  return { report, extra };
}

// -------------------------------------------------------------- performing

/** The performance clock never steps further than this in a frame (s): a stall slows the music instead of skipping it. */
const MAX_STEP = 0.034;
const dispatch = (method, params = {}) => window.IWER_MCP.dispatch(method, params);

/**
 * Plays `song` live: takes out the drums (set out for the headset at
 * HEAD), closes both emulated hands round the sticks, drives them every
 * frame and records every stroke the app sounds, straight from its synth.
 * Calls `onEvent(index)` as each stroke lands. Returns the score.
 */
export async function perform(song, { tempo = song.tempo, onEvent = () => {} } = {}) {
  const world = window.FRAMEWORK_MCP_RUNTIME.world;
  const systems = Array.from(world.systems ?? []);
  const sys = systems.find((s) => s?.instrument === 'drums');
  const guitar = systems.find((s) => s?.fretReader && s?.synth);
  await dispatch('set_transform', { device: 'headset', position: { x: HEAD[0], y: HEAD[1], z: HEAD[2] }, orientation: { pitch: -38, yaw: 0, roll: 0 } });
  if (guitar) {
    const { AirGuitar } = await import('/src/guitar/air-guitar-component.ts');
    guitar.entity.setValue(AirGuitar, 'active', false);
  }
  for (const s of systems) if (s?.instrument && s !== sys) s.entity.setValue(s.component, 'active', false);
  sys.entity.setValue(sys.component, 'active', true);
  sys.entity.setValue(sys.component, 'resetPlacement', true);
  await sys.synth.warm;

  const plan = planPerformance(song, tempo);
  const at = sticksAt(plan);
  await dispatch('set_input_mode', { mode: 'hand' });
  await dispatch('set_hand_pose', { device: 'hand-left', poseId: 'fist' });
  await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'fist' });

  const root = sys.model.root;
  const V = (x = 0, y = 0, z = 0) => root.position.clone().set(x, y, z);
  const M = () => root.matrixWorld.clone().identity();
  const Q = () => root.quaternion.clone().identity();
  const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
  const hands = [window.IWER_DEVICE.hands.left, window.IWER_DEVICE.hands.right];

  // Hold each fist still once, clear of the kit, and see where the app puts its stick.
  const ref = { p: [0, 1.75, 0.4], q: [0, 0, 0, 1] };
  for (const hand of hands) hand.setPin({ anchor: 'wrist', target: ref.p, wristRotation: ref.q });
  for (let i = 0; i < 6; i++) await nextFrame();
  if (Math.abs(sys.entity.getValue(sys.component, 'snareHeight') - SNARE) > 0.002) {
    throw new Error(`the kit's snare is at ${sys.entity.getValue(sys.component, 'snareHeight')} m, not ${SNARE} m: is the headset at HEAD?`);
  }
  const refWrist = M().compose(V(...ref.p), Q().set(...ref.q), V(1, 1, 1)).invert();
  const wristFromStick = sys.model.sticks.map((s) => refWrist.clone().multiply(s.matrixWorld).invert());

  // Reused every frame.
  const X = V();
  const Y = V();
  const Z = V();
  const UP = V(0, 1, 0);
  const P = V();
  const S = V();
  const R = Q();
  const F = M();
  const place = (sticks) => {
    ['left', 'right'].forEach((side, i) => {
      const { tip, axis } = sticks[side];
      Y.set(axis[0], axis[1], axis[2]).normalize();
      Z.crossVectors(Y, UP).normalize();
      X.crossVectors(Y, Z);
      F.makeBasis(X, Y, Z).setPosition(tip[0] - Y.x * TIP_REACH, tip[1] - Y.y * TIP_REACH, tip[2] - Y.z * TIP_REACH);
      F.premultiply(root.matrixWorld).multiply(wristFromStick[i]);
      F.decompose(P, R, S);
      hands[i].setPin({ anchor: 'wrist', target: [P.x, P.y, P.z], wristRotation: [R.x, R.y, R.z, R.w] });
    });
  };
  for (let i = 0; i < 20; i++) {
    place(at(0));
    await nextFrame();
  }

  // Listen at the synth: every stroke, on the performance clock.
  const heard = [];
  let clock = 0;
  const { play } = sys.synth;
  sys.synth.play = function (sound, when) {
    heard.push({ t: clock, hit: sound.articulation, loudness: sound.loudness });
    return play.call(this, sound, when);
  };

  let shown = -1;
  let frames = 0;
  let stalls = 0;
  let wall = performance.now();
  const wallStart = wall;
  try {
    await new Promise((resolve, reject) => {
      const tick = () => {
        try {
          const now = performance.now();
          const step = (now - wall) / 1000;
          wall = now;
          if (step > MAX_STEP) stalls++;
          clock += Math.min(step, MAX_STEP);
          // For video capture: where the performance clock is against the wall clock.
          window.__performTick?.(performance.now(), clock);
          place(at(clock));
          frames++;
          while (shown + 1 < plan.strokes.length && plan.strokes[shown + 1].time <= clock) onEvent(++shown);
          if (clock < plan.end) requestAnimationFrame(tick);
          else resolve();
        } catch (err) {
          reject(err);
        }
      };
      requestAnimationFrame(tick);
    });
  } finally {
    sys.synth.play = play;
  }
  const { report, extra } = scoreStrokes(plan, heard);
  const late = report.filter((r) => r.lateMs != null).map((r) => Math.abs(r.lateMs));
  return {
    strokesRight: report.filter((r) => r.ok).length,
    strokesTotal: report.length,
    extraStrokes: extra,
    wrong: report.filter((r) => !r.ok),
    fps: Math.round(frames / ((wall - wallStart) / 1000)),
    tempoDragPct: Math.round(((wall - wallStart) / 1000 / clock - 1) * 1000) / 10,
    stalls,
    worstTimingMs: Math.max(...late),
    meanTimingMs: Math.round(late.reduce((a, b) => a + b, 0) / Math.max(1, late.length)),
  };
}

