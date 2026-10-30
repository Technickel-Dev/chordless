import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, TorusGeometry } from '@iwsdk/core';
import { block, glow, instances, mat, plankTexture, post, put, room, sign, span } from './lib/set-kit.js';
import { pixelTexture } from './lib/theatre-kit.js';

/** Lined notebook paper: pale blue rules and a red margin. */
function ruledPaper(size = 256) {
  const px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let c = [246, 244, 236];
      if (y % 16 === 0) c = [150, 180, 230];
      if (x >= 30 && x <= 31) c = [230, 120, 120];
      px.set([c[0], c[1], c[2], 255], (y * size + x) * 4);
    }
  }
  return pixelTexture(size, px);
}

/**
 * Giant's desk: the player stands on the pages of an open notebook, with a
 * fallen pencil the size of a log, a pink eraser, a steaming mug and a desk
 * lamp glowing over it all.
 */
export function createGiantDeskSet(): Group {
  const root = new Group();
  root.name = 'GiantDeskSet';
  const wood = plankTexture([120, 80, 50], 5, 371);
  block(root, 'Desk', [60, 2, 40], mat(0xffffff, { map: wood, rough: 0.5 }), [0, -2.5, -8]);
  room(root, 'Study', [200, 120, 200], mat(0x5a6a7a), mat(0x3a2a20), mat(0x2a2a30), [0, -10]).position.y = -60;

  // Notebook: two pages, a spine dip and a cover edge.
  const paper = ruledPaper();
  paper.repeat.set(2, 3);
  const pages = mat(0xffffff, { map: paper, rough: 0.9 });
  for (const s of [-1, 1]) {
    put(root, 'Page', new BoxGeometry(7, 0.4, 9.5), pages, [s * 3.6, -0.2, -2.5], [0, 0, s * 2]);
  }
  block(root, 'Cover', [14.8, 0.15, 10], mat(0x2a4a8a, { rough: 0.6 }), [0, -0.5, -2.5]);
  for (let i = 0; i < 18; i++) put(root, 'Ring', new TorusGeometry(0.35, 0.05, 6, 20), mat(0xc8ccd2, { metal: 0.9, rough: 0.25 }), [0, 0.05, -7 + i * 0.5]);

  // Pencil lying across the desk ahead.
  const pencil = new Group();
  pencil.name = 'Pencil';
  pencil.position.set(1, 0.6, -10);
  pencil.rotation.y = 0.35;
  root.add(pencil);
  put(pencil, 'Barrel', new CylinderGeometry(0.6, 0.6, 14, 6), mat(0xf2c42a, { rough: 0.5 }), [0, 0, 0], [0, 0, 90]);
  put(pencil, 'Wood', new ConeGeometry(0.6, 1.6, 6), mat(0xe8c89a, { rough: 0.8 }), [-7.8, 0, 0], [0, 0, 90]);
  put(pencil, 'Lead', new ConeGeometry(0.2, 0.55, 6), mat(0x2a2a2c, { metal: 0.4 }), [-8.6, 0, 0], [0, 0, 90]);
  put(pencil, 'Ferrule', new CylinderGeometry(0.62, 0.62, 0.9, 16), mat(0xc8ccd2, { metal: 0.9, rough: 0.3 }), [7.45, 0, 0], [0, 0, 90]);
  put(pencil, 'Eraser', new CylinderGeometry(0.58, 0.58, 0.9, 16), mat(0xf28aa0, { rough: 0.8 }), [8.3, 0, 0], [0, 0, 90]);
  sign(pencil, 'Brand', 'NO. 2', 0.5, [30, 30, 30], [242, 196, 42, 255], [2, 0.3, 0.52], [0, 0, 0]);

  // Eraser block and mug.
  block(root, 'Eraser', [3, 1.4, 1.6], mat(0xf6a0b0, { rough: 0.9 }), [-7, 0, -6], 20);
  const mug = new Group();
  mug.name = 'Mug';
  mug.position.set(-8, 0, -15);
  root.add(mug);
  post(mug, 'Body', 2.6, 6, mat(0xd8402a, { rough: 0.4 }), [0, 0, 0], 2.8, 40);
  put(mug, 'Coffee', new CylinderGeometry(2.6, 2.6, 0.05, 40), mat(0x3a2010, { rough: 0.1 }), [0, 5.4, 0]);
  put(mug, 'Handle', new TorusGeometry(1.4, 0.35, 12, 32, Math.PI), mat(0xd8402a, { rough: 0.4 }), [2.7, 3, 0], [0, 0, -90]);
  // Desk lamp: base, arm and a glowing shade.
  const lamp = new Group();
  lamp.name = 'DeskLamp';
  lamp.position.set(10, 0, -18);
  root.add(lamp);
  const steel = mat(0x2a2c30, { metal: 0.7, rough: 0.35 });
  post(lamp, 'Base', 2.6, 0.6, steel, [0, 0, 0]);
  instances(lamp, 'Arms', new CylinderGeometry(0.2, 0.2, 1, 10), steel, [span([0, 0.6, 0], [-3, 11.8, 0]), span([-3, 11.8, 0], [-9.8, 13.2, 0])]);
  // The shade's apex meets the arm tip; it tips down toward the notebook.
  put(lamp, 'Shade', new ConeGeometry(3, 3.4, 24, 1, true), mat(0x2a2c30, { metal: 0.6, double: true }), [-10.65, 11.73, 0], [0, 0, -30]);
  put(lamp, 'Bulb', new CylinderGeometry(1.2, 1.2, 0.2, 24), glow(0xfff2d0), [-11.2, 10.7, 0], [0, 0, -30]);
  return root;
}
