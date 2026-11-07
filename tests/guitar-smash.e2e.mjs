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

/** The stage top, where things land. */
const FLOOR = 0.035;

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
          if (!o.isMesh || o.userData.scar) return;
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
    return out.filter((p) => p.name !== 'Chips');
  };
  /** Pieces sunk into the floor, or not lying on it. */
  const notOnFloor = (pieces) => pieces.filter((p) => p.min < -0.012 || p.min > 0.05);
  /** How many meshes of the guitar are dented, and how many cracks are on it. */
  const scarMarks = () =>
    frame.evaluate(() => {
      const scene = window.FRAMEWORK_MCP_RUNTIME.world.scene;
      const out = { dented: 0, cracks: 0 };
      for (const name of ['AirGuitar', 'AirGuitarDebris']) {
        scene.getObjectByName(name).traverse((o) => {
          if (o.isMesh && o.geometry.userData.dented) out.dented++;
          if (o.name === 'Crack') out.cracks++;
        });
      }
      return out;
    });
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
      expect(g.dents >= 1, `${g.dents} dents`);
      return `${g.lastImpact.toFixed(1)} m/s: health ${(g.health * 100).toFixed(0)}%, ${g.strings} strings, ${g.dents} dents`;
    });

    await test('The hit left dents and cracks on the guitar itself', async () => {
      const marks = await scarMarks();
      expect(marks.dented > 0, 'no mesh was dented');
      expect(marks.cracks > 0, 'no cracks on the guitar');
      return `${marks.dented} meshes dented, ${marks.cracks} cracks`;
    });

    await test('More hits add more marks, breaking pieces off one at a time', async () => {
      const before = await guitar();
      const marksBefore = await scarMarks();
      const g = await strike(4);
      const marks = await scarMarks();
      expect(g.condition !== 'wrecked', 'one more hit should not wreck it');
      expect(g.dents > before.dents, `dents ${before.dents} to ${g.dents}`);
      expect(marks.cracks > marksBefore.cracks || marks.dented >= marksBefore.dented, JSON.stringify(marks));
      expect(g.shardsOff < 9, `${g.shardsOff} shards off`);
      return `${g.dents} dents, ${marks.cracks} cracks, ${g.shardsOff} of 9 shards off`;
    });

    let shards = 0;
    await test('Hard swings wreck it into shards that land on the floor', async () => {
      let g = await guitar();
      for (let i = 0; i < 10 && g.condition !== 'wrecked'; i++) g = await strike(9);
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
      const pieces = window.FRAMEWORK_MCP_RUNTIME.world.scene
        .getObjectByName('AirGuitarDebris')
        .children.filter((p) => p.name !== 'Chips');
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
      const marks = await scarMarks();
      expect(marks.dented === 0 && marks.cracks === 0 && g.dents === 0, JSON.stringify(marks));
      return 'worn, intact, 6 strings, no marks';
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

    /** The guitar's pose in the right hand's grip space: rotation (xyzw) and offset. */
    const inGrip = () =>
      frame.evaluate(() => {
        const world = window.FRAMEWORK_MCP_RUNTIME.world;
        const root = world.scene.getObjectByName('AirGuitar');
        const grip = world.player.gripSpaces.right;
        root.updateMatrixWorld(true);
        grip.updateWorldMatrix(true, false);
        const relative = grip.matrixWorld.clone().invert().multiply(root.matrixWorld);
        const q = root.quaternion.clone().setFromRotationMatrix(relative);
        const e = relative.elements;
        const world_q = root.getWorldQuaternion(root.quaternion.clone());
        return { q: [q.x, q.y, q.z, q.w], at: [e[12], e[13], e[14]], world: [world_q.x, world_q.y, world_q.z, world_q.w] };
      });
    const angle = (a, b) => (2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]))) * 180) / Math.PI;

    await test('A held guitar turns with the hand, as if gripped', async () => {
      await pinchBoth();
      const g = await grabNeck();
      expect(g.hold === 'held', `hold ${g.hold}`);
      const at = { x: 0.25, y: 1.3, z: -0.4 };
      const poses = [
        { fingers: 'forward', palm: 'down' },
        { fingers: 'up', palm: 'left' },
        { fingers: 'left', palm: 'back' },
      ];
      const seen = [];
      for (const orientation of poses) {
        await dispatch('set_transform', { device: 'hand-right', position: at, anchor: 'wrist', orientation });
        await wait(300);
        seen.push(await inGrip());
      }
      expect((await guitar()).hold === 'held', 'let go while turning');
      // The guitar really turned in the world...
      const turned = Math.max(angle(seen[0].world, seen[1].world), angle(seen[0].world, seen[2].world));
      expect(turned > 60, `the guitar only turned ${turned.toFixed(0)} degrees`);
      // ...but not at all in the hand.
      for (let i = 1; i < seen.length; i++) {
        const slip = angle(seen[0].q, seen[i].q);
        const drift = Math.hypot(...seen[i].at.map((v, k) => v - seen[0].at[k]));
        expect(slip < 2 && drift < 0.01, `turned ${slip.toFixed(1)} degrees and moved ${(drift * 100).toFixed(1)} cm in the hand`);
      }
      return `turned up to ${turned.toFixed(0)} degrees with the hand; stayed put in the grip`;
    });

    /**
     * Of a few ways to turn the right wrist, the ones that bring the held guitar lowest and
     * hold it highest, with how far below the wrist it reaches. Measured clear of the floor.
     */
    const lowestTurn = async () => {
      const high = 1.6;
      const turns = [
        { fingers: [0, -0.7, -1], palm: 'left' },
        { fingers: 'down', palm: 'left' },
        { fingers: 'forward', palm: 'down' },
        { fingers: 'forward', palm: 'left' },
        { fingers: [0, -0.7, -1], palm: 'right' },
        { fingers: 'up', palm: 'left' },
        { fingers: 'up', palm: 'forward' },
        { fingers: [0, 1, 0.4], palm: 'left' },
        { fingers: 'back', palm: 'down' },
      ];
      let best = null;
      let least = null;
      for (const orientation of turns) {
        await dispatch('set_transform', { device: 'hand-right', position: { x: 0.25, y: high, z: -0.4 }, anchor: 'wrist', orientation });
        await wait(250);
        const reach = high - (await lowest());
        if (best == null || reach > best.reach) best = { orientation, reach };
        if (least == null || reach < least.reach) least = { orientation, reach };
      }
      return { ...best, raised: least.orientation, raisedReach: least.reach };
    };
    const RAISED = { fingers: [0, 1, 0.4], palm: 'left' };

    await test('A flick of the wrist alone, the hand not moving, smashes it into the floor', async () => {
      const before = await guitar();
      const best = await lowestTurn();
      // The wrist held where the turned-over guitar reaches 25 cm into the floor.
      const at = { x: 0.25, y: Math.max(0.35, FLOOR - 0.25 + best.reach), z: -0.5 };
      await dispatch('set_transform', { device: 'hand-right', position: at, anchor: 'wrist', orientation: best.raised });
      await wait(500);
      const raised = await lowest();
      expect(raised > FLOOR + 0.05, `raised, the guitar is already down at ${raised.toFixed(2)} m`);
      await dispatch('animate_to', { device: 'hand-right', position: at, anchor: 'wrist', orientation: best.orientation, duration: 0.2 });
      await wait(600);
      const g = await guitar();
      expect(g.impacts > before.impacts, 'turning the wrist over did not strike the floor');
      expect(g.lastImpact > 2, `struck at only ${g.lastImpact.toFixed(1)} m/s`);
      return `the hand still, its turn alone struck the floor at ${g.lastImpact.toFixed(1)} m/s`;
    });

    await test('Swinging it down in an arc, wrist turning over, lands a real hit', async () => {
      const before = await guitar();
      const best = await lowestTurn();
      // Raised, wrist cocked back, then brought down turning over, aimed through the floor
      // as a real smash is, so it meets the floor still heading down.
      const top = { x: 0.25, y: 1.55, z: -0.25 };
      const bottom = { x: 0.25, y: Math.max(0.35, FLOOR - 0.35 + best.reach), z: -0.55 };
      await dispatch('set_transform', { device: 'hand-right', position: top, anchor: 'wrist', orientation: RAISED });
      await wait(500);
      const seconds = 0.25;
      await dispatch('animate_to', { device: 'hand-right', position: bottom, anchor: 'wrist', orientation: best.orientation, duration: seconds });
      await wait(seconds * 1000 + 400);
      const g = await guitar();
      const handSpeed = Math.hypot(top.y - bottom.y, top.z - bottom.z) / seconds;
      expect(g.impacts > before.impacts, `no hit; lowest point at the bottom ${(await lowest()).toFixed(2)} m`);
      expect(g.lastImpact > 3, `struck at only ${g.lastImpact.toFixed(1)} m/s`);
      return `the hand moved at ${handSpeed.toFixed(1)} m/s; the guitar struck at ${g.lastImpact.toFixed(1)} m/s`;
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
