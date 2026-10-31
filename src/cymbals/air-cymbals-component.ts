import { createComponent, Types } from '@iwsdk/core';

/**
 * State of the air cymbals, a pair of orchestral clash cymbals held one in
 * each hand; AirCymbalsSystem creates its entity. `active` and `volume` are
 * written by PanelSystem (or set by hand); the rest are kept current by the
 * system so they can be inspected live.
 */
export const AirCymbals = createComponent('AirCymbals', {
  /** The cymbals are the instrument in play (the others are put away). */
  active: { type: Types.Boolean, default: false },
  volume: { type: Types.Float32, default: 0.8, min: 0, max: 1, step: 0.05 },
  /** Kept for the panel's reset button; the cymbals are always in the hands. */
  resetPlacement: { type: Types.Boolean, default: false },
  clashes: { type: Types.Int32, default: 0, label: 'Clashes so far' },
  lastClash: { type: Types.Float32, default: 0, label: 'Loudness of the last clash (0-1)' },
  lastSpeed: { type: Types.Float32, default: 0, label: 'Closing speed of the last clash (m/s)' },
  ringing: { type: Types.Float32, default: 0, label: 'How loud the cymbals still ring (0-1)' },
  touching: { type: Types.Boolean, default: false, label: 'The plates are touching' },
  gap: { type: Types.Float32, default: 1, label: 'Gap between the plates (m)' },
  damps: { type: Types.Int32, default: 0, label: 'Times the ringing was damped' },
  leftHand: { type: Types.Boolean, default: false, label: 'Left hand tracked' },
  rightHand: { type: Types.Boolean, default: false, label: 'Right hand tracked' },
});
