import { describe, expect, it } from 'vitest';
import { BELL, BELL_AXIS, HORN, KNUCKLE, MOUTHPIECE } from '../../src/horn/geometry.js';
import { createHornPose, HOLD_REACH, holdFrenchHorn } from '../../src/horn/hold.js';
import { handCover, noteName, soundingNote, WRITTEN_ABOVE } from '../../src/horn/playing.js';

describe('horn fingerings', () => {
  it('sounds the open notes of the B-flat horn and lowers them with the valves, written a fifth up', () => {
    expect(noteName(soundingNote(2, [false, false, false]))).toBe('Bb3');
    expect(noteName(soundingNote(2, [true, false, false]))).toBe('Ab3');
    expect(noteName(soundingNote(0, [true, true, true]))).toBe('E2');
    expect(noteName(soundingNote(5, [false, false, false]) + WRITTEN_ABOVE)).toBe('F5');
  });
});

describe('handCover', () => {
  it('covers more the deeper and more central the hand', () => {
    expect(handCover(-0.1, 0, HORN.bellRadius)).toBe(0);
    expect(handCover(0.05, 0.03, HORN.bellRadius)).toBeGreaterThan(0.3);
    expect(handCover(0.2, 0, HORN.bellRadius)).toBe(1);
    expect(handCover(0.1, HORN.bellRadius * 1.2, HORN.bellRadius)).toBe(0);
    expect(handCover(0.1, 0.02, HORN.bellRadius)).toBeGreaterThan(handCover(0.03, 0.02, HORN.bellRadius));
  });
});

describe('horn layout', () => {
  it('puts the bell behind the coils, out to the right and back', () => {
    expect(Math.hypot(...BELL_AXIS)).toBeCloseTo(1, 9);
    expect(BELL[0]).toBeGreaterThan(0.1);
    expect(BELL[2]).toBeGreaterThan(0);
  });

  it('brings the mouthpiece to the lips with the left hand at its reach', () => {
    const pose = createHornPose();
    const lips = [0, 1.5, 0];
    for (let i = 0; i < 20; i++) holdFrenchHorn(lips, [0, 1.5, -HOLD_REACH], [0, 0, -1], 0.1, pose);
    expect(pose.atLips).toBe(true);
    const rim = [0, 1, 2].map((k) => pose.origin[k] + pose.x[k] * MOUTHPIECE[0] + pose.y[k] * MOUTHPIECE[1] + pose.z[k] * MOUTHPIECE[2]);
    rim.forEach((v, k) => expect(v).toBeCloseTo(lips[k], 3));
    expect(HOLD_REACH).toBeCloseTo(Math.hypot(KNUCKLE[0], KNUCKLE[1], KNUCKLE[2] - MOUTHPIECE[2]), 9);
  });
});
