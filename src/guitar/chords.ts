/**
 * Chord theory and guitar voicings. Pure functions, no IWSDK or DOM imports.
 */

/** Standard tuning, low E (string 0) to high E (string 5), as MIDI notes. */
export const STRING_OPEN_MIDI = [40, 45, 50, 55, 59, 64] as const;
export const STRING_COUNT = STRING_OPEN_MIDI.length;

const NOTE_NAMES = [
  'C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B',
] as const;

export type ChordQuality = 'maj' | 'min' | 'dim';

export interface ChordSpec {
  /** Pitch class of the root, 0 = C. */
  root: number;
  quality: ChordQuality;
  seventh: boolean;
  power: boolean;
}

export interface Voicing {
  name: string;
  /** Per string: fret number, or null when the string is muted. */
  frets: (number | null)[];
  /** Per string: MIDI note, or null when the string is muted. */
  midi: (number | null)[];
}

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const DEGREE_QUALITY: ChordQuality[] = ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'];

/**
 * Scale degrees (0-based) assigned to the neck zones, ordered from the nut
 * toward the body: I, IV, V, vi, ii, iii. The first four are the
 * "four chord song" progression, so they sit next to each other.
 */
export const ZONE_DEGREES = [0, 3, 4, 5, 1, 2] as const;
export const ZONE_COUNT = ZONE_DEGREES.length;

const mod12 = (n: number) => ((n % 12) + 12) % 12;

export function noteName(pitchClass: number): string {
  return NOTE_NAMES[mod12(pitchClass)];
}

export function diatonicChord(keyRoot: number, degree: number): ChordSpec {
  return {
    root: mod12(keyRoot + MAJOR_SCALE[degree]),
    quality: DEGREE_QUALITY[degree],
    seventh: false,
    power: false,
  };
}

/** Swap major and minor (diminished becomes minor). */
export function flipQuality(quality: ChordQuality): ChordQuality {
  return quality === 'maj' ? 'min' : 'maj';
}

export function chordName(spec: ChordSpec): string {
  const root = noteName(spec.root);
  if (spec.power) return `${root}5`;
  if (spec.quality === 'dim') return spec.seventh ? `${root}m7b5` : `${root}dim`;
  const minor = spec.quality === 'min' ? 'm' : '';
  return `${root}${minor}${spec.seventh ? '7' : ''}`;
}

function chordTones(spec: ChordSpec): number[] {
  const third = spec.quality === 'maj' ? 4 : 3;
  const fifth = spec.quality === 'dim' ? 6 : 7;
  const tones = [0, third, fifth];
  if (spec.seventh) tones.push(10);
  return tones.map((t) => mod12(spec.root + t));
}

function powerVoicing(spec: ChordSpec): Voicing {
  // Root on the low E string, or on the A string when that keeps the shape
  // low on the neck.
  const onE = mod12(spec.root - STRING_OPEN_MIDI[0]);
  const bassString = onE <= 7 ? 0 : 1;
  const fret = bassString === 0 ? onE : mod12(spec.root - STRING_OPEN_MIDI[1]);
  const frets: (number | null)[] = Array(STRING_COUNT).fill(null);
  frets[bassString] = fret;
  frets[bassString + 1] = fret + 2;
  frets[bassString + 2] = fret + 2;
  return { name: chordName(spec), frets, midi: fretsToMidi(frets) };
}

function fretsToMidi(frets: (number | null)[]): (number | null)[] {
  return frets.map((f, s) => (f == null ? null : STRING_OPEN_MIDI[s] + f));
}

/**
 * Finds a playable voicing by sliding a four-fret window up the neck and
 * picking, for each string, the lowest fret that lands on a chord tone. The
 * root must be the lowest sounding note. For common open chords this
 * reproduces the familiar shapes (G = 320003, C = x32010, D = xx0232).
 */
export function voiceChord(spec: ChordSpec): Voicing {
  if (spec.power) return powerVoicing(spec);

  const tones = chordTones(spec);
  let best: { frets: (number | null)[]; score: number } | null = null;

  for (let position = 0; position <= 9; position++) {
    const allowed =
      position === 0
        ? [0, 1, 2, 3, 4]
        : [0, position, position + 1, position + 2, position + 3];

    let bassString = -1;
    let bassFret = 0;
    for (let s = 0; s < 3 && bassString < 0; s++) {
      for (const f of allowed) {
        if (mod12(STRING_OPEN_MIDI[s] + f) === spec.root) {
          bassString = s;
          bassFret = f;
          break;
        }
      }
    }
    if (bassString < 0) continue;

    const frets: (number | null)[] = Array(STRING_COUNT).fill(null);
    frets[bassString] = bassFret;
    for (let s = bassString + 1; s < STRING_COUNT; s++) {
      for (const f of allowed) {
        if (tones.includes(mod12(STRING_OPEN_MIDI[s] + f))) {
          frets[s] = f;
          break;
        }
      }
    }

    const played = frets.filter((f) => f != null) as number[];
    const covered = new Set(
      frets.flatMap((f, s) => (f == null ? [] : [mod12(STRING_OPEN_MIDI[s] + f)])),
    );
    const fretted = played.filter((f) => f > 0);
    const span = fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
    const score =
      played.length * 2 +
      (covered.size === tones.length ? 4 : 0) -
      position * 1.5 -
      (span > 3 ? 4 : 0);

    if (best == null || score > best.score) best = { frets, score };
  }

  const frets = best?.frets ?? Array(STRING_COUNT).fill(null);
  return { name: chordName(spec), frets, midi: fretsToMidi(frets) };
}
