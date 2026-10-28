import { describe, expect, it } from 'vitest';
import { fretMidX, GUITAR, stringY } from '../../src/guitar/geometry.js';
import { FretReader, PRESS } from '../../src/guitar/fretting.js';

const onString = (s: number, fret: number, height = 0) =>
  [fretMidX(fret), stringY(s, fretMidX(fret)), GUITAR.stringZ + height] as const;

function read(reader: FretReader, points: (readonly [number, number, number])[], dt = 1 / 72) {
  reader.begin();
  for (const [x, y, z] of points) reader.addPoint(x, y, z);
  reader.commit(dt);
  return Array.from(reader.frets);
}

describe('FretReader', () => {
  it('reads an open C chord (x32010) from four fingertips', () => {
    const reader = new FretReader();
    const frets = read(reader, [onString(1, 3), onString(2, 2), onString(4, 1)]);
    expect(frets).toEqual([0, 3, 2, 0, 1, 0]);
  });

  it('plays the highest fret held on a string', () => {
    const reader = new FretReader();
    expect(read(reader, [onString(0, 3), onString(0, 5)])).toEqual([5, 0, 0, 0, 0, 0]);
  });

  it('reads a barre from points along the index finger', () => {
    const reader = new FretReader();
    const x = fretMidX(1);
    const barre = Array.from({ length: 12 }, (_, i) => {
      const y = stringY(0, x) + ((stringY(5, x) - stringY(0, x)) * i) / 11;
      return [x, y, GUITAR.stringZ + 0.004] as const;
    });
    // F major barre: 133211
    const frets = read(reader, [...barre, onString(1, 3), onString(2, 3), onString(3, 2)]);
    expect(frets).toEqual([1, 3, 3, 2, 1, 1]);
  });

  it('ignores fingers hovering above the strings or behind the neck', () => {
    const reader = new FretReader();
    expect(read(reader, [onString(2, 2, PRESS.above + 0.01)])).toEqual([0, 0, 0, 0, 0, 0]);
    const behind = [fretMidX(2), stringY(2, fretMidX(2)), GUITAR.boardTopZ - PRESS.below - 0.01] as const;
    expect(read(reader, [behind])).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('ignores a finger base tucked beside the neck under the treble edge', () => {
    const reader = new FretReader();
    const x = fretMidX(1);
    const besideNeck = [x, stringY(5, x) - 0.006, GUITAR.boardTopZ - 0.01] as const;
    expect(read(reader, [besideNeck])).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('accepts a fingertip just past the low E on top of the board', () => {
    const reader = new FretReader();
    const x = fretMidX(2);
    const overhang = [x, stringY(0, x) + 0.006, GUITAR.stringZ] as const;
    expect(read(reader, [overhang])).toEqual([2, 0, 0, 0, 0, 0]);
  });

  it('accepts fingers pushed through the virtual fretboard', () => {
    const reader = new FretReader();
    expect(read(reader, [onString(2, 2, -0.03)])).toEqual([0, 0, 2, 0, 0, 0]);
  });

  it('holds a fret through small lifts, then releases', () => {
    const reader = new FretReader();
    read(reader, [onString(3, 4)]);
    expect(read(reader, [onString(3, 4, PRESS.above + 0.004)])[3]).toBe(4);
    expect(read(reader, [onString(3, 4, PRESS.release + 0.005)], PRESS.releaseSeconds + 0.01)[3]).toBe(0);
  });

  it('rides out a brief tracking flicker off a held fret', () => {
    const reader = new FretReader();
    read(reader, [onString(2, 3)]);
    // Two frames with the finger lost, then back.
    expect(read(reader, [])[2]).toBe(3);
    expect(read(reader, [])[2]).toBe(3);
    expect(read(reader, [onString(2, 3)])[2]).toBe(3);
    // A real lift releases once it has lasted long enough.
    for (let i = 0; i < 6; i++) read(reader, []);
    expect(reader.frets[2]).toBe(0);
  });

  it('presses a higher fret immediately (hammer-on)', () => {
    const reader = new FretReader();
    read(reader, [onString(1, 2)]);
    expect(read(reader, [onString(1, 2), onString(1, 4)])[1]).toBe(4);
  });
});
