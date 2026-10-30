import { CircleGeometry, CylinderGeometry, DodecahedronGeometry, Group } from '@iwsdk/core';
import { blobTexture, disc, instances, mat, type Placement, put, seededRandom } from './lib/set-kit.js';

/**
 * Autumn forest clearing: a carpet of fallen leaves, a ring of orange, red
 * and gold trees, a mossy log to sit on and leaves drifting down.
 */
export function createAutumnClearingSet(): Group {
  const root = new Group();
  root.name = 'AutumnClearingSet';
  const rand = seededRandom(441);
  const leafLitter = blobTexture([96, 70, 40], [[200, 90, 30], [220, 150, 40], [160, 50, 30], [120, 90, 40]], 200, 6, 442);
  leafLitter.repeat.set(20, 20);
  disc(root, 'LeafCarpet', 150, mat(0xffffff, { map: leafLitter, rough: 1 }), 0);

  const autumn = [0xe07a2a, 0xd84a2a, 0xf2b83a, 0xc8602a, 0xa83a2a];
  const trunks: Placement[] = [];
  const crowns: Placement[] = [];
  for (let i = 0; i < 120; i++) {
    const a = rand() * Math.PI * 2;
    const r = 8 + Math.pow(rand(), 0.7) * 50;
    const h = 5 + rand() * 4;
    const x = Math.sin(a) * r;
    const z = -Math.cos(a) * r;
    trunks.push({ pos: [x, h / 2, z], scale: [1, h, 1] });
    const c = autumn[i % autumn.length];
    for (let k = 0; k < 3; k++) {
      const s = 1.8 + rand() * 1.4;
      crowns.push({ pos: [x + (rand() - 0.5) * 2, h + rand() * 1.6, z + (rand() - 0.5) * 2], rotDeg: [rand() * 90, rand() * 360, 0], scale: [s, s * 0.85, s], color: c });
    }
  }
  instances(root, 'Trunks', new CylinderGeometry(0.22, 0.35, 1, 8), mat(0x4a3426, { rough: 1 }), trunks);
  instances(root, 'Crowns', new DodecahedronGeometry(1, 1), mat(0xffffff, { rough: 0.9 }), crowns);

  // A log ahead-left, and a stump.
  put(root, 'Log', new CylinderGeometry(0.4, 0.45, 3.6, 14), mat(0x5a4030, { rough: 1 }), [-2.6, 0.38, -3.8], [0, 30, 90]);
  put(root, 'LogMoss', new CylinderGeometry(0.42, 0.42, 1.4, 14, 1, true, 0, Math.PI), mat(0x5a8a3a, { rough: 1, double: true }), [-2.4, 0.42, -3.9], [0, 30, 90]);
  put(root, 'Stump', new CylinderGeometry(0.5, 0.6, 0.5, 14), mat(0x5a4030, { rough: 1 }), [3, 0.25, -4.6]);
  put(root, 'StumpRings', new CylinderGeometry(0.48, 0.48, 0.01, 14), mat(0xc8a070), [3, 0.505, -4.6]);
  // Mushrooms by the stump.
  instances(root, 'Mushrooms', new CylinderGeometry(0.1, 0.02, 0.06, 10), mat(0xd83a2a), [
    { pos: [3.6, 0.12, -4.3] }, { pos: [3.7, 0.09, -4.7], scale: 0.7 }, { pos: [2.5, 0.1, -4.2], scale: 0.8 },
  ]);

  // Falling and fallen leaves.
  const leaves: Placement[] = [];
  for (let i = 0; i < 500; i++) {
    const r = Math.sqrt(rand()) * 14;
    const a = rand() * Math.PI * 2;
    leaves.push({ pos: [Math.sin(a) * r, 0.4 + rand() * 6, -2 - Math.cos(a) * r], rotDeg: [rand() * 360, rand() * 360, rand() * 360], color: autumn[i % autumn.length] });
  }
  const leaf = new CircleGeometry(0.06, 5);
  leaf.scale(1, 1.4, 1);
  instances(root, 'FallingLeaves', leaf, mat(0xffffff, { rough: 0.8, double: true }), leaves);
  return root;
}
