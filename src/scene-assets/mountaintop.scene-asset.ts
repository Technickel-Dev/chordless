import { BoxGeometry, ConeGeometry, CylinderGeometry, DodecahedronGeometry, Group, SphereGeometry } from '@iwsdk/core';
import { block, instances, mat, noiseTexture, type Placement, plankTexture, put, seededRandom, skyBody } from './lib/set-kit.js';

/**
 * Mountaintop: a small timber stage bolted onto a rocky summit, a sea of
 * cloud far below and a few snowy peaks poking through it.
 */
export function createMountaintopSet(): Group {
  const root = new Group();
  root.name = 'MountaintopSet';
  const rand = seededRandom(231);

  // Stage: 6 x 5 deck, its edge 2.5 m in front of the player.
  const boards = plankTexture([140, 100, 66], 10, 232);
  block(root, 'Deck', [6, 0.2, 5], mat(0xffffff, { map: boards, rough: 0.8 }), [0, -0.2, 0]);
  const beam = mat(0x5a4030, { rough: 0.9 });
  for (const [x, z] of [[-2.8, -2.3], [2.8, -2.3], [-2.8, 2.3], [2.8, 2.3]]) put(root, 'Post', new BoxGeometry(0.2, 2.4, 0.2), beam, [x, -1.4, z]);
  const flags: Placement[] = [];
  const colors = [0xd84a4a, 0xf2c84a, 0x4a8ad8, 0x4ab86a, 0xf2f2f2];
  for (let i = 0; i < 11; i++) {
    const t = i / 10;
    flags.push({ pos: [-2.9 + t * 5.8, 2.7 - Math.sin(t * Math.PI) * 0.5, -2.4], rotDeg: [0, 0, 180], color: colors[i % 5] });
  }
  for (const x of [-2.9, 2.9]) put(root, 'FlagPole', new CylinderGeometry(0.03, 0.03, 2.8, 8), beam, [x, 1.4, -2.4]);
  instances(root, 'PrayerFlags', new ConeGeometry(0.16, 0.32, 3), mat(0xffffff, { rough: 1, double: true }), flags);

  // Summit rock: a stack of boulders narrowing up under the deck.
  const granite = mat(0xffffff, { map: noiseTexture([120, 116, 112], 40, 233), rough: 1 });
  const rocks: Placement[] = [];
  for (let i = 0; i < 46; i++) {
    const depth = rand();
    const spread = 3 + depth * 40;
    const a = rand() * Math.PI * 2;
    const s = 2.5 + depth * 14 + rand() * 3;
    // Crowns stay under the deck.
    const y = -1.2 - s * 0.95 - depth * 60;
    rocks.push({ pos: [Math.sin(a) * spread * rand(), y, Math.cos(a) * spread * rand()], rotDeg: [rand() * 90, rand() * 360, 0], scale: [s, s * 0.9, s] });
  }
  instances(root, 'Summit', new DodecahedronGeometry(1, 1), granite, rocks);
  const snow = mat(0xf4f8fc, { rough: 0.8 });
  const drifts: Placement[] = [];
  for (let i = 0; i < 10; i++) {
    const a = rand() * Math.PI * 2;
    const r = 4 + rand() * 4;
    drifts.push({ pos: [Math.sin(a) * r, -2 - rand() * 2, Math.cos(a) * r], scale: [2 + rand() * 2, 0.8, 2 + rand() * 2] });
  }
  instances(root, 'SnowPatches', new SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), snow, drifts);

  // Sea of clouds: flattened puffs packed in a wide ring below.
  const puffs: Placement[] = [];
  for (let i = 0; i < 520; i++) {
    const r = 14 + Math.sqrt(rand()) * 175;
    const a = rand() * Math.PI * 2;
    const s = 8 + rand() * 14;
    puffs.push({ pos: [Math.sin(a) * r, -44 + rand() * 4, Math.cos(a) * r], scale: [s, s * 0.35, s], color: rand() < 0.5 ? 0xffffff : 0xf2f0f6 });
  }
  instances(root, 'Clouds', new SphereGeometry(1, 16, 10), mat(0xffffff, { rough: 1 }), puffs);
  put(root, 'CloudFloor', new CylinderGeometry(195, 195, 1, 64), mat(0xeeeef4, { rough: 1 }), [0, -46, 0]);

  // Neighboring peaks through the clouds.
  const peaks: Placement[] = [
    { pos: [-70, -50, -120], scale: [30, 50, 30] },
    { pos: [40, -50, -150], scale: [40, 62, 40] },
    { pos: [120, -50, -40], scale: [26, 40, 26] },
    { pos: [-130, -50, 50], scale: [34, 46, 34] },
  ];
  instances(root, 'Peaks', new ConeGeometry(1, 1, 7).translate(0, 0.5, 0), granite, peaks);
  instances(root, 'PeakSnow', new ConeGeometry(0.42, 0.42, 7).translate(0, 0.79, 0), snow, peaks);
  skyBody(root, 'Sun', [80, 70, -140], 6, 0xffffff, 0xfff4d8, 3);
  return root;
}
