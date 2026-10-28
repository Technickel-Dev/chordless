import { BoxGeometry, CylinderGeometry, Group, SphereGeometry, TorusGeometry, Vector3 } from '@iwsdk/core';
import {
  disc,
  glow,
  instances,
  mat,
  noiseTexture,
  type Placement,
  plankTexture,
  post,
  put,
  seededRandom,
  stars,
} from './lib/set-kit.js';

/**
 * Abandoned wedding reception: a lawn dance floor at night, round tables in
 * white cloths, a leaning three-tier cake and sagging strings of bulbs.
 */
export function createWeddingSet(): Group {
  const root = new Group();
  root.name = 'WeddingSet';
  const rand = seededRandom(101);

  const lawn = noiseTexture([46, 70, 40], 30, 102);
  lawn.repeat.set(50, 50);
  disc(root, 'Lawn', 120, mat(0xffffff, { map: lawn }), -0.02);
  const boards = plankTexture([120, 88, 60], 12, 103);
  boards.repeat.set(2, 2);
  put(root, 'DanceFloor', new CylinderGeometry(3, 3, 0.04, 8), mat(0xffffff, { map: boards, rough: 0.5 }), [0, 0.0, 0], [0, 22.5, 0]);

  // Round tables with cloths reaching the ground.
  const tables: Placement[] = [];
  const spots: [number, number][] = [[-4.5, -5], [0, -7], [4.6, -5.2], [-7.5, -1.5], [7.8, -1.2], [-3.5, -10.5], [4, -10.8]];
  for (const [x, z] of spots) tables.push({ pos: [x, 0, z], rotDeg: [0, rand() * 360, 0] });
  const cloth = mat(0xf4f1ea, { rough: 0.9 });
  const skirt = new CylinderGeometry(0.95, 1.1, 0.76, 32, 1, true);
  skirt.translate(0, 0.38, 0);
  instances(root, 'TableSkirts', skirt, mat(0xf4f1ea, { rough: 0.9, double: true }), tables);
  const top = new CylinderGeometry(0.95, 0.95, 0.03, 32);
  top.translate(0, 0.77, 0);
  instances(root, 'TableTops', top, cloth, tables);
  const centerpiece = new SphereGeometry(0.16, 12, 8);
  centerpiece.translate(0, 0.92, 0);
  instances(root, 'Centerpieces', centerpiece, mat(0x8a3a4a, { rough: 0.9 }), tables);
  const candle = new CylinderGeometry(0.03, 0.03, 0.18, 8);
  candle.translate(0.35, 0.87, 0.1);
  instances(root, 'Candles', candle, glow(0xffe2a8), tables);
  // Toppled chairs scattered around.
  const chairs: Placement[] = [];
  for (const [x, z] of spots) {
    for (let i = 0; i < 3; i++) {
      const a = rand() * Math.PI * 2;
      const tipped = rand() < 0.4;
      chairs.push({ pos: [x + Math.cos(a) * 1.4, tipped ? 0.2 : 0, z + Math.sin(a) * 1.4], rotDeg: [tipped ? 90 : 0, rand() * 360, 0] });
    }
  }
  const chair = new CylinderGeometry(0.22, 0.2, 0.45, 12);
  chair.translate(0, 0.225, 0);
  instances(root, 'Chairs', chair, mat(0xd4b060, { metal: 0.6, rough: 0.4 }), chairs);

  // The cake, leaning badly, on the head table straight ahead.
  const cakeTable = new Group();
  cakeTable.name = 'CakeTable';
  cakeTable.position.set(0, 0, -3.6);
  root.add(cakeTable);
  post(cakeTable, 'Skirt', 0.7, 0.76, cloth, [0, 0, 0], 0.6, 32);
  const cake = new Group();
  cake.name = 'WeddingCake';
  cake.position.set(0, 0.76, 0);
  cake.rotation.set(0.12, 0, -0.16);
  cakeTable.add(cake);
  const icing = mat(0xfbf8f0, { rough: 0.6 });
  let y = 0;
  for (const [r, h] of [[0.42, 0.3], [0.31, 0.26], [0.2, 0.22]]) {
    post(cake, 'Tier', r, h, icing, [0, y, 0], r, 32);
    put(cake, 'Piping', new TorusGeometry(r, 0.025, 6, 32), icing, [0, y + h, 0], [90, 0, 0]);
    y += h;
  }
  put(cake, 'Rose', new SphereGeometry(0.06, 10, 8), mat(0xc84a5a), [0.05, y + 0.04, 0]);
  put(cake, 'Rose', new SphereGeometry(0.05, 10, 8), mat(0xc84a5a), [-0.06, y + 0.03, 0.04]);

  // Strings of bulbs sagging between four tall poles.
  const poles: [number, number][] = [[-9, -12], [9, -12], [9, 3], [-9, 3]];
  const wood = mat(0x4a3a2c);
  for (const [x, z] of poles) post(root, 'Pole', 0.08, 4.2, wood, [x, 0, z], 0.06, 8);
  const bulbs: Placement[] = [];
  const wire: Placement[] = [];
  const a = new Vector3();
  const b = new Vector3();
  const spans: [number, number][] = [[0, 2], [1, 3], [0, 1], [3, 2], [0, 3], [1, 2]];
  for (const [i, j] of spans) {
    a.set(poles[i][0], 4.1, poles[i][1]);
    b.set(poles[j][0], 4.1, poles[j][1]);
    const n = Math.round(a.distanceTo(b) / 0.8);
    const yaw = (-Math.atan2(b.z - a.z, b.x - a.x) * 180) / Math.PI;
    const at = (t: number): [number, number, number] => [
      a.x + (b.x - a.x) * t,
      4.1 - Math.sin(t * Math.PI) * 1.1,
      a.z + (b.z - a.z) * t,
    ];
    for (let k = 0; k <= n; k++) {
      const p = at(k / n);
      bulbs.push({ pos: [p[0], p[1] - 0.08, p[2]], color: rand() < 0.12 ? 0x3a3020 : 0xffd89a });
      if (k === n) continue;
      const q = at((k + 1) / n);
      const run = Math.hypot(q[0] - p[0], q[2] - p[2]);
      const pitch = (Math.atan2(q[1] - p[1], run) * 180) / Math.PI;
      wire.push({
        pos: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2],
        rotDeg: [0, yaw, pitch],
        scale: [Math.hypot(run, q[1] - p[1]), 1, 1],
      });
    }
  }
  instances(root, 'Bulbs', new SphereGeometry(0.06, 10, 8), glow(0xffffff), bulbs);
  instances(root, 'Wire', new BoxGeometry(1, 0.012, 0.012), mat(0x111111), wire);
  stars(root, 900, 170, 104);
  return root;
}
