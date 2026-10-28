import { BoxGeometry, CylinderGeometry, Group, SphereGeometry } from '@iwsdk/core';
import { block, glow, instances, mat, noiseTexture, type Placement, post, put, room, sign } from './lib/set-kit.js';

/**
 * Office break room: a glowing vending machine, a water cooler and a framed
 * motivational poster, under fluorescent panels on grey carpet.
 */
export function createBreakRoomSet(): Group {
  const root = new Group();
  root.name = 'BreakRoomSet';
  const carpet = noiseTexture([104, 108, 116], 30, 71);
  carpet.repeat.set(10, 10);
  room(root, 'Room', [7, 2.7, 7], mat(0xdcd3c0), mat(0xffffff, { map: carpet, rough: 1 }), mat(0xeeeeea), [0, -1.4]);

  // Vending machine against the back wall, left of center.
  const vend = new Group();
  vend.name = 'VendingMachine';
  vend.position.set(-1.6, 0, -4.45);
  root.add(vend);
  block(vend, 'Cabinet', [1, 1.85, 0.8], mat(0xb3262a, { rough: 0.4 }), [0, 0, 0]);
  block(vend, 'Window', [0.66, 1.3, 0.02], glow(0xd8ecff, 0.9), [-0.1, 0.42, 0.4]);
  const snacks: Placement[] = [];
  const colors = [0xffcc33, 0x3a7ad9, 0xe84a4a, 0x4fbf5a, 0xff8c2a, 0x9a4ad9];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      snacks.push({ pos: [-0.36 + col * 0.13, 0.55 + row * 0.25, 0.37], color: colors[(row * 2 + col) % colors.length] });
    }
  }
  const snack = new BoxGeometry(0.1, 0.15, 0.04);
  snack.translate(0, 0.075, 0);
  instances(vend, 'Snacks', snack, mat(0xffffff, { rough: 0.5 }), snacks);
  const shelf: Placement[] = [];
  for (let row = 0; row < 5; row++) shelf.push({ pos: [-0.1, 0.53 + row * 0.25, 0.36] });
  instances(vend, 'Shelves', new BoxGeometry(0.64, 0.015, 0.06), mat(0x9aa0a6, { metal: 0.7 }), shelf);
  block(vend, 'Keypad', [0.18, 0.4, 0.03], mat(0x2a2c30), [0.36, 1, 0.4]);
  block(vend, 'Slot', [0.6, 0.16, 0.03], mat(0x111111), [-0.1, 0.16, 0.4]);
  sign(vend, 'Brand', 'SNAX', 0.16, [255, 255, 255], [179, 38, 42, 255], [0, 1.72, 0.41]);

  // Water cooler, right of center.
  const cooler = new Group();
  cooler.name = 'WaterCooler';
  cooler.position.set(1.4, 0, -4.55);
  root.add(cooler);
  block(cooler, 'Base', [0.36, 1, 0.36], mat(0xeeeeea, { rough: 0.4 }), [0, 0, 0]);
  block(cooler, 'Tray', [0.22, 0.03, 0.1], mat(0x777777), [0, 0.6, 0.2]);
  put(cooler, 'TapCold', new BoxGeometry(0.04, 0.05, 0.05), mat(0x3a7ad9), [-0.05, 0.82, 0.2]);
  put(cooler, 'TapHot', new BoxGeometry(0.04, 0.05, 0.05), mat(0xd93a3a), [0.05, 0.82, 0.2]);
  const water = mat(0x6ab8ee, { rough: 0.05 });
  water.transparent = true;
  water.opacity = 0.6;
  post(cooler, 'Bottle', 0.15, 0.42, water, [0, 1.02, 0], 0.15, 24);
  put(cooler, 'BottleShoulder', new SphereGeometry(0.15, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), water, [0, 1.44, 0]);
  put(cooler, 'BottleNeck', new CylinderGeometry(0.05, 0.05, 0.06, 16), water, [0, 1.0, 0]);
  instances(cooler, 'Cups', new CylinderGeometry(0.035, 0.025, 0.08, 12), mat(0xffffff), [
    { pos: [0.24, 0.94, 0.12] },
    { pos: [0.24, 1.02, 0.12] },
  ]);

  // Motivational poster between them.
  put(root, 'PosterFrame', new BoxGeometry(1.06, 1.36, 0.03), mat(0x1a1a1a), [0, 1.6, -4.88]);
  put(root, 'PosterSky', new BoxGeometry(0.96, 0.86, 0.01), mat(0x3a5f9a, { emissive: 0x3a5f9a, glow: 0.2 }), [0, 1.78, -4.86]);
  put(root, 'PosterPeak', new CylinderGeometry(0, 0.32, 0.5, 3), mat(0xeef2f6), [0, 1.6, -4.85], [90, 0, 0]);
  sign(root, 'PosterText', 'TEAMWORK\nIT IS MONDAY AGAIN', 0.3, [255, 255, 255], [26, 26, 26, 255], [0, 1.13, -4.85]);
  put(root, 'Clock', new CylinderGeometry(0.18, 0.18, 0.04, 32), mat(0xf6f6f0), [-3.48, 2.1, -2], [0, 0, 90]);

  // Fluorescent panels.
  const panels: Placement[] = [];
  for (const x of [-1.6, 1.6]) for (const z of [-3.5, -0.5]) panels.push({ pos: [x, 2.69, z] });
  instances(root, 'CeilingPanels', new BoxGeometry(1.2, 0.02, 0.6), glow(0xf1fbff), panels);
  return root;
}
