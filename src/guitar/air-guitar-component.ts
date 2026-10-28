import { createComponent, Types } from '@iwsdk/core';

export const GuitarToneMode = { Clean: 'clean', Drive: 'drive' } as const;

/**
 * State of the air guitar the player is holding. AirGuitarSystem creates the
 * entity and keeps these fields current so they can be inspected live.
 */
export const AirGuitar = createComponent('AirGuitar', {
  key: {
    type: Types.Int8,
    default: 7,
    min: 0,
    max: 11,
    label: 'Key (pitch class, 0 = C)',
  },
  tone: { type: Types.Enum, enum: GuitarToneMode, default: GuitarToneMode.Clean },
  volume: { type: Types.Float32, default: 0.8, min: 0, max: 1, step: 0.05 },
  zone: { type: Types.Int8, default: 0, label: 'Neck zone under the fretting hand' },
  chord: { type: Types.String, default: '', label: 'Current chord' },
  strums: { type: Types.Int32, default: 0, label: 'Strings plucked so far' },
});
