import { createComponent, Types } from '@iwsdk/core';

/**
 * State of the air trumpet, a B-flat trumpet held in the right hand and
 * played from the left; AirTrumpetSystem creates its entity. `active` and
 * `volume` are written by PanelSystem (or set by hand); the rest are kept
 * current by the system so they can be inspected live.
 */
export const AirTrumpet = createComponent('AirTrumpet', {
  /** The trumpet is the instrument in play (the others are put away). */
  active: { type: Types.Boolean, default: false },
  volume: { type: Types.Float32, default: 0.8, min: 0, max: 1, step: 0.05 },
  /** Kept for the panel's reset button; the trumpet is always in the hand. */
  resetPlacement: { type: Types.Boolean, default: false },
  atLips: { type: Types.Boolean, default: false, label: 'Mouthpiece at the lips' },
  valves: { type: Types.String, default: '0', label: 'Valves down (0 is open)' },
  partial: { type: Types.Int8, default: 4, label: 'Partial the bell tilt selects' },
  elevation: { type: Types.Float32, default: 0, label: 'Bell elevation (degrees)' },
  written: { type: Types.String, default: 'C5', label: 'Written note' },
  midi: { type: Types.Int8, default: 70, label: 'Sounding MIDI note' },
  air: { type: Types.Float32, default: 0, label: 'Air from the left pinch (0-1)' },
  sounding: { type: Types.Boolean, default: false, label: 'A note is sounding' },
  notes: { type: Types.Int32, default: 0, label: 'Notes tongued so far' },
  mute: { type: Types.Float32, default: 0, label: 'Plunger over the bell (0 open - 1 shut)' },
  leftHand: { type: Types.Boolean, default: false, label: 'Left hand tracked' },
  rightHand: { type: Types.Boolean, default: false, label: 'Right hand tracked' },
});
