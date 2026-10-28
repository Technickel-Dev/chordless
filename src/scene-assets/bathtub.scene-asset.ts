import { ConeGeometry, CylinderGeometry, ExtrudeGeometry, Group, Path, Shape, SphereGeometry, TorusGeometry } from '@iwsdk/core';
import { block, instances, mat, type Placement, post, put, room, seededRandom, tileTexture } from './lib/set-kit.js';

function roundedRect(shape: Shape | Path, w: number, d: number, r: number): void {
  shape.moveTo(-w / 2 + r, -d / 2);
  shape.lineTo(w / 2 - r, -d / 2);
  shape.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
  shape.lineTo(w / 2, d / 2 - r);
  shape.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
  shape.lineTo(-w / 2 + r, d / 2);
  shape.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r);
  shape.lineTo(-w / 2, -d / 2 + r);
  shape.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
}

/**
 * Bathtub: the player stands on a soap dish clipped to the rim of a
 * stadium-sized tub, looking out over foamy water and a few rubber ducks.
 */
export function createBathtubSet(): Group {
  const root = new Group();
  root.name = 'BathtubSet';
  const rand = seededRandom(91);
  const enamel = mat(0xf6f7f6, { rough: 0.2 });

  // Tub rim as a rounded-rectangle ring; the player is on the near long side.
  const w = 34;
  const d = 18;
  const outer = new Shape();
  roundedRect(outer, w + 3, d + 3, 6);
  const hole = new Path();
  roundedRect(hole, w, d, 5);
  outer.holes.push(hole);
  const rim = new ExtrudeGeometry(outer, { depth: 9, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.5, bevelSegments: 3 });
  rim.rotateX(Math.PI / 2);
  rim.translate(0, -0.6, -d / 2 - 1.2);
  put(root, 'TubRim', rim, enamel);
  const water = mat(0x7cc8e8, { rough: 0.05, metal: 0.1 });
  water.transparent = true;
  water.opacity = 0.85;
  block(root, 'Water', [w, 0.1, d], water, [0, -3.1, -d / 2 - 1.2]);
  put(root, 'Faucet', new CylinderGeometry(0.8, 0.8, 5, 24), mat(0xd8dcdf, { metal: 0.95, rough: 0.15 }), [0, 1.4, -d - 2.6], [70, 0, 0]);
  post(root, 'FaucetBase', 1.1, 1.8, mat(0xd8dcdf, { metal: 0.95, rough: 0.15 }), [0, -1, -d - 3]);

  // Soap dish the player stands on, hanging over the tub edge.
  const dish = new Group();
  dish.name = 'SoapDish';
  root.add(dish);
  const chrome = mat(0xcfd4d8, { metal: 0.9, rough: 0.2 });
  put(dish, 'Tray', new CylinderGeometry(1.6, 1.4, 0.2, 40), chrome, [0, -0.1, 0]);
  put(dish, 'Lip', new TorusGeometry(1.6, 0.08, 8, 48), chrome, [0, 0, 0], [90, 0, 0]);
  const soap = put(dish, 'Soap', new SphereGeometry(0.7, 24, 16), mat(0xf3a7c0, { rough: 0.4 }), [1, 0.15, 0.6]);
  soap.scale.set(1, 0.35, 0.7);

  // Foam islands and bubbles on the water.
  const foam: Placement[] = [];
  for (let i = 0; i < 40; i++) {
    const x = (rand() - 0.5) * (w - 4);
    const z = -2.5 - rand() * (d - 3);
    const s = 0.4 + rand() * 1.4;
    foam.push({ pos: [x, -3.05, z], scale: [s, s * 0.45, s] });
  }
  instances(root, 'Foam', new SphereGeometry(1, 12, 8), mat(0xffffff, { rough: 0.9 }), foam);

  // Three rubber ducks of different sizes.
  const duckYellow = mat(0xffd21f, { rough: 0.35 });
  const beak = mat(0xff7a1a, { rough: 0.4 });
  const eye = mat(0x111111, { rough: 0.2 });
  for (const [x, z, s, yaw] of [[-7, -9, 2.6, 30], [6, -12, 3.4, -40], [-2, -15, 1.8, 10]]) {
    const duck = new Group();
    duck.name = 'RubberDuck';
    duck.position.set(x, -3.1, z);
    duck.rotation.y = (yaw * Math.PI) / 180;
    duck.scale.setScalar(s);
    root.add(duck);
    const body = put(duck, 'Body', new SphereGeometry(0.6, 24, 16), duckYellow, [0, 0.25, 0]);
    body.scale.set(1, 0.7, 1.25);
    put(duck, 'Tail', new ConeGeometry(0.25, 0.4, 16), duckYellow, [0, 0.55, -0.7], [-60, 0, 0]);
    put(duck, 'Head', new SphereGeometry(0.36, 24, 16), duckYellow, [0, 0.88, 0.35]);
    put(duck, 'Beak', new ConeGeometry(0.13, 0.32, 16), beak, [0, 0.82, 0.78], [90, 0, 0]);
    for (const ex of [-0.17, 0.17]) put(duck, 'Eye', new SphereGeometry(0.05, 10, 8), eye, [ex, 0.98, 0.64]);
  }

  // Tiled walls behind the tub.
  const tiles = tileTexture([226, 240, 238], [226, 240, 238], 8, [180, 196, 196]);
  tiles.repeat.set(30, 15);
  const bath = room(root, 'Bathroom', [120, 60, 100], mat(0xffffff, { map: tiles, rough: 0.3 }), mat(0x9fb4b8), mat(0xf4f6f6), [0, -12]);
  bath.position.y = -10.1;
  return root;
}
