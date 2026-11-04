/**
 * How the air trombone is played. A trombone's note is a slide position and
 * a partial: the slide sets the tube's length, and the lips pick which of
 * its natural notes sounds. Here the right hand moves the slide as on a
 * real trombone, and the pitch follows it continuously (there are no frets
 * or valves: in tune is where the player puts it); the left hand holds the
 * horn to the lips, its tilt standing in for the lips (higher for higher
 * partials), and its pinch is the tongue and the air, as on the trumpet.
 */

import { BRACE, TROMBONE } from './geometry.js';

export { airFromPinch, Breath, noteName, PartialSelector, PARTIAL_CENTERS, PARTIAL_HALF_BAND } from '../trumpet/playing.js';

/**
 * The partials the bell's tilt selects, lowest first, and the note each
 * sounds in first position (the slide closed). Concert pitch: the trombone
 * does not transpose. The seventh is skipped, as on the trumpet: it is flat,
 * and every note it gives is in tune on the eighth further out.
 */
export const PARTIALS = [
  { partial: 2, midi: 46 }, // Bb2
  { partial: 3, midi: 53 }, // F3
  { partial: 4, midi: 58 }, // Bb3
  { partial: 5, midi: 62 }, // D4
  { partial: 6, midi: 65 }, // F4
  { partial: 8, midi: 70 }, // Bb4
] as const;

/**
 * The tube's length in first position (m). Each position lowers the pitch
 * a semitone, and the slide adds twice its travel to the tube, so the
 * positions get further apart down the slide.
 */
export const TUBE_LENGTH = 2.75;

/** Semitones the slide lowers the pitch by, `slide` metres out from first position. */
export function slideSemitones(slide: number): number {
  return 12 * Math.log2(1 + (2 * Math.max(0, slide)) / TUBE_LENGTH);
}

/** How far out (m) the slide goes to lower the pitch `semitones`: position n is n - 1 semitones down. */
export function slideFor(semitones: number): number {
  return ((2 ** (semitones / 12) - 1) * TUBE_LENGTH) / 2;
}

/** The position the slide is at, 1 (closed) to 7, fractional between them. */
export function positionOf(slide: number): number {
  return 1 + slideSemitones(slide);
}

/** The sounding pitch (a fractional MIDI note) of partial `index` (into PARTIALS) with the slide `slide` metres out. */
export function pitchOf(index: number, slide: number): number {
  return PARTIALS[index].midi - slideSemitones(slide);
}

/**
 * Where the right hand holds the slide: its thumb and index tips on the
 * brace, near enough this far (m) from it across the slide's axis. Off the
 * brace the slide stays where it was left.
 */
export const GRIP_REACH = 0.07;

/**
 * Reads the slide from the right hand. `grip` is the point between the
 * thumb and index tips in trombone space; while it is on the brace the
 * slide follows it along the axis, from closed out to TROMBONE.maxSlide.
 */
export class SlideReader {
  /** How far out the slide is (m). */
  slide = 0;
  holding = false;

  update(grip: ArrayLike<number>): number {
    const across = Math.hypot(grip[0] - BRACE[0], grip[1] - BRACE[1]);
    const out = BRACE[2] - grip[2];
    this.holding = across <= GRIP_REACH && out >= -GRIP_REACH && out <= TROMBONE.maxSlide + GRIP_REACH;
    if (this.holding) this.slide = Math.min(TROMBONE.maxSlide, Math.max(0, out));
    return this.slide;
  }

  reset(): void {
    this.holding = false;
  }
}
