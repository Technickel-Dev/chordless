import { describe, expect, it } from 'vitest';
import { BowContact, bowPose, createBowPose, type BowPose } from '../../src/violin/bow.js';
import {
  MAX_STOP,
  nearestString,
  STRING_COUNT,
  stopSemitones,
  stopX,
  stringFacing,
  stringY,
  stringZ,
  VIOLIN,
} from '../../src/violin/geometry.js';
import { snapSemitone, StopReader } from '../../src/violin/stopping.js';

describe('violin geometry', () => {
  it('stops an octave halfway along the string', () => {
    expect(stopSemitones((VIOLIN.nutX + VIOLIN.bridgeX) / 2)).toBeCloseTo(12, 6);
    for (const n of [1, 2, 5, 7, 14]) expect(stopSemitones(stopX(n))).toBeCloseTo(n, 6);
  });

  it('reaches about two octaves up the fingerboard', () => {
    expect(MAX_STOP).toBeGreaterThan(24);
    expect(MAX_STOP).toBeLessThan(32);
  });

  it('arches the strings, the outer ones lower', () => {
    const x = VIOLIN.bridgeX + 0.01;
    expect(stringZ(0, x)).toBeLessThan(stringZ(1, x));
    expect(stringZ(3, x)).toBeLessThan(stringZ(2, x));
    expect(stringFacing(0)[0]).toBeGreaterThan(0.35); // G faces out toward +Y
    expect(stringFacing(3)[0]).toBeLessThan(-0.35);
  });

  it('finds the nearest string on the fingerboard', () => {
    const x = stopX(3);
    for (let s = 0; s < STRING_COUNT; s++) expect(nearestString(x, stringY(s, x))).toBe(s);
    expect(nearestString(x, stringY(0, x) + 0.02)).toBe(-1);
  });
});

describe('StopReader', () => {
  const press = (reader: StopReader, s: number, semitones: number, lift = -0.002) => {
    const x = stopX(semitones);
    reader.addPoint(x, stringY(s, x), stringZ(s, x) + lift);
  };

  it('plays the stop nearest the bridge, snapped to a semitone', () => {
    const reader = new StopReader();
    reader.begin();
    press(reader, 2, 2.2); // first finger, a little sharp of B
    press(reader, 2, 4.1); // second finger: C#
    reader.commit(1 / 72, true, true);
    expect(reader.semitones[2]).toBe(4);
    expect(reader.semitones[1]).toBe(0);
  });

  it('follows the finger exactly in free intonation', () => {
    const reader = new StopReader();
    reader.begin();
    press(reader, 1, 3.3);
    reader.commit(1 / 72, true, false);
    expect(reader.semitones[1]).toBeCloseTo(3.3, 4);
  });

  it('ignores a finger hovering over the strings', () => {
    const reader = new StopReader();
    reader.begin();
    press(reader, 0, 5, 0.03);
    reader.commit(1 / 72, true, true);
    expect(reader.semitones[0]).toBe(0);
  });

  it('keeps a note through a one-frame lift, then releases it', () => {
    const reader = new StopReader();
    reader.begin();
    press(reader, 3, 7);
    reader.commit(1 / 72, true, true);
    reader.begin();
    reader.commit(1 / 72, true, true);
    expect(reader.semitones[3]).toBe(7);
    for (let i = 0; i < 4; i++) {
      reader.begin();
      reader.commit(1 / 72, true, true);
    }
    expect(reader.semitones[3]).toBe(0);
  });

  it('holds a snapped note until the finger is clearly on the next one', () => {
    expect(snapSemitone(4.6, 4)).toBe(4);
    expect(snapSemitone(4.75, 4)).toBe(5);
    expect(snapSemitone(2.4, 0)).toBe(2);
  });
});

describe('BowContact', () => {
  const X = VIOLIN.bridgeX + 0.025;

  /** A bow square to string `s` at X (turned `tilt` toward the G side), pressed `depth` into it, slid `slide` along itself. */
  const bowOn = (s: number, depth: number, slide = 0, tilt = 0): BowPose => {
    const [fy, fz] = stringFacing(s);
    const c = Math.cos(tilt);
    const sn = Math.sin(tilt);
    // Facing rotated by `tilt`, and the hair square to it in the YZ plane.
    const ny = fy * c - fz * sn;
    const nz = fy * sn + fz * c;
    const along: [number, number, number] = [0, nz, -ny];
    const point = [X, stringY(s, X) - ny * depth, stringZ(s, X) - nz * depth];
    const pose = createBowPose();
    for (let k = 0; k < 3; k++) {
      pose.hair0[k] = point[k] - along[k] * (0.3 + slide);
      pose.hair1[k] = pose.hair0[k] + along[k] * 0.65;
      pose.frog[k] = pose.hair0[k];
      pose.along[k] = along[k];
    }
    return pose;
  };

  it('sounds only the string the bow is square to', () => {
    for (let s = 0; s < STRING_COUNT; s++) {
      const bow = new BowContact();
      bow.update(bowOn(s, 0.002), 1 / 72);
      expect(Array.from(bow.sounding)).toEqual([0, 1, 2, 3].map((i) => (i === s ? 1 : 0)));
    }
  });

  it('sounds two strings with the bow tilted between them', () => {
    const bow = new BowContact();
    const between = Math.atan2(stringFacing(1)[0], stringFacing(1)[1]) - Math.atan2(stringFacing(2)[0], stringFacing(2)[1]);
    bow.update(bowOn(2, 0.002, 0, -between / 2), 1 / 72);
    expect(Array.from(bow.sounding)).toEqual([0, 1, 1, 0]);
  });

  it('is silent with the bow lifted off the strings', () => {
    const bow = new BowContact();
    bow.update(bowOn(1, -0.01), 1 / 72);
    expect(bow.touching).toBe(false);
    expect(Array.from(bow.sounding)).toEqual([0, 0, 0, 0]);
  });

  it('measures bow speed along the bow and counts strokes at each change of direction', () => {
    const bow = new BowContact();
    const dt = 1 / 72;
    let slide = 0;
    const draw = (speed: number, frames: number) => {
      for (let i = 0; i < frames; i++) {
        slide += speed * dt;
        bow.update(bowOn(2, 0.002, slide), dt);
      }
    };
    draw(0.4, 30); // down-bow... toward the frog end of the hair
    expect(Math.abs(bow.velocity)).toBeGreaterThan(0.3);
    expect(bow.strokes).toBe(1);
    draw(-0.4, 30);
    expect(bow.strokes).toBe(2);
    expect(bow.contactX[2]).toBeCloseTo(X, 3);
  });

  it('holds the bow across a right hand, hair on the palm side', () => {
    // A right hand palm down, fingers forward (-Z), thumb and index to the left (-X).
    const joints = new Float32Array(25 * 3);
    const set = (j: number, x: number, y: number, z: number) => joints.set([x, y, z], j * 3);
    set(0, 0, 0, 0); // wrist
    set(4, -0.05, -0.03, -0.07); // thumb tip, under the frog
    set(6, -0.03, 0, -0.09); // index knuckle
    set(11, -0.01, 0, -0.095); // middle knuckle
    set(12, -0.01, -0.015, -0.13); // middle finger's middle joint
    set(21, 0.035, 0, -0.08); // pinky knuckle
    const pose = bowPose(joints, createBowPose());
    expect(pose.along[0]).toBeLessThan(-0.9); // the tip points to the player's left
    expect(pose.hairSide[1]).toBeLessThan(-0.9); // the hair hangs below the stick
    expect(pose.hair1[0] - pose.hair0[0]).toBeLessThan(-0.55);
  });
});

describe('BowContact tracking jumps', () => {
  it('does not count a jump in hand tracking as a stroke', () => {
    const bow = new BowContact();
    const pose = createBowPose();
    const place = (x: number, y: number, z: number) => {
      pose.along.splice(0, 3, 0, 1, 0);
      pose.frog.splice(0, 3, x, y, z);
      pose.hair0.splice(0, 3, x, y, z);
      pose.hair1.splice(0, 3, x, y + 0.65, z);
    };
    place(0.025, -0.3, 0.1);
    bow.update(pose, 1 / 72);
    // Tracking jumps the bow 40 cm in one frame, onto the strings.
    place(0.025, -0.3 + 0.4, 0.034);
    bow.update(pose, 1 / 72);
    expect(bow.velocity).toBe(0);
    expect(bow.strokes).toBe(0);
  });
});

describe('BowContact strokes', () => {
  it('does not count tracking jitter on a resting bow as strokes', () => {
    const bow = new BowContact();
    const pose = createBowPose();
    const X = VIOLIN.bridgeX + 0.025;
    const [fy, fz] = stringFacing(2);
    const point = [X, stringY(2, X) - fy * 0.0015, stringZ(2, X) - fz * 0.0015];
    let seed = 7;
    const jitter = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.001;
    for (let i = 0; i < 120; i++) {
      const along = [0, fz, -fy];
      for (let k = 0; k < 3; k++) {
        pose.along[k] = along[k];
        pose.hair0[k] = point[k] - along[k] * 0.3 + jitter();
        pose.hair1[k] = pose.hair0[k] + along[k] * 0.65;
        pose.frog[k] = pose.hair0[k];
      }
      bow.update(pose, 1 / 72);
    }
    expect(bow.touching).toBe(true);
    expect(bow.strokes).toBe(0);
  });
});
