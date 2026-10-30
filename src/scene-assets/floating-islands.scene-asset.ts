import { BoxGeometry, ConeGeometry, CylinderGeometry, DodecahedronGeometry, Group, SphereGeometry } from '@iwsdk/core';
import { instances, mat, noiseTexture, type Placement, put, seededRandom, skyBody, span } from './lib/set-kit.js';

/**
 * Floating islands: the player stands on a grassy chunk of rock hanging in
 * open sky, a rope bridge reaching across to a second island with a little
 * tree, more islands drifting farther off and clouds far below.
 */
export function createFloatingIslandsSet(): Group {
  const root = new Group();
  root.name = 'FloatingIslandsSet';
  const rand = seededRandom(551);
  const grass = mat(0xffffff, { map: noiseTexture([96, 160, 70], 30, 552), rough: 1 });
  const rock = mat(0xffffff, { map: noiseTexture([120, 104, 90], 36, 553), rough: 1 });

  // An island: a grass cap on an inverted rocky cone with dangling chunks.
  const island = (name: string, x: number, y: number, z: number, r: number) => {
    const g = new Group();
    g.name = name;
    g.position.set(x, y, z);
    root.add(g);
    put(g, 'Grass', new CylinderGeometry(r, r * 0.96, 0.4, 24), grass, [0, -0.2, 0]);
    put(g, 'Rock', new ConeGeometry(r * 0.95, r * 1.8, 12), rock, [0, -0.4 - r * 0.9, 0], [180, 0, 0]);
    const bits: Placement[] = [];
    for (let i = 0; i < 6; i++) {
      const a = rand() * Math.PI * 2;
      const s = r * (0.15 + rand() * 0.2);
      bits.push({ pos: [Math.sin(a) * r * 0.5, -0.6 - rand() * r, Math.cos(a) * r * 0.5], rotDeg: [rand() * 90, rand() * 360, 0], scale: s });
    }
    instances(g, 'Outcrops', new DodecahedronGeometry(1, 0), rock, bits);
    return g;
  };
  island('HomeIsland', 0, 0, 0.5, 3.4);
  const near = island('TreeIsland', -3.5, 0.8, -12, 3);
  put(near, 'Trunk', new CylinderGeometry(0.18, 0.28, 2.2, 8), mat(0x5a3e2a), [0, 1.1, 0]);
  instances(near, 'Crown', new DodecahedronGeometry(1, 1), mat(0x3a8a3a, { rough: 0.9 }), [
    { pos: [0, 2.6, 0], scale: 1.3 }, { pos: [0.7, 2.3, 0.3], scale: 0.9 }, { pos: [-0.6, 2.4, -0.3], scale: 0.9 },
  ]);
  island('FarIslandA', 16, 5, -30, 5);
  island('FarIslandB', -26, -4, -40, 6);
  island('FarIslandC', 34, 12, -70, 8);
  island('FarIslandD', -50, 8, -95, 10);
  island('FarIslandE', 20, -14, 30, 6);

  // Rope bridge from the home island to the tree island, sagging gently.
  const a: [number, number, number] = [-0.6, 0, -2.7];
  const b: [number, number, number] = [-3, 0.8, -9.1];
  const planks: Placement[] = [];
  const ropes: Placement[] = [];
  const n = 16;
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const yaw = (Math.atan2(dx, dz) * 180) / Math.PI;
  const side: [number, number] = [dz / Math.hypot(dx, dz), -dx / Math.hypot(dx, dz)];
  const at = (t: number, lift: number, offset: number): [number, number, number] => [
    a[0] + dx * t + side[0] * offset,
    a[1] + (b[1] - a[1]) * t - Math.sin(Math.PI * t) * 0.8 + lift,
    a[2] + dz * t + side[1] * offset,
  ];
  for (let i = 0; i <= n; i++) planks.push({ pos: at(i / n, 0, 0), rotDeg: [0, yaw, 0] });
  for (let i = 0; i < n; i++) for (const o of [-0.45, 0.45]) ropes.push(span(at(i / n, 0.9, o), at((i + 1) / n, 0.9, o), 0.025));
  for (let i = 0; i <= n; i += 2) for (const o of [-0.45, 0.45]) ropes.push(span(at(i / n, 0, o), at(i / n, 0.9, o), 0.015));
  instances(root, 'BridgePlanks', new BoxGeometry(0.95, 0.05, 0.22), mat(0x8a6a48, { rough: 0.9 }), planks);
  instances(root, 'BridgeRopes', new CylinderGeometry(1, 1, 1, 5), mat(0xb89a6a, { rough: 1 }), ropes);
  instances(root, 'BridgePosts', new CylinderGeometry(0.07, 0.07, 1.2, 8).translate(0, 0.6, 0), mat(0x6a4a30), [
    { pos: at(0, 0, -0.5) }, { pos: at(0, 0, 0.5) }, { pos: at(1, 0, -0.5) }, { pos: at(1, 0, 0.5) },
  ]);

  // Clouds far below and drifting at island height.
  const clouds: Placement[] = [];
  for (let i = 0; i < 120; i++) {
    const r = 15 + Math.sqrt(rand()) * 170;
    const ang = rand() * Math.PI * 2;
    const low = rand() < 0.75;
    const s = low ? 8 + rand() * 12 : 3 + rand() * 4;
    clouds.push({ pos: [Math.sin(ang) * r, low ? -45 - rand() * 10 : -8 + rand() * 20, Math.cos(ang) * r], scale: [s, s * 0.4, s] });
  }
  instances(root, 'Clouds', new SphereGeometry(1, 14, 10), mat(0xffffff, { rough: 1 }), clouds);
  skyBody(root, 'Sun', [60, 70, -120], 7, 0xffffff, 0xfff4d8, 3);
  return root;
}
