/**
 * Putting the headset on, in first person: the shot between the opening's last
 * generated clip (which fades to black) and the title card. Out of the dark, a VR
 * headset turns in the light: its white visor and dark sensor strips, the strap
 * loop behind. It turns round to show its inside (the grey face pad, the two lenses)
 * and comes up to your face until everything goes dark. Then the two lenses wake onto
 * the empty theatre, out of focus, and open out into one clear picture: the first
 * frame of the title card's shot.
 *
 * The headset is a small Three.js model, rendered one frame at a time in a headless
 * browser (no randomness, so every build draws the same shot). The lenses' wake is
 * drawn over it on a 2D canvas. Its sound (a soft lift, the pad seating, a start-up
 * chime) is synthesized.
 */
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { W, H } from './cards.mjs';

/** When things happen in the shot (seconds from its start). */
export const HEADSET = { dur: 3.35, turned: 1.35, seat: 1.95, wake: 2.2 };

/** Three.js, from the project's own install (served to the page under a made-up origin). */
const THREE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', 'three');
const ORIGIN = 'https://headset.local';

/**
 * Renders the shot to `out` (an mp4 encoded with `enc`). `theatre` is the title
 * card's shot for the last `dur - wake` seconds before it starts, one image file per
 * frame, so the shot ends on the frame before the title card's first.
 */
export async function renderHeadset({ theatre, out, fps, enc, stills }) {
  const frames = theatre.map((f) => `data:image/jpeg;base64,${readFileSync(f).toString('base64')}`);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    const html = `<!doctype html><html><head><script type="importmap">{"imports":{"three":"${ORIGIN}/three/build/three.module.js","three/addons/":"${ORIGIN}/three/examples/jsm/"}}</script></head>
      <body style="margin:0;background:#000;overflow:hidden">
      <canvas id="g" width="${W}" height="${H}" style="position:absolute;left:0;top:0"></canvas>
      <canvas id="c" width="${W}" height="${H}" style="position:absolute;left:0;top:0"></canvas></body></html>`;
    await page.route(`${ORIGIN}/**`, (route) => {
      const p = new URL(route.request().url()).pathname;
      if (p === '/') return route.fulfill({ body: html, contentType: 'text/html' });
      if (p.startsWith('/three/')) return route.fulfill({ path: path.join(THREE_DIR, p.slice('/three/'.length)), contentType: 'text/javascript' });
      return route.abort();
    });
    await page.goto(`${ORIGIN}/`);
    await page.evaluate(scene, { W, H, frames, T: HEADSET, fps });
    // For checking: PNGs at the times in `stills` ({ t: file }) instead of the shot.
    if (stills) {
      for (const [t, file] of Object.entries(stills)) {
        await page.evaluate((x) => window.draw(x), Number(t));
        await page.screenshot({ path: file });
      }
      return;
    }
    // The JPEGs are full range; the rest of the cut is video range (black at 16), so convert.
    const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', '-', '-vf', 'scale=in_range=full:out_range=limited,format=yuv420p', ...enc, '-r', String(fps), out], { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '';
    ff.stderr.on('data', (d) => (err += d));
    const done = new Promise((resolve, reject) => ff.on('close', (code) => (code ? reject(new Error(`ffmpeg ${code}: ${err}`)) : resolve())));
    const n = Math.round(HEADSET.dur * fps);
    for (let i = 0; i < n; i++) {
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

/** Runs in the page: builds the headset and the theatre frames, and defines window.draw(t). */
async function scene({ W, H, frames, T, fps }) {
  const THREE = await import('three');
  const { RoundedBoxGeometry } = await import('three/addons/geometries/RoundedBoxGeometry.js');
  const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const smooth = (x) => {
    const u = clamp(x);
    return u * u * (3 - 2 * u);
  };
  const lerp = (a, b, u) => a + (b - a) * u;

  // ---- the headset (metres; its inside, where your face goes, towards +Z)
  const gl = document.getElementById('g');
  const renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene3 = new THREE.Scene();
  scene3.background = new THREE.Color(0x000000);
  scene3.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene3.environmentIntensity = 0.3;
  const camera = new THREE.PerspectiveCamera(50, W / H, 0.004, 20);
  // A warm key from above and in front, a cool rim from behind to pick out its shape against the black.
  const key = new THREE.DirectionalLight(0xfff0dd, 2.6);
  key.position.set(-0.5, 1.2, 0.9);
  scene3.add(key);
  const rim = new THREE.DirectionalLight(0xa8c0ff, 2.2);
  rim.position.set(0.9, 0.6, -1.4);
  scene3.add(rim);
  scene3.add(new THREE.HemisphereLight(0x8890a0, 0x0c0c10, 0.3));

  const hs = new THREE.Group();
  scene3.add(hs);
  const white = new THREE.MeshPhysicalMaterial({ color: 0xf2f2f4, roughness: 0.38, clearcoat: 0.3, clearcoatRoughness: 0.4 });
  const gloss = new THREE.MeshPhysicalMaterial({ color: 0x08080a, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.06 });
  const foam = new THREE.MeshStandardMaterial({ color: 0x4a4a52, roughness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0b0b0e, roughness: 0.9 });
  const fabric = new THREE.MeshStandardMaterial({ color: 0x2d2d33, roughness: 0.85, side: THREE.DoubleSide });
  // The visor.
  const VW = 0.19;
  const VH = 0.11;
  const VD = 0.07;
  hs.add(new THREE.Mesh(new RoundedBoxGeometry(VW, VH, VD, 8, 0.032), white));
  // Three dark sensor strips across its front.
  for (const x of [-0.058, 0, 0.058]) {
    const pill = new THREE.Mesh(new THREE.CapsuleGeometry(0.0095, 0.034, 8, 24), gloss);
    pill.position.set(x, 0, -VD / 2 - 0.0005);
    pill.scale.z = 0.3;
    hs.add(pill);
  }
  // The face pad: a ring of foam round the inside, cut away for the nose.
  const roundedShape = (w, h, r, notch, hole) => {
    const s = hole ? new THREE.Path() : new THREE.Shape();
    const x = -w / 2;
    const y = -h / 2;
    s.moveTo(x + r, y + h);
    s.lineTo(x + w - r, y + h);
    s.quadraticCurveTo(x + w, y + h, x + w, y + h - r);
    s.lineTo(x + w, y + r);
    s.quadraticCurveTo(x + w, y, x + w - r, y);
    // The nose: an arch up into the bottom edge.
    s.lineTo(notch, y);
    s.bezierCurveTo(notch * 0.8, y + notch * 1.2, notch * 0.35, y + notch * 1.5, 0, y + notch * 1.5);
    s.bezierCurveTo(-notch * 0.35, y + notch * 1.5, -notch * 0.8, y + notch * 1.2, -notch, y);
    s.lineTo(x + r, y);
    s.quadraticCurveTo(x, y, x, y + r);
    s.lineTo(x, y + h - r);
    s.quadraticCurveTo(x, y + h, x + r, y + h);
    return s;
  };
  const padShape = roundedShape(0.178, 0.1, 0.03, 0.02);
  padShape.holes.push(roundedShape(0.148, 0.07, 0.022, 0.016, true));
  const pad = new THREE.Mesh(new THREE.ExtrudeGeometry(padShape, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 4, curveSegments: 24 }), foam);
  pad.position.z = VD / 2 - 0.004;
  hs.add(pad);
  // Inside the pad, a dark lining, and the two lenses in it.
  const lining = new THREE.Mesh(new THREE.ShapeGeometry(roundedShape(0.15, 0.072, 0.022, 0.016), 24), dark);
  lining.position.z = VD / 2 + 0.0008;
  hs.add(lining);
  for (const x of [-0.032, 0.032]) {
    const bezel = new THREE.Mesh(new THREE.RingGeometry(0.0212, 0.0255, 48), gloss);
    bezel.position.set(x, 0.004, VD / 2 + 0.0012);
    hs.add(bezel);
    const glass = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 48, 12, 0, Math.PI * 2, 0, 0.57),
      new THREE.MeshPhysicalMaterial({ color: 0x0b1018, roughness: 0.03, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.02 }),
    );
    glass.rotation.x = Math.PI / 2;
    glass.position.set(x, 0.004, VD / 2 + 0.001 - 0.04 * Math.cos(0.57));
    hs.add(glass);
  }
  // The strap: a fabric band from the visor's sides round the back of your head. It pivots at
  // the hinges, so it can lift up and over as the headset turns to you, as if held up to go
  // over your head (otherwise it would pass between you and the lenses).
  const strap = new THREE.Group();
  strap.position.z = 0.012;
  hs.add(strap);
  {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-VW / 2 + 0.004, 0, -0.012),
      new THREE.Vector3(-0.104, 0.002, 0.048),
      new THREE.Vector3(-0.098, 0.008, 0.118),
      new THREE.Vector3(-0.062, 0.014, 0.178),
      new THREE.Vector3(0, 0.017, 0.2),
      new THREE.Vector3(0.062, 0.014, 0.178),
      new THREE.Vector3(0.098, 0.008, 0.118),
      new THREE.Vector3(0.104, 0.002, 0.048),
      new THREE.Vector3(VW / 2 - 0.004, 0, -0.012),
    ]);
    const n = 160;
    const half = 0.016;
    const pos = [];
    const idx = [];
    for (let i = 0; i <= n; i++) {
      const p = curve.getPoint(i / n);
      // Wider at the back of the head, where the band takes the weight.
      const h = half * (1 + 0.6 * Math.sin((Math.PI * i) / n));
      pos.push(p.x, p.y - h, p.z, p.x, p.y + h, p.z);
      if (i < n) idx.push(2 * i, 2 * i + 2, 2 * i + 1, 2 * i + 1, 2 * i + 2, 2 * i + 3);
    }
    const band = new THREE.BufferGeometry();
    band.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    band.setIndex(idx);
    band.computeVertexNormals();
    strap.add(new THREE.Mesh(band, fabric));
    // Where the strap meets the visor: small hinges.
    for (const s of [-1, 1]) {
      const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.012, 24), white);
      hinge.rotation.z = Math.PI / 2;
      hinge.position.set(s * (VW / 2 + 0.002), 0, 0.012);
      hs.add(hinge);
    }
  }

  // ---- the lenses waking onto the theatre (2D, over the 3D)
  const c = document.getElementById('c');
  const g = c.getContext('2d');
  const images = await Promise.all(
    frames.map(
      (src) =>
        new Promise((resolve, reject) => {
          const im = new Image();
          im.onload = () => resolve(im);
          im.onerror = reject;
          im.src = src;
        }),
    ),
  );
  const off = document.createElement('canvas');
  off.width = W;
  off.height = H;
  const o = off.getContext('2d');
  const mask = document.createElement('canvas');
  mask.width = W;
  mask.height = H;
  const m = mask.getContext('2d');
  /** `appear` 0..1 brings up two soft circles; `open` 0..1 grows them into the whole, sharp picture. */
  const wake = (im, appear, open) => {
    const blur = 16 * (1 - open);
    if (open >= 0.999) return im;
    o.globalCompositeOperation = 'source-over';
    o.clearRect(0, 0, W, H);
    // Each eye sees the whole view, centred in its lens; as they open they grow and meet.
    const apart = 0.205 * W * (1 - open);
    const r = lerp(0.29 * H, 1.25 * W, open * open);
    const feather = lerp(0.3, 0.12, open);
    const sc = lerp(0.62, 1, open);
    for (const s of [-1, 1]) {
      const x = W / 2 + s * apart;
      const y = H / 2 - 0.02 * H * (1 - open);
      m.globalCompositeOperation = 'source-over';
      m.clearRect(0, 0, W, H);
      m.filter = blur > 0.2 ? `blur(${blur.toFixed(1)}px) brightness(${(1.25 - 0.25 * open).toFixed(3)})` : 'none';
      // Drawn a little larger when blurred, so the blur does not darken the edges.
      const padPx = blur * 2;
      m.drawImage(im, x - (W * sc) / 2 - padPx, y - (H * sc) / 2 - padPx, W * sc + padPx * 2, H * sc + padPx * 2);
      m.filter = 'none';
      const gr = m.createRadialGradient(x, y, r * (1 - feather), x, y, r);
      gr.addColorStop(0, `rgba(255,255,255,${appear})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      m.globalCompositeOperation = 'destination-in';
      m.fillStyle = gr;
      m.fillRect(0, 0, W, H);
      // Where the two overlap they show the same picture: keep the brighter of the two.
      o.globalCompositeOperation = 'lighten';
      o.drawImage(mask, 0, 0);
    }
    o.globalCompositeOperation = 'source-over';
    return off;
  };

  window.draw = (t) => {
    g.clearRect(0, 0, W, H);
    if (t < T.seat) {
      gl.style.visibility = 'visible';
      // It turns round in front of you (front, then side and strap, then the inside), drifting
      // a little closer; then it comes up to your face, faster as it nears.
      const turn = smooth((t - 0.05) / (T.turned - 0.05));
      const near = (t - T.turned) / (T.seat - T.turned);
      const zTurn = lerp(-0.42, -0.3, smooth(t / T.turned));
      const z = near <= 0 ? zTurn : lerp(-0.3, -0.068, Math.pow(clamp(near), 1.7));
      strap.rotation.x = -1.4 * smooth((turn - 0.25) / 0.6);
      hs.position.set(0.012 * (1 - turn), lerp(-0.03, -0.004, smooth(t / T.seat)), z);
      hs.rotation.set(lerp(0.22, 0, turn), lerp(Math.PI - 0.62, 0, turn), lerp(0.05, 0, turn), 'YXZ');
      // Out of the dark as the light finds it; into your own shadow as it reaches your face.
      renderer.toneMappingExposure = smooth(t / 0.5) * lerp(1, 0.2, smooth((t - (T.seat - 0.4)) / 0.4));
      renderer.render(scene3, camera);
      return;
    }
    gl.style.visibility = 'hidden';
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    if (t < T.wake || images.length === 0) return;
    const k = (t - T.wake) / (T.dur - T.wake);
    const im = images[Math.min(images.length - 1, Math.round((t - T.wake) * fps))];
    g.drawImage(wake(im, smooth(k / 0.25), smooth((k - 0.22) / 0.78)), 0, 0);
  };
}

/** The shot's sound: a soft lift as it comes up, the pad seating against your face, then the start-up chime. */
export function writeHeadsetSound(file, { dur = HEADSET.dur, seat = HEADSET.seat, wake = HEADSET.wake } = {}) {
  const rate = 48000;
  const n = Math.ceil(dur * rate);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  let s = 7;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  // The lift: band-passed noise that swells and rises in pitch as the headset nears.
  {
    let y1 = 0;
    let y2 = 0;
    let x1 = 0;
    let x2 = 0;
    for (let i = 0; i < Math.min(n, Math.floor(seat * rate)); i++) {
      const t = i / rate;
      const u = Math.min(1, t / seat);
      const f0 = 300 + 1500 * u * u;
      const w0 = (2 * Math.PI * f0) / rate;
      const al = Math.sin(w0) / (2 * 0.9);
      const b0 = al / (1 + al);
      const a1 = (-2 * Math.cos(w0)) / (1 + al);
      const a2 = (1 - al) / (1 + al);
      const x = rnd() * 2 - 1;
      const y = b0 * x - b0 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
      const env = Math.min(1, t / 0.4) * (0.15 + 0.85 * u * u * u);
      L[i] += y * env * 0.5;
      R[i] += y * env * 0.5;
    }
  }
  // Seated: a soft, low thump.
  for (let i = Math.floor(seat * rate); i < n; i++) {
    const t = i / rate - seat;
    if (t > 0.35) break;
    const v = Math.sin(2 * Math.PI * (62 + 30 * Math.exp(-t * 30)) * t) * Math.exp(-t * 14) * 0.9 + (rnd() * 2 - 1) * Math.exp(-t * 60) * 0.12;
    L[i] += v;
    R[i] += v;
  }
  // The start-up chime: two soft bell notes, a fifth apart.
  for (const [at, hz, amp] of [[wake + 0.02, 659.25, 0.32], [wake + 0.2, 987.77, 0.26]]) {
    for (let i = Math.floor(at * rate); i < n; i++) {
      const t = i / rate - at;
      const env = Math.min(1, t / 0.006) * Math.exp(-t * 2.6);
      const v = (Math.sin(2 * Math.PI * hz * t) + 0.35 * Math.sin(2 * Math.PI * hz * 2 * t) * Math.exp(-t * 4) + 0.12 * Math.sin(2 * Math.PI * hz * 3.01 * t) * Math.exp(-t * 7)) * env * amp;
      L[i] += v * 0.9;
      R[i] += v;
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
    pcm.writeInt16LE(Math.round((L[i] / peak) * 0.6 * 32767), 44 + i * 4);
    pcm.writeInt16LE(Math.round((R[i] / peak) * 0.6 * 32767), 46 + i * 4);
  }
  const dry = `${file}.dry.wav`;
  writeFileSync(dry, pcm);
  // A little room on it, so the chime rings.
  const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', dry, '-af', 'aecho=0.8:0.5:43|89|151:0.25|0.16|0.1', file], { encoding: 'utf8' });
  unlinkSync(dry);
  if (r.status !== 0) throw new Error(`headset sound: ${r.stderr}`);
  return file;
}
