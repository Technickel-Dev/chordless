/**
 * The bass guitar's fretboard and voice. A short-scale four-string (30",
 * like a Mustang or a violin bass) so the left hand can still span a fret
 * per finger in first position, in standard tuning E1 A1 D2 G2. Same frame
 * as the guitar (see ../guitar/geometry.ts): the origin is where the
 * strings are plucked, just ahead of the pickup.
 */

import { fretboard } from '../guitar/geometry.js';
import type { GuitarVoice } from '../guitar/synth.js';

export const BASS_OPEN_MIDI = [28, 33, 38, 43] as const;

export const BASS_BOARD = fretboard({
  openMidi: BASS_OPEN_MIDI,
  scaleLength: 0.762,
  bridgeX: -0.14,
  fretCount: 20,
  boardTopZ: 0.014,
  stringZ: 0.019,
  // About 12 mm between strings at the nut and 19 mm at the bridge, as on a real bass.
  nutSpan: 0.036,
  bridgeSpan: 0.057,
  neckWidthNut: 0.046,
  neckWidthBody: 0.064,
  pluckMaxX: 0.2,
});

export const BASS = BASS_BOARD.dims;

/**
 * A clean electric bass through a bass amp: no acoustic body, the
 * fundamental kept (the highpass only clears rumble below the low E), a
 * little low shelf for weight, the low-mid mud around 260 Hz cut, a mid
 * peak for the growl that small speakers (a headset's) can carry, and the
 * top rolled off as a bass cabinet does. It is played nearly dry, as a
 * bass is recorded, and sits well under the limiter, which grabs slowly so
 * it never reshapes a low note's wave. The strings are plucked with the
 * soft pad of a finger, a little nearer the middle of the string than a
 * pick, so the tone is round.
 */
export const BASS_VOICE: GuitarVoice = {
  acousticBody: false,
  radiationHz: 32,
  lowShelfHz: 120,
  lowShelfDb: 3,
  presenceHz: 900,
  presenceDb: 4,
  brightDb: -6,
  topHz: 3500,
  cleanLevel: 0.6,
  driveMidHz: 650,
  cabinetHz: 2600,
  driveLevel: 0.24,
  pluckToneHz: 900,
  pluckToneRange: 5000,
  pluckPosition: 0.18,
  softness: 0.45,
  loopBlend: 0.5,
  noteSeconds: 4,
  // Lifting a fretting finger lets the note die away over a moment rather
  // than vanish: on a low string a sudden stop sounds like a cut, and the
  // tail carries one note into the next.
  releaseSeconds: 0.16,
  mudHz: 260,
  mudDb: -4,
  roomWet: 0.06,
  limiter: { threshold: -6, knee: 4, attack: 0.012, release: 0.25 },
};
