import { BoxGeometry, ConeGeometry, CylinderGeometry, Group } from '@iwsdk/core';
import {
  block,
  glow,
  instances,
  mat,
  noiseTexture,
  type Placement,
  post,
  put,
  seededRandom,
  windowTexture,
} from './lib/set-kit.js';

/**
 * Rainy rooftop: a tar roof with a low parapet, a wooden water tower and an
 * AC unit, a glowing city skyline all round, and rain streaking down.
 */
export function createRainyRooftopSet(): Group {
  const root = new Group();
  root.name = 'RainyRooftopSet';
  const rand = seededRandom(171);

  // Roof: 16 x 14, the parapet's front edge 5 m ahead of the player.
  const tar = noiseTexture([46, 46, 50], 20, 172);
  tar.repeat.set(8, 8);
  block(root, 'Roof', [16, 0.4, 14], mat(0xffffff, { map: tar, rough: 0.35 }), [0, -0.4, 2]);
  block(root, 'Building', [16, 60, 14], mat(0x1c1c22), [0, -60.4, 2]);
  const concrete = mat(0x6a6a70, { rough: 0.9 });
  block(root, 'ParapetFront', [16, 0.9, 0.3], concrete, [0, 0, -4.85]);
  block(root, 'ParapetBack', [16, 0.9, 0.3], concrete, [0, 0, 8.85]);
  block(root, 'ParapetLeft', [0.3, 0.9, 14], concrete, [-7.85, 0, 2]);
  block(root, 'ParapetRight', [0.3, 0.9, 14], concrete, [7.85, 0, 2]);
  const puddles: Placement[] = [
    { pos: [1.8, 0.005, -1.6], scale: [1.4, 1, 0.8] },
    { pos: [-2.4, 0.005, 1.2], scale: [0.9, 1, 1.3] },
    { pos: [3.5, 0.005, 3], scale: [1.1, 1, 0.7] },
  ];
  instances(root, 'Puddles', new CylinderGeometry(1, 1, 0.01, 24), mat(0x101218, { rough: 0.02, metal: 0.6 }), puddles);

  // Water tower, front left.
  const tower = new Group();
  tower.name = 'WaterTower';
  tower.position.set(-4.8, 0, -2.2);
  root.add(tower);
  const steel = mat(0x3a3a3e, { metal: 0.7, rough: 0.5 });
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) post(tower, 'Leg', 0.08, 3.2, steel, [x, 0, z], 0.08, 8);
  block(tower, 'Platform', [2.6, 0.12, 2.6], steel, [0, 3.2, 0]);
  post(tower, 'Tank', 1.4, 3, mat(0x6a4a34, { rough: 0.95 }), [0, 3.32, 0], 1.4, 24);
  for (const y of [3.8, 4.9, 5.9]) post(tower, 'Hoop', 1.43, 0.08, steel, [0, y, 0], 1.43, 24);
  put(tower, 'Cap', new ConeGeometry(1.6, 1.1, 24), mat(0x2e2a28, { rough: 0.8 }), [0, 6.87, 0]);
  // AC unit and vent, right.
  block(root, 'ACUnit', [1.6, 1, 1.1], mat(0x9a9ca0, { metal: 0.4, rough: 0.6 }), [4.4, 0, -2.6], -12);
  post(root, 'Vent', 0.25, 1.2, steel, [5.8, 0, -0.5], 0.25, 12);
  put(root, 'RedBeacon', new CylinderGeometry(0.08, 0.08, 0.12, 8), glow(0xff3030), [-4.8, 7.5, -2.2]);

  // Skyline: towers of lit windows at 30-170 m.
  const facade = windowTexture(174, 0.35);
  facade.repeat.set(2, 3);
  const towers: Placement[] = [];
  for (let i = 0; i < 140; i++) {
    const a = rand() * Math.PI * 2;
    const r = 30 + Math.pow(rand(), 0.7) * 140;
    const h = 20 + rand() * (r > 80 ? 110 : 70);
    const w = 10 + rand() * 16;
    towers.push({ pos: [Math.sin(a) * r, -60, -Math.cos(a) * r], rotDeg: [0, rand() * 90, 0], scale: [w, h, w] });
  }
  const box = new BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);
  const lit = mat(0xffffff, { map: facade, emissive: 0xffffff, glow: 1.2 });
  lit.emissiveMap = facade;
  instances(root, 'Skyline', box, lit, towers);

  // Rain: thin bright streaks in the air around the roof.
  const rain: Placement[] = [];
  for (let i = 0; i < 2200; i++) {
    const r = Math.sqrt(rand()) * 18;
    const a = rand() * Math.PI * 2;
    rain.push({ pos: [Math.sin(a) * r, rand() * 9, Math.cos(a) * r], rotDeg: [4, 0, 6], scale: [1, 0.6 + rand() * 0.8, 1] });
  }
  const streaks = instances(root, 'Rain', new BoxGeometry(0.006, 0.45, 0.006), glow(0xb8c8e0, 0.45, true), rain);
  streaks.userData.iwsdkPreviewBounds = 'exclude';
  return root;
}
