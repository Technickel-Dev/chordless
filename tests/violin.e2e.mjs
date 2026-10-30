/**
 * End-to-end test for the hand-played air violin (see bowed-e2e.js):
 *
 *   npx iwsdk dev up --allow-browser-automation
 *   npm run test:violin
 */

import { runBowedE2E } from './bowed-e2e.js';

export default (ctx) =>
  runBowedE2E(ctx, {
    instrument: 'violin',
    title: 'Violin',
    component: ['/src/violin/air-violin-component.ts', 'AirViolin'],
    root: 'AirViolin',
    bowRoot: 'AirBow',
    others: ['AirCello'],
    button: 'instrument-violin',
    geometry: ['/src/violin/geometry.ts', 'VIOLIN_GEOMETRY'],
    bow: ['/src/violin/bow.ts', 'BOW'],
    open: ['G3', 'D4', 'A4', 'E5'],
    names: ['G', 'D', 'A', 'E'],
    view: { pitch: -32, yaw: 28, roll: 0 },
    x: 0.025,
    press: 0.0015,
    stops: [
      [2, 'B4'],
      [7, 'E5'],
    ],
  });
