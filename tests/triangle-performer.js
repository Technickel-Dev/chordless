/**
 * Plays a triangle part on the air triangle (see songs/william-tell.js),
 * planning the beater's motion the way a triangle player moves, and
 * performs it live with IWER's emulated hands (the left pinching the clip,
 * the right a fist round the beater), or offline for the check
 * (triangle-check.mjs).
 *
 * The triangle hangs still at chest height. Single strikes go into the face
 * of the right side, the beater lying across it: each comes in at a steady
 * speed for its last few centimetres, the speed that gives the strike its
 * loudness, and carries on through the bar a little before stopping, as a
 * hand does with a bar it cannot feel (so every frame rate sees it cross),
 * then lifts away; quick notes bounce straight from one strike into the
 * next. A roll moves the beater side to
 * side inside the top corner; it ends with the beater left on the bar,
 * which stops the ringing.
 */

import { CONTACT, FULL_STRIKE_SPEED, REST_TO_DAMP, SOUNDING_SPEED } from '/src/triangle/strike.ts';
import { BEATER, CORNERS } from '/src/triangle/geometry.ts';

/** The player's head during a performance (world, m), looking along -Z. */
export const HEAD = [0, 1.6, 0];
/** Where the left hand pinches the clip. */
export const HANG = [-0.04, 1.36, -0.4];
/** A point a third of the way up the right side (triangle space), and that side's outward normal. */
const RIGHT = [CORNERS.right[0] + (CORNERS.top[0] - CORNERS.right[0]) / 3, CORNERS.right[1] + (CORNERS.top[1] - CORNERS.right[1]) / 3];
const OUT = [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)];
/** The beater rests this far in front of the face between strikes. */
const READY = 0.11;
/** Through the bar: at speed until this far behind its centre line, then easing to a stop this far behind. */
const THROUGH = 0.004;
const DEPTH = 0.018;
/** The last stretch of each strike is at a steady speed, this long. */
const STEADY = 0.045;
/** Lifting back to READY after a strike, when there is time. */
const LIFT = 0.15;
/** Strikes closer together than this bounce straight from one to the next. */
const BOUNCE = 0.3;
/** A roll: side to side inside the top corner, this far below the corner, this wide, this many cycles a second. */
const ROLL = { below: 0.05, width: 0.026, hz: 6 };
/** Into the corner from in front: the grip this far in front of the face while rolling, and while turning the beater. */
const ROLL_GRIP_Z = 0.09;
const TURN_GRIP_Z = 0.25;
/** The app hears the hands a few milliseconds late, so strikes are aimed this much early. */
const STRIKE_LEAD = 0.004;
/** Loudness each dynamic aims for. */
export const STRIKE_TARGET = { pp: 0.2, p: 0.35, mp: 0.5, mf: 0.62, f: 0.8, ff: 0.95 };
const LOUDNESS_TOLERANCE = 0.15;
const ON_TIME = 0.04;
const DAMP_ON_TIME = 0.1;

/** The beater speed into the bar (m/s) that gives `loudness` (see strikeLoudness). */
export const speedFor = (loudness) => SOUNDING_SPEED + (FULL_STRIKE_SPEED - SOUNDING_SPEED) * loudness ** (1 / 0.6);

const hermite = (a, va, b, vb, span, u) => {
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * a + (u3 - 2 * u2 + u) * span * va + (-2 * u3 + 3 * u2) * b + (u3 - u2) * span * vb;
};
const clamp01 = (u) => Math.min(1, Math.max(0, u));
const ease = (u) => u * u * (3 - 2 * u);
const mixVec = (a, b, u) => a.map((v, k) => v + (b[k] - v) * u);

/** The beater lying across the right side, its grip outside, `z` in front of the face (triangle space). */
const across = (z) => ({ g: [RIGHT[0] + OUT[0] * 0.13, RIGHT[1] + OUT[1] * 0.13, z], a: [-OUT[0], -OUT[1], 0] });
/** The beater pointing into the top corner from in front, `x` across. */
const ROLL_Y = CORNERS.top[1] - ROLL.below;
const corner = (x, z = ROLL_GRIP_Z) => ({ g: [x, ROLL_Y, z], a: [0, 0, -1] });
const mixPose = (p, q, u) => ({ g: mixVec(p.g, q.g, u), a: mixVec(p.a, q.a, u) });
/** Where the beater's rod touches a side inside the corner (|x|, triangle space). */
const ROLL_TOUCH = ROLL.below * Math.tan(Math.PI / 6) - CONTACT / Math.cos(Math.PI / 6);

/** A beater pose's rod ends, triangle space. */
export function rodEnds({ g, a }) {
  const l = Math.hypot(...a) || 1;
  const u = a.map((v) => v / l);
  return { butt: g.map((v, k) => v - u[k] * BEATER.behind), tip: g.map((v, k) => v + u[k] * (BEATER.length - BEATER.behind)) };
}

/** Plans a performance: each strike's contact and speed, how its approach starts, and the roll. Times are seconds from the start. */
export function planPerformance(song, tempo = song.tempo) {
  const beat = 60 / tempo;
  const first = Math.min(...song.events.map((e) => e.beat));
  const LEAD_IN = 0.5;
  const strikes = [];
  let roll = null;
  for (const e of song.events) {
    const time = LEAD_IN + (e.beat - first) * beat;
    const loudness = STRIKE_TARGET[e.dynamic];
    if (e.roll) {
      roll = { beat: e.beat, dynamic: e.dynamic, start: time, until: time + e.roll * beat };
      continue;
    }
    strikes.push({ beat: e.beat, dynamic: e.dynamic, time, contact: time - STRIKE_LEAD, loudness, speed: speedFor(loudness) });
  }
  strikes.forEach((k, i) => {
    const prev = strikes[i - 1];
    const steadyFrom = CONTACT + k.speed * STEADY;
    k.through = k.contact + (CONTACT + THROUGH) / k.speed;
    k.stop = k.through + (2 * (DEPTH - THROUGH)) / k.speed;
    if (prev && k.contact - prev.contact <= BOUNCE) {
      k.bounce = true;
      k.start = prev.stop;
    } else {
      k.bounce = false;
      k.approach = (1.5 * (READY - steadyFrom)) / k.speed;
      k.start = k.contact - STEADY - k.approach;
    }
    k.steadyFrom = steadyFrom;
  });
  if (roll) {
    // Side to side from the middle, right side first: the first touch lands on the beat.
    const w = 2 * Math.PI * ROLL.hz;
    const touch = Math.asin(ROLL_TOUCH / ROLL.width);
    roll.from = roll.start - STRIKE_LEAD - touch / w;
    roll.turnFrom = roll.from - 0.45;
    roll.contacts = [];
    for (let k = 0; ; k++) {
      const t = roll.from + (touch + k * Math.PI) / w;
      if (t > roll.until - REST_TO_DAMP) break;
      roll.contacts.push({ time: t + STRIKE_LEAD, side: k % 2 === 0 ? 'right side' : 'left side' });
    }
    // The last stroke stays on the bar; resting there stops the ringing.
    const last = roll.contacts.at(-1);
    roll.restSign = roll.contacts.length % 2 === 1 ? 1 : -1;
    roll.restFrom = last.time - STRIKE_LEAD;
    roll.chokeAt = last.time + REST_TO_DAMP;
  }
  const end = (roll ? roll.chokeAt : strikes.at(-1).contact + LIFT) + 0.6;
  return { strikes, roll, end, beat };
}

/** Where the beater is at time t: { g grip, a along the rod }, triangle space. */
export function beaterAt(plan) {
  const { strikes, roll } = plan;
  const single = (t) => {
    let i = -1;
    while (i < strikes.length - 1 && t >= strikes[i + 1].start) i++;
    if (i < 0) return READY;
    const k = strikes[i];
    if (t < k.contact - STEADY) {
      return k.bounce
        ? hermite(-DEPTH, 0, k.steadyFrom, -k.speed, k.contact - STEADY - k.start, clamp01((t - k.start) / (k.contact - STEADY - k.start)))
        : hermite(READY, 0, k.steadyFrom, -k.speed, k.approach, clamp01((t - k.start) / k.approach));
    }
    // Touching the bar at the strike's time, and on through it.
    if (t < k.through) return CONTACT - k.speed * (t - k.contact);
    if (t < k.stop) return hermite(-THROUGH, -k.speed, -DEPTH, 0, k.stop - k.through, (t - k.through) / (k.stop - k.through));
    return hermite(-DEPTH, 0, READY, 0, LIFT, clamp01((t - k.stop) / LIFT));
  };
  return (t) => {
    if (!roll || t < roll.turnFrom) return across(single(t));
    if (t < roll.turnFrom + 0.25) return mixPose(across(READY), corner(0, TURN_GRIP_Z), ease((t - roll.turnFrom) / 0.25));
    if (t < roll.from) return mixPose(corner(0, TURN_GRIP_Z), corner(0), ease((t - roll.turnFrom - 0.25) / (roll.from - roll.turnFrom - 0.25)));
    const x = ROLL.width * Math.sin(2 * Math.PI * ROLL.hz * (t - roll.from));
    if (t < roll.restFrom) return corner(x);
    // Stopped on the bar: a little past touching, on the last stroke's side, and left there.
    return corner(roll.restSign * (ROLL_TOUCH + 0.0025 * clamp01((t - roll.restFrom) / 0.01)));
  };
}

/**
 * Scores the strikes heard ({ t, loudness, side }) and damps ({ t })
 * against the plan: each single strike once, on time and as loud as its
 * dynamic; the roll nearly every stroke, side to side, and stopped on time.
 */
export function scoreStrikes(plan, heard, damps) {
  const used = new Set();
  const report = plan.strikes.map((k) => {
    let best = -1;
    heard.forEach((h, j) => {
      if (used.has(j) || Math.abs(h.t - k.time) > ON_TIME) return;
      if (best < 0 || Math.abs(h.t - k.time) < Math.abs(heard[best].t - k.time)) best = j;
    });
    if (best >= 0) used.add(best);
    const h = heard[best];
    return {
      beat: k.beat,
      dynamic: k.dynamic,
      want: k.loudness,
      heard: h ? Math.round(h.loudness * 100) / 100 : null,
      lateMs: h ? Math.round((h.t - k.time) * 1000) : null,
      ok: h != null && Math.abs(h.loudness - k.loudness) <= LOUDNESS_TOLERANCE,
    };
  });
  const { roll } = plan;
  if (roll) {
    const inRoll = [];
    heard.forEach((h, j) => {
      if (!used.has(j) && h.t >= roll.start - ON_TIME && h.t <= roll.chokeAt) {
        used.add(j);
        inRoll.push(h);
      }
    });
    const alternating = inRoll.every((h, i) => i === 0 || h.side !== inRoll[i - 1].side);
    const choke = damps.find((d) => Math.abs(d.t - roll.chokeAt) <= DAMP_ON_TIME);
    report.push({
      beat: roll.beat,
      dynamic: `${roll.dynamic} roll`,
      strokes: `${inRoll.length}/${roll.contacts.length}`,
      alternating,
      loudness: inRoll.length ? Math.round((inRoll.reduce((s, h) => s + h.loudness, 0) / inRoll.length) * 100) / 100 : null,
      dampLateMs: choke ? Math.round((choke.t - roll.chokeAt) * 1000) : null,
      ok: inRoll.length >= roll.contacts.length - 1 && alternating && choke != null,
    });
  }
  const extra = heard.filter((_, j) => !used.has(j)).map((h) => ({ t: Math.round(h.t * 1000) / 1000, loudness: Math.round(h.loudness * 100) / 100 }));
  const extraDamps = damps.filter((d) => !roll || Math.abs(d.t - roll.chokeAt) > DAMP_ON_TIME).map((d) => Math.round(d.t * 1000) / 1000);
  return { report, extra, extraDamps };
}

// -------------------------------------------------------------- performing

/** The performance clock never steps further than this in a frame (s). */
const MAX_STEP = 0.034;
const dispatch = (method, params = {}) => window.IWER_MCP.dispatch(method, params);

/**
 * Plays `song` live: takes out the triangle, pinches its clip in the left
 * hand at HANG, closes the right round the beater, drives the beater every
 * frame and records every strike and damp the app sounds, straight from its
 * synth. Calls `onEvent(index)` as each strike's approach begins. Returns
 * the score.
 */
export async function perform(song, { tempo = song.tempo, onEvent = () => {} } = {}) {
  const world = window.FRAMEWORK_MCP_RUNTIME.world;
  const systems = Array.from(world.systems ?? []);
  const sys = systems.find((s) => s?.instrument === 'triangle');
  const guitar = systems.find((s) => s?.fretReader && s?.synth);
  if (guitar) {
    const { AirGuitar } = await import('/src/guitar/air-guitar-component.ts');
    guitar.entity.setValue(AirGuitar, 'active', false);
  }
  for (const s of systems) if (s?.instrument && s !== sys) s.entity.setValue(s.component, 'active', false);
  sys.entity.setValue(sys.component, 'active', true);
  await sys.synth.warm;

  const plan = planPerformance(song, tempo);
  const at = beaterAt(plan);
  await dispatch('set_input_mode', { mode: 'hand' });
  await dispatch('set_hand_pose', { device: 'hand-left', poseId: 'pinch' });
  await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'fist' });

  const tri = sys.model.triangle;
  const V = (x = 0, y = 0, z = 0) => tri.position.clone().set(x, y, z);
  const M = () => tri.matrixWorld.clone().identity();
  const Q = () => tri.quaternion.clone().identity();
  const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
  const [left, right] = [window.IWER_DEVICE.hands.left, window.IWER_DEVICE.hands.right];

  // Hold both hands still once: where the pinch is, and where the beater sits, relative to the wrist.
  const ref = [0.3, 1.0, -0.5];
  left.setPin({ anchor: 'wrist', target: [0, 1.0, -0.5], wristRotation: [0, 0, 0, 1] });
  right.setPin({ anchor: 'wrist', target: ref, wristRotation: [0, 0, 0, 1] });
  for (let i = 0; i < 6; i++) await nextFrame();
  const j = sys.left.positions;
  const pinch = [0, 1, 2].map((k) => (j[4 * 3 + k] + j[9 * 3 + k]) / 2 - [0, 1.0, -0.5][k]);
  const wristFromBeater = M().compose(V(...ref), Q(), V(1, 1, 1)).invert().multiply(sys.model.beater.matrixWorld).invert();
  const leftAt = HANG.map((v, k) => v - pinch[k]);

  // Reused every frame.
  const X = V();
  const Y = V();
  const Z = V();
  const G = V();
  const P = V();
  const S = V();
  const R = Q();
  const F = M();
  const place = (pose) => {
    left.setPin({ anchor: 'wrist', target: leftAt, wristRotation: [0, 0, 0, 1] });
    tri.updateMatrixWorld(true);
    G.set(...pose.g).applyMatrix4(tri.matrixWorld);
    X.set(...pose.a).transformDirection(tri.matrixWorld);
    Y.set(0, 1, 0).addScaledVector(X, -X.y);
    if (Y.lengthSq() < 1e-6) Y.set(1, 0, 0).addScaledVector(X, -X.x);
    Y.normalize();
    Z.crossVectors(X, Y);
    F.makeBasis(X, Y, Z).setPosition(G).multiply(wristFromBeater);
    F.decompose(P, R, S);
    right.setPin({ anchor: 'wrist', target: [P.x, P.y, P.z], wristRotation: [R.x, R.y, R.z, R.w] });
  };
  for (let i = 0; i < 20; i++) {
    place(at(0));
    await nextFrame();
  }

  // The hands are driven from the XR session's own frame callback, which runs
  // after the app's update every frame: the app always sees each placement
  // the frame after, so each frame places the beater where it should be when
  // that next frame comes (`ahead`). From the page's animation frames
  // instead, the app sees some placements at once and some a frame late, and
  // the beater's speed reads wrong.
  const session = world.renderer.xr.getSession();
  // Listen at the synth: every strike and damp, on the performance clock.
  const heard = [];
  const damps = [];
  let clock = 0;
  let ahead = 0;
  const { strike, damp } = sys.synth;
  sys.synth.strike = function (sound, when) {
    heard.push({ t: clock + ahead, loudness: sound.loudness, side: ['base', 'left side', 'right side'][sys.strike.side] });
    return strike.call(this, sound, when);
  };
  sys.synth.damp = function (when) {
    damps.push({ t: clock + ahead });
    return damp.call(this, when);
  };

  let shown = -1;
  let frames = 0;
  let stalls = 0;
  // The clock runs on the frames' own timestamps, which the app's frame times also come from.
  let wall = await new Promise((r) => session.requestAnimationFrame(r));
  const wallStart = wall;
  try {
    await new Promise((resolve, reject) => {
      const tick = (now) => {
        try {
          const step = (now - wall) / 1000;
          wall = now;
          if (step > MAX_STEP) stalls++;
          clock += Math.min(step, MAX_STEP);
          ahead = Math.min(step, MAX_STEP);
          place(at(clock + ahead));
          frames++;
          while (shown + 1 < plan.strikes.length && plan.strikes[shown + 1].start <= clock) onEvent(++shown);
          if (plan.roll && shown < plan.strikes.length && clock >= plan.roll.turnFrom) onEvent(++shown);
          if (clock < plan.end) session.requestAnimationFrame(tick);
          else resolve();
        } catch (err) {
          reject(err);
        }
      };
      session.requestAnimationFrame(tick);
    });
  } finally {
    sys.synth.strike = strike;
    sys.synth.damp = damp;
  }
  const { report, extra, extraDamps } = scoreStrikes(plan, heard, damps);
  const late = report.filter((r) => r.lateMs != null).map((r) => Math.abs(r.lateMs));
  return {
    strikesRight: report.filter((r) => r.ok).length,
    strikesTotal: report.length,
    extraStrikes: extra,
    extraDamps,
    fps: Math.round(frames / ((wall - wallStart) / 1000)),
    tempoDragPct: Math.round(((wall - wallStart) / 1000 / clock - 1) * 1000) / 10,
    stalls,
    worstTimingMs: Math.max(...late),
    meanTimingMs: Math.round(late.reduce((a, b) => a + b, 0) / Math.max(1, late.length)),
    strikes: report,
  };
}
