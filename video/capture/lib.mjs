/**
 * Capture helpers: drive Chordless in a plain Playwright Chromium (not IWSDK's
 * managed browser), record its picture with Playwright's video recorder and
 * its sound by tapping everything wired to the AudioContext destination.
 *
 * A take is a pair of files in video/build/takes: <name>.webm (picture) and
 * <name>.audio.webm (sound). video/build.mjs lines them up and cuts them.
 */
import { chromium } from 'playwright';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const TAKES = path.join(ROOT, 'video', 'build', 'takes');
export const URL = process.env.CHORDLESS_URL ?? 'https://localhost:8081/';
export const SIZE = { width: 1280, height: 720 };

const tapAudio = () => {
  // What IWSDK's managed browser sets, so the page installs the IWER_MCP bridge the play scripts use.
  window.__IWER_MCP_MANAGED = true;
  window.__IWSDK_MANAGED_BROWSER_TARGET = true;
  // The app has one audio context per instrument synth. Every context that is
  // wired to speakers gets its own recorder, started when it is first wired.
  const connect = AudioNode.prototype.connect;
  window.__recs = [];
  AudioNode.prototype.connect = function (target, ...rest) {
    const ctx = this.context;
    if (target === ctx.destination && ctx instanceof AudioContext) {
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
  // The play scripts' banner and the emulator's badge are not part of the picture.
  addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = '#e2e-banner{display:none!important}';
    document.head.appendChild(style);
  });
};

/** Opens the app. `query` is added to the URL (for example "scene=cliffside"). */
export async function openApp({ name, query = '' } = {}) {
  await mkdir(TAKES, { recursive: true });
  const browser = await chromium.launch({
    headless: false,
    args: ['--autoplay-policy=no-user-gesture-required', '--ignore-certificate-errors', '--enable-unsafe-swiftshader', `--window-size=${SIZE.width},${SIZE.height + 90}`],
  });
  const context = await browser.newContext({
    viewport: SIZE,
    ignoreHTTPSErrors: true,
    recordVideo: { dir: path.join(TAKES, '_tmp'), size: SIZE },
  });
  await context.addInitScript(tapAudio);
  const page = await context.newPage();
  const videoStart = Date.now();
  page.on('pageerror', (e) => console.error('pageerror:', String(e).slice(0, 300)));
  await page.goto(URL + (query ? `?${query}` : ''), { waitUntil: 'load' });
  const frame = page.mainFrame();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const hideBanner = () => page.addStyleTag({ content: '#e2e-banner{display:none!important}' });

  /** Saves the picture and the sound under TAKES/<name>.* and closes the browser. */
  async function save(audio) {
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
  return { browser, context, page, frame, wait, hideBanner, save, videoStart };
}
