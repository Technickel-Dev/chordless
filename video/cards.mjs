/**
 * Renders the first pass's text cards to PNGs with Playwright: placeholders for
 * the AI clips (no AI video in the first pass; each shows what the clip will
 * be), trailer title cards, lower thirds, credits and voiceover subtitles.
 * Overlays are transparent; AI cards and flashes are full frames.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const W = 1280;
export const H = 720;

/** What each AI clip will be: [title, what happens, emoji faces]. */
export const AI = {
  '1-1': ['The empty hall', 'Slow push in on a dark, gilded concert hall. Empty chairs, no instruments. A spotlight lands on the podium and TECHNICKEL steps into it.', '😎'],
  '1-2': ['The introduction', 'TECHNICKEL on the podium turns to the camera, gives a small bow and gestures at the empty chairs behind him.', '😎'],
  '1-2b': ['Talking clip to generate', 'TECHNICKEL in the spotlight, talking to camera: "Good evening, ladies and gentlemen! I’m Technickel, conductor of AI. Behind every great musician is a very inconvenient instrument."', '😎'],
  '1-3': ['Gag: the plane seat', 'A guitarist in an airplane aisle tries to force a guitar case into the overhead bin. It will not go.', '😩'],
  '1-4': ['Gag: 2 a.m.', 'A drummer plays a full kit in the basement at night; upstairs, a sleeper wakes up.', '😎 😩'],
  '1-5': ['Gag: the price', 'In a music shop, a would-be violinist reads the price tag on a violin in a glass case, then looks into his wallet.', '😳'],
  '1-6': ['Gag: getting it to the jam', 'A pianist pushes an upright piano up a steep street of row houses, on the way to a jam session.', '😣'],
  '1-7': ['The vanishing act', 'The hall, fully lit, every chair holding an instrument. TECHNICKEL flicks the baton once and every instrument dissolves into golden sparkles, leaving empty chairs.', '😎'],
  '1-9': ['From the top', 'TECHNICKEL in a white VR headset taps his baton three times on the stand, raises both arms, holds one beat, then gives a sharp downbeat.', '😎'],
  'c-1': ['The look', 'Close-up, headset on. The sunglasses emoji slowly changes to a flat, unimpressed face. A muscle twitches near his white-gloved fist.', '😎 → 😐'],
  'c-2': ['The fist', 'Extreme close-up: a white glove tightens around a guitar neck until the fabric creaks. Dust falls off the strings.', '🧤'],
  'c-3': ['The face', 'Hard red side light. The angry face trembles, then shakes into a furious one. Steam puffs from under the headset. Fast push in.', '😠 → 🤬'],
  'c-4': ['The podium', 'Low angle, the empty podium, red light pouring in. The music stand rattles, shakes itself off the podium and clatters across the stage.', '🎼'],
  'c-5': ['The grin', 'Splinters drift past in slow motion. The furious face relaxes into a satisfied grin.', '🤬 → 😈'],
  'c-grid': ['Conducting (grid centre tile)', 'TECHNICKEL conducting a neutral 2/4 pattern, retimed to 152 bpm in the edit.', '😎'],
  'c-6': ['The cutoff', 'TECHNICKEL snaps a raised hand into a tight fist. The confetti hangs in mid-air for a beat, then falls.', '😎'],
  '7-1': ['Ovation', 'Headset pushed up, TECHNICKEL takes a deep, theatrical bow. Golden confetti drifts down through the spotlight.', '😎'],
  'real-quest': ['REAL FOOTAGE: your own hands on a Quest', 'Not recorded yet. About 8 s of you playing the guitar on a real headset, with its own audio.', '🥽'],
  'missing-trombone': ['Trombone take', 'Not captured in this first pass.', '🎺'],
  'missing-horn': ['French horn take', 'Not captured in this first pass.', '📯'],
};

const base = `
  *{box-sizing:border-box;margin:0}
  html,body{width:${W}px;height:${H}px;overflow:hidden;background:transparent;font-family:'Segoe UI','Segoe UI Emoji',system-ui,sans-serif;color:#fff}
  .ai{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 35%,#2c2a3e,#12121a 70%);display:flex;flex-direction:column;justify-content:center;padding:0 90px;gap:18px}
  .tag{font:700 22px 'Segoe UI';letter-spacing:.14em;color:#ffb000;text-transform:uppercase}
  .ai h1{font:800 54px/1.1 'Segoe UI'}
  .ai p{font:400 28px/1.4 'Segoe UI';color:#d7d7e0;max-width:1000px}
  .ai .face{font-size:64px}
  .ai .note{font:500 20px 'Segoe UI';color:#8d8da3;margin-top:8px}
  .slam{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,var(--scrim,.62))}
  .slam div{font:400 104px/1.05 'Shrikhand';color:#fafaf9;text-align:center;text-shadow:0 4px 0 rgba(0,0,0,.55),0 8px 40px rgba(0,0,0,.85);padding:0 60px}
  .slam small{display:block;margin-top:18px;font:400 40px 'Shrikhand';color:#f59e0b;letter-spacing:.02em;text-shadow:0 3px 0 rgba(0,0,0,.6),0 4px 18px rgba(0,0,0,.8)}
  .lower{position:absolute;left:44px;bottom:78px;padding:12px 22px;border-left:6px solid #ffb000;background:rgba(10,10,16,.78);border-radius:6px}
  .lower b{font:700 30px 'Segoe UI';letter-spacing:.04em;display:block}
  .lower i{font:italic 400 24px 'Segoe UI';color:#e0e0e8}
  .sub{position:absolute;left:0;right:0;bottom:22px;text-align:center}
  .sub span{display:inline-block;max-width:1080px;padding:6px 16px;background:rgba(0,0,0,.66);border-radius:6px;font:500 26px/1.3 'Segoe UI'}
  .bug{position:absolute;right:20px;top:16px;font:700 16px 'Segoe UI';letter-spacing:.12em;padding:4px 10px;border:2px solid rgba(255,255,255,.8);border-radius:4px;background:rgba(0,0,0,.4)}
  .credit{position:absolute;font:500 18px/1.35 'Segoe UI';padding:6px 12px;background:rgba(0,0,0,.55);border-radius:4px;max-width:560px}
  .end{position:absolute;inset:0;background:#0d0d14;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center}
  .logo{height:auto;filter:drop-shadow(0 6px 24px rgba(0,0,0,.55))}
  .end .logo{width:700px;margin-bottom:10px;filter:none}
  .end h2{font:500 28px 'Segoe UI';color:#ffb000}
  .end p{font:400 17px/1.4 'Segoe UI';color:#a9a9bb;max-width:1000px}
  .title{position:absolute;inset:0;background:rgba(0,0,0,.35);display:flex;flex-direction:column;align-items:center;justify-content:center}
  .title .logo{width:780px;margin-bottom:22px}
  .title h2{font:500 34px 'Segoe UI';letter-spacing:.04em;text-shadow:0 2px 12px #000}
  .title h2 em{color:#fbbf24;font-style:italic;font-weight:700}
  .white{position:absolute;inset:0;background:#fff}
`;

/** The Chordless logo (the app's own, public/icons/logo.svg), inline so the cards need no server. */
const LOGO = `data:image/svg+xml;base64,${readFileSync(new URL('../public/icons/logo.svg', import.meta.url)).toString('base64')}`;

/** Shrikhand (SIL Open Font License), the face of the logo's wordmark. */
const FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Shrikhand&display=block">';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** The HTML for one card, by kind. */
function html(card) {
  switch (card.kind) {
    case 'ai': {
      const [title, what, faces] = AI[card.shot];
      const label = card.shot.startsWith('real-') || card.shot.startsWith('missing-') ? 'PLACEHOLDER' : `AI CLIP ${card.shot}`;
      return `<div class="ai"><div class="tag">${label} · not generated in this first pass</div><h1>${esc(title)}</h1><div class="face">${faces}</div><p>${esc(what)}</p></div>`;
    }
    case 'slam':
      return `<div class="slam"${card.scrim != null ? ` style="--scrim:${card.scrim}"` : ''}><div>${esc(card.text)}${card.sub ? `<small>${esc(card.sub)}</small>` : ''}</div></div>`;
    case 'lower':
      return `<div class="lower"><b>${esc(card.text[0])}</b>${card.text[1] ? `<i>${esc(card.text[1])}</i>` : ''}</div>`;
    case 'sub':
      return `<div class="sub"><span>${esc(card.text)}</span></div>`;
    case 'bug':
      return `<div class="bug">IN-APP CAPTURE</div>`;
    case 'credit':
      return `<div class="credit" style="${card.style}">${esc(card.text)}</div>`;
    case 'title':
      // *word* is set like the app's title screen: amber italics.
      return `<div class="title"><img class="logo" src="${LOGO}" alt="${esc(card.text[0])}"><h2>${esc(card.text[1] ?? '').split('*').map((part, i) => (i % 2 ? `<em>${part}</em>` : part)).join('')}</h2></div>`;
    case 'end':
      return `<div class="end"><img class="logo" src="${LOGO}" alt="Chordless"><h2>Built with IWSDK, Meta's Immersive Web SDK, for Meta Quest</h2><p>https://technickel-dev.github.io/chordless/ (placeholder URL) · Meta VR Start Developer Competition 2026</p><p>Music: Beethoven, Ode to Joy (1824), and Rossini, William Tell Overture, Finale (1829), both public domain. William Tell arranged from the full score typeset by Max Wilkinson (2008), IMSLP #22579, CC BY 3.0. All music is in-app capture: every note is played and synthesized live by Chordless. Built with IWSDK and WebXR. Conductor scenes are AI-generated; all gameplay is real.</p></div>`;
    case 'white':
      return `<div class="white"></div>`;
    case 'redvig':
      // Red creeping in from the edges of the view; the builder fades it in over seconds.
      return `<div style="position:absolute;inset:0;background:radial-gradient(ellipse 62% 66% at 50% 50%,rgba(140,0,0,0) 30%,rgba(170,10,0,.5) 62%,rgba(95,0,0,.96) 100%)"></div>`;
    case 'redflash':
      return `<div style="position:absolute;inset:0;background:rgba(220,10,0,.55)"></div>`;
    default:
      throw new Error(`unknown card kind ${card.kind}`);
  }
}

/**
 * Steam: soft white puffs rising from the lower corners and edges of the view,
 * as a looping PNG sequence with alpha (dir/steam_0001.png ...). Deterministic,
 * and periodic over `seconds`, so the builder can loop it.
 */
export async function renderSteam(dir, { seconds = 4, fps = 30 } = {}) {
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.setContent(`<style>html,body{margin:0;background:transparent}canvas{display:block}</style><canvas id=c width=${W} height=${H}></canvas>`);
  await page.evaluate(([W, H, loop]) => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const puffs = [];
    for (let i = 0; i < 46; i++) {
      const side = i % 3; // 0 left edge, 1 right edge, 2 low centre-ish
      puffs.push({
        born: rnd() * loop,
        life: 2.4 + rnd() * 1.4,
        x: side === 0 ? -10 + rnd() * 120 : side === 1 ? W - 110 + rnd() * 120 : W * (0.3 + rnd() * 0.4),
        y: side === 2 ? H + 30 : H * (0.55 + rnd() * 0.45),
        dx: (side === 0 ? 1 : side === 1 ? -1 : rnd() - 0.5) * (30 + rnd() * 60),
        dy: -(150 + rnd() * 170),
        r0: 38 + rnd() * 30,
        r1: 170 + rnd() * 120,
        a: 0.2 + rnd() * 0.2,
      });
    }
    const ctx = document.getElementById('c').getContext('2d');
    window.draw = (t) => {
      ctx.clearRect(0, 0, W, H);
      ctx.filter = 'blur(18px)';
      for (const p of puffs) {
        for (const k of [-1, 0]) {
          const age = ((t - p.born) % loop + loop) % loop + (k === -1 ? 0 : 0);
          if (age > p.life) continue;
          const u = age / p.life;
          const x = p.x + p.dx * age;
          const y = p.y + p.dy * age;
          const r = p.r0 + (p.r1 - p.r0) * u;
          const alpha = p.a * Math.sin(Math.PI * Math.min(1, u * 1.05)) ** 0.8;
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, `rgba(245,245,250,${alpha})`);
          g.addColorStop(1, 'rgba(245,245,250,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
      }
    };
  }, [W, H, seconds]);
  const frames = Math.round(seconds * fps);
  for (let i = 0; i < frames; i++) {
    await page.evaluate((t) => window.draw(t), i / fps);
    await page.screenshot({ path: path.join(dir, `steam_${String(i + 1).padStart(4, '0')}.png`), omitBackground: true });
  }
  await browser.close();
  return path.join(dir, 'steam_%04d.png');
}

/** Renders every card to `dir`/<id>.png; returns the paths by id. */
export async function renderCards(cards, dir) {
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const out = {};
  for (const card of cards) {
    await page.setContent(`${FONTS}<style>${base}</style>${html(card)}`, { waitUntil: 'networkidle' });
    const ready = await page.evaluate(async () => (await document.fonts.ready, document.fonts.check('40px Shrikhand')));
    if (card.kind === 'slam' && !ready) throw new Error('the Shrikhand font did not load (it comes from Google Fonts)');
    const file = path.join(dir, `${card.id}.png`);
    await page.screenshot({ path: file, omitBackground: !['ai', 'end', 'white'].includes(card.kind) });
    out[card.id] = file;
  }
  await browser.close();
  return out;
}
