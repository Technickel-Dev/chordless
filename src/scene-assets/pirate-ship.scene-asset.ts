import { BoxGeometry, CylinderGeometry, Group, SphereGeometry } from '@iwsdk/core';
import { paramSurface } from './lib/theatre-kit.js';
import { block, disc, instances, mat, type Placement, plankTexture, post, put, skyBody, span } from './lib/set-kit.js';

/**
 * Pirate ship deck: planks underfoot running toward the bow, bulwarks on both
 * sides, a mast with a billowing sail ahead and open ocean to the horizon.
 */
export function createPirateShipSet(): Group {
  const root = new Group();
  root.name = 'PirateShipSet';
  const planks = plankTexture([142, 104, 66], 8, 241);
  planks.rotation = Math.PI / 2;
  planks.repeat.set(4, 1);
  const wood = mat(0x5e3e26, { rough: 0.85 });
  const dark = mat(0x3a2616, { rough: 0.9 });

  // Deck: 7 m wide, from the stern behind the player (z = 8) to the bow (z = -18).
  block(root, 'Deck', [7, 0.3, 26], mat(0xffffff, { map: planks, rough: 0.8 }), [0, -0.3, -5]);
  block(root, 'Hull', [7.4, 4, 26], dark, [0, -4.3, -5]);
  // Bow: a box turned 45 degrees so its front corner makes the prow.
  put(root, 'Bow', new BoxGeometry(5.2, 4.3, 5.2), dark, [0, -2.45, -18], [0, 45, 0]);
  for (const x of [-3.55, 3.55]) {
    block(root, 'Bulwark', [0.3, 1, 26], wood, [x, 0, -5]);
    put(root, 'Rail', new BoxGeometry(0.4, 0.08, 26), mat(0x7a5236), [x, 1.04, -5]);
  }
  put(root, 'Bowsprit', new CylinderGeometry(0.12, 0.2, 9, 12), wood, [0, 1.8, -21], [-72, 0, 0]);
  // Raised quarterdeck behind the player with a ship's wheel at its rail.
  block(root, 'Quarterdeck', [7, 1.2, 5], mat(0xffffff, { map: planks, rough: 0.8 }), [0, 0, 6]);
  const wheel = new Group();
  wheel.name = 'ShipsWheel';
  wheel.position.set(0, 2.2, 4.2);
  root.add(wheel);
  put(wheel, 'Rim', new CylinderGeometry(0.55, 0.55, 0.06, 24, 1, true), wood, [0, 0, 0], [90, 0, 0]);
  for (let i = 0; i < 8; i++) put(wheel, 'Spoke', new BoxGeometry(0.04, 1.4, 0.04), wood, [0, 0, 0], [0, 0, i * 22.5]);
  post(root, 'WheelPost', 0.08, 1, wood, [0, 1.2, 4.3]);

  // Mast, yards and a bellied sail.
  const mastZ = -6;
  post(root, 'Mast', 0.3, 16, wood, [0, 0, mastZ], 0.2, 16);
  for (const [y, w] of [[6, 9], [11.5, 7]]) put(root, 'Yard', new CylinderGeometry(0.12, 0.12, w, 10), wood, [0, y, mastZ + 0.3], [0, 0, 90]);
  const canvas = mat(0xeee2c4, { rough: 1, double: true });
  for (const [top, bottom, w] of [[11.4, 6.3, 6.8], [5.9, 1.9, 8.8]]) {
    const sail = paramSurface(16, 10, (u, v, out) => {
      const x = (u - 0.5) * w * (1 - v * 0.08);
      const y = bottom + (top - bottom) * v;
      const belly = Math.sin(Math.PI * u) * Math.sin(Math.PI * (0.15 + v * 0.85)) * 1.3;
      out.set(x, y, mastZ - 0.1 - belly);
    });
    put(root, 'Sail', sail, canvas);
  }
  put(root, 'CrowsNest', new CylinderGeometry(0.8, 0.6, 0.8, 16, 1, true), mat(0x5e3e26, { double: true }), [0, 13.2, mastZ]);
  put(root, 'Flag', new BoxGeometry(1.2, 0.7, 0.02), mat(0x111111), [0.65, 16.3, mastZ]);
  put(root, 'Skull', new SphereGeometry(0.12, 12, 8), mat(0xf0f0e8), [0.65, 16.35, mastZ - 0.02]);
  // Rigging: shrouds from the yard ends down to the bulwarks.
  const ropes: Placement[] = [];
  for (const sx of [-1, 1]) {
    ropes.push(span([sx * 4.5, 6, mastZ + 0.3], [sx * 3.5, 1, mastZ + 4]));
    ropes.push(span([sx * 0.3, 15, mastZ], [sx * 3.5, 1, mastZ - 2]));
    ropes.push(span([sx * 0.3, 14, mastZ], [sx * 3.5, 1, mastZ + 2]));
  }
  instances(root, 'Shrouds', new CylinderGeometry(0.025, 0.025, 1, 5), mat(0x8a7a5a), ropes);
  // Barrels and a cannon by the rail.
  instances(root, 'Barrels', new CylinderGeometry(0.32, 0.32, 0.8, 14).translate(0, 0.4, 0), mat(0x6e4a2a, { rough: 0.8 }), [
    { pos: [-2.6, 0, -1.6] },
    { pos: [-2.6, 0, -2.4] },
    { pos: [-2.0, 0, -2] },
  ]);
  put(root, 'Cannon', new CylinderGeometry(0.16, 0.24, 1.8, 16), mat(0x222428, { metal: 0.8, rough: 0.4 }), [2.6, 0.55, -3], [0, 0, 90]);
  block(root, 'CannonCarriage', [0.9, 0.4, 0.7], wood, [2.4, 0, -3]);

  disc(root, 'Ocean', 195, mat(0x1a4a78, { rough: 0.25, metal: 0.1 }), -3.4);
  skyBody(root, 'Sun', [-60, 80, -120], 7, 0xffffff, 0xfff4d8, 3);
  return root;
}
