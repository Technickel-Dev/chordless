import { describe, expect, it } from 'vitest';
import { BASS, BASS_BOARD, BASS_VOICE } from '../../src/bass/geometry.js';
import { midiName } from '../../src/guitar/chords.js';
import { FretReader } from '../../src/guitar/fretting.js';
import { GUITAR_BOARD } from '../../src/guitar/geometry.js';
import { PluckDetector } from '../../src/guitar/pluck-detector.js';
import { applyImpact, freshDamage, newOutcome, Region, seededRandom } from '../../src/guitar/smash.js';
import { midiToHz, renderPluck } from '../../src/guitar/synth.js';

const { fretAt, fretMidX, fretX, nearestString, stringY } = BASS_BOARD;

describe('bass fretboard', () => {
  it('is a four-string in E1 A1 D2 G2', () => {
    expect(BASS_BOARD.stringCount).toBe(4);
    expect(BASS_BOARD.openMidi.map(midiName)).toEqual(['E1', 'A1', 'D2', 'G2']);
  });

  it('has a 30" scale, longer than the guitar, with wider frets', () => {
    expect(BASS.nutX - BASS.bridgeX).toBeCloseTo(0.762, 6);
    expect(fretX(0) - fretX(1)).toBeGreaterThan(GUITAR_BOARD.fretX(0) - GUITAR_BOARD.fretX(1));
    // The 12th fret is halfway.
    expect(fretX(12)).toBeCloseTo((BASS.nutX + BASS.bridgeX) / 2, 6);
  });

  it('reads every fret back from where a finger presses it', () => {
    for (let n = 1; n <= BASS.fretCount; n++) expect(fretAt(fretMidX(n))).toBe(n);
    expect(fretAt(BASS.nutX + 0.01)).toBe(0);
  });

  it('puts the low E on the +Y edge and finds each string', () => {
    const x = fretMidX(3);
    expect(stringY(0, x)).toBeGreaterThan(stringY(3, x));
    for (let s = 0; s < 4; s++) expect(nearestString(x, stringY(s, x))).toBe(s);
    // Strings sit further apart than the guitar's.
    expect(BASS_BOARD.stringSpacing(x)).toBeGreaterThan(GUITAR_BOARD.stringSpacing(x));
  });
});

describe('bass fretting', () => {
  it('reads one finger per string at its fret', () => {
    const reader = new FretReader(BASS_BOARD);
    reader.begin();
    for (const [s, n] of [[0, 3], [2, 5]]) reader.addPoint(fretMidX(n), stringY(s, fretMidX(n)), BASS.stringZ);
    reader.commit();
    expect(Array.from(reader.frets)).toEqual([3, 0, 5, 0]);
  });
});

describe('bass plucking', () => {
  it('plucks each of its four strings as the fingertip crosses them', () => {
    const d = new PluckDetector({ board: BASS_BOARD, smoothing: false });
    const plucked: number[] = [];
    const top = stringY(0, 0) + 0.02;
    const bottom = stringY(3, 0) - 0.02;
    for (let i = 0; i <= 40; i++) {
      d.update(0, top + ((bottom - top) * i) / 40, BASS.stringZ, 1 / 72);
      for (let e = 0; e < d.count; e++) plucked.push(d.events[e].string);
    }
    expect(plucked).toEqual([0, 1, 2, 3]);
  });

  it('plucks where the bass is played, not past its pluck zone', () => {
    const d = new PluckDetector({ board: BASS_BOARD });
    expect(d.zone.minX).toBeCloseTo(BASS.bridgeX + 0.012, 6);
    expect(d.zone.maxX).toBe(BASS.pluckMaxX);
  });
});

describe('bass smashing', () => {
  it('snaps the bass string nearest a hard hit', () => {
    const d = freshDamage(4);
    const out = applyImpact(d, 3, Region.Neck, fretMidX(5), stringY(3, fretMidX(5)), [], seededRandom(1), newOutcome(), BASS_BOARD);
    expect(out.snapped).toEqual([3]);
    expect(d.strings).toEqual([true, true, true, false]);
  });
});

describe('bass voice', () => {
  // Just enough of BaseAudioContext for renderPluck.
  const ctx = {
    sampleRate: 48000,
    createBuffer: (_channels: number, length: number, sampleRate: number) => {
      const data = new Float32Array(length);
      return { length, sampleRate, getChannelData: () => data };
    },
  } as unknown as BaseAudioContext;

  it('renders the low E for as long as its voice says, still sounding at the end', () => {
    const buffer = renderPluck(ctx, midiToHz(28), false, BASS_VOICE);
    expect(buffer.length).toBe(48000 * BASS_VOICE.noteSeconds);
    const data = buffer.getChannelData(0);
    const rms = (from: number, to: number) => {
      let sum = 0;
      for (let i = from; i < to; i++) sum += data[i] * data[i];
      return Math.sqrt(sum / (to - from));
    };
    // Rings for seconds: three seconds in, still well above silence.
    expect(rms(0, 4800)).toBeGreaterThan(0);
    expect(rms(144000, 148800)).toBeGreaterThan(rms(0, 4800) * 0.01);
  });
});
