import { BoxGeometry, CylinderGeometry, Group, SphereGeometry } from '@iwsdk/core';
import { block, glow, instances, mat, type Placement, put, room, seededRandom, sign, stripeTexture, tileTexture } from './lib/set-kit.js';

/**
 * Car wash: inside the wash tunnel on the conveyor, big striped brush rollers
 * either side and overhead, soap foam heaped on the floor, water dripping and
 * a stack of signal lights at the exit.
 */
export function createCarWashSet(): Group {
  const root = new Group();
  root.name = 'CarWashSet';
  const rand = seededRandom(331);
  const floor = tileTexture([110, 116, 124], [96, 102, 110], 8);
  floor.repeat.set(3, 8);
  room(root, 'Tunnel', [7, 4.6, 22], mat(0xb8c4cc, { rough: 0.3, metal: 0.5 }), mat(0xffffff, { map: floor, rough: 0.2 }), mat(0x8a96a0, { metal: 0.6 }), [0, -7]);
  for (const x of [-0.9, 0.9]) put(root, 'ConveyorRail', new BoxGeometry(0.25, 0.12, 22), mat(0x3a3e44, { metal: 0.8, rough: 0.4 }), [x, 0.06, -7]);
  const rollers: Placement[] = [];
  for (let z = -10; z < 4; z += 0.6) rollers.push({ pos: [0.9, 0.13, z] }, { pos: [-0.9, 0.13, z] });
  instances(root, 'ConveyorPins', new CylinderGeometry(0.05, 0.05, 0.3, 8).rotateZ(Math.PI / 2), mat(0xd8a23a, { metal: 0.7 }), rollers);

  // Brushes: two upright rollers ahead and one horizontal over the top.
  const bristles = stripeTexture([40, 110, 220], [220, 60, 70], 10);
  bristles.repeat.set(1, 6);
  const brush = mat(0xffffff, { map: bristles, rough: 1 });
  for (const x of [-2.2, 2.2]) {
    put(root, 'SideBrush', new CylinderGeometry(0.9, 0.9, 3.6, 24, 6), brush, [x, 2, -4.5]);
    put(root, 'SideBrushAxle', new CylinderGeometry(0.06, 0.06, 4.5, 8), mat(0x6a6e74, { metal: 0.9 }), [x, 2.25, -4.5]);
  }
  put(root, 'TopBrush', new CylinderGeometry(0.75, 0.75, 4.6, 24, 6), brush, [0, 3.6, -8.5], [0, 0, 90]);
  block(root, 'Gantry', [6.8, 0.4, 0.5], mat(0x2a6ad8, { metal: 0.4, rough: 0.4 }), [0, 4.2, -8.5]);
  // Nozzle arch with spray behind the brushes.
  const nozzles: Placement[] = [];
  for (let i = 0; i < 12; i++) nozzles.push({ pos: [-3 + (i / 11) * 6, 4.25, -12] });
  instances(root, 'Nozzles', new CylinderGeometry(0.05, 0.08, 0.15, 8), mat(0x3a3e44, { metal: 0.8 }), nozzles);

  // Foam heaps and suds.
  const foam: Placement[] = [];
  for (let i = 0; i < 70; i++) {
    const x = (rand() - 0.5) * 6.4;
    const z = -15 + rand() * 16;
    if (Math.hypot(x, z) < 1.4) continue;
    const s = 0.2 + rand() * 0.7;
    foam.push({ pos: [x, s * 0.2, z], scale: [s, s * 0.6, s] });
  }
  instances(root, 'Foam', new SphereGeometry(1, 14, 10), mat(0xffffff, { rough: 0.9 }), foam);
  const foamTop: Placement[] = [];
  for (let i = 0; i < 40; i++) foamTop.push({ pos: [(rand() - 0.5) * 4.2, 3.1 + rand() * 0.3, -8.5 + (rand() - 0.5) * 1.2], scale: 0.15 + rand() * 0.3 });
  instances(root, 'BrushSuds', new SphereGeometry(1, 10, 8), mat(0xf4fbff, { rough: 0.9 }), foamTop);
  // Drips: thin bright streaks falling from the ceiling.
  const drips: Placement[] = [];
  for (let i = 0; i < 400; i++) drips.push({ pos: [(rand() - 0.5) * 6.6, rand() * 4.4, -17 + rand() * 18], scale: [1, 0.5 + rand(), 1] });
  instances(root, 'Drips', new BoxGeometry(0.008, 0.25, 0.008), glow(0xc8e8ff, 0.5, true), drips).userData.iwsdkPreviewBounds = 'exclude';

  // Exit signal lights and sign.
  const signal = new Group();
  signal.name = 'SignalLights';
  signal.position.set(2.6, 2.2, -17.8);
  root.add(signal);
  block(signal, 'Housing', [0.5, 1.5, 0.3], mat(0x1a1a1c), [0, 0, 0]);
  put(signal, 'Red', new CylinderGeometry(0.15, 0.15, 0.05, 20), glow(0xff3030), [0, 1.2, 0.16], [90, 0, 0]);
  put(signal, 'Amber', new CylinderGeometry(0.15, 0.15, 0.05, 20), mat(0x5a4a10), [0, 0.75, 0.16], [90, 0, 0]);
  put(signal, 'Green', new CylinderGeometry(0.15, 0.15, 0.05, 20), mat(0x104a20), [0, 0.3, 0.16], [90, 0, 0]);
  sign(root, 'StopSign', 'STOP\nPUT IN NEUTRAL', 0.5, [255, 255, 255], [200, 30, 30, 255], [-1.2, 3.2, -17.9]);
  put(root, 'ExitGlow', new BoxGeometry(4, 3.4, 0.05), glow(0xfff4dc), [0, 1.7, -17.97]);
  return root;
}
