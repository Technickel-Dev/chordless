/**
 * Performs a melody on a bowed air instrument (the violin or the cello) the
 * way a player would, by driving IWER's emulated hands every frame. Loaded
 * in the page through Vite. makePerformer(instrument) gives the functions
 * for one instrument; violin-performer.js and cello-performer.js make them.
 *
 * - Fingering: every note's string, hand position and finger are chosen for the whole piece at once, weighing shifts, string
 *   crossings, extensions and open strings, as a player marks up a part.
 * - Left hand: fingers land on their stopping points, stay down until they
 *   would spoil a note, and the hand glides between positions with the
 *   fingers lifted.
 * - Bow: alternating strokes (detache), each as long as its note, kept near
 *   the middle of the bow. String crossings happen at the turn of the bow,
 *   where it is still. Loud passages draw faster, nearer the bridge and
 *   pressed harder.
 */

import { bowPose, createBowPose } from '/src/violin/bow.ts';
import { PRESS } from '/src/guitar/fretting.ts';
import { midiName } from '/src/guitar/chords.ts';
import { AirGuitar } from '/src/guitar/air-guitar-component.ts';
import { add, applyPose, FINGERS, handBasis, lerp, poseHand, quatFromAxes, scale, spaceFreeFingers, sub, v } from '/tests/hand-rig.js';

/**
 * A stopping finger lands this long before its note, and lifts this long
 * before a note it would spoil. A finger landing above the stop already
 * sounding on the same string would change the note at once, so it lands
 * just as the bow turns instead (SAME_STRING_LEAD).
 */
const PRESS_LEAD = 0.035;
const SAME_STRING_LEAD = 0.012;
const RELEASE_LEAD = 0.035;
const LIFT_TIME = 0.025;
const LAND_TIME = 0.04;
/** Fingertip height above the strings when off them (clear of the app's release zone). */
const HOVER = 0.024;
/**
 * The app hears the bow a little late (it smooths the hand's motion), so
 * the bow plays this far ahead of the beat.
 */
const BOW_LEAD = 0.02;
/**
 * The instrument being played, set by each function makePerformer returns
 * (one performance at a time): { instrument, root, component, geo (its
 * bowed geometry), bow (its BowSpec), positions (hand positions by where
 * the first finger stops a string, in semitones above it), fingerAt(semis,
 * base) (the finger for a note, 0 if out of reach), rest (where each finger
 * rests, semitones above the first), span (semitones from first to fourth
 * finger), bowing (by dynamic: average bow speed in m/s, contact point
 * along the strings, pressure) }.
 */
let I = null;
const geo = () => I.geo;
const stopX = (n) => I.geo.stopX(n);
const stopSemitones = (x) => I.geo.stopSemitones(x);
const stringY = (s, x) => I.geo.stringY(s, x);
const stringZ = (s, x) => I.geo.stringZ(s, x);
const stringSpacing = (x) => I.geo.stringSpacing(x);
const stringFacing = (s) => I.geo.stringFacing(s);
const boardZ = (x) => I.geo.boardZ(x);
/** Longest step the performance clock takes in one frame (two frames at 60 Hz). */
const MAX_STEP = 0.034;
const PALM_LENGTH = 0.088;

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (10 + t * (-15 + 6 * t))); // minimum jerk
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => scale(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

const PITCH = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
export const midiOf = (name) => {
  const [, pc, octave] = name.match(/^([A-G]#?)(-?\d)$/);
  return 12 * (Number(octave) + 1) + PITCH[pc];
};

/** Where a finger rests by the hand: semitones above the open string. */
const restSemis = (finger, base) => base + I.rest[finger];

// ---------------------------------------------------------------- planning

/** Every way to play an event: { stops: [{ string, semis, finger }], position }. */
function candidates(midis) {
  const out = [];
  const single = (midi, s, p) => {
    const semis = midi - geo().OPEN_MIDI[s];
    if (semis < 0 || semis > 14) return null;
    if (semis === 0) return { string: s, semis: 0, finger: 0 };
    const finger = I.fingerAt(semis, I.positions[p]);
    return finger ? { string: s, semis, finger } : null;
  };
  for (const p of Object.keys(I.positions).map(Number)) {
    if (midis.length === 1) {
      for (let s = 0; s < geo().STRING_COUNT; s++) {
        const stop = single(midis[0], s, p);
        if (stop) out.push({ stops: [stop], position: p });
      }
    } else {
      // A double stop: the lower note on one string, the higher on the next.
      for (let s = 0; s < geo().STRING_COUNT - 1; s++) {
        const a = single(midis[0], s, p);
        const b = single(midis[1], s + 1, p);
        if (a && b && (a.finger !== b.finger || a.finger === 0)) out.push({ stops: [a, b], position: p });
      }
    }
  }
  return out;
}

/** How awkward a way of playing is on its own. */
function ownCost(c) {
  let cost = 0.05 * c.position;
  for (const st of c.stops) {
    if (st.finger === 0) cost += 0.4; // open strings ring hard and cannot vibrate
    else if (st.semis - I.positions[c.position] < 0 || st.semis - I.positions[c.position] > I.span) cost += 0.3; // an extension
    // The short fingers reach the far (G) side of the neck least easily.
    if (st.finger >= 3) cost += [0.35, 0.12, 0, 0][st.string] * (st.finger - 2);
  }
  return cost;
}

/** How awkward it is to go from one way of playing to the next, `gap` seconds apart. */
function moveCost(a, b, gap) {
  const hurry = Math.max(1, 0.2 / gap);
  let cost = 0;
  const usesHand = (c) => c.stops.some((st) => st.finger > 0);
  if (a.position !== b.position && usesHand(b)) cost += 2.5 * hurry;
  const crossing = Math.abs(a.stops[0].string - b.stops[0].string);
  cost += crossing * 0.15 * hurry + (crossing > 1 ? 1.2 * hurry : 0);
  return cost;
}

/** Plans a performance: timings, fingering, the left hand's intervals and glides, and the bow's strokes. */
function planPerformance(song, tempo = song.tempo) {
  const beat = 60 / tempo;
  const first = Math.min(...song.events.map((e) => e.beat));
  // The hands settle in place before the clock starts, so the first note
  // needs only a short lead-in.
  const LEAD_IN = 0.4;
  const notes = song.events.map((e) => ({
    ...e,
    time: LEAD_IN + (e.beat - first) * beat,
    midis: (e.notes ?? [e.note]).map(midiOf),
  }));
  notes.forEach((n, i) => {
    n.duration = i + 1 < notes.length ? notes[i + 1].time - n.time : 0.9;
  });

  // Fingering: the cheapest way through the whole piece.
  const options = notes.map((n) => candidates(n.midis));
  options.forEach((o, i) => {
    if (o.length === 0) throw new Error(`no way to play ${notes[i].note ?? notes[i].notes} on the violin`);
  });
  const cost = options.map((o) => o.map(() => Infinity));
  const back = options.map((o) => o.map(() => 0));
  cost[0] = options[0].map(ownCost);
  for (let i = 1; i < notes.length; i++) {
    const gap = notes[i].time - notes[i - 1].time;
    options[i].forEach((c, k) => {
      options[i - 1].forEach((p, j) => {
        const total = cost[i - 1][j] + moveCost(p, c, gap) + ownCost(c);
        if (total < cost[i][k]) {
          cost[i][k] = total;
          back[i][k] = j;
        }
      });
    });
  }
  let k = cost.at(-1).indexOf(Math.min(...cost.at(-1)));
  for (let i = notes.length - 1; i >= 0; i--) {
    Object.assign(notes[i], options[i][k]);
    k = back[i][k];
  }
  // An open string leaves the hand where it is.
  let hand = notes.find((n) => n.stops.some((st) => st.finger > 0))?.position ?? 1;
  for (const n of notes) {
    if (n.stops.some((st) => st.finger > 0)) hand = n.position;
    n.position = hand;
    n.base = I.positions[hand];
  }

  // Shifts: late in the last note of the old position the fingers come up
  // and the hand glides; fingers land for the first note of the new one.
  const glides = [];
  for (let i = 1; i < notes.length; i++) {
    const prev = notes[i - 1];
    const n = notes[i];
    if (n.base === prev.base) continue;
    const end = n.time - PRESS_LEAD * 0.5;
    const start = Math.min(end - 0.03, Math.max(prev.time + 0.55 * prev.duration, end - 0.08));
    n.glide = { start, end, from: prev.base, to: n.base };
    glides.push(n.glide);
  }
  const baseAt = (t) => {
    let b = notes[0].base;
    for (const g of glides) {
      if (t < g.start) break;
      b = g.from + (g.to - g.from) * smooth((t - g.start) / (g.end - g.start));
    }
    return b;
  };

  const intervals = planLeftHand(notes);
  const strokes = planBow(notes);
  const end = notes.at(-1).time + notes.at(-1).duration + 0.4;
  return { notes, intervals, strokes, end, baseAt };
}

/** Each stopping finger's time on a string: { finger, string, semis, on, off }. */
function planLeftHand(notes) {
  const intervals = [];
  const holding = new Map();
  const release = (finger, at) => {
    const held = holding.get(finger);
    if (!held) return;
    held.off = Math.max(held.minOff, at);
    holding.delete(finger);
  };
  notes.forEach((n, index) => {
    if (n.glide) for (const finger of [...holding.keys()]) release(finger, n.glide.start);
    // A finger left on another string comes up before the music moves on
    // (on a cello it arches over the string being played, and could touch
    // it), unless its stop is wanted again soon.
    const playing = n.stops.map((st) => st.string);
    for (const [finger, held] of [...holding]) {
      if (playing.includes(held.string)) continue;
      const soon = notes
        .slice(index, index + 6)
        .some((m) => m.time < n.time + 0.35 && m.stops.some((st) => st.string === held.string && st.semis === held.semis));
      if (!soon) release(finger, n.time - RELEASE_LEAD);
    }
    // A finger spoils a note if it is down on a string being played,
    // higher than the note wants (or on a string played open).
    for (const [finger, held] of [...holding]) {
      const wanted = n.stops.find((st) => st.string === held.string);
      if (wanted && (wanted.semis < held.semis || (wanted.semis === held.semis && FINGERS[wanted.finger - 1] !== finger))) {
        release(finger, n.time - RELEASE_LEAD);
      }
    }
    for (const st of n.stops) {
      if (st.finger === 0) continue;
      const finger = FINGERS[st.finger - 1];
      const held = holding.get(finger);
      if (held && held.string === st.string && held.semis === st.semis) {
        held.minOff = Math.max(held.minOff, n.time + 0.03);
        continue;
      }
      release(finger, n.time - PRESS_LEAD - 0.06);
      // Landing above the note sounding on this string would change it early.
      const before = notes[index - 1]?.stops.find((p) => p.string === st.string);
      const lead = before && before.semis < st.semis ? SAME_STRING_LEAD : PRESS_LEAD;
      const interval = { finger, string: st.string, semis: st.semis, on: n.time - lead, off: Infinity, minOff: n.time + 0.03 };
      intervals.push(interval);
      holding.set(finger, interval);
    }
  });
  for (const finger of [...holding.keys()]) release(finger, Infinity);
  return intervals;
}

/** The bow's angle across the strings for a string (or between two), radians: G positive. */
const angleOf = (strings) => {
  const a = strings.map((s) => Math.atan2(...stringFacing(s)));
  return a.reduce((x, y) => x + y, 0) / a.length;
};

/** One stroke per note, alternating down (toward the tip) and up, kept near the middle of the bow. */
function planBow(notes) {
  const strokes = [];
  let u = 0.5;
  let direction = 1;
  for (const n of notes) {
    const style = I.bowing[n.dynamic] ?? I.bowing.pp;
    const start = n.time - BOW_LEAD;
    const seconds = n.notes ? 0.9 : n.duration;
    let length = (style.speed * seconds) / I.bow.hairLength;
    // Stay on the hair: shorten a stroke that would run off either end.
    const room = direction > 0 ? 0.92 - u : u - 0.08;
    length = Math.min(length, Math.max(0.02, room));
    const strings = n.stops.map((st) => st.string);
    strokes.push({ start, end: start + seconds, u0: u, u1: u + direction * length, angle: angleOf(strings), strings, ...style });
    u += direction * length;
    direction = -direction;
  }
  return strokes;
}

// -------------------------------------------------------------- the hands

/** Where a fingertip stops string `s` at `semis`, pressed a little in. */
const stopPoint = (s, semis) => {
  const x = stopX(semis);
  return v(x, stringY(s, x), stringZ(s, x) - 0.003);
};

/** A stopping fingertip's target at time t: on its string, lifting, travelling or landing. */
function leftTip(finger, t, intervals, baseAt) {
  const mine = intervals.filter((i) => i.finger === finger);
  const k = FINGERS.indexOf(finger) + 1;
  const restAt = (at) => {
    const x = stopX(restSemis(k, baseAt(at)));
    return v(x, stringY(2.2, x), stringZ(2, x) + HOVER);
  };
  const hover = (p) => [p[0], p[1], p[2] + 0.003 + HOVER];
  const now = mine.find((i) => t >= i.on && t < i.off);
  if (now) return stopPoint(now.string, now.semis);
  const prev = mine.filter((i) => i.off <= t).at(-1);
  const next = mine.find((i) => i.on > t);
  const from = prev ? stopPoint(prev.string, prev.semis) : restAt(t);
  const to = next ? stopPoint(next.string, next.semis) : restAt(t);
  if (prev && t < prev.off + LIFT_TIME) return lerp(from, hover(from), smooth((t - prev.off) / LIFT_TIME));
  if (next && t > next.on - LAND_TIME) return lerp(hover(to), to, smooth(1 - (next.on - t) / LAND_TIME));
  const after = prev ? prev.off + LIFT_TIME : -Infinity;
  const before = next ? next.on - LAND_TIME : Infinity;
  if (prev && next && before - after < 0.4) return lerp(hover(from), hover(to), smooth((t - after) / Math.max(0.01, before - after)));
  const rest = restAt(t);
  if (next && t > before - 0.2) return lerp(rest, hover(to), smooth(1 - (before - t) / 0.2));
  if (prev && t < after + 0.15) return lerp(hover(from), rest, smooth((t - after) / 0.15));
  return rest;
}

/**
 * A pressing pad off its note: on the next string, or reaching past the tip
 * toward the bridge (which would sound sharp). As the app reads it, a
 * finger lying flat on the strings presses all along its middle bone too.
 */
function violinStrays(tip, dip, pip) {
  if (tip[0] <= geo().dims.boardEndX || tip[0] >= geo().dims.nutX) return 0;
  const s = Math.round(1.5 - (tip[1] / (stringSpacing(tip[0]) * 3)) * 3);
  if (s < 0 || s >= geo().STRING_COUNT || tip[2] - stringZ(s, tip[0]) > PRESS.above) return 0;
  const stop = stopSemitones(tip[0]);
  const low = (p) => p[2] - stringZ(1, p[0]) <= PRESS.above;
  const samples = [1, 2, 3, 4].map((i) => lerp(tip, dip, i / 8));
  if (low(tip) && low(dip) && low(pip)) for (let i = 1; i <= 4; i++) samples.push(lerp(dip, pip, i / 4));
  let strays = 0;
  for (const p of samples) {
    if (p[2] - stringZ(s, p[0]) > PRESS.release) continue;
    const off = Math.abs(p[1] - stringY(s, p[0])) / stringSpacing(p[0]);
    if (off > 0.33 || stopSemitones(p[0]) > stop + 0.25) strays++;
  }
  return strays;
}

const boardHalf = (x) =>
  (geo().dims.boardWidthEnd + ((geo().dims.boardWidthNut - geo().dims.boardWidthEnd) * (x - geo().dims.boardEndX)) / (geo().dims.nutX - geo().dims.boardEndX)) / 2;

/**
 * The left hand round the violin's neck: the palm under it on the E side,
 * the index knuckle toward the scroll, fingers arching over to the
 * strings, the thumb along the G side of the neck opposite the first finger.
 */
function violinLeftHand({ base, tips }) {
  const hx = (stopX(base) + stopX(base + I.span)) / 2;
  const pressingOf = (f) => Math.min(1, Math.max(0, (stringZ(1, tips[f][0]) + 0.02 - tips[f][2]) / 0.02));
  let weight = 0;
  let across = 0;
  for (const f of FINGERS) {
    const w = 0.3 + pressingOf(f);
    weight += w;
    across += w * tips[f][1];
  }
  const edge = -boardHalf(hx);
  const knuckle = v(hx, Math.min(edge - 0.01, Math.max(edge - 0.028, across / weight - 0.045)), boardZ(hx) + 0.006);
  const forward = norm(v(0, 0.33, 0.94));
  const wrist = sub(knuckle, scale(forward, PALM_LENGTH));
  const hand = handBasis(wrist, forward, v(1, 0, 0), false);
  const targets = { ...tips };
  spaceFreeFingers(targets, hand.knuckles, (f) => pressingOf(f) > 0.5, v(1, 0, 0));
  const thumbX = stopX(base) - 0.008;
  return poseHand(
    { ...hand, upright: v(0, 0, 1), strays: violinStrays },
    { targets, pressingOf, thumbTip: v(thumbX, boardHalf(thumbX) + 0.006, boardZ(thumbX) - 0.014), thumbWeights: [0.6, 0.55, 0.55] },
  );
}

/** Joint names in WebXR order, for reading a pose's positions as the app does. */
const JOINT_NAMES = [
  'wrist',
  ...['metacarpal', 'phalanx-proximal', 'phalanx-distal', 'tip'].map((n) => `thumb-${n}`),
  ...FINGERS.flatMap((f) => ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'].map((n) => `${f}-finger-${n}`)),
];
const positionsOf = (joints) => {
  const out = new Float32Array(JOINT_NAMES.length * 3);
  JOINT_NAMES.forEach((n, i) => out.set(joints[n].position, i * 3));
  return out;
};

/** The bow's frame from where it is held: X along to the tip, Z away from the hair. */
const bowFrame = (frog, along, hairSide) => {
  const x = norm(along);
  let z = scale(hairSide, -1);
  const y = norm(cross(z, x));
  z = cross(x, y);
  return { o: frog, x, y, z };
};
const toFrame = (f, p) => add(f.o, add(add(scale(f.x, p[0]), scale(f.y, p[1])), scale(f.z, p[2])));
const intoFrame = (f, p) => {
  const d = sub(p, f.o);
  return [dot(d, f.x), dot(d, f.y), dot(d, f.z)];
};
const dirInto = (f, d) => [dot(d, f.x), dot(d, f.y), dot(d, f.z)];
const dirTo = (f, d) => add(add(scale(f.x, d[0]), scale(f.y, d[1])), scale(f.z, d[2]));

/**
 * A right hand in a bow hold, solved once: palm down, the fingers draped
 * over the stick and the thumb bent under the frog. Returned in the bow's
 * own frame (as the app would place the bow in this hand), so it can be
 * moved with the bow.
 */
function bowHold() {
  const wrist = v(0, 0, 0);
  const hand = handBasis(wrist, v(1, 0, 0), v(0, 1, 0), true);
  const F = hand.forward;
  const P = hand.palm;
  const targets = {};
  for (const f of FINGERS) {
    const [fwd, down] = { index: [0.045, 0.04], middle: [0.038, 0.047], ring: [0.035, 0.045], pinky: [0.03, 0.022] }[f];
    targets[f] = add(add(hand.knuckles[f], scale(F, fwd)), scale(P, down));
  }
  const thumbTip = add(add(add(hand.knuckles.middle, scale(F, 0.022)), scale(P, 0.04)), scale(hand.lateral, 0.006));
  const joints = poseHand({ ...hand, upright: P }, { targets, pressingOf: () => 0, thumbTip, thumbWeights: [0.7, 0.5, 0.6] });
  const pose = bowPose(positionsOf(joints), createBowPose(), I.bow);
  const frame = bowFrame(pose.frog, pose.along, pose.hairSide);
  const local = {};
  for (const [name, j] of Object.entries(joints)) {
    local[name] = { position: intoFrame(frame, j.position), x: dirInto(frame, j.x), y: dirInto(frame, j.y), z: dirInto(frame, j.z) };
  }
  return local;
}

/** Where the bow is at time t, in violin space: its frame, and whether it is lifted. */
function bowAt(t, strokes) {
  let i = strokes.findIndex((s) => t < s.end);
  if (i < 0) i = strokes.length - 1;
  const s = strokes[i];
  const prev = strokes[i - 1] ?? s;
  const progress = smooth((t - s.start) / (s.end - s.start));
  const u = t < s.start ? prev.u1 : s.u0 + (s.u1 - s.u0) * progress;
  // Cross strings at the turn of the bow, where it is still.
  const turn = smooth((t - (s.start - 0.015)) / 0.03);
  const angle = prev.angle + (s.angle - prev.angle) * turn;
  const x = prev.x + (s.x - prev.x) * turn;
  const press = prev.press + (s.press - prev.press) * turn;
  // Before the first note and after the last, the bow is off the strings.
  const lift = t < strokes[0].start - 0.1 ? 0.02 : t > strokes.at(-1).end + 0.1 ? 0.02 : 0;
  // The contact point on the arch of strings at this angle.
  const angles = Array.from({ length: geo().STRING_COUNT }, (_, k) => angleOf([k]));
  const side = geo().dims.lowSide;
  let k = 0;
  while (k < geo().STRING_COUNT - 2 && side * angle < side * angles[k + 1]) k++;
  const w = Math.min(1, Math.max(0, (angles[k] - angle) / (angles[k] - angles[k + 1])));
  const point = lerp(v(x, stringY(k, x), stringZ(k, x)), v(x, stringY(k + 1, x), stringZ(k + 1, x)), w);
  const outward = v(0, Math.sin(angle), Math.cos(angle));
  // The tip toward the low strings, the frog (and the hand) by the high.
  const along = scale(v(0, Math.cos(angle), -Math.sin(angle)), side);
  const contact = add(point, scale(outward, lift - press));
  const hairSide = scale(outward, -1);
  const hair0 = add(contact, scale(along, -u * I.bow.hairLength));
  const frog = add(add(hair0, scale(hairSide, -I.bow.hairDrop)), scale(along, -I.bow.frogToHair));
  return bowFrame(frog, along, hairSide);
}

/** Both hands' joints (violin space) at time t for a planned performance. */
function handsFor(plan) {
  const { intervals, strokes, baseAt } = plan;
  const hold = bowHold();
  const mine = I;
  return (t) => {
    I = mine;
    const tips = {};
    for (const f of FINGERS) tips[f] = leftTip(f, t, intervals, baseAt);
    const left = violinLeftHand({ base: baseAt(t), tips });
    const bow = bowAt(t, strokes);
    const right = {};
    for (const [name, j] of Object.entries(hold)) {
      right[name] = { position: toFrame(bow, j.position), x: dirTo(bow, j.x), y: dirTo(bow, j.y), z: dirTo(bow, j.z) };
    }
    return { left, right };
  };
}

// -------------------------------------------------------------- scoring

/**
 * Scores what the violin sounded against the plan. `frames` are
 * { t, amp: [per string], midi: [per string] } on the performance clock.
 * In the middle of each note the loudest string must play its pitch, and
 * no other string may sound at more than half its loudness; a double stop
 * needs both its notes.
 */
function scoreNotes(notes, frames) {
  const report = [];
  let i = 0;
  for (const n of notes) {
    const length = n.notes ? 0.9 : n.duration;
    const from = n.time + 0.25 * length;
    const to = n.time + 0.75 * length;
    while (i < frames.length && frames[i].t < from) i++;
    const inside = [];
    for (let j = i; j < frames.length && frames[j].t <= to; j++) inside.push(frames[j]);
    const want = n.midis;
    const heard = new Map();
    let loudest = 0;
    let crossTalk = 0;
    for (const f of inside) {
      const order = [0, 1, 2, 3].sort((a, b) => f.amp[b] - f.amp[a]);
      const top = f.amp[order[0]];
      loudest = Math.max(loudest, top);
      if (top < 0.1) continue;
      const sounding = order.filter((s) => f.amp[s] > (want.length > 1 ? 0.1 : top * 0.5)).map((s) => Math.round(f.midi[s]));
      const key = [...sounding].sort((a, b) => a - b).join('+');
      heard.set(key, (heard.get(key) ?? 0) + 1);
      if (want.length === 1 && sounding.length > 1) crossTalk++;
    }
    const best = [...heard].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    const expected = [...want].sort((a, b) => a - b).join('+');
    report.push({
      beat: n.beat,
      want: n.note ?? n.notes.join('+'),
      heard: best ? best.split('+').map((m) => midiName(Number(m))).join('+') : '-',
      string: n.stops.map((st) => geo().STRING_NAMES[st.string]).join(''),
      finger: n.stops.map((st) => st.finger).join(''),
      position: n.position,
      loudness: Math.round(loudest * 100) / 100,
      ok: best === expected && loudest > 0.15 && crossTalk <= inside.length / 3,
    });
  }
  return report;
}

// -------------------------------------------------------------- performing

const dispatch = (method, params = {}) => window.IWER_MCP.dispatch(method, params);
const systemWith = (key) => Array.from(window.FRAMEWORK_MCP_RUNTIME.world.systems ?? []).find((s) => s?.[key] && s?.synth);

/**
 * Plays `song` live: takes out the violin, drives both emulated hands every
 * frame and records what the app sounds, straight from its synth. Calls
 * `onEvent(index)` as each note begins. Returns the score.
 */
async function perform(song, { tempo = song.tempo, onEvent = () => {} } = {}) {
  const systems = Array.from(window.FRAMEWORK_MCP_RUNTIME.world.systems ?? []);
  const violin = systems.find((s) => s?.instrument === I.instrument);
  const AirViolin = I.component;
  const guitar = systemWith('fretReader');
  guitar?.entity.setValue(AirGuitar, 'active', false);
  // Put the other bowed instruments away.
  for (const s of systems) if (s?.instrument && s !== violin) s.entity.setValue(s.component, 'active', false);
  violin.entity.setValue(AirViolin, 'active', true);
  violin.entity.setValue(AirViolin, 'resetPlacement', true);
  const plan = planPerformance(song, tempo);
  const { notes, end } = plan;
  const handsAt = handsFor(plan);
  const root = () => {
    const r = window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName(I.root);
    r.updateMatrixWorld(true);
    return Array.from(r.matrixWorld.elements);
  };

  const hands = { left: window.IWER_DEVICE.hands.left, right: window.IWER_DEVICE.hands.right };
  const poses = {};
  for (const [side, hand] of Object.entries(hands)) {
    const sym = Object.getOwnPropertySymbols(hand).find((s) => hand[s]?.poses);
    poses[side] = { jointTransforms: {}, gripOffsetMatrix: new Float32Array(16) };
    hand[sym].poses[`violinist-${side}`] = poses[side];
  }
  await dispatch('set_input_mode', { mode: 'hand' });
  const pin = (side, joints, matrix) => {
    const w = applyPose(poses[side], joints, matrix, side === 'right');
    const hand = hands[side];
    if (hand.poseId !== `violinist-${side}`) hand.poseId = `violinist-${side}`;
    hand.setPin({ anchor: 'wrist', target: w.position, wristRotation: quatFromAxes(w.x, w.y, w.z) });
  };
  const pose = (t) => {
    const { left, right } = handsAt(t);
    const matrix = root();
    pin('left', left, matrix);
    pin('right', right, matrix);
  };
  // Let the violin settle under the chin with the hands in place.
  for (let i = 0; i < 30; i++) {
    pose(0);
    await new Promise((r) => requestAnimationFrame(r));
  }

  // Listen at the synth: every string's loudness and pitch, every frame.
  const frames = [];
  const synth = violin.synth;
  const setString = synth.setString;
  let clock = 0;
  let current = null;
  synth.setString = function (s, sound) {
    if (current) {
      current.amp[s] = sound.amplitude;
      current.midi[s] = sound.midi;
    }
    return setString.call(this, s, sound);
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
          // What the app plays this frame is recorded against this clock.
          current = { t: clock, amp: [0, 0, 0, 0], midi: [0, 0, 0, 0] };
          frames.push(current);
          pose(clock);
          frameCount++;
          const index = notes.findIndex((n) => n.time > clock) - 1;
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
    synth.setString = setString;
  }
  const report = scoreNotes(notes, frames);
  return {
    notesRight: report.filter((r) => r.ok).length,
    notesTotal: report.length,
    fps: Math.round(frameCount / ((wall - wallStart) / 1000)),
    tempoDragPct: Math.round(((wall - wallStart) / 1000 / clock - 1) * 1000) / 10,
    stalls,
    strokes: violin.entity.getValue(AirViolin, 'strokes'),
    positions: [...new Set(notes.map((n) => n.position))],
    notes: report,
  };
}

/** The performer's functions for one instrument (see I above). */
export function makePerformer(instrument) {
  const bound =
    (fn) =>
    (...args) => {
      I = instrument;
      return fn(...args);
    };
  return {
    planPerformance: bound(planPerformance),
    handsFor: bound(handsFor),
    scoreNotes: bound(scoreNotes),
    perform: bound(perform),
    leftHand: bound(violinLeftHand),
  };
}
