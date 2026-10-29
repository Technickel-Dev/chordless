import { BoxGeometry, CylinderGeometry, Group, SphereGeometry } from '@iwsdk/core';
import { block, glow, instances, mat, type Placement, plankTexture, post, put, spineTexture } from './lib/set-kit.js';

/**
 * Endless library: towering bookcases line a long aisle ahead and behind,
 * cross aisles open off it, and everything fades into darkness (the scene's
 * DomeFade does the fading). A reading lamp glows on a small table.
 */
export function createLibrarySet(): Group {
  const root = new Group();
  root.name = 'LibrarySet';
  const floor = plankTexture([96, 64, 40], 12, 261);
  floor.repeat.set(6, 60);
  block(root, 'Floor', [60, 0.1, 400], mat(0xffffff, { map: floor, rough: 0.6 }), [0, -0.1, -60]);
  put(root, 'Runner', new BoxGeometry(1.6, 0.012, 400), mat(0x5a1a22, { rough: 1 }), [0, 0.006, -60]);

  // A bay is 2 m wide, 9 m tall, 9 shelves; its face carries the spine texture.
  const spines = spineTexture(262);
  spines.repeat.set(1, 9);
  const faceMat = mat(0xffffff, { map: spines, rough: 0.9 });
  const caseMat = mat(0x3a2418, { rough: 0.7 });
  const bays: Placement[] = [];
  const faces: Placement[] = [];
  const addBay = (x: number, z: number, yawDeg: number) => {
    bays.push({ pos: [x, 0, z], rotDeg: [0, yawDeg, 0] });
    const a = (yawDeg * Math.PI) / 180;
    faces.push({ pos: [x + Math.sin(a) * 0.21, 0, z + Math.cos(a) * 0.21], rotDeg: [0, yawDeg, 0] });
  };
  // Main aisle walls at x = +-2.2, broken by cross aisles every 14 m.
  for (let z = -170; z <= 60; z += 2) {
    if (((z % 14) + 14) % 14 === 6) continue; // cross aisle
    addBay(-2.2, z, 90);
    addBay(2.2, z, -90);
  }
  // Rows down each cross aisle, receding sideways.
  for (let z = -162; z <= 60; z += 14) {
    for (const side of [-1, 1]) {
      for (let x = 4.2; x < 40; x += 2) {
        addBay(side * x, z - 1.3, 0);
        addBay(side * x, z + 1.3, 180);
      }
    }
  }
  const bay = new BoxGeometry(2, 9, 0.5);
  bay.translate(0, 4.5, 0);
  instances(root, 'Bookcases', bay, caseMat, bays);
  const face = new BoxGeometry(1.9, 8.8, 0.1);
  face.translate(0, 4.5, 0);
  instances(root, 'BookFaces', face, faceMat, faces);

  // A rolling ladder against the left wall and a reading table with a lamp.
  const ladder = new Group();
  ladder.name = 'Ladder';
  ladder.position.set(-1.85, 0, -4.5);
  ladder.rotation.z = -0.22;
  root.add(ladder);
  for (const z of [-0.25, 0.25]) put(ladder, 'Rail', new BoxGeometry(0.05, 6, 0.05), mat(0x6a4a2a), [0.6, 3, z]);
  for (let i = 0; i < 14; i++) put(ladder, 'Rung', new CylinderGeometry(0.02, 0.02, 0.5, 6), mat(0x6a4a2a), [0.6, 0.3 + i * 0.4, 0], [90, 0, 0]);
  const table = new Group();
  table.name = 'ReadingTable';
  table.position.set(1.1, 0, -3.2);
  root.add(table);
  block(table, 'Top', [0.9, 0.05, 0.6], mat(0x4a2c1a, { rough: 0.4 }), [0, 0.75, 0]);
  block(table, 'Base', [0.7, 0.75, 0.45], mat(0x3a2214), [0, 0, 0]);
  post(table, 'LampStem', 0.015, 0.35, mat(0xc8a050, { metal: 0.8 }), [0.2, 0.8, 0]);
  put(table, 'LampShade', new CylinderGeometry(0.06, 0.12, 0.12, 16, 1, true), mat(0x2a6a3a, { emissive: 0x2a6a3a, glow: 0.4, double: true }), [0.2, 1.15, 0]);
  put(table, 'Bulb', new SphereGeometry(0.03, 10, 8), glow(0xfff0c8), [0.2, 1.12, 0]);
  block(table, 'OpenBook', [0.34, 0.02, 0.24], mat(0xf2ead6), [-0.12, 0.8, 0]);
  return root;
}
