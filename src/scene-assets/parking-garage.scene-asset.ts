import { BoxGeometry, CylinderGeometry, Group, SphereGeometry } from '@iwsdk/core';
import { block, glow, instances, mat, noiseTexture, type Placement, put, room, sign } from './lib/set-kit.js';

/**
 * Parking garage: a low concrete deck with a grid of pillars, painted bays,
 * one lonely parked car and a run of tube lights, one of them dead.
 */
export function createParkingGarageSet(): Group {
  const root = new Group();
  root.name = 'ParkingGarageSet';
  const concrete = noiseTexture([142, 140, 136], 26, 361);
  concrete.repeat.set(12, 12);
  const deck = mat(0xffffff, { map: concrete, rough: 0.9 });
  room(root, 'Level', [40, 2.9, 40], mat(0xffffff, { map: concrete, rough: 0.9 }), deck, mat(0x8a8884, { rough: 1 }), [0, -10]);

  // Pillars every 8 m, with yellow-striped bases.
  const pillars: Placement[] = [];
  for (const x of [-12, -4, 4, 12]) for (let z = -26; z <= 6; z += 8) pillars.push({ pos: [x, 0, z] });
  const pillar = new BoxGeometry(0.6, 2.9, 0.6);
  pillar.translate(0, 1.45, 0);
  instances(root, 'Pillars', pillar, mat(0xffffff, { map: concrete, rough: 0.9 }), pillars);
  const guard = new BoxGeometry(0.64, 0.5, 0.64);
  guard.translate(0, 0.25, 0);
  instances(root, 'PillarGuards', guard, mat(0xe8c020, { rough: 0.6 }), pillars);

  // Bay lines on both sides of the driving lane.
  const lines: Placement[] = [];
  for (const side of [-1, 1]) for (let z = -28; z <= 8; z += 2.6) lines.push({ pos: [side * 5.5, 0.003, z] });
  instances(root, 'BayLines', new BoxGeometry(5, 0.004, 0.1), mat(0xf4f4f0), lines);
  const arrows: Placement[] = [{ pos: [0, 0.003, -6], rotDeg: [0, 0, 0] }, { pos: [0, 0.003, -16] }];
  instances(root, 'LaneArrows', new BoxGeometry(0.4, 0.004, 2.2), mat(0xf4f4f0), arrows);

  // The car: a simple sedan in a bay ahead-right.
  const car = new Group();
  car.name = 'ParkedCar';
  car.position.set(5.5, 0, -6.6);
  car.rotation.y = Math.PI / 2;
  root.add(car);
  const paint = mat(0x2a7ad8, { metal: 0.6, rough: 0.3 });
  block(car, 'Body', [1.8, 0.7, 4.4], paint, [0, 0.3, 0]);
  block(car, 'Cabin', [1.6, 0.55, 2.3], paint, [0, 1, -0.2]);
  block(car, 'Glass', [1.62, 0.42, 2.0], mat(0x1a2430, { rough: 0.05, metal: 0.4 }), [0, 1.05, -0.2]);
  const wheel = new CylinderGeometry(0.34, 0.34, 0.24, 20);
  wheel.rotateZ(Math.PI / 2);
  instances(car, 'Wheels', wheel, mat(0x1a1a1c, { rough: 0.8 }), [
    { pos: [-0.85, 0.34, 1.4] }, { pos: [0.85, 0.34, 1.4] }, { pos: [-0.85, 0.34, -1.4] }, { pos: [0.85, 0.34, -1.4] },
  ]);
  instances(car, 'Headlights', new BoxGeometry(0.35, 0.12, 0.02), mat(0xf8f8e8, { emissive: 0xffffff, glow: 0.4 }), [
    { pos: [-0.55, 0.8, 2.21] }, { pos: [0.55, 0.8, 2.21] },
  ]);
  instances(car, 'Taillights', new BoxGeometry(0.35, 0.1, 0.02), glow(0xd81a1a), [{ pos: [-0.55, 0.85, -2.21] }, { pos: [0.55, 0.85, -2.21] }]);

  // Tube lights down the lane; one is dead.
  const tubes: Placement[] = [];
  const dead: Placement[] = [];
  for (let z = -26; z <= 6; z += 4) for (const x of [-3, 3]) (z === -10 && x === 3 ? dead : tubes).push({ pos: [x, 2.85, z] });
  instances(root, 'TubeLights', new BoxGeometry(0.12, 0.06, 1.4), glow(0xf0fff4), tubes);
  instances(root, 'DeadTube', new BoxGeometry(0.12, 0.06, 1.4), mat(0x6a6e70), dead);
  // Pipes along the ceiling and the level sign.
  for (const x of [-8, -7.6]) put(root, 'Pipe', new CylinderGeometry(0.08, 0.08, 40, 10), mat(0x9a3a2a, { metal: 0.4 }), [x, 2.6, -10], [90, 0, 0]);
  sign(root, 'LevelSign', 'LEVEL P2', 0.5, [20, 20, 20], [240, 200, 40, 255], [4, 2.1, -1.69]);
  block(root, 'Exit', [2.6, 2.2, 0.1], glow(0x101418), [0, 0, -29.9]);
  sign(root, 'ExitSign', 'EXIT', 0.3, [60, 255, 120], [10, 30, 16, 255], [0, 2.5, -29.8], [0, 0, 0], true);
  put(root, 'Puddle', new SphereGeometry(1, 16, 6), mat(0x2a2c30, { rough: 0.05, metal: 0.5 }), [-2, 0, -4]).scale.set(1.3, 0.005, 0.8);
  return root;
}
