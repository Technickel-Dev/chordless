import { createComponent, Types } from '@iwsdk/core';

/**
 * State of the air French horn, held to the lips in the left hand, whose
 * fingers work the valves, with the right hand in the bell; AirHornSystem
 * creates its entity. `active` and `volume` are written by PanelSystem (or
 * set by hand); the rest are kept current by the system so they can be
 * inspected live.
 */
export const AirHorn = createComponent('AirHorn', {
  /** The horn is the instrument in play (the others are put away). */
  active: { type: Types.Boolean, default: false },
  volume: { type: Types.Float32, default: 0.8, min: 0, max: 1, step: 0.05 },
  /** Kept for the panel's reset button; the horn is always in the hand. */
  resetPlacement: { type: Types.Boolean, default: false },
  atLips: { type: Types.Boolean, default: false, label: 'Mouthpiece at the lips' },
  valves: { type: Types.String, default: '0', label: 'Valves down (0 is open)' },
  partial: { type: Types.Int8, default: 4, label: 'Partial the tilt selects' },
  elevation: { type: Types.Float32, default: 0, label: 'Elevation (degrees)' },
  written: { type: Types.String, default: 'F4', label: 'Written note (horn in F)' },
  midi: { type: Types.Int8, default: 58, label: 'Sounding MIDI note' },
  air: { type: Types.Float32, default: 0, label: 'Air from the right pinch (0-1)' },
  sounding: { type: Types.Boolean, default: false, label: 'A note is sounding' },
  notes: { type: Types.Int32, default: 0, label: 'Notes tongued so far' },
  cover: { type: Types.Float32, default: 0, label: 'Right hand over the throat (0 out - 1 closed)' },
  leftHand: { type: Types.Boolean, default: false, label: 'Left hand tracked' },
  rightHand: { type: Types.Boolean, default: false, label: 'Right hand tracked' },
});
