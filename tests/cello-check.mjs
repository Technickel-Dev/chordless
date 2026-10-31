/**
 * Checks the cello performer offline (see bowed-check.js):
 *
 *   npx iwsdk dev up --allow-browser-automation
 *   npm run check:cello
 */

import { runBowedCheck } from './bowed-check.js';

export default (ctx) =>
  runBowedCheck(ctx, {
    song: ['/tests/songs/william-tell.js', 'WILLIAM_TELL_CELLO'],
    performer: '/tests/cello-performer.js',
    geometry: ['/src/cello/geometry.ts', 'CELLO_GEOMETRY'],
    bow: ['/src/cello/geometry.ts', 'CELLO_BOW'],
  });
