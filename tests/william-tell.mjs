/**
 * Plays the opening of the William Tell Overture finale on the air guitar,
 * with IWER's emulated hands, in IWSDK's managed browser:
 *
 *   npx iwsdk dev up --headed --allow-browser-automation
 *   npm run play:william-tell
 *
 * Optional: WT_TEMPO=110 to slow it down; WT_SONG=WILLIAM_TELL_CUT for the
 * concert cut (npm run play:william-tell-cut). Prints each note asked for and
 * the note the app played, plus how far off the beat it landed (see
 * fretted-play.js).
 */

import { runFrettedPlay } from './fretted-play.js';

export default (ctx) =>
  runFrettedPlay(ctx, {
    label: 'guitar',
    instrument: 'guitar',
    root: 'AirGuitar',
    song: ['/tests/songs/william-tell.js', 'WILLIAM_TELL'],
    performer: '/tests/performer.js',
    view: { pitch: -38, yaw: 12, roll: 0 },
  });
