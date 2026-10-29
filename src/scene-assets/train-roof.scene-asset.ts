import { BoxGeometry, CylinderGeometry, ExtrudeGeometry, Group, Path, Shape, SphereGeometry } from '@iwsdk/core';
import { block, disc, glow, instances, mat, noiseTexture, type Placement, post, put, seededRandom, stripeTexture } from './lib/set-kit.js';

/**
 * Train roof: the player rides on top of a carriage, more carriages ahead and
 * behind on a long straight track, rolling green hills either side and a
 * tunnel mouth waiting in a hillside far ahead.
 */
export function createTrainRoofSet(): Group {
  const root = new Group();
  root.name = 'TrainRoofSet';
  const rand = seededRandom(211);

  // Carriages: roof top at y = 0, 3 m wide, 20 m long, 1.2 m gaps.
  const length = 20;
  const paint = mat(0x2a5a8a, { rough: 0.5, metal: 0.3 });
  const roofMat = mat(0x8a9096, { rough: 0.6, metal: 0.5 });
  const windowMat = glow(0x2a3444);
  const centers = [-63.6, -42.4, -21.2, 0, 21.2, 42.4];
  for (const z of centers) {
    const car = new Group();
    car.name = 'Carriage';
    car.position.set(0, 0, z);
    root.add(car);
    block(car, 'Body', [3, 3.2, length], paint, [0, -3.4, 0]);
    const roof = new CylinderGeometry(1.6, 1.6, length, 24, 1, false, -Math.PI / 2, Math.PI);
    roof.rotateX(-Math.PI / 2); // the half-shell becomes the top
    roof.scale(1, 0.2, 1);
    put(car, 'Roof', roof, roofMat, [0, -0.32, 0]);
    put(car, 'Walkway', new BoxGeometry(0.8, 0.05, length - 0.4), mat(0x3a3a3c, { rough: 0.9 }), [0, -0.01, 0]);
    put(car, 'Stripe', new BoxGeometry(3.02, 0.2, length), mat(0xf2c84a, { rough: 0.5 }), [0, -1.4, 0]);
    const windows: Placement[] = [];
    for (let i = 0; i < 9; i++) for (const x of [-1.51, 1.51]) windows.push({ pos: [x, -1.15, -8 + i * 2], rotDeg: [0, 90, 0] });
    instances(car, 'Windows', new BoxGeometry(1.2, 0.9, 0.02), windowMat, windows);
    for (const wz of [-7, 7]) for (const x of [-1, 1]) {
      put(car, 'Wheel', new CylinderGeometry(0.45, 0.45, 0.2, 16), mat(0x1a1a1c, { metal: 0.6 }), [x * 1.2, -3.8, wz], [0, 0, 90]);
    }
  }
  // The locomotive nose at the front.
  const loco = new Group();
  loco.name = 'Locomotive';
  loco.position.set(0, 0, -84);
  root.add(loco);
  block(loco, 'Body', [3, 3.6, 18], mat(0xb8322a, { rough: 0.4, metal: 0.3 }), [0, -3.6, 0]);
  put(loco, 'Nose', new SphereGeometry(1.8, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xb8322a, { rough: 0.4 }), [0, -1.9, -9], [-90, 0, 0]);
  post(loco, 'Stack', 0.4, 1.2, mat(0x222222), [0, 0, -5]);
  put(loco, 'Headlamp', new SphereGeometry(0.3, 16, 8), glow(0xfff2c8), [0, -1.4, -10.7]);

  // Track bed, rails and sleepers.
  const gravel = noiseTexture([120, 110, 100], 40, 212);
  gravel.repeat.set(2, 60);
  block(root, 'Ballast', [5, 0.85, 400], mat(0xffffff, { map: gravel, rough: 1 }), [0, -5.1, -40]);
  for (const x of [-0.75, 0.75]) put(root, 'Rail', new BoxGeometry(0.1, 0.15, 400), mat(0x777a7e, { metal: 0.9, rough: 0.3 }), [x, -4.18, -40]);
  const sleepers: Placement[] = [];
  for (let z = -200; z < 140; z += 0.9) sleepers.push({ pos: [0, -4.25, z] });
  instances(root, 'Sleepers', new BoxGeometry(2.6, 0.12, 0.25), mat(0x4a3a2c), sleepers);

  // Fields and hills.
  const grass = noiseTexture([96, 140, 64], 36, 213);
  grass.repeat.set(60, 60);
  disc(root, 'Fields', 195, mat(0xffffff, { map: grass, rough: 1 }), -5.1);
  const hills: Placement[] = [];
  for (let i = 0; i < 40; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const s = 15 + rand() * 35;
    hills.push({ pos: [side * (20 + s * 0.8 + rand() * 60), -6, -180 + rand() * 340], scale: [s, s * (0.3 + rand() * 0.3), s * 1.4] });
  }
  instances(root, 'Hills', new SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x6a9a4a, { rough: 1 }), hills);
  // Tunnel: a hill straddling the track with a stone portal.
  put(root, 'TunnelHill', new SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x5e8e44, { rough: 1 }), [0, -6, -185]).scale.set(45, 26, 30);
  const portal = new Shape();
  portal.moveTo(-6, 0);
  portal.lineTo(6, 0);
  portal.lineTo(6, 10);
  portal.lineTo(-6, 10);
  const arch = new Path();
  arch.moveTo(-3, 0);
  arch.lineTo(3, 0);
  arch.lineTo(3, 4.5);
  arch.absarc(0, 4.5, 3, 0, Math.PI, false);
  arch.lineTo(-3, 0);
  portal.holes.push(arch);
  const stone = mat(0xffffff, { map: stripeTexture([150, 144, 136], [128, 122, 116], 12) });
  put(root, 'Portal', new ExtrudeGeometry(portal, { depth: 1.5, bevelEnabled: false }), stone, [0, -5.1, -156]);
  put(root, 'TunnelDark', new BoxGeometry(6, 7.5, 0.2), glow(0x050505), [0, -1.4, -157]);
  // Telegraph poles alongside.
  const poles: Placement[] = [];
  for (let z = -180; z < 120; z += 30) poles.push({ pos: [-4.5, -5.1, z] });
  const pole = new CylinderGeometry(0.12, 0.15, 8, 8);
  pole.translate(0, 4, 0);
  instances(root, 'Poles', pole, mat(0x5a4632), poles);
  return root;
}
