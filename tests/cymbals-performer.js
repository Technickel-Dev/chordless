/**
 * Plays a cymbal part on the air cymbals (see songs/william-tell.js),
 * planning both cymbals' motion the way a cymbal player moves, and performs
 * it live with IWER's emulated hands closed round the straps, or offline
 * for the check (cymbals-check.mjs).
 *
 * The plates rest about 30 cm apart in front of the chest, upright and
 * facing each other, the straps upright (thumbs up). For a clash they close
 * faster and faster, then hold a steady speed for the last 50 ms, so the
 * app measures exactly the speed that gives the clash its loudness, and
 * carry on through each other a little before stopping, as hands holding
 * cymbals of air do (so every frame rate sees them meet). The
 * right plate glides down as they close and meets the left a few
 * centimetres higher: a glancing clash (plates that meet flat and centred
 * trap air and sound muffled). Then they rebound open to ring. A secco
 * clash is held together until the ringing stops. The last crash swings
 * open toward the audience, then both rims are pulled in to the chest to
 * stop it.
 */

import { CHEST, FULL_CLASH_SPEED, HOLD_TO_DAMP, SOUNDING_SPEED } from '/src/cymbals/clash.ts';
import { CYMBAL } from '/src/cymbals/geometry.ts';

/** The player's head during a performance (world, m), looking along -Z. */
export const HEAD = [0, 1.6, 0];
/** Where the plates meet. */
const MEET = [0, 1.22, -0.42];
/** Rim gap at rest, between clashes. */
const REST_GAP = 0.3;
/** The right plate rests this much higher, and meets the left this much higher. */
const LIFT_REST = 0.08;
const LIFT_MEET = 0.045;
/** The last stretch before contact is at a steady speed, this long. */
const STEADY = 0.05;
/** The plates carry on through each other at speed this far, then ease to a stop at DEPTH. */
const THROUGH = 0.012;
const DEPTH = 0.03;
/** Rebound to rest after a clash. */
const REBOUND = 0.22;
/** A secco clash is held together this long, then opened over SECCO_OPEN. */
const SECCO_HOLD = 0.25;
const SECCO_OPEN = 0.2;
/** After the last crash: swung open toward the audience (turned this far, raised, wide apart). */
const SHOW = { time: 0.4, turn: (55 * Math.PI) / 180, rise: 0.1, gap: 0.5 };
/** Then turned back to face, and pulled in so both rims press the chest. */
const TO_CHEST = { turnBack: 0.25, pullIn: 0.25, apart: 0.22, z: -0.17, y: 1.2 };
/** The app hears the hands a few milliseconds late, so clashes are aimed this much early. */
const CLASH_LEAD = 0.004;
/** Loudness each dynamic aims for. */
export const CLASH_TARGET = { pp: 0.2, p: 0.35, mf: 0.62, f: 0.8, ff: 0.95 };
/** How close a clash's loudness must come to its dynamic's. */
const LOUDNESS_TOLERANCE = 0.15;
/** How close (s) a clash or a damp must come to its time to count. */
const ON_TIME = 0.05;
const DAMP_ON_TIME = 0.1;

/** The closing speed (m/s) that gives `loudness` (see clashLoudness). */
export const speedFor = (loudness) => SOUNDING_SPEED + (FULL_CLASH_SPEED - SOUNDING_SPEED) * loudness ** (1 / 0.6);

/** A cubic from value a (slope va) to b (slope vb) over `span` seconds, at u in [0, 1]. */
const hermite = (a, va, b, vb, span, u) => {
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * a + (u3 - 2 * u2 + u) * span * va + (-2 * u3 + 3 * u2) * b + (u3 - u2) * span * vb;
};
const clamp01 = (u) => Math.min(1, Math.max(0, u));
const lerp = (a, b, u) => a + (b - a) * u;
const ease = (u) => u * u * (3 - 2 * u);

/** Both cymbals facing each other at MEET, rims `gap` apart, the right `lift` higher, turned and raised for the show. */
function pairPose(gap, lift, turn = 0, rise = 0) {
  const half = (gap + CYMBAL.edgeThickness) / 2;
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  return {
    left: { c: [MEET[0] - half, MEET[1] + rise, MEET[2]], n: [c, 0, -s], a: [0, 1, 0] },
    right: { c: [MEET[0] + half, MEET[1] + lift + rise, MEET[2]], n: [-c, 0, -s], a: [0, 1, 0] },
  };
}

/** Both rims pressed to the chest, plates facing each other. */
function chestPose() {
  const half = TO_CHEST.apart / 2;
  return {
    left: { c: [-half, TO_CHEST.y, TO_CHEST.z], n: [1, 0, 0], a: [0, 1, 0] },
    right: { c: [half, TO_CHEST.y, TO_CHEST.z], n: [-1, 0, 0], a: [0, 1, 0] },
  };
}

/** Mixes two poses (normals renormalized). */
function mixPose(p, q, u) {
  const mix = (a, b) => {
    const n = a.n.map((v, k) => lerp(v, b.n[k], u));
    const l = Math.hypot(...n) || 1;
    return { c: a.c.map((v, k) => lerp(v, b.c[k], u)), n: n.map((v) => v / l), a: a.a };
  };
  return { left: mix(p.left, q.left), right: mix(p.right, q.right) };
}

/**
 * Plans a performance: when each clash meets, how fast, and when its
 * approach starts. Times are seconds from the start.
 */
export function planPerformance(song, tempo = song.tempo) {
  const beat = 60 / tempo;
  const first = Math.min(...song.events.map((e) => e.beat));
  // The first approach needs a moment; the hands settle before the clock starts.
  const LEAD_IN = 0.5;
  const clashes = song.events.map((e) => {
    const time = LEAD_IN + (e.beat - first) * beat;
    const loudness = CLASH_TARGET[e.dynamic];
    const speed = speedFor(loudness);
    // Steady for the last stretch; before that, speeding up from rest over about 1.5x the distance's time.
    const steadyFrom = speed * STEADY;
    const accel = (1.5 * (REST_GAP - steadyFrom)) / speed;
    const contact = time - CLASH_LEAD;
    return {
      beat: e.beat,
      dynamic: e.dynamic,
      time,
      contact,
      speed,
      loudness,
      steadyFrom,
      start: contact - STEADY - accel,
      accel,
      secco: e.secco === true,
      choke: e.choke != null ? time + e.choke * beat : null,
    };
  });
  const last = clashes.at(-1);
  const end = (last.choke ?? last.time + REBOUND) + 0.5;
  return { clashes, end, beat };
}

/** Where both cymbals are at time t: { left, right }, each { c centre, n face normal, a across the strap }. */
export function cymbalsAt(plan) {
  const { clashes } = plan;
  return (t) => {
    let i = -1;
    while (i < clashes.length - 1 && t >= clashes[i + 1].start) i++;
    if (i < 0) return pairPose(REST_GAP, LIFT_REST);
    const k = clashes[i];
    if (t < k.contact - STEADY) {
      const u = (t - k.start) / k.accel;
      return pairPose(hermite(REST_GAP, 0, k.steadyFrom, -k.speed, k.accel, u), lerp(LIFT_REST, LIFT_MEET, u * 0.7));
    }
    const steadyEnd = k.contact + THROUGH / k.speed;
    if (t < steadyEnd) {
      const u = clamp01((t - (k.contact - STEADY)) / STEADY);
      return pairPose(-k.speed * (t - k.contact), lerp(LIFT_REST + (LIFT_MEET - LIFT_REST) * 0.7, LIFT_MEET, u));
    }
    const stopping = (2 * (DEPTH - THROUGH)) / k.speed;
    if (t < steadyEnd + stopping) {
      return pairPose(hermite(-THROUGH, -k.speed, -DEPTH, 0, stopping, (t - steadyEnd) / stopping), LIFT_MEET);
    }
    const after = t - steadyEnd - stopping;
    if (k.secco) {
      if (after < SECCO_HOLD) return pairPose(-DEPTH, LIFT_MEET);
      const u = clamp01((after - SECCO_HOLD) / SECCO_OPEN);
      return pairPose(lerp(-DEPTH, REST_GAP, ease(u)), lerp(LIFT_MEET, LIFT_REST, u));
    }
    if (k.choke != null && after >= REBOUND) {
      // Rebounded open, swing toward the audience, then turn back and press the rims to the chest.
      const show = pairPose(SHOW.gap, LIFT_REST, SHOW.turn, SHOW.rise);
      const turnedBack = pairPose(SHOW.gap, LIFT_REST, 0, SHOW.rise / 2);
      const pressAt = k.choke;
      const turnAt = pressAt - TO_CHEST.pullIn - TO_CHEST.turnBack;
      if (t < turnAt) return mixPose(pairPose(REST_GAP, LIFT_REST), show, ease(clamp01((after - REBOUND) / SHOW.time)));
      if (t < pressAt - TO_CHEST.pullIn) return mixPose(show, turnedBack, ease((t - turnAt) / TO_CHEST.turnBack));
      return mixPose(turnedBack, chestPose(), ease(clamp01((t - (pressAt - TO_CHEST.pullIn)) / TO_CHEST.pullIn)));
    }
    const u = clamp01(after / REBOUND);
    return pairPose(hermite(-DEPTH, 0, REST_GAP, 0, REBOUND, u), lerp(LIFT_MEET, LIFT_REST, u));
  };
}

/** The chest the app damps on, for the head at HEAD looking along -Z (see AirCymbalsSystem). */
export const CHEST_AT = [HEAD[0], HEAD[1] - CHEST.below, HEAD[2] + CHEST.behind];

/**
 * Scores the clashes heard ({ t, loudness, flush }) and damps ({ t })
 * against the plan: each clash once, on time, as loud as its dynamic and
 * not muffled; each secco and choke damped on time.
 */
export function scoreClashes(plan, heard, damps) {
  const used = new Set();
  const report = plan.clashes.map((k) => {
    let best = -1;
    heard.forEach((h, j) => {
      if (used.has(j) || Math.abs(h.t - k.time) > ON_TIME) return;
      if (best < 0 || Math.abs(h.t - k.time) < Math.abs(heard[best].t - k.time)) best = j;
    });
    if (best >= 0) used.add(best);
    const h = heard[best];
    const dampAt = k.secco ? k.contact + HOLD_TO_DAMP : k.choke;
    const damp = dampAt == null ? null : damps.find((d) => Math.abs(d.t - dampAt) <= DAMP_ON_TIME);
    const ok = h != null && Math.abs(h.loudness - k.loudness) <= LOUDNESS_TOLERANCE && !h.flush && (dampAt == null || damp != null);
    return {
      beat: k.beat,
      dynamic: k.dynamic + (k.secco ? ' secco' : '') + (k.choke != null ? ' choked' : ''),
      want: k.loudness,
      heard: h ? Math.round(h.loudness * 100) / 100 : null,
      lateMs: h ? Math.round((h.t - k.time) * 1000) : null,
      dampLateMs: dampAt == null ? undefined : damp ? Math.round((damp.t - dampAt) * 1000) : null,
      ok,
    };
  });
  const extra = heard.filter((_, j) => !used.has(j)).map((h) => ({ t: Math.round(h.t * 1000) / 1000, loudness: h.loudness }));
  // Damps nothing asked for: ringing cut short.
  const wanted = plan.clashes.flatMap((k) => (k.secco ? [k.contact + HOLD_TO_DAMP] : k.choke != null ? [k.choke] : []));
  const extraDamps = damps.filter((d) => !wanted.some((w) => Math.abs(d.t - w) <= DAMP_ON_TIME)).map((d) => Math.round(d.t * 1000) / 1000);
  return { report, extra, extraDamps };
}

// -------------------------------------------------------------- performing

/** The performance clock never steps further than this in a frame (s): a stall slows the music instead of skipping it. */
const MAX_STEP = 0.034;
const dispatch = (method, params = {}) => window.IWER_MCP.dispatch(method, params);

/**
 * Plays `song` live: takes out the cymbals, closes both emulated hands round
 * the straps, drives them every frame and records every clash and damp the
 * app sounds, straight from its synth. Calls `onEvent(index)` as each clash
 * is due. Returns the score.
 */
export async function perform(song, { tempo = song.tempo, onEvent = () => {} } = {}) {
  const world = window.FRAMEWORK_MCP_RUNTIME.world;
  const systems = Array.from(world.systems ?? []);
  const sys = systems.find((s) => s?.instrument === 'cymbals');
  const guitar = systems.find((s) => s?.fretReader && s?.synth);
  if (guitar) {
    const { AirGuitar } = await import('/src/guitar/air-guitar-component.ts');
    guitar.entity.setValue(AirGuitar, 'active', false);
  }
  for (const s of systems) if (s?.instrument && s !== sys) s.entity.setValue(s.component, 'active', false);
  sys.entity.setValue(sys.component, 'active', true);
  await sys.synth.warm;

  const plan = planPerformance(song, tempo);
  const at = cymbalsAt(plan);
  await dispatch('set_input_mode', { mode: 'hand' });
  await dispatch('set_hand_pose', { device: 'hand-left', poseId: 'fist' });
  await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'fist' });

  const sample = sys.model.cymbals[0];
  const V = (x = 0, y = 0, z = 0) => sample.position.clone().set(x, y, z);
  const M = () => sample.matrixWorld.clone().identity();
  const Q = () => sample.quaternion.clone().identity();
  const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
  const hands = [window.IWER_DEVICE.hands.left, window.IWER_DEVICE.hands.right];

  // Hold each fist still once and see where the app puts its cymbal.
  const ref = { p: [0, 1.0, -0.5], q: [0, 0, 0, 1] };
  for (const hand of hands) hand.setPin({ anchor: 'wrist', target: ref.p, wristRotation: ref.q });
  for (let i = 0; i < 6; i++) await nextFrame();
  const refWrist = M().compose(V(...ref.p), Q().set(...ref.q), V(1, 1, 1)).invert();
  const wristFromCymbal = sys.model.cymbals.map((c) => refWrist.clone().multiply(c.matrixWorld).invert());

  // Reused every frame.
  const X = V();
  const Y = V();
  const Z = V();
  const P = V();
  const S = V();
  const R = Q();
  const F = M();
  const place = (pose) => {
    ['left', 'right'].forEach((side, i) => {
      const { c, n, a } = pose[side];
      Z.set(n[0], n[1], n[2]).normalize();
      X.set(a[0], a[1], a[2]).addScaledVector(Z, -(a[0] * Z.x + a[1] * Z.y + a[2] * Z.z)).normalize();
      Y.crossVectors(Z, X);
      F.makeBasis(X, Y, Z).setPosition(c[0], c[1], c[2]).multiply(wristFromCymbal[i]);
      F.decompose(P, R, S);
      hands[i].setPin({ anchor: 'wrist', target: [P.x, P.y, P.z], wristRotation: [R.x, R.y, R.z, R.w] });
    });
  };
  for (let i = 0; i < 20; i++) {
    place(at(0));
    await nextFrame();
  }

  // Listen at the synth: every clash and every damp, on the performance clock.
  const heard = [];
  const damps = [];
  let clock = 0;
  const { clash, damp } = sys.synth;
  sys.synth.clash = function (sound, when) {
    heard.push({ t: clock, loudness: sound.loudness, flush: sound.flush });
    return clash.call(this, sound, when);
  };
  let lastDamp = -1;
  sys.synth.damp = function (when) {
    // The app damps every frame while the plates are held; count each hold once.
    if (clock - lastDamp > 0.1) damps.push({ t: clock });
    lastDamp = clock;
    return damp.call(this, when);
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
          place(at(clock));
          frames++;
          // Each clash is shown as its approach begins.
          while (shown + 1 < plan.clashes.length && plan.clashes[shown + 1].start <= clock) onEvent(++shown);
          if (clock < plan.end) requestAnimationFrame(tick);
          else resolve();
        } catch (err) {
          reject(err);
        }
      };
      requestAnimationFrame(tick);
    });
  } finally {
    sys.synth.clash = clash;
    sys.synth.damp = damp;
  }
  const { report, extra, extraDamps } = scoreClashes(plan, heard, damps);
  const late = report.filter((r) => r.lateMs != null).map((r) => Math.abs(r.lateMs));
  return {
    clashesRight: report.filter((r) => r.ok).length,
    clashesTotal: report.length,
    extraClashes: extra,
    extraDamps,
    fps: Math.round(frames / ((wall - wallStart) / 1000)),
    tempoDragPct: Math.round(((wall - wallStart) / 1000 / clock - 1) * 1000) / 10,
    stalls,
    worstTimingMs: Math.max(...late),
    meanTimingMs: Math.round(late.reduce((a, b) => a + b, 0) / Math.max(1, late.length)),
    clashes: report,
  };
}
