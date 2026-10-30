import { BoxGeometry, CircleGeometry, ConeGeometry, CylinderGeometry, Group, MeshStandardMaterial } from '@iwsdk/core';
import { disc, instances, mat, noiseTexture, type Placement, put, seededRandom } from './lib/set-kit.js';

/** Matte, flat-shaded card stock in one color. */
function card(color: number): MeshStandardMaterial {
  const m = mat(color, { rough: 1, double: true });
  m.flatShading = true;
  return m;
}

/**
 * Paper world: a floor of off-white paper, folded low-poly hills in pastel
 * card, flat cut-out trees and clouds propped on little stands, and a
 * cardboard sun hanging on a string.
 */
export function createPaperWorldSet(): Group {
  const root = new Group();
  root.name = 'PaperWorldSet';
  const rand = seededRandom(601);
  disc(root, 'Paper', 190, mat(0xffffff, { map: noiseTexture([240, 234, 220], 10, 602), rough: 1 }), 0);

  // Folded hills: low-poly pyramids in a few pastel cards.
  const hillColors = [0x9ad8a0, 0x7ac48a, 0xb8e0a0, 0xa8d0c8];
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const r = 14 + Math.pow(rand(), 0.6) * 130;
    const h = 4 + rand() * (r * 0.18);
    const w = 6 + rand() * 18;
    put(root, 'FoldedHill', new ConeGeometry(w, h, 4 + Math.floor(rand() * 3)), card(hillColors[i % 4]), [Math.sin(a) * r, h / 2, -Math.cos(a) * r], [0, rand() * 90, 0]);
  }

  // Cut-out trees: a flat canopy on a flat trunk, with a card stand behind.
  const trees: [number, number, number][] = [];
  while (trees.length < 30) {
    const x = (rand() - 0.5) * 50;
    const z = -4 - rand() * 40;
    if (Math.abs(x) < 2.5 && z > -8) continue;
    trees.push([x, z, 0.8 + rand() * 1.2]);
  }
  const canopies: Placement[] = trees.map(([x, z, s]) => ({ pos: [x, 2.4 * s, z], scale: s, color: [0x5ab86a, 0x3a9a5a, 0x7acb6a][Math.floor(rand() * 3)] }));
  const trunks: Placement[] = trees.map(([x, z, s]) => ({ pos: [x, 0.75 * s, z - 0.01], scale: s }));
  const stands: Placement[] = trees.map(([x, z, s]) => ({ pos: [x, 0.45 * s, z - 0.35 * s], rotDeg: [-40, 0, 0], scale: s }));
  instances(root, 'TreeCanopies', new CircleGeometry(1.2, 9), card(0xffffff), canopies);
  instances(root, 'TreeTrunks', new BoxGeometry(0.35, 1.5, 0.01), card(0x8a6040), trunks);
  instances(root, 'TreeStands', new BoxGeometry(0.3, 1, 0.01), card(0xc8b08a), stands);
  // Paper flowers dotted around the player.
  const flowers: Placement[] = [];
  for (let i = 0; i < 50; i++) {
    const a = rand() * Math.PI * 2;
    const r = 2 + rand() * 8;
    flowers.push({ pos: [Math.sin(a) * r, 0.2, -Math.cos(a) * r], color: [0xf28aa0, 0xf2d06a, 0xa88af2, 0xffffff][i % 4] });
  }
  instances(root, 'Flowers', new CircleGeometry(0.12, 6), card(0xffffff), flowers);
  instances(root, 'FlowerStems', new BoxGeometry(0.015, 0.2, 0.005).translate(0, -0.1, 0), card(0x4a9a4a), flowers.map((f) => ({ pos: f.pos })));

  // Cardboard sun on a string and cut-out clouds.
  put(root, 'Sun', new CylinderGeometry(4, 4, 0.2, 14), card(0xf6c83a), [8, 20, -40], [90, 0, 0]);
  const rays: Placement[] = [];
  for (let i = 0; i < 14; i++) rays.push({ pos: [8, 20, -40.1], rotDeg: [0, 0, (i / 14) * 360] });
  instances(root, 'SunRays', new ConeGeometry(0.8, 2.4, 3).translate(0, 5, 0), card(0xf6a83a), rays);
  put(root, 'String', new CylinderGeometry(0.02, 0.02, 40, 4), card(0xf2f2f2), [8, 44, -40]);
  const clouds: Placement[] = [];
  for (let i = 0; i < 10; i++) clouds.push({ pos: [(rand() - 0.5) * 80, 12 + rand() * 12, -30 - rand() * 50], scale: [3 + rand() * 3, 1.6 + rand(), 1] });
  instances(root, 'Clouds', new CircleGeometry(1, 10), card(0xf8f8ff), clouds);
  instances(root, 'CloudStrings', new CylinderGeometry(0.02, 0.02, 30, 4).translate(0, 15, 0), card(0xf2f2f2), clouds.map((c) => ({ pos: [c.pos[0], c.pos[1], c.pos[2] - 0.05] })));
  return root;
}
