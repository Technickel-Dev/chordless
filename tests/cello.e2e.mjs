/**
 * End-to-end test for the hand-played air cello (see bowed-e2e.js):
 *
 *   npx iwsdk dev up --allow-browser-automation
 *   npm run test:cello
 */

import { runBowedE2E } from './bowed-e2e.js';

export default (ctx) =>
  runBowedE2E(ctx, {
    instrument: 'cello',
    title: 'Cello',
    component: ['/src/cello/air-cello-component.ts', 'AirCello'],
    root: 'AirCello',
    bowRoot: 'AirCelloBow',
    others: ['AirViolin'],
    button: 'instrument-cello',
    geometry: ['/src/cello/geometry.ts', 'CELLO_GEOMETRY'],
    bow: ['/src/cello/geometry.ts', 'CELLO_BOW'],
    open: ['C2', 'G2', 'D3', 'A3'],
    names: ['C', 'G', 'D', 'A'],
    // Looking down at the cello in front, a little to the left.
    view: { pitch: -50, yaw: 12, roll: 0 },
    x: 0.05,
    press: 0.002,
    stops: [
      [2, 'E3'],
      [7, 'A3'],
    ],
  });
