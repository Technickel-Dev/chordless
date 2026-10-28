import { BoxGeometry, ConeGeometry, Group, SphereGeometry } from '@iwsdk/core';
import {
  arc,
  block,
  glow,
  instances,
  mat,
  type Placement,
  put,
  room,
  seededRandom,
  sign,
  tileTexture,
} from './lib/set-kit.js';

/**
 * Dentist's waiting room: a row of stiff chairs facing the player, a glowing
 * fish tank on a cabinet and a grid of fluorescent ceiling panels.
 */
export function createDentistSet(): Group {
  const root = new Group();
  root.name = 'DentistSet';
  const rand = seededRandom(41);
  const lino = tileTexture([214, 220, 212], [168, 186, 182], 8);
  lino.repeat.set(4, 4);
  room(root, 'Room', [8, 2.7, 8], mat(0xc9dfd6), mat(0xffffff, { map: lino, rough: 0.35 }), mat(0xeeeeea), [0, -1.6]);
  put(root, 'Wainscot', new BoxGeometry(8, 0.9, 0.02), mat(0x9fbfb4), [0, 0.45, -5.58]);
  put(root, 'Chairline', new BoxGeometry(8, 0.06, 0.04), mat(0x6f8f86), [0, 0.92, -5.57]);

  // Chairs: tubular frame, teal vinyl seat and back, in a shallow arc.
  const chairs = arc(7, 4.2, -42, 42).map((p): Placement => ({ pos: p.pos, rotDeg: p.rotDeg }));
  const vinyl = mat(0x2f7f86, { rough: 0.45 });
  const chrome = mat(0xc8ccd0, { metal: 0.9, rough: 0.25 });
  const seat = new BoxGeometry(0.5, 0.07, 0.48);
  seat.translate(0, 0.46, 0);
  instances(root, 'ChairSeats', seat, vinyl, chairs);
  const back = new BoxGeometry(0.5, 0.42, 0.06);
  back.translate(0, 0.78, -0.24);
  instances(root, 'ChairBacks', back, vinyl, chairs);
  const legs: Placement[] = [];
  for (const c of chairs) {
    const a = (c.rotDeg![1] * Math.PI) / 180;
    for (const [lx, lz] of [[-0.22, -0.2], [0.22, -0.2], [-0.22, 0.2], [0.22, 0.2]]) {
      legs.push({ pos: [c.pos[0] + lx * Math.cos(a) + lz * Math.sin(a), 0, c.pos[2] - lx * Math.sin(a) + lz * Math.cos(a)] });
    }
  }
  const leg = new BoxGeometry(0.03, 0.44, 0.03);
  leg.translate(0, 0.22, 0);
  instances(root, 'ChairLegs', leg, chrome, legs);
  // A side table with a stack of old magazines.
  block(root, 'SideTable', [0.6, 0.45, 0.45], mat(0xb89a70), [0, 0, -4.6]);
  for (let i = 0; i < 4; i++) {
    put(root, 'Magazine', new BoxGeometry(0.22, 0.012, 0.29), mat([0xd94a4a, 0x4a7ad9, 0xe8c24a, 0x6abf69][i]), [
      (rand() - 0.5) * 0.12,
      0.457 + i * 0.013,
      -4.6 + (rand() - 0.5) * 0.08,
    ], [0, (rand() - 0.5) * 40, 0]);
  }

  // Fish tank on a cabinet against the left wall.
  const tank = new Group();
  tank.name = 'FishTank';
  tank.position.set(-3.6, 0, -2.6);
  tank.rotation.y = Math.PI / 2;
  root.add(tank);
  block(tank, 'Cabinet', [1.3, 0.8, 0.5], mat(0x5d4636), [0, 0, 0]);
  block(tank, 'Water', [1.2, 0.58, 0.42], glow(0x3fa8d8, 0.55), [0, 0.84, 0]);
  block(tank, 'Gravel', [1.2, 0.05, 0.42], mat(0xd8c08a), [0, 0.81, 0]);
  block(tank, 'Lid', [1.26, 0.05, 0.48], mat(0x222428), [0, 1.42, 0]);
  const glass = mat(0xbfe8ff, { rough: 0.05 });
  glass.transparent = true;
  glass.opacity = 0.18;
  glass.depthWrite = false;
  block(tank, 'Glass', [1.24, 0.62, 0.46], glass, [0, 0.8, 0]);
  const weeds: Placement[] = [];
  for (let i = 0; i < 9; i++) {
    weeds.push({ pos: [-0.5 + rand() * 1, 0.86, (rand() - 0.5) * 0.3], scale: [1, 0.6 + rand() * 0.7, 1] });
  }
  const weed = new ConeGeometry(0.03, 0.4, 5);
  weed.translate(0, 0.2, 0);
  instances(tank, 'Weeds', weed, mat(0x3f9a4a), weeds);
  const bubbles: Placement[] = [];
  for (let i = 0; i < 14; i++) bubbles.push({ pos: [0.38 + (rand() - 0.5) * 0.04, 0.9 + i * 0.035, 0.05], scale: 0.4 + rand() * 0.6 });
  instances(tank, 'Bubbles', new SphereGeometry(0.012, 8, 6), glow(0xe8fbff, 0.8), bubbles);
  put(tank, 'Castle', new BoxGeometry(0.14, 0.18, 0.12), mat(0x9a9088), [-0.3, 0.93, 0.05]);

  // Fluorescent ceiling panels in a 2 x 3 grid.
  const panels: Placement[] = [];
  for (const x of [-2, 2]) for (const z of [-4, -1.2, 1.4]) panels.push({ pos: [x, 2.69, z] });
  instances(root, 'CeilingPanels', new BoxGeometry(1.2, 0.02, 0.6), glow(0xf1fbff), panels);

  sign(root, 'Sign', 'PLEASE TAKE\nA NUMBER', 0.45, [40, 60, 64], [240, 244, 240, 255], [2.4, 1.7, -5.56]);
  sign(root, 'NowServing', 'NOW SERVING 47', 0.18, [255, 70, 60], [20, 20, 20, 255], [-2.2, 2.2, -5.56], [0, 0, 0], true);
  return root;
}
