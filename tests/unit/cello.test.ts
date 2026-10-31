import { describe, expect, it } from 'vitest';
import { CELLO, CELLO_BOW, CELLO_GEOMETRY } from '../../src/cello/geometry.js';
import { BowContact, createBowPose } from '../../src/violin/bow.js';
import { StopReader } from '../../src/violin/stopping.js';

const { stopX, stringY, stringZ, stringFacing, nearestString, STRING_COUNT } = CELLO_GEOMETRY;

describe('cello geometry', () => {
  it('puts the C string on the player\'s left (-Y), the A on the right', () => {
    const x = stopX(2);
    expect(stringY(0, x)).toBeLessThan(0);
    expect(stringY(3, x)).toBeGreaterThan(0);
    expect(stringFacing(0)[0]).toBeLessThan(-0.3);
  });

  it('finds each string, and stops an octave halfway', () => {
    const x = stopX(5);
    for (let s = 0; s < STRING_COUNT; s++) expect(nearestString(x, stringY(s, x))).toBe(s);
    expect(CELLO_GEOMETRY.stopSemitones((CELLO.nutX + CELLO.bridgeX) / 2)).toBeCloseTo(12, 6);
  });
});

describe('cello bowing and stopping', () => {
  const X = CELLO.bridgeX + 0.05;
  const bowOn = (s: number, depth: number) => {
    const [fy, fz] = stringFacing(s);
    const along = [0, -fz, fy]; // the tip toward the C side
    const point = [X, stringY(s, X) - fy * depth, stringZ(s, X) - fz * depth];
    const pose = createBowPose();
    for (let k = 0; k < 3; k++) {
      pose.hair0[k] = point[k] - along[k] * 0.3;
      pose.hair1[k] = pose.hair0[k] + along[k] * CELLO_BOW.hairLength;
      pose.frog[k] = pose.hair0[k];
      pose.along[k] = along[k];
    }
    return pose;
  };

  it('sounds only the string the bow is square to', () => {
    for (let s = 0; s < STRING_COUNT; s++) {
      const bow = new BowContact(CELLO_GEOMETRY);
      bow.update(bowOn(s, 0.002), 1 / 72);
      expect(Array.from(bow.sounding)).toEqual([0, 1, 2, 3].map((i) => (i === s ? 1 : 0)));
    }
  });

  it('reads a stop on the D string', () => {
    const reader = new StopReader(CELLO_GEOMETRY);
    const x = stopX(4);
    reader.begin();
    reader.addPoint(x, stringY(2, x), stringZ(2, x) - 0.002);
    reader.commit(1 / 72, true, true);
    expect(Array.from(reader.semitones)).toEqual([0, 0, 4, 0]);
  });
});
