import { createFrettedSystem } from '../guitar/fretted-system.js';
import { AirBass } from './air-bass-component.js';
import { BASS_MODEL } from './bass-model.js';
import { BASS_BOARD, BASS_VOICE } from './geometry.js';

/**
 * Hand-played air bass, worn and played as the guitar is (see
 * ../guitar/fretted-system.ts): left fingertips fret its four strings, the
 * right index fingertip plucks them, a fist round the neck picks it up to
 * smash. It hangs a little further right than the guitar, since its neck is
 * longer, so the nut stays within the fretting hand's reach.
 */
export const AirBassSystem = createFrettedSystem({
  instrument: 'bass',
  component: AirBass,
  board: BASS_BOARD,
  model: BASS_MODEL,
  voice: BASS_VOICE,
  placement: {
    right: 0.12,
    forward: 0.24,
    drop: 0.62,
    neck: [-0.88, 0.3, 0.3],
  },
  placementKey: 'chordless.placement.bass',
  howToPlay: [
    { icon: 'hand', caption: 'FRET LEFT' },
    { icon: 'arrowDown', caption: 'PLUCK RIGHT' },
  ],
  muteOtherStrings: true,
});
