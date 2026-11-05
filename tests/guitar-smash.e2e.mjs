/**
 * End-to-end test for smashing the air guitar, in IWSDK's managed Chromium
 * with the IWER Quest 3 emulator in hand-tracking mode:
 *
 *   npx iwsdk dev up --allow-browser-automation
 *   npm run test:smash
 *
 * The right hand makes a fist round the neck to pick the guitar up, then
 * swings it down into the floor until it is wrecked; a two-handed pinch
 * brings a new one, which is then thrown. Results and screenshots go to
 * test-results/.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { startApp } from './app-start.js';

export default async function run({ page, frame, workspaceRoot }) {
  const outDir = path.join(workspaceRoot, 'test-results');
  await mkdir(outDir, { recursive: true });

  const errors = [];
  const onConsole = (msg) => {
    if (msg.type() === 'error' && !/ERR_ABORTED/.test(msg.text())) errors.push(msg.text());
  };
  const onPageError = (err) => errors.push(String(err));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const dispatch = (method, params = {}) =>
    frame.evaluate(([m, p]) => window.IWER_MCP.dispatch(m, p), [method, params]);
  const guitar = async () => {
    const found = await dispatch('ecs_find_entities', { withComponents: ['AirGuitar'] });
    const q = await dispatch('ecs_query_entity', { entityIndex: found.entities[0].entityIndex });
    return q.components.find((c) => c.componentId === 'AirGuitar').values;
  };
  const shot = async (name) => {
    const file = path.join(outDir, `${name}.png`);
    await (await frame.frameElement()).screenshot({ path: file });
    return path.relative(workspaceRoot, file);
  };

  /** A point on the guitar's neck, `x` metres up it from the sound hole, in world space. */
  const neckPoint = (x) =>
    frame.evaluate((px) => {
      const root = window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName('AirGuitar');
      root.updateMatrixWorld(true);
      const e = root.matrixWorld.elements;
      const [lx, ly, lz] = [px, 0, -0.01];
      return {
        x: e[0] * lx + e[4] * ly + e[8] * lz + e[12],
        y: e[1] * lx + e[5] * ly + e[9] * lz + e[13],
        z: e[2] * lx + e[6] * ly + e[10] * lz + e[14],
      };
    }, x);
  /** Lowest and highest vertex of the named object's visible meshes, in world space. */
  const extent = (name, index = -1) =>
    frame.evaluate(
      ([n, i]) => {
        const scene = window.FRAMEWORK_MCP_RUNTIME.world.scene;
        const object = i < 0 ? scene.getObjectByName(n) : scene.getObjectByName(n).children[i];
        object.updateMatrixWorld(true);
        let min = Infinity;
        let max = -Infinity;
        object.traverseVisible((o) => {
          if (!o.isMesh) return;
          const pos = o.geometry.attributes.position;
          const e = o.matrixWorld.elements;
          for (let k = 0; k < pos.count; k++) {
            const y = e[1] * pos.getX(k) + e[5] * pos.getY(k) + e[9] * pos.getZ(k) + e[13];
            min = Math.min(min, y);
            max = Math.max(max, y);
          }
        });
        return { name: object.name, min, max };
      },
      [name, index],
    );
  const lowest = async () => (await extent('AirGuitar')).min;
  /** The debris pieces: name, and lowest and highest vertex, of each. */
  const debris = async () => {
    const count = await frame.evaluate(
      () => window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName('AirGuitarDebris').children.length,
    );
    const out = [];
    for (let i = 0; i < count; i++) out.push(await extent('AirGuitarDebris', i));
    return out;
  };
  /** Pieces sunk into the floor, or not lying on it. */
  const notOnFloor = (pieces) => pieces.filter((p) => p.min < -0.012 || p.min > 0.05);
  const hand = { x: 0, y: 0, z: 0 };
  const moveHand = async (to, duration) => {
    Object.assign(hand, to);
    if (duration > 0) {
      await dispatch('animate_to', { device: 'hand-right', position: { ...hand }, anchor: 'wrist', duration });
      await wait(duration * 1000 + 150);
    } else {
      await dispatch('set_transform', { device: 'hand-right', position: { ...hand }, anchor: 'wrist' });
    }
  };
  /** Swings the held guitar down so its lowest point goes `past` metres below the floor at about `speed` m/s. */
  const strike = async (speed, past = 0.08) => {
    await moveHand({ y: hand.y + 0.35 }, 0.35);
    const drop = (await lowest()) + past;
    await moveHand({ y: hand.y - drop }, drop / speed);
    await wait(250);
    return guitar();
  };
  const grabNeck = async () => {
    await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'fist' });
    await moveHand(await neckPoint(0.42), 0);
    await wait(600);
    return guitar();
  };
  const pinchBoth = async () => {
    await dispatch('set_hand_pose', { device: 'hand-left', poseId: 'pinch' });
    await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'pinch' });
    await dispatch('set_transform', { device: 'hand-left', position: { x: -0.35, y: 1.15, z: -0.4 }, anchor: 'wrist' });
    await moveHand({ x: 0.1, y: 1.0, z: -0.35 }, 0);
    await wait(1600);
    await dispatch('set_hand_pose', { device: 'hand-left', poseId: 'default' });
    await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'default' });
    await wait(200);
    return guitar();
  };

  const results = [];
  const test = async (name, fn) => {
    const started = Date.now();
    try {
      results.push({ name, pass: true, detail: (await fn()) ?? '' });
    } catch (err) {
      results.push({ name, pass: false, detail: err.message });
    }
    results.at(-1).ms = Date.now() - started;
  };
  const expect = (ok, message) => {
    if (!ok) throw new Error(message);
  };

  await frame.evaluate(() => {
    try {
      localStorage.removeItem('chordless.placement');
    } catch {}
  });
  await startApp({ page, frame }, { root: 'AirGuitar', view: { pitch: 0, yaw: 0, roll: 0 } });
  page.on('console', onConsole);
  page.on('pageerror', onPageError);

  let wreckShot = '';
  try {
    await test('The guitar starts worn and intact', async () => {
      const g = await guitar();
      expect(g.hold === 'worn' && g.condition === 'intact' && g.strings === 6, JSON.stringify(g));
      return `${g.hold}, ${g.condition}, ${g.strings} strings`;
    });

    await test('An open hand on the neck does not pick it up', async () => {
      await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'open' });
      await moveHand(await neckPoint(0.42), 0);
      await wait(600);
      const g = await guitar();
      expect(g.hold === 'worn', `hold ${g.hold}`);
      return 'still worn';
    });

    await test('A fist round the neck picks it up', async () => {
      const g = await grabNeck();
      expect(g.hold === 'held', `hold ${g.hold}`);
      return 'held';
    });

    await test('A gentle tap on the floor only knocks', async () => {
      const g = await strike(0.8);
      expect(g.health === 1 && g.strings === 6, `health ${g.health}, strings ${g.strings}`);
      expect((await lowest()) > -0.01, 'the floor stops the guitar');
      return `last hit ${g.lastImpact.toFixed(2)} m/s, no damage`;
    });

    await test('A real swing damages it and snaps strings', async () => {
      const g = await strike(5);
      expect(g.impacts >= 1 && g.health < 1 && g.strings < 6, JSON.stringify(g));
      expect(g.condition === 'damaged', `condition ${g.condition}`);
      return `${g.lastImpact.toFixed(1)} m/s: health ${(g.health * 100).toFixed(0)}%, ${g.strings} strings`;
    });

    let shards = 0;
    await test('Hard swings wreck it into shards that land on the floor', async () => {
      let g = await guitar();
      for (let i = 0; i < 6 && g.condition !== 'wrecked'; i++) g = await strike(9);
      expect(g.condition === 'wrecked', `after ${g.impacts} hits: ${JSON.stringify(g)}`);
      expect(g.neckBroken && g.strings === 0, `neck ${g.neckBroken}, strings ${g.strings}`);
      await wait(2500);
      const pieces = await debris();
      const shardPieces = pieces.filter((p) => p.name.startsWith('Shard'));
      shards = shardPieces.length;
      expect(shards >= 6, `${shards} shards`);
      const off = notOnFloor(shardPieces);
      expect(off.length === 0, `shards not on the floor: ${JSON.stringify(off)}`);
      return `${g.impacts} hits, ${shards} shards, lowest points ${shardPieces.map((p) => p.min.toFixed(3)).join(' ')}`;
    });
    // Look down at the wreck for the screenshot, then back up.
    const centre = await frame.evaluate(() => {
      const pieces = window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName('AirGuitarDebris').children;
      const c = { x: 0, y: 0, z: 0 };
      for (const p of pieces) {
        c.x += p.position.x / pieces.length;
        c.z += p.position.z / pieces.length;
      }
      return c;
    });
    await dispatch('look_at', { device: 'headset', target: centre });
    await wait(300);
    wreckShot = await shot('smash-wrecked');
    await dispatch('set_transform', { device: 'headset', position: { x: 0, y: 1.6, z: 0 }, orientation: { pitch: 0, yaw: 0, roll: 0 } });

    await test('Opening the hand drops what is left of the neck', async () => {
      await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'open' });
      await wait(2000);
      const g = await guitar();
      const pieces = await debris();
      expect(g.hold === 'thrown', `hold ${g.hold}`);
      expect(pieces.some((p) => p.name.startsWith('Neck')), 'neck pieces in the debris');
      const off = notOnFloor(pieces);
      expect(off.length === 0, `pieces not on the floor: ${JSON.stringify(off)}`);
      return `${pieces.length} pieces on the floor`;
    });

    await test('A two-handed pinch brings a new guitar', async () => {
      const g = await pinchBoth();
      const pieces = await debris();
      expect(g.hold === 'worn' && g.condition === 'intact' && g.strings === 6 && !g.neckBroken, JSON.stringify(g));
      expect(pieces.length === 0, `${pieces.length} pieces left`);
      return 'worn, intact, 6 strings';
    });

    await test('Swinging and opening the hand throws it, and it lands', async () => {
      let g = await grabNeck();
      expect(g.hold === 'held', `hold ${g.hold}`);
      await moveHand({ y: hand.y + 0.3 }, 0.3);
      await dispatch('animate_to', {
        device: 'hand-right',
        position: { x: hand.x + 0.5, y: hand.y + 0.25, z: hand.z - 0.3 },
        anchor: 'wrist',
        duration: 0.15,
      });
      await wait(120);
      await dispatch('set_hand_pose', { device: 'hand-right', poseId: 'open' });
      await wait(3000);
      g = await guitar();
      const low = await lowest();
      expect(g.hold === 'thrown', `hold ${g.hold}`);
      expect(low > -0.02 && low < 0.1, `lowest point ${low.toFixed(3)} m`);
      expect(g.impacts >= 1, 'landing counted as a hit');
      return `landed (lowest point ${low.toFixed(3)} m), ${g.impacts} hits, health ${(g.health * 100).toFixed(0)}%`;
    });

    await test('No console errors during the run', async () => {
      expect(errors.length === 0, errors.slice(0, 3).join(' | '));
      return '0 errors';
    });
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    // Leave a fresh guitar on the player.
    await pinchBoth().catch(() => {});
  }

  const passed = results.filter((r) => r.pass).length;
  const summary = { passed, failed: results.length - passed, total: results.length, wreckShot, results };
  await writeFile(path.join(outDir, 'smash-results.json'), JSON.stringify(summary, null, 2));
  return summary;
}
