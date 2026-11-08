/**
 * A full-size cello, as a bowed-string spec (see src/violin/geometry.ts for
 * the frame and the maths). The cello faces away from the player, so its C
 * string is on -Y, the player's left; the left hand reaches round the neck
 * from that side.
 */

import type { BowSpec } from '../violin/bow.js';
import { type BowedSpec, bowedGeometry } from '../violin/geometry.js';
import type { BowedVoice } from '../violin/synth.js';

export const CELLO_SPEC: BowedSpec = {
  openMidi: [36, 43, 50, 57],
  names: ['C', 'G', 'D', 'A'],
  lowSide: -1,
  stringLength: 0.69,
  boardLength: 0.58,
  tailX: -0.355,
  shoulderX: 0.4,
  archRadius: 0.07,
  // A little wider than a real cello (about 24 mm at the nut) for tracked fingertips.
  nutSpan: 0.03,
  bridgeSpan: 0.052,
  bridgeZ: 0.09,
  boardNutZ: 0.045,
  boardEndZ: 0.077,
  nutClearance: 0.001,
  boardWidthNut: 0.032,
  boardWidthEnd: 0.062,
  bowNearBridge: 0.015,
  bowPastBoard: 0.05,
  bodyScale: 2.127,
};

export const CELLO_GEOMETRY = bowedGeometry(CELLO_SPEC);
export const CELLO = CELLO_GEOMETRY.dims;

/** A cello bow: a little shorter and heavier than a violin's. */
export const CELLO_BOW: BowSpec = {
  hairLength: 0.6,
  frogToHair: 0.02,
  buttonLength: 0.05,
  hairDrop: 0.017,
  fingerLean: 0.3,
};

/**
 * A cello body, about an octave below a violin's: the air resonance near
 * 100 Hz, the main wood resonances near 180 and 215 Hz, a dip in the
 * middle, the cello's singing, slightly nasal formant around 1.5-2.5 kHz,
 * and a fall above 3 kHz.
 */
export const CELLO_VOICE: BowedVoice = {
  // The body radiates the upper harmonics far better than the fundamentals:
  // the curve rises some 8-10 dB from the main wood resonances to the formant.
  bodyCurve: [
    [60, -24],
    [90, -8],
    [105, -1],
    [140, -5],
    [185, 0],
    [215, 0],
    [300, -3],
    [500, -2],
    [800, 0],
    [1300, 4],
    [1800, 7],
    [2500, 5],
    [3500, -2],
    [5000, -12],
    [7000, -24],
  ],
  lowModes: [
    [100, 6, 14], // A0, the air in the box
    [145, 2, 18],
    [185, 5, 22], // B1-
    [215, 5, 22], // B1+
    [265, 1, 24],
  ],
  denseFrom: 240,
  denseTo: 6000,
  levelBand: [250, 1200],
  radiationHz: 70,
  cutoffBase: 2400,
  cutoffBright: 4000,
  room: 2.4,
};
