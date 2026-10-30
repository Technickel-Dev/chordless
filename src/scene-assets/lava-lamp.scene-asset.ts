import { ConeGeometry, CylinderGeometry, Group, SphereGeometry } from '@iwsdk/core';
import { block, instances, mat, type Placement, post, put, room, seededRandom } from './lib/set-kit.js';

/**
 * Inside a lava lamp: the player floats on a pool of warm wax at the bottom
 * of a tall glowing glass, great soft blobs drifting up around them, the
 * metal cap far overhead and a dim bedroom blurred beyond the glass.
 */
export function createLavaLampSet(): Group {
  const root = new Group();
  root.name = 'LavaLampSet';
  const rand = seededRandom(571);
  const radius = 6;

  // The glass: a tall tapered vessel tinted purple, lit from below.
  const liquid = mat(0x8a3ad8, { rough: 0.1, emissive: 0x4a1a8a, glow: 0.6, double: true });
  liquid.transparent = true;
  liquid.opacity = 0.35;
  liquid.depthWrite = false;
  put(root, 'Glass', new CylinderGeometry(radius * 0.55, radius, 26, 48, 1, true), liquid, [0, 12.5, 0]);
  // Wax pool at the bottom where the player stands, its glow spreading up.
  const wax = mat(0xff7a2a, { rough: 0.4, emissive: 0xff5a1a, glow: 1.1 });
  put(root, 'WaxPool', new CylinderGeometry(radius - 0.05, radius - 0.05, 0.4, 48), wax, [0, -0.2, 0]);
  const mounds: Placement[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + rand() * 0.3;
    mounds.push({ pos: [Math.sin(a) * 4.4, 0, Math.cos(a) * 4.4], scale: [1.4 + rand(), 0.6 + rand() * 0.5, 1.4 + rand()] });
  }
  instances(root, 'WaxMounds', new SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), wax, mounds);

  // Blobs: stretched spheres of glowing wax rising in the liquid.
  const blobs: Placement[] = [];
  const tones = [0xff6a2a, 0xff8a3a, 0xff4a5a, 0xffa84a];
  for (let i = 0; i < 18; i++) {
    const y = 2.5 + rand() * 20;
    const rMax = radius * (1 - (y / 26) * 0.45) - 1.6;
    const a = rand() * Math.PI * 2;
    const r = 1.4 + rand() * Math.max(0, rMax - 1.4);
    const s = 0.7 + rand() * 1.3;
    blobs.push({ pos: [Math.sin(a) * r, y, Math.cos(a) * r], rotDeg: [rand() * 30, rand() * 360, rand() * 30], scale: [s, s * (1.2 + rand() * 0.8), s], color: tones[i % tones.length] });
  }
  instances(root, 'Blobs', new SphereGeometry(1, 24, 16), mat(0xffffff, { rough: 0.35, emissive: 0xff4a10, glow: 0.8 }), blobs);

  // Base below and cap above.
  const metal = mat(0xc8ccd2, { metal: 0.9, rough: 0.25 });
  post(root, 'Base', radius + 1.4, 5, metal, [0, -5.4, 0], radius + 0.2, 48);
  post(root, 'BaseFoot', radius + 2, 0.6, metal, [0, -6, 0], radius + 1.6, 48);
  post(root, 'Cap', radius * 0.55, 3, metal, [0, 25.5, 0], radius * 0.4, 48);
  put(root, 'CapTip', new ConeGeometry(radius * 0.4, 1.6, 48), metal, [0, 29.3, 0]);

  // A big dim bedroom outside: a bed, a window of night sky, a poster.
  room(root, 'Bedroom', [120, 70, 120], mat(0x2a2440, { rough: 1 }), mat(0x3a2a2a, { rough: 1 }), mat(0x1a1626), [0, 0]).position.y = -18;
  block(root, 'Nightstand', [18, 12, 18], mat(0x4a3020, { rough: 0.6 }), [0, -18, 0]);
  block(root, 'Bed', [40, 14, 60], mat(0x5a4a8a, { rough: 1 }), [-40, -18, -20]);
  block(root, 'Window', [30, 24, 0.5], mat(0x1a2a5a, { emissive: 0x1a2a5a, glow: 0.6 }), [20, 6, -59.5]);
  block(root, 'Poster', [16, 22, 0.3], mat(0xd83a8a, { emissive: 0x5a1a3a, glow: 0.4 }), [-30, 8, -59.6]);
  return root;
}
