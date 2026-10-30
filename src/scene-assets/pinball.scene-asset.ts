import { BoxGeometry, CapsuleGeometry, CylinderGeometry, Group, SphereGeometry, TorusGeometry } from '@iwsdk/core';
import { blobTexture, block, glow, instances, mat, type Placement, put, sign } from './lib/set-kit.js';

/**
 * Inside a pinball machine: the player stands on the printed playfield
 * between the flippers, pop bumpers and lit lane arrows ahead, a chrome ball
 * the size of a boulder, chrome rails, a glass sky and the glowing backbox.
 */
export function createPinballSet(): Group {
  const root = new Group();
  root.name = 'PinballSet';
  const art = blobTexture([20, 24, 70], [[60, 30, 120], [20, 90, 140], [140, 30, 90]], 30, 30, 401, 256);
  art.repeat.set(2, 4);
  block(root, 'Playfield', [16, 0.4, 36], mat(0xffffff, { map: art, rough: 0.2, metal: 0.1 }), [0, -0.4, -12]);
  const chrome = mat(0xe8ecf0, { metal: 1, rough: 0.12 });
  for (const x of [-8.2, 8.2]) block(root, 'SideWall', [0.4, 3, 36], mat(0x1a1a2a, { rough: 0.5 }), [x, -0.4, -12]);
  for (const x of [-7.6, 7.6]) put(root, 'Rail', new CylinderGeometry(0.12, 0.12, 34, 12), chrome, [x, 0.8, -12], [90, 0, 0]);
  block(root, 'Apron', [16, 1, 2], mat(0x2a2a4a, { rough: 0.4 }), [0, -0.4, 5]);

  // Flippers just ahead of the player, angled up toward the bumpers.
  const flipper = new CapsuleGeometry(0.35, 2.6, 6, 16);
  flipper.rotateZ(Math.PI / 2);
  instances(root, 'Flippers', flipper, mat(0xf4f4f0, { rough: 0.3 }), [
    { pos: [-2.2, 0.35, -2.4], rotDeg: [0, -22, 0] },
    { pos: [2.2, 0.35, -2.4], rotDeg: [0, 22, 0] },
  ]);
  instances(root, 'FlipperRubber', new TorusGeometry(0.36, 0.06, 8, 24).rotateX(Math.PI / 2), mat(0xd82a2a), [
    { pos: [-3.4, 0.35, -1.9] }, { pos: [3.4, 0.35, -1.9] },
  ]);
  // Slingshots above the flippers.
  for (const s of [-1, 1]) {
    put(root, 'Slingshot', new CylinderGeometry(1.1, 1.1, 0.8, 3), mat(0xffffff, { rough: 0.3 }), [s * 4.6, 0.4, -4.8], [0, s * 30, 0]);
    put(root, 'SlingLight', new BoxGeometry(0.1, 0.5, 1.6), glow(0xffd23a), [s * 4.0, 0.4, -4.8], [0, s * -25, 0]);
  }

  // Pop bumpers: three caps with glowing rings.
  const bumpers: Placement[] = [{ pos: [-2.4, 0, -11] }, { pos: [2.4, 0, -11] }, { pos: [0, 0, -14.2] }];
  instances(root, 'BumperBases', new CylinderGeometry(1.1, 1.1, 0.5, 32).translate(0, 0.25, 0), mat(0x111118, { rough: 0.4 }), bumpers);
  instances(root, 'BumperSkirts', new CylinderGeometry(1, 1.2, 0.5, 32).translate(0, 0.75, 0), glow(0xff3a8a), bumpers);
  instances(root, 'BumperCaps', new CylinderGeometry(0.9, 1, 0.4, 32).translate(0, 1.2, 0), mat(0xfff4d0, { emissive: 0xffd890, glow: 1 }), bumpers);
  // Lit lane arrows pointing up the field.
  const arrows: Placement[] = [];
  const hues = [0x3ad8ff, 0xffd23a, 0xff3a8a, 0x5aff8a];
  for (let i = 0; i < 4; i++) arrows.push({ pos: [-4.5 + i * 3, 0.01, -7.5], rotDeg: [0, 45, 0], color: hues[i] });
  instances(root, 'LaneArrows', new BoxGeometry(0.7, 0.02, 0.7), glow(0xffffff), arrows);
  const lanes: Placement[] = [];
  for (let i = 0; i < 5; i++) lanes.push({ pos: [-4.8 + i * 2.4, 0, -19.5] });
  instances(root, 'LaneGuides', new BoxGeometry(0.2, 0.8, 3).translate(0, 0.4, 0), chrome, lanes);
  const rollovers: Placement[] = [];
  for (let i = 0; i < 4; i++) rollovers.push({ pos: [-3.6 + i * 2.4, 0.01, -19.5], color: hues[i] });
  instances(root, 'Rollovers', new CylinderGeometry(0.3, 0.3, 0.02, 20), glow(0xffffff), rollovers);
  // Ball, drop targets and ramp.
  put(root, 'Ball', new SphereGeometry(1, 48, 32), chrome, [3.6, 1, -6]);
  const targets: Placement[] = [];
  for (let i = 0; i < 4; i++) targets.push({ pos: [-6.6, 0, -9.5 - i * 1.2], color: hues[(i + 2) % 4] });
  instances(root, 'DropTargets', new BoxGeometry(0.2, 1, 1).translate(0, 0.5, 0), mat(0xffffff, { rough: 0.3 }), targets);
  const rampMat = mat(0x3a8aff, { rough: 0.1 });
  rampMat.transparent = true;
  rampMat.opacity = 0.55;
  put(root, 'Ramp', new BoxGeometry(2, 0.1, 10), rampMat, [5.6, 1.6, -18], [-15, 0, 0]);

  // Glass overhead and the backbox at the top of the field.
  const glass = mat(0xc8e0ff, { rough: 0.02, metal: 0.1 });
  glass.transparent = true;
  glass.opacity = 0.12;
  glass.depthWrite = false;
  put(root, 'Glass', new BoxGeometry(16.4, 0.08, 36), glass, [0, 7, -12]);
  block(root, 'Backbox', [16.4, 14, 1.4], mat(0x111118, { rough: 0.4 }), [0, -0.4, -30.6]);
  put(root, 'Backglass', new BoxGeometry(14.4, 9, 0.05), glow(0x3a1a6a), [0, 7.4, -29.88]);
  sign(root, 'Title', 'SPACE GUITAR', 1.6, [255, 220, 60], [58, 26, 106, 255], [0, 9, -29.84], [0, 0, 0], true);
  sign(root, 'Tilt', 'TILT', 0.9, [255, 60, 60], [20, 10, 30, 255], [0, 5, -29.84], [0, 0, 0], true);
  return root;
}
