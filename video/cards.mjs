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
  .bug{position:absolute;right:20px;top:16px;display:flex;align-items:center;gap:10px;padding:6px 16px 6px 6px;background:rgba(10,10,16,.72);border:1px solid rgba(245,158,11,.5);border-radius:14px}
  .bug img{width:36px;height:36px;border-radius:9px}
  .bug b{display:block;font:400 20px/1.15 'Shrikhand';color:#f59e0b}
  .song{position:absolute;right:44px;bottom:78px;display:flex;align-items:center;gap:14px;padding:10px 22px 12px 16px;border-right:6px solid #ffb000;background:rgba(10,10,16,.78);border-radius:6px;text-align:right}
  .song svg{width:36px;height:36px;flex:none}
  .song b{display:block;font:400 28px/1.2 'Shrikhand';color:#fafaf9}
  .song span{display:block;margin-top:2px;font:500 16px 'Segoe UI';letter-spacing:.03em;color:#c9c9d6}
  .end{position:absolute;inset:0;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center}
  .logo{height:auto;filter:drop-shadow(0 6px 24px rgba(0,0,0,.55))}
  .end .logo{width:700px;margin-bottom:10px;filter:none}
  .end h2{font:500 28px 'Segoe UI';color:#ffb000}
  .end p{font:400 17px/1.4 'Segoe UI';color:#a9a9bb;max-width:1000px}
  .end .url{font:600 44px 'Segoe UI';color:#fafaf9;letter-spacing:.01em;margin:0 0 10px}
  .end .url small{display:block;font:400 30px 'Shrikhand';color:#f59e0b;margin-bottom:6px}
  .title{position:absolute;inset:0;background:rgba(0,0,0,.15);display:flex;flex-direction:column;align-items:center;justify-content:center}
  .title .logo{width:780px;margin-bottom:22px}
  .title h2{font:500 34px 'Segoe UI';letter-spacing:.04em;text-shadow:0 2px 12px #000}
  .title h2 em{color:#fbbf24;font-style:italic;font-weight:700}
  .white{position:absolute;inset:0;background:#fff}
`;

/** The Chordless logo (the app's own, public/icons/logo.svg), inline so the cards need no server. */
const LOGO = `data:image/svg+xml;base64,${readFileSync(new URL('../public/icons/logo.svg', import.meta.url)).toString('base64')}`;

/** The app icon (public/icons/icon.svg), for the in-app capture badge. */
const ICON = `data:image/svg+xml;base64,${readFileSync(new URL('../public/icons/icon.svg', import.meta.url)).toString('base64')}`;

/** Shrikhand (SIL Open Font License), the face of the logo's wordmark. */
const FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Shrikhand&display=block">';

/** A music note in the trailer's amber (Material Symbols "music_note", Apache 2.0). */
const NOTE = '<svg viewBox="0 0 24 24"><path fill="#f59e0b" d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>';

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
      return `<div class="lower"${card.bottom != null ? ` style="bottom:${card.bottom}px"` : ''}><b>${esc(card.text[0])}</b>${card.text[1] ? `<i>${esc(card.text[1])}</i>` : ''}</div>`;
    case 'sub':
      return `<div class="sub"${card.bottom != null ? ` style="bottom:${card.bottom}px"` : ''}><span>${esc(card.text)}</span></div>`;
    case 'bug':
      // The app's icon and "In-app capture" in the logo's face.
      return `<div class="bug"><img src="${ICON}" alt=""><b>In-app capture</b></div>`;
    case 'song':
      // A song's title in the logo's face, with the composer, year and licence underneath: the
      // lower third's mirror image, at the bottom right.
      return `<div class="song"${card.bottom != null ? ` style="bottom:${card.bottom}px"` : ''}>${NOTE}<div><b>${esc(card.text[0])}</b><span>${esc(card.text[1])}</span></div></div>`;
    case 'title':
      // *word* is set like the app's title screen: amber italics.
      return `<div class="title"><img class="logo" src="${LOGO}" alt="${esc(card.text[0])}"><h2>${esc(card.text[1] ?? '').split('*').map((part, i) => (i % 2 ? `<em>${part}</em>` : part)).join('')}</h2></div>`;
    case 'end':
      return `<div class="end"><img class="logo" src="${LOGO}" alt="Chordless"><div class="url"><small>Play it now</small>https://chordless.technickel.dev</div><h2>Built with Meta's Immersive Web SDK (IWSDK)</h2><p>Meta VR Start Developer Competition 2026</p><p>Music: Beethoven, <i>Ode to Joy</i> · Rossini, <i>William Tell Overture</i>, Finale · public domain<br>William Tell arranged from Max Wilkinson's typeset score (IMSLP #22579, CC BY 3.0)<br>All music and gameplay recorded in Chordless · Conductor and story scenes are AI-generated</p></div>`;
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

/** Renders every card to `dir`/<id>.png; returns the paths by id. */
export async function renderCards(cards, dir) {
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const out = {};
  for (const card of cards) {
    await page.setContent(`${FONTS}<style>${base}</style>${html(card)}`, { waitUntil: 'networkidle' });
    const ready = await page.evaluate(async () => (await document.fonts.ready, document.fonts.check('40px Shrikhand')));
    if (['slam', 'bug', 'song'].includes(card.kind) && !ready) throw new Error('the Shrikhand font did not load (it comes from Google Fonts)');
    const file = path.join(dir, `${card.id}.png`);
    await page.screenshot({ path: file, omitBackground: !['ai', 'end', 'white'].includes(card.kind) });
    out[card.id] = file;
  }
  await browser.close();
  return out;
}
