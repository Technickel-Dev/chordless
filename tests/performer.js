/**
 * Plays a song on the air guitar with IWER's emulated hands. Runs inside
 * the page (loaded through Vite) so note timing is driven by the page's own
 * clock instead of round trips from the test runner.
 *
 * The right index fingertip picks with alternating strokes across one
 * string at a time; changing strings, it lifts clear of the strings, moves
 * over and comes back down on the near side of the next string. The left
 * index frets single notes; chords use the generated poses in
 * chord-hand.js.
 */

import { fretX, GUITAR, OPEN_MIDI, stringY } from '/src/guitar/geometry.ts';
import { CHORDS, chordHandPose, registerPose } from '/tests/chord-hand.js';
import { midiName } from '/src/guitar/chords.ts';

/** Half the length of a picking stroke, across the string. */
const STROKE = 0.0055;
const STROKE_MS = 22;
/** Above the widened depth window a strum keeps for its follow-through. */
const LIFT = 0.05;
/** Fretted notes go down this long before the pluck. */
const PRESS_LEAD_MS = 20;
/** Lifting to an open string must outlast the app's 60 ms release debounce. */
const RELEASE_LEAD_MS = 110;
const RELEASE_MIN_LEAD_MS = 75;

const dispatch = (method, params = {}) => window.IWER_MCP.dispatch(method, params);
const nextFrames = (n = 2) =>
  new Promise((resolve) => {
    let k = 0;
    const tick = () => (++k >= n ? resolve() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  });
const sleepUntil = async (t) => {
  for (let left = t - performance.now(); left > 1; left = t - performance.now()) {
    await new Promise((r) => setTimeout(r, Math.min(left, 8)));
  }
};

function guitarRoot() {
  const root = window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName('AirGuitar');
  root.updateMatrixWorld(true);
  return root;
}

/** World pose for a fingertip at a guitar-space spot (see the e2e test). */
function spot({ x = 0, string, y, height = 0 }) {
  const root = guitarRoot();
  const p = root.position
    .clone()
    .set(x, y ?? stringY(string, x), GUITAR.stringZ + height)
    .applyMatrix4(root.matrixWorld);
  const e = root.matrixWorld.elements;
  return {
    position: { x: p.x, y: p.y, z: p.z },
    orientation: { fingers: [-e[8], -e[9], -e[10]], palm: [e[4], e[5], e[6]] },
  };
}

/** Just behind the fret wire, like the chord poses use. */
function fretSpotX(fret) {
  return fretX(fret) + 0.25 * (fretX(fret - 1) - fretX(fret));
}

async function guitarState() {
  const found = await dispatch('ecs_find_entities', { withComponents: ['AirGuitar'] });
  const q = await dispatch('ecs_query_entity', { entityIndex: found.entities[0].entityIndex });
  return q.components.find((c) => c.componentId === 'AirGuitar').values;
}

export async function perform(song, { tempo = song.tempo, onEvent = () => {} } = {}) {
  const beatMs = 60000 / tempo;
  const placeRight = (where) => dispatch('set_transform', { device: 'hand-right', anchor: 'index-tip', ...spot(where) });
  const placeLeft = (where) => dispatch('set_transform', { device: 'hand-left', anchor: 'index-tip', ...spot(where) });

  // Right hand: which string it is on and which side of it (+1 toward the
  // low E, -1 toward the high E).
  let string = null;
  let side = 1;
  // Left index: the string and fret it holds (fret 0 = lifted).
  let leftString = 5;
  let leftFret = 0;
  let leftX = fretSpotX(3);

  await dispatch('set_hand_pose', { device: 'hand-left', poseId: 'point' });
  await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'point' });
  await placeLeft({ x: leftX, string: leftString, height: 0.04 });
  await placeRight({ string: 2, height: LIFT });
  await nextFrames(3);

  const moveTo = async (target) => {
    if (string === target) return;
    const toward = string == null ? 1 : target > string ? 1 : -1;
    const from = string ?? target;
    // Lift straight up, cross over above the strings, come down on the
    // side of the target string facing where the hand came from.
    // One frame per move is enough for the app to see each pose.
    await placeRight({ y: stringY(from, 0) + side * STROKE, height: LIFT });
    await nextFrames(1);
    side = toward;
    await placeRight({ y: stringY(target, 0) + side * STROKE, height: LIFT });
    await nextFrames(1);
    await placeRight({ y: stringY(target, 0) + side * STROKE });
    await nextFrames(1);
    string = target;
  };

  /** Frets `fret` on string `s` with the left index, or lifts it for 0. */
  const fretLeft = async (s, fret) => {
    if (fret === 0) {
      if (leftFret === 0) return;
      await placeLeft({ x: leftX, string: leftString, height: 0.04 });
      leftFret = 0;
      return;
    }
    if (s === leftString && fret === leftFret) return;
    leftX = fretSpotX(fret);
    await placeLeft({ x: leftX, string: s });
    leftString = s;
    leftFret = fret;
  };

  const report = [];
  const start = performance.now() + 600;
  const before = await guitarState();
  const timeOf = (k) => start + song.events[k].beat * beatMs;

  /**
   * When to let go before note `k`, which is lower on the string the left
   * finger holds (a lower fret or the open string). The app only drops to a
   * lower fret after its release debounce, so this must come early enough,
   * but not so early that it cuts the previous note on that string as soon
   * as it sounded.
   */
  const releaseTime = (k) => {
    let prev = -Infinity;
    for (let j = k - 1; j >= 0; j--) {
      if (song.events[j].string === song.events[k].string) {
        prev = timeOf(j);
        break;
      }
    }
    return Math.min(timeOf(k) - RELEASE_MIN_LEAD_MS, Math.max(timeOf(k) - 2 * RELEASE_LEAD_MS, prev + 90));
  };
  /** The next note on the held string, if it needs the finger to let go first. */
  const releaseDue = (from) => {
    if (leftFret === 0) return null;
    for (let k = from; k < song.events.length; k++) {
      const e = song.events[k];
      if (e.chord || e.string !== leftString) continue;
      return e.fret < leftFret ? { k, at: releaseTime(k), fret: e.fret } : null;
    }
    return null;
  };

  for (let i = 0; i < song.events.length; i++) {
    const event = song.events[i];
    const at = start + event.beat * beatMs;

    // Let go for an upcoming lower note on the held string now if it is
    // due, before this event's own hand movements take up the time.
    const release = releaseDue(i);
    if (release && release.at <= at) {
      await sleepUntil(release.at);
      await fretLeft(leftString, release.fret);
    }

    if (event.chord) {
      const { pose, wrist } = chordHandPose(CHORDS[event.chord], Array.from(guitarRoot().matrixWorld.elements));
      registerPose(window.IWER_DEVICE.hands.left, `chord-${event.chord}`, pose);
      await dispatch('set_hand_pose', { device: 'hand-left', poseId: `chord-${event.chord}` });
      await dispatch('set_transform', { device: 'hand-left', anchor: 'wrist', ...wrist });
      await placeRight({ y: stringY(string ?? 0, 0) + side * STROKE, height: LIFT });
      await nextFrames(2);
      await placeRight({ y: stringY(0, 0) + 0.02, height: LIFT });
      await nextFrames(2);
      await placeRight({ y: stringY(0, 0) + 0.02 });
      await nextFrames(2);
      await sleepUntil(at - 30);
      const played = performance.now() - at;
      await dispatch('animate_to', {
        device: 'hand-right',
        anchor: 'index-tip',
        duration: 0.06,
        ...spot({ y: stringY(5, 0) - 0.02 }),
      });
      await nextFrames(2);
      const g = await guitarState();
      report.push({ beat: event.beat, want: `${event.chord} chord`, heard: g.chord, lateMs: Math.round(played) });
      onEvent(i, event, g);
      continue;
    }

    await moveTo(event.string);
    if (event.fret > 0 && (event.string !== leftString || event.fret !== leftFret)) {
      // Press just before the pluck, so a ringing string barely hammers on.
      await sleepUntil(at - PRESS_LEAD_MS - STROKE_MS / 2);
      await fretLeft(event.string, event.fret);
    } else if (event.fret === 0 && event.string === leftString) {
      await fretLeft(event.string, 0);
    }

    // The stroke crosses the string halfway through, on the beat.
    await sleepUntil(at - STROKE_MS / 2);
    const played = performance.now() + STROKE_MS / 2 - at;
    side = -side;
    await dispatch('animate_to', {
      device: 'hand-right',
      anchor: 'index-tip',
      duration: STROKE_MS / 1000,
      ...spot({ y: stringY(event.string, 0) + side * STROKE }),
    });
    await nextFrames(1);
    const g = await guitarState();
    report.push({
      beat: event.beat,
      want: event.note,
      heard: g.lastNote,
      lateMs: Math.round(played),
      ok: g.lastNote === midiName(OPEN_MIDI[event.string] + event.fret),
    });
    onEvent(i, event, g);
  }

  // Let the last chord ring.
  await sleepUntil(performance.now() + 2000);
  const after = await guitarState();
  return { plucks: after.plucks - before.plucks, damps: after.damps - before.damps, notes: report };
}
