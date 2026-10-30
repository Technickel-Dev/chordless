import { BoxGeometry, CylinderGeometry, Group, SphereGeometry, TorusGeometry } from '@iwsdk/core';
import { block, brickTexture, glow, instances, mat, type Placement, plankTexture, post, put, room, seededRandom, sign, tileTexture } from './lib/set-kit.js';

/**
 * School gym dance: a varnished court with painted lines, a basketball hoop
 * at the far end, folded bleachers along one wall and a disco ball throwing
 * colored spots across the floor.
 */
export function createSchoolGymSet(): Group {
  const root = new Group();
  root.name = 'SchoolGymSet';
  const rand = seededRandom(351);
  const blocks = brickTexture([214, 208, 190], [180, 174, 160], 10, 352);
  blocks.repeat.set(6, 2);
  const floor = plankTexture([206, 160, 100], 24, 353);
  floor.repeat.set(1, 4);
  room(root, 'Gym', [20, 8, 30], mat(0xffffff, { map: blocks, rough: 0.9 }), mat(0xffffff, { map: floor, rough: 0.25 }), mat(0x3a3a40), [0, -9]);

  // Court lines.
  const paint = mat(0xf4f4f0, { rough: 0.4 });
  put(root, 'HalfwayLine', new BoxGeometry(17, 0.004, 0.06), paint, [0, 0.003, -9]);
  for (const x of [-8.5, 8.5]) put(root, 'Sideline', new BoxGeometry(0.06, 0.004, 26), paint, [x, 0.003, -9]);
  put(root, 'CenterCircle', new TorusGeometry(1.8, 0.03, 4, 64), paint, [0, 0.003, -9], [90, 0, 0]);
  put(root, 'Key', new BoxGeometry(4.9, 0.003, 5.8), mat(0x2a5ab8, { rough: 0.3 }), [0, 0.002, -19.1]);
  put(root, 'KeyArc', new TorusGeometry(1.8, 0.03, 4, 48, Math.PI), paint, [0, 0.004, -16.2], [90, 0, 0]);

  // Hoop at the far end.
  const hoop = new Group();
  hoop.name = 'Hoop';
  hoop.position.set(0, 0, -23.4);
  root.add(hoop);
  put(hoop, 'Backboard', new BoxGeometry(1.8, 1.05, 0.05), mat(0xf6f6f6, { rough: 0.2 }), [0, 3.4, 0.6]);
  put(hoop, 'BoxMark', new BoxGeometry(0.6, 0.45, 0.06), mat(0xd83a2a), [0, 3.25, 0.6]);
  put(hoop, 'Rim', new TorusGeometry(0.23, 0.02, 8, 32), mat(0xff6a1a, { metal: 0.6 }), [0, 3.05, 0.9], [90, 0, 0]);
  put(hoop, 'Net', new CylinderGeometry(0.23, 0.15, 0.45, 12, 3, true), mat(0xffffff, { double: true }), [0, 2.82, 0.9]);
  block(hoop, 'Arm', [0.1, 0.1, 0.6], mat(0x3a3a40, { metal: 0.6 }), [0, 4.2, 0.3]);

  // Folded bleachers on the left wall: stepped wooden tiers.
  const bleacher = new Group();
  bleacher.name = 'Bleachers';
  bleacher.position.set(-9.3, 0, -9);
  root.add(bleacher);
  for (let i = 0; i < 8; i++) block(bleacher, 'Tier', [0.4, 0.4 + i * 0.36, 14], mat(i % 2 ? 0xb88a52 : 0xc89a60, { rough: 0.7 }), [-i * 0.08, 0, 0]);
  sign(root, 'Banner', 'SPRING FLING', 0.9, [255, 255, 255], [40, 60, 160, 255], [0, 5.2, -23.9]);

  // Disco ball with colored spots scattered on the floor and walls.
  post(root, 'BallChain', 0.01, 2, mat(0x888888, { metal: 0.9 }), [0, 6, -7]);
  const mirror = tileTexture([220, 224, 232], [150, 156, 170], 24, [60, 60, 70]);
  put(root, 'DiscoBall', new SphereGeometry(0.5, 32, 20), mat(0xffffff, { map: mirror, metal: 0.95, rough: 0.15 }), [0, 5.5, -7]);
  const spots: Placement[] = [];
  const hues = [0xff3a8a, 0x3ad8ff, 0xffd23a, 0x8a5aff, 0x5aff8a];
  for (let i = 0; i < 140; i++) {
    const r = 1.5 + rand() * 11;
    const a = rand() * Math.PI * 2;
    spots.push({ pos: [Math.sin(a) * r, 0.006, -7 + Math.cos(a) * r], color: hues[i % 5], scale: 0.6 + rand() * 0.8 });
  }
  instances(root, 'LightSpots', new CylinderGeometry(0.09, 0.09, 0.002, 12), glow(0xffffff, 0.6, true), spots).userData.iwsdkPreviewBounds = 'exclude';
  // Streamers and balloons by the bleachers.
  const balloons: Placement[] = [];
  for (let i = 0; i < 14; i++) balloons.push({ pos: [-8 + rand() * 1.4, 0.3 + rand() * 0.2, -16 + i * 1.1], scale: [1, 1.2, 1], color: hues[i % 5] });
  instances(root, 'Balloons', new SphereGeometry(0.3, 16, 12), mat(0xffffff, { rough: 0.3 }), balloons);
  // High windows and ceiling lights.
  const lamps: Placement[] = [];
  for (const x of [-5, 0, 5]) for (const z of [-18, -9, 0]) lamps.push({ pos: [x, 7.8, z] });
  instances(root, 'HighBays', new CylinderGeometry(0.35, 0.5, 0.3, 16), mat(0xf8f4e8, { emissive: 0xfff4d8, glow: 1.4 }), lamps);
  return root;
}
