#!/usr/bin/env node
/**
 * Builds the first-pass rough cut: node video/build.mjs [--keep]
 *
 * Reads the takes in video/build/takes (video/capture/take.mjs), the voiceover
 * in video/build/vo (video/vo.ps1) and the hand-picked in-points in
 * video/cuts.json; renders text cards for every AI clip; cuts the segments
 * with ffmpeg; mixes the audio; writes video/build/first-pass.mp4 and
 * video/build/timeline.json (every cut, with its time, so edits can be asked
 * for by timestamp).
 *
 * The timeline follows video/script.md. Times are computed here, from the
 * voiceover lengths and from the bars of the score, so they are close to
 * edit-plan.yaml's but not the same.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderCards, renderSteam, W, H } from './cards.mjs';
import { barTime, ENTRANCES, MONTAGE, SCENE_RUN, END_BAR } from './score.mjs';
import { beatMap, readTake, onsets, interp } from './sync.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const B = path.join(HERE, 'build');
const TAKES = path.join(B, 'takes');
const VO = path.join(B, 'vo');
const SEG = path.join(B, 'segments');
const CARDS = path.join(B, 'cards');
mkdirSync(SEG, { recursive: true });
const FPS = 30;
const BAR = 60 / 152 * 2; // one bar of the finale, 0.78947 s
const cuts = existsSync(path.join(HERE, 'cuts.json')) ? JSON.parse(readFileSync(path.join(HERE, 'cuts.json'), 'utf8')) : {};
const vo = JSON.parse(readFileSync(path.join(HERE, 'vo-lines.json'), 'utf8'));

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...opts });
  if (r.status !== 0 && !opts.soft) throw new Error(`${cmd} ${args.join(' ').slice(0, 300)}\n${(r.stderr ?? '').slice(-1500)}`);
  return r;
};
const probe = (file) => Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).stdout);

// ------------------------------------------------------------------ takes
/** When each take's first sound is, in its audio, and how its audio lines up with its picture. */
function analyse(name) {
  const meta = JSON.parse(readFileSync(path.join(TAKES, `${name}.json`), 'utf8'));
  const audio = path.join(TAKES, `${name}.audio.wav`);
  let onset = 0;
  if (existsSync(audio)) {
    const r = run('ffmpeg', ['-hide_banner', '-i', audio, '-af', 'silencedetect=n=-42dB:d=0.6', '-f', 'null', '-'], { soft: true });
    const m = /silence_end: ([\d.]+)/.exec(r.stderr);
    // A take that starts with sound has no silence_end before its first sound.
    const lead = /silence_start: ([\d.-]+)/.exec(r.stderr);
    onset = m && lead && Number(lead[1]) <= 0.05 ? Number(m[1]) : 0;
  }
  const videoFile = path.join(TAKES, `${name}.webm`);
  return { ...meta, audioFile: audio, videoFile, onset, videoLen: probe(videoFile), audioLen: existsSync(audio) ? probe(audio) : 0, offset: meta.audioStart && meta.videoStart ? (meta.audioStart - meta.videoStart) / 1000 : 0 };
}

/** Where, in a take's audio, sound first starts after `aT` seconds. */
function soundAfter(k, aT) {
  const r = run('ffmpeg', ['-hide_banner', '-ss', String(Math.max(0, aT)), '-i', k.audioFile, '-af', 'silencedetect=n=-42dB:d=0.3', '-f', 'null', '-'], { soft: true });
  const end = /silence_end: ([\d.]+)/.exec(r.stderr);
  const start = /silence_start: ([\d.-]+)/.exec(r.stderr);
  return end && start && Number(start[1]) <= 0.15 ? aT + Number(end[1]) : aT;
}

/** The meltdown take's moments (seconds into the take), from its marks and the performers' clocks. */
function meltdownMarks() {
  const take = readTake('meltdown');
  const sec = (w) => take.marks.find((m) => m.what === w).t / 1000;
  const ode = take.marks.filter((m) => m.what === 'perform')[0];
  const ticks = take.ticks[0].map(([ms, clock]) => [clock, ms / 1000]);
  const ofClock = (clock) => interp(ticks, clock);
  const spb = 60 / ode.tempo;
  const wt = beatMap(take, 1);
  const md = {
    vTune: ofClock(ode.leadIn),
    vFlub: ofClock(ode.leadIn + (ode.flubBeat - ode.firstBeat) * spb),
    vGrip: sec('grip'),
    vShakeEnd: sec('shakingDone'),
    hits: take.marks.filter((m) => m.what === 'impact').map((m) => m.t / 1000),
    vWreck: sec('wrecked'),
    vMenu: sec('menuStart'),
    vChosen: sec('trumpetChosen'),
    vWt: wt.at(0),
    wt,
  };
  console.log('meltdown', JSON.stringify({ ...md, wt: undefined }));
  return md;
}

/** A piecewise-linear expression through [time, value] keys, in the variable `tv`. */
const kf = (keys, tv) => {
  let e = String(keys.at(-1)[1]);
  for (let i = keys.length - 2; i >= 0; i--) {
    const [t0, a0] = keys[i];
    const [t1, a1] = keys[i + 1];
    e = `if(lt(${tv},${t1.toFixed(3)}),${a0}+(${a1}-${a0})*(${tv}-${t0.toFixed(3)})/${Math.max(0.001, t1 - t0).toFixed(3)},${e})`;
  }
  return `if(lt(${tv},${keys[0][0].toFixed(3)}),${keys[0][1]},${e})`;
};

/** Each instrument's first beat in the finale (beat 0 = bar 244), from its song. */
async function firstBeats() {
  const songs = await import(pathToFileURL(path.join(HERE, '..', 'tests', 'songs', 'william-tell.js')).href);
  const first = (s) => Math.min(...s.events.map((e) => e.beat));
  return {
    'wt-guitar': first(songs.WILLIAM_TELL),
    'wt-trumpet': first(songs.WILLIAM_TELL_TRUMPET),
    'wt-cello': first(songs.WILLIAM_TELL_CELLO),
    'wt-violin': first(songs.WILLIAM_TELL_VIOLIN),
    'wt-piano': first(songs.WILLIAM_TELL_PIANO),
    'wt-drums': first(songs.WILLIAM_TELL_DRUMS),
    'wt-triangle': first(songs.WILLIAM_TELL_TRIANGLE),
    'wt-cymbals': first(songs.WILLIAM_TELL_CYMBALS),
  };
}

// ------------------------------------------------------------------ build
const have = (name) => existsSync(path.join(TAKES, `${name}.webm`));
const takes = {};
const beats = await firstBeats();
for (const name of Object.keys(beats)) if (have(name)) takes[name] = { ...analyse(name), firstBeat: beats[name] };
for (const name of ['meltdown']) if (have(name)) takes[name] = { ...analyse(name), firstBeat: beats['wt-trumpet'] };
/** Seconds after the finale's first bar that a take's first note sounds. */
const firstNoteOffset = (name) => (takes[name] ? (takes[name].firstBeat - beats['wt-guitar']) * 60 / 152 : 0);
for (const f of (existsSync(TAKES) ? (await import('node:fs')).readdirSync(TAKES) : []))
  if (/^(orch|crash|scn)-.*\.json$/.test(f)) {
    const name = f.slice(0, -5);
    if (existsSync(path.join(TAKES, `${name}.webm`))) takes[name] = { name, videoFile: path.join(TAKES, `${name}.webm`), audioFile: path.join(TAKES, `${name}.audio.wav`) };
  }
for (const f of (existsSync(TAKES) ? (await import('node:fs')).readdirSync(TAKES) : []))
  if (/^(smash|env)-.*\.json$/.test(f)) takes[f.replace('.json', '')] = analyse(f.replace('.json', ''));

const dur = (id) => probe(path.join(VO, `${id}.wav`));
const timeline = []; // { t, dur, label, ... } picture segments in order
const overlays = []; // { id, t0, t1 }
const audio = []; // { file, ss, dur, at, vol, fade }
const cardList = [];
const card = (c) => (cardList.push(c), c.id);
let T = 0;
const seg = (s) => {
  timeline.push({ ...s, t: T });
  T += s.dur;
  return T - s.dur;
};
const voAt = (id, at, vol = 1) => audio.push({ file: path.join(VO, `${id}.wav`), ss: 0, dur: dur(id), at, vol, kind: 'vo' });
const sub = (id, at) => {
  const d = dur(id);
  overlays.push({ id: card({ id: `sub-${id}`, kind: 'sub', text: vo[id] }), t0: at, t1: at + d });
};
const ai = (shot, d) => seg({ kind: 'png', id: card({ id: `ai-${shot}`, kind: 'ai', shot }), dur: d, label: `AI ${shot}` });
/** A take's picture at score time `m` (seconds into the clip that began at its first note). */
const takeAtAudio = (t, a) => t.offset + a;

// ---- beat 1: the conductor of AI (0:00 - about 0:33)
ai('1-1', 3.0);
{
  const d = dur('vo-1-2') + 0.7;
  const t0 = seg({ kind: 'png', id: card({ id: 'ai-1-2', kind: 'ai', shot: '1-2' }), dur: d, label: 'AI 1-2' });
  voAt('vo-1-2', t0 + 0.3);
  sub('vo-1-2', t0 + 0.3);
}
for (const [shot, id] of [['1-3', 'vo-1-3'], ['1-4', 'vo-1-4'], ['1-5', 'vo-1-5'], ['1-6', 'vo-1-6']]) {
  const d = Math.max(3.0, dur(id) + 0.8);
  const t0 = ai(shot, d);
  voAt(id, t0 + 0.25);
  sub(id, t0 + 0.25);
}
{
  const t0 = ai('1-7', dur('vo-1-7') + 1.2);
  voAt('vo-1-7', t0 + 0.8);
  sub('vo-1-7', t0 + 0.8);
}
const md = takes.meltdown ? meltdownMarks() : null;
/** A canvas take's sound runs this far behind its picture (measured with video/sync.mjs). */
const AUDIO_LAG = 0.055;
{
  // The title card, over the idle theatre just before the tune.
  const v = md ? Math.max(0, md.vTune - 2.9) : 0;
  const t0 = seg({ kind: 'take', take: 'meltdown', at: v, dur: 2.4, grade: 'eq=brightness=-0.35', label: 'title card, over the theatre' });
  overlays.push({ id: card({ id: 'title-chordless', kind: 'title', text: ['CHORDLESS', 'Air instruments for Meta Quest. Played with your bare hands.'] }), t0, t1: t0 + 2.4 });
  voAt('vo-1-8', t0 + 0.3);
  sub('vo-1-8', t0 + 0.3);
}
const tapT = T + 0.0;
ai('1-9', 3.0);
for (const k of [0, 1, 2]) audio.push({ kind: 'tap', at: tapT + 1.2 + k * 0.6, dur: 0.08, vol: 0.9 });

// ---- one unbroken take in the theatre. The tune's first phrase (no voiceover),
// its last note wrong, a short fury (shake, red, steam), the guitar smashed in
// overhead swings, then the menu, and the trumpet picked from it.
const TUNE_START = T;
let T0 = 0; // the score clock: bar 226, the trumpet's first note
let tW = 0;
let tWreck = 0;
const mseg = (v0, v1, extra = {}) => seg({ kind: 'take', take: 'meltdown', at: v0, dur: v1 - v0, ...extra });
if (md) {
  const a0 = md.vTune - 0.5;
  const tA = mseg(a0, md.vFlub - 0.05, { label: 'the tune, in the theatre' });
  overlays.push({ id: card({ id: 'lower-guitar', kind: 'lower', text: ['GUITAR · Theatre'] }), t0: tA + 0.4, t1: tA + 3.4 });
  // The wrong note: a punch, a red flash. The rage starts here and not before.
  const tFlub = T + 0.05;
  const spike = (t, amp, len = 0.5) => [[t - 0.001, 0], [t, amp], [t + len, 0]];
  mseg(md.vFlub - 0.05, md.vFlub + 0.8, { label: 'the wrong note', shake: [[0, 0], ...spike(tFlub, 46, 0.6)] });
  overlays.push({ id: card({ id: 'red-flash', kind: 'redflash' }), t0: tFlub, t1: tFlub + 0.5, fade: { out: 0.45 } });
  const tRageStart = tFlub;
  const gripV = md.vGrip - 0.45;
  mseg(md.vFlub + 0.8, gripV, { label: 'silence; the red begins', rageKeys: true });
  const tD = mseg(gripV, md.vShakeEnd, { label: 'the fist shakes', rageKeys: true });
  const tE = mseg(md.vShakeEnd, md.vWreck, { label: 'the overhead swings', rageKeys: true });
  tWreck = T;
  // The wreck, the menu, the trumpet chosen: all one clip, to the trumpet's first note.
  mseg(md.vWreck, md.vWt, { label: 'the wreck; the menu; the trumpet' });
  tW = T;
  overlays.push({ id: card({ id: 'slam-destruction', kind: 'slam', text: 'FULL DESTRUCTION' }), t0: tWreck - 0.3, t1: tWreck + 2.6 });
  const keys = {
    rage: [[tRageStart, 0], [tD, 0.6], [tE, 1], [tWreck, 1], [tWreck + 1.4, 0]],
    shake: [[tRageStart, 0], [tD, 3], [tE, 20], [tWreck, 22], [tWreck + 0.4, 0]],
    spikes: md.hits.map((h) => tE + (h - md.vShakeEnd)).filter((t) => t >= tE && t <= tWreck),
  };
  for (const s of timeline) if (s.rageKeys) Object.assign(s, { rage: keys.rage, shake: keys.shake.map((p) => [...p]), spikes: keys.spikes });
  overlays.push({ id: card({ id: 'red-vig', kind: 'redvig' }), t0: tRageStart, t1: tWreck + 1.6, fade: { in: tE - tRageStart, out: 1.4 } });
  overlays.push({ id: 'STEAM', steam: true, t0: tD - 0.4, t1: tWreck + 0.6, fade: { in: 1.6, out: 0.6 } });
  T0 = tW;
} else {
  ai('c-1', 17);
  tW = T;
  T0 = T;
}
/** Timeline time of a trailer bar. */
const at = (bar) => T0 + barTime(bar);
const PEAK = at(226);
const CHORD = barTime(END_BAR);

// ---- where each take is at a trailer time, drift and all (video/sync.mjs)
const maps = {};
const mapOf = (name) => (name === 'meltdown' ? md.wt : (maps[name] ??= beatMap(readTake(name), 0)));
/** A take's picture covering trailer times [s0, s1]: where to start, how much, how fast. */
const source = (name, s0, s1) => {
  const m = mapOf(name);
  const c0 = m.at(s0);
  const c1 = m.at(s1);
  return { file: takes[name].videoFile, at: c0, len: c1 - c0, rate: (c1 - c0) / (s1 - s0) };
};
/** The next cut: a take covering trailer times [s0, s1], conformed to the score's tempo. */
const tseg = (name, s0, s1, extra = {}) => {
  const src = source(name, s0, s1);
  return seg({ kind: 'take', take: name, at: src.at, dur: s1 - s0, slow: src.rate, ...extra });
};
const NAMES = { trumpet: 'TRUMPET', guitar: 'GUITAR', violin: 'VIOLIN', cello: 'CELLO', piano: 'PIANO', drums: 'DRUMS', triangle: 'TRIANGLE', cymbals: 'CYMBALS' };
const takeOf = (inst) => (inst === 'trumpet' && md ? 'meltdown' : `orch-${inst}`);
const hasTake = (name) => (name === 'meltdown' ? !!md : !!takes[name]);
const ORDER = ENTRANCES.map(([inst]) => inst);
const centerCard = card({ id: 'ai-c-grid', kind: 'ai', shot: 'c-grid' });

// ---- William Tell. The trumpet alone in the theatre; then, four bars apart,
// the rest of the orchestra comes in on the same stage, each in a tile.
const joins = ENTRANCES.map(([, bar]) => at(bar) - 0.3);
joins[0] = tW;
{
  const gridStart = joins[1] - 0.4;
  const gridEnd = at(MONTAGE.from);
  if (md) tseg('meltdown', 0, gridStart - T0, { label: 'William Tell: the trumpet alone' });
  else ai('c-1', gridStart - T);
  overlays.push({ id: card({ id: 'lower-trumpet', kind: 'lower', text: ['TRUMPET · Theatre', 'chosen from the menu, live'] }), t0: tW + 0.4, t1: tW + 3.6 });
  const sources = ORDER.map((inst, i) => {
    if (inst === 'CENTER') return { card: centerCard };
    const name = takeOf(inst);
    return hasTake(name) ? source(name, Math.max(joins[i], gridStart) - T0, gridEnd - T0) : null;
  });
  seg({ kind: 'dyngrid', start: gridStart, dur: gridEnd - gridStart, joins, order: ORDER, sources, expandFirst: false, label: 'the orchestra builds: tiles' });
  overlays.push({ id: card({ id: 'slam-instruments', kind: 'slam', text: 'MULTIPLE INSTRUMENTS', sub: 'TEN OF THEM' }), t0: joins[1] + 0.2, t1: joins[1] + 2.9 });
  ORDER.forEach((inst, i) => {
    if (!NAMES[inst] || i === 0) return;
    overlays.push({ id: card({ id: `lower-${inst}`, kind: 'lower', text: [NAMES[inst], 'Theatre'] }), t0: joins[i] + 0.45, t1: joins[i] + 2.95 });
  });
  // The voice over the quiet theme, done before the tutti.
  const tVo = at(244) + 0.2;
  voAt('vo-b', tVo, 0.9);
  sub('vo-b', tVo);
  overlays.push({ id: card({ id: 'slam-hands', kind: 'slam', text: 'BARE HANDS', sub: 'NO CONTROLLERS · NO INSTALL' }), t0: tVo + 6.2, t1: tVo + 8.8 });
}

// ---- The tutti: the instruments smashed, each blow on a cymbal crash.
const CRASHES = ['crash-violin', 'crash-trumpet', 'crash-cello', 'crash-cymbals', 'crash-drums', 'crash-piano'];
/** Punch-ins for the smashes that happen small in the frame: [zoom, x, y]. */
const CRASH_ZOOM = { 'crash-violin': [1.7, 0.6, 0.55], 'crash-trumpet': [1.6, 0.5, 0.42], 'crash-cello': [1.3, 0.62, 0.5], 'crash-cymbals': [1.5, 0.5, 0.55] };
/** When, in a smash take, its biggest blow lands: the loudest sound near any marked blow. */
function impactOf(name) {
  const take = readTake(name);
  const sec = (m) => m.t / 1000;
  const hits = take.marks.filter((m) => m.what === 'impact').map(sec);
  const cueMark = take.marks.find((m) => m.what === 'throw') ?? take.marks.filter((m) => m.what === 'shove').at(-1);
  const windows = hits.length ? hits.map((h) => [h - 0.25, h + 0.45]) : [[cueMark ? sec(cueMark) : 3, (cueMark ? sec(cueMark) : 3) + 2.5]];
  let best = null;
  for (const [lo, hi] of windows) for (const o of onsets(name, lo + AUDIO_LAG, hi + AUDIO_LAG)) if (!best || o.db > best.db) best = o;
  const fallback = hits[0] ?? windows[0][0];
  console.log('impact', name, best ? (best.t - AUDIO_LAG).toFixed(2) : `none (${fallback.toFixed(2)})`);
  return best ? best.t - AUDIO_LAG : fallback;
}
for (let k = 0, bar = MONTAGE.from; bar < MONTAGE.to; bar += MONTAGE.every, k++) {
  const name = CRASHES[k % CRASHES.length];
  const d = at(bar + MONTAGE.every) - at(bar);
  const accent = at(bar + 1); // the blow lands on the downbeat of the shot's second bar
  if (!takes[name]) {
    ai('c-1', d);
    continue;
  }
  const cI = impactOf(name);
  const [zoom, zx, zy] = CRASH_ZOOM[name] ?? [1, 0.5, 0.5];
  seg({ kind: 'take', take: name, at: Math.max(0, cI - (accent - at(bar))), dur: d, zoom, zoomAt: [zx, zy], shake: [[0, 0], [1e6, 0]], spikes: [accent], label: `smash: ${name}` });
  audio.push({ file: takes[name].audioFile, ss: cI - 0.08 + AUDIO_LAG, dur: 1.1, at: accent - 0.08, vol: 0.9, kind: 'sfx', fadeOut: 0.6 });
}

// ---- The tutti again: two bars in each place, a different instrument in each.
const SCENE_NAMES = { 'space-station': 'SPACE STATION', 'volcano-rim': 'VOLCANO RIM', 'bouncy-castle': 'BOUNCY CASTLE', 'snow-globe': 'SNOW GLOBE', 'giant-turtle': 'GIANT TURTLE', 'upside-down-room': 'UPSIDE-DOWN ROOM', 'ice-cave': 'ICE CAVE', stadium: 'STADIUM' };
{
  const tScenes = T;
  for (const [scene, inst, bar] of SCENE_RUN) {
    const name = `scn-${scene}`;
    const s0 = barTime(bar);
    const s1 = barTime(bar + 2);
    const t0 = takes[name] ? tseg(name, s0, s1, { label: `${scene}: ${inst}` }) : ai('c-1', s1 - s0);
    overlays.push({ id: card({ id: `lower-scene-${scene}`, kind: 'lower', text: [SCENE_NAMES[scene] ?? scene, NAMES[inst]] }), t0: t0 + 0.12, t1: t0 + 1.45 });
  }
  overlays.push({ id: card({ id: 'slam-environments', kind: 'slam', text: 'CHANGING ENVIRONMENTS', sub: 'MORE THAN SIXTY' }), t0: tScenes, t1: tScenes + 1.5 });
}

// ---- The closing chord: everyone at once, back on the stage.
{
  const s0 = CHORD;
  const s1 = CHORD + 2.6;
  const sources = ORDER.map((inst) => (inst === 'CENTER' ? { card: centerCard } : hasTake(takeOf(inst)) ? source(takeOf(inst), s0, s1) : null));
  seg({ kind: 'dyngrid', start: T, dur: s1 - s0, joins: ORDER.map(() => T), order: ORDER, sources, instant: true, expandFirst: false, label: 'the closing chord: everyone' });
}
const SCORE_END = T;

// ---- the bow
{
  ai('7-1', 3.0);
  const t1 = ai('real-quest', dur('vo-7-2') + 0.8);
  voAt('vo-7-2', t1 + 0.4);
  sub('vo-7-2', t1 + 0.4);
  const t2 = seg({ kind: 'png', id: card({ id: 'end', kind: 'end' }), dur: 5.5, label: 'end card' });
  voAt('vo-7-3', t2 + 0.5);
  sub('vo-7-3', t2 + 0.5);
}
const TOTAL = T;

// IN-APP CAPTURE bug and the credits.
overlays.push({ id: card({ id: 'bug', kind: 'bug' }), t0: TUNE_START, t1: SCORE_END });
overlays.push({ id: card({ id: 'credit-ode', kind: 'credit', text: 'Ludwig van Beethoven · Ode to Joy (1824) · Public domain', style: 'left:20px;top:16px' }), t0: TUNE_START, t1: TUNE_START + 5 });
overlays.push({ id: card({ id: 'credit-wt', kind: 'credit', text: 'Gioachino Rossini · William Tell Overture, Finale (1829) · Public domain', style: 'left:20px;top:16px' }), t0: tW, t1: tW + 6 });
overlays.push({ id: card({ id: 'credit-capture', kind: 'credit', text: 'In-app capture. Every note is played and synthesized live in Chordless.', style: 'left:20px;bottom:120px' }), t0: TUNE_START, t1: TUNE_START + 5 });

// ------------------------------------------------------------------ audio plan
{
  /** A take's sound for trailer times [s0, s1], conformed to the score eight bars at a time. */
  const stem = (name, s0, s1, vol, { fadeIn = 0.04, fadeOut = 0 } = {}) => {
    const m = mapOf(name);
    const CH = 8 * BAR;
    for (let a = s0; a < s1 - 1e-6; a += CH) {
      const b = Math.min(s1, a + CH);
      const ca = m.at(a) + AUDIO_LAG;
      const cb = m.at(b) + AUDIO_LAG;
      audio.push({ file: takes[name].audioFile, ss: ca, dur: cb - ca, at: T0 + a, vol, kind: 'stem', tempo: (cb - ca) / (b - a), fadeIn: a === s0 ? fadeIn : 0, fadeOut: b >= s1 - 1e-6 ? fadeOut : 0 });
    }
  };
  const MUSIC_END = CHORD + 4.4;
  if (md) {
    // The tune, the silence, the smash and the menu, as they sounded; then the trumpet, on the score's clock.
    const a0 = md.vTune - 0.5;
    const aEnd = md.wt.at(-0.3);
    // The tune and its wrong note brought up to sit near the orchestra; the rest as recorded.
    const aSplit = md.vFlub + 1.6;
    audio.push({ file: takes.meltdown.audioFile, ss: a0 + AUDIO_LAG, dur: aSplit - a0, at: TUNE_START, vol: 2.8, kind: 'stem', fadeOut: 0.6 });
    audio.push({ file: takes.meltdown.audioFile, ss: aSplit + AUDIO_LAG, dur: aEnd - aSplit, at: TUNE_START + (aSplit - a0), vol: 1, kind: 'stem' });
    stem('meltdown', -0.3, MUSIC_END, 0.8, { fadeIn: 0, fadeOut: 3 });
  }
  const VOL = { guitar: 0.6, violin: 0.55, cello: 0.6, piano: 0.55, drums: 0.6, triangle: 0.5, cymbals: 0.55, trumpet: 0.8 };
  ENTRANCES.forEach(([inst, bar]) => {
    if (inst === 'CENTER' || takeOf(inst) === 'meltdown' || !hasTake(takeOf(inst))) return;
    stem(takeOf(inst), barTime(bar) - 0.35, MUSIC_END, VOL[inst], { fadeOut: 3 });
  });
}

// ------------------------------------------------------------------ run
if (process.argv.includes('--plan')) {
  writeFileSync(path.join(B, 'timeline.json'), JSON.stringify({ total: TOTAL, T0, timeline, overlays, audio: audio.map((a) => ({ ...a, file: a.file && path.basename(a.file) })) }, null, 1));
  console.log(timeline.map((s) => `${s.t.toFixed(2)} +${s.dur.toFixed(2)} ${s.label}${s.slow ? ' x' + s.slow.toFixed(4) : ''}`).join(String.fromCharCode(10)));
  process.exit(0);
}
const cardFiles = await renderCards(cardList, CARDS);
const steamDir = path.join(B, 'steam');
const steamPattern = overlays.some((o) => o.steam) ? (existsSync(path.join(steamDir, 'steam_0120.png')) ? path.join(steamDir, 'steam_%04d.png') : await renderSteam(steamDir)) : null;
writeFileSync(path.join(B, 'timeline.json'), JSON.stringify({ total: TOTAL, T0, PEAK, SCORE_END, timeline, overlays, audio: audio.map((a) => ({ ...a, file: a.file && path.basename(a.file) })) }, null, 1));

const scaleFilter = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=${FPS},format=yuv420p`;
const enc = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-an'];
const segFiles = [];
timeline.forEach((s, i) => {
  const out = path.join(SEG, `${String(i).padStart(3, '0')}.mp4`);
  segFiles.push(out);
  let vf = scaleFilter;
  const args = ['-y', '-hide_banner', '-loglevel', 'error'];
  if (s.kind === 'png') {
    args.push('-loop', '1', '-framerate', String(FPS), '-t', s.dur.toFixed(3), '-i', cardFiles[s.id]);
  } else if (s.kind === 'white') {
    args.push('-f', 'lavfi', '-t', s.dur.toFixed(3), '-i', `color=c=white:s=${W}x${H}:r=${FPS}`);
    vf = `format=yuv420p,fade=t=in:st=0:d=${Math.min(s.dur, 3).toFixed(2)}:color=white`;
  } else if (s.kind === 'take') {
    const k = takes[s.take];
    const speed = s.slow ?? 1;
    args.push('-ss', Math.max(0, s.at).toFixed(3), '-t', (s.dur * speed).toFixed(3), '-i', k.videoFile);
    vf = scaleFilter;
    if (s.zoom && s.zoom > 1) {
      // A punch-in, centred where the action is (zoomAt: [x, y] as fractions of the frame).
      const [cx, cy] = s.zoomAt ?? [0.5, 0.5];
      vf = `crop=iw/${s.zoom}:ih/${s.zoom}:'max(0,min(iw-ow,iw*${cx}-ow/2))':'max(0,min(ih-oh,ih*${cy}-oh/2))',${vf}`;
    }
    if (speed !== 1) vf = `setpts=${(1 / speed).toFixed(3)}*PTS,${vf}`;
    const tv = `(t+${s.t.toFixed(3)})`; // timeline time, inside the segment's filters
    if (s.shake) {
      // Camera shake: a tremor that grows, with a sharp kick at each impact.
      const spikes = (s.spikes ?? []).map((ts) => `if(between(${tv},${ts.toFixed(3)},${(ts + 0.35).toFixed(3)}),34*(1-(${tv}-${ts.toFixed(3)})/0.35),0)`);
      const A = `(${[kf(s.shake, tv), ...spikes].join('+')})`;
      const sw = Math.round(W * 1.15);
      const sh = Math.round(H * 1.15);
      vf = `${vf},scale=${sw}:${sh},crop=${W}:${H}:x='(in_w-${W})/2+${A}*sin(t*57)+0.5*${A}*sin(t*23+1)':y='(in_h-${H})/2+${A}*sin(t*49+2)+0.5*${A}*sin(t*31)',setsar=1`;
    }
    if (s.rage) {
      // The rage grade: reds up, blues and greens down, saturation and contrast up.
      const p = `(${kf(s.rage, tv)})`;
      vf = `${vf},eq=gamma_r='1+0.5*${p}':gamma_g='1-0.12*${p}':gamma_b='1-0.35*${p}':saturation='1+0.5*${p}':contrast='1+0.12*${p}':eval=frame`;
    }
    if (s.grade) vf = `${vf},${s.grade}`;
  } else if (s.kind === 'dyngrid') {
    // A grid that builds out: each instrument's tile appears as it joins and the
    // tiles already there make room (a smooth move and resize), up to 3x3; at
    // the end the first tile grows to fill the frame.
    const D = 0.5;
    const layout = (n) => {
      const [cols, cw, ch, offy] = n <= 1 ? [1, 1280, 720, 0] : n === 2 ? [2, 640, 360, 180] : n <= 4 ? [2, 640, 360, 0] : n <= 6 ? [3, 426, 240, 120] : [3, 426, 240, 0];
      const offx = Math.round((W - cols * cw) / 2);
      return (i) => ({ x: offx + (i % cols) * cw, y: offy + Math.floor(i / cols) * ch, w: cw, h: ch });
    };
    const smooth = (t0) => `pow(clip((t-${t0.toFixed(3)})/${D},0,1),2)*(3-2*clip((t-${t0.toFixed(3)})/${D},0,1))`;
    const sum = (init, trans) => `${init}${trans.map(([t0, a, b]) => `+(${(b - a).toFixed(2)})*${smooth(t0)}`).join('')}`;
    const n = s.order.length;
    const local = s.joins.map((j) => Math.max(0, j - s.t));
    const filters = [];
    const lastIndex = n; // the black base is the last input
    s.order.forEach((name, i) => {
      const lj = local[i];
      const left = (s.dur - lj).toFixed(3);
      const src = s.sources?.[i];
      if (src?.card) args.push('-loop', '1', '-framerate', String(FPS), '-t', left, '-i', cardFiles[src.card]);
      else if (src?.file) args.push('-ss', Math.max(0, src.at).toFixed(3), '-t', (src.len + 0.3).toFixed(3), '-i', src.file);
      else args.push('-f', 'lavfi', '-t', left, '-i', `color=c=0x222233:s=${W}x${H}:r=${FPS}`);
    });
    args.push('-f', 'lavfi', '-t', s.dur.toFixed(3), '-i', `color=c=black:s=${W}x${H}:r=${FPS}`);
    // Where each tile is over time: appears at its join, moves as others join.
    const geometry = s.order.map((_, i) => {
      if (s.instant) {
        const c = layout(n)(i);
        return { x: [[0, c.x, c.x]], y: [[0, c.y, c.y]], w: [[0, c.w, c.w]], h: [[0, c.h, c.h]] };
      }
      const cell = layout(i + 1)(i);
      const trans = { x: [[local[i], cell.x + cell.w / 2 - 1, cell.x]], y: [[local[i], cell.y + cell.h / 2 - 1, cell.y]], w: [[local[i], 2, cell.w]], h: [[local[i], 2, cell.h]] };
      for (let m = i + 1; m < n; m++) {
        const a = layout(m)(i);
        const b = layout(m + 1)(i);
        for (const key of ['x', 'y', 'w', 'h']) trans[key].push([local[m], a[key], b[key]]);
      }
      if (i === 0 && s.expandFirst !== false) {
        const a = layout(n)(0);
        for (const [key, to] of [['x', 0], ['y', 0], ['w', W], ['h', H]]) trans[key].push([s.dur - 0.7, a[key], to]);
      }
      return trans;
    });
    // Draw the later tiles first and the first tile last, so it can grow over the rest.
    const drawOrder = [...s.order.keys()].slice(1).concat([0]);
    let prev = `${lastIndex}:v`;
    drawOrder.forEach((i, q) => {
      const g = geometry[i];
      const init = (key) => g[key][0][1];
      const trans = (key) => g[key].slice(1);
      const first = g.w[0];
      // The first transition is the appearance: it runs from the 2 px dot to the cell.
      const ex = (key) => sum(init(key), [[first[0], first[1], g[key][0][2]], ...trans(key).map(([t0, a, b]) => [t0, a, b])].map(([t0, a, b], idx) => (idx === 0 ? [t0, init(key), b] : [t0, a, b])));
      filters.push(`[${i}:v]setpts=(PTS-STARTPTS)/${(s.sources?.[i]?.rate ?? 1).toFixed(5)}+${local[i].toFixed(3)}/TB,fps=${FPS},scale=w='max(2,trunc((${ex('w')})/2)*2)':h='max(2,trunc((${ex('h')})/2)*2)':eval=frame,setsar=1[s${i}]`);
      filters.push(`[${prev}][s${i}]overlay=x='${ex('x')}':y='${ex('y')}':enable='gte(t,${local[i].toFixed(3)})'[o${q}]`);
      prev = `o${q}`;
    });
    const script = path.join(B, `dyngrid-${i}.txt`);
    writeFileSync(script, `${filters.join(';\n')};\n[${prev}]format=yuv420p[v]`);
    run('ffmpeg', [...args, '-filter_complex_script', script, '-map', '[v]', '-t', s.dur.toFixed(3), ...enc, '-r', String(FPS), out]);
    return;
  } else if (s.kind === 'grid') {
    const ins = s.names.map((n) => (n === 'CENTER' ? null : takes[n]));
    const parts = [];
    s.names.forEach((n, j) => {
      if (n === 'CENTER') {
        args.push('-loop', '1', '-framerate', String(FPS), '-t', s.dur.toFixed(3), '-i', cardFiles[s.center]);
      } else {
        const k = takes[n];
        if (k) {
          const audioT = k.onset + ((s.at - T0) - (k.firstBeat - beats['wt-guitar']) * 60 / 152);
          const v = Math.min(Math.max(takeAtAudio(k, audioT), k.onset + k.offset - 1.5), k.videoLen - s.dur - 0.2);
          args.push('-ss', Math.max(0, v).toFixed(3), '-t', s.dur.toFixed(3), '-i', k.videoFile);
        } else {
          args.push('-f', 'lavfi', '-t', s.dur.toFixed(3), '-i', `color=c=0x222233:s=${W}x${H}:r=${FPS}`);
        }
      }
      parts.push(`[${j}:v]scale=424:240:force_original_aspect_ratio=decrease,pad=424:240:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=${FPS}[g${j}]`);
    });
    void ins;
    const layout = ['0_0', '424_0', '848_0', '0_240', '424_240', '848_240', '0_480', '424_480', '848_480'].join('|');
    const fc = `${parts.join(';')};${s.names.map((_, j) => `[g${j}]`).join('')}xstack=inputs=9:layout=${layout}:fill=black,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black,format=yuv420p[v]`;
    run('ffmpeg', [...args, '-filter_complex', fc, '-map', '[v]', '-t', s.dur.toFixed(3), ...enc, '-r', String(FPS), out]);
    return;
  }
  if (s.kind !== 'grid') run('ffmpeg', [...args, '-vf', vf, '-t', s.dur.toFixed(3), ...enc, '-r', String(FPS), out]);
});
writeFileSync(path.join(SEG, 'list.txt'), segFiles.map((f) => `file '${f.replace(/\\/g, '/')}'`).join('\n'));
run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(SEG, 'list.txt'), '-c', 'copy', path.join(B, 'picture.mp4')]);

// Overlays: transparent PNGs shown between two times.
{
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', path.join(B, 'picture.mp4')];
  const chain = [];
  overlays.forEach((o, i) => {
    if (o.steam) args.push('-loop', '1', '-framerate', String(FPS), '-i', steamPattern);
    else args.push('-loop', '1', '-framerate', String(FPS), '-t', (TOTAL + 1).toFixed(2), '-i', cardFiles[o.id]);
    // Fades are alpha fades on the overlay's own clock, which matches the picture's.
    let pre = `[${i + 1}:v]format=rgba`;
    if (o.fade?.in) pre += `,fade=t=in:st=${o.t0.toFixed(3)}:d=${o.fade.in.toFixed(3)}:alpha=1`;
    if (o.fade?.out) pre += `,fade=t=out:st=${(o.t1 - o.fade.out).toFixed(3)}:d=${o.fade.out.toFixed(3)}:alpha=1`;
    chain.push(`${pre}[o${i}];[${i === 0 ? 'base' : 'v' + (i - 1)}][o${i}]overlay=enable='between(t,${o.t0.toFixed(3)},${o.t1.toFixed(3)})':shortest=0[v${i}]`);
  });
  const fc = `[0:v]null[base];${chain.join(';')}`;
  const last = `v${overlays.length - 1}`;
  const fs = path.join(B, 'overlay-filter.txt');
  writeFileSync(fs, fc);
  run('ffmpeg', [...args, '-filter_complex_script', fs, '-map', `[${last}]`, '-t', TOTAL.toFixed(2), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', path.join(B, 'picture-text.mp4')]);
}

// Audio: every item delayed to its time, the music ducked under the voice, then mixed.
{
  const args = ['-y', '-hide_banner', '-loglevel', 'error'];
  const music = [];
  const voices = [];
  const sfx = [];
  let n = 0;
  const filters = [];
  for (const a of audio) {
    if (a.kind === 'tap') {
      args.push('-f', 'lavfi', '-t', '0.1', '-i', 'sine=frequency=1800:sample_rate=48000');
      filters.push(`[${n}:a]afade=t=out:st=0:d=0.08,volume=${a.vol},adelay=${Math.round(a.at * 1000)}|${Math.round(a.at * 1000)}[a${n}]`);
      sfx.push(`[a${n}]`);
      n++;
      continue;
    }
    args.push('-i', a.file);
    const d = Math.max(0.05, a.dur);
    let f = `[${n}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=start=${a.ss.toFixed(3)}:duration=${d.toFixed(3)},asetpts=PTS-STARTPTS,volume=${a.vol}`;
    if (a.fadeIn) f += `,afade=t=in:st=0:d=${a.fadeIn}`;
    if (a.fadeOut) f += `,afade=t=out:st=${Math.max(0, d - a.fadeOut).toFixed(3)}:d=${a.fadeOut}`;
    if (a.tempo && Math.abs(a.tempo - 1) > 1e-4) f += `,atempo=${a.tempo.toFixed(5)}`;
    f += `,adelay=${Math.round(a.at * 1000)}|${Math.round(a.at * 1000)}[a${n}]`;
    filters.push(f);
    (a.kind === 'vo' ? voices : a.kind === 'sfx' ? sfx : music).push(`[a${n}]`);
    n++;
  }
  const mixed = (list, name) => (list.length ? `${list.join('')}amix=inputs=${list.length}:normalize=0:duration=longest[${name}]` : `anullsrc=r=48000:cl=stereo[${name}]`);
  filters.push(mixed(music, 'music'), mixed(voices, 'voice0'), mixed(sfx, 'sfx'));
  filters.push('[voice0]asplit=2[voice][vkey]');
  filters.push('[music][vkey]sidechaincompress=threshold=0.04:ratio=6:attack=20:release=400[ducked]');
  filters.push(`[ducked][voice][sfx]amix=inputs=3:normalize=0:duration=longest,alimiter=limit=0.95,atrim=0:${TOTAL.toFixed(2)}[out]`);
  const fs = path.join(B, 'audio-filter.txt');
  writeFileSync(fs, filters.join(';\n'));
  run('ffmpeg', [...args, '-filter_complex_script', fs, '-map', '[out]', '-ar', '48000', path.join(B, 'mix.wav')]);
}
run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', path.join(B, 'picture-text.mp4'), '-i', path.join(B, 'mix.wav'), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', path.join(B, 'first-pass.mp4')]);
console.log(`first pass: ${path.join(B, 'first-pass.mp4')} (${TOTAL.toFixed(1)} s, ${timeline.length} cuts)`);
