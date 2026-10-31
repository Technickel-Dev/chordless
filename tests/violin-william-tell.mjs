/**
 * Plays the galop theme from the William Tell Overture finale on the air
 * violin, as the first violins have it (see bowed-play.js):
 *
 *   npx iwsdk dev up --headed --allow-browser-automation
 *   npm run play:violin
 */

import { runBowedPlay } from './bowed-play.js';

export default (ctx) =>
  runBowedPlay(ctx, {
    instrument: 'violin',
    root: 'AirViolin',
    song: ['/tests/songs/william-tell.js', 'WILLIAM_TELL_VIOLIN'],
    performer: '/tests/violin-performer.js',
    // Looking down along the violin's neck, as a violinist does.
    view: { pitch: -32, yaw: 28, roll: 0 },
  });
