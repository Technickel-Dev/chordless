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
import { renderCards, W, H } from './cards.mjs';

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
  return { ...meta, audioFile: audio, videoFile: path.join(TAKES, `${name}.webm`), onset, offset: meta.audioStart && meta.videoStart ? (meta.audioStart - meta.videoStart) / 1000 : 0 };
}

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
for (const name of ['tune-ode']) if (have(name)) takes[name] = analyse(name);
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
const tune = takes['tune-ode'];
{
  // The title card, over the tune take darkened.
  const t0 = seg({ kind: 'take', take: 'tune-ode', at: tune ? takeAtAudio(tune, tune.onset + 1) : 0, dur: 2.4, grade: 'eq=brightness=-0.35', label: 'title card, over guitar' });
  overlays.push({ id: card({ id: 'title-chordless', kind: 'title', text: ['CHORDLESS', 'Air instruments for Meta Quest. Played with your bare hands.'] }), t0, t1: t0 + 2.4 });
  voAt('vo-1-8', t0 + 0.3);
  sub('vo-1-8', t0 + 0.3);
}
const tapT = T + 0.0;
ai('1-9', 3.0);
for (const k of [0, 1, 2]) audio.push({ kind: 'tap', at: tapT + 1.2 + k * 0.6, dur: 0.08, vol: 0.9 });

// ---- beats 2 and 3: the tune and the flub
const TUNE_START = T;
const FLUB = 23 * 0.6; // the wrong note, in the tune
if (tune) {
  const v0 = takeAtAudio(tune, tune.onset - 0.15);
  const len = FLUB + 1.3;
  seg({ kind: 'take', take: 'tune-ode', at: v0, dur: len, label: 'the tune', fade: 0 });
  audio.push({ file: tune.audioFile, ss: tune.onset - 0.15, dur: len - 0.2, at: T - len + 0.0, vol: 1, kind: 'stem', fadeOut: 0.12 });
  overlays.push({ id: card({ id: 'lower-guitar', kind: 'lower', text: ['GUITAR · Cliffside Sunset'] }), t0: TUNE_START + 0.9, t1: TUNE_START + 3.9 });
  voAt('vo-a', TUNE_START + 0.9, 0.9);
  sub('vo-a', TUNE_START + 0.9);
} else {
  ai('c-1', FLUB + 1.3);
}
const SILENCE_AT = T;
ai('c-1', 1.6);

// ---- beat 4: the rage (T0 = the score's first note)
const T0 = T;
const at = (bar) => T0 + (bar - 226) * BAR;
const PEAK = at(260);
const SCORE_END = at(360);
const rage = (t) => ({ from: T0, to: PEAK, t }); // marks a segment that belongs to the rage ramp

/** A take's picture on the score clock, from timeline time `t` for `d` seconds. */
function scoreSeg(name, t, d, extra = {}) {
  const k = takes[name];
  if (!k) return seg({ kind: 'png', id: card({ id: `ai-missing-${name}`, kind: 'ai', shot: 'missing-trombone' }), dur: d, label: `missing ${name}` });
  const audioT = k.onset + ((t - T0) - (k.firstBeat - beats['wt-guitar']) * 60 / 152);
  return seg({ kind: 'take', take: name, at: takeAtAudio(k, audioT), dur: d, label: `${name} @ bar ${(226 + (t - T0) / BAR).toFixed(1)}`, ...extra });
}
// Fanfare: the trumpet, with the fist and the face cutting in.
{
  const r = { rage: [T0, PEAK] };
  scoreSeg('wt-trumpet', at(226), 3.2, r);
  ai('c-2', 1.8); // covers the trumpet for 1.8 s; its audio carries on
  scoreSeg('wt-trumpet', at(226) + 5.0, at(243) - at(226) - 5.0, r);
  overlays.push({ id: card({ id: 'lower-trumpet', kind: 'lower', text: ['TRUMPET · Pirate Ship'] }), t0: T0 + 0.3, t1: T0 + 3.5 });
  // Galop, quiet: the guitar, tighter and tighter.
  const pieces = [[243, 247], [247, 250], [250, 252.4], [252.4, 254.4], [254.4, 256.4], [256.4, 258], [258, 260]];
  let t = at(243);
  let cut = 0;
  for (const [a, b] of pieces) {
    const d = (b - a) * BAR;
    if (Math.abs(a - 250) < 0.01) {
      ai('c-3', d); // the face
    } else if (Math.abs(a - 254.4) < 0.01) {
      ai('c-4', d); // the podium
    } else {
      scoreSeg('wt-guitar', t, d, { ...r, zoom: 1 + cut * 0.08 });
      cut++;
    }
    t += d;
  }
  // The tutti begins in white.
  seg({ kind: 'white', dur: 0.3, label: 'white flash' });
}
overlays.push({ id: card({ id: 'lower-guitar-2', kind: 'lower', text: ['GUITAR · Cliffside Sunset'] }), t0: at(243) + 0.3, t1: at(243) + 3.5 });

// ---- beat 5: the high point (bar 260), then the cards
const smashOrder = ['smash-guitar', 'smash-drums', 'smash-piano', 'smash-trumpet', 'smash-violin', 'smash-cymbals'];
{
  let t = PEAK;
  const lens = [4, 2, 2, 2, 2, 2];
  smashOrder.forEach((name, i) => {
    const d = lens[i] * BAR - (i === 0 ? 0.3 : 0);
    const c = cuts[name]?.[0] ?? cuts[name];
    if (takes[name] && c != null) seg({ kind: 'take', take: name, at: c, dur: d, label: name, slow: i === 0 ? 0.5 : 1 });
    else seg({ kind: 'png', id: card({ id: `ai-missing-${name}`, kind: 'ai', shot: 'missing-trombone' }), dur: d, label: `missing ${name}` });
    t += d;
  });
  overlays.push({ id: card({ id: 'slam-destruction', kind: 'slam', text: 'FULL DESTRUCTION' }), t0: at(264), t1: at(264) + 3.2 });
}

// ---- beat 6: instruments, environments, the grid, the coda
{
  // Multiple instruments: one per 2 bars from bar 276.
  const roll = ['wt-violin', 'wt-cello', 'missing', 'missing', 'wt-trumpet', 'wt-piano', 'wt-triangle', 'wt-drums'];
  let t = at(276);
  const t0 = t;
  for (const name of roll) {
    const d = 2 * BAR;
    if (name === 'missing') {
      seg({ kind: 'png', id: card({ id: `ai-missing-${t.toFixed(0)}`, kind: 'ai', shot: roll.indexOf(name) === 2 ? 'missing-trombone' : 'missing-horn' }), dur: d, label: 'missing instrument' });
    } else {
      scoreSeg(name, t, d);
    }
    t += d;
  }
  overlays.push({ id: card({ id: 'slam-instruments', kind: 'slam', text: 'MULTIPLE INSTRUMENTS', sub: 'TEN OF THEM' }), t0: t0 + 0.2, t1: t0 + 3.4 });
  voAt('vo-b', t0 + 3.6, 0.9);
  sub('vo-b', t0 + 3.6);
  // Environments: one scene per bar from bar 292.
  const envs = ['space-station', 'volcano-rim', 'pinball', 'bouncy-castle', 'snow-globe', 'lava-lamp', 'giant-turtle', 'upside-down-room', 'stadium', 'desert-canyon', 'ice-cave', 'record-player'];
  const e0 = t;
  let n = 0;
  while (t < at(312) - 0.001) {
    const name = `env-${envs[n % envs.length]}`;
    const d = Math.min(BAR, at(312) - t);
    const c = cuts[name] ?? 4;
    if (takes[name]) seg({ kind: 'take', take: name, at: c, dur: d, label: name });
    else seg({ kind: 'png', id: card({ id: `ai-missing-${name}`, kind: 'ai', shot: 'missing-horn' }), dur: d, label: `missing ${name}` });
    t += d;
    n++;
  }
  overlays.push({ id: card({ id: 'slam-environments', kind: 'slam', text: 'CHANGING ENVIRONMENTS', sub: 'MORE THAN SIXTY' }), t0: e0 + 0.2, t1: e0 + 3.4 });
  // The grid: eight takes and the conductor, bars 312-330.
  const gridNames = ['wt-trumpet', 'wt-guitar', 'wt-cello', 'wt-violin', 'CENTER', 'wt-piano', 'wt-triangle', 'wt-drums', 'wt-cymbals'];
  const gd = at(330) - t;
  seg({ kind: 'grid', names: gridNames, center: card({ id: 'ai-c-grid', kind: 'ai', shot: 'c-grid' }), at: t, dur: gd, label: '3x3 grid' });
  overlays.push({ id: card({ id: 'slam-hands', kind: 'slam', text: 'BARE HANDS', sub: 'NO CONTROLLERS · NO INSTALL' }), t0: t + 0.2, t1: t + 3.0 });
  t += gd;
  // The coda: one bar each, the smashes and the scenes, until the final chord.
  const coda = [...smashOrder, ...envs.map((e) => `env-${e}`)];
  let c = 0;
  while (t < SCORE_END - 0.001) {
    const name = coda[c % coda.length];
    const d = Math.min(BAR, SCORE_END - t);
    const cc = cuts[name]?.[1] ?? cuts[name]?.[0] ?? cuts[name] ?? 4;
    if (takes[name]) seg({ kind: 'take', take: name, at: typeof cc === 'number' ? cc : 4, dur: d, label: `coda ${name}` });
    else seg({ kind: 'png', id: card({ id: `ai-missing-${name}`, kind: 'ai', shot: 'missing-horn' }), dur: d, label: `missing ${name}` });
    t += d;
    c++;
  }
}

// ---- beat 7: the bow
{
  const ENDS = T;
  ai('7-1', 3.0);
  const t1 = ai('real-quest', dur('vo-7-2') + 0.8);
  voAt('vo-7-2', t1 + 0.4);
  sub('vo-7-2', t1 + 0.4);
  const t2 = seg({ kind: 'png', id: card({ id: 'end', kind: 'end' }), dur: 5.5, label: 'end card' });
  voAt('vo-7-3', t2 + 0.5);
  sub('vo-7-3', t2 + 0.5);
  void ENDS;
}
const TOTAL = T;

// IN-APP CAPTURE bug and the credits, from the tune to the bow.
overlays.push({ id: card({ id: 'bug', kind: 'bug' }), t0: TUNE_START, t1: at(360) });
overlays.push({ id: card({ id: 'credit-ode', kind: 'credit', text: 'Ludwig van Beethoven · Ode to Joy (1824) · Public domain', style: 'left:20px;top:16px' }), t0: TUNE_START, t1: TUNE_START + 6 });
overlays.push({ id: card({ id: 'credit-wt', kind: 'credit', text: 'Gioachino Rossini · William Tell Overture, Finale (1829) · Public domain', style: 'left:20px;top:16px' }), t0: T0, t1: T0 + 6 });
overlays.push({ id: card({ id: 'credit-capture', kind: 'credit', text: 'In-app capture. Every note is played and synthesized live in Chordless.', style: 'left:20px;bottom:120px' }), t0: TUNE_START, t1: TUNE_START + 6 });

// ------------------------------------------------------------------ audio plan for the score
{
  const joins = [
    ['wt-trumpet', 226],
    ['wt-guitar', 243],
    ['wt-cello', 260],
    ['wt-violin', 276],
    ['wt-piano', 296],
    ['wt-triangle', 296],
    ['wt-drums', 312],
    ['wt-cymbals', 342],
  ];
  for (const [name, bar] of joins) {
    const k = takes[name];
    if (!k) continue;
    const t = at(bar);
    const audioT = k.onset + ((t - T0) - (k.firstBeat - beats['wt-guitar']) * 60 / 152);
    audio.push({ file: k.audioFile, ss: Math.max(0, audioT), dur: SCORE_END + 2.5 - t, at: t + (audioT < 0 ? -audioT : 0), vol: 0.75, kind: 'stem', fadeOut: 2.5, fadeIn: 0.05 });
  }
  // The smashes' own sound, under the tutti.
  let t = PEAK;
  const lens = [4, 2, 2, 2, 2, 2];
  smashOrder.forEach((name, i) => {
    const k = takes[name];
    const c = cuts[name]?.[0] ?? cuts[name];
    if (k && c != null) audio.push({ file: k.audioFile, ss: Math.max(0, c - k.offset), dur: lens[i] * BAR, at: t + (i === 0 ? 0.3 : 0), vol: 0.9, kind: 'stem', fadeOut: 0.1 });
    t += lens[i] * BAR;
  });
}

// ------------------------------------------------------------------ run
const cardFiles = await renderCards(cardList, CARDS);
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
    if (s.zoom && s.zoom > 1) vf = `crop=iw/${s.zoom}:ih/${s.zoom},${vf}`;
    if (speed !== 1) vf = `setpts=${(1 / speed).toFixed(3)}*PTS,${vf}`;
    if (s.rage) {
      const [r0, r1] = s.rage;
      const o = s.t - r0;
      const span = r1 - r0;
      const p = `clip((t+${o.toFixed(3)})/${span.toFixed(3)},0,1)`;
      vf = `${vf},eq=gamma_r='1+0.7*${p}':gamma_b='1-0.45*${p}':saturation='1+0.5*${p}':brightness='0.85*pow(clip((t+${o.toFixed(3)}-${(span - 5).toFixed(3)})/5,0,1),2)':eval=frame,vignette=angle=PI/3.2`;
    }
    if (s.grade) vf = `${vf},${s.grade}`;
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
          args.push('-ss', Math.max(0, takeAtAudio(k, audioT)).toFixed(3), '-t', s.dur.toFixed(3), '-i', k.videoFile);
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
    args.push('-loop', '1', '-framerate', String(FPS), '-t', (TOTAL + 1).toFixed(2), '-i', cardFiles[o.id]);
    chain.push(`[${i === 0 ? 'base' : 'v' + (i - 1)}][${i + 1}:v]overlay=enable='between(t,${o.t0.toFixed(3)},${o.t1.toFixed(3)})':shortest=0[v${i}]`);
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
    f += `,adelay=${Math.round(a.at * 1000)}|${Math.round(a.at * 1000)}[a${n}]`;
    filters.push(f);
    (a.kind === 'vo' ? voices : music).push(`[a${n}]`);
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
