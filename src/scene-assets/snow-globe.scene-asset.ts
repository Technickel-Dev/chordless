import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, OctahedronGeometry, SphereGeometry, TorusGeometry } from '@iwsdk/core';
import { block, glow, instances, mat, noiseTexture, type Placement, plankTexture, put, seededRandom } from './lib/set-kit.js';

/**
 * Snow globe: the player stands on the snowy floor inside a glass globe on a
 * wooden plinth, glitter hanging in the water around them and a giant's
 * fireside glowing beyond the glass.
 */
export function createSnowGlobeSet(): Group {
  const root = new Group();
  root.name = 'SnowGlobeSet';
  const rand = seededRandom(251);
  const radius = 4.5;
  const centerY = 1.5;
  const floorR = Math.sqrt(radius * radius - centerY * centerY);

  const snow = mat(0xffffff, { map: noiseTexture([240, 244, 250], 14, 252), rough: 0.85 });
  put(root, 'SnowFloor', new CylinderGeometry(floorR, floorR, 0.1, 64), snow, [0, -0.05, 0]);
  const mounds: Placement[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rand() * 0.4;
    const r = 2.4 + rand() * 1.3;
    mounds.push({ pos: [Math.sin(a) * r, 0, Math.cos(a) * r], scale: [0.8 + rand() * 0.8, 0.25 + rand() * 0.3, 0.8 + rand() * 0.8] });
  }
  instances(root, 'Drifts', new SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), snow, mounds);

  // Two tiny pines and a cottage with a lit window, toy-scale.
  const pine = mat(0x2a5a3a, { rough: 0.8 });
  for (const [x, z, s] of [[-2.2, -2.4, 1.3], [2.6, -1.8, 1]]) {
    for (const [r, h, y] of [[0.5, 0.8, 0.25], [0.38, 0.7, 0.7], [0.25, 0.55, 1.1]]) {
      put(root, 'PineTier', new ConeGeometry(r * s, h * s, 10), pine, [x, (y + h / 2) * s, z]);
    }
    put(root, 'PineTop', new OctahedronGeometry(0.08 * s), glow(0xffe27a), [x, 1.75 * s, z]);
  }
  const cottage = new Group();
  cottage.name = 'Cottage';
  cottage.position.set(0.4, 0, -3.1);
  root.add(cottage);
  block(cottage, 'Walls', [0.9, 0.6, 0.7], mat(0xc84a3a, { rough: 0.7 }), [0, 0, 0]);
  const roof = put(cottage, 'Roof', new ConeGeometry(0.75, 0.5, 4), snow, [0, 0.85, 0], [0, 45, 0]);
  roof.scale.set(1, 1, 0.85);
  block(cottage, 'Window', [0.18, 0.18, 0.02], glow(0xffd890), [0.2, 0.25, 0.36]);
  block(cottage, 'Door', [0.18, 0.32, 0.02], mat(0x4a2a1a), [-0.18, 0, 0.36]);

  // The globe glass, a thin rim ring and the plinth below.
  const glass = mat(0xdff0ff, { rough: 0.02, metal: 0.1, double: true });
  glass.transparent = true;
  glass.opacity = 0.1;
  glass.depthWrite = false;
  put(root, 'Glass', new SphereGeometry(radius, 64, 32, 0, Math.PI * 2, 0, Math.PI * 0.85), glass, [0, centerY, 0]);
  const gold = mat(0xc8a040, { metal: 0.9, rough: 0.25 });
  put(root, 'Collar', new TorusGeometry(floorR + 0.05, 0.12, 10, 96), gold, [0, 0, 0], [90, 0, 0]);
  const wood = plankTexture([96, 56, 32], 6, 253);
  put(root, 'Plinth', new CylinderGeometry(floorR + 0.3, floorR + 1, 2.6, 64), mat(0xffffff, { map: wood, rough: 0.4 }), [0, -1.35, 0]);
  put(root, 'PlinthBand', new TorusGeometry(floorR + 0.55, 0.06, 8, 96), gold, [0, -0.9, 0], [90, 0, 0]);

  // Glitter: tiny bright flakes suspended through the globe.
  const flakes: Placement[] = [];
  const tints = [0xffffff, 0xffe8a0, 0xd8e8ff, 0xffd0e0];
  while (flakes.length < 900) {
    const x = (rand() * 2 - 1) * radius;
    const y = centerY + (rand() * 2 - 1) * radius;
    const z = (rand() * 2 - 1) * radius;
    if (y < 0.05 || Math.hypot(x, y - centerY, z) > radius - 0.15) continue;
    if (Math.hypot(x, z) < 0.6) continue; // keep the player's own space clear
    flakes.push({ pos: [x, y, z], rotDeg: [rand() * 360, rand() * 360, 0], scale: 0.6 + rand() * 0.8, color: tints[flakes.length % 4] });
  }
  instances(root, 'Glitter', new OctahedronGeometry(0.02), glow(0xffffff), flakes);

  // Beyond the glass: a giant's dark room lit by a fireplace far ahead.
  put(root, 'TableTop', new BoxGeometry(60, 1, 40), mat(0x3a2618, { rough: 0.5 }), [0, -3.15, -6]);
  block(root, 'Fireplace', [26, 18, 4], mat(0x3a2a26, { rough: 1 }), [0, -20, -60]);
  block(root, 'Hearth', [14, 9, 0.5], glow(0xff8a3a), [0, -18, -57.8]);
  block(root, 'Mantel', [32, 1.5, 6], mat(0x4a3020, { rough: 0.6 }), [0, -2, -60]);
  return root;
}
