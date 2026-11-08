import { AirViolin } from './air-violin-component.js';
import { BOW } from './bow.js';
import { createBowedSystem } from './bowed-system.js';
import { VIOLIN_GEOMETRY } from './geometry.js';
import { VIOLIN_VOICE } from './synth.js';
import { createViolinModel } from './violin-model.js';

const DEG = Math.PI / 180;

/**
 * Hand-played air violin. It rests under the chin on the left shoulder: its
 * tail under the chin, left of centre, the neck pointing forward and to the
 * left, the top rolled toward the bow arm (the E side lower).
 */
export const AirViolinSystem = createBowedSystem({
  instrument: 'violin',
  component: AirViolin,
  geometry: VIOLIN_GEOMETRY,
  bow: BOW,
  voice: VIOLIN_VOICE,
  createModel: createViolinModel,
  placement: {
    tail: { right: -0.06, up: -0.17, forward: 0.07 },
    neck: { right: -0.62, up: 0.06, forward: 0.78 },
    face: { right: 0, up: 1, forward: 0 },
    roll: 35 * DEG,
  },
});
