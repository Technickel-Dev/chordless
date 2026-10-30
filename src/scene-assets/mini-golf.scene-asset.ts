import { BoxGeometry, ConeGeometry, CylinderGeometry, DodecahedronGeometry, Group, SphereGeometry, TorusGeometry } from '@iwsdk/core';
import { block, disc, instances, mat, noiseTexture, type Placement, post, put, seededRandom, skyBody } from './lib/set-kit.js';

/**
 * Mini golf: bright turf fairways with wooden borders, a windmill hole ahead,
 * a loop-de-loop to the right and a flag on the green, on a sunny day.
 */
export function createMiniGolfSet(): Group {
  const root = new Group();
  root.name = 'MiniGolfSet';
  const rand = seededRandom(341);
  const lawn = noiseTexture([96, 150, 70], 30, 342);
  lawn.repeat.set(40, 40);
  disc(root, 'Lawn', 150, mat(0xffffff, { map: lawn }), -0.03);
  const turf = mat(0xffffff, { map: noiseTexture([40, 170, 70], 20, 343), rough: 1 });
  const border = mat(0xc89058, { rough: 0.8 });

  // Fairways: the player stands on the tee strip; others branch off.
  const fairway = (name: string, w: number, l: number, x: number, z: number, yawDeg: number) => {
    const g = new Group();
    g.name = name;
    g.position.set(x, 0, z);
    g.rotation.y = (yawDeg * Math.PI) / 180;
    root.add(g);
    block(g, 'Turf', [w, 0.06, l], turf, [0, -0.06, 0]);
    for (const s of [-1, 1]) block(g, 'Rail', [0.12, 0.16, l + 0.24], border, [s * (w / 2 + 0.06), -0.06, 0]);
    for (const s of [-1, 1]) block(g, 'End', [w, 0.16, 0.12], border, [0, -0.06, s * (l / 2 + 0.06)]);
    return g;
  };
  fairway('TeeStrip', 2.2, 12, 0, -4, 0);
  fairway('LoopLane', 1.6, 9, 4.6, -6, -10);
  fairway('Green', 5, 4, -1, -11.6, 0);
  put(root, 'TeeMat', new BoxGeometry(0.6, 0.01, 0.6), mat(0x2a6a3a), [0, 0.005, 0.8]);
  put(root, 'Ball', new SphereGeometry(0.03, 16, 12), mat(0xffffff, { rough: 0.3 }), [0.1, 0.03, 0.8]);

  // Windmill straddling the tee strip.
  const mill = new Group();
  mill.name = 'Windmill';
  mill.position.set(0, 0, -7);
  root.add(mill);
  const red = mat(0xc83a32, { rough: 0.7 });
  block(mill, 'BaseLeft', [0.8, 1.4, 1.4], red, [-0.85, 0, 0]);
  block(mill, 'BaseRight', [0.8, 1.4, 1.4], red, [0.85, 0, 0]);
  block(mill, 'Lintel', [2.5, 0.6, 1.4], red, [0, 1.4, 0]);
  put(mill, 'Tower', new CylinderGeometry(0.75, 1.1, 2.4, 8), mat(0xf2e8d8, { rough: 0.7 }), [0, 3.2, 0]);
  put(mill, 'Cap', new ConeGeometry(0.95, 1.1, 8), mat(0x6a3a2a), [0, 4.95, 0]);
  put(mill, 'Hub', new CylinderGeometry(0.15, 0.15, 0.3, 12), mat(0x3a2a1a), [0, 3.8, 0.85], [90, 0, 0]);
  for (let i = 0; i < 4; i++) {
    const blade = new Group();
    blade.position.set(0, 3.8, 0.95);
    blade.rotation.z = (i * Math.PI) / 2 + 0.4;
    mill.add(blade);
    put(blade, 'Spar', new BoxGeometry(0.08, 2.4, 0.05), mat(0x3a2a1a), [0, 1.2, 0]);
    put(blade, 'Sail', new BoxGeometry(0.5, 1.8, 0.02), mat(0xf6f0e0, { double: true }), [0.28, 1.4, 0]);
  }

  // Loop-de-loop on the right lane.
  put(root, 'Loop', new TorusGeometry(1.1, 0.12, 12, 48), mat(0x3a8ad8, { rough: 0.4 }), [4.8, 1.18, -7], [0, 80, 0]);
  // Green with cup and flag.
  put(root, 'Cup', new CylinderGeometry(0.06, 0.06, 0.012, 20), mat(0x111111), [-1.6, 0.004, -12]);
  post(root, 'FlagPole', 0.012, 1.4, mat(0xf2f2f2), [-1.6, 0, -12]);
  put(root, 'Flag', new BoxGeometry(0.42, 0.28, 0.01), mat(0xffd23a, { double: true }), [-1.39, 1.25, -12]);
  // Rocks and a little pond beside the green.
  instances(root, 'Rocks', new DodecahedronGeometry(1, 0), mat(0x9a948a), [
    { pos: [-4.2, 0.1, -9.5], scale: [0.5, 0.35, 0.5] },
    { pos: [-4.8, 0.1, -10.3], scale: [0.35, 0.3, 0.4] },
    { pos: [2.8, 0.1, -12.5], scale: [0.6, 0.4, 0.5] },
  ]);
  put(root, 'Pond', new CylinderGeometry(1.4, 1.4, 0.02, 32), mat(0x3aa8d8, { rough: 0.05, metal: 0.2 }), [-4.6, 0.0, -7]);
  // Shrubs and palms ringing the course.
  const shrubs: Placement[] = [];
  for (let i = 0; i < 40; i++) {
    const a = rand() * Math.PI * 2;
    const r = 10 + rand() * 12;
    shrubs.push({ pos: [Math.sin(a) * r, 0.3, -Math.cos(a) * r - 4], scale: 0.6 + rand() * 0.8, color: rand() < 0.5 ? 0x3a8a3a : 0x2a7a4a });
  }
  instances(root, 'Shrubs', new SphereGeometry(1, 14, 10), mat(0xffffff, { rough: 0.9 }), shrubs);
  skyBody(root, 'Sun', [50, 90, -100], 6, 0xffffff, 0xfff4d8, 3);
  return root;
}
