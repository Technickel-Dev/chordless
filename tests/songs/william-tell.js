/**
 * The galop theme that opens the finale of Rossini's William Tell Overture
 * (Allegro vivace, quarter = 152, E major, 2/4): the first violins' first
 * phrase, bars 243 (pickup) to 251, followed by an added E major chord.
 *
 * Source: "William Tell: Overture to the Opera", full score, typeset by
 * Max Wilkinson (2008), IMSLP #22579,
 * https://imslp.org/wiki/Guillaume_Tell_(Rossini,_Gioacchino), licensed
 * under Creative Commons Attribution 3.0
 * (https://creativecommons.org/licenses/by/3.0/).
 * Changes: transcribed the Violin I melody only, dropped articulation and
 * dynamics, arranged it for guitar (fingering below), and added a closing
 * E major chord that is not in the score.
 *
 * Gioachino Rossini (1792-1868) composed the overture in 1829; the music
 * itself is in the public domain.
 *
 * Each event has a start time in beats (quarter notes, bar 244 = beat 0)
 * and either a note, played as a string and fret, or a chord to strum.
 */

/** Where each note is played: [string, fret], string 0 = low E. */
const ON = {
  B3: [4, 0],
  'D#4': [4, 4],
  E4: [5, 0],
  'F#4': [5, 2],
  'G#4': [5, 4],
  A4: [5, 5],
  B4: [5, 7],
};

/**
 * The melody bar by bar: [beat within the bar, note]. In 2/4 a bar is two
 * beats; 0.25 is a sixteenth, 0.5 an eighth.
 */
const gallop = [[0, 'B3'], [0.5, 'B3'], [0.75, 'B3'], [1, 'B3'], [1.5, 'B3'], [1.75, 'B3']];
const BARS = {
  243: [[1.5, 'B3'], [1.75, 'B3']], // pickup
  244: gallop,
  245: [[0, 'E4'], [0.5, 'F#4'], [1, 'G#4'], [1.5, 'B3'], [1.75, 'B3']],
  246: [[0, 'B3'], [0.5, 'B3'], [0.75, 'B3'], [1, 'E4'], [1.5, 'G#4'], [1.75, 'G#4']],
  247: [[0, 'F#4'], [0.5, 'D#4'], [1, 'B3'], [1.5, 'B3'], [1.75, 'B3']],
  248: gallop,
  249: [[0, 'E4'], [0.5, 'F#4'], [1, 'G#4'], [1.5, 'E4'], [1.75, 'G#4']],
  250: [[0, 'B4'], [1.25, 'A4'], [1.5, 'G#4'], [1.75, 'F#4']], // B4 held a quarter + a sixteenth
  251: [[0, 'E4'], [0.5, 'G#4'], [1, 'E4']],
};

export const WILLIAM_TELL = {
  title: 'William Tell Overture: finale, bars 243-251',
  tempo: 152,
  events: Object.entries(BARS)
    .flatMap(([bar, notes]) => notes.map(([beat, note]) => [(Number(bar) - 244) * 2 + beat, note]))
    .map(([beat, note]) => ({ beat, note, string: ON[note][0], fret: ON[note][1] }))
    .concat([{ beat: 16, chord: 'E' }]),
};
