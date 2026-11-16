/**
 * The curtain call, the trailer's last shot before the end card. The closing chord's
 * last frame pulls back to become the stage of a gilded theatre (like the one in the
 * opening clip). The red velvet curtains close over it, bouquets are thrown from the
 * audience onto the apron, and the picture fades to black.
 *
 * It is drawn on a canvas one frame at a time from a seeded random source, so every
 * build draws the same shot. The applause under it is synthesized from single claps.
 */
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { chromium } from 'playwright';
import { W, H } from './cards.mjs';

/** When things happen in the shot (seconds from its start). The fade to black ends `black` before the end. */
export const CURTAIN = { pull: [0, 1.15], close: [0.7, 3.0], fade: 1.25, black: 0.35 };

/** Renders the shot to `out` (an mp4 encoded with `enc`), `dur` seconds over the picture in `background`. */
export async function renderCurtain({ background, out, dur, fps, enc }) {
  const bg = `data:image/png;base64,${readFileSync(background).toString('base64')}`;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    await page.setContent(`<body style="margin:0;background:#000"><canvas id="c" width="${W}" height="${H}"></canvas></body>`);
    await page.evaluate(scene, { W, H, bg, D: dur, T: CURTAIN });
    const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', '-', ...enc, '-r', String(fps), out], { stdio: ['pipe', 'ignore', 'pipe'] });
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

/** Runs in the page: sets up the theatre and defines window.draw(t). */
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

  // The stage opening (theatre coordinates: at the end of the pull-back, the screen), 16:9.
  const O = { x: 150, y: 74, w: 980, h: 551.25 };
  const cx = O.x + O.w / 2;
  const floorY = O.y + O.h;
  const F = { x: O.x - 28, y: O.y - 46, w: O.w + 56 }; // the proscenium's outer edge
  const FADE = [D - T.black - T.fade, D - T.black];

  const goldGradient = (g, x0, y0, x1, y1) => {
    const q = g.createLinearGradient(x0, y0, x1, y1);
    for (const [p, col] of [[0, '#3d2706'], [0.18, '#9b7224'], [0.38, '#f3d98a'], [0.55, '#c39a3e'], [0.8, '#6e4c14'], [1, '#2e1d05']]) q.addColorStop(p, col);
    return q;
  };

  // ---- the theatre around the opening, drawn once at twice the size (it is seen up close at first)
  const st = document.createElement('canvas');
  st.width = W * 2;
  st.height = H * 2;
  {
    const g = st.getContext('2d');
    g.scale(2, 2);
    const wall = g.createLinearGradient(0, 0, 0, H);
    wall.addColorStop(0, '#0b0203');
    wall.addColorStop(0.45, '#220809');
    wall.addColorStop(1, '#0a0202');
    g.fillStyle = wall;
    g.fillRect(-50, -50, W + 100, H + 100);
    // Gilded pilasters either side.
    for (const x of [30, W - 30 - 60]) {
      const p = g.createLinearGradient(x, 0, x + 60, 0);
      for (const [q, col] of [[0, '#1c1004'], [0.3, '#7a5418'], [0.5, '#caa04c'], [0.7, '#6a4614'], [1, '#160c03']]) p.addColorStop(q, col);
      g.globalAlpha = 0.5;
      g.fillStyle = p;
      g.fillRect(x, 24, 60, floorY - 24);
      g.globalAlpha = 1;
    }
    g.clearRect(O.x, O.y, O.w, O.h);
    // The proscenium: two posts and a lintel, with a row of rosettes.
    g.fillStyle = goldGradient(g, F.x, 0, O.x, 0);
    g.fillRect(F.x, F.y, 28, floorY - F.y);
    g.fillStyle = goldGradient(g, O.x + O.w + 28, 0, O.x + O.w, 0);
    g.fillRect(O.x + O.w, F.y, 28, floorY - F.y);
    g.fillStyle = goldGradient(g, 0, F.y, 0, O.y);
    g.fillRect(F.x, F.y, F.w, 46);
    for (let x = F.x + 32; x < F.x + F.w - 20; x += 48) {
      const r = g.createRadialGradient(x - 2, F.y + 21, 1, x, F.y + 23, 9);
      r.addColorStop(0, '#fff2b8');
      r.addColorStop(0.5, '#c8963a');
      r.addColorStop(1, '#4a3008');
      g.fillStyle = r;
      g.beginPath();
      g.arc(x, F.y + 23, 9, 0, TAU);
      g.fill();
    }
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.lineWidth = 3;
    g.strokeRect(O.x - 1.5, O.y - 1.5, O.w + 3, O.h + 3);
    // The apron, its boards running toward a point above the stage.
    g.beginPath();
    g.moveTo(F.x - 4, floorY);
    g.lineTo(F.x + F.w + 4, floorY);
    g.lineTo(W + 220, H + 30);
    g.lineTo(-220, H + 30);
    g.closePath();
    const wood = g.createLinearGradient(0, floorY, 0, H);
    wood.addColorStop(0, '#2a1209');
    wood.addColorStop(0.5, '#4d2410');
    wood.addColorStop(1, '#683317');
    g.fillStyle = wood;
    g.fill();
    g.save();
    g.clip();
    const vy = floorY - 600;
    g.strokeStyle = 'rgba(15,5,2,0.55)';
    g.lineWidth = 1.2;
    for (let xb = -500; xb <= W + 500; xb += 58) {
      const xt = cx + (xb - cx) * ((floorY - vy) / (H + 30 - vy));
      g.beginPath();
      g.moveTo(xt, floorY);
      g.lineTo(xb, H + 30);
      g.stroke();
    }
    const shade = g.createLinearGradient(0, floorY, 0, floorY + 16);
    shade.addColorStop(0, 'rgba(0,0,0,0.7)');
    shade.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = shade;
    g.fillRect(-50, floorY, W + 100, 16);
    g.restore();
    // The front edge: the footlights' trough, with a gold lip.
    g.fillStyle = '#0d0403';
    g.fillRect(-10, H - 20, W + 20, 24);
    g.fillStyle = goldGradient(g, 0, H - 23, 0, H - 19);
    g.fillRect(-10, H - 23, W + 20, 3);
  }

  // ---- the valance across the top of the opening: a velvet band, swags, gold fringe and tassels
  const va = document.createElement('canvas');
  va.width = O.w * 2;
  va.height = 2 * 84;
  {
    const v = va.getContext('2d');
    v.scale(2, 2);
    const band = v.createLinearGradient(0, 0, 0, 26);
    band.addColorStop(0, '#3a0408');
    band.addColorStop(0.6, '#9a1220');
    band.addColorStop(1, '#5a0810');
    v.fillStyle = band;
    v.fillRect(0, 0, O.w, 26);
    const n = 5;
    const sw = O.w / n;
    for (let i = 0; i < n; i++) {
      const xa = i * sw;
      const xb = xa + sw;
      const mid = (xa + xb) / 2;
      v.beginPath();
      v.moveTo(xa, 18);
      v.quadraticCurveTo(mid, 98, xb, 18);
      v.closePath();
      const r = v.createRadialGradient(mid, 26, 4, mid, 30, sw * 0.62);
      r.addColorStop(0, '#c41d30');
      r.addColorStop(0.55, '#8a0f1c');
      r.addColorStop(1, '#3a0408');
      v.fillStyle = r;
      v.fill();
      for (let k = 1; k <= 3; k++) {
        v.beginPath();
        v.moveTo(xa + k * 10, 20);
        v.quadraticCurveTo(mid, 98 - k * 17, xb - k * 10, 20);
        v.strokeStyle = 'rgba(0,0,0,0.28)';
        v.lineWidth = 3;
        v.stroke();
        v.strokeStyle = 'rgba(255,140,140,0.12)';
        v.lineWidth = 1.5;
        v.stroke();
      }
      // Gold fringe along the swag's hem.
      v.beginPath();
      v.moveTo(xa, 18);
      v.quadraticCurveTo(mid, 98, xb, 18);
      v.strokeStyle = '#c8963a';
      v.lineWidth = 3.5;
      v.stroke();
      for (let k = 0; k <= 60; k++) {
        const u = k / 60;
        const x = (1 - u) ** 2 * xa + 2 * u * (1 - u) * mid + u * u * xb;
        const y = (1 - u) ** 2 * 18 + 2 * u * (1 - u) * 98 + u * u * 18;
        v.strokeStyle = k % 2 ? '#e8c46a' : '#a77b25';
        v.lineWidth = 1.6;
        v.beginPath();
        v.moveTo(x, y + 1);
        v.lineTo(x, y + 8);
        v.stroke();
      }
    }
    v.fillStyle = goldGradient(v, 0, 21, 0, 26);
    v.fillRect(0, 21, O.w, 5);
    for (let i = 0; i <= n; i++) {
      const x = Math.min(O.w - 6, Math.max(6, i * sw));
      v.strokeStyle = '#b8862e';
      v.lineWidth = 2;
      v.beginPath();
      v.moveTo(x, 24);
      v.lineTo(x, 52);
      v.stroke();
      v.fillStyle = goldGradient(v, x - 6, 0, x + 6, 0);
      v.beginPath();
      v.moveTo(x, 50);
      v.bezierCurveTo(x + 9, 58, x + 7, 74, x, 78);
      v.bezierCurveTo(x - 7, 74, x - 9, 58, x, 50);
      v.fill();
    }
  }

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

  // Thrown from the audience across the middle of the shot, each landing in its own spot on the apron.
  const N = 9;
  const throwFrom = 1.15;
  const throwTo = Math.min(6.0, D - T.black - T.fade - 1.6);
  const slots = [...Array(N).keys()].sort(() => rnd() - 0.5);
  const bouquets = [...Array(N).keys()].map((i) => {
    const x1 = F.x + 80 + (slots[i] * (F.w - 160)) / (N - 1) + (rnd() - 0.5) * 90;
    const y1 = floorY + 16 + rnd() * (H - 28 - floorY - 16);
    const near = (y1 - floorY) / (H - floorY);
    const s1 = lerp(0.62, 0.86, near);
    const sign = rnd() < 0.5 ? -1 : 1;
    const rot0 = (rnd() - 0.5) * 0.8;
    const rotEnd = sign * (0.95 + rnd() * 1.2) + (rnd() < 0.45 ? sign * TAU : 0);
    return {
      img: makeBouquet(i),
      t0: throwFrom + (i * (throwTo - throwFrom)) / (N - 1) + (rnd() - 0.5) * 0.2,
      dur: 1.0 + rnd() * 0.25,
      x0: clamp(x1 + (rnd() - 0.5) * 520, 60, W - 60),
      y0: H + 130,
      x1,
      y1,
      yApex: 170 + rnd() * 160,
      s0: 1.3 + rnd() * 0.2,
      s1,
      rot0,
      rotEnd,
    };
  });

  // The curtains: two panels of velvet folds from behind the posts, meeting in the middle.
  const PW = O.w / 2 + 44;
  const FOLD = 44;
  const folds = (x0) => {
    const q = ctx.createLinearGradient(x0, 0, x0 + PW, 0);
    const n = PW / FOLD;
    for (let k = 0; k <= 120; k++) {
      const p = k / 120;
      const lit = (0.5 - 0.5 * Math.cos(TAU * p * n)) ** 1.25;
      q.addColorStop(p, `rgb(${Math.round(lerp(40, 196, lit))},${Math.round(lerp(3, 26, lit))},${Math.round(lerp(8, 40, lit))})`);
    }
    return q;
  };
  const edgeAt = (t) => lerp(O.x - 14, cx + 16, ease(span(t, T.close)));
  function panel(edge, lag, mirror) {
    ctx.save();
    if (mirror) {
      ctx.translate(2 * cx, 0);
      ctx.scale(-1, 1);
    }
    const top = O.y;
    const bot = floorY;
    const x0 = edge - PW;
    const lead = (start) => {
      start(edge, top);
      ctx.bezierCurveTo(edge, top + (bot - top) * 0.45, edge - lag * 0.6, bot - (bot - top) * 0.2, edge - lag, bot);
    };
    ctx.beginPath();
    ctx.moveTo(x0 - 80, top);
    lead((x, y) => ctx.lineTo(x, y));
    ctx.lineTo(x0 - 80, bot);
    ctx.closePath();
    ctx.fillStyle = folds(x0);
    ctx.fill();
    const v = ctx.createLinearGradient(0, top, 0, bot);
    v.addColorStop(0, 'rgba(0,0,0,0.55)');
    v.addColorStop(0.22, 'rgba(0,0,0,0.05)');
    v.addColorStop(0.75, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = v;
    ctx.fill();
    // The hem's gold fringe.
    ctx.fillStyle = goldGradient(ctx, 0, bot - 12, 0, bot);
    ctx.fillRect(x0 - 80, bot - 12, edge - lag - (x0 - 80), 6);
    for (let x = x0 - 80; x < edge - lag; x += 3) {
      ctx.strokeStyle = (x / 3) % 2 < 1 ? '#e8c46a' : '#9b7224';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x, bot - 6);
      ctx.lineTo(x, bot);
      ctx.stroke();
    }
    // The leading edge, lit, with a shadow just inside it.
    ctx.beginPath();
    lead((x, y) => ctx.moveTo(x, y));
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,120,120,0.4)';
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.restore();
  }

  function drawBouquet(q, t) {
    const u = (t - q.t0) / q.dur;
    if (u < 0) return;
    const f = Math.min(1, u);
    const yRest = q.y1 - 16 * q.s1;
    const cy = 2 * q.yApex - (q.y0 + yRest) / 2;
    const x = lerp(q.x0, q.x1, 1 - (1 - f) ** 1.3);
    let y = (1 - f) ** 2 * q.y0 + 2 * f * (1 - f) * cy + f * f * yRest;
    const s = 1 / lerp(1 / q.s0, 1 / q.s1, f);
    let rot = lerp(q.rot0, q.rotEnd, 1 - (1 - f) ** 1.6);
    const after = t - (q.t0 + q.dur);
    if (after > 0 && after < 0.32) {
      y -= 10 * q.s1 * Math.sin((Math.PI * after) / 0.32) * (1 - after / 0.32);
      rot += 0.14 * Math.sin(after * 26) * Math.exp(-after * 9);
    }
    const lift = yRest - y;
    if (f > 0.4) {
      ctx.save();
      ctx.globalAlpha = 0.5 * clamp(1 - lift / 260) * clamp((f - 0.4) / 0.3);
      ctx.fillStyle = '#000';
      ctx.beginPath();
      const rx = 40 * s * (1 + lift / 220);
      ctx.ellipse(x, q.y1 + 3, rx, rx * 0.22, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, lerp(1, 0.8, f ** 4));
    ctx.rotate(rot);
    ctx.scale(s, s);
    ctx.drawImage(q.img, -65, -80, 130, 150);
    ctx.restore();
  }

  window.draw = (t) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    // The camera: at first the opening fills the screen (the closing chord's last frame
    // exactly); it pulls back to the whole theatre, then pushes in a little once the
    // curtains are closed.
    const pe = ease(span(t, T.pull));
    const push = ease(span(t, [T.close[1], D])) * 0.05;
    const z = lerp(W / O.w, 1, pe) * (1 + push);
    const fx = lerp(cx, W / 2, pe);
    const fy = lerp(O.y + O.h / 2, H / 2, pe) + push * 60;
    ctx.translate(W / 2, H / 2);
    ctx.scale(z, z);
    ctx.translate(-fx, -fy);

    // The stage, dimming as the curtains close.
    const closing = ease(span(t, T.close));
    ctx.drawImage(img, O.x, O.y, O.w, O.h);
    ctx.fillStyle = `rgba(0,0,0,${0.35 * closing})`;
    ctx.fillRect(O.x, O.y, O.w, O.h);

    // The curtains, the hem trailing while they move and swinging once as they meet.
    const dt = 1 / 60;
    const speed = ((edgeAt(t) - edgeAt(t - dt)) / dt) * ((T.close[1] - T.close[0]) / 1.5 / (cx + 16 - (O.x - 14)));
    let lag = 30 * speed;
    if (t > T.close[1]) lag -= 9 * Math.sin((t - T.close[1]) * 7) * Math.exp(-(t - T.close[1]) * 2.2);
    ctx.save();
    ctx.beginPath();
    ctx.rect(O.x, O.y, O.w, O.h);
    ctx.clip();
    panel(edgeAt(t), lag, false);
    panel(edgeAt(t), lag, true);
    // The valance drops into place from behind the lintel.
    ctx.drawImage(va, O.x, O.y + lerp(-86, 0, ease(span(t, [0.2, 1.05]))), O.w, 84);
    ctx.restore();

    ctx.drawImage(st, 0, 0, W, H);

    // Light: the footlights, their wash up the curtains, and a warm spot for the curtain call.
    ctx.globalCompositeOperation = 'lighter';
    const wash = ctx.createLinearGradient(0, H, 0, floorY - 150);
    wash.addColorStop(0, 'rgba(255,170,90,0.16)');
    wash.addColorStop(1, 'rgba(255,170,90,0)');
    ctx.fillStyle = wash;
    ctx.fillRect(F.x, floorY - 150, F.w, H - floorY + 150);
    for (let x = 40; x < W; x += 80) {
      const r = ctx.createRadialGradient(x, H - 10, 0, x, H - 10, 30);
      r.addColorStop(0, 'rgba(255,225,160,0.9)');
      r.addColorStop(0.25, 'rgba(255,190,110,0.35)');
      r.addColorStop(1, 'rgba(255,190,110,0)');
      ctx.fillStyle = r;
      ctx.fillRect(x - 30, H - 40, 60, 60);
    }
    const glow = ease(span(t, [T.close[1] - 0.5, T.close[1] + 0.9]));
    if (glow > 0) {
      const r = ctx.createRadialGradient(cx, floorY - 200, 10, cx, floorY - 200, 420);
      r.addColorStop(0, `rgba(255,190,130,${0.24 * glow})`);
      r.addColorStop(1, 'rgba(255,190,130,0)');
      ctx.fillStyle = r;
      ctx.fillRect(cx - 420, floorY - 620, 840, 840);
    }
    ctx.globalCompositeOperation = 'source-over';

    // Bouquets: those lying on the apron first, back to front, then those in the air.
    const order = bouquets.slice().sort((a, b) => {
      const fa = t >= a.t0 + a.dur;
      const fb = t >= b.t0 + b.dur;
      return fa !== fb ? (fa ? -1 : 1) : a.y1 - b.y1;
    });
    for (const q of order) drawBouquet(q, t);

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
