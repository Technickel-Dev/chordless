import { createComponent, Types } from '@iwsdk/core';

/**
 * State of the conductor's baton: a white baton in the right fist and a
 * music stand set down in front of the player to tap it on; AirBatonSystem
 * creates its entity. `active`, `volume` and `resetPlacement` are written by
 * PanelSystem (or set by hand); the rest are kept current by the system so
 * they can be inspected live.
 */
export const AirBaton = createComponent('AirBaton', {
  /** The baton is the instrument in play (the others are put away). */
  active: { type: Types.Boolean, default: false },
  volume: { type: Types.Float32, default: 0.8, min: 0, max: 1, step: 0.05 },
  /** Set to move the music stand to in front of the player, at their height. */
  resetPlacement: { type: Types.Boolean, default: false },
  taps: { type: Types.Int32, default: 0, label: 'Taps on the stand so far' },
  lastTap: { type: Types.Float32, default: 0, label: 'Loudness of the last tap (0-1)' },
  lastSpeed: { type: Types.Float32, default: 0, label: 'Baton tip speed at the last tap (m/s)' },
  lastSpot: { type: Types.String, default: '', label: 'Where on the stand the last tap landed' },
  /** Head height of the stand's desk ledge (m), from the player's height when it was placed. */
  deskHeight: { type: Types.Float32, default: 1.1, label: 'Desk ledge height (m)' },
  touching: { type: Types.Boolean, default: false, label: 'The baton tip is resting on the stand' },
  rightHand: { type: Types.Boolean, default: false, label: 'Right (baton) hand tracked' },
  leftHand: { type: Types.Boolean, default: false, label: 'Left hand tracked' },
});
