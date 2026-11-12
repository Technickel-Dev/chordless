/**
 * Capture helpers: drive Chordless in a plain Playwright Chromium (not IWSDK's
 * managed browser), record its picture with Playwright's video recorder and
 * its sound by tapping everything wired to the AudioContext destination.
 *
 * A take is a pair of files in video/build/takes: <name>.webm (picture) and
 * <name>.audio.webm (sound). video/build.mjs lines them up and cuts them.
 *
 * With `capture: 'canvas'` the page records itself instead: the app's canvas
 * and every audio context, mixed, go into one MediaRecorder, so picture and
 * sound share one clock (and nothing but the render is in the picture). The
 * performers report their clock each frame (window.__performTick), so the
 * builder can tell where each beat of the score fell in the take.
 */
import { chromium } from 'playwright';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { createWriteStream, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const TAKES = path.join(ROOT, 'video', 'build', 'takes');
export const URL = process.env.CHORDLESS_URL ?? 'https://localhost:8081/';
export const SIZE = { width: 1280, height: 720 };

const tapAudio = ({ mode } = {}) => {
  // What IWSDK's managed browser sets, so the page installs the IWER_MCP bridge the play scripts use.
  window.__IWER_MCP_MANAGED = true;
  window.__IWSDK_MANAGED_BROWSER_TARGET = true;
  // The app has one audio context per instrument synth. Every context that is
  // wired to speakers gets its own recorder, started when it is first wired.
  const connect = AudioNode.prototype.connect;
  window.__recs = [];
  const mix = {};
  const mixer = () => {
    if (!mix.ctx) {
      mix.ctx = new AudioContext({ sampleRate: 48000 });
      mix.dest = mix.ctx.createMediaStreamDestination();
      mix.ctx.resume?.();
    }
    return mix;
  };
  AudioNode.prototype.connect = function (target, ...rest) {
    const ctx = this.context;
    if (mode === 'canvas' && target === ctx.destination && ctx instanceof AudioContext && ctx !== mix.ctx) {
      // Every context's sound, into one mix the recorder takes with the picture.
      if (!ctx.__tap) {
        ctx.__tap = ctx.createMediaStreamDestination();
        const m = mixer();
        connect.call(m.ctx.createMediaStreamSource(ctx.__tap.stream), m.dest);
      }
      connect.call(this, ctx.__tap);
    } else if (target === ctx.destination && ctx instanceof AudioContext && ctx !== mix.ctx) {
      if (!ctx.__tap) {
        ctx.__tap = ctx.createMediaStreamDestination();
        const chunks = [];
        const rec = new MediaRecorder(ctx.__tap.stream, { mimeType: 'audio/webm;codecs=opus' });
        rec.ondataavailable = (e) => chunks.push(e.data);
        rec.start(250);
        window.__recs.push({ rec, chunks, startedAt: Date.now() });
      }
      connect.call(this, ctx.__tap);
    }
    return connect.call(this, target, ...rest);
  };
  window.__stopRec = () =>
    Promise.all(
      window.__recs.map(
        ({ rec, chunks, startedAt }) =>
          new Promise((resolve) => {
            rec.onstop = async () => {
              const buf = new Uint8Array(await new Blob(chunks).arrayBuffer());
              let s = '';
              for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
              resolve({ b64: btoa(s), startedAt });
            };
            rec.stop();
          }),
      ),
    );
  if (mode === 'canvas') {
    window.__marks = [];
    window.__ticks = [];
    /** Starts recording the app's canvas and the mixed sound. Times below are ms from here. */
    window.__startCapture = ({ fps = 30, bits = 14e6 } = {}) => {
      const canvas = window.FRAMEWORK_MCP_RUNTIME.world.renderer.domElement;
      const m = mixer();
      const stream = new MediaStream([...canvas.captureStream(fps).getVideoTracks(), ...m.dest.stream.getAudioTracks()]);
      const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus', videoBitsPerSecond: bits, audioBitsPerSecond: 256000 });
      let chain = Promise.resolve();
      rec.ondataavailable = (e) => {
        chain = chain.then(async () => {
          const buf = new Uint8Array(await e.data.arrayBuffer());
          let s = '';
          for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
          await window.__capChunk(btoa(s));
        });
      };
      const done = new Promise((r) => (rec.onstop = () => chain.then(r)));
      rec.start(1000);
      window.__cap = { rec, start: performance.now(), done };
      return { width: canvas.width, height: canvas.height, audioContexts: m.ctx.state };
    };
    window.__stopCapture = async () => {
      window.__cap.rec.stop();
      await window.__cap.done;
      return { marks: window.__marks, ticks: window.__ticks };
    };
    const since = (now) => +(now - (window.__cap?.start ?? now)).toFixed(1);
    window.__mark = (what, extra = {}) => window.__marks.push({ what, t: since(performance.now()), ...extra });
    // Each performance: [ms into the take, the performer's clock in s] every frame.
    window.__performTick = (now, clock) => {
      if (!window.__cap) return;
      const run = window.__ticks.at(-1);
      if (!run || clock < run.at(-1)[1]) window.__ticks.push([]);
      window.__ticks.at(-1).push([since(now), +clock.toFixed(4)]);
    };
  }
  // The play scripts' banner and the emulator's badge are not part of the picture.
  addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = '#e2e-banner{display:none!important}';
    document.head.appendChild(style);
  });
  // The emulator's developer UI (its toolbar, hand panels, move gizmo and the
  // "Remote Control Active" badge) lives in shadow roots on the page; it is
  // not part of the picture, and it surfaces on its own mid-take.
  const hideDevUi = () => {
    for (const el of document.querySelectorAll('*')) {
      if (el.shadowRoot) el.style.setProperty('display', 'none', 'important');
      // The emulator's overlay canvas (gizmos); the app's own canvas is not positioned.
      else if (el.tagName === 'CANVAS' && ['fixed', 'absolute'].includes(getComputedStyle(el).position)) el.style.setProperty('display', 'none', 'important');
    }
  };
  setInterval(hideDevUi, 300);
};

/** Opens the app. `query` is added to the URL (for example "scene=cliffside"). */
export async function openApp({ name, query = '', capture = 'screencast' } = {}) {
  await mkdir(TAKES, { recursive: true });
  const browser = await chromium.launch({
    headless: false,
    args: ['--autoplay-policy=no-user-gesture-required', '--ignore-certificate-errors', '--enable-unsafe-swiftshader', `--window-size=${SIZE.width},${SIZE.height + 90}`],
  });
  const canvas = capture === 'canvas';
  const context = await browser.newContext({
    viewport: SIZE,
    ignoreHTTPSErrors: true,
    ...(canvas ? {} : { recordVideo: { dir: path.join(TAKES, '_tmp'), size: SIZE } }),
  });
  await context.addInitScript(tapAudio, { mode: capture });
  const raw = path.join(TAKES, `${name}.raw.webm`);
  let sink = null;
  if (canvas) {
    rmSync(raw, { force: true });
    await context.exposeBinding('__capChunk', async (_src, b64) => {
      sink ??= createWriteStream(raw);
      await new Promise((r) => sink.write(Buffer.from(b64, 'base64'), r));
    });
  }
  const page = await context.newPage();
  const videoStart = Date.now();
  page.on('pageerror', (e) => console.error('pageerror:', String(e).slice(0, 300)));
  await page.goto(URL + (query ? `?${query}` : ''), { waitUntil: 'load' });
  const frame = page.mainFrame();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const hideBanner = () => page.addStyleTag({ content: '#e2e-banner{display:none!important}' });

  let info = null;
  /** Starts the in-page recording (canvas mode), after the app has started. */
  const startCapture = async (opts) => (info = await page.evaluate((o) => window.__startCapture(o), opts ?? {}));
  /** A named moment, in ms from the start of the recording. */
  const mark = (what, extra) => page.evaluate(([w, e]) => window.__mark(w, e), [what, extra ?? {}]);

  /** Saves the picture and the sound under TAKES/<name>.* and closes the browser. */
  async function save(audio) {
    if (canvas) {
      const log = await page.evaluate(() => (window.__cap ? window.__stopCapture() : null)).catch(() => null);
      if (sink) await new Promise((r) => sink.end(r));
      await browser.close();
      // Remux for seeking, and the sound on its own for finding notes in it.
      spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', raw, '-c', 'copy', path.join(TAKES, `${name}.webm`)], { stdio: 'inherit' });
      spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', raw, '-vn', '-ac', '2', '-ar', '48000', path.join(TAKES, `${name}.audio.wav`)], { stdio: 'inherit' });
      rmSync(raw, { force: true });
      const meta = { name, capture: 'canvas', videoStart: 0, audioStart: 0, info, marks: log?.marks ?? [], ticks: log?.ticks ?? [] };
      await writeFile(path.join(TAKES, `${name}.json`), JSON.stringify(meta));
      return { name, info, marks: meta.marks.length, performances: meta.ticks.length };
    }
    const video = page.video();
    await context.close();
    const tmp = await video.path();
    await rename(tmp, path.join(TAKES, `${name}.webm`));
    const parts = (audio ?? []).filter((a) => a.b64.length > 2000);
    const meta = { name, videoStart, audioStart: parts.length ? Math.min(...parts.map((a) => a.startedAt)) : null, contexts: parts.length };
    if (parts.length) {
      const files = [];
      for (const [i, a] of parts.entries()) {
        const f = path.join(TAKES, `${name}.part${i}.webm`);
        await writeFile(f, Buffer.from(a.b64, 'base64'));
        files.push(f);
      }
      // One sound from the contexts: each delayed by when its recorder started.
      const args = ['-y', '-hide_banner', '-loglevel', 'error'];
      files.forEach((f) => args.push('-i', f));
      const fc = parts.map((a, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${a.startedAt - meta.audioStart}|${a.startedAt - meta.audioStart}[d${i}]`).join(';') + `;${parts.map((_, i) => `[d${i}]`).join('')}amix=inputs=${parts.length}:normalize=0:duration=longest[out]`;
      spawnSync('ffmpeg', [...args, '-filter_complex', fc, '-map', '[out]', path.join(TAKES, `${name}.audio.wav`)], { stdio: 'inherit' });
      files.forEach((f) => rmSync(f, { force: true }));
    }
    await writeFile(path.join(TAKES, `${name}.json`), JSON.stringify(meta));
    await browser.close();
    return meta;
  }
  return { browser, context, page, frame, wait, hideBanner, save, videoStart, startCapture, mark };
}
