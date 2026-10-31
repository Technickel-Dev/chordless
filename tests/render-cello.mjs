/**
 * Renders cello sound samples offline for listening and spectrum
 * statistics (see bowed-render.js):
 *
 *   npx iwsdk dev up --allow-browser-automation
 *   AUDIO_LABEL=after npm run render:cello
 */

import { runBowedRender } from './bowed-render.js';

export default (ctx) =>
  runBowedRender(ctx, {
    instrument: 'cello',
    synth: ['/src/cello/geometry.ts', 'CELLO_VOICE'],
    geometry: ['/src/cello/geometry.ts', 'CELLO_GEOMETRY'],
    song: ['/tests/songs/william-tell.js', 'WILLIAM_TELL_CELLO'],
    high: [57, 62, 66, 69], // A3 D4 F#4 A4
    from: 30,
  });
