/**
 * Renders the first pass's text cards to PNGs with Playwright: placeholders for
 * the AI clips (no AI video in the first pass; each shows what the clip will
 * be), trailer title cards, lower thirds, credits and voiceover subtitles.
 * Overlays are transparent; AI cards and flashes are full frames.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

export const W = 1280;
export const H = 720;

/** What each AI clip will be: [title, what happens, emoji faces]. */
export const AI = {
  '1-1': ['The empty hall', 'Slow push in on a dark, gilded concert hall. Empty chairs, no instruments. A spotlight lands on the podium and TECHNICKEL steps into it.', '😎'],
  '1-2': ['The introduction', 'TECHNICKEL on the podium turns to the camera, gives a small bow and gestures at the empty chairs behind him.', '😎'],
  '1-3': ['Gag: the plane seat', 'A cello buckled into a window seat with a tiny airline meal; its cellist squeezed in the middle seat with two boarding passes. A flight attendant hands the cello pretzels.', '😩 🙂'],
  '1-4': ['Gag: 2 a.m.', 'A wall clock reads 2:13. A drummer plays a full kit in a cramped apartment; upstairs, someone pounds the floor with a broom. A note slides under the door: PLEASE.', '😤 😬'],
  '1-5': ['Gag: the stairs', 'Two movers wedged sideways in a stairwell with a black grand piano, completely stuck. The pianist sits on the bench in defeat.', '😣 😰'],
  '1-6': ['Gag: the library', 'A percussionist in a silent library holds two cymbals aloft. A librarian lowers her glasses and stares. The cymbals freeze an inch apart.', '😁 🤫'],
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
  .slam{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.62)}
  .slam div{font:900 118px/1 'Segoe UI Black','Segoe UI';letter-spacing:.04em;text-align:center;text-shadow:0 6px 40px rgba(0,0,0,.8);padding:0 40px}
  .slam small{display:block;margin-top:22px;font:600 34px 'Segoe UI';letter-spacing:.3em;color:#ffb000}
  .lower{position:absolute;left:44px;bottom:78px;padding:12px 22px;border-left:6px solid #ffb000;background:rgba(10,10,16,.78);border-radius:6px}
  .lower b{font:700 30px 'Segoe UI';letter-spacing:.04em;display:block}
  .lower i{font:italic 400 24px 'Segoe UI';color:#e0e0e8}
  .sub{position:absolute;left:0;right:0;bottom:22px;text-align:center}
  .sub span{display:inline-block;max-width:1080px;padding:6px 16px;background:rgba(0,0,0,.66);border-radius:6px;font:500 26px/1.3 'Segoe UI'}
  .bug{position:absolute;right:20px;top:16px;font:700 16px 'Segoe UI';letter-spacing:.12em;padding:4px 10px;border:2px solid rgba(255,255,255,.8);border-radius:4px;background:rgba(0,0,0,.4)}
  .credit{position:absolute;font:500 18px/1.35 'Segoe UI';padding:6px 12px;background:rgba(0,0,0,.55);border-radius:4px;max-width:560px}
  .end{position:absolute;inset:0;background:#0d0d14;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center}
  .end h1{font:900 110px 'Segoe UI Black','Segoe UI';letter-spacing:.08em}
  .end h2{font:500 28px 'Segoe UI';color:#ffb000}
  .end p{font:400 17px/1.4 'Segoe UI';color:#a9a9bb;max-width:1000px}
  .title{position:absolute;inset:0;background:rgba(0,0,0,.35);display:flex;flex-direction:column;align-items:center;justify-content:center}
  .title h1{font:900 120px 'Segoe UI Black','Segoe UI';letter-spacing:.08em;text-shadow:0 6px 40px #000}
  .title h2{font:500 30px 'Segoe UI';letter-spacing:.06em;text-shadow:0 2px 12px #000}
  .white{position:absolute;inset:0;background:#fff}
`;

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
      return `<div class="slam"><div>${esc(card.text)}${card.sub ? `<small>${esc(card.sub)}</small>` : ''}</div></div>`;
    case 'lower':
      return `<div class="lower"><b>${esc(card.text[0])}</b>${card.text[1] ? `<i>${esc(card.text[1])}</i>` : ''}</div>`;
    case 'sub':
      return `<div class="sub"><span>${esc(card.text)}</span></div>`;
    case 'bug':
      return `<div class="bug">IN-APP CAPTURE</div>`;
    case 'credit':
      return `<div class="credit" style="${card.style}">${esc(card.text)}</div>`;
    case 'title':
      return `<div class="title"><h1>${esc(card.text[0])}</h1><h2>${esc(card.text[1] ?? '')}</h2></div>`;
    case 'end':
      return `<div class="end"><h1>CHORDLESS</h1><h2>Built with IWSDK, Meta's Immersive Web SDK, for Meta Quest</h2><p>https://technickel-dev.github.io/chordless/ (placeholder URL) · Meta VR Start Developer Competition 2026</p><p>Music: Beethoven, Ode to Joy (1824), and Rossini, William Tell Overture, Finale (1829), both public domain. William Tell arranged from the full score typeset by Max Wilkinson (2008), IMSLP #22579, CC BY 3.0. All music is in-app capture: every note is played and synthesized live by Chordless. Built with IWSDK and WebXR. Conductor scenes are AI-generated; all gameplay is real.</p></div>`;
    case 'white':
      return `<div class="white"></div>`;
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
    await page.setContent(`<style>${base}</style>${html(card)}`);
    const file = path.join(dir, `${card.id}.png`);
    await page.screenshot({ path: file, omitBackground: !['ai', 'end', 'white'].includes(card.kind) });
    out[card.id] = file;
  }
  await browser.close();
  return out;
}
