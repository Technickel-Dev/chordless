import { createComponent, Types } from '@iwsdk/core';

/** How the left hand's stopping position becomes a pitch. */
export const Intonation = {
  /** Pitches snap to the nearest semitone, forgiving tracking jitter. */
  Snap: 'snap',
  /** Pitch follows the fingertip exactly, as on a real fingerboard. */
  Free: 'free',
} as const;

/**
 * State of the air violin. AirViolinSystem creates the entity and keeps the
 * read-only fields current so they can be inspected live; PanelSystem
 * writes `active`, `volume` and `resetPlacement`.
 */
export const AirViolin = createComponent('AirViolin', {
  /** The violin is the instrument in play (the guitar is put away). */
  active: { type: Types.Boolean, default: false },
  volume: { type: Types.Float32, default: 0.8, min: 0, max: 1, step: 0.05 },
  intonation: { type: Types.Enum, enum: Intonation, default: Intonation.Snap },
  /** Set to move the violin back to its default spot under the chin. */
  resetPlacement: { type: Types.Boolean, default: false },
  stops: { type: Types.String, default: 'G3 D4 A4 E5', label: 'Note each string would play, G first' },
  bowing: { type: Types.String, default: '', label: 'Strings the bow is sounding' },
  bowSpeed: { type: Types.Float32, default: 0, label: 'Bow speed (m/s)' },
  strokes: { type: Types.Int32, default: 0, label: 'Bow strokes so far' },
  lastNote: { type: Types.String, default: '', label: 'Last note bowed' },
  leftHand: { type: Types.Boolean, default: false, label: 'Fingering hand tracked' },
  rightHand: { type: Types.Boolean, default: false, label: 'Bow hand tracked' },
});
