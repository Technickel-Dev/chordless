import { createComponent, Types } from '@iwsdk/core';

/**
 * State of the air triangle: an orchestral triangle hanging from a clip
 * pinched in the left hand, and a steel beater in the right;
 * AirTriangleSystem creates its entity. `active` and `volume` are written by
 * PanelSystem (or set by hand); the rest are kept current by the system so
 * they can be inspected live.
 */
export const AirTriangle = createComponent('AirTriangle', {
  /** The triangle is the instrument in play (the others are put away). */
  active: { type: Types.Boolean, default: false },
  volume: { type: Types.Float32, default: 0.8, min: 0, max: 1, step: 0.05 },
  /** Kept for the panel's reset button; the triangle is always in the hand. */
  resetPlacement: { type: Types.Boolean, default: false },
  strikes: { type: Types.Int32, default: 0, label: 'Strikes so far' },
  lastStrike: { type: Types.Float32, default: 0, label: 'Loudness of the last strike (0-1)' },
  lastSpeed: { type: Types.Float32, default: 0, label: 'Beater speed at the last strike (m/s)' },
  lastSide: { type: Types.String, default: '', label: 'Side of the triangle last struck' },
  ringing: { type: Types.Float32, default: 0, label: 'How loud the triangle still rings (0-1)' },
  touching: { type: Types.Boolean, default: false, label: 'The beater is touching the triangle' },
  damps: { type: Types.Int32, default: 0, label: 'Times the ringing was damped' },
  leftHand: { type: Types.Boolean, default: false, label: 'Left (holding) hand tracked' },
  rightHand: { type: Types.Boolean, default: false, label: 'Right (beater) hand tracked' },
});
