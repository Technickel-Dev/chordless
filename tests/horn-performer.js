/**
 * Performs a melody on the air French horn the way a hornist would, by
 * driving IWER's emulated hands every frame. Loaded in the page through
 * Vite, so it uses the app's own horn layout and playing rules.
 *
 * - Fingering: each note gets the B-flat horn's standard fingering, the
 *   valves that need the fewest semitones from an open partial, and the
 *   partial's tilt.
 * - Left hand: holds the horn to the lips, its knuckle where the horn tilts
 *   to the middle of the partial's band, wrist low and fingers arched over
 *   the levers. Each of the index, middle and ring fingertips rests on its
 *   own lever, and pushes it down its full travel to turn the valve.
 * - Right hand: cupped in the bell, a third of the way in. Its pinch is the
 *   tongue and the air: it closes for each note (harder for fortissimo) and
 *   opens before the next, for at least a frame, so every note is tongued.
 *   Each note is scored from its tongue (see the trombone's performer).
 */

import { midiName } from '/src/guitar/chords.ts';
import { AirGuitar } from '/src/guitar/air-guitar-component.ts';
import { HOLD_REACH, createHornPose, holdFrenchHorn } from '/src/horn/hold.ts';
import { PARTIAL_CENTERS, PARTIALS, WRITTEN_ABOVE } from '/src/horn/playing.ts';
import { PINCH_CLOSED, PINCH_OPEN } from '/src/trumpet/playing.ts';
import { BELL, BELL_AXIS, HORN, KNUCKLE } from '/src/horn/geometry.ts';
import { add, applyPose, handBasis, quatFromAxes, scale, sub, v } from '/tests/hand-rig.js';
import { fingerChain, frame, noteMidi, padFinger, raisedPinky, thumbChain } from '/tests/trumpet-performer.js';

/** The tongue opens the pinch this long before each note, or before a quick one for a quarter of the note before it, but at least a frame and a bit. */
const GAP = 0.045;
const gapBefore = (prev, frameLength) => Math.min(GAP, Math.max(prev.duration / 4, frameLength * 1.2));
/** The app sees a pinned hand a frame late, so the hands play a frame ahead of the beat (at least this far). */
const LEAD = 0.015;
/** Silence before the first note, with the horn already at the lips. */
const LEAD_IN = 0.6;
/** The clock never runs more than this per frame, so a stalled frame slows the music rather than skipping it. */
const MAX_STEP = 0.034;
/** How steeply the left hand rises from the wrist to the knuckles (radians): up from under the horn, palm toward the valves. */
const WRIST_RISE = (70 * Math.PI) / 180;
/** Air for each dynamic, as a fraction of a closed pinch. */
const AIR = { pp: 0.3, p: 0.45, mf: 0.65, f: 0.85, ff: 1 };
/** An open pinch, between notes: well past where the note stops. */
const OPEN = PINCH_OPEN + 0.008;
/** The right palm sits this far in from the bell's rim, toward its far (upper) side. */
const HAND_INSIDE = 0.06;

/** Valves for 0 to 6 semitones down, as on the trumpet (three semitones is 1-2, not 3). */
const COMBOS = [[0, 0, 0], [0, 1, 0], [1, 0, 0], [1, 1, 0], [0, 1, 1], [1, 0, 1], [1, 1, 1]].map((c) => c.map(Boolean));

/** The standard fingering for a sounding MIDI note: partial index (into PARTIALS) and valves. */
export function fingeringFor(midi) {
  let best = null;
  PARTIALS.forEach((p, i) => {
    const semis = p.midi - midi;
    if (semis >= 0 && semis <= 6 && (best == null || semis < best.semis)) best = { partial: i, valves: COMBOS[semis], semis };
  });
  if (best == null) throw new Error(`the horn cannot play ${midiName(midi)}`);
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

/** What the hands do at time `t`, with frames `frameLength` s long: { note (whose fingering), air (0 open) }. */
export function handsAt(plan, t, frameLength = LEAD) {
  const { notes } = plan;
  const at = t + frameLength;
  let k = -1;
  while (k + 1 < notes.length && notes[k + 1].time <= at) k++;
  if (k < 0) return { note: notes[0], air: 0 };
  const n = notes[k];
  const next = notes[k + 1];
  const gap = gapBefore(n, frameLength);
  if (next && at >= next.time - gap) return { note: next, air: 0 };
  // The last note ends with the tongue off, as the others do before their successors.
  if (at >= n.time + n.duration - gap) return { note: n, air: 0 };
  return { note: n, air: n.air };
}

// ------------------------------------------------------------------ hands

const norm = (a) => scale(a, 1 / Math.hypot(...a));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** The joints moved by `d`. */
const shifted = (joints, d) => Object.fromEntries(Object.entries(joints).map(([k, j]) => [k, { ...j, position: add(j.position, d) }]));

/**
 * The left hand in horn space, as a hornist holds the horn: up from under
 * it on the left, palm toward the valves, middle knuckle at KNUCKLE. The
 * fingers arch up and over so their pads rest on the first, second and
 * third levers, or push them down their full travel; the little finger is
 * held up out of the way and the thumb tucks under the leadpipe.
 */
function makeLeftHand() {
  const forward = v(Math.cos(WRIST_RISE), Math.sin(WRIST_RISE), 0);
  const lateral = v(0, 0, 1);
  const wrist = sub(sub(v(...KNUCKLE), scale(forward, 0.088)), scale(lateral, 0.008));
  const hand = handBasis(wrist, forward, lateral, false);
  const fixed = {
    wrist: frame(wrist, forward, hand.back),
    ...raisedPinky(hand),
    ...thumbChain(hand, v(HORN.valveX - 0.012, HORN.valveY - 0.004, HORN.valveZ[0] + 0.022), hand.palm),
  };
  const lever = (i, pressed) => v(HORN.leverX, HORN.leverTop - (pressed ? HORN.travel : 0), HORN.valveZ[i]);
  const shapes = new Map();
  return (valves) => {
    const key = valves.map(Number).join('');
    if (!shapes.has(key)) {
      const joints = { ...fixed };
      ['index', 'middle', 'ring'].forEach((f, i) => Object.assign(joints, padFinger(hand, f, lever(i, valves[i]))));
      shapes.set(key, joints);
    }
    return shapes.get(key);
  };
}

/**
 * The right hand in horn space, cupped in the bell: the fingers together
 * reaching in along it, toward its far side, the palm HAND_INSIDE in from
 * the rim, and the thumb `pinch` metres from the index tip.
 */
function rightHand(pinch) {
  const forward = norm(scale(v(...BELL_AXIS), -1));
  const up = norm(sub(v(0, 1, 0), scale(forward, forward[1])));
  const hand = handBasis(v(0, 0, 0), forward, cross(forward, up), true);
  const index = fingerChain(hand, 'index', 0.32, true);
  const joints = { wrist: frame(hand.wrist, forward, hand.back), ...index.joints };
  [['middle', 0.36], ['ring', 0.4], ['pinky', 0.44]].forEach(([f, c]) => Object.assign(joints, fingerChain(hand, f, c, true).joints));
  const side = norm(add(hand.palm, scale(hand.lateral, 0.4)));
  Object.assign(joints, thumbChain(hand, add(index.tip, scale(side, pinch)), norm(add(hand.lateral, scale(hand.palm, 0.5)))));
  const palm = scale(add(hand.wrist, hand.knuckles.middle), 0.5);
  const at = add(sub(v(...BELL), scale(v(...BELL_AXIS), HAND_INSIDE)), scale(up, 0.03));
  return shifted(joints, sub(at, palm));
}

/** The knuckle (world) that tilts the horn to `elevation` degrees with the mouthpiece at the lips. */
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
    if (holdFrenchHorn(lips, at(e), look, 1, pose).elevation < elevation) lo = e;
    else hi = e;
  }
  return at((lo + hi) / 2);
}

/** The horn's matrix (column-major) for the left knuckle at `knuckle`, mouthpiece at the lips. */
function hornMatrix(lips, knuckle, look) {
  const pose = createHornPose();
  for (let i = 0; i < 4; i++) holdFrenchHorn(lips, knuckle, look, 1, pose);
  return [...pose.x, 0, ...pose.y, 0, ...pose.z, 0, ...pose.origin, 1];
}

/** Air (0 to 1) as a thumb-to-index distance. */
const pinchFor = (air) => (air <= 0 ? OPEN : PINCH_OPEN - air * (PINCH_OPEN - PINCH_CLOSED));

// -------------------------------------------------------------- performing

/**
 * Scores each note from what the app's synth was asked to play from the
 * note's tongue until the next tongue or 60% of the way through, as the
 * trombone's performer does: right if the pitch heard most is the note's,
 * it was loud enough, and it was tongued once.
 */
export function scoreNotes(notes, frames) {
  return notes.map((n) => {
    const slot = frames.filter((f) => f.tongued && f.t >= n.time - 2 * GAP && f.t < n.time + 0.5 * n.duration);
    const from = slot[0]?.t ?? n.time;
    const next = frames.find((f) => f.tongued && f.t > from);
    const to = Math.min(from + 0.6 * n.duration, next ? next.t - 1e-6 : Infinity);
    const heard = new Map();
    let loudest = 0;
    for (const f of frames) {
      if (f.t < from || f.t > to || f.amp < 0.1) continue;
      loudest = Math.max(loudest, f.amp);
      heard.set(f.midi, (heard.get(f.midi) ?? 0) + 1);
    }
    const best = [...heard].sort((a, b) => b[1] - a[1])[0]?.[0];
    return {
      beat: n.beat,
      want: n.note,
      heard: best == null ? '-' : midiName(best),
      written: midiName(n.midi + WRITTEN_ABOVE),
      valves: n.valves.some(Boolean) ? n.valves.map((d, i) => (d ? i + 1 : '')).filter(Boolean).join('-') : '0',
      partial: PARTIALS[n.partial].partial,
      loudness: Math.round(loudest * 100) / 100,
      tongues: slot.length,
      ok: best === n.midi && loudest > 0.15 && slot.length === 1,
    };
  });
}

/**
 * Plays `song` live: takes out the horn, drives both emulated hands every
 * frame and records what the app sounds, straight from its synth. Calls
 * `onEvent(index)` as each note begins. Returns the score.
 */
export async function perform(song, { tempo = song.tempo, onEvent = () => {} } = {}) {
  const world = window.FRAMEWORK_MCP_RUNTIME.world;
  const systems = Array.from(world.systems ?? []);
  const horn = systems.find((s) => s?.instrument === 'horn');
  systems.find((s) => s?.fretReader && s?.synth)?.entity.setValue(AirGuitar, 'active', false);
  for (const s of systems) if (s?.instrument && s !== horn) s.entity.setValue(s.component, 'active', false);
  horn.entity.setValue(horn.component, 'active', true);

  const plan = planPerformance(song, tempo);
  const { notes, end } = plan;
  const leftShape = makeLeftHand();
  const knuckles = PARTIAL_CENTERS.map(() => null);

  const hands = { left: window.IWER_DEVICE.hands.left, right: window.IWER_DEVICE.hands.right };
  const poses = {};
  for (const [side, hand] of Object.entries(hands)) {
    const sym = Object.getOwnPropertySymbols(hand).find((s) => hand[s]?.poses);
    poses[side] = { jointTransforms: {}, gripOffsetMatrix: new Float32Array(16) };
    hand[sym].poses[`hornist-${side}`] = poses[side];
  }
  await window.IWER_MCP.dispatch('set_input_mode', { mode: 'hand' });
  const pin = (side, joints, matrix) => {
    const w = applyPose(poses[side], joints, matrix, side === 'right');
    const hand = hands[side];
    if (hand.poseId !== `hornist-${side}`) hand.poseId = `hornist-${side}`;
    hand.setPin({ anchor: 'wrist', target: w.position, wristRotation: quatFromAxes(w.x, w.y, w.z) });
  };
  let frameLength = LEAD;
  const pose = (t) => {
    // The lips move with the head, which the run holds still: read them each frame anyway.
    const lips = Array.from(horn.lips);
    const look = Array.from(horn.lookArr);
    const { note, air } = handsAt(plan, t, frameLength);
    const knuckle = (knuckles[note.partial] ??= knuckleFor(lips, look, PARTIAL_CENTERS[note.partial]));
    const matrix = hornMatrix(lips, knuckle, look);
    pin('left', leftShape(note.valves), matrix);
    pin('right', rightHand(pinchFor(air)), matrix);
  };
  // Bring the horn to the lips and let the app settle.
  for (let i = 0; i < 30; i++) {
    pose(0);
    await new Promise((r) => requestAnimationFrame(r));
  }

  // Listen at the synth: what the horn plays, every frame.
  const frames = [];
  const synth = horn.synth;
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
          // How long frames run now (smoothed, so one stall does not jolt the hands).
          frameLength += (Math.max(LEAD, Math.min(0.05, step)) - frameLength) * 0.1;
          clock += Math.min(step, MAX_STEP);
          // For video capture: where the performance clock is against the wall clock.
          window.__performTick?.(performance.now(), clock);
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
    tongued: horn.breath.notes,
    fps: Math.round(frameCount / ((wall - wallStart) / 1000)),
    tempoDragPct: Math.round(((wall - wallStart) / 1000 / clock - 1) * 1000) / 10,
    stalls,
    notes: report,
  };
}
