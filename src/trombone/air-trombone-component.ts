import { createComponent, Types } from '@iwsdk/core';

/**
 * State of the air trombone, held to the lips in the left hand with the
 * slide in the right; AirTromboneSystem creates its entity. `active` and
 * `volume` are written by PanelSystem (or set by hand); the rest are kept
 * current by the system so they can be inspected live.
 */
export const AirTrombone = createComponent('AirTrombone', {
  /** The trombone is the instrument in play (the others are put away). */
  active: { type: Types.Boolean, default: false },
  volume: { type: Types.Float32, default: 0.8, min: 0, max: 1, step: 0.05 },
  /** Kept for the panel's reset button; the trombone is always in the hand. */
  resetPlacement: { type: Types.Boolean, default: false },
  atLips: { type: Types.Boolean, default: false, label: 'Mouthpiece at the lips' },
  partial: { type: Types.Int8, default: 4, label: 'Partial the bell tilt selects' },
  elevation: { type: Types.Float32, default: 0, label: 'Bell elevation (degrees)' },
  slide: { type: Types.Float32, default: 0, label: 'Slide out (cm)' },
  position: { type: Types.Float32, default: 1, label: 'Slide position (1-7)' },
  holdingSlide: { type: Types.Boolean, default: false, label: 'Right hand on the slide brace' },
  note: { type: Types.String, default: 'Bb3', label: 'Nearest note' },
  midi: { type: Types.Int8, default: 58, label: 'Nearest MIDI note' },
  cents: { type: Types.Int16, default: 0, label: 'Cents sharp of the nearest note' },
  air: { type: Types.Float32, default: 0, label: 'Air from the left pinch (0-1)' },
  sounding: { type: Types.Boolean, default: false, label: 'A note is sounding' },
  notes: { type: Types.Int32, default: 0, label: 'Notes tongued so far' },
  leftHand: { type: Types.Boolean, default: false, label: 'Left hand tracked' },
  rightHand: { type: Types.Boolean, default: false, label: 'Right hand tracked' },
});
