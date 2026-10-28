import { BoxGeometry, CapsuleGeometry, ConeGeometry, CylinderGeometry, Group, SphereGeometry, TorusGeometry } from '@iwsdk/core';
import { blobTexture, block, glow, mat, plankTexture, post, put, room } from './lib/set-kit.js';

/**
 * Grandma's living room: floral wallpaper, a floral sofa facing the player,
 * a fringed lamp beside it, a cuckoo clock above it and a round rug to stand on.
 */
export function createLivingRoomSet(): Group {
  const root = new Group();
  root.name = 'LivingRoomSet';
  const paper = blobTexture([226, 214, 186], [[196, 120, 132], [150, 168, 120], [214, 168, 150]], 26, 7, 21);
  paper.repeat.set(5, 2);
  const floorMap = plankTexture([150, 104, 66], 8, 22);
  floorMap.repeat.set(3, 3);
  room(
    root,
    'Room',
    [7, 2.8, 7.5],
    mat(0xffffff, { map: paper }),
    mat(0xffffff, { map: floorMap, rough: 0.6 }),
    mat(0xf1ece0),
    [0, -1.4],
  );
  // Picture rail and skirting board on every wall.
  const trim = mat(0x6e4a32);
  for (const [n, z] of [['Back', -5.13], ['Front', 2.33]] as const) {
    put(root, `Skirting${n}`, new BoxGeometry(7, 0.14, 0.03), trim, [0, 0.07, z]);
    put(root, `Rail${n}`, new BoxGeometry(7, 0.05, 0.03), trim, [0, 2.2, z]);
  }
  for (const [n, x] of [['Left', -3.48], ['Right', 3.48]] as const) {
    put(root, `Skirting${n}`, new BoxGeometry(0.03, 0.14, 7.5), trim, [x, 0.07, -1.4]);
    put(root, `Rail${n}`, new BoxGeometry(0.03, 0.05, 7.5), trim, [x, 2.2, -1.4]);
  }

  const rugMap = blobTexture([132, 40, 44], [[200, 150, 90], [70, 30, 40]], 40, 9, 23);
  const rug = new Group();
  rug.name = 'Rug';
  rug.scale.set(1, 1, 0.8);
  root.add(rug);
  put(rug, 'Field', new CylinderGeometry(1.5, 1.5, 0.012, 48), mat(0xffffff, { map: rugMap, rough: 1 }), [0, 0.006, 0]);
  put(rug, 'Border', new TorusGeometry(1.48, 0.03, 6, 64), mat(0xc89a5a), [0, 0.012, 0], [90, 0, 0]);

  // Sofa against the back wall, facing +Z (toward the player).
  const floral = blobTexture([214, 196, 160], [[178, 72, 92], [96, 128, 84], [228, 150, 120]], 34, 8, 24);
  const cloth = mat(0xffffff, { map: floral, rough: 0.95 });
  const sofa = new Group();
  sofa.name = 'Sofa';
  sofa.position.set(0, 0, -4.4);
  root.add(sofa);
  block(sofa, 'Base', [2.3, 0.42, 0.9], cloth, [0, 0.1, 0]);
  for (const x of [-0.56, 0.56]) put(sofa, 'SeatCushion', new BoxGeometry(1.1, 0.16, 0.8), cloth, [x, 0.6, 0.06]);
  block(sofa, 'Back', [2.3, 0.62, 0.24], cloth, [0, 0.45, -0.36]);
  for (const x of [-1.24, 1.24]) {
    const arm = new CapsuleGeometry(0.15, 0.6, 4, 12);
    arm.rotateX(Math.PI / 2);
    put(sofa, 'Arm', arm, cloth, [x, 0.62, 0.02]);
    block(sofa, 'ArmBody', [0.3, 0.5, 0.9], cloth, [x, 0.1, 0]);
  }
  for (const [x, z] of [[-1.05, 0.35], [1.05, 0.35], [-1.05, -0.35], [1.05, -0.35]]) {
    post(sofa, 'Leg', 0.04, 0.1, trim, [x, 0, z], 0.03, 8);
  }
  put(sofa, 'Doily', new CylinderGeometry(0.2, 0.2, 0.005, 24), mat(0xfaf7ef), [0, 1.08, -0.3]);

  // Fringed lamp on a side table to the left of the sofa.
  const lamp = new Group();
  lamp.name = 'Lamp';
  lamp.position.set(-1.75, 0, -4.5);
  root.add(lamp);
  post(lamp, 'TableTop', 0.32, 0.03, trim, [0, 0.58, 0]);
  post(lamp, 'TableLeg', 0.04, 0.58, trim, [0, 0, 0], 0.04, 8);
  put(lamp, 'Base', new SphereGeometry(0.12, 16, 12), mat(0x4f7a6a, { rough: 0.3 }), [0, 0.72, 0]);
  post(lamp, 'Stem', 0.015, 0.4, mat(0xc8a050, { metal: 0.8, rough: 0.3 }), [0, 0.8, 0]);
  const shade = new CylinderGeometry(0.16, 0.3, 0.32, 24, 1, true);
  put(lamp, 'Shade', shade, mat(0xf3d8a0, { emissive: 0xffc27a, glow: 0.9, double: true }), [0, 1.26, 0]);
  put(lamp, 'Fringe', new CylinderGeometry(0.305, 0.31, 0.06, 24, 1, true), mat(0xb0743a, { double: true }), [0, 1.07, 0]);
  put(lamp, 'Bulb', new SphereGeometry(0.05, 12, 8), glow(0xfff0c8), [0, 1.2, 0]);

  // Cuckoo clock above the sofa.
  const clock = new Group();
  clock.name = 'CuckooClock';
  clock.position.set(0, 1.75, -5.1);
  root.add(clock);
  const darkWood = mat(0x4a2c1a);
  const brass = mat(0xb08a40, { metal: 0.8, rough: 0.3 });
  block(clock, 'Case', [0.34, 0.4, 0.14], darkWood, [0, 0, 0.07]);
  for (const s of [1, -1]) {
    const roof = put(clock, 'Roof', new BoxGeometry(0.28, 0.03, 0.2), darkWood, [s * 0.1, 0.46, 0.09]);
    roof.rotation.z = -s * 0.7;
  }
  put(clock, 'Face', new CylinderGeometry(0.11, 0.11, 0.01, 32), mat(0xf3ead2), [0, 0.18, 0.145], [90, 0, 0]);
  put(clock, 'HourHand', new BoxGeometry(0.012, 0.07, 0.004), darkWood, [0.012, 0.21, 0.153], [0, 0, -30]);
  put(clock, 'MinuteHand', new BoxGeometry(0.008, 0.095, 0.004), darkWood, [-0.04, 0.17, 0.155], [0, 0, -100]);
  block(clock, 'BirdDoor', [0.08, 0.08, 0.01], mat(0x2a180e), [0, 0.3, 0.14]);
  for (const x of [-0.06, 0.06]) {
    post(clock, 'Chain', 0.004, 0.55, brass, [x, -0.55, 0.06], 0.004, 4);
    put(clock, 'Weight', new ConeGeometry(0.025, 0.14, 12), brass, [x, -0.6, 0.06], [180, 0, 0]);
  }
  put(clock, 'Pendulum', new CylinderGeometry(0.035, 0.035, 0.01, 16), brass, [0, -0.35, 0.08], [90, 0, 0]);
  return root;
}
