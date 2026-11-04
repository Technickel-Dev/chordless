import { describe, expect, it } from 'vitest';
import { BRACE, KNUCKLE, MOUTHPIECE, TROMBONE } from '../../src/trombone/geometry.js';
import { createHornPose, HOLD_REACH, holdTrombone } from '../../src/trombone/hold.js';
import { noteName, pitchOf, positionOf, SlideReader, slideFor, slideSemitones } from '../../src/trombone/playing.js';

describe('slide positions', () => {
  it('lowers a semitone a position, further apart down the slide', () => {
    expect(slideSemitones(0)).toBe(0);
    for (let n = 1; n <= 6; n++) expect(slideSemitones(slideFor(n))).toBeCloseTo(n, 9);
    // Second position about 8 cm out, seventh about 57 cm.
    expect(slideFor(1)).toBeCloseTo(0.082, 3);
    expect(slideFor(6)).toBeCloseTo(0.57, 2);
    expect(slideFor(6) - slideFor(5)).toBeGreaterThan(slideFor(1));
    expect(slideFor(6)).toBeLessThan(TROMBONE.maxSlide);
    expect(positionOf(slideFor(3))).toBeCloseTo(4, 9);
  });

  it('gives each partial its notes', () => {
    expect(noteName(Math.round(pitchOf(2, 0)))).toBe('Bb3');
    expect(noteName(Math.round(pitchOf(2, slideFor(6))))).toBe('E3');
    expect(noteName(Math.round(pitchOf(0, slideFor(6))))).toBe('E2');
    expect(noteName(Math.round(pitchOf(5, 0)))).toBe('Bb4');
    // Halfway between positions is a quarter tone off: the slide is continuous.
    expect(pitchOf(2, (slideFor(1) + slideFor(2)) / 2) % 1).toBeCloseTo(0.5, 1);
  });
});

describe('SlideReader', () => {
  it('follows the fingertips on the brace and stays put when they let go', () => {
    const s = new SlideReader();
    expect(s.update([BRACE[0], BRACE[1], BRACE[2] - 0.2])).toBeCloseTo(0.2, 9);
    expect(s.holding).toBe(true);
    // Pushed past the stop it stays at the end; pulled back past closed, at first position.
    expect(s.update([BRACE[0], BRACE[1], BRACE[2] - 0.65])).toBe(TROMBONE.maxSlide);
    expect(s.update([BRACE[0], BRACE[1] + 0.01, BRACE[2] + 0.05])).toBe(0);
    s.update([BRACE[0], BRACE[1], BRACE[2] - 0.3]);
    // The hand off to the side lets go.
    expect(s.update([BRACE[0] + 0.2, BRACE[1], BRACE[2] - 0.1])).toBeCloseTo(0.3, 9);
    expect(s.holding).toBe(false);
  });
});

describe('holdTrombone', () => {
  const lips = [0, 1.5, 0];
  const forward = [0, 0, -1];

  it('brings the mouthpiece to the lips with the left hand at its reach', () => {
    const pose = createHornPose();
    const knuckle = [0, 1.5, -HOLD_REACH];
    for (let i = 0; i < 20; i++) holdTrombone(lips, knuckle, forward, 0.1, pose);
    expect(pose.atLips).toBe(true);
    const rim = [0, 1, 2].map((k) => pose.origin[k] + pose.x[k] * MOUTHPIECE[0] + pose.y[k] * MOUTHPIECE[1] + pose.z[k] * MOUTHPIECE[2]);
    rim.forEach((v, k) => expect(v).toBeCloseTo(lips[k], 3));
    expect(HOLD_REACH).toBeCloseTo(Math.hypot(KNUCKLE[0], KNUCKLE[1], KNUCKLE[2] - MOUTHPIECE[2]), 9);
  });

  it('tilts up with the hand and lets go of the lips held too far out', () => {
    const pose = createHornPose();
    const up = (20 * Math.PI) / 180;
    holdTrombone(lips, [0, 1.5 + Math.sin(up) * HOLD_REACH, -Math.cos(up) * HOLD_REACH], forward, 0.1, pose);
    expect(pose.elevation).toBeGreaterThan(15);
    holdTrombone(lips, [0, 1.5, -HOLD_REACH - 0.3], forward, 0.1, pose);
    expect(pose.atLips).toBe(false);
  });
});
