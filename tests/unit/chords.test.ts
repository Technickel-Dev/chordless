import { describe, expect, it } from 'vitest';
import { midiName, recognizeChord } from '../../src/guitar/chords.js';
import { OPEN_MIDI } from '../../src/guitar/geometry.js';

/** MIDI notes for a shape written low E to high E, e.g. "x32010". */
const shape = (s: string) =>
  [...s].flatMap((c, i) => (c === 'x' ? [] : [OPEN_MIDI[i] + parseInt(c, 16)]));

describe('recognizeChord', () => {
  it.each([
    ['320003', 'G'],
    ['x32010', 'C'],
    ['032010', 'C/E'],
    ['xx0232', 'D'],
    ['022000', 'Em'],
    ['x02210', 'Am'],
    ['020100', 'E7'],
    ['133211', 'F'],
    ['x24432', 'Bm'],
    ['x32000', 'Cmaj7'],
    ['xx0233', 'Dsus4'],
    ['x02010', 'Am7'],
    ['022xxx', 'E5'],
    ['x35553', 'C'],
  ])('%s → %s', (frets, name) => {
    expect(recognizeChord(shape(frets))).toBe(name);
  });

  it('names single notes and returns null for nothing', () => {
    expect(recognizeChord([45])).toBe('A');
    expect(recognizeChord([])).toBeNull();
  });

  it('names notes with their octave', () => {
    expect(midiName(40)).toBe('E2');
    expect(midiName(64)).toBe('E4');
  });
});
