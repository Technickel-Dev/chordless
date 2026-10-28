import { BoxGeometry, CircleGeometry, CylinderGeometry, Group, IcosahedronGeometry, Quaternion, Vector3 } from '@iwsdk/core';
import { block, disc, instances, mat, noiseTexture, type Placement, post, put, seededRandom } from './lib/set-kit.js';

/**
 * Cherry blossom garden: one big flowering tree, a stone lantern on raked
 * gravel and pink petals drifting through the air and settling on the ground.
 */
export function createBlossomGardenSet(): Group {
  const root = new Group();
  root.name = 'BlossomGardenSet';
  const rand = seededRandom(151);

  const moss = noiseTexture([104, 130, 70], 30, 152);
  moss.repeat.set(40, 40);
  disc(root, 'Moss', 150, mat(0xffffff, { map: moss }), -0.02);
  const gravel = noiseTexture([196, 190, 176], 46, 153);
  gravel.repeat.set(10, 10);
  disc(root, 'Gravel', 7, mat(0xffffff, { map: gravel, rough: 1 }), 0);
  // Raked rings in the gravel.
  for (let i = 1; i <= 6; i++) {
    const ring = new CylinderGeometry(i * 1.05 + 0.02, i * 1.05 + 0.02, 0.012, 96, 1, true);
    put(root, 'RakeLine', ring, mat(0xa8a294, { rough: 1, double: true }), [0, 0.006, 0]);
  }
  put(root, 'GravelEdge', new CylinderGeometry(7.1, 7.1, 0.12, 64, 1, true), mat(0x6c665c, { double: true }), [0, 0.04, 0]);

  // Tree: a leaning trunk of tapered segments with branches, under a canopy
  // of pink puffs.
  const tree = new Group();
  tree.name = 'BlossomTree';
  tree.position.set(-3.4, 0, -6.2);
  root.add(tree);
  const bark = mat(0x4a3428, { rough: 1 });
  const up = new Vector3(0, 1, 0);
  const limb = (from: Vector3, to: Vector3, r0: number, r1: number) => {
    const dir = to.clone().sub(from);
    const g = new CylinderGeometry(r1, r0, dir.length(), 10);
    const m = put(tree, 'Limb', g, bark, [(from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2]);
    m.quaternion.copy(new Quaternion().setFromUnitVectors(up, dir.normalize()));
  };
  const trunk = [new Vector3(0, 0, 0), new Vector3(0.3, 1.4, 0.1), new Vector3(0.9, 2.6, 0.4), new Vector3(1.2, 3.4, 0.6)];
  for (let i = 0; i < trunk.length - 1; i++) limb(trunk[i], trunk[i + 1], 0.42 - i * 0.1, 0.32 - i * 0.1);
  const tips: Vector3[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rand() * 0.4;
    const base = trunk[1 + (i % 3)];
    const tip = new Vector3(base.x + Math.cos(a) * (2 + rand() * 1.6), base.y + 1 + rand() * 1.4, base.z + Math.sin(a) * (2 + rand() * 1.6));
    limb(base, tip, 0.16, 0.06);
    tips.push(tip);
  }
  const puffs: Placement[] = [];
  const pinks = [0xf8c0d2, 0xf4a8c0, 0xfbd6e2, 0xee98b4];
  for (const tip of [...tips, trunk[3]]) {
    for (let i = 0; i < 9; i++) {
      const s = 0.7 + rand() * 0.8;
      puffs.push({
        pos: [tip.x + (rand() - 0.5) * 2.2, tip.y + (rand() - 0.3) * 1.2, tip.z + (rand() - 0.5) * 2.2],
        rotDeg: [rand() * 360, rand() * 360, 0],
        scale: [s, s * 0.75, s],
        color: pinks[Math.floor(rand() * pinks.length)],
      });
    }
  }
  instances(tree, 'Canopy', new IcosahedronGeometry(1, 1), mat(0xffffff, { rough: 0.9 }), puffs);

  // Stone lantern (toro) on the right.
  const stone = mat(0x8e8a82, { rough: 1 });
  const lantern = new Group();
  lantern.name = 'StoneLantern';
  lantern.position.set(3.4, 0, -4.2);
  lantern.rotation.y = -0.5;
  root.add(lantern);
  post(lantern, 'Foot', 0.42, 0.18, stone, [0, 0, 0], 0.36, 6);
  post(lantern, 'Pillar', 0.16, 0.8, stone, [0, 0.18, 0], 0.14, 12);
  post(lantern, 'Platform', 0.38, 0.12, stone, [0, 0.98, 0], 0.32, 6);
  block(lantern, 'Firebox', [0.44, 0.38, 0.44], stone, [0, 1.1, 0]);
  block(lantern, 'Window', [0.2, 0.2, 0.46], mat(0xffd8a0, { emissive: 0xffb860, glow: 1.4 }), [0, 1.19, 0]);
  post(lantern, 'Roof', 0.62, 0.24, stone, [0, 1.48, 0], 0.08, 6);
  put(lantern, 'Finial', new IcosahedronGeometry(0.1, 0), stone, [0, 1.8, 0]);
  // Stepping stones leading to the lantern.
  const steps: Placement[] = [[1.4, -1.6], [2.1, -2.5], [2.7, -3.3]].map(([x, z]) => ({ pos: [x, 0.02, z], rotDeg: [0, rand() * 90, 0] }));
  instances(root, 'SteppingStones', new CylinderGeometry(0.32, 0.36, 0.06, 7), stone, steps);

  // Petals: a few hundred in the air around the tree and many on the ground.
  const petals: Placement[] = [];
  for (let i = 0; i < 320; i++) {
    const r = Math.sqrt(rand()) * 9;
    const a = rand() * Math.PI * 2;
    petals.push({
      pos: [-3.4 + Math.cos(a) * r, 0.3 + rand() * 5, -5 + Math.sin(a) * r],
      rotDeg: [rand() * 360, rand() * 360, rand() * 360],
      color: pinks[i % pinks.length],
    });
  }
  for (let i = 0; i < 500; i++) {
    const r = Math.sqrt(rand()) * 7;
    const a = rand() * Math.PI * 2;
    petals.push({ pos: [-3 + Math.cos(a) * r, 0.015, -5 + Math.sin(a) * r], rotDeg: [-90, 0, rand() * 360], color: pinks[i % pinks.length] });
  }
  const petal = new CircleGeometry(0.035, 5);
  petal.scale(1, 1.5, 1);
  instances(root, 'Petals', petal, mat(0xffffff, { rough: 0.8, double: true }), petals);
  const bench = new Group();
  bench.name = 'Bench';
  bench.position.set(-5.2, 0, -2.2);
  bench.rotation.y = Math.PI / 3;
  root.add(bench);
  block(bench, 'Seat', [1.6, 0.08, 0.42], mat(0x7a5a3a), [0, 0.42, 0]);
  for (const x of [-0.6, 0.6]) block(bench, 'Leg', [0.3, 0.42, 0.36], stone, [x, 0, 0]);
  return root;
}
