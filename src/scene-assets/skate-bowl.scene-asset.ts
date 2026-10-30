import { BoxGeometry, CylinderGeometry, Group, LatheGeometry, TorusGeometry, Vector2 } from '@iwsdk/core';
import { blobTexture, block, disc, instances, mat, noiseTexture, type Placement, put, skyBody, span } from './lib/set-kit.js';

/**
 * Skate park bowl at sunset: the player stands on the concrete deck at the
 * lip of a smooth bowl, steel coping along its edge, a quarter pipe and a
 * grind rail nearby and graffiti on the walls.
 */
export function createSkateBowlSet(): Group {
  const root = new Group();
  root.name = 'SkateBowlSet';
  const concrete = noiseTexture([176, 172, 166], 18, 531);
  concrete.repeat.set(30, 30);
  const smooth = mat(0xffffff, { map: concrete, rough: 0.6 });

  // Deck with a round hole; the bowl below it, centered 5.5 m ahead.
  const bowlR = 4.6;
  const center = -5.6;
  const deckShape = [new Vector2(bowlR + 0.02, 0), new Vector2(90, 0), new Vector2(90, -0.3), new Vector2(bowlR + 0.02, -0.3)];
  put(root, 'DeckRing', new LatheGeometry(deckShape, 96), mat(0xffffff, { map: concrete, rough: 0.6, double: true }), [0, 0, center]);
  // Bowl walls: a quarter-circle transition down to a flat bottom 2.4 m deep.
  const profile: Vector2[] = [new Vector2(0, -2.4)];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * (Math.PI / 2);
    profile.push(new Vector2(bowlR - 2.4 + Math.sin(a) * 2.4, -2.4 + (1 - Math.cos(a)) * 2.4));
  }
  put(root, 'Bowl', new LatheGeometry(profile, 96), mat(0xffffff, { map: concrete, rough: 0.5, double: true }), [0, 0, center]);
  put(root, 'Coping', new TorusGeometry(bowlR, 0.05, 8, 96), mat(0xd8dce0, { metal: 0.95, rough: 0.2 }), [0, -0.02, center], [90, 0, 0]);
  put(root, 'Drain', new CylinderGeometry(0.2, 0.2, 0.01, 16), mat(0x2a2a2a, { metal: 0.6 }), [0, -2.395, center]);

  // Quarter pipe to the right and a flat rail to the left.
  const qp = new Group();
  qp.name = 'QuarterPipe';
  qp.position.set(8.5, 0, -2);
  qp.rotation.y = Math.PI / 2; // rises away from the riding area, toward +X
  root.add(qp);
  const curve: Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * (Math.PI / 2);
    curve.push(new Vector2(-2 + Math.sin(a) * 2, (1 - Math.cos(a)) * 2));
  }
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i];
    const b = curve[i + 1];
    const slab = put(qp, 'Ramp', new BoxGeometry(5, 0.08, Math.hypot(b.x - a.x, b.y - a.y) + 0.01), smooth, [0, (a.y + b.y) / 2, (a.x + b.x) / 2]);
    slab.rotation.x = -Math.atan2(b.y - a.y, b.x - a.x);
  }
  block(qp, 'Platform', [5, 2, 1.2], smooth, [0, 0, 0.6]);
  put(qp, 'QPCoping', new CylinderGeometry(0.05, 0.05, 5, 10), mat(0xd8dce0, { metal: 0.95, rough: 0.2 }), [0, 2, 0], [0, 0, 90]);
  const steel = mat(0x3a3e44, { metal: 0.9, rough: 0.3 });
  instances(root, 'Rail', new CylinderGeometry(1, 1, 1, 10), steel, [
    span([-6, 0.5, -1], [-6, 0.5, -7], 0.04),
    span([-6, 0, -1.4], [-6, 0.5, -1.4], 0.03),
    span([-6, 0, -6.6], [-6, 0.5, -6.6], 0.03),
  ]);

  // Graffiti walls along the back.
  const tags = blobTexture([150, 146, 140], [[230, 60, 120], [60, 170, 230], [250, 210, 40], [40, 40, 40]], 30, 18, 532);
  tags.repeat.set(3, 1);
  block(root, 'Wall', [30, 3, 0.4], mat(0xffffff, { map: tags, rough: 0.9 }), [0, 0, -16], 0);
  block(root, 'WallLeft', [0.4, 2.4, 18], mat(0xffffff, { map: tags, rough: 0.9 }), [-13, 0, -7], 0);
  const lamps: Placement[] = [{ pos: [-12, 0, -15] }, { pos: [12, 0, -15] }, { pos: [12, 0, 4] }];
  instances(root, 'LightPoles', new CylinderGeometry(0.08, 0.1, 7, 8).translate(0, 3.5, 0), steel, lamps);
  disc(root, 'Grass', 190, mat(0x5a7a42, { rough: 1 }), -2.6); // below the bowl floor
  skyBody(root, 'Sun', [40, 12, -170], 11, 0xffc890, 0xff7a3a, 4);
  return root;
}
