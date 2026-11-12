/**
 * The first six bars of Beethoven's "Ode to Joy" (Ninth Symphony, 1824;
 * public domain) for the air guitar: single notes, quarter = 100, 4/4,
 * in C. It is the plain tune that opens the video (video/script.md, beat 2).
 *
 * The D that ends bar 4 is played as a G#, a tritone off, so a sour note rings
 * and the tune stops: ODE_TO_JOY_FLUB (the first note of the tune is beat 0).
 * ODE_TO_JOY plays it right.
 */

import { fingerGuitar } from './william-tell.js';

// [pitch (MIDI), beats]
const TUNE = [
  [64, 1], [64, 1], [65, 1], [67, 1],
  [67, 1], [65, 1], [64, 1], [62, 1],
  [60, 1], [60, 1], [62, 1], [64, 1],
  [64, 1.5], [62, 0.5], [62, 2],
  [64, 1], [64, 1], [65, 1], [67, 1],
  [67, 1], [65, 1], [64, 1], [62, 1],
  [60, 1], [60, 1], [62, 1], [64, 1],
  [62, 1.5], [60, 0.5], [60, 2],
];

/** Where the flub lands: the long D that ends the fourth bar, the end of the first phrase (about 8 s in). */
const FLUB_AT = 14;

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nameOf = (m) => NAMES[m % 12] + String(Math.floor(m / 12) - 1);

function song(title, flub) {
  let beat = 0;
  // The flub is a G#, a tritone from the D it should be, hit hard, and the tune stops there.
  const line = (flub ? TUNE.slice(0, FLUB_AT + 1) : TUNE).map(([midi, length], i) => {
    const note = { beat, midi: flub && i === FLUB_AT ? midi + 6 : midi };
    beat += length;
    return note;
  });
  const fingers = fingerGuitar(line, 60 / 100);
  return {
    title,
    tempo: 100,
    events: line.map((n, i) => ({ beat: n.beat, note: nameOf(n.midi), string: fingers[i].s, fret: fingers[i].f, dynamic: flub && i === FLUB_AT ? 'ff' : 'f' })),
  };
}

export const ODE_TO_JOY = song('Ode to Joy (eight bars)', false);
export const ODE_TO_JOY_FLUB = song('Ode to Joy (eight bars, the last note wrong)', true);
