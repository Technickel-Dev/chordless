/**
 * Plays the galop theme from the William Tell Overture finale on the air
 * cello, an octave below the guitar's arrangement (see bowed-play.js):
 *
 *   npx iwsdk dev up --headed --allow-browser-automation
 *   npm run play:cello
 */

import { runBowedPlay } from './bowed-play.js';

export default (ctx) =>
  runBowedPlay(ctx, {
    instrument: 'cello',
    song: ['/tests/songs/william-tell.js', 'WILLIAM_TELL_CELLO'],
    performer: '/tests/cello-performer.js',
    // Looking down at the cello in front, a little to the left.
    view: { pitch: -50, yaw: 12, roll: 0 },
  });
