/**
 * The trailer's music: the William Tell finale's opening as the parts in
 * tests/songs/william-tell.js play it, cut to fit the edit.
 *
 *   bars 226-259  the fanfare, then the quiet galop theme (the orchestra comes in)
 *   bars 260-275  the loud tutti (the instruments smashed, on its accents)
 *   bars 276-283  the second tune, the melody alone (the scenes, four bars each)
 *   bars 284-299  the theme twice more, the accompaniment back in
 *   bars 300-315  the tutti again (the scenes changing, two bars each)
 *   bar  316      the closing chord
 *
 * Bars here are the trailer's: up to bar 299 they are the score's; bars
 * 300-316 repeat the score's 260-276. Beat 0 is bar 244, as in the songs.
 * Plain data, so the capture scripts can hand a part to the page and the
 * builder can read the same timing.
 */
import * as SONGS from '../tests/songs/william-tell.js';

export const TEMPO = 152;
export const BEAT = 60 / TEMPO;
export const BAR = 2 * BEAT;
export const START_BAR = 226;
export const END_BAR = 316;

const beatOf = (bar, inBar = 0) => (bar - 244) * 2 + inBar;
const barOf = (beat) => 244 + Math.floor(beat / 2 + 1e-9);

/**
 * [from, to) in the score's beats, and where it lands in the trailer's.
 *
 * The melody plays the score straight on through the second tune and the
 * theme twice more, to bar 299's second beat; bar 299 ends as bar 259 does,
 * so from there it takes the tutti's run-up at bar 259 again, round to bar
 * 276's chord.
 */
const MELODY = [
  { from: beatOf(226), to: beatOf(299, 1.5), at: beatOf(226) },
  { from: beatOf(259, 1.5), to: beatOf(276, 0.01), at: beatOf(299, 1.5) },
];
/**
 * The accompaniment's parts stop at bar 276: it leaves the tutti before its
 * last half bar, sits out the second tune, comes back for the theme twice
 * more with its part for the first time (pickup and all, bars 243-259, over
 * the same harmony), then takes the tutti with the melody.
 */
const ACCOMPANIMENT = [
  { from: beatOf(226), to: beatOf(275, 1.5), at: beatOf(226) },
  { from: beatOf(243, 1.5), to: beatOf(259, 1.5), at: beatOf(283, 1.5) },
  { from: beatOf(259, 1.5), to: beatOf(276, 0.01), at: beatOf(299, 1.5) },
];

export const PARTS = {
  trumpet: { song: 'WILLIAM_TELL_TRUMPET', performer: '/tests/trumpet-performer.js', root: 'AirTrumpet', view: { pitch: -30, yaw: -10, roll: 0 }, leadIn: 0.6, close: { note: 'E5', dynamic: 'ff', hold: 2 } },
  guitar: { song: 'WILLIAM_TELL', performer: '/tests/performer.js', root: 'AirGuitar', view: { pitch: -38, yaw: 12, roll: 0 }, leadIn: 0.4, close: { chord: 'E', dynamic: 'ff' } },
  violin: { song: 'WILLIAM_TELL_VIOLIN', performer: '/tests/violin-performer.js', root: 'AirViolin', view: { pitch: -32, yaw: 28, roll: 0 }, leadIn: 0.4, close: { notes: ['G#4', 'E5'], dynamic: 'ff' } },
  cello: { song: 'WILLIAM_TELL_CELLO', performer: '/tests/cello-performer.js', root: 'AirCello', view: { pitch: -50, yaw: 12, roll: 0 }, leadIn: 0.4 },
  piano: { song: 'WILLIAM_TELL_PIANO', performer: '/tests/piano-performer.js', root: 'AirPiano', view: { pitch: -35, yaw: 0, roll: 0 }, leadIn: 0.8 },
  drums: { song: 'WILLIAM_TELL_DRUMS', performer: '/tests/drums-performer.js', root: 'AirDrums', view: { pitch: -38, yaw: 0, roll: 0 }, leadIn: 0.6 },
  triangle: { song: 'WILLIAM_TELL_TRIANGLE', performer: '/tests/triangle-performer.js', root: 'AirTriangle', view: { pitch: -22, yaw: 0, roll: 0 }, leadIn: 0.5 },
  cymbals: { song: 'WILLIAM_TELL_CYMBALS', performer: '/tests/cymbals-performer.js', root: 'AirCymbalLeft', view: { pitch: -28, yaw: 0, roll: 0 }, leadIn: 0.5 },
  // The trumpet's line an octave down, closing on its E an octave down.
  trombone: { song: 'WILLIAM_TELL_TROMBONE', performer: '/tests/trombone-performer.js', root: 'AirTrombone', view: { pitch: -22, yaw: -12, roll: 0 }, leadIn: 0.6, close: { note: 'E4', dynamic: 'ff', hold: 2 } },
};
/** The parts that carry the tune (and have the whole finale); the rest accompany. */
const MELODIC = new Set(['trumpet', 'guitar', 'violin', 'trombone']);

/**
 * An instrument's part in the trailer, as a song a performer plays. With
 * `fromBar`/`toBar`, only the trailer's bars from..to (inclusive).
 */
export function trailerPart(inst, { fromBar = -Infinity, toBar = Infinity } = {}) {
  const part = PARTS[inst];
  const song = SONGS[part.song];
  const events = [];
  for (const s of MELODIC.has(inst) ? MELODY : ACCOMPANIMENT)
    for (const e of song.events) if (e.beat >= s.from && e.beat < s.to) events.push({ ...e, beat: e.beat - s.from + s.at });
  // The melody's closing note; the other parts already close on bar 276's chord.
  const close = beatOf(END_BAR);
  if (part.close) {
    for (let i = events.length - 1; i >= 0; i--) if (events[i].beat >= close) events.splice(i, 1);
    events.push({ beat: close, ...part.close });
  }
  const kept = events.filter((e) => barOf(e.beat) >= fromBar && barOf(e.beat) <= toBar).sort((a, b) => a.beat - b.beat);
  return { title: `${song.title}, trailer cut`, tempo: TEMPO, events: kept };
}

/** Seconds from the trailer's first bar (226) to a beat. */
export const secondsOfBeat = (beat) => (beat - beatOf(START_BAR)) * BEAT;
/** Seconds from bar 226 to a trailer bar (may be fractional). */
export const barTime = (bar) => (bar - START_BAR) * BAR;
/** The first event's beat of a song. */
export const firstBeat = (song) => Math.min(...song.events.map((e) => e.beat));

/** When each instrument comes in (trailer bars): one at a time, four bars apart. */
export const ENTRANCES = [
  ['trumpet', 226],
  ['guitar', 232],
  ['violin', 236],
  ['trombone', 240],
  ['cello', 243.75],
  ['piano', 248],
  ['drums', 252],
  ['triangle', 256],
  ['cymbals', 260],
];
/** All in: the grid holds four bars, then the smashing starts on the tutti's second cymbal crash. */
export const MONTAGE = { from: 264, to: 276, every: 2 };
/**
 * The scenes: [scene, instrument, first bar, bars]. Four bars each, in the places
 * with the most to look at, through the second tune and the theme (an instrument
 * that is playing there: only the melody plays in the second tune), then two bars
 * each through the tutti again. The instruments suit the places where they can.
 * An optional fifth entry tilts the view up by that many degrees from the
 * instrument's usual one, where the place is hard to see past the instrument.
 */
export const SCENE_RUN = [
  ['rainy-rooftop', 'violin', 276, 4],
  ['pirate-ship', 'trumpet', 280, 4],
  ['blossom-garden', 'guitar', 284, 4],
  ['library', 'cello', 288, 4, 16],
  ['desert-canyon', 'trombone', 292, 4],
  ['museum', 'piano', 296, 4],
  ['space-station', 'trumpet', 300, 2],
  ['bowling-alley', 'drums', 302, 2],
  ['clock-tower', 'piano', 304, 2, 14],
  ['farm', 'violin', 306, 2],
  ['bathtub', 'cymbals', 308, 2],
  ['train-roof', 'cello', 310, 2, 16],
  ['parking-garage', 'triangle', 312, 2],
  ['tropical-beach', 'guitar', 314, 2, 15],
];
