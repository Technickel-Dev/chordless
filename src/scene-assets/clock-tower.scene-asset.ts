import { BoxGeometry, CircleGeometry, CylinderGeometry, ExtrudeGeometry, Group, Path, Shape, SphereGeometry } from '@iwsdk/core';
import { block, brickTexture, clockFaceTexture, glow, mat, plankTexture, post, put, room } from './lib/set-kit.js';

/** A spur gear in the XY plane, `thickness` deep along +Z. */
function gear(radius: number, teeth: number, thickness: number): ExtrudeGeometry {
  const shape = new Shape();
  const toothDepth = Math.min(0.25, radius * 0.12);
  for (let i = 0; i < teeth * 4; i++) {
    const a = (i / (teeth * 4)) * Math.PI * 2;
    const r = i % 4 < 2 ? radius : radius - toothDepth;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const hub = new Path();
  hub.absarc(0, 0, radius * 0.12, 0, Math.PI * 2, true);
  shape.holes.push(hub);
  // Four windows between the spokes.
  for (let k = 0; k < 4; k++) {
    const a0 = (k / 4) * Math.PI * 2 + 0.25;
    const a1 = a0 + Math.PI / 2 - 0.5;
    const win = new Path();
    win.absarc(0, 0, radius * 0.72, a0, a1, false);
    win.absarc(0, 0, radius * 0.28, a1, a0, true);
    shape.holes.push(win);
  }
  const g = new ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 16 });
  g.translate(0, 0, -thickness / 2);
  return g;
}

/**
 * Clock tower: inside the stone belfry, standing on the timber floor with the
 * great backlit clock face behind the player and big brass gears meshing on
 * the walls ahead and to the sides.
 */
export function createClockTowerSet(): Group {
  const root = new Group();
  root.name = 'ClockTowerSet';
  const stones = brickTexture([112, 104, 96], [70, 66, 62], 8, 271);
  stones.repeat.set(3, 4);
  const floor = plankTexture([104, 72, 46], 10, 272);
  floor.repeat.set(2, 2);
  room(root, 'Belfry', [10, 11, 10], mat(0xffffff, { map: stones, rough: 1 }), mat(0xffffff, { map: floor, rough: 0.8 }), mat(0x2a2420), [0, -0.5]);

  // The clock face behind the player, glowing with moonlight from outside.
  const dial = clockFaceTexture([236, 226, 196], [40, 34, 30], 60, -60);
  dial.repeat.set(-1, 1); // read from inside, the dial is mirrored
  dial.offset.set(1, 0);
  const faceMat = glow(0xd8e0ff);
  faceMat.map = dial;
  put(root, 'ClockFace', new CircleGeometry(3.6, 96), faceMat, [0, 4.2, 4.45], [0, 180, 0]);
  put(root, 'FaceRing', new CylinderGeometry(3.8, 3.8, 0.2, 96, 1, true), mat(0x2a2420, { double: true }), [0, 4.2, 4.4], [90, 0, 0]);
  put(root, 'ArborShaft', new CylinderGeometry(0.08, 0.08, 3.2, 12), mat(0x8a7a5a, { metal: 0.8, rough: 0.4 }), [0, 4.2, 2.9], [90, 0, 0]);

  // Gears: a big wheel ahead, a pinion meshing with it, and one per side wall.
  const brass = mat(0xb8903a, { metal: 0.9, rough: 0.3 });
  const iron = mat(0x4a4a4e, { metal: 0.8, rough: 0.45 });
  put(root, 'GreatWheel', gear(2.6, 40, 0.18), brass, [0.6, 4.3, -5.1], [0, 0, 4]);
  put(root, 'Pinion', gear(1.1, 16, 0.18), iron, [-2.75, 5.9, -5.1], [0, 0, 11]);
  put(root, 'EscapeWheel', gear(0.7, 12, 0.14), brass, [-3.65, 4.34, -5.0]);
  put(root, 'LeftWheel', gear(2, 30, 0.16), brass, [-4.85, 3.8, -1.5], [0, 90, 0]);
  put(root, 'RightWheel', gear(1.6, 24, 0.16), iron, [4.85, 4.6, -2.5], [0, -90, 0]);
  put(root, 'RightPinion', gear(0.8, 12, 0.16), brass, [4.85, 2.5, -1.3], [0, -90, 0]);
  // Axles run along Z for the back-wall gears and along X for the side ones.
  for (const [x, y, z, side] of [[0.6, 4.3, -5.3, 0], [-2.75, 5.9, -5.3, 0], [-5, 3.8, -1.5, 1], [5, 4.6, -2.5, 1]]) {
    put(root, 'Axle', new CylinderGeometry(0.14, 0.14, 0.6, 12), iron, [x, y, z], side ? [0, 0, 90] : [90, 0, 0]);
  }
  // Pendulum hanging in front, a little to the right.
  post(root, 'PendulumRod', 0.025, 4.2, iron, [2.4, 1.8, -3.6]);
  put(root, 'PendulumBob', new CylinderGeometry(0.45, 0.45, 0.08, 32), brass, [2.4, 1.8, -3.6], [90, 0, 0]);
  // Timber beams across the ceiling and a hanging lantern.
  for (const z of [-3, 0, 3]) put(root, 'Beam', new BoxGeometry(10, 0.35, 0.35), mat(0x3a2818), [0, 9.6, -0.5 + z]);
  post(root, 'LanternChain', 0.01, 3, iron, [-1.6, 6.6, -1.5]);
  put(root, 'Lantern', new SphereGeometry(0.18, 16, 12), glow(0xffc070), [-1.6, 6.5, -1.5]);
  block(root, 'Hatch', [1.4, 0.04, 1.4], mat(0x2a1a10), [-3.4, 0, 2.6]);
  return root;
}
