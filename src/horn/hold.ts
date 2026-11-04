import { createHornHold } from '../trumpet/hold.js';
import { KNUCKLE, MOUTHPIECE } from './geometry.js';

export { createHornPose, LIPS, toTrumpet as toHorn, toWorld, type HornPose } from '../trumpet/hold.js';

/**
 * Holds the horn between the lips and the left hand, whose fingers are on
 * the valve levers: it points from the lips through the left middle
 * knuckle, so lifting the hand tilts it up, and held out at its reach the
 * mouthpiece meets the lips.
 */
export const holdFrenchHorn = createHornHold(KNUCKLE, MOUTHPIECE);

/** How far the horn holds the left middle knuckle from the mouthpiece (m). */
export const HOLD_REACH = Math.hypot(KNUCKLE[0] - MOUTHPIECE[0], KNUCKLE[1] - MOUTHPIECE[1], KNUCKLE[2] - MOUTHPIECE[2]);
