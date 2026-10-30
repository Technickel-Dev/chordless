import { BoxGeometry, CylinderGeometry, Group } from '@iwsdk/core';
import { block, glow, instances, mat, type Placement, put, room, seededRandom, sign, span, tileTexture } from './lib/set-kit.js';

/**
 * Supermarket aisle: long shelving runs either side packed with colorful
 * boxes, a lone shopping cart, shelf-edge price tags, an aisle sign hanging
 * overhead and bright strip lights.
 */
export function createSupermarketSet(): Group {
  const root = new Group();
  root.name = 'SupermarketSet';
  const rand = seededRandom(391);
  const tiles = tileTexture([236, 236, 230], [220, 222, 216], 6, [200, 200, 196]);
  tiles.repeat.set(6, 20);
  room(root, 'Store', [14, 5, 40], mat(0xe8e6e0), mat(0xffffff, { map: tiles, rough: 0.15 }), mat(0xd8d8d4), [0, -16]);

  // Shelving: aisle 2.4 m wide, units 1.2 m bays, five shelves high.
  const length = 30;
  const steel = mat(0xc8ccd0, { metal: 0.5, rough: 0.4 });
  const products: Placement[] = [];
  const tags: Placement[] = [];
  const palette = [0xd83a2a, 0xf2c428, 0x2a6ad8, 0x2ab85a, 0xf28a2a, 0x8a3ad8, 0xf2f2f2, 0x6a3a1a];
  for (const side of [-1, 1]) {
    const x = side * 1.7;
    block(root, 'Back', [0.04, 2.2, length], mat(0xb8bcc0, { metal: 0.3 }), [x + side * 0.3, 0, -length / 2 + 2]);
    for (let s = 0; s < 5; s++) {
      const y = 0.15 + s * 0.45;
      block(root, 'Shelf', [0.6, 0.03, length], steel, [x, y, -length / 2 + 2]);
      put(root, 'TagStrip', new BoxGeometry(0.02, 0.05, length), mat(0xf6f6f2), [x - side * 0.31, y + 0.02, -length / 2 + 2]);
      // Products, varied heights and colors, packed along each shelf.
      let z = 2 - 0.1;
      while (z > 2 - length + 0.2) {
        const w = 0.14 + rand() * 0.16;
        const h = 0.18 + rand() * 0.2;
        const c = palette[Math.floor(rand() * palette.length)];
        for (const d of [-0.15, 0.1]) products.push({ pos: [x + d * side, y + 0.03 + h / 2, z - w / 2], scale: [0.2, h, w * 0.92], color: c });
        z -= w;
      }
      for (let tz = 1.5; tz > 2 - length; tz -= 2.4) tags.push({ pos: [x - side * 0.325, y + 0.02, tz], color: rand() < 0.2 ? 0xffd23a : 0xffffff });
    }
  }
  instances(root, 'Products', new BoxGeometry(1, 1, 1), mat(0xffffff, { rough: 0.55 }), products);
  instances(root, 'PriceTags', new BoxGeometry(0.01, 0.04, 0.08), mat(0xffffff, { rough: 0.6 }), tags);

  // Shopping cart, a little ahead on the left.
  const cart = new Group();
  cart.name = 'ShoppingCart';
  cart.position.set(-0.55, 0, -3);
  cart.rotation.y = 0.25;
  root.add(cart);
  const wire = mat(0xd8dce0, { metal: 0.9, rough: 0.25 });
  const bars: Placement[] = [];
  const corners: [number, number, number][] = [[-0.28, 0.45, -0.45], [0.28, 0.45, -0.45], [0.28, 0.45, 0.45], [-0.28, 0.45, 0.45]];
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    for (const dy of [0, 0.25, 0.5]) bars.push(span([a[0], a[1] + dy, a[2]], [b[0], b[1] + dy, b[2]], 0.012));
    bars.push(span(a, [a[0], a[1] + 0.5, a[2]], 0.012));
  }
  for (let k = -2; k <= 2; k++) bars.push(span([k * 0.11, 0.45, -0.45], [k * 0.11, 0.95, -0.45], 0.008), span([k * 0.11, 0.45, 0.45], [k * 0.11, 0.95, 0.45], 0.008));
  bars.push(span([-0.28, 0.45, 0.45], [-0.28, 0.08, 0.4], 0.02), span([0.28, 0.45, 0.45], [0.28, 0.08, 0.4], 0.02));
  bars.push(span([-0.28, 0.45, -0.45], [-0.28, 0.08, -0.4], 0.02), span([0.28, 0.45, -0.45], [0.28, 0.08, -0.4], 0.02));
  instances(cart, 'Wires', new CylinderGeometry(1, 1, 1, 6), wire, bars);
  put(cart, 'Handle', new CylinderGeometry(0.02, 0.02, 0.6, 10), mat(0xd83a2a, { rough: 0.5 }), [0, 1.05, 0.55], [0, 0, 90]);
  instances(cart, 'Casters', new CylinderGeometry(0.06, 0.06, 0.03, 12).rotateZ(Math.PI / 2), mat(0x222222), [
    { pos: [-0.26, 0.06, 0.4] }, { pos: [0.26, 0.06, 0.4] }, { pos: [-0.26, 0.06, -0.4] }, { pos: [0.26, 0.06, -0.4] },
  ]);
  block(cart, 'Cereal', [0.25, 0.32, 0.08], mat(0xf2c428), [0.05, 0.45, 0]);

  // Hanging aisle sign and strip lights.
  for (const zz of [-0.01, 0.01]) sign(root, 'AisleSign', 'AISLE 7\nCEREAL - SNACKS', 0.5, [255, 255, 255], [30, 90, 180, 255], [0, 3.3, -6 + zz], [0, zz < 0 ? 180 : 0, 0]);
  put(root, 'SignWire', new CylinderGeometry(0.005, 0.005, 1.4, 4), mat(0x666666), [0, 4.3, -6]);
  const strips: Placement[] = [];
  for (let z = 0; z > -32; z -= 4) for (const x of [-2.5, 0, 2.5]) strips.push({ pos: [x, 4.95, z] });
  instances(root, 'StripLights', new BoxGeometry(0.2, 0.05, 2.4), glow(0xf8fbff), strips);
  sign(root, 'Sale', 'SALE!', 0.4, [255, 255, 255], [220, 30, 40, 255], [-1.38, 1.4, -8], [0, 90, 0]);
  return root;
}
