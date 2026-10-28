/**
 * Opening of the galop theme from the finale of Rossini's William Tell
 * Overture (1829, public domain), simplified, in E major, 2/4.
 *
 * Each event has a start time in beats (quarter notes) and either a note,
 * played as a string and fret, or a chord to strum. The repeated B sits on
 * the open B string, and the melody notes on the high E string, so the left
 * hand only ever frets one string.
 */

/** Where each note is played: [string, fret], string 0 = low E. */
const ON = {
  B3: [4, 0],
  E4: [5, 0],
  'F#4': [5, 2],
  'G#4': [5, 4],
  B4: [5, 7],
};

/** "da-da-DUM, da-da-DUM": sixteenth, sixteenth, eighth, twice. */
const gallop = (start) => [0, 0.25, 0.5, 1, 1.25, 1.5].map((b) => [start + b, 'B3']);

/** "da-da-DUM-DUM-DUM": two sixteenths, then three eighths on `a b c`. */
const answer = (start, a, b, c) => [
  [start, 'B3'],
  [start + 0.25, 'B3'],
  [start + 0.5, a],
  [start + 1, b],
  [start + 1.5, c],
];

const phrase = (start, a, b, c) => [...gallop(start), ...answer(start + 2, a, b, c)];

export const WILLIAM_TELL = {
  title: 'William Tell Overture: finale (opening)',
  tempo: 152,
  events: [
    ...phrase(0, 'E4', 'F#4', 'G#4'),
    ...phrase(4, 'G#4', 'E4', 'G#4'),
    ...phrase(8, 'E4', 'G#4', 'B4'),
  ]
    .map(([beat, note]) => ({ beat, note, string: ON[note][0], fret: ON[note][1] }))
    .concat([{ beat: 12, chord: 'E' }]),
};
