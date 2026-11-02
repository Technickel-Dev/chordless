import { createComponent, Types } from '@iwsdk/core';

/**
 * State of the air drums, a full kit on stands in front of the player,
 * played with a stick in each fist; AirDrumsSystem creates its entity.
 * `active`, `volume` and `resetPlacement` are written by PanelSystem (or set
 * by hand); the rest are kept current by the system so they can be
 * inspected live.
 */
export const AirDrums = createComponent('AirDrums', {
  /** The drums are the instrument in play (the others are put away). */
  active: { type: Types.Boolean, default: false },
  volume: { type: Types.Float32, default: 0.8, min: 0, max: 1, step: 0.05 },
  /** Set to move the kit to in front of the player, at their height. */
  resetPlacement: { type: Types.Boolean, default: false },
  hits: { type: Types.Int32, default: 0, label: 'Strokes so far' },
  lastPiece: { type: Types.String, default: '', label: 'What the last stroke hit' },
  lastHit: { type: Types.Float32, default: 0, label: 'Loudness of the last stroke (0-1)' },
  lastSpeed: { type: Types.Float32, default: 0, label: 'Stick speed into the last stroke (m/s)' },
  /** Head height of the snare (m), from the player's height when the kit was placed. */
  snareHeight: { type: Types.Float32, default: 0.9, label: 'Snare height (m)' },
  leftHand: { type: Types.Boolean, default: false, label: 'Left hand tracked' },
  rightHand: { type: Types.Boolean, default: false, label: 'Right hand tracked' },
});
