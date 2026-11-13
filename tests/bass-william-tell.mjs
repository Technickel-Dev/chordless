/**
 * Plays the William Tell Overture finale on the air bass, the guitar's
 * arrangement two octaves lower (see songs/william-tell.js), with IWER's
 * emulated hands, in IWSDK's managed browser:
 *
 *   npx iwsdk dev up --headed --allow-browser-automation
 *   npm run play:bass
 *
 * Optional: WT_TEMPO=110 to slow it down; WT_SONG=WILLIAM_TELL_BASS_CUT for
 * the concert cut (npm run play:bass-cut). Prints each note asked for and
 * the note the app played, plus how far off the beat it landed (see
 * fretted-play.js).
 */

import { runFrettedPlay } from './fretted-play.js';

export default (ctx) =>
  runFrettedPlay(ctx, {
    label: 'bass',
    instrument: 'bass',
    root: 'AirBass',
    song: ['/tests/songs/william-tell.js', 'WILLIAM_TELL_BASS'],
    performer: '/tests/bass-performer.js',
    // Looking down along the bass, which hangs a little further right than the guitar.
    view: { pitch: -38, yaw: 8, roll: 0 },
  });
