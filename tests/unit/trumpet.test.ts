import { describe, expect, it } from 'vitest';
import { createHornPose, HOLD_REACH, holdHorn } from '../../src/trumpet/hold.js';
import {
  airFromPinch,
  Breath,
  fingeringName,
  noteName,
  PARTIAL_CENTERS,
  PartialSelector,
  plungerAmount,
  writtenNote,
} from '../../src/trumpet/playing.js';

describe('fingerings', () => {
  it('gives the written notes of the open partials and lowers them with valves', () => {
    expect(noteName(writtenNote(2, [false, false, false]))).toBe('C5');
    expect(noteName(writtenNote(2, [true, false, false]))).toBe('Bb4');
    expect(noteName(writtenNote(0, [true, true, true]))).toBe('F#3');
    expect(fingeringName([true, false, true])).toBe('1-3');
    expect(fingeringName([false, false, false])).toBe('0');
  });
});

describe('PartialSelector', () => {
  it('needs to pass the edge of a band to change', () => {
    const s = new PartialSelector();
    expect(s.update(PARTIAL_CENTERS[3])).toBe(3);
    // Just past the band edge is not enough...
    expect(s.update(PARTIAL_CENTERS[3] + 7)).toBe(3);
    // ...past it by the hysteresis is.
    expect(s.update(PARTIAL_CENTERS[3] + 9)).toBe(4);
    expect(s.update(PARTIAL_CENTERS[3] + 5)).toBe(4);
    expect(s.update(-90)).toBe(0);
  });
});

describe('Breath', () => {
  it('tongues once per pinch and only at the lips', () => {
    expect(airFromPinch(0.1)).toBe(0);
    expect(airFromPinch(0)).toBe(1);
    const b = new Breath();
    b.update(0.01, false);
    expect(b.blowing).toBe(false);
    b.update(0.01, true);
    expect(b.tongued).toBe(true);
    b.update(0.01, true);
    expect(b.tongued).toBe(false);
    expect(b.blowing).toBe(true);
    b.update(0.08, true);
    expect(b.blowing).toBe(false);
    b.update(0.01, true);
    expect(b.notes).toBe(2);
  });
});

describe('plunger', () => {
  it('shuts close in front of the bell and does nothing to the side', () => {
    expect(plungerAmount(0.01, 0, 0.06)).toBeCloseTo(1);
    expect(plungerAmount(0.2, 0, 0.06)).toBe(0);
    expect(plungerAmount(0.01, 0.2, 0.06)).toBe(0);
  });
});

describe('holdHorn', () => {
  it('meets the lips when held out at its length and tilts with the hand', () => {
    const pose = createHornPose();
    const lips = [0, 1.5, 0];
    const fwd = [0, 0, -1];
    holdHorn(lips, [0.05, 1.5, -HOLD_REACH], fwd, 1, pose);
    expect(pose.atLips).toBe(true);
    const level = pose.elevation;
    holdHorn(lips, [0.05, 1.6, -HOLD_REACH], fwd, 1, pose);
    expect(pose.elevation).toBeGreaterThan(level + 10);
    // Held at the side, it rides in the hand.
    holdHorn(lips, [0.3, 1.0, 0], fwd, 1, pose);
    expect(pose.atLips).toBe(false);
  });

  it('keeps the grip where the hand closed, so it can range from there', () => {
    const pose = createHornPose();
    const lips = [0, 1.5, 0];
    const fwd = [0, 0, -1];
    // Closed 6 cm farther out than the rest spot.
    holdHorn(lips, [0, 1.5, -HOLD_REACH - 0.06], fwd, 1, pose);
    expect(pose.atLips).toBe(true);
    expect(pose.grip).toBeCloseTo(0.06, 6);
    // 12 cm out is past the usual reach, but within range of where it was gripped.
    holdHorn(lips, [0, 1.5, -HOLD_REACH - 0.12], fwd, 1, pose);
    expect(pose.atLips).toBe(true);
    // Taking the hand away lets go and the grip eases back.
    holdHorn(lips, [0.3, 1.0, 0], fwd, 1, pose);
    expect(pose.atLips).toBe(false);
    for (let i = 0; i < 20; i++) holdHorn(lips, [0.3, 1.0, 0], fwd, 0.1, pose);
    expect(pose.grip).toBeCloseTo(0, 3);
  });
});
