/**
 * Note names and chord recognition. Pure functions, no IWSDK or DOM imports.
 */

const NOTE_NAMES = [
  'C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B',
] as const;

const mod12 = (n: number) => ((n % 12) + 12) % 12;

export function noteName(pitchClass: number): string {
  return NOTE_NAMES[mod12(pitchClass)];
}

/** Note name with octave, e.g. 40 → "E2". */
export function midiName(midi: number): string {
  return `${noteName(midi)}${Math.floor(midi / 12) - 1}`;
}

/**
 * Chord shapes as intervals above the root, in order of preference when
 * several match the same notes.
 */
const TEMPLATES: { suffix: string; intervals: number[] }[] = [
  { suffix: '', intervals: [0, 4, 7] },
  { suffix: 'm', intervals: [0, 3, 7] },
  { suffix: '7', intervals: [0, 4, 7, 10] },
  { suffix: 'maj7', intervals: [0, 4, 7, 11] },
  { suffix: 'm7', intervals: [0, 3, 7, 10] },
  { suffix: '5', intervals: [0, 7] },
  { suffix: 'sus4', intervals: [0, 5, 7] },
  { suffix: 'sus2', intervals: [0, 2, 7] },
  { suffix: '6', intervals: [0, 4, 7, 9] },
  { suffix: 'm6', intervals: [0, 3, 7, 9] },
  { suffix: 'add9', intervals: [0, 2, 4, 7] },
  { suffix: 'madd9', intervals: [0, 2, 3, 7] },
  { suffix: '9', intervals: [0, 2, 4, 7, 10] },
  { suffix: 'maj9', intervals: [0, 2, 4, 7, 11] },
  { suffix: 'm9', intervals: [0, 2, 3, 7, 10] },
  { suffix: '7sus4', intervals: [0, 5, 7, 10] },
  { suffix: 'dim', intervals: [0, 3, 6] },
  { suffix: 'm7b5', intervals: [0, 3, 6, 10] },
  { suffix: 'dim7', intervals: [0, 3, 6, 9] },
  { suffix: 'aug', intervals: [0, 4, 8] },
  { suffix: 'mMaj7', intervals: [0, 3, 7, 11] },
  { suffix: '6/9', intervals: [0, 2, 4, 7, 9] },
];

/** Seventh and extended chords may drop the fifth, as guitarists often do. */
const NO_FIFTH_OK = new Set(['7', 'maj7', 'm7', '9', 'maj9', 'm9', '6', 'm6']);

/**
 * Names the chord formed by `notes` (MIDI numbers, any order), e.g.
 * "C", "Am7", "C/E". Returns a note name for a single pitch class, and null
 * for nothing or for notes that match no known chord.
 */
export function recognizeChord(notes: readonly number[]): string | null {
  if (notes.length === 0) return null;
  let bass = notes[0];
  for (const n of notes) if (n < bass) bass = n;
  const pcs = new Set(notes.map(mod12));
  if (pcs.size === 1) return noteName(bass);

  let best: { name: string; score: number } | null = null;
  for (const root of pcs) {
    let mask = 0;
    for (const pc of pcs) mask |= 1 << mod12(pc - root);
    TEMPLATES.forEach((t, rank) => {
      const full = t.intervals.reduce((m, i) => m | (1 << i), 0);
      const noFifth = full & ~(1 << 7);
      let score: number;
      if (mask === full) score = 100;
      else if (NO_FIFTH_OK.has(t.suffix) && mask === noFifth) score = 80;
      else return;
      score -= rank;
      if (root === mod12(bass)) score += 30;
      if (best == null || score > best.score) {
        const slash = root === mod12(bass) ? '' : `/${noteName(bass)}`;
        best = { name: `${noteName(root)}${t.suffix}${slash}`, score };
      }
    });
  }
  return (best as { name: string } | null)?.name ?? null;
}
