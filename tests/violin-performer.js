/**
 * The violin's performer (see bowed-performer.js): hand positions first to
 * fifth, fingers about a tone apart, bowing near the bridge when loud.
 */

import { AirViolin } from '/src/violin/air-violin-component.ts';
import { BOW } from '/src/violin/bow.ts';
import { VIOLIN_GEOMETRY } from '/src/violin/geometry.ts';
import { makePerformer } from '/tests/bowed-performer.js';

export { midiOf } from '/tests/bowed-performer.js';

export const VIOLIN_PERFORMER = {
  instrument: 'violin',
  root: 'AirViolin',
  component: AirViolin,
  geo: VIOLIN_GEOMETRY,
  bow: BOW,
  positions: { 1: 2, 2: 4, 3: 5, 4: 7, 5: 9 },
  /** First finger on the position's note (or a semitone below), then a finger to each tone. */
  fingerAt: (semis, base) => {
    const off = semis - base;
    if (off < -1 || off > 6) return 0;
    return off <= 0 ? 1 : off <= 2 ? 2 : off <= 4 ? 3 : 4;
  },
  rest: [0, 0, 2, 3.5, 5],
  span: 5,
  bowing: {
    pp: { speed: 0.22, x: 0.04, press: 0.0012 },
    ff: { speed: 0.7, x: 0.02, press: 0.003 },
  },
};

export const { planPerformance, handsFor, scoreNotes, perform, leftHand: violinLeftHand } = makePerformer(VIOLIN_PERFORMER);
