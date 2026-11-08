import { createComponent, Types } from '@iwsdk/core';

export const GuitarToneMode = { Clean: 'clean', Drive: 'drive' } as const;

/** Worn and played, gripped by the neck as a prop, or flying free. */
export const GuitarHold = { Worn: 'worn', Held: 'held', Thrown: 'thrown' } as const;
export const GuitarCondition = { Intact: 'intact', Damaged: 'damaged', Wrecked: 'wrecked' } as const;

/**
 * State of the air guitar the player wears. AirGuitarSystem creates the
 * entity and keeps the read-only fields current so they can be inspected
 * live; PanelSystem writes `tone`, `volume` and `resetPlacement`.
 */
export const AirGuitar = createComponent('AirGuitar', {
  /** The guitar is the instrument in play (false while the violin is). */
  active: { type: Types.Boolean, default: true },
  tone: { type: Types.Enum, enum: GuitarToneMode, default: GuitarToneMode.Clean },
  volume: { type: Types.Float32, default: 0.8, min: 0, max: 1, step: 0.05 },
  /** Set to move the guitar back to its default spot in front of the player. */
  resetPlacement: { type: Types.Boolean, default: false },
  chord: { type: Types.String, default: '', label: 'Chord ringing (or fretted shape)' },
  frets: { type: Types.String, default: '0 0 0 0 0 0', label: 'Fret per string, low E first' },
  plucks: { type: Types.Int32, default: 0, label: 'Strings plucked so far' },
  damps: { type: Types.Int32, default: 0, label: 'Ringing strings damped so far' },
  lastNote: { type: Types.String, default: '', label: 'Last plucked note' },
  leftHand: { type: Types.Boolean, default: false, label: 'Fretting hand tracked' },
  rightHand: { type: Types.Boolean, default: false, label: 'Picking hand tracked' },
  /** Make a fist round the neck to pick the guitar up and smash it. */
  smashable: { type: Types.Boolean, default: true },
  /** Set to put a fresh guitar back on the player. */
  repair: { type: Types.Boolean, default: false },
  hold: { type: Types.Enum, enum: GuitarHold, default: GuitarHold.Worn, label: 'Worn, held or thrown' },
  condition: { type: Types.Enum, enum: GuitarCondition, default: GuitarCondition.Intact },
  health: { type: Types.Float32, default: 1, label: 'Health left (0 = wrecked)' },
  strings: { type: Types.Int8, default: 6, label: 'Strings still on' },
  neckBroken: { type: Types.Boolean, default: false },
  impacts: { type: Types.Int32, default: 0, label: 'Hits taken so far' },
  dents: { type: Types.Int32, default: 0, label: 'Dents in it' },
  shardsOff: { type: Types.Int8, default: 0, label: 'Shards of the body gone' },
  lastImpact: { type: Types.Float32, default: 0, label: 'Last hit speed (m/s)' },
});
