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
    { peak: 2, rise: 2, fall: 5 },
    { peak: 3, rise: 2.5, fall: 3.5 },
    { peak: 4, rise: 2.5, fall: 2.3 },
  ],
  cupHz: 600,
  cupGain: 5,
  gain: 2.2,
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
