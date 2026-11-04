import { createHornHold } from '../trumpet/hold.js';
import { KNUCKLE, MOUTHPIECE } from './geometry.js';

export { createHornPose, LIPS, toTrumpet as toTrombone, toWorld, type HornPose } from '../trumpet/hold.js';

/**
 * Holds the trombone between the lips and the left hand, as holdHorn holds
 * the trumpet in the right: it points from the lips through the left
 * middle knuckle, so lifting the hand tilts the bell and slide up, and held
 * out at its reach the mouthpiece meets the lips.
 */
export const holdTrombone = createHornHold(KNUCKLE, MOUTHPIECE);

/** How far the trombone holds the left middle knuckle from the mouthpiece (m). */
export const HOLD_REACH = Math.hypot(KNUCKLE[0] - MOUTHPIECE[0], KNUCKLE[1] - MOUTHPIECE[1], KNUCKLE[2] - MOUTHPIECE[2]);
