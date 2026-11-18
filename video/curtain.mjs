/**
 * The curtain call, the trailer's last shot before the end card. Red velvet curtains
 * close over the closing chord's last frame, as cloth: their folds start bunched by
 * the side and spread as they are drawn, the hems trail the tops and swing when they
 * meet. Bouquets are thrown from the audience and fall out of shot onto the stage, and
 * the picture fades to black.
 *
 * It is drawn on a canvas one frame at a time from a seeded random source, so every
 * build draws the same shot. The applause under it is synthesized from single claps.
 */
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { chromium } from 'playwright';
import { W, H } from './cards.mjs';

/** When things happen in the shot (seconds from its start). The fade to black ends `black` before the end. */
export const CURTAIN = { close: [0.3, 2.9], fade: 1.25, black: 0.35 };

/** Renders the shot to `out` (an mp4 encoded with `enc`), `dur` seconds over the picture in `background`. */
export async function renderCurtain({ background, out, dur, fps, enc }) {
  const bg = `data:image/png;base64,${readFileSync(background).toString('base64')}`;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    await page.setContent(`<body style="margin:0;background:#000"><canvas id="c" width="${W}" height="${H}"></canvas></body>`);
    await page.evaluate(scene, { W, H, bg, D: dur, T: CURTAIN });
    // The JPEGs are full range; the rest of the cut is video range (black at 16), so convert.
    const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', '-', '-vf', 'scale=in_range=full:out_range=limited,format=yuv420p', ...enc, '-r', String(fps), out], { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '';
    ff.stderr.on('data', (d) => (err += d));
    const done = new Promise((resolve, reject) => ff.on('close', (code) => (code ? reject(new Error(`ffmpeg ${code}: ${err}`)) : resolve())));
    const frames = Math.round(dur * fps);
    for (let i = 0; i < frames; i++) {
      await page.evaluate((t) => window.draw(t), i / fps);
      const jpeg = await page.screenshot({ type: 'jpeg', quality: 95 });
      if (!ff.stdin.write(jpeg)) await new Promise((r) => ff.stdin.once('drain', r));
    }
    ff.stdin.end();
    await done;
  } finally {
    await browser.close();
  }
}

/** Runs in the page: sets up the curtains and bouquets and defines window.draw(t). */
async function scene({ W, H, bg, D, T }) {
  const c = document.getElementById('c');
  const ctx = c.getContext('2d');
  const img = new Image();
  img.src = bg;
  await img.decode();

  let seed = 20261116 >>> 0;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, u) => a + (b - a) * u;
  const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
  const span = (t, [a, b]) => clamp((t - a) / (b - a));
  const TAU = Math.PI * 2;
  const FADE = [D - T.black - T.fade, D - T.black];

  // ---- bouquets, drawn once each
  const PAPER = ['#d9b48a', '#f4efe6', '#f5c3d2', '#d6c8ef', '#e3edd2', '#fbe7c6'];
  const SCHEMES = [
    ['#d6233a', '#b5122b', '#e84a5f', '#ff5c74'],
    ['#f06a9a', '#f9a8c4', '#e0457b', '#ffd1e1'],
    ['#ffd23f', '#ff7f50', '#f06a9a', '#fff3f0'],
    ['#fff6f0', '#f2e6ff', '#ffe3ea', '#fffbe8'],
    ['#9b59d0', '#c18df0', '#f9a8c4', '#ffffff'],
    ['#ff8c42', '#ffd23f', '#e84a5f', '#fff3f0'],
  ];
  const RIBBON = ['#e2b33c', '#c21d2b', '#ffffff', '#7b3fbf', '#2f7d6d'];
  const rose = (b, { x, y, r, col, a }) => {
    b.beginPath();
    b.arc(x, y, r, 0, TAU);
    b.fillStyle = col;
    b.fill();
    b.strokeStyle = 'rgba(0,0,0,0.28)';
    b.lineWidth = r * 0.14;
    b.beginPath();
    b.arc(x + r * 0.08, y + r * 0.05, r * 0.62, a, a + 4.2);
    b.stroke();
    b.beginPath();
    b.arc(x - r * 0.05, y, r * 0.3, a + 2, a + 6.5);
    b.stroke();
    b.beginPath();
    b.arc(x - r * 0.3, y - r * 0.35, r * 0.35, 0, TAU);
    b.fillStyle = 'rgba(255,255,255,0.2)';
    b.fill();
    b.beginPath();
    b.arc(x, y, r, 0, TAU);
    b.strokeStyle = 'rgba(0,0,0,0.3)';
    b.lineWidth = 0.8;
    b.stroke();
  };
  const daisy = (b, { x, y, r, col, a }) => {
    b.fillStyle = col;
    for (let k = 0; k < 9; k++) {
      const q = a + (k * TAU) / 9;
      b.beginPath();
      b.ellipse(x + Math.cos(q) * r * 0.55, y + Math.sin(q) * r * 0.55, r * 0.5, r * 0.22, q, 0, TAU);
      b.fill();
    }
    b.beginPath();
    b.arc(x, y, r * 0.3, 0, TAU);
    b.fillStyle = '#f0b429';
    b.fill();
  };
  function makeBouquet(i) {
    const cv = document.createElement('canvas');
    cv.width = 260;
    cv.height = 300;
    const b = cv.getContext('2d');
    b.scale(2, 2);
    b.translate(65, 80);
    const scheme = SCHEMES[i % SCHEMES.length];
    const paper = PAPER[(i * 7 + 3) % PAPER.length];
    const ribbon = RIBBON[(i * 3 + 1) % RIBBON.length];
    for (let k = 0; k < 7; k++) {
      const a = (k - 3) * 0.42 + (rnd() - 0.5) * 0.25;
      b.save();
      b.rotate(a);
      b.beginPath();
      b.ellipse(0, -46, 6.5, 19, 0, 0, TAU);
      b.fillStyle = k % 2 ? '#2f7d32' : '#4a9d3f';
      b.fill();
      b.strokeStyle = 'rgba(0,40,0,0.5)';
      b.lineWidth = 0.8;
      b.beginPath();
      b.moveTo(0, -30);
      b.lineTo(0, -62);
      b.stroke();
      b.restore();
    }
    const blooms = [];
    for (let k = 0; k < 11; k++) {
      const a = -Math.PI / 2 + (rnd() - 0.5) * 2.4;
      const d = 6 + rnd() * 24;
      blooms.push({ x: Math.cos(a) * d * 1.05, y: -28 + Math.sin(a) * d * 0.8, r: 7.5 + rnd() * 4.5, col: scheme[Math.floor(rnd() * scheme.length)], daisy: rnd() > 0.7, a: rnd() * TAU });
    }
    blooms.sort((p, q) => p.y - q.y);
    for (const f of blooms) (f.daisy ? daisy : rose)(b, f);
    for (let k = 0; k < 26; k++) {
      const a = -Math.PI / 2 + (rnd() - 0.5) * 2.6;
      const d = 14 + rnd() * 26;
      b.beginPath();
      b.arc(Math.cos(a) * d, -26 + Math.sin(a) * d * 0.85, 1.3 + rnd() * 0.8, 0, TAU);
      b.fillStyle = 'rgba(255,255,255,0.9)';
      b.fill();
    }
    // The paper cone, one fold in shadow, its rim catching the light.
    b.beginPath();
    b.moveTo(-38, -20);
    b.quadraticCurveTo(0, -12, 38, -20);
    b.lineTo(6, 54);
    b.lineTo(-6, 54);
    b.closePath();
    b.fillStyle = paper;
    b.fill();
    b.strokeStyle = 'rgba(0,0,0,0.3)';
    b.lineWidth = 0.8;
    b.stroke();
    b.beginPath();
    b.moveTo(4, -15);
    b.quadraticCurveTo(22, -16, 38, -20);
    b.lineTo(6, 54);
    b.lineTo(0, 54);
    b.closePath();
    b.fillStyle = 'rgba(0,0,0,0.16)';
    b.fill();
    b.beginPath();
    b.moveTo(-38, -20);
    b.quadraticCurveTo(0, -12, 38, -20);
    b.strokeStyle = 'rgba(255,255,255,0.55)';
    b.lineWidth = 1.5;
    b.stroke();
    // A ribbon bow at the neck.
    b.fillStyle = ribbon;
    for (const s of [-1, 1]) {
      b.save();
      b.translate(0, 22);
      b.rotate(s * 0.5);
      b.beginPath();
      b.ellipse(s * 8, 0, 8.5, 4.5, 0, 0, TAU);
      b.fill();
      b.restore();
      b.beginPath();
      b.moveTo(s * 1, 23);
      b.lineTo(s * 8, 39);
      b.lineTo(s * 4, 38);
      b.lineTo(0, 25);
      b.fill();
    }
    b.beginPath();
    b.arc(0, 22, 3.5, 0, TAU);
    b.fill();
    b.strokeStyle = 'rgba(0,0,0,0.3)';
    b.stroke();
    return cv;
  }

  // Thrown from the audience across the middle of the shot: each rises toward the
  // curtains and drops out of the bottom of the frame, onto the stage below it.
  const N = 9;
  const throwFrom = 1.0;
  const throwTo = Math.min(5.8, D - T.black - T.fade - 1.6);
  const slots = [...Array(N).keys()].sort(() => rnd() - 0.5);
  const bouquets = [...Array(N).keys()].map((i) => {
    const x1 = 90 + (slots[i] * (W - 180)) / (N - 1) + (rnd() - 0.5) * 80;
    const sign = rnd() < 0.5 ? -1 : 1;
    return {
      img: makeBouquet(i),
      t0: throwFrom + (i * (throwTo - throwFrom)) / (N - 1) + (rnd() - 0.5) * 0.2,
      dur: 1.15 + rnd() * 0.3,
      x0: clamp(x1 + (rnd() - 0.5) * 520, 60, W - 60),
      y0: H + 130,
      x1,
      y1: H + 110,
      yApex: 170 + rnd() * 170,
      s0: 1.3 + rnd() * 0.2,
      s1: 0.62 + rnd() * 0.2,
      rot0: (rnd() - 0.5) * 0.8,
      spin: sign * (1.6 + rnd() * 2.6),
    };
  });

  // ---- the curtains: each a sheet of velvet in narrow strips, hung from just past its
  // edge of the frame, its folds fixed in the cloth (so they spread as it is drawn).
  const FOLDS = 14;
  const STRIPS = FOLDS * 12;
  const ROWS = 48; // enough that the leading edge is a smooth curve
  const OUT = -40; // where a panel hangs from
  const MEET = W / 2 + 18; // where its leading edge stops, a little past the middle
  const Y0 = -24;
  const Y1 = H + 24;
  const closedAt = (t) => ease(span(t, T.close));
  const edgeAt = (t) => lerp(0, MEET, closedAt(t));
  const xs = new Float32Array((STRIPS + 1) * (ROWS + 1));
  const rowY = (k) => lerp(Y0, Y1, k / ROWS);
  /** The leading edge, top to bottom: a path of its own, or (`join`) continuing the one begun. */
  const edgePath = (dx = 0, join = false) => {
    for (let k = 0; k <= ROWS; k++) {
      const x = xs[k * (STRIPS + 1) + STRIPS] + dx;
      if (k || join) ctx.lineTo(x, rowY(k));
      else ctx.moveTo(x, rowY(k));
    }
  };
  // Where each fold falls in the cloth, a little uneven, as real folds are.
  const foldPhase = (u) => u * FOLDS + 0.22 * Math.sin(u * FOLDS * 0.83 + 1.3) + 0.12 * Math.sin(u * FOLDS * 2.1 + 0.4);
  function panel(t, mirror) {
    const closed = closedAt(t);
    const edge = edgeAt(t);
    const dt = 1 / 60;
    // How fast it is being drawn, 0 to 1.
    const speed = ((edgeAt(t) - edgeAt(t - dt)) / dt) * ((T.close[1] - T.close[0]) / 1.5 / MEET);
    const after = t - T.close[1];
    // The hem trails the top while it moves, and swings past and back when it stops.
    const lag = 85 * speed + (after > 0 ? -26 * Math.sin(after * 5.5) * Math.exp(-after * 2) : 0);
    // Ripples running through the cloth, dying away once it hangs still.
    const ripple = clamp(closed * 6) * 7 * (speed + 0.12 + (after > 0 ? 0.5 * Math.exp(-after * 1.4) : 0));
    // The folds bunched toward the side still stacked, even once it is drawn.
    const p = lerp(1.9, 1, closed);
    for (let k = 0; k <= ROWS; k++) {
      const yn = k / ROWS;
      const ex = edge - lag * yn ** 1.6;
      for (let i = 0; i <= STRIPS; i++) {
        const u = i / STRIPS;
        const sway = ripple * Math.sin(TAU * (2.5 * u - 0.9 * t) + yn * 2.2) * yn ** 1.4 * u;
        xs[k * (STRIPS + 1) + i] = OUT + (ex - OUT) * u ** p + sway;
      }
    }
    ctx.save();
    if (mirror) {
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
    }
    // Its shadow on what is behind it, beyond the leading edge.
    for (const [dx, a, w] of [[5, 0.28, 10], [12, 0.16, 16], [22, 0.08, 22]]) {
      ctx.beginPath();
      edgePath(dx);
      ctx.strokeStyle = `rgba(0,0,0,${a})`;
      ctx.lineWidth = w;
      ctx.stroke();
    }
    // The cloth, strip by strip: deep folds where it is bunched, softer where it is pulled out.
    const width = MEET - OUT;
    for (let i = 0; i < STRIPS; i++) {
      const um = (i + 0.5) / STRIPS;
      const raw = 0.5 - 0.5 * Math.cos(TAU * foldPhase(um));
      const stretch = clamp(((edge - OUT) * p * um ** (p - 1)) / width, 0, 1.6);
      const depth = clamp(lerp(1, 0.72, stretch));
      const lit = 1 - depth + depth * raw ** 1.2;
      const col = `rgb(${Math.round(lerp(34, 205, lit))},${Math.round(lerp(2, 28, lit))},${Math.round(lerp(7, 44, lit))})`;
      ctx.fillStyle = col;
      ctx.strokeStyle = col;
      ctx.beginPath();
      for (let k = 0; k <= ROWS; k++) {
        const x = xs[k * (STRIPS + 1) + i];
        if (k) ctx.lineTo(x, rowY(k));
        else ctx.moveTo(x, rowY(k));
      }
      for (let k = ROWS; k >= 0; k--) ctx.lineTo(xs[k * (STRIPS + 1) + i + 1], rowY(k));
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    // Light from above and in front: the top in shadow, the foot darker.
    ctx.beginPath();
    ctx.moveTo(OUT - 10, Y0);
    edgePath(0, true);
    ctx.lineTo(OUT - 10, Y1);
    ctx.closePath();
    const v = ctx.createLinearGradient(0, 0, 0, H);
    v.addColorStop(0, 'rgba(0,0,0,0.6)');
    v.addColorStop(0.2, 'rgba(0,0,0,0.08)');
    v.addColorStop(0.7, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = v;
    ctx.fill();
    ctx.restore();
  }

  /** A bouquet in flight: up out of the audience, over toward the curtains (getting smaller), and down out of shot. */
  function drawBouquet(q, t) {
    const f = (t - q.t0) / q.dur;
    if (f < 0 || f > 1) return;
    const cy = 2 * q.yApex - (q.y0 + q.y1) / 2;
    const x = lerp(q.x0, q.x1, 1 - (1 - f) ** 1.3);
    const y = (1 - f) ** 2 * q.y0 + 2 * f * (1 - f) * cy + f * f * q.y1;
    const s = 1 / lerp(1 / q.s0, 1 / q.s1, Math.min(1, f * 1.4));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(q.rot0 + q.spin * f);
    ctx.scale(s, s);
    ctx.drawImage(q.img, -65, -80, 130, 150);
    ctx.restore();
  }

  window.draw = (t) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    // A slow push in once the curtains are closed.
    const push = 1 + 0.03 * ease(span(t, [T.close[1], D]));
    ctx.translate(W / 2, H * 0.6);
    ctx.scale(push, push);
    ctx.translate(-W / 2, -H * 0.6);

    // The stage, dimming as the curtains close.
    const closed = closedAt(t);
    ctx.drawImage(img, 0, 0, W, H);
    ctx.fillStyle = `rgba(0,0,0,${0.3 * closed})`;
    ctx.fillRect(0, 0, W, H);

    panel(t, false);
    panel(t, true);

    // A warm spot on the closed curtains for the curtain call.
    const glow = ease(span(t, [T.close[1] - 0.5, T.close[1] + 0.9]));
    if (glow > 0) {
      ctx.globalCompositeOperation = 'lighter';
      const r = ctx.createRadialGradient(W / 2, H * 0.52, 10, W / 2, H * 0.52, 520);
      r.addColorStop(0, `rgba(255,190,130,${0.22 * glow})`);
      r.addColorStop(1, 'rgba(255,190,130,0)');
      ctx.fillStyle = r;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }

    // Bouquets, the later throws (nearer the camera) over the earlier ones.
    for (const q of bouquets) drawBouquet(q, t);

    // To black.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const black = ease(span(t, FADE));
    if (black > 0) {
      ctx.fillStyle = `rgba(0,0,0,${black})`;
      ctx.fillRect(0, 0, W, H);
    }
  };
}

/**
 * Applause for the curtain call, `dur` seconds long: a crowd of people clapping, each
 * at their own rate and pitch and place, swelling in over `rise` seconds and fading
 * out from `fadeOutAt` over `fadeOut`. Written to `file` (48 kHz stereo WAV), with a
 * little of the hall's reverb.
 */
export function writeApplause(file, { dur, rise = 1.4, fadeOutAt, fadeOut, people = 36, seed = 11 }) {
  const rate = 48000;
  const n = Math.ceil(dur * rate);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  let s = seed >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const env = (t) => {
    const a = Math.min(1, t / rise);
    const down = t < fadeOutAt ? 1 : Math.max(0, 1 - (t - fadeOutAt) / fadeOut);
    return a * a * (3 - 2 * a) * down * down * (0.92 + 0.08 * Math.sin(t * 1.3));
  };
  for (let p = 0; p < people; p++) {
    const hz = 3.6 + rnd() * 2.2;
    const f0 = 900 + rnd() * 1700;
    const q = 1.1 + rnd() * 1.4;
    const near = 0.3 + rnd() * 0.7;
    const pan = rnd() * 2 - 1;
    const gl = near * Math.sqrt((1 - pan) / 2);
    const gr = near * Math.sqrt((1 + pan) / 2);
    const w0 = (2 * Math.PI * f0) / rate;
    const al = Math.sin(w0) / (2 * q);
    const b0 = al / (1 + al);
    const a1 = (-2 * Math.cos(w0)) / (1 + al);
    const a2 = (1 - al) / (1 + al);
    for (let t = rnd() * rise * 0.8; t < dur; t += (1 / hz) * (0.85 + rnd() * 0.3)) {
      const amp = env(t) * (0.55 + rnd() * 0.45);
      if (amp < 0.002) continue;
      const i0 = Math.floor(t * rate);
      const tau = (0.003 + rnd() * 0.005) * rate;
      let x1 = 0;
      let x2 = 0;
      let y1 = 0;
      let y2 = 0;
      for (let k = 0; k < rate * 0.03 && i0 + k < n; k++) {
        const x = (rnd() * 2 - 1) * Math.exp(-k / tau) * Math.min(1, k / 24);
        const y = b0 * x - b0 * x2 - a1 * y1 - a2 * y2;
        x2 = x1;
        x1 = x;
        y2 = y1;
        y1 = y;
        L[i0 + k] += y * amp * gl;
        R[i0 + k] += y * amp * gr;
      }
    }
  }
  let peak = 1e-9;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const pcm = Buffer.alloc(44 + n * 4);
  pcm.write('RIFF', 0);
  pcm.writeUInt32LE(36 + n * 4, 4);
  pcm.write('WAVEfmt ', 8);
  pcm.writeUInt32LE(16, 16);
  pcm.writeUInt16LE(1, 20);
  pcm.writeUInt16LE(2, 22);
  pcm.writeUInt32LE(rate, 24);
  pcm.writeUInt32LE(rate * 4, 28);
  pcm.writeUInt16LE(4, 32);
  pcm.writeUInt16LE(16, 34);
  pcm.write('data', 36);
  pcm.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    pcm.writeInt16LE(Math.round((L[i] / peak) * 0.5 * 32767), 44 + i * 4);
    pcm.writeInt16LE(Math.round((R[i] / peak) * 0.5 * 32767), 46 + i * 4);
  }
  const dry = `${file}.dry.wav`;
  writeFileSync(dry, pcm);
  const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', dry, '-af', 'aecho=0.8:0.6:37|61|97|149:0.3|0.22|0.15|0.1,highpass=f=180,lowpass=f=9500', file], { encoding: 'utf8' });
  unlinkSync(dry);
  if (r.status !== 0) throw new Error(`applause: ${r.stderr}`);
  return file;
}
