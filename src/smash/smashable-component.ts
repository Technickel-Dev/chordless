import { createComponent, Types } from '@iwsdk/core';

/** In play (its system poses it), held by the hand as a prop, or loose and tumbling. */
export const SmashHold = { Worn: 'worn', Held: 'held', Thrown: 'thrown' } as const;
export const SmashCondition = { Intact: 'intact', Damaged: 'damaged', Wrecked: 'wrecked' } as const;

/**
 * How smashed an instrument is. Its system adds this beside the
 * instrument's own component and PropSmasher keeps it current; set
 * `repair` to put the instrument back together.
 */
export const Smashable = createComponent('Smashable', {
  smashable: { type: Types.Boolean, default: true },
  repair: { type: Types.Boolean, default: false },
  hold: { type: Types.Enum, enum: SmashHold, default: SmashHold.Worn, label: 'In play, held or loose' },
  condition: { type: Types.Enum, enum: SmashCondition, default: SmashCondition.Intact },
  health: { type: Types.Float32, default: 1, label: 'Health left (0 = wrecked)' },
  piecesOff: { type: Types.Int16, default: 0, label: 'Pieces broken off' },
  impacts: { type: Types.Int32, default: 0, label: 'Hits taken so far' },
  dents: { type: Types.Int32, default: 0, label: 'Dents in it' },
  lastImpact: { type: Types.Float32, default: 0, label: 'Last hit speed (m/s)' },
});
