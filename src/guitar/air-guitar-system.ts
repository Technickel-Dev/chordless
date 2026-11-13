import { AirGuitar } from './air-guitar-component.js';
import { createFrettedSystem } from './fretted-system.js';
import { GUITAR_BOARD } from './geometry.js';
import { GUITAR_MODEL } from './guitar-model.js';
import { ACOUSTIC_VOICE } from './synth.js';

/**
 * Hand-played air guitar. The guitar is worn: it hangs in front of the
 * player and follows their body, not their hands. Left fingertips fret real
 * strings at real fret positions; the right index fingertip plucks or
 * strums whatever strings it crosses (see fretted-system.ts).
 */
export const AirGuitarSystem = createFrettedSystem({
  instrument: 'guitar',
  component: AirGuitar,
  board: GUITAR_BOARD,
  model: GUITAR_MODEL,
  voice: ACOUSTIC_VOICE,
  placement: {
    right: 0.07,
    forward: 0.24,
    drop: 0.6,
    neck: [-0.88, 0.3, 0.3],
  },
  placementKey: 'chordless.placement',
  howToPlay: [
    { icon: 'hand', caption: 'FRET LEFT' },
    { icon: 'arrowDown', caption: 'STRUM RIGHT' },
  ],
});
