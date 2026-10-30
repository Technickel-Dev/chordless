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
 * closes with an E major double stop, also not in the score.
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
