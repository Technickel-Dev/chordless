import { ConeGeometry, CylinderGeometry, DodecahedronGeometry, Group, SphereGeometry } from '@iwsdk/core';
import { glow, instances, mat, noiseTexture, type Placement, put, seededRandom, skyBody, stars, tileTexture } from './lib/set-kit.js';

/**
 * Giant turtle: a grassy patch with one little tree on top of a vast turtle
 * shell, its head and flippers reaching out ahead, swimming through a starry
 * void.
 */
export function createGiantTurtleSet(): Group {
  const root = new Group();
  root.name = 'GiantTurtleSet';
  const rand = seededRandom(281);

  // Shell: a flattened dome whose crown is at y = 0 under the player.
  const radius = 14;
  const squash = 0.45;
  const crownY = -radius * squash;
  const scutes = tileTexture([112, 92, 52], [96, 80, 46], 6, [58, 44, 26]);
  scutes.repeat.set(4, 2);
  const shell = put(root, 'Shell', new SphereGeometry(radius, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xffffff, { map: scutes, rough: 0.7 }), [0, crownY, 0]);
  shell.scale.set(1, squash, 1.15);
  const belly = put(root, 'Plastron', new SphereGeometry(radius * 0.96, 48, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(0xc8b078, { rough: 0.8 }), [0, crownY, 0]);
  belly.scale.set(1, 0.18, 1.1);
  // Grass cap following the same dome.
  const grassMap = noiseTexture([88, 138, 60], 34, 282);
  grassMap.repeat.set(6, 6);
  const grass = put(root, 'Grass', new SphereGeometry(radius + 0.06, 64, 12, 0, Math.PI * 2, 0, 0.5), mat(0xffffff, { map: grassMap, rough: 1 }), [0, crownY, 0]);
  grass.scale.copy(shell.scale);

  // A little tree, a rock and flowers on the patch.
  put(root, 'TreeTrunk', new CylinderGeometry(0.12, 0.2, 1.8, 8), mat(0x5a3e2a), [-2.4, 0.7, -2.6]);
  instances(root, 'TreeCrown', new DodecahedronGeometry(1, 1), mat(0x4a8a3a, { rough: 0.9 }), [
    { pos: [-2.4, 2, -2.6], scale: 0.9 },
    { pos: [-2.0, 2.4, -2.4], scale: 0.7 },
    { pos: [-2.8, 2.3, -2.9], scale: 0.65 },
  ]);
  put(root, 'Rock', new DodecahedronGeometry(0.5, 0), mat(0x8a8680), [2.2, -0.15, -1.8]);
  const flowers: Placement[] = [];
  const petals = [0xffffff, 0xffd84a, 0xff8ab0, 0xa88aff];
  for (let i = 0; i < 80; i++) {
    const r = 1.2 + rand() * 4.5;
    const a = rand() * Math.PI * 2;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    const y = crownY + Math.sqrt(Math.max(0, 1 - (x / radius) ** 2 - (z / (radius * 1.15)) ** 2)) * radius * squash;
    flowers.push({ pos: [x, y + 0.06, z], color: petals[i % 4] });
  }
  instances(root, 'Flowers', new SphereGeometry(0.06, 8, 6), mat(0xffffff, { rough: 0.6 }), flowers);

  // Head, neck and flippers.
  const skin = mat(0x6a8a5a, { rough: 0.85 });
  const neck = put(root, 'Neck', new CylinderGeometry(2.2, 3, 7, 24), skin, [0, -5, -18.5], [-72, 0, 0]);
  neck.scale.set(1, 1, 0.8);
  const head = put(root, 'Head', new SphereGeometry(3, 32, 24), skin, [0, -3.2, -23]);
  head.scale.set(1, 0.8, 1.25);
  for (const x of [-1.9, 1.9]) {
    put(root, 'Eye', new SphereGeometry(0.55, 16, 12), mat(0x111111, { rough: 0.2 }), [x, -2.4, -25.2]);
    put(root, 'EyeShine', new SphereGeometry(0.15, 8, 6), glow(0xffffff), [x * 1.05, -2.15, -25.65]);
  }
  for (const [x, z, yaw, s] of [[-14, -8, 35, 1], [14, -8, -35, 1], [-12, 10, -30, 0.7], [12, 10, 30, 0.7]]) {
    const flipper = put(root, 'Flipper', new SphereGeometry(1, 24, 12), skin, [x, crownY - 0.6, z], [0, yaw, x < 0 ? 8 : -8]);
    flipper.scale.set(8 * s, 0.7, 2.6 * s);
  }
  put(root, 'Tail', new ConeGeometry(1.4, 5, 16), skin, [0, crownY - 0.5, 17.5], [90, 0, 0]);

  // The void: stars all round, a faint nebula and a pale planet.
  stars(root, 3200, 185, 283, -1, 2);
  instances(root, 'Nebula', new SphereGeometry(1, 24, 16), glow(0xffffff, 0.06, true), [
    { pos: [-90, 40, -140], scale: [70, 30, 40], color: 0x8a4ad8 },
    { pos: [60, -30, -150], scale: [60, 26, 40], color: 0x3a8ad8 },
    { pos: [120, 60, 60], scale: [50, 30, 40], color: 0xd84a8a },
  ]).userData.iwsdkPreviewBounds = 'exclude';
  skyBody(root, 'Planet', [70, 35, -150], 12, 0xe8c89a, 0x2a2440, 1.4);
  return root;
}
