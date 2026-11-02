/**
 * Performs a melody on the air trumpet the way a trumpeter would, by
 * driving IWER's emulated hands every frame. Loaded in the page through
 * Vite, so it uses the app's own trumpet layout and playing rules.
 *
 * - Fingering: each note gets the standard fingering, the valves that need
 *   the fewest semitones from an open partial (C#4 is 1-2-3, F4 is 1, C#5
 *   is 1-2), and the partial's tilt.
 * - Right hand: holds the horn to the lips, its knuckle where the bell tilts
 *   to the middle of the partial's band, wrist low and fingers arched over
 *   the valves. Each of the index, middle and ring fingertips rests on its
 *   own button, and pushes it down its full travel to press the valve.
 * - Left hand: the pinch is the tongue and the air. It closes for each note
 *   (harder for fortissimo) and opens briefly before the next, so every
 *   note is tongued; valves and tilt change in that gap, as a player's do.
 */

import { midiName } from '/src/guitar/chords.ts';
import { AirGuitar } from '/src/guitar/air-guitar-component.ts';
import { HOLD_REACH, createHornPose, holdHorn } from '/src/trumpet/hold.ts';
import { PARTIAL_CENTERS, PARTIALS, PINCH_CLOSED, PINCH_OPEN, TRANSPOSITION } from '/src/trumpet/playing.ts';
import { FINGER_PAD, KNUCKLE, TRUMPET } from '/src/trumpet/geometry.ts';
import { add, applyPose, BONES, handBasis, lerp, quatFromAxes, scale, sub, v } from '/tests/hand-rig.js';

/** The tongue opens the pinch this long before each note, and the hands change fingering and tilt then. */
const GAP = 0.04;
/** The app sees a pinned hand a frame or so late, so the hands play this far ahead of the beat. */
const LEAD = 0.015;
/** Silence before the first note, with the horn already at the lips. */
const LEAD_IN = 0.6;
/** The clock never runs more than this per frame, so a stalled frame slows the music rather than skipping it. */
const MAX_STEP = 0.034;
/**
 * How steeply the right hand rises from the wrist to the knuckles (radians):
 * the hand comes up from under the horn, its palm toward the valve casings.
 */
const WRIST_RISE = (70 * Math.PI) / 180;
/** Where along the last bone, from its joint toward the tip, the pad presses. */
const PAD_ALONG = 0.6;
/** How steeply a valve finger's last bone slopes down onto its button (radians). */
const PAD_SLOPE = (40 * Math.PI) / 180;
/** Air for each dynamic, as a fraction of a closed pinch. */
const AIR = { pp: 0.3, p: 0.45, mf: 0.65, f: 0.85, ff: 1 };
/** An open pinch, between notes: well past where the note stops. */
const OPEN = PINCH_OPEN + 0.008;

/** Valves for 0 to 6 semitones down, as trumpeters finger them (three semitones is 1-2, not 3). */
const COMBOS = [[0, 0, 0], [0, 1, 0], [1, 0, 0], [1, 1, 0], [0, 1, 1], [1, 0, 1], [1, 1, 1]].map((c) => c.map(Boolean));

const NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** A note name such as 'C#4' as a MIDI number. */
export function noteMidi(name) {
  const [, letter, accidental, octave] = name.match(/^([A-G])([#b]?)(-?\d)$/);
  return 12 * (Number(octave) + 1) + NAMES[letter] + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0);
}

/** The standard fingering for a sounding MIDI note: partial index (into PARTIALS) and valves. */
export function fingeringFor(midi) {
  const written = midi - TRANSPOSITION;
  let best = null;
  PARTIALS.forEach((p, i) => {
    const semis = p.written - written;
    if (semis >= 0 && semis <= 6 && (best == null || semis < best.semis)) best = { partial: i, valves: COMBOS[semis], semis };
  });
  if (best == null) throw new Error(`the trumpet cannot play ${midiName(midi)}`);
  return best;
}

/** Notes with their times (s), fingerings and air. */
export function planPerformance(song, tempo = song.tempo) {
  const spb = 60 / tempo;
  // Timed from the song's first note, wherever its beats are counted from.
  const first = Math.min(...song.events.map((e) => e.beat));
  const notes = song.events.map((e) => {
    const midi = noteMidi(e.note);
    return { ...e, time: LEAD_IN + (e.beat - first) * spb, midi, ...fingeringFor(midi), air: AIR[e.dynamic] ?? 0.7 };
  });
  // Each note lasts until the next, or for its `hold` (beats) if that ends sooner.
  notes.forEach((n, i) => {
    const toNext = i + 1 < notes.length ? notes[i + 1].time - n.time : Infinity;
    n.duration = Math.min(toNext, (n.hold ?? (i + 1 < notes.length ? Infinity : 1)) * spb);
  });
  const last = notes.at(-1);
  return { notes, end: last.time + last.duration + 0.4 };
}

/** What the hands do at time `t`: { note (whose fingering), air (0 open) }. */
export function handsAt(plan, t) {
  const { notes } = plan;
  const at = t + LEAD;
  let k = -1;
  while (k + 1 < notes.length && notes[k + 1].time <= at) k++;
  const next = notes[k + 1];
  if (next && at >= next.time - GAP) return { note: next, air: 0 };
  if (k < 0) return { note: notes[0], air: 0 };
  const n = notes[k];
  // The last note ends with the tongue off, as the others do before their successors.
  if (at >= n.time + n.duration - GAP) return { note: n, air: 0 };
  return { note: n, air: n.air };
}

// ------------------------------------------------------------------ hands

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => scale(a, 1 / Math.hypot(...a));

/** Joint frame for a bone along `forward`: WebXR joints look down -Z with +Y out of the back of the hand. */
function frame(position, forward, back) {
  const z = norm(scale(forward, -1));
  let y = sub(back, scale(z, dot(back, z)));
  if (Math.hypot(...y) < 1e-6) y = v(0, 1, 0);
  y = norm(y);
  return { position, x: cross(y, z), y, z };
}

const NAMES_OF = ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'];

/**
 * A finger curled in the plane of the hand's forward and palm directions,
 * as a relaxed finger is: `c` radians at the knuckle, the middle and end
 * joints a little more.
 */
function fingerChain(hand, finger, c, right) {
  const k = hand.knuckles[finger];
  const L = BONES[finger];
  const dir = (a) => add(scale(hand.forward, Math.cos(a)), scale(hand.palm, Math.sin(a)));
  const angles = [c, 1.5 * c, 1.9 * c];
  const pip = add(k, scale(dir(angles[0]), L[0]));
  const dip = add(pip, scale(dir(angles[1]), L[1]));
  const tip = add(dip, scale(dir(angles[2]), L[2]));
  const chain = [hand.metacarpals[finger], k, pip, dip, tip];
  const joints = {};
  chain.forEach((p, i) => {
    const d = norm(i < chain.length - 1 ? sub(chain[i + 1], p) : sub(p, chain[i - 1]));
    // The bone's back turns with it about the hinge (the hand's lateral axis).
    const back = right ? cross(d, hand.lateral) : cross(hand.lateral, d);
    joints[`${finger}-finger-${NAMES_OF[i]}`] = frame(p, d, back);
  });
  return { joints, tip };
}

/**
 * A valve finger whose pad (the underside of its last bone, behind the tip)
 * rests on top of `target`, a button's top centre. The last bone slopes
 * down onto the button at PAD_SLOPE, and the first two bones arch up and
 * over from the knuckle, beside and below the button, to meet it.
 */
function padFinger(hand, finger, target) {
  const k = hand.knuckles[finger];
  const L = BONES[finger];
  const to = sub(target, k);
  const h = norm(v(to[0], 0, to[2]));
  const down = v(0, -1, 0);
  const dir = (a) => add(scale(h, Math.cos(a)), scale(down, Math.sin(a)));
  // The back of each bone faces up when it is level and outward as it curls down.
  const back = (a) => add(scale(h, Math.sin(a)), scale(down, -Math.cos(a)));
  // From the pad back up to the end joint: along the bone, then up through the finger's thickness.
  const dip = sub(sub(target, scale(dir(PAD_SLOPE), PAD_ALONG * L[2])), scale(dir(PAD_SLOPE + Math.PI / 2), FINGER_PAD));
  const tip = add(dip, scale(dir(PAD_SLOPE), L[2]));
  // Two bones from the knuckle to the end joint, the middle joint arching up, away from the palm.
  const kd = sub(dip, k);
  const x = dot(kd, h);
  const y = dot(kd, down);
  const dist = Math.min(Math.hypot(x, y), L[0] + L[1] - 1e-4);
  const cosA = (L[0] ** 2 + dist ** 2 - L[1] ** 2) / (2 * L[0] * dist);
  const a0 = Math.atan2(y, x) - Math.acos(Math.min(1, Math.max(-1, cosA)));
  const pip = add(k, scale(dir(a0), L[0]));
  const a1 = Math.atan2(dot(sub(dip, pip), down), dot(sub(dip, pip), h));
  const chain = [hand.metacarpals[finger], k, pip, dip, tip];
  const angles = [a0, a1, PAD_SLOPE, PAD_SLOPE];
  const joints = {};
  chain.forEach((p, i) => {
    const name = `${finger}-finger-${NAMES_OF[i]}`;
    joints[name] = i === 0 ? frame(p, norm(sub(k, p)), hand.back) : frame(p, dir(angles[i - 1]), back(angles[i - 1]));
  });
  return joints;
}

/**
 * The little finger raised with a flourish: lifted back at the knuckle and
 * splayed away from the ring finger, then curving gently toward the palm at
 * its other two joints, as a raised little finger does. It bends only the
 * way fingers bend, in its own plane turned out from the hand's.
 */
function raisedPinky(hand) {
  const SPLAY = 0.35;
  const LIFT = -0.45;
  const k = hand.knuckles.pinky;
  const L = BONES.pinky;
  // The finger's own forward and sideways directions, turned out toward the little-finger side.
  const forward = norm(sub(scale(hand.forward, Math.cos(SPLAY)), scale(hand.lateral, Math.sin(SPLAY))));
  const lateral = norm(add(scale(hand.lateral, Math.cos(SPLAY)), scale(hand.forward, Math.sin(SPLAY))));
  const dir = (a) => add(scale(forward, Math.cos(a)), scale(hand.palm, Math.sin(a)));
  const angles = [LIFT, LIFT + 0.25, LIFT + 0.55];
  const chain = [hand.metacarpals.pinky, k];
  angles.forEach((a, i) => chain.push(add(chain[i + 1], scale(dir(a), L[i]))));
  const joints = {};
  chain.forEach((p, i) => {
    const d = i === 0 ? norm(sub(k, p)) : dir(angles[Math.min(2, i - 1)]);
    joints[`pinky-finger-${NAMES_OF[i]}`] = frame(p, d, cross(d, lateral));
  });
  return joints;
}

/** A thumb from beside the wrist to `tip`, bowed out toward `bulge`. */
function thumbChain(hand, tip, bulge) {
  const base = add(add(hand.wrist, scale(hand.forward, 0.022)), add(scale(hand.lateral, 0.022), scale(hand.palm, 0.012)));
  const pts = [base, add(lerp(base, tip, 0.4), scale(bulge, 0.012)), add(lerp(base, tip, 0.75), scale(bulge, 0.006)), tip];
  const joints = {};
  ['metacarpal', 'phalanx-proximal', 'phalanx-distal', 'tip'].forEach((name, i) => {
    const d = norm(i < 3 ? sub(pts[i + 1], pts[i]) : sub(pts[3], pts[2]));
    joints[`thumb-${name}`] = frame(pts[i], d, hand.back);
  });
  return joints;
}

/**
 * The right hand in trumpet space, as a trumpeter holds the horn: coming
 * up from under it, wrist below and to the right beside the leadpipe, palm
 * toward the valve casings, middle knuckle at KNUCKLE. The fingers arch up
 * and over so their pads rest on top of the first, second and third
 * buttons, or push them down their full travel; the little finger, with
 * nothing to do, is held up and out with a flourish, and the thumb tucks
 * under the leadpipe between the first and second valves.
 */
function makeRightHand() {
  const forward = v(-Math.cos(WRIST_RISE), Math.sin(WRIST_RISE), 0);
  const lateral = v(0, 0, 1);
  const wrist = sub(sub(v(...KNUCKLE), scale(forward, 0.088)), scale(lateral, 0.008));
  const hand = handBasis(wrist, forward, lateral, true);
  const fixed = {
    wrist: frame(wrist, forward, hand.back),
    ...raisedPinky(hand),
    ...thumbChain(hand, v(0.024, -0.004, 0.013), hand.palm),
  };
  const button = (i, pressed) => v(0, TRUMPET.buttonTop - (pressed ? TRUMPET.travel : 0), TRUMPET.valveZ[i]);
  const shapes = new Map();
  return (valves) => {
    const key = valves.map(Number).join('');
    if (!shapes.has(key)) {
      const joints = { ...fixed };
      ['index', 'middle', 'ring'].forEach((f, i) => Object.assign(joints, padFinger(hand, f, button(i, valves[i]))));
      shapes.set(key, joints);
    }
    return shapes.get(key);
  };
}

/**
 * The left hand in the world, resting out in front to the left of the horn
 * where it can be seen (but behind the bell, clear of the plunger): the
 * forearm reaching forward, the palm turned down and in, the fingers
 * loosely curled, each a little more than the one before, and the thumb
 * `pinch` metres from the index tip, under it.
 */
function leftHand(lips, look, pinch) {
  const up = v(0, 1, 0);
  const right = norm(cross(look, up));
  const wrist = add(add(lips, scale(right, -0.36)), add(scale(up, -0.12), scale(look, 0.26)));
  const forward = norm(add(add(scale(look, 0.85), scale(right, 0.3)), scale(up, -0.2)));
  // The index side of a left hand turned palm down is toward the right; rolled a little, the palm faces in too.
  const hand = handBasis(wrist, forward, norm(add(scale(right, 0.65), scale(up, 0.35))), false);
  const index = fingerChain(hand, 'index', 0.38, false);
  const joints = { wrist: frame(wrist, forward, hand.back), ...index.joints };
  [['middle', 0.5], ['ring', 0.6], ['pinky', 0.7]].forEach(([f, c]) => Object.assign(joints, fingerChain(hand, f, c, false).joints));
  // The thumb sits under the index tip, toward the index side.
  const side = norm(add(hand.palm, scale(hand.lateral, 0.4)));
  Object.assign(joints, thumbChain(hand, add(index.tip, scale(side, pinch)), norm(add(hand.lateral, scale(hand.palm, 0.5)))));
  return joints;
}

/** The knuckle (world) that tilts the bell to `elevation` degrees with the mouthpiece at the lips. */
function knuckleFor(lips, look, elevation) {
  const level = norm(v(look[0], 0, look[2]));
  const pose = createHornPose();
  const at = (e) => {
    const r = (e * Math.PI) / 180;
    return add(lips, scale(add(scale(level, Math.cos(r)), v(0, Math.sin(r), 0)), HOLD_REACH));
  };
  let lo = -85;
  let hi = 85;
  for (let i = 0; i < 40; i++) {
    const e = (lo + hi) / 2;
    if (holdHorn(lips, at(e), look, 1, pose).elevation < elevation) lo = e;
    else hi = e;
  }
  return at((lo + hi) / 2);
}

/** The trumpet's matrix (column-major) for the knuckle at `knuckle`, mouthpiece at the lips. */
function trumpetMatrix(lips, knuckle, look) {
  const pose = createHornPose();
  // Settle the slide to the lips fully.
  for (let i = 0; i < 4; i++) holdHorn(lips, knuckle, look, 1, pose);
  return [...pose.x, 0, ...pose.y, 0, ...pose.z, 0, ...pose.origin, 1];
}

// -------------------------------------------------------------- performing

/** Air (0 to 1) as a thumb-to-index distance. */
const pinchFor = (air) => (air <= 0 ? OPEN : PINCH_OPEN - air * (PINCH_OPEN - PINCH_CLOSED));

/**
 * Scores each note from what the app's synth was asked to play while it
 * should sound (its first half, after the attack): right if the pitch heard
 * most is the note's, it was loud enough, and it was tongued once.
 */
export function scoreNotes(notes, frames) {
  return notes.map((n) => {
    const from = n.time + 0.12 * n.duration;
    const to = n.time + 0.55 * n.duration;
    const heard = new Map();
    let loudest = 0;
    let tongues = 0;
    for (const f of frames) {
      if (f.tongued && f.t >= n.time - GAP && f.t < n.time + 0.5 * n.duration) tongues++;
      if (f.t < from || f.t > to || f.amp < 0.1) continue;
      loudest = Math.max(loudest, f.amp);
      heard.set(f.midi, (heard.get(f.midi) ?? 0) + 1);
    }
    const best = [...heard].sort((a, b) => b[1] - a[1])[0]?.[0];
    return {
      beat: n.beat,
      want: n.note,
      heard: best == null ? '-' : midiName(best),
      written: midiName(n.midi - TRANSPOSITION),
      valves: n.valves.some(Boolean) ? n.valves.map((d, i) => (d ? i + 1 : '')).filter(Boolean).join('-') : '0',
      partial: PARTIALS[n.partial].partial,
      loudness: Math.round(loudest * 100) / 100,
      tongues,
      ok: best === n.midi && loudest > 0.15 && tongues === 1,
    };
  });
}

/**
 * Plays `song` live: takes out the trumpet, drives both emulated hands every
 * frame and records what the app sounds, straight from its synth. Calls
 * `onEvent(index)` as each note begins. Returns the score.
 */
export async function perform(song, { tempo = song.tempo, onEvent = () => {} } = {}) {
  const world = window.FRAMEWORK_MCP_RUNTIME.world;
  const systems = Array.from(world.systems ?? []);
  const trumpet = systems.find((s) => s?.instrument === 'trumpet');
  systems.find((s) => s?.fretReader && s?.synth)?.entity.setValue(AirGuitar, 'active', false);
  for (const s of systems) if (s?.instrument && s !== trumpet) s.entity.setValue(s.component, 'active', false);
  trumpet.entity.setValue(trumpet.component, 'active', true);

  const plan = planPerformance(song, tempo);
  const { notes, end } = plan;
  const rightShape = makeRightHand();
  const knuckles = PARTIAL_CENTERS.map(() => null);

  const hands = { left: window.IWER_DEVICE.hands.left, right: window.IWER_DEVICE.hands.right };
  const poses = {};
  for (const [side, hand] of Object.entries(hands)) {
    const sym = Object.getOwnPropertySymbols(hand).find((s) => hand[s]?.poses);
    poses[side] = { jointTransforms: {}, gripOffsetMatrix: new Float32Array(16) };
    hand[sym].poses[`trumpeter-${side}`] = poses[side];
  }
  await window.IWER_MCP.dispatch('set_input_mode', { mode: 'hand' });
  const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const pin = (side, joints, matrix) => {
    const w = applyPose(poses[side], joints, matrix, side === 'right');
    const hand = hands[side];
    if (hand.poseId !== `trumpeter-${side}`) hand.poseId = `trumpeter-${side}`;
    hand.setPin({ anchor: 'wrist', target: w.position, wristRotation: quatFromAxes(w.x, w.y, w.z) });
  };
  const pose = (t) => {
    // The lips move with the head, which the run holds still: read them each frame anyway.
    const lips = Array.from(trumpet.lips);
    const look = Array.from(trumpet.lookArr);
    const { note, air } = handsAt(plan, t);
    const knuckle = (knuckles[note.partial] ??= knuckleFor(lips, look, PARTIAL_CENTERS[note.partial]));
    pin('right', rightShape(note.valves), trumpetMatrix(lips, knuckle, look));
    pin('left', leftHand(lips, look, pinchFor(air)), IDENTITY);
  };
  // Bring the horn to the lips and let the app settle.
  for (let i = 0; i < 30; i++) {
    pose(0);
    await new Promise((r) => requestAnimationFrame(r));
  }

  // Listen at the synth: what the trumpet plays, every frame.
  const frames = [];
  const synth = trumpet.synth;
  const set = synth.set;
  let clock = 0;
  synth.set = function (sound, at) {
    frames.push({ t: clock, midi: Math.round(sound.midi), amp: sound.amplitude, tongued: sound.tongued });
    return set.call(this, sound, at);
  };

  let shown = -1;
  let frameCount = 0;
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
          pose(clock);
          frameCount++;
          let index = -1;
          while (index + 1 < notes.length && notes[index + 1].time <= clock) index++;
          if (index !== shown && index >= 0) {
            shown = index;
            onEvent(index);
          }
          if (clock < end) requestAnimationFrame(tick);
          else resolve();
        } catch (err) {
          reject(err);
        }
      };
      requestAnimationFrame(tick);
    });
  } finally {
    synth.set = set;
  }
  const report = scoreNotes(notes, frames);
  return {
    notesRight: report.filter((r) => r.ok).length,
    notesTotal: report.length,
    tongued: trumpet.breath.notes,
    fps: Math.round(frameCount / ((wall - wallStart) / 1000)),
    tempoDragPct: Math.round(((wall - wallStart) / 1000 / clock - 1) * 1000) / 10,
    stalls,
    notes: report,
  };
}
