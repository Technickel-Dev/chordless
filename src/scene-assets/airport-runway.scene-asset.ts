import { BoxGeometry, CapsuleGeometry, CylinderGeometry, Group, SphereGeometry } from '@iwsdk/core';
import { block, disc, glow, instances, mat, noiseTexture, type Placement, post, put, stars, windowTexture } from './lib/set-kit.js';

/**
 * Airport runway at night: the player stands on the centerline of a long
 * runway lined with edge lights and green threshold lights, a control tower
 * glowing to one side and a jet parked on the apron.
 */
export function createAirportRunwaySet(): Group {
  const root = new Group();
  root.name = 'AirportRunwaySet';
  const grass = noiseTexture([40, 56, 36], 26, 481);
  grass.repeat.set(60, 60);
  disc(root, 'Airfield', 195, mat(0xffffff, { map: grass, rough: 1 }), -0.03);
  const asphalt = noiseTexture([56, 58, 62], 22, 482);
  asphalt.repeat.set(6, 60);
  put(root, 'Runway', new BoxGeometry(45, 0.04, 380), mat(0xffffff, { map: asphalt, rough: 0.8 }), [0, -0.02, -150]);
  put(root, 'Apron', new BoxGeometry(60, 0.04, 70), mat(0xffffff, { map: asphalt, rough: 0.8 }), [70, -0.025, -30]);

  // Paint: centerline dashes, threshold bars and aiming points.
  const paint = mat(0xe8e8e4, { rough: 0.6 });
  const dashes: Placement[] = [];
  for (let z = -6; z > -330; z -= 50) dashes.push({ pos: [0, 0.005, z] });
  instances(root, 'Centerline', new BoxGeometry(0.9, 0.005, 30), paint, dashes);
  const bars: Placement[] = [];
  for (let i = 0; i < 8; i++) for (const s of [-1, 1]) bars.push({ pos: [s * (3 + i * 2.4), 0.005, 25] });
  instances(root, 'Threshold', new BoxGeometry(1.8, 0.005, 30), paint, bars);
  instances(root, 'AimingPoints', new BoxGeometry(6, 0.005, 45), paint, [{ pos: [-11, 0.005, -60] }, { pos: [11, 0.005, -60] }]);

  // Lights: white edge lights every 30 m, green across the threshold, blue on the taxiway.
  const edge: Placement[] = [];
  for (let z = 30; z > -330; z -= 30) for (const s of [-1, 1]) edge.push({ pos: [s * 23, 0.15, z] });
  instances(root, 'EdgeLights', new SphereGeometry(0.35, 10, 8), glow(0xfff6e0), edge);
  const greens: Placement[] = [];
  for (let x = -22; x <= 22; x += 2.2) greens.push({ pos: [x, 0.12, 40] });
  instances(root, 'ThresholdLights', new SphereGeometry(0.3, 10, 8), glow(0x3aff7a), greens);
  const blues: Placement[] = [];
  for (let z = 10; z > -60; z -= 8) blues.push({ pos: [38, 0.12, z] });
  instances(root, 'TaxiwayLights', new SphereGeometry(0.15, 10, 8), glow(0x3a6aff), blues);
  instances(root, 'LightPosts', new CylinderGeometry(0.04, 0.05, 0.15, 6).translate(0, 0.075, 0), mat(0x444444), edge);

  // Control tower on the right.
  const tower = new Group();
  tower.name = 'ControlTower';
  tower.position.set(60, 0, -70);
  root.add(tower);
  post(tower, 'Shaft', 3, 30, mat(0xb8b8b4, { rough: 0.8 }), [0, 0, 0], 2.4, 16);
  post(tower, 'CabBase', 5.5, 1, mat(0x8a8a88), [0, 30, 0], 5.5, 16);
  post(tower, 'Cab', 5.5, 4, glow(0x5ad8a8, 0.85), [0, 31, 0], 6, 16);
  post(tower, 'Roof', 6.3, 0.8, mat(0x6a6a68), [0, 35, 0], 6.3, 16);
  post(tower, 'Mast', 0.15, 6, mat(0xaaaaaa, { metal: 0.6 }), [0, 35.8, 0]);
  put(tower, 'Beacon', new SphereGeometry(0.4, 10, 8), glow(0xff3030), [0, 42, 0]);
  const terminal = mat(0xffffff, { map: windowTexture(483, 0.6), emissive: 0xffffff, glow: 0.8 });
  terminal.emissiveMap = terminal.map;
  block(root, 'Terminal', [90, 14, 20], terminal, [110, 0, -30]);

  // The jet on the apron, nose toward the runway.
  const jet = new Group();
  jet.name = 'Jet';
  jet.position.set(55, 0, -20);
  jet.rotation.y = Math.PI / 2 - 0.3; // nose (local -Z) toward the runway
  root.add(jet);
  const white = mat(0xf2f4f6, { rough: 0.35, metal: 0.2 });
  const fuselage = new CapsuleGeometry(2, 30, 8, 24);
  fuselage.rotateX(Math.PI / 2);
  put(jet, 'Fuselage', fuselage, white, [0, 4.2, 0]);
  put(jet, 'Wings', new BoxGeometry(36, 0.4, 6), white, [0, 3.4, 1.5]);
  put(jet, 'Tailplane', new BoxGeometry(12, 0.3, 3), white, [0, 5, 15]);
  put(jet, 'Fin', new BoxGeometry(0.4, 7, 5), mat(0xd83a3a, { rough: 0.4 }), [0, 9, 15.5]);
  for (const x of [-7, 7]) {
    put(jet, 'Engine', new CylinderGeometry(1.3, 1.1, 4.4, 20), mat(0xc8ccd0, { metal: 0.5, rough: 0.35 }), [x, 2.2, 0], [90, 0, 0]);
    put(jet, 'Intake', new CylinderGeometry(1.05, 1.05, 0.1, 20), mat(0x1a1a1a), [x, 2.2, -2.2], [90, 0, 0]);
  }
  const windows: Placement[] = [];
  for (let i = 0; i < 26; i++) for (const s of [-1, 1]) windows.push({ pos: [s * 1.95, 4.8, -12 + i * 1], rotDeg: [0, 90, 0] });
  instances(jet, 'CabinWindows', new BoxGeometry(0.3, 0.4, 0.02), glow(0xffe6b0), windows);
  instances(jet, 'Gear', new CylinderGeometry(0.6, 0.6, 0.5, 16).rotateZ(Math.PI / 2), mat(0x1a1a1a), [
    { pos: [0, 0.6, -12] }, { pos: [-3, 0.6, 2] }, { pos: [3, 0.6, 2] },
  ]);
  put(jet, 'NavRed', new SphereGeometry(0.25, 8, 6), glow(0xff2020), [-18, 3.4, 1.5]);
  put(jet, 'NavGreen', new SphereGeometry(0.25, 8, 6), glow(0x20ff40), [18, 3.4, 1.5]);
  stars(root, 1200, 185, 484);
  return root;
}
