import { CapsuleGeometry, ConeGeometry, CylinderGeometry, Group, SphereGeometry, TorusGeometry } from '@iwsdk/core';
import { disc, instances, mat, noiseTexture, type Placement, put, skyBody, stripeTexture } from './lib/set-kit.js';

/**
 * Bouncy castle: a puffy striped floor inside inflated walls, fat turrets
 * with cone roofs at the corners and an arched doorway, on a summer lawn.
 */
export function createBouncyCastleSet(): Group {
  const root = new Group();
  root.name = 'BouncyCastleSet';
  const lawn = noiseTexture([100, 160, 72], 30, 381);
  lawn.repeat.set(40, 40);
  disc(root, 'Lawn', 150, mat(0xffffff, { map: lawn }), -0.5);

  const half = 3.6;
  const vinyl = (c: number) => mat(c, { rough: 0.35, metal: 0.05 });
  const stripes = stripeTexture([230, 50, 60], [250, 210, 40], 8);
  stripes.repeat.set(2, 1);
  // Floor: a fat cushion with quilted puffs; its top is at y = 0.
  put(root, 'Cushion', new CylinderGeometry(half * 1.42, half * 1.42, 0.5, 4), mat(0xffffff, { map: stripes, rough: 0.35 }), [0, -0.25, -1.6], [0, 45, 0]);
  const puffs: Placement[] = [];
  for (let x = -half + 0.6; x < half; x += 1.2) for (let z = -half + 0.6; z < half; z += 1.2) puffs.push({ pos: [x, -0.02, z - 1.6], scale: [0.55, 0.08, 0.55] });
  instances(root, 'Quilting', new SphereGeometry(1, 16, 8), vinyl(0xf04050), puffs);

  // Walls: rows of inflated tubes on three sides, open behind the player.
  const tubes: Placement[] = [];
  const colors = [0x2a6ad8, 0xf2c428, 0x2ab85a];
  const wallH = 1.8;
  for (let i = 0; i < 6; i++) {
    const t = -half + 0.6 + i * 1.2;
    tubes.push({ pos: [t, wallH / 2, -half - 1.6], color: colors[i % 3] });
    tubes.push({ pos: [-half, wallH / 2, t - 1.6], color: colors[(i + 1) % 3] });
    tubes.push({ pos: [half, wallH / 2, t - 1.6], color: colors[(i + 2) % 3] });
  }
  instances(root, 'WallTubes', new CapsuleGeometry(0.45, wallH - 0.9, 6, 16), mat(0xffffff, { rough: 0.35 }), tubes);
  // Fat rails along the wall tops: along X at the back, along Z at the sides.
  put(root, 'RailBack', new CapsuleGeometry(0.5, 2 * half, 6, 16), vinyl(0xf04050), [0, wallH + 0.1, -half - 1.6], [0, 0, 90]);
  for (const x of [-half, half]) put(root, 'RailSide', new CapsuleGeometry(0.5, 2 * half, 6, 16), vinyl(0xf04050), [x, wallH + 0.1, -1.6], [90, 0, 0]);
  // Turrets at the corners.
  for (const [x, z] of [[-half, -half - 1.6], [half, -half - 1.6], [-half, half - 1.6], [half, half - 1.6]]) {
    put(root, 'Turret', new CylinderGeometry(0.9, 1, 3.2, 24), vinyl(0x2a6ad8), [x, 1.3, z]);
    put(root, 'TurretRing', new TorusGeometry(0.95, 0.22, 10, 24), vinyl(0xf2c428), [x, 2.9, z], [90, 0, 0]);
    put(root, 'TurretRoof', new ConeGeometry(1.15, 1.8, 24), vinyl(0xf04050), [x, 3.9, z]);
    put(root, 'Pennant', new ConeGeometry(0.15, 0.6, 4), vinyl(0xf2c428), [x, 5.1, z], [0, 0, 90]);
  }
  // Arch over the back wall.
  put(root, 'Arch', new TorusGeometry(1.6, 0.45, 14, 32, Math.PI), vinyl(0xf2c428), [0, wallH + 0.2, -half - 1.6]);
  put(root, 'ArchStar', new SphereGeometry(0.4, 16, 12), vinyl(0xf04050), [0, wallH + 2.25, -half - 1.6]);
  skyBody(root, 'Sun', [-40, 80, -100], 6, 0xffffff, 0xfff4d8, 3);
  // A few trees around the lawn.
  const trees: Placement[] = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    trees.push({ pos: [Math.sin(a) * 26, 2.5, -Math.cos(a) * 26], scale: [2.5, 3, 2.5] });
  }
  instances(root, 'TreeCanopies', new SphereGeometry(1, 16, 12), mat(0x3a8a3a, { rough: 0.9 }), trees);
  instances(root, 'TreeTrunks', new CylinderGeometry(0.25, 0.3, 3, 8), mat(0x5a3e2a), trees.map((t) => ({ pos: [t.pos[0], 1, t.pos[2]] })));
  return root;
}
