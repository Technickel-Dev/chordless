/**
 * Where the score's beats fall in a canvas take (video/capture/lib.mjs):
 * from the take's 'perform' mark and the performer's clock log. Shared by
 * video/build.mjs and the sync check (node video/sync.mjs <take>).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BEAT, secondsOfBeat, trailerPart } from './score.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const TAKES = path.join(HERE, 'build', 'takes');

export const readTake = (name) => JSON.parse(readFileSync(path.join(TAKES, `${name}.json`), 'utf8'));

/** Linear interpolation through [x, y] pairs sorted by x (clamped slope-1 extrapolation at the ends). */
export function interp(pairs, x, xi = 0, yi = 1) {
  if (x <= pairs[0][xi]) return pairs[0][yi] - (pairs[0][xi] - x);
  const last = pairs.at(-1);
  if (x >= last[xi]) return last[yi] + (x - last[xi]);
  let lo = 0;
  let hi = pairs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pairs[mid][xi] <= x) lo = mid;
    else hi = mid;
  }
  const a = pairs[lo];
  const b = pairs[hi];
  const f = (x - a[xi]) / (b[xi] - a[xi] || 1);
  return a[yi] + (b[yi] - a[yi]) * f;
}

/**
 * The take's map from trailer time (s from bar 226) to take time (s), for
 * its `n`th performance. A performer's clock reads leadIn at its first
 * event and moves with the beat from there; the log says when, in the
 * take, the clock read what.
 */
export function beatMap(take, n = 0) {
  const marks = take.marks.filter((m) => m.what === 'perform');
  const m = marks[n];
  const ticks = take.ticks[n].map(([ms, clock]) => [clock, ms / 1000]);
  const spb = 60 / m.tempo;
  const t0 = secondsOfBeat(m.firstBeat); // trailer time of the first event
  /** Take time of trailer time `s`. */
  const at = (s) => interp(ticks, m.leadIn + (s - t0) * (spb / BEAT));
  /** Trailer time of take time `c` (inverse; from the same log). */
  const inv = (c) => t0 + (interp(ticks, c, 1, 0) - m.leadIn) / (spb / BEAT);
  return { at, inv, first: t0, last: inv(ticks.at(-1)[1]), mark: m };
}

/** Onsets in a take's sound: times where the level jumps, with their strength (dB rise). */
export function onsets(take, from = 0, to = Infinity, { rate = 4000, hop = 0.005, rise = 9 } = {}) {
  const args = ['-hide_banner', '-loglevel', 'error', '-ss', String(from)];
  if (Number.isFinite(to)) args.push('-t', String(to - from));
  args.push('-i', path.join(TAKES, `${take}.audio.wav`), '-ac', '1', '-ar', String(rate), '-f', 's16le', '-');
  const r = spawnSync('ffmpeg', args, { maxBuffer: 1 << 30 });
  const pcm = new Int16Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length >> 1);
  const n = Math.round(rate * hop);
  const db = [];
  for (let i = 0; i + n <= pcm.length; i += n) {
    let e = 0;
    for (let k = i; k < i + n; k++) e += pcm[k] * pcm[k];
    db.push(10 * Math.log10(e / n + 1));
  }
  const out = [];
  const back = Math.round(0.03 / hop);
  for (let i = back; i < db.length; i++) {
    const before = Math.min(...db.slice(i - back, i - back + 2));
    if (db[i] - before > rise && db[i] > 35 && (!out.length || from + i * hop - out.at(-1).t > 0.06)) out.push({ t: from + i * hop, rise: db[i] - before, db: db[i] });
  }
  return out;
}

/**
 * How far a take's sound sits behind its performer's clock, in seconds, for
 * its `n`th performance: the shift that best lines the score's notes up with
 * the rises in the take's sound, all notes at once (so a dense part, where
 * the nearest onset is often a neighbour's, still gives a clean answer).
 * The capture's audio delay is not the same from run to run, so each take
 * is measured. `score` is how much better the best shift fits than the
 * average one; a low score (a smooth, bowed part) means the answer is weak.
 */
export function soundLag(name, n = 0, { from = -0.15, to = 0.2, step = 0.0025 } = {}) {
  const take = readTake(name);
  const m = take.marks.filter((x) => x.what === 'perform')[n];
  const map = beatMap(take, n);
  const times = trailerPart(m.inst)
    .events.map((e) => secondsOfBeat(e.beat))
    .filter((t) => t >= map.first - 1e-6 && t <= map.last)
    .map((t) => map.at(t));
  const t0 = Math.max(0, times[0] - 1);
  const t1 = times.at(-1) + 0.6;
  const rate = 4000;
  const hop = 0.0025;
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', String(t0), '-t', String(t1 - t0), '-i', path.join(TAKES, `${name}.audio.wav`), '-ac', '1', '-ar', String(rate), '-f', 's16le', '-'], { maxBuffer: 1 << 30 });
  const pcm = new Int16Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length >> 1);
  const k = Math.round(rate * hop);
  const db = [];
  for (let i = 0; i + k <= pcm.length; i += k) {
    let e = 0;
    for (let j = i; j < i + k; j++) e += pcm[j] * pcm[j];
    db.push(10 * Math.log10(e / k + 1));
  }
  // Onset strength: how much louder than a moment ago.
  const rise = db.map((v, i) => (i < 4 ? 0 : Math.max(0, v - Math.max(db[i - 4], db[i - 3]))));
  const fit = (lag) => {
    let sum = 0;
    for (const t of times) {
      const i = Math.round((t + lag - t0) / hop);
      for (let d = -2; d <= 2; d++) sum += rise[i + d] ?? 0;
    }
    return sum;
  };
  const scores = [];
  for (let lag = from; lag <= to + 1e-9; lag += step) scores.push([lag, fit(lag)]);
  const best = scores.reduce((a, b) => (b[1] > a[1] ? b : a));
  const mean = scores.reduce((a, b) => a + b[1], 0) / scores.length;
  return { lag: best[0], score: best[1] / (mean || 1), notes: times.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const name = process.argv[2];
  const take = readTake(name);
  const { trailerPart } = await import('./score.mjs');
  const m = take.marks.find((x) => x.what === 'perform');
  const map = beatMap(take);
  const song = trailerPart(m.inst);
  const events = song.events.filter((e) => secondsOfBeat(e.beat) >= map.first - 1e-6 && secondsOfBeat(e.beat) <= map.last);
  const found = onsets(name, map.at(map.first) - 1, map.at(map.last) + 0.5);
  const errs = [];
  for (const e of events.slice(0, 400)) {
    const want = map.at(secondsOfBeat(e.beat));
    const near = found.reduce((best, o) => (Math.abs(o.t - want) < Math.abs(best.t - want) ? o : best), { t: Infinity });
    if (Math.abs(near.t - want) < 0.08) errs.push(near.t - want);
  }
  errs.sort((a, b) => a - b);
  const med = errs[errs.length >> 1];
  console.log(name, `${events.length} notes, ${found.length} onsets, ${errs.length} matched; sound minus clock: median ${(med * 1000).toFixed(0)} ms, 10-90% ${(errs[Math.floor(errs.length * 0.1)] * 1000).toFixed(0)}..${(errs[Math.floor(errs.length * 0.9)] * 1000).toFixed(0)} ms`);
  const L = soundLag(name);
  console.log(`whole-take fit: sound ${(L.lag * 1000).toFixed(0)} ms behind the clock (fit ${L.score.toFixed(2)}x the average, ${L.notes} notes)`);
  console.log('drift (clock vs ideal tempo):', ((map.at(map.last) - map.at(map.first)) / (map.last - map.first) - 1) * 100, '%');
}
