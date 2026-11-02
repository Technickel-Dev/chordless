import { createComponent, Types } from '@iwsdk/core';

/**
 * State of the air piano, a 61-key keyboard set down in front of the
 * player and played with the fingertips; AirPianoSystem creates its
 * entity. `active`, `volume` and `resetPlacement` are written by
 * PanelSystem (or set by hand); the rest are kept current by the system so
 * they can be inspected live.
 */
export const AirPiano = createComponent('AirPiano', {
  /** The piano is the instrument in play (the others are put away). */
  active: { type: Types.Boolean, default: false },
  volume: { type: Types.Float32, default: 0.8, min: 0, max: 1, step: 0.05 },
  /** Set to bring the piano back in front of the player; cleared once done. */
  resetPlacement: { type: Types.Boolean, default: false },
  notes: { type: Types.Int32, default: 0, label: 'Notes played' },
  lastNote: { type: Types.Int8, default: 0, label: 'Last key struck (MIDI)' },
  lastVelocity: { type: Types.Float32, default: 0, label: 'How hard the last key was struck (0-1)' },
  keysDown: { type: Types.Int8, default: 0, label: 'Keys held down' },
  chord: { type: Types.String, default: '', label: 'Chord or note held' },
  leftHand: { type: Types.Boolean, default: false, label: 'Left hand tracked' },
  rightHand: { type: Types.Boolean, default: false, label: 'Right hand tracked' },
});
