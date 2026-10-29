import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, SphereGeometry } from '@iwsdk/core';
import { block, brickTexture, glow, instances, mat, type Placement, plankTexture, post, put, room, seededRandom, sign } from './lib/set-kit.js';

/**
 * 1950s jazz club: bare brick walls, a low stage riser, little round tables
 * with candles out in the dark and one smoky spotlight on the player.
 */
export function createJazzClubSet(): Group {
  const root = new Group();
  root.name = 'JazzClubSet';
  const rand = seededRandom(221);

  const brick = brickTexture([120, 56, 40], [60, 52, 46], 16, 222);
  brick.repeat.set(4, 1.5);
  const floor = plankTexture([70, 46, 30], 10, 223);
  floor.repeat.set(4, 4);
  room(root, 'Room', [11, 3.6, 11], mat(0xffffff, { map: brick, rough: 0.95 }), mat(0xffffff, { map: floor, rough: 0.5 }), mat(0x141010), [0, -3.5]);

  // Stage riser under the player, backed by a velvet curtain.
  const riser = plankTexture([110, 76, 48], 6, 224);
  block(root, 'Riser', [5, 0.3, 3], mat(0xffffff, { map: riser, rough: 0.6 }), [0, -0.3, 0.4]);
  put(root, 'RiserEdge', new BoxGeometry(5, 0.04, 0.04), mat(0xc8a050, { metal: 0.8, rough: 0.3 }), [0, -0.01, -1.1]);
  put(root, 'Backdrop', new BoxGeometry(6, 3.6, 0.05), mat(0x3a0a14, { rough: 1 }), [0, 1.8, 1.95]);
  const mic = new Group();
  mic.name = 'Microphone';
  mic.position.set(0, 0, -0.75);
  root.add(mic);
  post(mic, 'Base', 0.16, 0.03, mat(0x222222, { metal: 0.8 }), [0, 0, 0]);
  post(mic, 'Stand', 0.01, 1.35, mat(0x999da2, { metal: 0.9, rough: 0.2 }), [0, 0, 0]);
  put(mic, 'Capsule', new SphereGeometry(0.045, 16, 12), mat(0xc8ccd0, { metal: 0.9, rough: 0.35 }), [0, 1.4, 0]);

  // Tables: a loose crescent facing the stage.
  const tables: Placement[] = [];
  const spots: [number, number][] = [[-3.4, -3.4], [-1.2, -4.2], [1.3, -3.9], [3.6, -3.2], [-2.4, -6.3], [0.2, -6.8], [2.8, -6.2], [-4.2, -7.8], [4.4, -7.6]];
  for (const [x, z] of spots) tables.push({ pos: [x, 0, z] });
  const top = new CylinderGeometry(0.38, 0.38, 0.03, 24);
  top.translate(0, 0.74, 0);
  instances(root, 'TableTops', top, mat(0x1a1210, { rough: 0.3 }), tables);
  const stem = new CylinderGeometry(0.03, 0.03, 0.72, 8);
  stem.translate(0, 0.37, 0);
  instances(root, 'TableStems', stem, mat(0x888c90, { metal: 0.9, rough: 0.3 }), tables);
  const foot = new CylinderGeometry(0.2, 0.22, 0.03, 16);
  instances(root, 'TableFeet', foot, mat(0x888c90, { metal: 0.9, rough: 0.3 }), tables);
  const jar = new CylinderGeometry(0.04, 0.035, 0.08, 12);
  jar.translate(0, 0.79, 0);
  instances(root, 'CandleJars', jar, mat(0xc84a2a, { emissive: 0xff7a2a, glow: 1.6 }), tables);
  const flame = new ConeGeometry(0.012, 0.035, 8);
  flame.translate(0, 0.85, 0);
  instances(root, 'Flames', flame, glow(0xffd890), tables);
  const chairs: Placement[] = [];
  for (const [x, z] of spots) {
    for (const off of [-1, 1]) {
      const a = Math.atan2(-x, -z) + off * 1.1 + (rand() - 0.5) * 0.3;
      chairs.push({ pos: [x + Math.sin(a) * 0.6, 0, z + Math.cos(a) * 0.6], rotDeg: [0, (a * 180) / Math.PI + 180, 0] });
    }
  }
  const seat = new CylinderGeometry(0.2, 0.2, 0.06, 16);
  seat.translate(0, 0.46, 0);
  instances(root, 'ChairSeats', seat, mat(0x5a1a20, { rough: 0.8 }), chairs);
  const back = new BoxGeometry(0.36, 0.34, 0.04);
  back.translate(0, 0.66, 0.19);
  instances(root, 'ChairBacks', back, mat(0x3a2418, { rough: 0.6 }), chairs);
  const legs = new CylinderGeometry(0.02, 0.02, 0.44, 6);
  legs.translate(0, 0.22, 0);
  instances(root, 'ChairLegs', legs, mat(0x3a2418), chairs);

  // The spotlight can on the back wall; the scene's SpotLight does the lighting.
  put(root, 'SpotCan', new CylinderGeometry(0.16, 0.2, 0.45, 16), mat(0x1a1a1a, { metal: 0.6 }), [0, 3.3, -8.6], [-60, 0, 0]);
  // Wall sconces, two a side.
  for (const x of [-5.45, 5.45]) {
    for (const z of [-2.5, -6.5]) {
      put(root, 'Sconce', new CylinderGeometry(0.12, 0.06, 0.18, 12, 1, true), mat(0xffc880, { emissive: 0xffa850, glow: 1.6, double: true }), [x, 2.2, z]);
    }
  }
  put(root, 'Pool', new CylinderGeometry(1.1, 1.1, 0.005, 48), glow(0xffe6b8, 0.12, true), [0, 0.01, 0]);

  sign(root, 'Neon', 'BLUE NOTE', 0.34, [80, 160, 255], [0, 0, 0, 0], [-5.48, 2.3, -4], [0, 90, 0], true);
  block(root, 'Bar', [0.7, 1.05, 4], mat(0x2a1a12, { rough: 0.35 }), [5.1, 0, -5]);
  const bottles: Placement[] = [];
  for (let i = 0; i < 12; i++) bottles.push({ pos: [5.35, 1.05, -6.6 + i * 0.28], color: [0x3a6a2a, 0x8a4a1a, 0xc8c8b0][i % 3] });
  instances(root, 'Bottles', new CylinderGeometry(0.04, 0.045, 0.3, 10).translate(0, 0.15, 0), mat(0xffffff, { rough: 0.1 }), bottles);
  // The player stands on the riser at y = 0, so the club floor sits 0.3 m lower.
  const onRiser = new Set(['Riser', 'RiserEdge', 'Microphone', 'Pool']);
  for (const child of root.children) if (!onRiser.has(child.name)) child.position.y -= 0.3;
  return root;
}
