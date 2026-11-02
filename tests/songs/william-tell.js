/**
 * The galop theme that opens the finale of Rossini's William Tell Overture
 * (Allegro vivace, quarter = 152, E major, 2/4): the first violins from
 * bar 243 (pickup) to bar 275 — the quiet theme twice, then the loud
 * sixteen-bar tutti — followed by an added E major chord.
 *
 * Source: "William Tell: Overture to the Opera", full score, typeset by
 * Max Wilkinson (2008), IMSLP #22579,
 * https://imslp.org/wiki/Guillaume_Tell_(Rossini,_Gioacchino), licensed
 * under Creative Commons Attribution 3.0
 * (https://creativecommons.org/licenses/by/3.0/).
 * Changes: transcribed the Violin I melody only, dropped articulation,
 * arranged it for guitar (fingering below), played the loud section an
 * octave lower (the violins reach C#6, above the guitar's top fret, B5),
 * and added a closing E major chord that is not in the score. The violin
 * version (WILLIAM_TELL_VIOLIN) plays the melody at the written pitch and
 * closes with an E major double stop, also not in the score. The cello
 * version (WILLIAM_TELL_CELLO) plays the guitar arrangement an octave lower
 * and closes with the same double stop two octaves below the violin's. The
 * cymbal, triangle and piano parts (WILLIAM_TELL_CYMBALS,
 * WILLIAM_TELL_TRIANGLE, WILLIAM_TELL_PIANO) are not transcribed: they are
 * arranged here. The piano part is the melody in the right hand (the quiet
 * theme an octave up, the tutti at the violins' pitch) over a galop bass in
 * the left, from chords chosen for the arrangement.
 * The drum kit part (WILLIAM_TELL_DRUMS) is arranged here on the melody's
 * gallop rhythm.
 *
 * Gioachino Rossini (1792-1868) composed the overture in 1829; the music
 * itself is in the public domain.
 *
 * Each event has a start time in beats (quarter notes, bar 244 = beat 0),
 * a dynamic, and either a note, played as a string and fret, or a chord to
 * strum.
 */

/** Where each note is played: [string, fret], string 0 = low E. */
const QUIET = {
  B3: [4, 0],
  'D#4': [4, 4],
  E4: [5, 0],
  'F#4': [5, 2],
  'G#4': [5, 4],
  A4: [5, 5],
  B4: [5, 7],
};
/**
 * The loud section, an octave below the violins. G# and C# share fret 9 on
 * neighbouring strings, so the leaping figure hops across strings.
 */
const LOUD = {
  'C#4': [4, 2],
  'D#4': [4, 4],
  E4: [5, 0],
  'F#4': [5, 2],
  'G#4': [4, 9],
  'A#4': [5, 6],
  B4: [5, 7],
  'C#5': [5, 9],
};

/**
 * Bars as [beat within the bar, note]. In 2/4 a bar is two beats; 0.25 is
 * a sixteenth, 0.5 an eighth.
 */
const gallop = (n) => [[0, n], [0.5, n], [0.75, n], [1, n], [1.5, n], [1.75, n]];
const quietTheme = (firstBar, lastBarTail) => ({
  [firstBar]: gallop('B3'),
  [firstBar + 1]: [[0, 'E4'], [0.5, 'F#4'], [1, 'G#4'], [1.5, 'B3'], [1.75, 'B3']],
  [firstBar + 2]: [[0, 'B3'], [0.5, 'B3'], [0.75, 'B3'], [1, 'E4'], [1.5, 'G#4'], [1.75, 'G#4']],
  [firstBar + 3]: [[0, 'F#4'], [0.5, 'D#4'], [1, 'B3'], [1.5, 'B3'], [1.75, 'B3']],
  [firstBar + 4]: gallop('B3'),
  [firstBar + 5]: [[0, 'E4'], [0.5, 'F#4'], [1, 'G#4'], [1.5, 'E4'], [1.75, 'G#4']],
  [firstBar + 6]: [[0, 'B4'], [1.25, 'A4'], [1.5, 'G#4'], [1.75, 'F#4']], // B4 held 5 sixteenths
  [firstBar + 7]: [[0, 'E4'], [0.5, 'G#4'], [1, 'E4'], ...lastBarTail],
});
const leap = (a, b, c, d) => [[0, a], [0.5, b], [1, c], [1.5, d]];
const loudPhrase = (firstBar, ending) => ({
  [firstBar]: gallop('G#4'),
  [firstBar + 1]: leap('G#4', 'C#5', 'G#4', 'C#5'),
  ...ending(firstBar + 2),
});
const fallToE = (bar) => ({
  [bar]: leap('G#4', 'C#5', 'G#4', 'F#4'),
  [bar + 1]: [[0, 'E4'], [0.5, 'D#4'], [1, 'C#4'], [1.5, 'G#4'], [1.75, 'G#4']],
});
const riseToB = (bar) => ({
  [bar]: leap('G#4', 'C#5', 'B4', 'A#4'),
  [bar + 1]: [[0, 'B4'], [0.5, 'A#4'], [1, 'B4'], [1.5, 'G#4'], [1.75, 'G#4']],
});

const QUIET_BARS = {
  243: [[1.5, 'B3'], [1.75, 'B3']], // pickup
  ...quietTheme(244, [[1.5, 'B3'], [1.75, 'B3']]),
  ...quietTheme(252, []),
};
const LOUD_BARS = {
  259: [[1.5, 'G#4'], [1.75, 'G#4']], // ff pickup, after the quiet E G# E
  ...loudPhrase(260, fallToE),
  ...loudPhrase(264, riseToB),
  ...loudPhrase(268, fallToE),
  272: gallop('G#4'),
  273: leap('G#4', 'C#5', 'G#4', 'C#5'),
  274: leap('G#4', 'C#5', 'B4', 'A#4'),
  275: [[0, 'B4']],
};

const toEvents = (bars, on, dynamic) =>
  Object.entries(bars).flatMap(([bar, notes]) =>
    notes.map(([beat, note]) => ({
      beat: (Number(bar) - 244) * 2 + beat,
      note,
      string: on[note][0],
      fret: on[note][1],
      dynamic,
    })),
  );

export const WILLIAM_TELL = {
  title: 'William Tell Overture: finale, bars 243-275',
  tempo: 152,
  events: [
    ...toEvents(QUIET_BARS, QUIET, 'pp'),
    ...toEvents(LOUD_BARS, LOUD, 'ff'),
    { beat: (276 - 244) * 2, chord: 'E', dynamic: 'ff' },
  ].sort((a, b) => a.beat - b.beat),
};

/** A note name such as 'C#5' an octave higher. */
const octaveUp = (note) => note.replace(/\d$/, (d) => String(Number(d) + 1));

/**
 * The same melody for the violin, as the first violins play it: the loud
 * section at the written pitch, up to C#6. Notes are names only; the
 * violin performer chooses strings and fingers. It closes on G#4 and E5
 * together (a double stop on the D and A strings).
 */
export const WILLIAM_TELL_VIOLIN = {
  title: 'William Tell Overture: finale, bars 243-275 (violin)',
  tempo: 152,
  events: [
    ...toEvents(QUIET_BARS, QUIET, 'pp').map(({ beat, note, dynamic }) => ({ beat, note, dynamic })),
    ...toEvents(LOUD_BARS, LOUD, 'ff').map(({ beat, note, dynamic }) => ({ beat, note: octaveUp(note), dynamic })),
    { beat: (276 - 244) * 2, notes: ['G#4', 'E5'], dynamic: 'ff' },
  ].sort((a, b) => a.beat - b.beat),
};

/** A note name such as 'C#4' an octave lower. */
const octaveDown = (note) => note.replace(/\d$/, (d) => String(Number(d) - 1));

/**
 * The melody for the cello: the guitar's arrangement an octave lower (the
 * quiet theme B2-B3, the tutti C#3-C#4), in a cello's lower positions. It
 * closes on G#3 and E4 together (a double stop on the D and A strings).
 */
export const WILLIAM_TELL_CELLO = {
  title: 'William Tell Overture: finale, bars 243-275 (cello)',
  tempo: 152,
  events: [
    ...toEvents(QUIET_BARS, QUIET, 'pp').map(({ beat, note, dynamic }) => ({ beat, note: octaveDown(note), dynamic })),
    ...toEvents(LOUD_BARS, LOUD, 'ff').map(({ beat, note, dynamic }) => ({ beat, note: octaveDown(note), dynamic })),
    { beat: (276 - 244) * 2, notes: ['G#3', 'E4'], dynamic: 'ff' },
  ].sort((a, b) => a.beat - b.beat),
};

/**
 * A cymbal part for the same passage, arranged here (not transcribed from
 * the score): tacet through the quiet theme, then a crash on every
 * downbeat of the tutti, fortissimo at each phrase and forte between, one
 * held together to stop it short (secco) at the end of the third phrase,
 * and a last fortissimo crash on the closing chord, let ring, swung open,
 * then stopped against the chest (`choke`, in beats after the crash).
 */
const CYMBAL_BARS = [
  [260, 'ff'], [261, 'f'], [262, 'f'], [263, 'f'],
  [264, 'ff'], [265, 'f'], [266, 'f'], [267, 'f'],
  [268, 'ff'], [269, 'f'], [270, 'f'], [271, 'f', { secco: true }],
  [272, 'ff'], [273, 'f'], [274, 'f'], [275, 'ff'],
  [276, 'ff', { choke: 3 }],
];
export const WILLIAM_TELL_CYMBALS = {
  title: 'William Tell Overture: finale, bars 260-276 (cymbals)',
  tempo: 152,
  events: CYMBAL_BARS.map(([bar, dynamic, extra]) => ({ beat: (bar - 244) * 2, dynamic, ...extra })),
};

/**
 * A triangle part for the same passage, also arranged here (not
 * transcribed): tacet through the first quiet theme, a light ting on each
 * downbeat of the second, then in the tutti the gallop rhythm itself in
 * each phrase's first bar and a strike on the other downbeats, and a roll
 * on the closing chord, stopped short (`roll`, in beats).
 */
const GALLOP = [0, 0.5, 0.75, 1, 1.5, 1.75];
export const WILLIAM_TELL_TRIANGLE = {
  title: 'William Tell Overture: finale, bars 252-276 (triangle)',
  tempo: 152,
  events: [
    ...[252, 253, 254, 255, 256, 257, 258, 259].map((bar) => ({ beat: (bar - 244) * 2, dynamic: 'p' })),
    ...[260, 264, 268, 272].flatMap((bar) => GALLOP.map((b) => ({ beat: (bar - 244) * 2 + b, dynamic: 'f' }))),
    ...[261, 262, 263, 265, 266, 267, 269, 270, 271, 273, 274, 275].map((bar) => ({ beat: (bar - 244) * 2, dynamic: 'mf' })),
    { beat: (276 - 244) * 2, dynamic: 'f', roll: 3 },
  ].sort((a, b) => a.beat - b.beat),
};

/**
 * The left hand's chords, as [bass, other bass, chord tone]: the bass falls
 * on each beat (root, then the other bass note), the chord tone on each
 * off-beat, the way a galop is accompanied.
 */
const LEFT_CHORDS = {
  E: ['E2', 'B2', 'G#3'],
  'C#m': ['C#2', 'G#2', 'E3'],
  B: ['B2', 'F#2', 'D#3'],
  B7: ['B2', 'F#2', 'A3'],
  'F#7': ['F#2', 'C#3', 'A#3'],
};
/** A bar of the left hand: one chord for both beats, or [first beat, second beat]. */
const oomPah = (chord) => {
  if (Array.isArray(chord)) {
    const [a, b] = chord.map((c) => LEFT_CHORDS[c]);
    return [[0, a[0]], [0.5, a[2]], [1, b[0]], [1.5, b[2]]];
  }
  const [root, other, tone] = LEFT_CHORDS[chord];
  return [[0, root], [0.5, tone], [1, other], [1.5, tone]];
};
/** The harmony of the quiet theme's eight bars, and of the tutti's phrases. */
const QUIET_CHORDS = ['E', 'E', 'E', 'B', 'E', 'E', 'B7', 'E'];
const FALL_CHORDS = ['E', 'C#m', ['C#m', 'B7'], 'E'];
const RISE_CHORDS = ['E', 'C#m', ['C#m', 'F#7'], 'B'];
const chordBars = (firstBar, chords) => Object.fromEntries(chords.map((c, i) => [firstBar + i, oomPah(c)]));
const LEFT_BARS = {
  ...chordBars(244, QUIET_CHORDS),
  ...chordBars(252, QUIET_CHORDS),
  ...chordBars(260, FALL_CHORDS),
  ...chordBars(264, RISE_CHORDS),
  ...chordBars(268, FALL_CHORDS),
  ...chordBars(272, ['E', 'C#m', ['C#m', 'F#7'], 'B']),
};

const handEvents = (bars, hand, dynamic, transpose = (n) => n) =>
  Object.entries(bars).flatMap(([bar, notes]) =>
    notes.map(([beat, note]) => ({ beat: (Number(bar) - 244) * 2 + beat, note: transpose(note), hand, dynamic })),
  );

/**
 * The piano part: the right hand has the melody, the quiet theme an octave
 * above the violins (B4-B5, clear of the left hand) and the tutti where the
 * violins have it (C#5-C#6); the left hand the galop bass, quiet then
 * forte. It closes on E2 and E6 held together. Each event is one key for
 * one hand, by note name; `beats` is how long the last notes are held.
 */
export const WILLIAM_TELL_PIANO = {
  title: 'William Tell Overture: finale, bars 243-276 (piano)',
  tempo: 152,
  events: [
    ...handEvents(QUIET_BARS, 'right', 'p', octaveUp),
    ...handEvents(LOUD_BARS, 'right', 'ff', octaveUp),
    ...handEvents(LEFT_BARS, 'left', 'p').map((e) => (e.beat >= (260 - 244) * 2 ? { ...e, dynamic: 'f' } : e)),
    { beat: (276 - 244) * 2, note: 'E2', hand: 'left', dynamic: 'ff', beats: 3 },
    { beat: (276 - 244) * 2, note: 'E6', hand: 'right', dynamic: 'ff', beats: 3 },
  ].sort((a, b) => a.beat - b.beat || a.hand.localeCompare(b.hand)),
};

/**
 * A drum kit part for the whole passage, arranged here (not transcribed from
 * the score), played open-handed: the left hand keeps the hi-hat on its side
 * of the kit and the right hand the ride on its own. Through the quiet theme
 * the left hand plays the melody's gallop on the closed hi-hat, opening it
 * at the end of each phrase, while the right plays kick on the first beat
 * and snare on the second; bar 259 builds into the tutti with a snare fill.
 * In the tutti the right hand gallops on the ride, a bell on each downbeat,
 * and the left plays kick and snare, or crash and snare on the downbeat of
 * each phrase with the right hand on the kick. Bar 274 is a fill round the
 * toms; the last two downbeats are crash and kick together, left to ring.
 *
 * Each event is a stroke: its beat, which hand, what it plays (an
 * articulation of the air drums, see src/drums/strokes.ts) and how loud.
 */
const L = 'left';
const R = 'right';
const at = (bar, beat) => (bar - 244) * 2 + beat;

const drumBar = (bar) => {
  // The quiet theme, bars 244-258.
  if (bar < 259) {
    const phraseEnd = bar === 251 || bar === 258;
    return [
      ...GALLOP.map((b) => [b, L, phraseEnd && b === 1.5 ? 'hihatOpen' : 'hihatClosed', b % 1 === 0 ? 'p' : 'pp']),
      [0, R, 'kick', 'p'],
      [1, R, 'snare', 'p'],
    ];
  }
  if (bar === 259) {
    // The quiet E G# E, then the fortissimo pickup: a fill into the tutti.
    return [
      [0, L, 'hihatClosed', 'p'],
      [0.5, L, 'hihatClosed', 'pp'],
      [0, R, 'kick', 'p'],
      [1, R, 'snare', 'mf'],
      [1.5, L, 'snare', 'ff'],
    ];
  }
  if (bar === 274) {
    // Round the toms, high to low, into the last downbeats.
    return [
      [0, R, 'kick', 'f'],
      [0, L, 'tom1', 'f'],
      [0.5, L, 'tom1', 'f'],
      [0.75, R, 'tom2', 'f'],
      [1, R, 'tom2', 'f'],
      [1.5, R, 'floorTom', 'ff'],
    ];
  }
  if (bar >= 275) return [[0, L, 'crash', 'ff'], [0, R, 'kick', 'ff']];
  // The tutti, bars 260-273: a crash on the downbeat of each four-bar phrase.
  if ((bar - 260) % 4 === 0) {
    return [
      [0, L, 'crash', 'ff'],
      [0, R, 'kick', 'ff'],
      [1, L, 'snare', 'f'],
      ...[1, 1.5, 1.75].map((b) => [b, R, 'ride', 'f']),
    ];
  }
  // Bar 273 leaves the right hand time to reach the kick for the fill.
  // The right hand leaves the ride a beat early before a phrase's kick, and before the fill.
  const ride = bar === 273 ? [0.5, 0.75, 1] : bar % 4 === 3 ? [0.5, 0.75, 1, 1.5] : [0.5, 0.75, 1, 1.5, 1.75];
  return [
    [0, L, 'kick', 'f'],
    [1, L, 'snare', 'f'],
    [0, R, 'rideBell', 'f'],
    ...ride.map((b) => [b, R, 'ride', 'mf']),
  ];
};

export const WILLIAM_TELL_DRUMS = {
  title: 'William Tell Overture: finale, bars 243-276 (drums)',
  tempo: 152,
  events: [
    // The pickup, on the hi-hat.
    { beat: at(243, 1.5), hand: L, hit: 'hihatClosed', dynamic: 'p' },
    { beat: at(243, 1.75), hand: L, hit: 'hihatClosed', dynamic: 'pp' },
    ...Array.from({ length: 276 - 244 + 1 }, (_, i) => 244 + i).flatMap((bar) =>
      drumBar(bar).map(([beat, hand, hit, dynamic]) => ({ beat: at(bar, beat), hand, hit, dynamic })),
    ),
  ].sort((a, b) => a.beat - b.beat || (a.hand < b.hand ? -1 : 1)),
};
