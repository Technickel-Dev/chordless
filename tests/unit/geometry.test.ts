import { describe, expect, it } from 'vitest';
import {
  fretAt,
  fretMidX,
  fretX,
  GUITAR,
  nearestString,
  stringY,
} from '../../src/guitar/geometry.js';

describe('fretboard geometry', () => {
  it('puts the 12th fret halfway between nut and bridge', () => {
    expect(fretX(12)).toBeCloseTo((GUITAR.nutX + GUITAR.bridgeX) / 2, 6);
  });

  it('maps every fret space back to its fret number', () => {
    for (let n = 1; n <= GUITAR.fretCount; n++) {
      expect(fretAt(fretMidX(n))).toBe(n);
      expect(fretAt(fretX(n) + 0.0005)).toBe(n);
      expect(fretAt(fretX(n - 1) - 0.0005)).toBe(n);
    }
  });

  it('returns 0 behind the nut and past the end of the board', () => {
    expect(fretAt(GUITAR.nutX + 0.01)).toBe(0);
    expect(fretAt(GUITAR.boardEndX - 0.01)).toBe(0);
  });

  it('finds the nearest string and rejects points off the neck', () => {
    const x = fretMidX(3);
    for (let s = 0; s < 6; s++) expect(nearestString(x, stringY(s, x))).toBe(s);
    expect(nearestString(x, stringY(0, x) + 0.05)).toBe(-1);
    expect(stringY(0, x)).toBeGreaterThan(stringY(5, x));
  });
});
