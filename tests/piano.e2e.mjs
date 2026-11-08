/**
 * End-to-end test for the hand-played air piano, run inside IWSDK's
 * managed Chromium with the IWER Quest 3 emulator in hand-tracking mode:
 *
 *   npx iwsdk dev up --allow-browser-automation
 *   npm run test:piano
 *
 * The piano is chosen on the panel with a hand-ray pinch. Each hand then
 * points its index finger (the other fingers curled), and its fingertip is
 * pinned frame by frame along a scripted path in piano space: down onto a
 * key at a chosen speed, held, lifted. Results, a screenshot and two
 * rendered notes go to test-results/.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { reloadApp } from './app-start.js';

/** Where each hand waits when not playing: above the front of the keyboard, clear of the keys (piano space). */
const PARK = { left: [-0.3, 0.12, 0.09], right: [0.3, 0.12, 0.09] };
/** The tracked tip joint sits this far above the bottom of the finger pad (see src/piano/keys.ts). */
const PAD = 0.008;

export default async function run({ page, frame, workspaceRoot }) {
  const outDir = path.join(workspaceRoot, 'test-results');
  await mkdir(outDir, { recursive: true });

  const errors = [];
  const onConsole = (msg) => {
    if (msg.type() === 'error' && !/ERR_ABORTED/.test(msg.text())) errors.push(msg.text());
  };
  const onPageError = (err) => errors.push(String(err));
  const pace = Math.max(1, Number(process.env.E2E_PACE) || 1);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms * pace));
  const banner = (text, color = '#ffb000') =>
    frame
      .evaluate(
        ([t, c]) => {
          let el = document.getElementById('e2e-banner');
          if (!el) {
            el = document.createElement('div');
            el.id = 'e2e-banner';
            el.style.cssText =
              'position:fixed;left:16px;top:16px;z-index:99999;padding:10px 16px;border-radius:10px;' +
              'font:600 18px system-ui,sans-serif;color:#fff;background:rgba(20,20,24,.85);pointer-events:none;';
            document.body.appendChild(el);
          }
          el.style.borderLeft = `6px solid ${c}`;
          el.textContent = t;
        },
        [text, color],
      )
      .catch(() => {});
  const dispatch = (method, params = {}) =>
    frame.evaluate(([m, p]) => window.IWER_MCP.dispatch(m, p), [method, params]);
  const state = async (component) => {
    const found = await dispatch('ecs_find_entities', { withComponents: [component] });
    const q = await dispatch('ecs_query_entity', { entityIndex: found.entities[0].entityIndex });
    return q.components.find((c) => c.componentId === component).values;
  };
  const visible = (name) =>
    frame.evaluate((n) => window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName(n)?.visible ?? null, name);
  const shot = async (name) => {
    const file = path.join(outDir, `${name}.png`);
    await (await frame.frameElement()).screenshot({ path: file });
    return path.relative(workspaceRoot, file);
  };
  /** Which of the guitar, the violin, the cello, the left cymbal and the piano are showing. */
  const showing = async () => Promise.all(['AirGuitar', 'AirViolin', 'AirCello', 'AirCymbalLeft', 'AirPiano'].map(visible));

  /** Points the right hand's ray at a panel button and pinches. */
  const aimAndPinch = async (id) => {
    // The menu folds away once an instrument is chosen; open it to reach a control in it.
    const folded = await frame.evaluate((n) => {
      // UIKit hides an element (or its section) through isVisible, not Object3D.visible.
      return window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName(n)?.isVisible?.value === false;
    }, id);
    if (folded && id !== 'menu-open') await aimAndPinch('menu-open');
    await frame.evaluate(() => {
      window.IWER_DEVICE.hands.left.setPin(null);
      window.IWER_DEVICE.hands.right.setPin(null);
    });
    await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'default' });
    const target = await frame.evaluate((n) => {
      const o = window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName(n);
      if (!o) return null;
      const v = o.getWorldPosition(o.position.clone());
      return { x: v.x, y: v.y, z: v.z };
    }, id);
    if (target == null) throw new Error(`no panel element named ${id}`);
    await dispatch('set_transform', { device: 'hand-right', position: { x: 0.3, y: 1.3, z: -0.1 } });
    await dispatch('look_at', { device: 'hand-right', target });
    await wait(200);
    await dispatch('select', { device: 'hand-right', duration: 0.15 });
    await wait(400);
  };
  /** Both hands point their index fingers, the other fingers and thumbs curled. */
  const pointBothHands = () =>
    frame.evaluate(() => {
      for (const hand of [window.IWER_DEVICE.hands.left, window.IWER_DEVICE.hands.right]) {
        hand.poseId = hand.poseIds.includes('open') ? 'open' : 'default';
        for (const f of ['thumb', 'middle', 'ring', 'pinky']) hand.setFingerPose(f, 'fist', 1);
      }
    });

  /**
   * Moves the index fingertips along `keys` ({ t, left, right }, each a
   * point in piano space), then holds the last key `after` seconds. Returns
   * what the app did.
   */
  const play = (keys, after = 0.15) =>
    frame.evaluate(
      async ([keys, after]) => {
        const world = window.FRAMEWORK_MCP_RUNTIME.world;
        const sys = Array.from(world.systems ?? []).find((s) => s?.instrument === 'piano');
        const root = sys.model.root;
        const V = (x = 0, y = 0, z = 0) => root.position.clone().set(x, y, z);
        const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
        const hands = { left: window.IWER_DEVICE.hands.left, right: window.IWER_DEVICE.hands.right };
        // Palm down, fingers forward and tipped 35 degrees down onto the keys
        // (the wrist frame has -Z along the fingers, +Y out of the back of the hand).
        const tilt = (35 * Math.PI) / 180;
        const Y = V(0, Math.cos(tilt), -Math.sin(tilt));
        const Z = V(0, Math.sin(tilt), Math.cos(tilt));
        const X = V().crossVectors(Y, Z);
        const local = root.quaternion.clone().setFromRotationMatrix(root.matrixWorld.clone().makeBasis(X, Y, Z));
        const wristQ = root.getWorldQuaternion(root.quaternion.clone()).multiply(local);
        const place = (side, p) => {
          const w = root.localToWorld(V(...p));
          hands[side].setPin({ anchor: 'index-tip', target: [w.x, w.y, w.z], wristRotation: [wristQ.x, wristQ.y, wristQ.z, wristQ.w] });
        };
        const lerp = (a, b, u) => a.map((v, k) => v + (b[k] - v) * u);
        const at = (t) => {
          let i = 0;
          while (i < keys.length - 2 && t > keys[i + 1].t) i++;
          const [k0, k1] = [keys[i], keys[i + 1] ?? keys[i]];
          const u = k1.t > k0.t ? Math.min(1, Math.max(0, (t - k0.t) / (k1.t - k0.t))) : 1;
          return { left: lerp(k0.left, k1.left, u), right: lerp(k0.right, k1.right, u) };
        };

        const on = [];
        const off = [];
        const { noteOn, noteOff } = sys.synth;
        sys.synth.noteOn = function (midi, velocity, when) {
          on.push({ midi, velocity: Math.round(velocity * 100) / 100 });
          return noteOn.call(this, midi, velocity, when);
        };
        sys.synth.noteOff = function (midi, when) {
          off.push(midi);
          return noteOff.call(this, midi, when);
        };
        const lowest = sys.model.keys.length ? Number(sys.model.keys[0].name.slice(3)) : 36;
        const turned = {};
        const lit = new Set();
        const chords = new Set();
        let maxDown = 0;
        let maxSounding = 0;
        const end = keys.at(-1).t + after;
        const start = performance.now();
        try {
          for (;;) {
            const t = (performance.now() - start) / 1000;
            const p = at(Math.min(t, keys.at(-1).t));
            place('left', p.left);
            place('right', p.right);
            await nextFrame();
            sys.model.keys.forEach((k, i) => {
              if (k.rotation.x > 0) turned[lowest + i] = Math.max(turned[lowest + i] ?? 0, k.rotation.x);
              if (sys.model.bodies[i].material.name.endsWith('Lit')) lit.add(lowest + i);
            });
            maxDown = Math.max(maxDown, sys.entity.getValue(sys.component, 'keysDown'));
            maxSounding = Math.max(maxSounding, sys.synth.sounding);
            const chord = sys.entity.getValue(sys.component, 'chord');
            if (chord) chords.add(chord);
            if (t >= end) break;
          }
          for (let i = 0; i < 3; i++) await nextFrame();
        } finally {
          sys.synth.noteOn = noteOn;
          sys.synth.noteOff = noteOff;
        }
        return {
          on,
          off,
          turned: Object.fromEntries(Object.entries(turned).map(([k, v]) => [k, Math.round(v * 10000) / 10000])),
          lit: [...lit],
          chords: [...chords],
          maxDown,
          maxSounding,
          keysDown: sys.entity.getValue(sys.component, 'keysDown'),
          voices: sys.synth.voices.map((v, i) => (v ? lowest + i : 0)).filter(Boolean),
        };
      },
      [keys, after],
    );

  const results = [];
  const test = async (name, fn) => {
    const step = `${results.length + 1}. ${name}`;
    await banner(step);
    const started = Date.now();
    try {
      results.push({ name, pass: true, ms: 0, detail: (await fn()) ?? '' });
    } catch (err) {
      results.push({ name, pass: false, ms: 0, detail: err.message });
    }
    const r = results.at(-1);
    r.ms = Date.now() - started;
    await banner(`${r.pass ? '✓' : '✗'} ${step}`, r.pass ? '#3dff8f' : '#ff4d4f');
    await wait(pace > 1 ? 500 : 0);
  };
  const expectEq = (actual, expected, label) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  };
  const expectRange = (value, lo, hi, label) => {
    if (!(value >= lo && value <= hi)) throw new Error(`${label}: ${value} not in [${lo}, ${hi}]`);
  };

  await reloadApp({ page, frame }, 'AirPiano');
  /** Renders the piano's voice (normally started when the piano is chosen); returns how long it took. */
  const warmVoice = async () => {
    const started = Date.now();
    await frame.evaluate(() => Array.from(window.FRAMEWORK_MCP_RUNTIME.world.systems).find((s) => s?.instrument === 'piano')?.synth.warm());
    return Date.now() - started;
  };
  const layout = await frame.evaluate(async () => {
    const g = await import('/src/piano/geometry.ts');
    const keys = {};
    for (let m = g.PIANO.lowest; m <= g.PIANO.highest; m++) keys[m] = { x: g.keyCenterX(m), top: g.keyTop(m), black: g.isBlack(m) };
    return { keys, travel: g.PIANO.travel };
  });
  /** A fingertip `depth` into a key, on the front of a white key or the middle of a black one. */
  const keyPoint = (midi, depth = layout.travel + 0.003) => {
    const k = layout.keys[midi];
    return [k.x, k.top - depth + PAD, k.black ? -0.12 : -0.04];
  };
  const above = (midi) => {
    const p = keyPoint(midi, 0);
    return [p[0], p[1] + 0.05, p[2]];
  };
  /**
   * Keyframes for striking keys together: every finger comes down from 5 cm
   * above its key at `speed` m/s, holds `hold` s, and lifts. `notes` maps a
   * hand to its key; the other hand waits.
   */
  const strike = (notes, speed, hold = 0.2) => {
    const from = {};
    const to = {};
    for (const side of ['left', 'right']) {
      from[side] = notes[side] != null ? above(notes[side]) : PARK[side];
      to[side] = notes[side] != null ? keyPoint(notes[side]) : PARK[side];
    }
    const travel = (0.05 + layout.travel + 0.003) / speed;
    return [
      { t: 0, ...from },
      { t: 0.2, ...from },
      { t: 0.2 + travel, ...to },
      { t: 0.2 + travel + hold, ...to },
      { t: 0.35 + travel + hold, ...from },
    ];
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);

  try {
    await test('Entering XR shows the guitar, the piano put away', async () => {
      await dispatch('accept_session');
      await frame.waitForFunction(() => window.FRAMEWORK_MCP_RUNTIME.world.renderer?.xr?.isPresenting, null, { timeout: 10000 });
      await dispatch('set_input_mode', { mode: 'hand' });
      await dispatch('set_transform', { device: 'headset', position: { x: 0, y: 1.6, z: 0 }, orientation: { pitch: -20, yaw: 0, roll: 0 } });
      await wait(300);
      expectEq(await showing(), [true, false, false, false, false], '[guitar, violin, cello, cymbals, piano] visible');
      return 'guitar out';
    });

    await test('The panel Piano button sets the piano down in front of the player', async () => {
      await aimAndPinch('instrument-piano');
      const warmMs = await warmVoice();
      await dispatch('set_transform', { device: 'headset', position: { x: 0, y: 1.6, z: 0 }, orientation: { pitch: -35, yaw: 0, roll: 0 } });
      const piano = await state('AirPiano');
      const gtr = await state('AirGuitar');
      expectEq([piano.active, gtr.active], [true, false], '[piano, guitar] active');
      await pointBothHands();
      await play([{ t: 0, ...PARK }, { t: 0.2, ...PARK }]);
      expectEq(await showing(), [false, false, false, false, true], '[guitar, violin, cello, cymbals, piano] visible');
      const at = await frame.evaluate(() => {
        const p = window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName('AirPiano');
        return { x: p.position.x, y: p.position.y, z: p.position.z, yaw: p.rotation.y };
      });
      expectRange(at.y, 0.98, 1.06, 'keys height');
      expectRange(at.z, -0.36, -0.24, 'front edge ahead of the head');
      expectRange(Math.abs(at.x), 0, 0.02, 'centred');
      const after = await state('AirPiano');
      expectEq([after.leftHand, after.rightHand], [true, true], '[left, right] hands tracked');
      return `keys at ${at.y.toFixed(2)} m, front edge ${(-at.z).toFixed(2)} m ahead; voice rendered ${warmMs} ms after choosing`;
    });

    await test('A firm press sounds middle C, the key going down and lighting', async () => {
      const r = await play(strike({ right: 60 }, 0.5));
      expectEq(r.on.map((n) => n.midi), [60], 'struck');
      expectEq(r.off, [60], 'let up');
      expectRange(r.on[0].velocity, 0.4, 0.8, 'velocity');
      expectRange(r.turned[60] ?? 0, 0.02, 0.04, 'Key60 turned (rad)');
      expectEq(r.lit, [60], 'lit');
      expectEq(r.keysDown, 0, 'keys down after');
      const s = await state('AirPiano');
      expectEq(s.lastNote, 60, 'lastNote');
      return `velocity ${r.on[0].velocity}, key turned ${r.turned[60]} rad`;
    });

    await test('A slow press is soft, a fast strike loud', async () => {
      const soft = await play(strike({ right: 64 }, 0.1));
      const loud = await play(strike({ right: 67 }, 1.4));
      expectEq([soft.on.map((n) => n.midi), loud.on.map((n) => n.midi)], [[64], [67]], 'struck');
      expectRange(soft.on[0].velocity, 0.1, 0.35, 'soft velocity');
      expectRange(loud.on[0].velocity, 0.85, 1, 'loud velocity');
      return `soft ${soft.on[0].velocity}, loud ${loud.on[0].velocity}`;
    });

    await test('Black keys play from above, at the back of the keyboard', async () => {
      const cs = await play(strike({ right: 61 }, 0.5));
      const bb = await play(strike({ left: 46 }, 0.5));
      expectEq([cs.on.map((n) => n.midi), bb.on.map((n) => n.midi)], [[61], [46]], 'struck');
      return 'C#4 with the right hand, Bb2 with the left';
    });

    await test('Both hands play a fifth; the HUD names it', async () => {
      const r = await play(strike({ left: 48, right: 55 }, 0.6, 0.6));
      expectEq(r.on.map((n) => n.midi).sort(), [48, 55], 'struck');
      expectEq(r.maxDown, 2, 'most keys down');
      expectEq(r.chords.includes('C3 G3'), true, `notes shown (${JSON.stringify(r.chords)})`);
      // Hold it for the picture.
      const hold = strike({ left: 48, right: 55 }, 0.6, 1.2);
      const holding = play(hold);
      await wait(800);
      const file = await shot('piano-01-fifth');
      await holding;
      return `${r.chords.join(', ')}; ${file}`;
    });

    await test('The top keys ring on when let up (no dampers); the rest stop', async () => {
      const top = await play(strike({ right: 94 }, 0.5));
      const mid = await play(strike({ right: 72 }, 0.5));
      expectEq([top.off, mid.off], [[94], [72]], 'let up');
      expectEq(top.voices.includes(94), true, 'A#6 still sounding after let up');
      expectEq(mid.voices.includes(72), false, 'C5 still sounding after let up');
      return 'A#6 rings on, C5 damped';
    });

    await test('A hand sliding in under the key tops from the front plays nothing', async () => {
      const y = layout.keys[60].top - 0.005 + PAD;
      const x = layout.keys[62].x;
      const r = await play([
        { t: 0, left: PARK.left, right: [x, y, 0.1] },
        { t: 0.6, left: PARK.left, right: [x, y, -0.06] },
        { t: 0.8, left: PARK.left, right: [x, y + 0.06, -0.06] },
      ]);
      expectEq(r.on, [], 'struck');
      return 'silent';
    });

    await test('Reset position brings the piano round to where the player now faces', async () => {
      await dispatch('set_transform', { device: 'headset', position: { x: 0, y: 1.6, z: 0 }, orientation: { pitch: 0, yaw: 40, roll: 0 } });
      await aimAndPinch('reset-guitar');
      const yaw = await frame.evaluate(() => window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName('AirPiano').rotation.y);
      expectRange((yaw * 180) / Math.PI, 35, 45, 'piano yaw (deg)');
      await dispatch('set_transform', { device: 'headset', position: { x: 0, y: 1.6, z: 0 }, orientation: { pitch: -35, yaw: 0, roll: 0 } });
      await aimAndPinch('reset-guitar');
      return `turned to ${((yaw * 180) / Math.PI).toFixed(1)} deg, then back`;
    });

    await test('The panel Cymbals button puts the piano away', async () => {
      await aimAndPinch('instrument-cymbals');
      await dispatch('set_hand_pose', { device: 'hand-left', poseId: 'fist' });
      await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'fist' });
      await wait(300);
      const shown = await showing();
      expectEq([shown[0], shown[4]], [false, false], '[guitar, piano] visible');
      expectEq((await state('AirPiano')).active, false, 'piano active');
      return 'cymbals out';
    });

    await test('The panel Guitar button brings the guitar back', async () => {
      await aimAndPinch('instrument-guitar');
      await wait(200);
      expectEq(await showing(), [true, false, false, false, false], '[guitar, violin, cello, cymbals, piano] visible');
      return 'guitar out again';
    });

    await test('Middle C renders with a soft and a bright blow', async () => {
      const r = await frame.evaluate(async () => {
        const { renderNote } = await import('/src/piano/synth.ts');
        const { stats, wavBase64 } = await import('/tests/audio-tools.js');
        const out = {};
        for (const [name, v] of [['soft', 0.3], ['hard', 1]]) {
          const buf = await renderNote(48000, 60, v);
          out[name] = { stats: stats(buf, 0.05), wav: wavBase64(buf), seconds: buf.duration };
        }
        return out;
      });
      for (const name of ['soft', 'hard']) {
        await writeFile(path.join(outDir, `piano-c4-${name}.wav`), Buffer.from(r[name].wav, 'base64'));
      }
      const [s, h] = [r.soft.stats, r.hard.stats];
      if (!(h.centroidHz > s.centroidHz)) throw new Error(`hard blow not brighter: ${h.centroidHz} vs ${s.centroidHz} Hz`);
      if (!(h.peak > 0.3 && h.peak <= 0.95)) throw new Error(`hard blow peak ${h.peak}`);
      return `centroid ${s.centroidHz} Hz soft, ${h.centroidHz} Hz hard; ${r.hard.seconds.toFixed(1)} s; test-results/piano-c4-{soft,hard}.wav`;
    });

    await test('No console errors during the run', async () => {
      if (errors.length) throw new Error(errors.slice(0, 3).join(' | '));
      return '0 errors';
    });
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    await frame
      .evaluate(() => {
        for (const hand of [window.IWER_DEVICE?.hands?.left, window.IWER_DEVICE?.hands?.right]) {
          hand?.setPin(null);
          for (const f of ['thumb', 'middle', 'ring', 'pinky']) hand?.setFingerPose?.(f, 'fist', 0);
        }
      })
      .catch(() => {});
    await dispatch('set_hand_pose', { device: 'hand-left', poseId: 'default' }).catch(() => {});
    await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'default' }).catch(() => {});
    await dispatch('end_session').catch(() => {});
  }

  const passed = results.filter((r) => r.pass).length;
  await banner(`${passed}/${results.length} passed`, passed === results.length ? '#3dff8f' : '#ff4d4f');
  const summary = { passed, failed: results.length - passed, total: results.length, results };
  await writeFile(path.join(outDir, 'piano-results.json'), JSON.stringify(summary, null, 2));
  return summary;
}
