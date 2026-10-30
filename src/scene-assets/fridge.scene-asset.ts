import { BoxGeometry, CylinderGeometry, ExtrudeGeometry, Group, LatheGeometry, Shape, SphereGeometry, Vector2 } from '@iwsdk/core';
import { block, glow, instances, mat, type Placement, put, room, sign } from './lib/set-kit.js';

/**
 * Inside a fridge: the player is tiny on a glass shelf in a white plastic
 * cavern with a towering milk carton, a wobbly green jelly and an egg tray,
 * lit by a cold glow and one bulb in the corner.
 */
export function createFridgeSet(): Group {
  const root = new Group();
  root.name = 'FridgeSet';
  const plastic = mat(0xf2f6f8, { rough: 0.35 });
  room(root, 'Cavity', [22, 26, 18], plastic, plastic, plastic, [0, -6]).position.y = -12;

  // The glass shelf underfoot, front lip toward the door behind the player.
  const glass = mat(0xd8f0ff, { rough: 0.05, metal: 0.1 });
  glass.transparent = true;
  glass.opacity = 0.35;
  put(root, 'Shelf', new BoxGeometry(22, 0.3, 18), glass, [0, -0.15, -6]);
  put(root, 'ShelfLip', new BoxGeometry(22, 0.6, 0.3), mat(0xe0e6ea, { rough: 0.3 }), [0, -0.1, 2.9]);
  put(root, 'LowerShelf', new BoxGeometry(22, 0.3, 18), glass, [0, -8, -6]);
  // Ribs on the back and side walls.
  const ribs: Placement[] = [];
  for (let y = -10; y < 14; y += 2.4) for (const x of [-10.95, 10.95]) ribs.push({ pos: [x, y, -6] });
  instances(root, 'Ribs', new BoxGeometry(0.2, 0.25, 17.6), plastic, ribs);

  // Milk carton, left: a tall box with a gable top.
  const carton = new Group();
  carton.name = 'MilkCarton';
  carton.position.set(-5.5, 0, -8);
  carton.rotation.y = 0.25;
  root.add(carton);
  const paper = mat(0xf8f8f4, { rough: 0.7 });
  block(carton, 'Body', [4, 9, 4], paper, [0, 0, 0]);
  const gable = new Shape();
  gable.moveTo(-2, 0);
  gable.lineTo(2, 0);
  gable.lineTo(0, 1.6);
  const roof = new ExtrudeGeometry(gable, { depth: 4, bevelEnabled: false });
  roof.translate(0, 0, -2);
  put(carton, 'Gable', roof, paper, [0, 9, 0]);
  block(carton, 'Fin', [0.2, 0.6, 4.2], paper, [0, 10.4, 0]);
  block(carton, 'Band', [4.02, 2.2, 4.02], mat(0x2a6ad8, { rough: 0.6 }), [0, 4.5, 0]);
  sign(carton, 'Label', 'MILK', 1.2, [255, 255, 255], [42, 106, 216, 255], [0, 5.1, 2.02]);

  // Jelly on a plate, center-right: a fluted lathe, translucent green.
  const jelly = mat(0x4ad85a, { rough: 0.15, emissive: 0x1a6a2a, glow: 0.5 });
  jelly.transparent = true;
  jelly.opacity = 0.8;
  const pts: Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push(new Vector2(2.6 - t * 0.9 + Math.sin(t * Math.PI * 3) * 0.15, t * 2.6));
  }
  pts.push(new Vector2(0, 2.6));
  put(root, 'Jelly', new LatheGeometry(pts, 32), jelly, [3.2, 0.12, -6]);
  put(root, 'Plate', new CylinderGeometry(3.4, 3.2, 0.12, 48), mat(0xffffff, { rough: 0.2 }), [3.2, 0.06, -6]);
  put(root, 'Cherry', new SphereGeometry(0.45, 20, 14), mat(0xd8102a, { rough: 0.2 }), [3.2, 3.1, -6]);

  // Egg tray, front right.
  const tray = new Group();
  tray.name = 'EggTray';
  tray.position.set(5.5, 0, -1.8);
  tray.rotation.y = -0.4;
  root.add(tray);
  block(tray, 'Tray', [5.2, 0.5, 2.6], mat(0xd8d0c0, { rough: 1 }), [0, 0, 0]);
  const eggs: Placement[] = [];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) if (!(i === 4 && j === 1)) eggs.push({ pos: [-2.1 + i * 0.84, 0.9, -0.6 + j * 1.2], scale: [1, 1.3, 1] });
  instances(tray, 'Eggs', new SphereGeometry(0.4, 20, 14), mat(0xf4e2c8, { rough: 0.5 }), eggs);

  // The light: a bulb behind a frosted cover, top right.
  put(root, 'LightCover', new BoxGeometry(3, 1.2, 0.4), glow(0xe8f4ff), [7, 12, -14.8]);
  block(root, 'Butter', [2.4, 1, 1.2], mat(0xf8e080, { rough: 0.6 }), [-1.2, 0, -12]);
  return root;
}
