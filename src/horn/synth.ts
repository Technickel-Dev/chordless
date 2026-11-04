import { TrumpetSynth, type BrassVoice } from '../trumpet/synth.js';

/**
 * The horn's voice: a long, mostly conical tube from a deep funnel
 * mouthpiece, so a round, dark tone whose strongest harmonics sit low
 * (around 350-450 Hz) and only open up into brassiness when it is blown
 * hard. The bell, facing away from the audience, sheds the top; horn
 * players use almost no vibrato.
 */
export const HORN_VOICE: BrassVoice = {
  harmonics: 40,
  spectra: [
    { peak: 1, rise: 0, fall: 8 },
    { peak: 2, rise: 3, fall: 4.2 },
    { peak: 3.5, rise: 2.5, fall: 2.3 },
  ],
  cupHz: 420,
  cupGain: 3,
  brillianceHz: 1300,
  bellHz: 60,
  toneLow: 4,
  toneHigh: 14,
  vibratoCents: 1.5,
  scoopCents: -20,
  breathHz: 900,
};

/** A French horn: the brass synth (see TrumpetSynth) with HORN_VOICE. */
export class HornSynth extends TrumpetSynth {
  constructor(context?: BaseAudioContext) {
    super(context, HORN_VOICE);
  }
}
