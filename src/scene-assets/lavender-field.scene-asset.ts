import { CylinderGeometry, DodecahedronGeometry, Group, SphereGeometry } from '@iwsdk/core';
import { disc, instances, mat, noiseTexture, type Placement, put, seededRandom, skyBody } from './lib/set-kit.js';

/**
 * Lavender field: purple rows running off to the horizon on either side of a
 * dirt track, a lone tree on a rise and a low golden-hour sun.
 */
export function createLavenderFieldSet(): Group {
  const root = new Group();
  root.name = 'LavenderFieldSet';
  const rand = seededRandom(411);
  const soil = noiseTexture([140, 110, 80], 30, 412);
  soil.repeat.set(60, 60);
  disc(root, 'Soil', 190, mat(0xffffff, { map: soil, rough: 1 }), 0);

  // Rows run along Z every 1.6 m; the player stands in the gap between two.
  const bushes: Placement[] = [];
  const purples = [0x8a5ad0, 0x9a6ae0, 0x7a4ac0, 0xa47ae8];
  for (let x = -40; x <= 40; x += 1.6) {
    if (Math.abs(x) < 1) continue;
    for (let z = -170; z < 40; z += 1.1 + Math.abs(z) * 0.01) {
      const s = 0.55 + rand() * 0.2;
      bushes.push({ pos: [x + (rand() - 0.5) * 0.15, 0.25, z], scale: [s, 0.5 + rand() * 0.15, s * 1.2], color: purples[Math.floor(rand() * 4)] });
    }
  }
  instances(root, 'Lavender', new SphereGeometry(1, 10, 6), mat(0xffffff, { rough: 0.9 }), bushes);
  const stems: Placement[] = bushes.filter((_, i) => i % 3 === 0).map((b) => ({ pos: [b.pos[0], 0.15, b.pos[2]], scale: [0.55, 0.3, 0.6] }));
  instances(root, 'Foliage', new SphereGeometry(1, 8, 5), mat(0x6a7a4a, { rough: 1 }), stems);
  // Farther hills in soft haze.
  const hills: Placement[] = [];
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    hills.push({ pos: [Math.sin(a) * 175, -8, -Math.cos(a) * 175], scale: [40 + rand() * 30, 18 + rand() * 14, 30] });
  }
  instances(root, 'Hills', new SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x8a90a8, { rough: 1 }), hills);

  // A lone tree on a rise ahead-left.
  put(root, 'Rise', new SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x8a9a52, { rough: 1 }), [-14, -1, -36]).scale.set(9, 2.2, 7);
  put(root, 'Trunk', new CylinderGeometry(0.35, 0.55, 4.4, 10), mat(0x4a3628), [-14, 3.2, -36]);
  instances(root, 'Crown', new DodecahedronGeometry(1, 1), mat(0x4a7a3a, { rough: 0.9 }), [
    { pos: [-14, 6.4, -36], scale: [3.4, 2.4, 3.2] },
    { pos: [-12.4, 6, -35.4], scale: [2.2, 1.8, 2.2] },
    { pos: [-15.6, 6.1, -36.6], scale: [2.4, 1.8, 2.2] },
  ]);
  skyBody(root, 'Sun', [50, 14, -170], 10, 0xffe0a0, 0xffa050, 4);
  return root;
}
