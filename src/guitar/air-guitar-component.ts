import { createComponent, Types } from '@iwsdk/core';

export const GuitarToneMode = { Clean: 'clean', Drive: 'drive' } as const;

/**
 * State of the air guitar the player wears. AirGuitarSystem creates the
 * entity and keeps the read-only fields current so they can be inspected
 * live; PanelSystem writes `tone`, `volume` and `resetPlacement`.
 */
export const AirGuitar = createComponent('AirGuitar', {
  tone: { type: Types.Enum, enum: GuitarToneMode, default: GuitarToneMode.Clean },
  volume: { type: Types.Float32, default: 0.8, min: 0, max: 1, step: 0.05 },
  /** Set to move the guitar back to its default spot in front of the player. */
  resetPlacement: { type: Types.Boolean, default: false },
  chord: { type: Types.String, default: '', label: 'Chord ringing (or fretted shape)' },
  frets: { type: Types.String, default: '0 0 0 0 0 0', label: 'Fret per string, low E first' },
  plucks: { type: Types.Int32, default: 0, label: 'Strings plucked so far' },
  lastNote: { type: Types.String, default: '', label: 'Last plucked note' },
  leftHand: { type: Types.Boolean, default: false, label: 'Fretting hand tracked' },
  rightHand: { type: Types.Boolean, default: false, label: 'Picking hand tracked' },
});
