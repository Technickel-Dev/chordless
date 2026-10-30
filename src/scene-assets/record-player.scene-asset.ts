import { BoxGeometry, CylinderGeometry, Group, SphereGeometry } from '@iwsdk/core';
import { block, instances, mat, plankTexture, post, put, ringTexture, room, span } from './lib/set-kit.js';

/**
 * Giant record player: the player rides on the grooves of a huge black vinyl
 * record, the red label and spindle beside them, the silver tonearm looming
 * overhead with its needle in the groove ahead, on a wooden turntable in a
 * dim, cozy room.
 */
export function createRecordPlayerSet(): Group {
  const root = new Group();
  root.name = 'RecordPlayerSet';
  // The record's center is 6 m to the right so the player stands mid-groove.
  const cx = 6;
  const cz = -1;
  const recordR = 10;
  const grooves = ringTexture([[34, 34, 38], [58, 58, 64], [42, 42, 48], [76, 76, 84]], 120, 512);
  put(root, 'Record', new CylinderGeometry(recordR, recordR, 0.2, 128), mat(0xffffff, { map: grooves, rough: 0.25, metal: 0.3 }), [cx, -0.1, cz]);
  // Cylinder caps map UVs planar across the top, so the rings sit concentric.
  put(root, 'Label', new CylinderGeometry(2.4, 2.4, 0.22, 64), mat(0xc82a2a, { rough: 0.7 }), [cx, -0.09, cz]);
  put(root, 'LabelRing', new CylinderGeometry(1.2, 1.2, 0.23, 48), mat(0xf2d8a0, { rough: 0.7 }), [cx, -0.09, cz]);
  const steel = mat(0xd8dce0, { metal: 0.95, rough: 0.2 });
  post(root, 'Spindle', 0.18, 1, steel, [cx, 0, cz], 0.16, 24);
  put(root, 'Platter', new CylinderGeometry(recordR + 0.3, recordR + 0.3, 0.8, 128), mat(0x3a3e44, { metal: 0.8, rough: 0.35 }), [cx, -0.6, cz]);
  const strobe: number[] = [];
  for (let i = 0; i < 120; i++) strobe.push(i);
  instances(root, 'StrobeDots', new BoxGeometry(0.12, 0.12, 0.02), mat(0xc8ccd2, { metal: 0.9 }), strobe.map((i) => {
    const a = (i / 120) * Math.PI * 2;
    return { pos: [cx + Math.sin(a) * (recordR + 0.31), -0.6, cz + Math.cos(a) * (recordR + 0.31)], rotDeg: [0, (a * 180) / Math.PI, 0] };
  }));

  // Plinth: a walnut slab under it all.
  const walnut = plankTexture([96, 60, 36], 6, 591);
  block(root, 'Plinth', [30, 3, 26], mat(0xffffff, { map: walnut, rough: 0.45 }), [cx + 3, -4, cz - 1]);

  // Tonearm: pivot base at the back right, arm reaching over to the needle
  // in the groove ahead of the player.
  const pivot: [number, number, number] = [cx + 11, 0, cz - 9];
  post(root, 'ArmBase', 1.2, 1.6, steel, [pivot[0], -1, pivot[2]], 1.4, 32);
  put(root, 'ArmPivot', new SphereGeometry(0.7, 24, 16), steel, [pivot[0], 1.2, pivot[2]]);
  const elbow: [number, number, number] = [cx - 1, 2.2, cz - 10.5];
  const head: [number, number, number] = [-1.4, 1.2, -6.4];
  instances(root, 'Arm', new CylinderGeometry(1, 1, 1, 16), steel, [span([pivot[0], 1.2, pivot[2]], elbow, 0.18), span(elbow, head, 0.18)]);
  put(root, 'Counterweight', new CylinderGeometry(0.8, 0.8, 1.4, 24), mat(0x2a2a2e, { metal: 0.7 }), [pivot[0] + 1.8, 1.2, pivot[2] - 0.6], [0, 0, 90]);
  put(root, 'Headshell', new BoxGeometry(1.2, 0.3, 1.8), mat(0x2a2a2e, { metal: 0.6 }), [head[0], head[1], head[2]], [0, 30, 0]);
  put(root, 'Cartridge', new BoxGeometry(0.6, 0.8, 0.9), mat(0xd83a2a, { rough: 0.4 }), [head[0], head[1] - 0.5, head[2]], [0, 30, 0]);
  post(root, 'Stylus', 0.03, 0.4, steel, [head[0], 0, head[2]], 0.005, 8);
  post(root, 'ArmRest', 0.25, 2, steel, [cx + 12, 0, cz - 2]);

  // The room beyond: dark walls, warm lamplight.
  room(root, 'Den', [180, 90, 180], mat(0x3a2a24, { rough: 1 }), mat(0x2a1e18, { rough: 1 }), mat(0x1a1412), [0, -10]).position.y = -40;
  block(root, 'Speaker', [14, 30, 12], mat(0x2a1e16, { rough: 0.6 }), [-40, -40, -60]);
  put(root, 'Woofer', new CylinderGeometry(5, 5, 0.6, 48), mat(0x111111, { rough: 0.8 }), [-40, -18, -53.7], [90, 0, 0]);
  return root;
}
