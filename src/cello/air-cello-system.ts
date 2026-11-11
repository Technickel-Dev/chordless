import { createBow, createCello } from '../scene-assets/violin.scene-asset.js';
import { createBowedSystem } from '../violin/bowed-system.js';
import { createBowedModel } from '../violin/violin-model.js';
import { AirCello } from './air-cello-component.js';
import { CELLO, CELLO_BOW, CELLO_GEOMETRY, CELLO_VOICE } from './geometry.js';

const DEG = Math.PI / 180;

/**
 * Hand-played air cello. It stands in front of the player, a little left,
 * the endpin toward the floor and the neck leaning back past the left of
 * the chin (the nut about at chin height), the top facing away and turned a
 * little toward the bow arm. The left hand reaches round the neck from the
 * C-string side; the bow crosses the strings at about hip height.
 */
export const AirCelloSystem = createBowedSystem({
  instrument: 'cello',
  component: AirCello,
  geometry: CELLO_GEOMETRY,
  bow: CELLO_BOW,
  voice: CELLO_VOICE,
  createModel: () =>
    createBowedModel({
      geo: CELLO_GEOMETRY,
      name: 'AirCello',
      bowName: 'AirCelloBow',
      instrument: createCello,
      bow: () => createBow(CELLO_BOW),
      // Out past the bow-arm side of the body and a little ahead of it, so the
      // strip floats in the gap between the cello and the main panel.
      hud: [CELLO.nutX - 0.32, 0.5, 0.35],
      hudWidth: 0.2,
    }),
  placement: {
    tail: { right: 0.01, up: -1.16, forward: 0.42 },
    neck: { right: -0.2, up: 0.92, forward: -0.33 },
    face: { right: 0, up: 0, forward: 1 },
    roll: 15 * DEG,
  },
});
