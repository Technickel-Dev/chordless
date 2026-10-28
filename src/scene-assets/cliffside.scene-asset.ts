import { BoxGeometry, CylinderGeometry, DodecahedronGeometry, Group } from '@iwsdk/core';
import {
  disc,
  instances,
  mat,
  noiseTexture,
  type Placement,
  plankTexture,
  put,
  seededRandom,
  skyBody,
} from './lib/set-kit.js';

/**
 * Cliffside at sunset: a small timber deck on the lip of a sea cliff, a low
 * rail at the drop, the ocean far below and the sun sitting on the horizon.
 */
export function createCliffsideSet(): Group {
  const root = new Group();
  root.name = 'CliffsideSet';
  const rand = seededRandom(111);

  // Deck: planks running across, posts down into the rock.
  const boards = plankTexture([150, 110, 76], 10, 112);
  boards.repeat.set(1, 1);
  put(root, 'Deck', new BoxGeometry(5, 0.12, 4.2), mat(0xffffff, { map: boards, rough: 0.8 }), [0, -0.06, -0.4]);
  const wood = mat(0x6a4a32, { rough: 0.9 });
  const railPosts: Placement[] = [];
  for (const x of [-2.4, -1.2, 0, 1.2, 2.4]) railPosts.push({ pos: [x, 0, -2.4] });
  for (const z of [-1.2, 0, 1.2]) railPosts.push({ pos: [-2.4, 0, z] }, { pos: [2.4, 0, z] });
  const postGeo = new BoxGeometry(0.1, 1, 0.1);
  postGeo.translate(0, 0.5, 0);
  instances(root, 'RailPosts', postGeo, wood, railPosts);
  put(root, 'RailFront', new BoxGeometry(4.9, 0.08, 0.12), wood, [0, 1, -2.4]);
  put(root, 'RailLeft', new BoxGeometry(0.12, 0.08, 3.7), wood, [-2.4, 1, -0.55]);
  put(root, 'RailRight', new BoxGeometry(0.12, 0.08, 3.7), wood, [2.4, 1, -0.55]);
  put(root, 'Lantern', new CylinderGeometry(0.08, 0.1, 0.22, 8), mat(0xffd28a, { emissive: 0xffb050, glow: 2 }), [2.4, 1.15, -2.4]);

  // The cliff: a rough rocky headland behind and below the deck.
  const rock = mat(0xffffff, { map: noiseTexture([108, 94, 84], 40, 113), rough: 1 });
  const boulders: Placement[] = [];
  for (let i = 0; i < 70; i++) {
    const x = (rand() - 0.5) * 40;
    const z = -2 + rand() * 40;
    const s = 4 + rand() * 7;
    // Keep every boulder's crown below the deck.
    const y = -1 - s * 0.9 - rand() * 30;
    boulders.push({ pos: [x, y, z + s * 0.4], rotDeg: [rand() * 90, rand() * 360, rand() * 90], scale: [s, s * 0.9, s] });
  }
  // A cap layer flush under the deck so the top reads as solid ground.
  for (let i = 0; i < 24; i++) {
    const x = (rand() - 0.5) * 34;
    const z = 1 + rand() * 30;
    boulders.push({ pos: [x, -2.1 - rand() * 1.5, z], rotDeg: [0, rand() * 360, 0], scale: [5, 1.8, 5] });
  }
  boulders.push({ pos: [0, -2.6, 0], scale: [4, 2.5, 3.4] });
  instances(root, 'Cliff', new DodecahedronGeometry(1, 1), rock, boulders);
  const grass = mat(0xffffff, { map: noiseTexture([96, 112, 58], 30, 114), rough: 1 });
  put(root, 'Clifftop', new CylinderGeometry(22, 22, 0.4, 32, 1, false, -Math.PI / 2, Math.PI), grass, [0, -0.45, 2.2]);
  // Sea stacks out in the water.
  instances(root, 'SeaStacks', new DodecahedronGeometry(1, 1), rock, [
    { pos: [-26, -42, -60], scale: [6, 18, 6] },
    { pos: [-18, -44, -48], scale: [3, 9, 3] },
    { pos: [34, -42, -90], scale: [8, 16, 7] },
  ]);
  disc(root, 'Ocean', 195, mat(0x2a3c5a, { rough: 0.12, metal: 0.3 }), -45);
  skyBody(root, 'Sun', [0, -38, -185], 14, 0xffd890, 0xff7a3a, 4);
  return root;
}
