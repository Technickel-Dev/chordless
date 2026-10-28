/**
 * Plays a song on the air guitar the way a guitarist would, with IWER's
 * emulated hands driven frame by frame (see hand-rig.js). Runs inside the
 * page, loaded through Vite.
 *
 * The song is planned first:
 * - Left hand: a hand position on the neck chosen with lookahead (shifting
 *   only when the music needs it), one finger per fret, fingers kept down
 *   until something needs them up, and lifts timed so the app sees the
 *   release before the next note.
 * - Right hand: the index fingertip flicks across a string from the gap on
 *   one side to the gap on the other, in whichever direction needs no
 *   extra motion, lifting over the strings only to reach a string it is
 *   not next to. A chord is a wrist strum.
 * Then every frame, each fingertip follows eased arcs between those
 * targets, the wrists follow on springs, the joints are solved, and both
 * hands' poses are written to IWER.
 */

import { GUITAR, OPEN_MIDI } from '/src/guitar/geometry.ts';
import { midiName } from '/src/guitar/chords.ts';
import { CHORDS } from '/tests/chord-hand.js';
import { applyPose, FINGERS, gapY, leftHand, lerp, pressPoint, quatFromAxes, rightHand, slotX, v } from '/tests/hand-rig.js';

/** Fingertip height above the strings when hovering (clear of the app's release zone). */
const HOVER = 0.026;
/** A fretting finger lands this long before its note is picked. */
const PRESS_LEAD = 0.03;
/** A finger must be up this long before a note it would spoil (lift + the app's 25 ms release + a frame). */
const RELEASE_LEAD = 0.075;
const LIFT_TIME = 0.025;
const LAND_TIME = 0.045;
/** Picking: where along the strings, how deep, and how high to lift over them. */
const PICK_X = -0.012;
const PICK_DEPTH = 0.002;
const PICK_LIFT = 0.045;
/** Stroke time by dynamic; the app sets loudness from fingertip speed. */
const STROKE_SECONDS = { pp: 0.03, p: 0.026, mf: 0.022, f: 0.017, ff: 0.013 };

const dispatch = (method, params = {}) => window.IWER_MCP.dispatch(method, params);
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (10 + t * (-15 + 6 * t))); // minimum jerk

function guitarRoot() {
  const root = window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName('AirGuitar');
  root.updateMatrixWorld(true);
  return root;
}

let guitarEntity = null;
async function guitarState() {
  if (guitarEntity == null) {
    const found = await dispatch('ecs_find_entities', { withComponents: ['AirGuitar'] });
    guitarEntity = found.entities[0].entityIndex;
  }
  const q = await dispatch('ecs_query_entity', { entityIndex: guitarEntity });
  return q.components.find((c) => c.componentId === 'AirGuitar').values;
}

/** Longest step the performance clock takes in one frame. */
const MAX_STEP = 0.02;

// ---------------------------------------------------------------- planning

/** Picks a hand position for each note, shifting only when the music needs it. */
function planPositions(notes) {
  let position = null;
  for (const n of notes) {
    const frets = notes.filter((m) => m.time >= n.time && m.time < n.time + 0.6).flatMap((m) => m.frets);
    if (n.frets.length === 0 || frets.length === 0) {
      // Open strings need no fretting hand, so they never move it.
      n.position = position ?? (frets.length ? Math.min(...frets) : 2);
      continue;
    }
    const lo = Math.min(...frets);
    const hi = Math.max(...frets);
    const fits = (p) => p != null && n.frets.every((f) => f >= p - 1 && f <= p + 3) && lo >= p - 1 && hi <= p + 3;
    if (!fits(position)) {
      // One finger per fret with the index on the lowest fret coming up;
      // if the next few notes span too far, fit this note and shift later.
      const own = n.frets.length ? Math.min(...n.frets) : lo;
      position = Math.max(1, hi - lo <= 3 ? lo : Math.max(own, Math.max(...n.frets, own) - 3));
    }
    n.position = position;
  }
}

/**
 * Schedules each shift of hand position as a guitarist would: the fingers
 * come up after the last note of the old position, the hand glides, and
 * the fingers land for the first note of the new one. Marks the first note
 * of each new position with { glide: { start, end, from, to } }.
 */
function planShifts(notes) {
  let prev = null;
  for (const n of notes) {
    if (n.frets.length === 0) continue;
    if (prev && n.position !== prev.position) {
      const end = n.time - PRESS_LEAD - LAND_TIME;
      const start = Math.min(end - 0.06, Math.max(prev.time + 0.03 + LIFT_TIME, end - 0.2));
      n.glide = { start, end, from: prev.position, to: n.position };
    }
    prev = n;
  }
}

/** Chooses the finger for a fretted note given the hand position and what is held. */
function fingerFor(fret, string, position, holding) {
  let k = Math.min(3, Math.max(0, fret - position));
  // The same fret on another string already held by that finger: use the
  // next finger, so both stay down (G# and C# at fret 9).
  const held = holding.get(FINGERS[k]);
  // A guitarist puts the lower finger on the lower (bass) string, as in an
  // A chord, so the fingers sit side by side instead of crossing.
  if (held && held.fret === fret && held.string !== string) {
    const step = string < held.string ? -1 : 1;
    k = k + step >= 0 && k + step <= 3 ? k + step : k - step;
  }
  return FINGERS[k];
}

/** Each fretting finger's pressed intervals: { finger, string, fret, on, off, flatToward }. */
function planLeftHand(notes) {
  const intervals = [];
  const holding = new Map(); // finger -> open interval
  const release = (finger, at) => {
    const held = holding.get(finger);
    if (!held) return;
    held.off = Math.max(held.minOff, at);
    holding.delete(finger);
  };

  for (const n of notes) {
    // Shifting: every finger comes up before the hand moves, so nothing is
    // dragged along a string.
    if (n.glide) for (const finger of [...holding.keys()]) release(finger, n.glide.start - LIFT_TIME);
    // Anything that would spoil this note must already be up: a finger
    // higher up a string being played, on a string played open, or out of
    // the hand's reach at its new position.
    for (const [finger, held] of [...holding]) {
      const pressed = n.presses.find((p) => p.string === held.string);
      const spoils = pressed
        ? pressed.fret < held.fret || (pressed.fret === held.fret && pressed.finger !== finger)
        : n.strings.includes(held.string);
      const outOfReach = held.fret < n.position - 1 || held.fret > n.position + 3;
      if (spoils || outOfReach || (n.chord && !n.presses.some((p) => p.finger === finger))) {
        release(finger, n.time - RELEASE_LEAD);
      }
    }
    for (const p of n.presses) {
      const held = holding.get(p.finger);
      if (held && held.string === p.string && held.fret === p.fret) {
        held.minOff = Math.max(held.minOff, n.time + 0.03);
        continue;
      }
      // The finger leaves what it held, then travels.
      release(p.finger, n.time - PRESS_LEAD - 0.09);
      const interval = {
        finger: p.finger,
        string: p.string,
        fret: p.fret,
        flatToward: p.flatToward,
        on: n.time - PRESS_LEAD,
        off: Infinity,
        minOff: n.time + 0.03,
      };
      intervals.push(interval);
      holding.set(p.finger, interval);
    }
  }
  for (const finger of [...holding.keys()]) release(finger, Infinity);
  return intervals;
}

/** Right-hand strokes: { time, start, end, fromGap, toGap, transit, strum }. */
function planRightHand(notes) {
  const strokes = [];
  let gap = 3;
  for (const n of notes) {
    if (n.chord) {
      const half = (STROKE_SECONDS[n.dynamic] ?? STROKE_SECONDS.f) * 1.6;
      strokes.push({ time: n.time, start: n.time - half, end: n.time + half, fromGap: 0, toGap: 6, transit: gap !== 0, strum: true });
      gap = 6;
      continue;
    }
    const s = n.string;
    const half = (STROKE_SECONDS[n.dynamic] ?? STROKE_SECONDS.mf) / 2;
    // Pick away from the side the finger is already on; only a string it
    // is not next to needs a lift over the strings.
    let fromGap = s;
    let transit = false;
    if (gap === s + 1) fromGap = s + 1;
    else if (gap !== s) {
      fromGap = Math.abs(gap - s) < Math.abs(gap - (s + 1)) ? s : s + 1;
      transit = true;
    }
    const toGap = fromGap === s ? s + 1 : s;
    strokes.push({ time: n.time, start: n.time - half, end: n.time + half, fromGap, toGap, transit });
    gap = toGap;
  }
  return strokes;
}

// ----------------------------------------------------------------- motion

/** Fingertip target for a fretting finger at time t: pressed, lifting, travelling or landing. */
function leftTip(finger, t, intervals, positionAt) {
  const mine = intervals.filter((i) => i.finger === finger);
  const k = FINGERS.indexOf(finger);
  /** The finger's resting place by the hand when the hand is at time `at`. */
  const restAt = (at) => {
    const p = positionAt(at);
    return v(slotX(p + k), pressPoint(Math.min(5, 2 + k), p + k)[1], GUITAR.stringZ + HOVER + 0.006);
  };
  const rest = restAt(t);
  const hover = (p) => [p[0], p[1], GUITAR.stringZ + HOVER];
  const pointOf = (i) => pressPoint(i.string, i.fret, i.fraction ?? 0.35);

  const now = mine.find((i) => t >= i.on && t < i.off);
  if (now) return { tip: pointOf(now), flatToward: now.flatToward };
  const prev = mine.filter((i) => i.off <= t).at(-1);
  const next = mine.find((i) => i.on > t);
  const from = prev ? pointOf(prev) : rest;
  const to = next ? pointOf(next) : rest;
  const t0 = prev ? prev.off : -Infinity;
  const t1 = next ? next.on : Infinity;

  // Lift off, then either go straight over to the next note when it is
  // close, or relax back to the finger's place by the hand and only reach
  // for the next note shortly before it (as the hand gets there). A finger
  // never flies ahead to a note the hand is not near yet.
  if (prev && t < t0 + LIFT_TIME) return { tip: lerp(from, hover(from), smooth((t - t0) / LIFT_TIME)) };
  if (next && t > t1 - LAND_TIME) return { tip: lerp(hover(to), to, smooth(1 - (t1 - t) / LAND_TIME)) };
  const after = prev ? t0 + LIFT_TIME : -Infinity;
  const before = next ? t1 - LAND_TIME : Infinity;
  if (prev && next && before - after < 0.45) {
    return { tip: lerp(hover(from), hover(to), smooth((t - after) / Math.max(0.01, before - after))) };
  }
  const settle = 0.18;
  const reach = 0.22;
  if (prev && t < after + settle) {
    // Relax relative to the hand: the offset from the hand fades, so the
    // finger travels with a shifting hand instead of trailing behind it.
    const offset = [hover(from)[0] - restAt(after)[0], hover(from)[1] - restAt(after)[1], hover(from)[2] - restAt(after)[2]];
    const fade = 1 - smooth((t - after) / settle);
    return { tip: [rest[0] + offset[0] * fade, rest[1] + offset[1] * fade, rest[2] + offset[2] * fade] };
  }
  if (next && t > before - reach) return { tip: lerp(rest, hover(to), smooth(1 - (before - t) / reach)) };
  return { tip: rest };
}

/** Index fingertip target for the picking hand at time t. */
function rightTip(t, strokes) {
  const at = (gap, height = -PICK_DEPTH) => v(PICK_X, gapY(gap, PICK_X), GUITAR.stringZ + height);
  const i = strokes.findIndex((s) => t < s.end);
  if (i < 0) {
    const last = strokes.at(-1);
    return lerp(at(last.toGap), at(last.toGap, 0.02), smooth((t - last.end) / 0.3));
  }
  const s = strokes[i];
  if (t >= s.start) return lerp(at(s.fromGap), at(s.toGap), smooth((t - s.start) / (s.end - s.start)));
  if (i === 0) return lerp(at(s.fromGap, PICK_LIFT), at(s.fromGap), smooth(1 - (s.start - t) / 0.25));
  const prevGap = strokes[i - 1].toGap;
  const prevEnd = strokes[i - 1].end;
  if (!s.transit) return at(prevGap);
  // Lift straight off, cross above the strings, come down beside the string.
  const window = s.start - prevEnd;
  const lift = Math.min(0.035, window * 0.25);
  const land = Math.min(0.035, window * 0.25);
  if (t < prevEnd + lift) return lerp(at(prevGap), at(prevGap, PICK_LIFT), smooth((t - prevEnd) / lift));
  if (t > s.start - land) return lerp(at(s.fromGap, PICK_LIFT), at(s.fromGap), smooth(1 - (s.start - t) / land));
  return lerp(at(prevGap, PICK_LIFT), at(s.fromGap, PICK_LIFT), smooth((t - prevEnd - lift) / Math.max(0.005, window - lift - land)));
}

// -------------------------------------------------------------- performing

/**
 * Plans a performance: every note's timing, hand position and finger, the
 * fretting fingers' pressed intervals, the picking strokes and the hand's
 * glide along the neck.
 */
export function planPerformance(song, tempo = song.tempo) {
  const beat = 60 / tempo;
  const first = Math.min(...song.events.map((e) => e.beat));
  const LEAD_IN = 1.0;

  // One planning record per musical event.
  const notes = song.events.map((e) => {
    const time = LEAD_IN + (e.beat - first) * beat;
    if (e.chord) {
      const shape = CHORDS[e.chord];
      const presses = Object.entries(shape.fingers).map(([finger, [string, fret]]) => ({ finger, string, fret }));
      return { ...e, time, presses, strings: [0, 1, 2, 3, 4, 5], frets: presses.map((p) => p.fret), dynamic: e.dynamic ?? 'f' };
    }
    return { ...e, time, strings: [e.string], frets: e.fret > 0 ? [e.fret] : [], presses: [] };
  });
  planPositions(notes);
  planShifts(notes);
  // Fingers, tracking what stays held as the song goes.
  const holding = new Map();
  for (const n of notes) {
    if (n.chord) {
      holding.clear();
      n.presses.forEach((p) => holding.set(p.finger, p));
    } else if (n.fret > 0) {
      const finger = fingerFor(n.fret, n.string, n.position, holding);
      n.presses = [{ finger, string: n.string, fret: n.fret }];
      for (const [f, h] of [...holding]) if (h.string === n.string && f !== finger) holding.delete(f);
      holding.set(finger, { string: n.string, fret: n.fret });
    } else {
      for (const [f, h] of [...holding]) if (h.string === n.string) holding.delete(f);
    }
  }
  const intervals = planLeftHand(notes);
  // Two fingers down on the same fret at once sit one behind the other in
  // it (the lower finger further from the fret wire), not on top of each other.
  for (const a of intervals) {
    for (const b of intervals) {
      if (a === b || a.fret !== b.fret || a.finger === b.finger) continue;
      if (a.on >= b.off || b.on >= a.off) continue;
      a.fraction = FINGERS.indexOf(a.finger) < FINGERS.indexOf(b.finger) ? 0.62 : 0.16;
    }
  }
  const strokes = planRightHand(notes);
  const end = notes.at(-1).time + 2.5;

  // Hand position over time: glide to each new position just before it's needed.
  const glides = notes.filter((n) => n.glide).map((n) => n.glide);
  const startPosition = notes.find((n) => n.frets.length)?.position ?? 2;
  const positionAt = (t) => {
    let p = startPosition;
    for (const g of glides) {
      if (t < g.start) break;
      p = g.from + (g.to - g.from) * smooth((t - g.start) / (g.end - g.start));
    }
    return p;
  };
  return { notes, intervals, strokes, end, positionAt };
}

/**
 * Both hands' joints (guitar space) at time t for a planned performance.
 * Returns a function of (t, dt); it keeps the picking wrist's spring state.
 */
export function handsFor(plan) {
  const { intervals, strokes, positionAt } = plan;
  // The picking wrist rides above and behind the fingertip, so the finger
  // reaches down and forward to the strings instead of curling under.
  const WRIST_BEHIND = 0.11;
  const WRIST_HEIGHT = 0.1;
  let wristY = gapY(3, PICK_X) + WRIST_BEHIND;
  return (t, dt) => {
    const position = positionAt(t);
    const tips = {};
    const flat = {};
    for (const f of FINGERS) {
      const { tip, flatToward } = leftTip(f, t, intervals, positionAt);
      tips[f] = tip;
      if (flatToward) flat[f] = flatToward;
    }
    const left = leftHand({ position, tips, flat });

    const indexTip = rightTip(t, strokes);
    // The wrist follows the fingertip across the strings on a spring; a
    // strum moves the whole hand.
    const strumming = strokes.some((s) => s.strum && t >= s.start - 0.06 && t <= s.end + 0.06);
    const wanted = indexTip[1] + WRIST_BEHIND;
    wristY = strumming ? wanted : wristY + (wanted - wristY) * (1 - Math.exp(-dt / 0.12));
    // Lifting over the strings lifts the whole hand, not just the fingertip.
    const wristZ = indexTip[2] + PICK_DEPTH + WRIST_HEIGHT;
    // The index knuckle rides over the pick point, so the resting fingers
    // hang beside the index rather than against it.
    const right = rightHand({ wrist: v(PICK_X - 0.027, wristY, wristZ), indexTip });
    return { left, right };
  };
}

export async function perform(song, { tempo = song.tempo, onEvent = () => {} } = {}) {
  // Wait for the synth to finish pre-rendering its notes: rendering during
  // the performance would stall frames and the hands would skip.
  const guitarSystem = Array.from(window.FRAMEWORK_MCP_RUNTIME.world.systems ?? []).find((s) => s?.synth);
  await guitarSystem?.synth.warm;
  const plan = planPerformance(song, tempo);
  const { notes, end } = plan;
  const handsAt = handsFor(plan);

  // A live pose for each hand, updated in place every frame.
  const hands = { left: window.IWER_DEVICE.hands.left, right: window.IWER_DEVICE.hands.right };
  const poses = {};
  for (const [side, hand] of Object.entries(hands)) {
    const sym = Object.getOwnPropertySymbols(hand).find((s) => hand[s]?.poses);
    // Both hands share IWER's pose table, so each gets its own entry.
    poses[side] = { jointTransforms: {}, gripOffsetMatrix: new Float32Array(16) };
    hand[sym].poses[`performer-${side}`] = poses[side];
  }
  await dispatch('set_input_mode', { mode: 'hand' });

  const rootMatrix = Array.from(guitarRoot().matrixWorld.elements);
  const pin = (side, joints, right) => {
    const w = applyPose(poses[side], joints, rootMatrix, right);
    const hand = hands[side];
    if (hand.poseId !== `performer-${side}`) hand.poseId = `performer-${side}`;
    hand.setPin({ anchor: 'wrist', target: w.position, wristRotation: quatFromAxes(w.x, w.y, w.z) });
  };
  const pose = (t, dt) => {
    const { left, right } = handsAt(t, dt);
    pin('left', left, false);
    pin('right', right, true);
  };

  // Settle both hands into their starting pose before the clock starts, so
  // moving them into place does not brush a string.
  let wristSettled = 0;
  while (wristSettled++ < 20) {
    pose(0, 0.016);
    await new Promise((r) => requestAnimationFrame(r));
  }

  // Watch the app: every pluck it registers, with the note and when.
  // Times are on the performance clock, which never jumps: if the browser
  // stalls, the performance slows for a moment instead of skipping notes.
  const heard = [];
  let watching = true;
  let clock = 0;
  const before = await guitarState();
  let plucks = before.plucks;
  const watch = (async () => {
    while (watching) {
      const g = await guitarState();
      if (g.plucks > plucks) {
        heard.push({ at: clock, count: g.plucks - plucks, note: g.lastNote, chord: g.chord });
        plucks = g.plucks;
      }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
  })();

  // Drive the hands every frame until the song, and its last chord, end.
  let shown = -1;
  let frames = 0;
  let slowest = 0;
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
          slowest = Math.max(slowest, step);
          if (step > MAX_STEP) stalls++;
          // Never jump more than MAX_STEP in a frame: a stalled frame slows
          // the performance for an instant rather than skipping motion the
          // app would miss.
          const advance = Math.min(step, MAX_STEP);
          clock += advance;
          const t = clock;
          pose(t, Math.max(0.001, advance));
          frames++;
          const current = notes.findIndex((n) => n.time > t) - 1;
          if (current !== shown && current >= 0) {
            shown = current;
            onEvent(current, song.events[current]);
          }
          if (t < end) requestAnimationFrame(tick);
          else resolve();
        } catch (err) {
          reject(err);
        }
      };
      requestAnimationFrame(tick);
    });
  } finally {
    watching = false;
    await watch;
  }

  // Match what the app played to the score by time: each note takes the
  // earliest unclaimed pluck heard shortly after it, so one missed or extra
  // pluck counts once instead of shifting every note after it.
  const report = [];
  const claimed = new Set();
  const pluckFor = (n) => {
    const i = heard.findIndex((h, j) => !claimed.has(j) && h.at > n.time - 0.04 && h.at < n.time + 0.16);
    if (i < 0) return null;
    claimed.add(i);
    return heard[i];
  };
  for (const n of notes) {
    if (n.chord) {
      // Name the chord once the whole strum is ringing: the last pluck of it.
      const strum = heard.filter((h) => h.at > n.time - 0.1 && h.at < n.time + 0.3).at(-1);
      report.push({
        beat: n.beat,
        want: `${n.chord} chord`,
        heard: strum?.chord ?? '-',
        lateMs: strum ? Math.round((strum.at - n.time) * 1000) : null,
        ok: strum?.chord === n.chord,
      });
      continue;
    }
    const h = pluckFor(n);
    report.push({
      beat: n.beat,
      want: n.note,
      finger: n.presses[0]?.finger ?? 'open',
      position: n.position,
      heard: h?.note ?? '-',
      lateMs: h ? Math.round((h.at - n.time) * 1000) : null,
      ok: h?.note === midiName(OPEN_MIDI[n.string] + n.fret) && h.count === 1,
    });
  }
  // Plucks no note claimed (outside the final strum) were extra.
  const chordTimes = notes.filter((n) => n.chord).map((n) => n.time);
  const extraPlucks = heard.filter(
    (h, j) => !claimed.has(j) && !chordTimes.some((c) => h.at > c - 0.1 && h.at < c + 0.3),
  ).length;
  const after = await guitarState();
  return {
    plucks: after.plucks - before.plucks,
    extraPlucks,
    damps: after.damps - before.damps,
    fps: Math.round(frames / clock),
    /** How much slower than written the performance ran (stalls slow it). */
    tempoDragPct: Math.round(((wall - wallStart) / 1000 / clock - 1) * 1000) / 10,
    stalls,
    slowestFrameMs: Math.round(slowest * 1000),
    notes: report,
  };
}
