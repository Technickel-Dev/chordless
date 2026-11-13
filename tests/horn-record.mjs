/**
 * Records the air French horn playing the William Tell cut: runs the same
 * performance as horn-william-tell.mjs while Chrome's screencast streams
 * JPEG frames of the page to disk, with each frame's timestamp in
 * frames.txt (an ffmpeg concat list) so a video keeps the true timing.
 *
 *   WT_SONG=WILLIAM_TELL_HORN_CUT npx iwsdk browser run tests/horn-record.mjs --timeout 110000
 *   ffmpeg -f concat -safe 0 -i test-results/horn-frames/frames.txt ... horn.mp4
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import play from './horn-william-tell.mjs';

/**
 * Runs in every document before its scripts: whatever the app connects to an
 * AudioContext's destination is also recorded, whether or not the tab is
 * muted. window.__tap.t0 is the wall-clock time the recording began.
 */
function installAudioTap() {
  // One recording per AudioContext: the page may make several.
  const tap = (window.__tap = { recs: [] });
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest, ...rest) {
    const result = connect.call(this, dest, ...rest);
    try {
      const c = this.context;
      if (dest instanceof AudioDestinationNode && c instanceof AudioContext) {
        if (!c.__tapDest) {
          c.__tapDest = c.createMediaStreamDestination();
          const rec = new MediaRecorder(c.__tapDest.stream, { mimeType: 'audio/webm;codecs=opus' });
          const entry = { chunks: [], t0: Date.now(), rec };
          rec.ondataavailable = (e) => e.data.size && entry.chunks.push(e.data);
          rec.start(250);
          tap.recs.push(entry);
        }
        connect.call(this, c.__tapDest);
      }
    } catch {}
    return result;
  };
}

export default async function run(ctx) {
  const dir = path.join(ctx.workspaceRoot, 'test-results', 'horn-frames');
  await mkdir(dir, { recursive: true });
  await ctx.page.addInitScript(installAudioTap);
  const cdp = await ctx.page.context().newCDPSession(ctx.page);
  const frames = [];
  const writes = [];
  cdp.on('Page.screencastFrame', (f) => {
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    const name = `${String(frames.length + 1).padStart(5, '0')}.jpg`;
    frames.push({ name, t: f.metadata.timestamp });
    writes.push(writeFile(path.join(dir, name), Buffer.from(f.data, 'base64')));
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 75, everyNthFrame: 1 });
  let result;
  try {
    // Stop capturing before the run's own deadline.
    result = await Promise.race([
      play(ctx),
      new Promise((r) => setTimeout(() => r({ stoppedAt: 'time limit' }), 80000)),
    ]);
  } finally {
    await cdp.send('Page.stopScreencast').catch(() => {});
    await Promise.all(writes);
  }
  // The audio: stop the recorder, then carry the webm out as base64.
  const audio = await ctx.frame
    .evaluate(async () => {
      const recs = window.__tap?.recs ?? [];
      const out = [];
      for (const e of recs) {
        await new Promise((r) => {
          e.rec.onstop = r;
          e.rec.stop();
        });
        const blob = new Blob(e.chunks, { type: 'audio/webm' });
        const data = await new Promise((r) => {
          const fr = new FileReader();
          fr.onload = () => r(String(fr.result).split(',')[1]);
          fr.readAsDataURL(blob);
        });
        out.push({ data, t0: e.t0 });
      }
      return out;
    })
    .catch(() => []);
  const audioOffsets = [];
  for (const [i, a] of audio.entries()) {
    await writeFile(path.join(dir, `audio-${i}.webm`), Buffer.from(a.data, 'base64'));
    // Seconds into the audio at which the first video frame was shown.
    audioOffsets.push(frames.length ? frames[0].t - a.t0 / 1000 : 0);
  }
  await writeFile(path.join(dir, 'audio-offsets.json'), JSON.stringify(audioOffsets));
  const audioOffset = audioOffsets;
  const lines = ['ffconcat version 1.0'];
  frames.forEach((f, i) => {
    const next = frames[i + 1];
    lines.push(`file '${f.name}'`, `duration ${next ? (next.t - f.t).toFixed(4) : '0.1'}`);
  });
  await writeFile(path.join(dir, 'frames.txt'), lines.join('\n') + '\n');
  const seconds = frames.length > 1 ? frames.at(-1).t - frames[0].t : 0;
  return { frames: frames.length, seconds, fps: seconds ? frames.length / seconds : 0, audioOffset, result };
}
