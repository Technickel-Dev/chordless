import { createComponent, Types } from '@iwsdk/core';

/** How the left hand's stopping position becomes a pitch. */
export const Intonation = {
  /** Pitches snap to the nearest semitone, forgiving tracking jitter. */
  Snap: 'snap',
  /** Pitch follows the fingertip exactly, as on a real fingerboard. */
  Free: 'free',
} as const;

/**
 * The fields of a bowed instrument's state: `active`, `volume`,
 * `intonation` and `resetPlacement` are written by PanelSystem (or set by
 * hand); the rest are kept current by the instrument's system so they can
 * be inspected live. `openStops` is what `stops` shows with every string
 * open.
 */
export const bowedFields = (openStops: string) => ({
  /** The instrument is the one in play (the others are put away). */
  active: { type: Types.Boolean, default: false },
  volume: { type: Types.Float32, default: 0.8, min: 0, max: 1, step: 0.05 },
  intonation: { type: Types.Enum, enum: Intonation, default: Intonation.Snap },
  /** Set to move the instrument back to its default spot. */
  resetPlacement: { type: Types.Boolean, default: false },
  stops: { type: Types.String, default: openStops, label: 'Note each string would play, lowest first' },
  bowing: { type: Types.String, default: '', label: 'Strings the bow is sounding' },
  bowSpeed: { type: Types.Float32, default: 0, label: 'Bow speed (m/s)' },
  strokes: { type: Types.Int32, default: 0, label: 'Bow strokes so far' },
  lastNote: { type: Types.String, default: '', label: 'Last note bowed' },
  leftHand: { type: Types.Boolean, default: false, label: 'Fingering hand tracked' },
  rightHand: { type: Types.Boolean, default: false, label: 'Bow hand tracked' },
}) as const;

/** State of the air violin; AirViolinSystem creates its entity. */
export const AirViolin = createComponent('AirViolin', bowedFields('G3 D4 A4 E5'));
