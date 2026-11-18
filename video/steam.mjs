/**
 * The steam in the rage: puffs of it fired in bursts from the lower edges of the view
 * (from under the headset), the way steam leaves a valve: fast and dense, then
 * swelling, slowing, rising and thinning out until it is gone.
 *
 * Each puff is a soft cloud sprite (made once from value noise, so it has a billowy
 * body and a soft, lumpy edge); a few hundred of them overlap into the steam. Drawn on
 * a canvas in a headless browser as a looping PNG sequence with alpha
 * (dir/steam_0001.png ...). No randomness at draw time (a seeded source places every
 * puff), and periodic over `seconds`, so the builder can loop it.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { W, H } from './cards.mjs';

/** When each vent fires in the loop: every (a share of the loop) and phase (a share of that). */
const VENTS = [
  { every: 1 / 4, phase: 0.0 },
  { every: 1 / 4, phase: 0.5 },
  { every: 1 / 3, phase: 0.25 },
  { every: 1 / 3, phase: 0.75 },
];

/** When bursts of steam leave the vents, in seconds into a loop of `L` (for the hiss under them). */
export function steamBursts(L = 4) {
  return VENTS.flatMap((v) => Array.from({ length: Math.round(1 / v.every) }, (_, b) => ((b + v.phase) * v.every * L) % L)).sort((a, b) => a - b);
}

export async function renderSteam(dir, { seconds = 4, fps = 30 } = {}) {
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    await page.setContent(`<style>html,body{margin:0;background:transparent}canvas{display:block}</style><canvas id=c width=${W} height=${H}></canvas>`);
    await page.evaluate(scene, { W, H, L: seconds, timing: VENTS });
    const frames = Math.round(seconds * fps);
    for (let i = 0; i < frames; i++) {
      await page.evaluate((t) => window.draw(t), i / fps);
      await page.screenshot({ path: path.join(dir, `steam_${String(i + 1).padStart(4, '0')}.png`), omitBackground: true });
    }
  } finally {
    await browser.close();
  }
  return path.join(dir, 'steam_%04d.png');
}

/** Runs in the page: makes the puff sprites and the puffs, and defines window.draw(t). */
function scene({ W, H, L, timing }) {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const smooth = (a, b, x) => {
    const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return u * u * (3 - 2 * u);
  };

  // ---- the puff sprites: soft clouds from value noise
  const S = 256;
  const lattice = () => {
    const g = new Float32Array(33 * 33);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    return g;
  };
  const noise = (g, x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const at = (i, j) => g[((j & 31) * 33) + (i & 31)];
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * sx;
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * sx;
    return a + (b - a) * sy;
  };
  const fbm = (g, x, y) => {
    let s = 0;
    let a = 0.5;
    let f = 1;
    for (let o = 0; o < 5; o++) {
      s += a * noise(g, x * f + o * 7.3, y * f + o * 3.1);
      a *= 0.5;
      f *= 2;
    }
    return s / 0.97;
  };
  const sprites = [];
  for (let v = 0; v < 6; v++) {
    const g = lattice();
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const x = c.getContext('2d');
    const img = x.createImageData(S, S);
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        const u = (i / S) * 2 - 1;
        const w = (j / S) * 2 - 1;
        const d = Math.hypot(u, w);
        const n = fbm(g, (i / S) * 5, (j / S) * 5);
        // A lumpy, fairly crisp edge (the noise pushes it in and out) and a dense body.
        const edge = 1 - smooth(0.42 + 0.34 * n, 0.82 + 0.1 * n, d);
        const body = 0.75 + 0.5 * (n - 0.5);
        const a = Math.max(0, Math.min(1, edge * body));
        const k = (j * S + i) * 4;
        // Shaded like a cloud: lit from above, the hollows between the billows greyer.
        const lit = Math.min(255, 175 + 70 * smooth(0.25, 0.8, n) + 25 * smooth(0.7, -0.7, w));
        img.data[k] = lit;
        img.data[k + 1] = lit;
        img.data[k + 2] = Math.min(255, lit + 4);
        img.data[k + 3] = Math.round(a * 255);
      }
    }
    x.putImageData(img, 0, 0);
    sprites.push(c);
  }

  // ---- the puffs: bursts from four vents at the lower edges of the view
  const vents = [
    { x: 70, y: H + 50, dx: 0.42, dy: -1 },
    { x: W - 70, y: H + 50, dx: -0.42, dy: -1 },
    { x: -50, y: H * 0.62, dx: 1, dy: -0.75 },
    { x: W + 50, y: H * 0.62, dx: -1, dy: -0.75 },
  ].map((v, i) => ({ ...v, every: L * timing[i].every, phase: timing[i].phase }));
  const puffs = [];
  for (const v of vents) {
    const n = Math.round(L / v.every);
    const len = Math.hypot(v.dx, v.dy);
    for (let b = 0; b < n; b++) {
      const start = (b + v.phase) * v.every;
      // A burst: a quick jet of puffs, densest at its start.
      const count = 11;
      for (let k = 0; k < count; k++) {
        const u = k / count;
        const spread = (rnd() - 0.5) * 0.5;
        const ca = Math.cos(spread);
        const sa = Math.sin(spread);
        const dx = (v.dx * ca - v.dy * sa) / len;
        const dy = (v.dx * sa + v.dy * ca) / len;
        puffs.push({
          born: (start + u * u * 0.35) % L,
          life: 0.75 + rnd() * 0.6,
          x: v.x + (rnd() - 0.5) * 40,
          y: v.y + (rnd() - 0.5) * 30,
          vx: dx * (900 + rnd() * 600) * (1 - 0.4 * u),
          vy: dy * (900 + rnd() * 600) * (1 - 0.4 * u),
          r0: 18 + rnd() * 16,
          r1: 90 + rnd() * 90,
          a: (0.5 + rnd() * 0.25) * (1 - 0.3 * u),
          spin: (rnd() - 0.5) * 1.2,
          rot: rnd() * Math.PI * 2,
          sprite: sprites[Math.floor(rnd() * sprites.length)],
        });
      }
    }
  }

  const ctx = document.getElementById('c').getContext('2d');
  window.draw = (t) => {
    ctx.clearRect(0, 0, W, H);
    for (const p of puffs) {
      const age = (((t - p.born) % L) + L) % L;
      if (age > p.life) continue;
      const u = age / p.life;
      // Fast out of the vent, slowed by the air (drag), lifted as it warms the air (buoyancy).
      const drag = 3.2;
      const travel = (1 - Math.exp(-drag * age)) / drag;
      const x = p.x + p.vx * travel;
      const y = p.y + p.vy * travel - 60 * age * age;
      // It swells fast at first, then more slowly; it is densest just out of the vent.
      const r = p.r0 + (p.r1 - p.r0) * (1 - Math.exp(-2.6 * age));
      const alpha = p.a * smooth(0, 0.05, u) * (1 - smooth(0.15, 1, u)) ** 1.3;
      ctx.save();
      ctx.globalAlpha = alpha;
      // Softer as it thins out: fresh steam has a crisp edge, old steam none.
      ctx.filter = `blur(${(1 + 9 * u).toFixed(1)}px)`;
      ctx.translate(x, y);
      ctx.rotate(p.rot + p.spin * age);
      ctx.drawImage(p.sprite, -r, -r, r * 2, r * 2);
      ctx.restore();
    }
  };
}
