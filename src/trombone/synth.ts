import { TrumpetSynth, type BrassVoice } from '../trumpet/synth.js';

/**
 * The trombone's voice: the trumpet's tube an octave and more lower, its
 * larger cup and bell. Its strongest harmonics sit around 500-600 Hz, so a
 * soft low note is round and dark and a loud one climbs to the fifth or
 * sixth harmonic and blares; the bell radiates down to about 70 Hz. Held
 * notes take only a little vibrato, as trombonists play.
 */
export const TROMBONE_VOICE: BrassVoice = {
  harmonics: 48,
  spectra: [
    { peak: 1.5, rise: 2, fall: 6 },
    { peak: 3, rise: 3, fall: 2.8 },
    { peak: 5.5, rise: 2.6, fall: 1.5 },
  ],
  cupHz: 560,
  cupGain: 5,
  brillianceHz: 1500,
  bellHz: 70,
  toneLow: 8,
  toneHigh: 26,
  vibratoCents: 4,
  scoopCents: -30,
  breathHz: 1100,
};

/** A trombone: the brass synth (see TrumpetSynth) with TROMBONE_VOICE. */
export class TromboneSynth extends TrumpetSynth {
  constructor(context?: BaseAudioContext) {
    super(context, TROMBONE_VOICE);
  }
}
