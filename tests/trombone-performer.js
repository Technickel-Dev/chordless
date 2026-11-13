/**
 * Performs a melody on the air trombone the way a trombonist would, by
 * driving IWER's emulated hands every frame. Loaded in the page through
 * Vite, so it uses the app's own trombone layout and playing rules.
 *
 * - Positions: each note can be played on one or two partials, in a
 *   different slide position on each. The plan picks, for the whole
 *   melody, the positions that move the slide least (a fast run of E3, G#3
 *   and B3 stays in second to fourth position, partials 3 to 5), and the
 *   partial's tilt.
 * - Left hand: holds the horn to the lips, its knuckle where the horn
 *   tilts to the middle of the partial's band, fingers wrapped round the
 *   slide braces. Its pinch is the tongue and the air: it closes for each
 *   note (harder for fortissimo) and opens briefly before the next.
 * - Right hand: thumb and index fingertips on the slide brace. In the gap
 *   before each note the slide travels to the next position, arriving a
 *   moment before the tongue, as a trombonist's does, so the glide is
 *   silent.
 */

import { midiName } from '/src/guitar/chords.ts';
import { AirGuitar } from '/src/guitar/air-guitar-component.ts';
import { HOLD_REACH, createHornPose, holdTrombone } from '/src/trombone/hold.ts';
import { PARTIAL_CENTERS, PARTIALS, slideFor } from '/src/trombone/playing.ts';
import { PINCH_CLOSED, PINCH_OPEN } from '/src/trumpet/playing.ts';
import { BRACE, KNUCKLE } from '/src/trombone/geometry.ts';
import { add, applyPose, handBasis, quatFromAxes, scale, sub, v } from '/tests/hand-rig.js';
import { fingerChain, frame, noteMidi, thumbChain } from '/tests/trumpet-performer.js';

/**
 * The tongue opens the pinch this long before each note, or before a quick
 * one for a quarter of the note before it, but at least a frame and a bit,
 * so the app sees it open; the slide and tilt move then.
 */
const GAP = 0.045;
const gapBefore = (prev, frame) => Math.min(GAP, Math.max(prev.duration / 4, frame * 1.2));
/** The slide arrives this far into the gap's length (fraction), ahead of the tongue. */
const ARRIVE = 0.7;
/**
 * The app sees a pinned hand a frame late, so the hands play a frame
 * ahead of the beat (at least this far).
 */
const LEAD = 0.015;
/** Silence before the first note, with the horn already at the lips. */
const LEAD_IN = 0.6;
/** The clock never runs more than this per frame, so a stalled frame slows the music rather than skipping it. */
const MAX_STEP = 0.034;
/** Air for each dynamic, as a fraction of a closed pinch. */
const AIR = { pp: 0.3, p: 0.45, mf: 0.65, f: 0.85, ff: 1 };
/** An open pinch, between notes: well past where the note stops. */
const OPEN = PINCH_OPEN + 0.008;

/** The ways to play a MIDI note: { partial (index into PARTIALS), position (1-7), slide (m) }. */
export function choicesFor(midi) {
  const out = [];
  PARTIALS.forEach((p, i) => {
    const semis = p.midi - midi;
    if (semis >= 0 && semis <= 6) out.push({ partial: i, position: semis + 1, slide: slideFor(semis) });
  });
  if (out.length === 0) throw new Error(`the trombone cannot play ${midiName(midi)}`);
  return out;
}

/**
 * Positions for a whole line, moving the slide least: slide travel costs
 * most when the notes are quick, a change of partial a little, and the long
 * positions (six and seven) more, as they are a stretch: B3 is fourth
 * position, not seventh, unless the notes round it are down there too.
 */
export function planPositions(notes) {
  const options = notes.map((n) => choicesFor(n.midi));
  const cost = options.map((o) => o.map(() => Infinity));
  const back = options.map((o) => o.map(() => 0));
  const own = (c) => (c.position >= 6 ? 1 + 0.5 * (c.position - 6) : 0) + (PARTIALS[c.partial].partial === 2 ? 0.3 : 0);
  options[0].forEach((c, j) => (cost[0][j] = own(c)));
  for (let i = 1; i < notes.length; i++) {
    const urgency = 1 + 0.25 / Math.max(0.05, notes[i].time - notes[i - 1].time);
    options[i].forEach((c, j) => {
      options[i - 1].forEach((p, k) => {
        const total = cost[i - 1][k] + urgency * (Math.abs(c.slide - p.slide) * 6 + (c.partial !== p.partial ? 0.05 : 0)) + own(c);
        if (total < cost[i][j]) {
          cost[i][j] = total;
          back[i][j] = k;
        }
      });
    });
  }
  const picks = new Array(notes.length);
  let j = cost.at(-1).indexOf(Math.min(...cost.at(-1)));
  for (let i = notes.length - 1; i >= 0; i--) {
    picks[i] = options[i][j];
    j = back[i][j];
  }
  return picks;
}

/** Notes with their times (s), positions and air. */
export function planPerformance(song, tempo = song.tempo) {
  const spb = 60 / tempo;
  // Timed from the song's first note, wherever its beats are counted from.
  const first = Math.min(...song.events.map((e) => e.beat));
  const notes = song.events.map((e) => ({ ...e, time: LEAD_IN + (e.beat - first) * spb, midi: noteMidi(e.note), air: AIR[e.dynamic] ?? 0.7 }));
  planPositions(notes).forEach((c, i) => Object.assign(notes[i], c));
  // Each note lasts until the next, or for its `hold` (beats) if that ends sooner.
  notes.forEach((n, i) => {
    const toNext = i + 1 < notes.length ? notes[i + 1].time - n.time : Infinity;
    n.duration = Math.min(toNext, (n.hold ?? (i + 1 < notes.length ? Infinity : 1)) * spb);
  });
  const last = notes.at(-1);
  return { notes, end: last.time + last.duration + 0.4 };
}

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** What the hands do at time `t`, with frames `frame` s long: { note (whose partial), air (0 open), slide (m) }. */
export function handsAt(plan, t, frame = LEAD) {
  const { notes } = plan;
  const at = t + frame;
  let k = -1;
  while (k + 1 < notes.length && notes[k + 1].time <= at) k++;
  const next = notes[k + 1];
  if (k < 0) return { note: notes[0], air: 0, slide: notes[0].slide };
  const n = notes[k];
  const gap = gapBefore(n, frame);
  if (next && at >= next.time - gap) {
    const f = smooth((at - (next.time - gap)) / (gap * ARRIVE));
    return { note: next, air: 0, slide: n.slide + (next.slide - n.slide) * f };
  }
  // The last note ends with the tongue off, as the others do before their successors.
  if (at >= n.time + n.duration - gap) return { note: n, air: 0, slide: n.slide };
  return { note: n, air: n.air, slide: n.slide };
}

// ------------------------------------------------------------------ hands

const norm = (a) => scale(a, 1 / Math.hypot(...a));
/** The joints moved by `d`. */
const shifted = (joints, d) => Object.fromEntries(Object.entries(joints).map(([k, j]) => [k, { ...j, position: add(j.position, d) }]));

/**
 * The left hand in trombone space, as trombonists hold the horn: up from
 * below on the left, middle knuckle at KNUCKLE, the middle, ring and little
 * fingers wrapped round the slide braces, the index curled over the upper
 * tube toward the mouthpiece, and the thumb `pinch` metres from its tip.
 */
function leftHand(pinch) {
  const forward = norm(v(0.42, 0.88, 0.12));
  const hand = handBasis(v(0, 0, 0), forward, v(0, 0, 1), false);
  const index = fingerChain(hand, 'index', 0.55, false);
  const joints = { wrist: frame(hand.wrist, forward, hand.back), ...index.joints };
  [['middle', 0.95], ['ring', 1.0], ['pinky', 1.05]].forEach(([f, c]) => Object.assign(joints, fingerChain(hand, f, c, false).joints));
  const side = norm(add(hand.palm, scale(hand.lateral, 0.4)));
  Object.assign(joints, thumbChain(hand, add(index.tip, scale(side, pinch)), norm(add(hand.lateral, scale(hand.palm, 0.5)))));
  return shifted(joints, sub(v(...KNUCKLE), hand.knuckles.middle));
}

/**
 * The right hand in trombone space with the slide closed: from the right,
 * fingers reaching forward and in, the thumb and index tips closed on the
 * brace's grip, the other fingers curled beside it.
 */
function rightHandClosed() {
  const forward = norm(v(-0.55, 0.25, -0.8));
  const hand = handBasis(v(0, 0, 0), forward, v(0, 1, 0), true);
  const index = fingerChain(hand, 'index', 0.75, true);
  const joints = { wrist: frame(hand.wrist, forward, hand.back), ...index.joints };
  [['middle', 0.85], ['ring', 0.95], ['pinky', 1.05]].forEach(([f, c]) => Object.assign(joints, fingerChain(hand, f, c, true).joints));
  const thumbTip = add(index.tip, scale(norm(add(hand.palm, scale(hand.lateral, -0.6))), 0.014));
  Object.assign(joints, thumbChain(hand, thumbTip, norm(add(scale(hand.lateral, -1), scale(hand.palm, 0.5)))));
  const grip = scale(add(index.tip, thumbTip), 0.5);
  return shifted(joints, sub(v(...BRACE), grip));
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
    if (holdTrombone(lips, at(e), look, 1, pose).elevation < elevation) lo = e;
    else hi = e;
  }
  return at((lo + hi) / 2);
}

/** The trombone's matrix (column-major) for the left knuckle at `knuckle`, mouthpiece at the lips. */
function tromboneMatrix(lips, knuckle, look) {
  const pose = createHornPose();
  for (let i = 0; i < 4; i++) holdTrombone(lips, knuckle, look, 1, pose);
  return [...pose.x, 0, ...pose.y, 0, ...pose.z, 0, ...pose.origin, 1];
}

// -------------------------------------------------------------- performing

/** Air (0 to 1) as a thumb-to-index distance. */
const pinchFor = (air) => (air <= 0 ? OPEN : PINCH_OPEN - air * (PINCH_OPEN - PINCH_CLOSED));

/**
 * Scores each note from what the app's synth was asked to play from the
 * note's tongue (the one in its slot, from just before it to halfway
 * through) until the next tongue or 60% of the way through, whichever
 * comes first: right if the nearest note heard most is the note's, it was
 * loud enough, and it was tongued once. Scored from the tongue rather than
 * the beat, so a slow browser's long frames do not move the note out from
 * under the score. `cents` is how far off the pitch was at worst then.
 */
export function scoreNotes(notes, frames) {
  return notes.map((n) => {
    const slot = frames.filter((f) => f.tongued && f.t >= n.time - 2 * GAP && f.t < n.time + 0.5 * n.duration);
    const tongues = slot.length;
    const from = slot[0]?.t ?? n.time;
    const next = frames.find((f) => f.tongued && f.t > from);
    const to = Math.min(from + 0.6 * n.duration, next ? next.t - 1e-6 : Infinity);
    const heard = new Map();
    let loudest = 0;
    let cents = 0;
    for (const f of frames) {
      if (f.t < from || f.t > to || f.amp < 0.1) continue;
      loudest = Math.max(loudest, f.amp);
      const near = Math.round(f.midi);
      heard.set(near, (heard.get(near) ?? 0) + 1);
      if (near === n.midi) cents = Math.max(cents, Math.abs(Math.round((f.midi - n.midi) * 100)));
    }
    const best = [...heard].sort((a, b) => b[1] - a[1])[0]?.[0];
    return {
      beat: n.beat,
      want: n.note,
      heard: best == null ? '-' : midiName(best),
      position: n.position,
      partial: PARTIALS[n.partial].partial,
      cents,
      loudness: Math.round(loudest * 100) / 100,
      tongues,
      ok: best === n.midi && loudest > 0.15 && tongues === 1,
    };
  });
}

/**
 * Plays `song` live: takes out the trombone, drives both emulated hands
 * every frame and records what the app sounds, straight from its synth.
 * Calls `onEvent(index)` as each note begins. Returns the score.
 */
export async function perform(song, { tempo = song.tempo, onEvent = () => {} } = {}) {
  const world = window.FRAMEWORK_MCP_RUNTIME.world;
  const systems = Array.from(world.systems ?? []);
  const trombone = systems.find((s) => s?.instrument === 'trombone');
  systems.find((s) => s?.fretReader && s?.synth)?.entity.setValue(AirGuitar, 'active', false);
  for (const s of systems) if (s?.instrument && s !== trombone) s.entity.setValue(s.component, 'active', false);
  trombone.entity.setValue(trombone.component, 'active', true);

  const plan = planPerformance(song, tempo);
  const { notes, end } = plan;
  const right = rightHandClosed();
  const knuckles = PARTIAL_CENTERS.map(() => null);

  const hands = { left: window.IWER_DEVICE.hands.left, right: window.IWER_DEVICE.hands.right };
  const poses = {};
  for (const [side, hand] of Object.entries(hands)) {
    const sym = Object.getOwnPropertySymbols(hand).find((s) => hand[s]?.poses);
    poses[side] = { jointTransforms: {}, gripOffsetMatrix: new Float32Array(16) };
    hand[sym].poses[`trombonist-${side}`] = poses[side];
  }
  await window.IWER_MCP.dispatch('set_input_mode', { mode: 'hand' });
  const pin = (side, joints, matrix) => {
    const w = applyPose(poses[side], joints, matrix, side === 'right');
    const hand = hands[side];
    if (hand.poseId !== `trombonist-${side}`) hand.poseId = `trombonist-${side}`;
    hand.setPin({ anchor: 'wrist', target: w.position, wristRotation: quatFromAxes(w.x, w.y, w.z) });
  };
  let frameLength = LEAD;
  const pose = (t) => {
    // The lips move with the head, which the run holds still: read them each frame anyway.
    const lips = Array.from(trombone.lips);
    const look = Array.from(trombone.lookArr);
    const { note, air, slide } = handsAt(plan, t, frameLength);
    const knuckle = (knuckles[note.partial] ??= knuckleFor(lips, look, PARTIAL_CENTERS[note.partial]));
    const matrix = tromboneMatrix(lips, knuckle, look);
    pin('left', leftHand(pinchFor(air)), matrix);
    pin('right', shifted(right, v(0, 0, -slide)), matrix);
  };
  // Bring the horn to the lips and let the app settle.
  for (let i = 0; i < 30; i++) {
    pose(0);
    await new Promise((r) => requestAnimationFrame(r));
  }

  // Listen at the synth: what the trombone plays, every frame.
  const frames = [];
  const synth = trombone.synth;
  const set = synth.set;
  let clock = 0;
  synth.set = function (sound, at) {
    frames.push({ t: clock, midi: sound.midi, amp: sound.amplitude, tongued: sound.tongued });
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
    tongued: trombone.breath.notes,
    worstCents: Math.max(...report.map((r) => r.cents)),
    fps: Math.round(frameCount / ((wall - wallStart) / 1000)),
    tempoDragPct: Math.round(((wall - wallStart) / 1000 / clock - 1) * 1000) / 10,
    stalls,
    notes: report,
  };
}
