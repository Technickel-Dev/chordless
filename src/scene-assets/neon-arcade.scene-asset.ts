import { BoxGeometry, CylinderGeometry, Group, SphereGeometry } from '@iwsdk/core';
import { blobTexture, glow, instances, mat, type Placement, put, room, seededRandom, sign } from './lib/set-kit.js';

/**
 * Neon arcade: two rows of glowing cabinets facing each other down an aisle
 * of cosmic carpet, marquees lit in every color, a neon grid on the ceiling
 * and a prize counter at the far end.
 */
export function createNeonArcadeSet(): Group {
  const root = new Group();
  root.name = 'NeonArcadeSet';
  const rand = seededRandom(541);
  const carpet = blobTexture([20, 14, 40], [[230, 60, 170], [60, 200, 240], [250, 220, 60], [120, 80, 240]], 120, 3, 542);
  carpet.repeat.set(6, 10);
  room(root, 'Hall', [12, 3.6, 22], mat(0x18122a, { rough: 0.9 }), mat(0xffffff, { map: carpet, rough: 1 }), mat(0x0a0814), [0, -8]);

  // Cabinets: body, a lit screen, a marquee and a control deck.
  const hues = [0xff3a8a, 0x3ad8ff, 0xffd23a, 0x8a5aff, 0x5aff8a, 0xff7a3a];
  const cabs: Placement[] = [];
  const screens: Placement[] = [];
  const marquees: Placement[] = [];
  const decks: Placement[] = [];
  const buttons: Placement[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const z = -1.5 - i * 1.6;
      const x = side * 4.6;
      const yaw = side * -90;
      const c = hues[(i + (side > 0 ? 3 : 0)) % hues.length];
      cabs.push({ pos: [x, 0, z], rotDeg: [0, yaw, 0] });
      screens.push({ pos: [x - side * 0.36, 1.35, z], rotDeg: [0, yaw, 0], color: [0x3a8aff, 0x8aff8a, 0xff8a3a, 0xc8a8ff][i % 4] });
      marquees.push({ pos: [x - side * 0.38, 1.95, z], rotDeg: [0, yaw, 0], color: c });
      decks.push({ pos: [x - side * 0.5, 0.95, z], rotDeg: [0, yaw, 0] });
      for (let b = 0; b < 3; b++) buttons.push({ pos: [x - side * 0.62, 1.0, z - 0.15 + b * 0.12], color: hues[(b + i) % hues.length] });
    }
  }
  instances(root, 'Cabinets', new BoxGeometry(0.75, 2.1, 0.8).translate(0, 1.05, 0), mat(0x14141c, { rough: 0.4 }), cabs);
  instances(root, 'Screens', new BoxGeometry(0.55, 0.45, 0.02), glow(0xffffff), screens);
  instances(root, 'Marquees', new BoxGeometry(0.7, 0.24, 0.03), glow(0xffffff), marquees);
  instances(root, 'ControlDecks', new BoxGeometry(0.72, 0.06, 0.34), mat(0x2a2a36, { rough: 0.4 }), decks);
  instances(root, 'Buttons', new CylinderGeometry(0.025, 0.025, 0.02, 10), glow(0xffffff), buttons);
  instances(root, 'Joysticks', new SphereGeometry(0.03, 10, 8), mat(0xd82a2a), cabs.map((c, i) => ({ pos: [c.pos[0] * 0.87, 1.06, c.pos[2] + 0.16 * (i % 2 ? 1 : -1)] })));

  // Neon ceiling grid and floor strips.
  const crossBars: Placement[] = [];
  for (let z = 2; z > -19; z -= 2.2) crossBars.push({ pos: [0, 3.55, z], color: hues[Math.floor(rand() * hues.length)] });
  instances(root, 'NeonGrid', new BoxGeometry(11.6, 0.04, 0.04), glow(0xffffff), crossBars);
  instances(root, 'NeonRails', new BoxGeometry(0.04, 0.04, 21.6), glow(0x8a5aff), [-3, 0, 3].map((x): Placement => ({ pos: [x, 3.55, -8] })));
  instances(root, 'FloorStrips', new BoxGeometry(0.06, 0.01, 20), glow(0xff3a8a), [{ pos: [-3.9, 0.005, -8] }, { pos: [3.9, 0.005, -8] }]);

  // Prize counter at the far end.
  put(root, 'Counter', new BoxGeometry(6, 1.1, 0.8), mat(0x2a1a4a, { rough: 0.4 }), [0, 0.55, -17.4]);
  put(root, 'CounterGlass', new BoxGeometry(5.8, 0.6, 0.6), glow(0x3ad8ff, 0.35), [0, 0.8, -17.4]);
  const prizes: Placement[] = [];
  for (let i = 0; i < 20; i++) prizes.push({ pos: [-2.6 + (i % 10) * 0.58, 1.5 + Math.floor(i / 10) * 0.6, -18.7], scale: 0.2 + rand() * 0.1, color: hues[i % hues.length] });
  instances(root, 'Prizes', new SphereGeometry(1, 12, 10), mat(0xffffff, { rough: 0.8 }), prizes);
  sign(root, 'Sign', 'ARCADE', 0.9, [255, 60, 170], [0, 0, 0, 0], [0, 2.7, -18.96], [0, 0, 0], true);
  sign(root, 'Tickets', 'PRIZES 4 TICKETS', 0.3, [60, 220, 255], [0, 0, 0, 0], [0, 2.1, -18.96], [0, 0, 0], true);
  return root;
}
