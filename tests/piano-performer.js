/**
 * Plays a piano part on the air piano (see songs/william-tell.js), one key
 * at a time per hand, fingered the way a pianist would (thumb to little
 * finger by where the note lies in the hand's position), planning each
 * fingertip's path the way a finger moves over a keyboard, and performs it live with
 * IWER's emulated hands, or offline for the check (piano-check.mjs).
 *
 * Every strike comes down onto its key at the steady speed that gives its
 * dynamic, from just above the key (or, for a repeated note, from a key
 * risen only past its release point, as a pianist repeats a note), carries
 * on a little past the strike point and holds the key down until the note
 * should end. Between notes the finger rises clear of the key it leaves,
 * and up to the next key's level if that one stands higher (a black key),
 * then moves across. Leaving a black key for a white one it slides forward
 * off the black key instead, onto the white key's front: dropping from
 * black-key height would be a fast downward movement just before the
 * strike, which the app hears as a harder blow.
 *
 * Positions are in piano space (see src/piano/geometry.ts); a fingertip's
 * height here is the tracked tip joint's, the pad's bottom PRESS.fingerRadius
 * below it.
 */

import { isBlack, keyAt, keyCenterX, keyTop, PIANO } from '/src/piano/geometry.ts';
import { handBasis, applyPose, poseHand, quatFromAxes, v } from '/tests/hand-rig.js';
import { PRESS } from '/src/piano/keys.ts';

/** The player's head during a performance (world, m), looking along -Z. */
export const HEAD = [0, 1.6, 0];
/** Velocity each dynamic aims for (see strikeVelocity). */
export const VELOCITY_TARGET = { pp: 0.3, p: 0.4, mp: 0.5, mf: 0.6, f: 0.75, ff: 0.92 };
/** How close a strike's velocity must come to its dynamic's. */
const VELOCITY_TOLERANCE = 0.12;
/** How close (s) a strike must come to its time to count. */
const ON_TIME = 0.05;
/** The pad's height over a key's top before coming down onto it: just past where the app lets a finger go of a key. */
const HOVER = PRESS.liftOff + 0.0006;
/** The pad stops this far past the strike point. */
const OVERSHOOT = 0.0012;
/** A repeated note comes down again from this far into its key: just past where the note stops. */
const REPEAT_FROM = 0.0005;
/** A key is held down at least this long, so every frame rate sees it there. */
const MIN_HOLD = 0.02;
/** Fingers rise and move across this fast at most (m/s). */
const RISE_SPEED = 3;
const MOVE_SPEED = 6;
/** And take at least this long over each leg of the way. */
const MIN_LEG = 0.008;
/** Notes are held for this much of the time to the hand's next note. */
const ARTICULATION = 0.85;
/** Where across a key the finger plays: a white key's front, a black key's middle. */
const Z_WHITE = -0.035;
const Z_BLACK = -0.105;
/** Where each hand waits before and after: above the keys it starts on, out in front. */
const WAIT = { up: 0.04, z: 0.03 };
/** The app hears the hands a few milliseconds late, so strikes are aimed this much early. */
const STRIKE_LEAD = 0.004;
const LEAD_IN = 0.8;

/** The downward speed (m/s) that gives `velocity` (the inverse of strikeVelocity). */
export function speedFor(velocity) {
  const t = Math.max(0, (velocity - 0.1) / 0.9) ** (1 / 0.75);
  return 0.02 + 0.95 * t;
}

const NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** MIDI number of a note name such as 'C#5' or 'Bb2'. */
export function midiOf(name) {
  const [, letter, accidental, octave] = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  return 12 * (Number(octave) + 1) + NAMES[letter] + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0);
}

/** Where a key is played, at pad height `y` over its top. */
const over = (midi, y) => [keyCenterX(midi), keyTop(midi) + y, isBlack(midi) ? Z_BLACK : Z_WHITE];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);


/**
 * Fingers every strike of one hand (0 thumb to 4 little finger, whichever
 * hand it is). The notes are cut into hand positions that span a sixth;
 * within one the pitches, low to high, take the fingers in order (the right
 * thumb lowest, the left thumb highest), a thumb never on a black key. A
 * repeated note alternates between two neighbouring fingers.
 */
function assignFingers(mine, hand) {
  let i = 0;
  while (i < mine.length) {
    let j = i;
    let low = mine[i].midi;
    let high = low;
    while (j + 1 < mine.length && Math.max(high, mine[j + 1].midi) - Math.min(low, mine[j + 1].midi) <= 9) {
      j++;
      low = Math.min(low, mine[j].midi);
      high = Math.max(high, mine[j].midi);
    }
    const pitches = [...new Set(mine.slice(i, j + 1).map((s) => s.midi))].sort((a, b) => a - b);
    for (let k = i; k <= j; k++) {
      const rank = pitches.indexOf(mine[k].midi);
      const spread = pitches.length > 1 ? Math.round((rank * 4) / (pitches.length - 1)) : 2;
      // Up to five pitches take neighbouring fingers from the middle out; more are spread across all five.
      const span = Math.min(4, pitches.length - 1);
      const offset = Math.round((4 - span) / 2);
      let finger = pitches.length > 5 ? spread : offset + Math.min(4 - offset, rank);
      finger = hand === 'right' ? finger : 4 - finger;
      if (finger === 0 && isBlack(mine[k].midi)) finger = 1;
      mine[k].finger = finger;
    }
    i = j + 1;
  }
  mine.forEach((s, k) => {
    if (k > 0 && mine[k - 1].midi === s.midi) s.finger = mine[k - 1].finger === 2 ? 1 : mine[k - 1].finger === 1 ? 2 : mine[k - 1].finger + (mine[k - 1].finger < 4 ? 1 : -1);
  });
}

/**
 * Plans a performance: each hand's strikes, and the keyframes of its
 * fingertip ({ t, p }, pad positions in piano space). Times are seconds
 * from the start.
 */
export function planPerformance(song, tempo = song.tempo, gain = 1) {
  const beat = 60 / tempo;
  const first = Math.min(...song.events.map((e) => e.beat));
  const strikes = song.events.map((e) => {
    const midi = midiOf(e.note);
    if (midi < PIANO.lowest || midi > PIANO.highest) throw new Error(`${e.note} is off the keyboard`);
    const velocity = VELOCITY_TARGET[e.dynamic];
    return {
      beat: e.beat,
      hand: e.hand,
      note: e.note,
      midi,
      dynamic: e.dynamic,
      time: LEAD_IN + (e.beat - first) * beat,
      velocity,
      // The app's frame-sampled reading of a fast blow runs low, so hard blows are made harder.
      // Quiet blows are tied to the time there is to make them, so they give way less.
      speed: (speedFor(velocity) > 0.4 ? gain : 1 - (1 - gain) * 0.35) * speedFor(velocity) * (1 + 0.3 * Math.max(0, speedFor(velocity) - 0.2)),
      beats: e.beats,
    };
  });
  const paths = {};
  const ramps = {};
  let end = 0;
  for (const hand of ['left', 'right']) {
    const mine = strikes.filter((s) => s.hand === hand).sort((a, b) => a.time - b.time);
    assignFingers(mine, hand);
    // First where each strike comes down from, and when.
    mine.forEach((s, i) => {
      const prev = mine[i - 1];
      // A hard blow comes from higher up, so the app sees the speed over a few frames.
      const run = Math.max(0, s.speed - 0.4) * 0.04;
      s.from = over(s.midi, prev?.midi === s.midi ? Math.max(REPEAT_FROM, run) : HOVER + run);
      const strikeY = keyTop(s.midi) - PRESS.onDepth;
      s.down = s.time - STRIKE_LEAD - (s.from[1] - strikeY) / s.speed;
      s.bottom = over(s.midi, -(PRESS.onDepth + OVERSHOOT));
      s.bottomAt = s.time - STRIKE_LEAD + OVERSHOOT / s.speed;
    });
    // Then how long each is held and how the finger gets to the next.
    const keys = [];
    const start = mine[0];
    const wait = [start.from[0], start.from[1] + WAIT.up, WAIT.z];
    keys.push({ t: 0, p: wait }, { t: Math.max(0.05, start.down - 0.25), p: wait });
    mine.forEach((s, i) => {
      const next = mine[i + 1];
      keys.push({ t: s.down, p: s.from }, { t: s.bottomAt, p: s.bottom });
      if (next == null) {
        const release = s.time + (s.beats ?? 1) * beat * ARTICULATION;
        s.release = release;
        const up = over(s.midi, HOVER);
        keys.push({ t: release, p: s.bottom }, { t: release + 0.05, p: up }, { t: release + 0.4, p: [up[0], up[1] + WAIT.up, WAIT.z] });
        end = Math.max(end, release + 0.6);
        return;
      }
      // The way to the next key: straight up for a repeat; up clear and across;
      // or, from a black key to a lower white one, slid off forward.
      let via = [];
      if (next.midi === s.midi) {
        via = [];
      } else if (isBlack(s.midi) && !isBlack(next.midi)) {
        via = [];
      } else {
        const lift = Math.max(keyTop(s.midi), keyTop(next.midi)) + HOVER;
        via = [[s.bottom[0], lift, s.bottom[2]]];
      }
      const legs = [s.bottom, ...via, next.from];
      let travel = 0;
      for (let k = 1; k < legs.length; k++) {
        const vertical = legs[k][0] === legs[k - 1][0] && legs[k][2] === legs[k - 1][2];
        travel += dist(legs[k - 1], legs[k]) / (vertical ? RISE_SPEED : MOVE_SPEED);
      }
      const latest = next.down - Math.max(travel, MIN_LEG * (legs.length - 1));
      let release = Math.max(s.bottomAt + MIN_HOLD, Math.min(s.time + (next.time - s.time) * ARTICULATION, latest));
      // A repeated note lets its key right up early, so every frame rate sees it let go.
      if (next.midi === s.midi) release = Math.max(s.bottomAt + MIN_HOLD, s.bottomAt + (latest - s.bottomAt) * 0.4);
      if (release > latest + 1e-6) throw new Error(`no time to get from ${s.note} to ${next.note} at beat ${next.beat}`);
      s.release = release;
      keys.push({ t: release, p: s.bottom });
      // Spread the legs over the time left, each in proportion to its length.
      const span = next.down - release;
      const lengths = legs.slice(1).map((p, k) => dist(legs[k], p));
      const total = lengths.reduce((a, b) => a + b, 0) || 1;
      let t = release;
      via.forEach((p, k) => {
        t += (span * lengths[k]) / total;
        keys.push({ t, p });
      });
    });
    paths[hand] = keys;
    // The hand changes finger on the way between two keys: the finger rises off its key first, then the hand slides across to the next finger.
    ramps[hand] = {
      first: mine[0].finger,
      list: mine.slice(1).map((s, i) => {
        const t1 = Math.max(s.down, mine[i].release + 0.01);
        return { t0: (mine[i].release + t1) / 2, t1, from: mine[i].finger, to: s.finger };
      }),
    };
  }
  return { strikes: strikes.sort((a, b) => a.time - b.time), paths, ramps, end, beat };
}

/** Where both fingertips (the tip joints) are at time t: { left, right }, piano space. */
export function tipsAt(plan) {
  const at = (keys, t) => {
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1].t) i++;
    const [k0, k1] = [keys[i], keys[i + 1] ?? keys[i]];
    const u = k1.t > k0.t ? Math.min(1, Math.max(0, (t - k0.t) / (k1.t - k0.t))) : 1;
    const p = k0.p.map((v, k) => v + (k1.p[k] - v) * u);
    p[1] += PRESS.fingerRadius;
    return p;
  };
  return (t) => ({ left: at(plan.paths.left, t), right: at(plan.paths.right, t) });
}

// ------------------------------------------------------------ the hands

/** The hand's fingers point forward and tipped this far down. */
const HAND_TILT = (30 * Math.PI) / 180;
/**
 * Each finger's tip from the hand's wrist, thumb first: how far along the
 * fingers, and across the hand toward the thumb (m). The fingers fan out a
 * little to reach neighbouring white keys.
 */
const REACH = [0.085, 0.15, 0.16, 0.152, 0.135];
const ACROSS = [0.05, 0.035, 0.01, -0.013, -0.034];
/** Beyond here (toward the black keys) the idle fingers do not stray while a white key is played. */
const Z_FRONT = -0.03;
/** A finger that is not playing hovers this far over the key under it (m): clear of its release point. */
const CLEARANCE = 0.005;

const smooth = (u) => u * u * (3 - 2 * u);
const between = (table, f) => {
  const k = Math.min(3, Math.max(0, Math.floor(f)));
  return table[k] + (table[k + 1] - table[k]) * (f - k);
};

/**
 * Where each hand's five fingertips and its wrist are at time t, for the
 * live hands and the offline check: { left, right }, each { tips, wrist,
 * forward, thumbSide, active } with the tips thumb first, in piano space,
 * and `active[k]` how much finger k is the one playing (0 to 1). The
 * playing fingertip follows the planned path; the hand is built round it,
 * the other fingers hovering over the keys beside it. Between two keys the
 * hand slides from one finger to the next.
 */
export function handsAt(plan) {
  const path = tipsAt(plan);
  const forward = [0, -Math.sin(HAND_TILT), -Math.cos(HAND_TILT)];
  const fingerAt = (r, t) => {
    let f = r.first;
    for (const c of r.list) {
      if (t < c.t0) break;
      f = t >= c.t1 ? c.to : c.from + (c.to - c.from) * smooth((t - c.t0) / (c.t1 - c.t0));
    }
    return f;
  };
  const one = (side, p, f) => {
    const sign = side === 'right' ? 1 : -1;
    const thumbSide = [-sign, 0, 0];
    const reach = between(REACH, f);
    const across = between(ACROSS, f);
    const wrist = [0, 1, 2].map((i) => p[i] - forward[i] * reach - thumbSide[i] * across);
    const tips = [];
    const active = [];
    for (let k = 0; k < 5; k++) {
      const x = wrist[0] + forward[0] * REACH[k] + thumbSide[0] * ACROSS[k];
      // The fingers beside the playing one stay over the front of the white keys, never in among the black ones.
      const z0 = wrist[2] + forward[2] * REACH[k];
      const a = Math.max(0, 1 - Math.abs(k - f) / 0.15);
      const z = Math.max(z0, Z_FRONT) + (z0 - Math.max(z0, Z_FRONT)) * a;
      const under = keyAt(x, z);
      const clear = (under >= 0 ? keyTop(under) : 0) + PRESS.fingerRadius + CLEARANCE;
      // The idle fingers hover just over the keys; the playing one follows the path.
      tips.push([x, clear + (p[1] - clear) * a, z]);
      active.push(a);
    }
    return { tips, wrist, forward, thumbSide, active };
  };
  return (t) => {
    const p = path(t);
    return { left: one('left', p.left, fingerAt(plan.ramps.left, t)), right: one('right', p.right, fingerAt(plan.ramps.right, t)) };
  };
}

/** Poses a hand (see handsAt) as a full set of joints for IWER, in piano space. */
export function poseFor(hand, side) {
  const rig = handBasis(hand.wrist, hand.forward, hand.thumbSide, side === 'right');
  const names = ['index', 'middle', 'ring', 'pinky'];
  const targets = { index: hand.tips[1], middle: hand.tips[2], ring: hand.tips[3], pinky: hand.tips[4] };
  return poseHand(
    { ...rig, upright: v(0, 1, 0.25), strays: () => 0 },
    { targets, pressingOf: (f) => hand.active[names.indexOf(f) + 1], thumbTip: hand.tips[0], thumbWeights: [0.6, 0.55, 0.55] },
  );
}

/**
 * Scores the strikes heard ({ t, midi, velocity }) against the plan: each
 * key once, on time, as loud as its dynamic.
 */
export function scoreStrikes(plan, heard) {
  const used = new Set();
  const report = plan.strikes.map((s) => {
    let best = -1;
    heard.forEach((h, j) => {
      if (used.has(j) || h.midi !== s.midi || Math.abs(h.t - s.time) > ON_TIME) return;
      if (best < 0 || Math.abs(h.t - s.time) < Math.abs(heard[best].t - s.time)) best = j;
    });
    if (best >= 0) used.add(best);
    const h = heard[best];
    return {
      beat: s.beat,
      hand: s.hand,
      note: s.note,
      dynamic: s.dynamic,
      want: s.velocity,
      heard: h ? Math.round(h.velocity * 100) / 100 : null,
      lateMs: h ? Math.round((h.t - s.time) * 1000) : null,
      ok: h != null && Math.abs(h.velocity - s.velocity) <= VELOCITY_TOLERANCE,
    };
  });
  const extra = heard.filter((_, j) => !used.has(j)).map((h) => ({ t: Math.round(h.t * 1000) / 1000, midi: h.midi, velocity: h.velocity, tip: h.tip }));
  return { report, extra };
}

// -------------------------------------------------------------- performing

/** The performance clock never steps further than this in a frame (s): a stall slows the music instead of skipping it. */
const MAX_STEP = 0.034;
/** Live, the app reads the emulated hands a good deal faster than they are driven (frame timing), so blows are planned that much gentler. */
const LIVE_GAIN = 0.85;
const dispatch = (method, params = {}) => window.IWER_MCP.dispatch(method, params);

/**
 * Plays `song` live: takes out the piano (set down in front of the head),
 * poses both emulated hands, all five fingers each, drives the fingertips every
 * frame and records every key the app strikes and lets up, straight from
 * its synth. Calls `onEvent(index)` as each strike is due. Returns the
 * score, and every note on and off heard, for rendering.
 */
export async function perform(song, { tempo = song.tempo, onEvent = () => {} } = {}) {
  const world = window.FRAMEWORK_MCP_RUNTIME.world;
  const systems = Array.from(world.systems ?? []);
  const sys = systems.find((s) => s?.instrument === 'piano');
  const guitar = systems.find((s) => s?.fretReader && s?.synth);
  if (guitar) {
    const { AirGuitar } = await import('/src/guitar/air-guitar-component.ts');
    guitar.entity.setValue(AirGuitar, 'active', false);
  }
  for (const s of systems) if (s?.instrument && s !== sys) s.entity.setValue(s.component, 'active', false);
  sys.entity.setValue(sys.component, 'active', true);
  await sys.synth.warm();

  const plan = planPerformance(song, tempo, LIVE_GAIN);
  const handsFor = handsAt(plan);
  await dispatch('set_input_mode', { mode: 'hand' });
  const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
  // The piano is set down the frame after it is chosen.
  while (!sys.model.root.visible) await nextFrame();
  const hands = { left: window.IWER_DEVICE.hands.left, right: window.IWER_DEVICE.hands.right };
  const root = sys.model.root;
  // A live pose for each hand, updated in place every frame (both share IWER's pose table, so each gets its own entry).
  const poses = {};
  for (const [side, hand] of Object.entries(hands)) {
    const sym = Object.getOwnPropertySymbols(hand).find((s) => hand[s]?.poses);
    poses[side] = { jointTransforms: {}, gripOffsetMatrix: new Float32Array(16) };
    hand[sym].poses[`performer-${side}`] = poses[side];
  }
  root.updateMatrixWorld(true);
  const rootMatrix = Array.from(root.matrixWorld.elements);
  const place = (frame) => {
    for (const side of ['left', 'right']) {
      const w = applyPose(poses[side], poseFor(frame[side], side), rootMatrix, side === 'right');
      const hand = hands[side];
      if (hand.poseId !== `performer-${side}`) hand.poseId = `performer-${side}`;
      hand.setPin({ anchor: 'wrist', target: w.position, wristRotation: quatFromAxes(w.x, w.y, w.z) });
    }
  };
  for (let i = 0; i < 20; i++) {
    place(handsFor(0));
    await nextFrame();
  }

  // Listen at the synth, on the performance clock.
  const heard = [];
  const released = [];
  let clock = 0;
  const { noteOn, noteOff } = sys.synth;
  sys.synth.noteOn = function (midi, velocity, when) {
    heard.push({ t: clock, midi, velocity });
    return noteOn.call(this, midi, velocity, when);
  };
  sys.synth.noteOff = function (midi, when) {
    released.push({ t: clock, midi });
    return noteOff.call(this, midi, when);
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
          place(handsFor(clock));
          frames++;
          while (shown + 1 < plan.strikes.length && plan.strikes[shown + 1].time <= clock) onEvent(++shown);
          if (clock < plan.end) requestAnimationFrame(tick);
          else resolve();
        } catch (err) {
          reject(err);
        }
      };
      requestAnimationFrame(tick);
    });
  } finally {
    sys.synth.noteOn = noteOn;
    sys.synth.noteOff = noteOff;
  }
  const { report, extra } = scoreStrikes(plan, heard);
  const late = report.filter((r) => r.lateMs != null).map((r) => Math.abs(r.lateMs));
  return {
    notesRight: report.filter((r) => r.ok).length,
    notesTotal: report.length,
    extraNotes: extra,
    stuckKeys: sys.entity.getValue(sys.component, 'keysDown'),
    fps: Math.round(frames / ((wall - wallStart) / 1000)),
    tempoDragPct: Math.round(((wall - wallStart) / 1000 / clock - 1) * 1000) / 10,
    stalls,
    worstTimingMs: Math.max(...late),
    meanTimingMs: Math.round(late.reduce((a, b) => a + b, 0) / Math.max(1, late.length)),
    wrong: report.filter((r) => !r.ok),
    heard,
    released,
  };
}
