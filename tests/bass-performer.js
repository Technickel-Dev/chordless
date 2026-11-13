/**
 * The bass's performer: the guitar's (see performer.js), on the bass's four
 * strings, played as a guitarist plays single notes: a finger per fret, the
 * index fingertip plucking toward the next string.
 */

import { AirBass } from '/src/bass/air-bass-component.ts';
import { BASS_BOARD } from '/src/bass/geometry.ts';
import { handsFor as fretHandsFor, perform as fretPerform, planPerformance as fretPlan, useInstrument } from '/tests/performer.js';

export const BASS_PERFORMER = { instrument: 'bass', root: 'AirBass', component: AirBass, board: BASS_BOARD };

export function planPerformance(song, tempo) {
  useInstrument(BASS_PERFORMER);
  return fretPlan(song, tempo);
}

export function handsFor(plan) {
  useInstrument(BASS_PERFORMER);
  return fretHandsFor(plan);
}

export function perform(song, options) {
  useInstrument(BASS_PERFORMER);
  return fretPerform(song, options);
}
