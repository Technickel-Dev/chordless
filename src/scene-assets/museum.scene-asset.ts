import { BoxGeometry, CylinderGeometry, Group, TorusKnotGeometry } from '@iwsdk/core';
import {
  bandTexture,
  blobTexture,
  block,
  glow,
  instances,
  mat,
  type Placement,
  post,
  put,
  room,
  sign,
  stripeTexture,
  tileTexture,
} from './lib/set-kit.js';

/**
 * Museum at night: a long gallery hall with framed paintings down both walls,
 * a bronze sculpture on a plinth behind a velvet rope, two benches and a
 * skylight letting in cold moonlight.
 */
export function createMuseumSet(): Group {
  const root = new Group();
  root.name = 'MuseumSet';
  const floor = tileTexture([60, 58, 56], [52, 50, 48], 10, [30, 30, 30]);
  floor.repeat.set(4, 8);
  room(root, 'Gallery', [12, 6, 24], mat(0x5a2a2e, { rough: 0.9 }), mat(0xffffff, { map: floor, rough: 0.15, metal: 0.1 }), mat(0x1a1a1e), [0, -9]);
  put(root, 'Skylight', new BoxGeometry(4, 0.04, 14), glow(0x5a6a8a), [0, 5.98, -9]);
  put(root, 'Wainscot', new BoxGeometry(0.04, 1, 24), mat(0x2a1a14), [-5.98, 0.5, -9]);
  put(root, 'WainscotR', new BoxGeometry(0.04, 1, 24), mat(0x2a1a14), [5.98, 0.5, -9]);

  // Paintings: abstract canvases in gilt frames, with a brass picture light each.
  const gilt = mat(0xb8903a, { metal: 0.85, rough: 0.35 });
  const canvases = [
    blobTexture([30, 50, 90], [[240, 200, 80], [200, 60, 60], [240, 240, 230]], 14, 30, 291),
    stripeTexture([220, 200, 160], [60, 80, 120], 6),
    bandTexture([[200, 120, 60], [90, 120, 160], [230, 210, 170], [60, 70, 60]], 6, 292),
    blobTexture([210, 200, 180], [[40, 40, 40], [180, 40, 40]], 6, 50, 293),
    tileTexture([230, 60, 50], [240, 230, 210], 3, [20, 20, 20]),
    blobTexture([40, 90, 70], [[220, 180, 120], [120, 160, 200]], 22, 18, 294),
  ];
  const lights: Placement[] = [];
  canvases.forEach((map, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const z = -2.5 - Math.floor(i / 2) * 6;
    const w = [2.2, 1.6, 2.8][i % 3];
    const h = [1.6, 2.1, 1.7][i % 3];
    const x = side * 5.96;
    const yaw = side * -90;
    put(root, 'Frame', new BoxGeometry(w + 0.24, h + 0.24, 0.08), gilt, [x - side * 0.04, 2.3, z], [0, yaw, 0]);
    put(root, 'Painting', new BoxGeometry(w, h, 0.02), mat(0xffffff, { map, rough: 0.8 }), [x - side * 0.09, 2.3, z], [0, yaw, 0]);
    lights.push({ pos: [x - side * 0.2, 2.3 + h / 2 + 0.3, z], rotDeg: [0, yaw, 0] });
  });
  instances(root, 'PictureLights', new BoxGeometry(0.6, 0.05, 0.12), mat(0xc8a050, { metal: 0.8, emissive: 0xfff0d0, glow: 0.6 }), lights);

  // Sculpture: a bronze knot on a white plinth, behind rope stanchions.
  block(root, 'Plinth', [1, 1.1, 1], mat(0xeeeeea, { rough: 0.6 }), [0, 0, -7]);
  const knot = put(root, 'Sculpture', new TorusKnotGeometry(0.5, 0.16, 160, 20, 2, 3), mat(0x8a5a2a, { metal: 0.9, rough: 0.35 }), [0, 1.85, -7]);
  knot.rotation.set(0.4, 0.3, 0);
  const stanchions: Placement[] = [];
  for (const [x, z] of [[-1.3, -5.7], [1.3, -5.7], [-1.3, -8.3], [1.3, -8.3]]) stanchions.push({ pos: [x, 0, z] });
  instances(root, 'Stanchions', new CylinderGeometry(0.035, 0.035, 0.95, 10).translate(0, 0.475, 0), gilt, stanchions);
  for (const [x, z, len, yaw] of [[0, -5.7, 2.6, 0], [0, -8.3, 2.6, 0], [-1.3, -7, 2.6, 90], [1.3, -7, 2.6, 90]]) {
    put(root, 'Rope', new CylinderGeometry(0.025, 0.025, len, 8), mat(0x8a1a2a, { rough: 0.9 }), [x, 0.82, z], [0, yaw, 90]);
  }
  // Benches either side of the sculpture.
  for (const z of [-3.4, -11]) {
    block(root, 'BenchSeat', [2.4, 0.08, 0.5], mat(0x2a2a2a, { rough: 0.4 }), [0, 0.42, z]);
    for (const x of [-1, 1]) post(root, 'BenchLeg', 0.04, 0.42, mat(0x9a9ea2, { metal: 0.9 }), [x, 0, z]);
  }
  sign(root, 'Exit', 'EXIT', 0.22, [40, 255, 120], [8, 24, 12, 255], [0, 3.4, -20.97], [0, 0, 0], true);
  block(root, 'Doorway', [2, 3, 0.05], mat(0x0a0a0c), [0, 0, -20.95]);
  return root;
}
