/**
 * How the air trumpet is played, without a trumpet in the hands or air in
 * the lungs. A trumpet's note is a fingering and a partial: the valves set
 * the tube's length, and the lips pick which of its natural notes (the
 * harmonic series of that length) sounds. Here the right hand's fingers
 * press the valves as on a real trumpet, the bell's tilt stands in for the
 * lips (aim higher for higher partials), and a left-hand pinch is the
 * tongue and the air: closing it starts a note, and closing it further
 * plays louder. The open left hand over the bell is a plunger mute.
 */

/** Semitones each valve lowers the pitch by: first, second, third. */
export const VALVE_SEMITONES = [2, 1, 3] as const;

/**
 * The partials the bell's tilt selects, lowest first, and the written note
 * each sounds with the valves up. The seventh is skipped, as players do: it
 * is badly flat, and every note it gives has another fingering.
 */
export const PARTIALS = [
  { partial: 2, written: 60 }, // C4
  { partial: 3, written: 67 }, // G4
  { partial: 4, written: 72 }, // C5
  { partial: 5, written: 76 }, // E5
  { partial: 6, written: 79 }, // G5
  { partial: 8, written: 84 }, // C6
] as const;

/** A B-flat trumpet sounds a whole tone below its written note. */
export const TRANSPOSITION = -2;

/** Semitones the pressed valves lower the pitch by. */
export function fingeringSemitones(valves: ArrayLike<boolean>): number {
  let s = 0;
  for (let i = 0; i < 3; i++) if (valves[i]) s += VALVE_SEMITONES[i];
  return s;
}

/** The written note of partial number `index` (into PARTIALS) with `valves` pressed. */
export function writtenNote(index: number, valves: ArrayLike<boolean>): number {
  return PARTIALS[index].written - fingeringSemitones(valves);
}

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/** A MIDI note's name, as `C5`. */
export function noteName(midi: number): string {
  return `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

/** The pressed valves as a trumpeter says them: `0` (open), `1`, `1-3`, `1-2-3`. */
export function fingeringName(valves: ArrayLike<boolean>): string {
  const down: number[] = [];
  for (let i = 0; i < 3; i++) if (valves[i]) down.push(i + 1);
  return down.length === 0 ? '0' : down.join('-');
}

/**
 * The bell's elevation (degrees above level) at the middle of each
 * partial's band, lowest partial first. Held about level the horn plays in
 * its middle register; each band is 12 degrees.
 */
export const PARTIAL_CENTERS = [-32, -20, -8, 4, 16, 28] as const;
/** Half a band: the elevation between neighbouring partials is this far from each centre. */
export const PARTIAL_HALF_BAND = 6;
/** How far past the edge of a band the bell must go to change partial, so tracking jitter cannot flicker it. */
export const PARTIAL_HYSTERESIS = 2.5;

/**
 * Picks the partial from the bell's tilt. Bands meet halfway between
 * centres; once in one, the bell must go a little past its edge to leave.
 */
export class PartialSelector {
  /** Index into PARTIALS. */
  index = 2;

  update(elevationDeg: number): number {
    const n = PARTIAL_CENTERS.length;
    while (this.index < n - 1 && elevationDeg > PARTIAL_CENTERS[this.index] + PARTIAL_HALF_BAND + PARTIAL_HYSTERESIS) {
      this.index++;
    }
    while (this.index > 0 && elevationDeg < PARTIAL_CENTERS[this.index] - PARTIAL_HALF_BAND - PARTIAL_HYSTERESIS) {
      this.index--;
    }
    return this.index;
  }
}

/** WebXR hand joint indices for the three valve fingers: metacarpal, knuckle, tip. */
export const VALVE_FINGERS = [
  { metacarpal: 5, knuckle: 6, tip: 9 }, // index
  { metacarpal: 10, knuckle: 11, tip: 14 }, // middle
  { metacarpal: 15, knuckle: 16, tip: 19 }, // ring
] as const;

/**
 * How bent a finger is at the knuckle, in degrees: the angle between its
 * metacarpal and the line from its knuckle to its tip. With the hand on
 * the trumpet (see KNUCKLE in geometry.ts) and the pads of the fingers on
 * the buttons, as trumpeters play, fingers resting on them are curved 52 to
 * 57 degrees and pressing a valve fully bends them to 71 to 77; a relaxed
 * open hand is under 20, a fist past 120.
 */
export const VALVE_REST_BEND = 55;
export const VALVE_DOWN_BEND = 75;
/** A valve goes down past this bend and comes up below the lower one: between resting and pressed. */
export const VALVE_PRESS_BEND = 66;
export const VALVE_RELEASE_BEND = 61;

/** One finger's bend, from the hand's joint positions (xyz per joint, any space). */
export function fingerBend(joints: ArrayLike<number>, finger: (typeof VALVE_FINGERS)[number]): number {
  const m = finger.metacarpal * 3;
  const k = finger.knuckle * 3;
  const t = finger.tip * 3;
  const ax = joints[k] - joints[m];
  const ay = joints[k + 1] - joints[m + 1];
  const az = joints[k + 2] - joints[m + 2];
  const bx = joints[t] - joints[k];
  const by = joints[t + 1] - joints[k + 1];
  const bz = joints[t + 2] - joints[k + 2];
  const la = Math.hypot(ax, ay, az);
  const lb = Math.hypot(bx, by, bz);
  if (la < 1e-6 || lb < 1e-6) return 0;
  const cos = (ax * bx + ay * by + az * bz) / (la * lb);
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}

/** Reads the three valves from the right hand's fingers. */
export class ValveReader {
  readonly down = [false, false, false];
  /** How far each piston is down, 0 up to 1 at the bottom, for the model. */
  readonly depth = new Float32Array(3);
  readonly bend = new Float32Array(3);

  update(joints: ArrayLike<number>): void {
    for (let i = 0; i < 3; i++) {
      const bend = fingerBend(joints, VALVE_FINGERS[i]);
      this.bend[i] = bend;
      if (bend > VALVE_PRESS_BEND) this.down[i] = true;
      else if (bend < VALVE_RELEASE_BEND) this.down[i] = false;
      const travel = (bend - VALVE_REST_BEND) / (VALVE_DOWN_BEND - VALVE_REST_BEND);
      // A pressed valve shows at least most of the way down, so the model agrees with the sound.
      this.depth[i] = Math.max(this.down[i] ? 0.8 : 0, Math.min(1, Math.max(0, travel)));
    }
  }

  reset(): void {
    this.down.fill(false);
    this.depth.fill(0);
  }
}

/** Thumb and index tips this far apart (m) give no air; this close, full air. */
export const PINCH_OPEN = 0.05;
export const PINCH_CLOSED = 0.012;
/** The tongue releases a note when the air passes this, and the note stops when it falls below the lower one. */
export const AIR_START = 0.18;
export const AIR_STOP = 0.08;

/** How much air a pinch gives, 0 to 1, from the thumb-to-index distance (m). */
export function airFromPinch(distance: number): number {
  return Math.min(1, Math.max(0, (PINCH_OPEN - distance) / (PINCH_OPEN - PINCH_CLOSED)));
}

/**
 * The tongue and the air. Closing the pinch past AIR_START tongues a note
 * (`tongued` is set that frame); the note sounds as long as the air stays
 * above AIR_STOP, so opening the pinch and closing it again re-tongues.
 * Only lips on the mouthpiece make a sound.
 */
export class Breath {
  air = 0;
  blowing = false;
  /** Set on the frame a note is tongued. */
  tongued = false;
  notes = 0;

  update(pinchDistance: number, atLips: boolean): void {
    this.tongued = false;
    this.air = atLips ? airFromPinch(pinchDistance) : 0;
    if (!this.blowing && this.air >= AIR_START) {
      this.blowing = true;
      this.tongued = true;
      this.notes++;
    } else if (this.blowing && this.air < AIR_STOP) {
      this.blowing = false;
    }
  }

  reset(): void {
    this.air = 0;
    this.blowing = false;
    this.tongued = false;
  }
}

/**
 * The plunger: the open left hand cupped over the bell. Closed to within
 * PLUNGER_SHUT of the rim it is fully shut; it opens fully by PLUNGER_OPEN
 * in front, and does nothing off to the side.
 */
export const PLUNGER_SHUT = 0.015;
export const PLUNGER_OPEN = 0.14;

/**
 * How far the bell is covered, 0 open to 1 shut, from the hand's palm
 * relative to the bell's rim: `along` in front of it on the bell's axis and
 * `across` from the axis (m).
 */
export function plungerAmount(along: number, across: number, bellRadius: number): number {
  if (along < -0.03 || across > bellRadius * 1.4) return 0;
  const near = 1 - Math.min(1, Math.max(0, (along - PLUNGER_SHUT) / (PLUNGER_OPEN - PLUNGER_SHUT)));
  // Off-centre the hand covers less of the bell.
  const centred = 1 - Math.min(1, Math.max(0, (across - bellRadius * 0.6) / (bellRadius * 0.8)));
  return near * near * centred;
}
