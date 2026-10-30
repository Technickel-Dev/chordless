import { AdditiveBlending, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial } from '@iwsdk/core';
import { disc, instances, mat, noiseTexture, type Placement, seededRandom, stripeTexture } from './lib/set-kit.js';

/**
 * Bamboo forest: tall green stalks crowding in on all sides of a small
 * clearing and a stone path, leaf clusters high above and soft shafts of
 * light filtering down.
 */
export function createBambooForestSet(): Group {
  const root = new Group();
  root.name = 'BambooForestSet';
  const rand = seededRandom(421);
  const litter = noiseTexture([120, 110, 70], 40, 422);
  litter.repeat.set(40, 40);
  disc(root, 'ForestFloor', 120, mat(0xffffff, { map: litter, rough: 1 }), 0);
  const stones: Placement[] = [];
  for (let i = 0; i < 14; i++) stones.push({ pos: [Math.sin(i * 0.5) * 0.6, 0.02, -1.6 - i * 1.3], rotDeg: [0, rand() * 90, 0], scale: [0.45, 1, 0.38] });
  instances(root, 'PathStones', new CylinderGeometry(1, 1.05, 0.06, 8), mat(0x8a8a84, { rough: 1 }), stones);

  // Stalks: a node every 0.4 of the texture, kept off the clearing and path.
  const nodes = stripeTexture([110, 160, 70], [80, 120, 50], 2, 64);
  nodes.rotation = Math.PI / 2;
  nodes.repeat.set(1, 14);
  const stalks: Placement[] = [];
  const tops: Placement[] = [];
  while (stalks.length < 900) {
    const a = rand() * Math.PI * 2;
    const r = 2.2 + Math.pow(rand(), 0.8) * 55;
    const x = Math.sin(a) * r;
    const z = -Math.cos(a) * r;
    if (Math.abs(x - Math.sin(-z * 0.4) * 0.6) < 1.2 && z < -1 && z > -20) continue;
    const h = 9 + rand() * 9;
    const s = 0.6 + rand() * 0.6;
    stalks.push({ pos: [x, h / 2, z], rotDeg: [(rand() - 0.5) * 6, 0, (rand() - 0.5) * 6], scale: [s, h, s] });
    if (stalks.length % 2 === 0) tops.push({ pos: [x, h - 1 + rand(), z], rotDeg: [rand() * 360, rand() * 360, 0], scale: [1.6, 0.8, 1.6] });
  }
  instances(root, 'Stalks', new CylinderGeometry(0.06, 0.07, 1, 8), mat(0xffffff, { map: nodes, rough: 0.6 }), stalks);
  instances(root, 'LeafClusters', new IcosahedronGeometry(1, 1), mat(0x5a9a3a, { rough: 0.9 }), tops);

  // Light shafts slanting through the canopy.
  const shaftMat = new MeshBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false });
  for (let i = 0; i < 7; i++) {
    const w = 0.6 + rand() * 1.2;
    const g = new CylinderGeometry(w, w * 1.6, 18, 12, 4, true);
    const colors: number[] = [];
    const pos = g.getAttribute('position');
    for (let k = 0; k < pos.count; k++) {
      const t = (pos.getY(k) + 9) / 18;
      const c = (0.3 + t * 0.7) * 0.07;
      colors.push(c, c * 0.95, c * 0.7);
    }
    g.setAttribute('color', new Float32BufferAttribute(colors, 3));
    const shaft = new Mesh(g, shaftMat);
    shaft.name = 'LightShaft';
    shaft.position.set((rand() - 0.5) * 16, 8, -3 - rand() * 14);
    shaft.rotation.set(0.2, 0, -0.3);
    shaft.userData.iwsdkPreviewBounds = 'exclude';
    root.add(shaft);
  }
  return root;
}
