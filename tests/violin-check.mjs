/**
 * Checks the violin performer offline (see bowed-check.js):
 *
 *   npx iwsdk dev up --allow-browser-automation
 *   npm run check:violin
 */

import { runBowedCheck } from './bowed-check.js';

export default (ctx) =>
  runBowedCheck(ctx, {
    song: ['/tests/songs/william-tell.js', 'WILLIAM_TELL_VIOLIN'],
    performer: '/tests/violin-performer.js',
    geometry: ['/src/violin/geometry.ts', 'VIOLIN_GEOMETRY'],
    bow: ['/src/violin/bow.ts', 'BOW'],
  });
