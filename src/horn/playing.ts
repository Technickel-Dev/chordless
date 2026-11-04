/**
 * How the air horn is played. Like the trumpet's, a horn's note is a
 * fingering and a partial: the left hand's fingers press the three rotary
 * valves' levers (the trumpet's valve reader, on the left hand) and the
 * horn's tilt stands in for the lips. The right hand is in the bell, as a
 * hornist's is: its pinch is the tongue and the air, and the further it
 * closes over the throat the darker and more covered the tone.
 */

export { airFromPinch, Breath, fingeringName, noteName, PartialSelector, PARTIAL_CENTERS, ValveReader, VALVE_SEMITONES, fingeringSemitones } from '../trumpet/playing.js';
import { fingeringSemitones } from '../trumpet/playing.js';

/**
 * The partials the tilt selects, lowest first, and the note each sounds
 * with the valves up. A single B-flat horn: the same open notes as the
 * tenor trombone, Bb2 to Bb4, the seventh skipped as on the trumpet.
 */
export const PARTIALS = [
  { partial: 2, midi: 46 }, // Bb2
  { partial: 3, midi: 53 }, // F3
  { partial: 4, midi: 58 }, // Bb3
  { partial: 5, midi: 62 }, // D4
  { partial: 6, midi: 65 }, // F4
  { partial: 8, midi: 70 }, // Bb4
] as const;

/** Horn parts are written in F, a fifth above where they sound, whichever side of the horn plays them. */
export const WRITTEN_ABOVE = 7;

/** The sounding note (MIDI) of partial `index` (into PARTIALS) with `valves` pressed. */
export function soundingNote(index: number, valves: ArrayLike<boolean>): number {
  return PARTIALS[index].midi - fingeringSemitones(valves);
}

/**
 * How far the right hand covers the bell, 0 out of it to 1 closed over
 * the throat, from its palm relative to the bell: `inside` how far in from
 * the rim along the bell's axis and `across` from the axis (m). A hornist's
 * hand rests about a third of the way in, against the far side; the
 * deeper and more central, the more it covers.
 */
export function handCover(inside: number, across: number, rimRadius: number): number {
  if (inside < -0.03 || across > rimRadius * 1.1) return 0;
  const depth = Math.min(1, Math.max(0, (inside + 0.03) / 0.2));
  const central = 1 - Math.min(1, Math.max(0, (across - rimRadius * 0.25) / (rimRadius * 0.85)));
  return depth * central;
}
