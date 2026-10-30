import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, SphereGeometry, TorusGeometry } from '@iwsdk/core';
import { blobTexture, block, glow, mat, plankTexture, post, put, room } from './lib/set-kit.js';

/**
 * Upside-down room: the player stands on the plaster ceiling of a living
 * room that has been flipped over. The sofa, table, rug and a lamp hang from
 * the floor overhead, the chandelier sprouts up beside the player and a
 * picture and the window are upside down on the walls.
 */
export function createUpsideDownRoomSet(): Group {
  const root = new Group();
  root.name = 'UpsideDownRoomSet';
  const height = 3;

  // Built the right way up, then flipped about the room's mid-height so its
  // ceiling lands at y = 0 under the player.
  const flipped = new Group();
  flipped.name = 'FlippedRoom';
  flipped.position.set(0, height, 0);
  flipped.rotation.z = Math.PI;
  root.add(flipped);
  const paper = blobTexture([216, 226, 214], [[160, 190, 170], [200, 170, 150]], 22, 6, 581);
  paper.repeat.set(5, 2);
  const floorMap = plankTexture([140, 96, 60], 8, 582);
  floorMap.repeat.set(3, 3);
  room(flipped, 'Room', [7, height, 8], mat(0xffffff, { map: paper }), mat(0xffffff, { map: floorMap, rough: 0.6 }), mat(0xf4f2ec, { rough: 0.9 }), [0, -1.5]);

  // Furniture on the (now overhead) floor.
  const cloth = mat(0x3a6a8a, { rough: 0.9 });
  const sofa = new Group();
  sofa.name = 'Sofa';
  sofa.position.set(0, 0, -4.4);
  flipped.add(sofa);
  block(sofa, 'Base', [2.2, 0.45, 0.9], cloth, [0, 0.08, 0]);
  block(sofa, 'Back', [2.2, 0.55, 0.22], cloth, [0, 0.5, -0.35]);
  for (const x of [-1.15, 1.15]) block(sofa, 'Arm', [0.26, 0.65, 0.9], cloth, [x, 0.08, 0]);
  put(flipped, 'Rug', new CylinderGeometry(1.6, 1.6, 0.012, 48), mat(0xa83a3a, { rough: 1 }), [0, 0.006, -2.2]);
  const wood = mat(0x6a4a30, { rough: 0.5 });
  block(flipped, 'TableTop', [1.2, 0.05, 0.7], wood, [0, 0.42, -2.2]);
  for (const [x, z] of [[-0.5, -1.95], [0.5, -1.95], [-0.5, -2.45], [0.5, -2.45]]) post(flipped, 'TableLeg', 0.03, 0.42, wood, [x, 0, z], 0.03, 8);
  put(flipped, 'Vase', new CylinderGeometry(0.06, 0.09, 0.25, 16), mat(0x3a8aa8, { rough: 0.2 }), [0.2, 0.595, -2.2]);
  post(flipped, 'LampStem', 0.02, 1.4, mat(0xc8a050, { metal: 0.8 }), [-2.6, 0, -4.6]);
  put(flipped, 'LampShade', new CylinderGeometry(0.18, 0.3, 0.32, 20, 1, true), mat(0xf2e0b0, { emissive: 0xffc880, glow: 0.8, double: true }), [-2.6, 1.5, -4.6]);
  block(flipped, 'Bookcase', [1.2, 1.9, 0.35], wood, [2.9, 0, -5.2]);

  // Ceiling fixtures (now underfoot): a chandelier and a smoke alarm.
  const brass = mat(0xc8a050, { metal: 0.85, rough: 0.3 });
  post(flipped, 'ChandelierRod', 0.02, 0.5, brass, [0, height - 0.5, -1.5]);
  put(flipped, 'ChandelierRing', new TorusGeometry(0.4, 0.03, 8, 32), brass, [0, height - 0.6, -1.5], [90, 0, 0]);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    put(flipped, 'ChandelierBulb', new SphereGeometry(0.06, 12, 8), glow(0xfff2c8), [Math.sin(a) * 0.4, height - 0.52, -1.5 + Math.cos(a) * 0.4]);
  }
  put(flipped, 'SmokeAlarm', new CylinderGeometry(0.08, 0.08, 0.03, 16), mat(0xf6f6f2), [2, height - 0.015, -3]);

  // Wall pieces that read upside down: a framed picture and a window.
  put(flipped, 'PictureFrame', new BoxGeometry(1.1, 0.8, 0.04), wood, [0, 1.7, -5.48]);
  put(flipped, 'Picture', new BoxGeometry(0.95, 0.65, 0.02), mat(0x5a8ac8, { emissive: 0x1a2a4a, glow: 0.3 }), [0, 1.7, -5.45]);
  put(flipped, 'PictureSun', new SphereGeometry(0.1, 12, 8), mat(0xffd23a), [0.25, 1.85, -5.43]);
  put(flipped, 'PictureHill', new ConeGeometry(0.3, 0.25, 12), mat(0x4a8a3a), [-0.15, 1.5, -5.43]);
  put(flipped, 'Window', new BoxGeometry(0.02, 1.2, 1.6), glow(0xbfe0ff), [3.48, 1.6, -2]);
  put(flipped, 'WindowBar', new BoxGeometry(0.03, 0.05, 1.6), mat(0xf4f2ec), [3.47, 1.6, -2]);
  return root;
}
