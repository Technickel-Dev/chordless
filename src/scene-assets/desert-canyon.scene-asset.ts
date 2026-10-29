import { BoxGeometry, CylinderGeometry, DodecahedronGeometry, Group } from '@iwsdk/core';
import { bandTexture, disc, instances, mat, noiseTexture, type Placement, seededRandom, stars } from './lib/set-kit.js';

/**
 * Desert canyon: a sandy wash between two tall walls of banded red rock that
 * run off ahead and behind, a mesa closing the view, under a dusk sky.
 */
export function createDesertCanyonSet(): Group {
  const root = new Group();
  root.name = 'DesertCanyonSet';
  const rand = seededRandom(161);

  const sand = noiseTexture([206, 140, 90], 30, 162);
  sand.repeat.set(50, 50);
  disc(root, 'Wash', 190, mat(0xffffff, { map: sand, rough: 1 }), 0);

  // Canyon walls: columns of banded rock of uneven height and set-back.
  const strata = bandTexture([[176, 84, 52], [196, 112, 70], [150, 66, 44], [214, 150, 100], [128, 58, 40]], 14, 163);
  const rock = mat(0xffffff, { map: strata, rough: 0.95 });
  const columns: Placement[] = [];
  for (const side of [-1, 1]) {
    for (let z = -150; z < 60; z += 5 + rand() * 3) {
      const near = Math.abs(z) < 20;
      const x = side * ((near ? 8.5 : 10) + rand() * 4 + Math.max(0, -z - 60) * 0.12);
      const h = 18 + rand() * 16;
      const w = 6 + rand() * 5;
      columns.push({ pos: [x + side * w * 0.4, 0, z], rotDeg: [0, (rand() - 0.5) * 20, 0], scale: [w, h, 6 + rand() * 4] });
    }
  }
  const column = new BoxGeometry(1, 1, 1);
  column.translate(0, 0.5, 0);
  instances(root, 'CanyonWalls', column, rock, columns);
  // A mesa far ahead and a butte behind.
  const mesa = new CylinderGeometry(1, 1.15, 1, 9);
  mesa.translate(0, 0.5, 0);
  instances(root, 'Mesas', mesa, rock, [
    { pos: [-10, 0, -175], scale: [40, 34, 22] },
    { pos: [6, 0, 120], scale: [18, 40, 18] },
  ]);
  // Fallen boulders along the wall feet.
  const boulders: Placement[] = [];
  for (let i = 0; i < 40; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const s = 0.4 + rand() * 1.6;
    boulders.push({ pos: [side * (5 + rand() * 4), s * 0.3, -80 + rand() * 120], rotDeg: [rand() * 90, rand() * 360, 0], scale: [s, s * 0.7, s] });
  }
  instances(root, 'Boulders', new DodecahedronGeometry(1, 0), mat(0xffffff, { map: noiseTexture([150, 80, 52], 40, 164) }), boulders);
  // Scrub bushes.
  const bushes: Placement[] = [];
  for (let i = 0; i < 30; i++) {
    const x = (rand() - 0.5) * 12;
    const z = -60 + rand() * 90;
    if (Math.hypot(x, z) < 3) continue;
    bushes.push({ pos: [x, 0.1, z], scale: [0.4 + rand() * 0.5, 0.25 + rand() * 0.3, 0.4 + rand() * 0.5] });
  }
  instances(root, 'Scrub', new DodecahedronGeometry(1, 1), mat(0x7a7a48, { rough: 1 }), bushes);
  stars(root, 400, 185, 165, 0.35, 1.5);
  return root;
}
