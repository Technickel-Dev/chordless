/**
 * The cello's performer (see bowed-performer.js). On a cello each finger
 * takes a semitone in the lower positions (half to fourth), with a stretch
 * (an extension) of a tone between the first two fingers; the bow is drawn
 * further from the bridge than a violin's.
 */

import { AirCello } from '/src/cello/air-cello-component.ts';
import { CELLO_BOW, CELLO_GEOMETRY } from '/src/cello/geometry.ts';
import { makePerformer } from '/tests/bowed-performer.js';

export { midiOf } from '/tests/bowed-performer.js';

export const CELLO_PERFORMER = {
  instrument: 'cello',
  root: 'AirCello',
  component: AirCello,
  geo: CELLO_GEOMETRY,
  bow: CELLO_BOW,
  // Half, first, second, third and fourth positions.
  positions: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 },
  /** A finger to each semitone, the first able to stretch back a semitone or the fourth forward one. */
  fingerAt: (semis, base) => {
    const off = semis - base;
    if (off < -1 || off > 4) return 0;
    return off <= 0 ? 1 : Math.min(4, off + 1);
  },
  rest: [0, 0, 1, 2, 3],
  span: 3,
  bowing: {
    pp: { speed: 0.25, x: 0.075, press: 0.0015 },
    ff: { speed: 0.75, x: 0.04, press: 0.0035 },
  },
};

export const { planPerformance, handsFor, scoreNotes, perform, leftHand: celloLeftHand } = makePerformer(CELLO_PERFORMER);
