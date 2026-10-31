/**
 * Renders violin sound samples offline for listening and spectrum
 * statistics (see bowed-render.js):
 *
 *   npx iwsdk dev up --allow-browser-automation
 *   AUDIO_LABEL=after npm run render:violin
 */

import { runBowedRender } from './bowed-render.js';

export default (ctx) =>
  runBowedRender(ctx, {
    instrument: 'violin',
    synth: ['/src/violin/synth.ts', 'VIOLIN_VOICE'],
    geometry: ['/src/violin/geometry.ts', 'VIOLIN_GEOMETRY'],
    song: ['/tests/songs/william-tell.js', 'WILLIAM_TELL_VIOLIN'],
    high: [76, 81, 85, 88], // E5 A5 C#6 E6
    from: 30,
  });
