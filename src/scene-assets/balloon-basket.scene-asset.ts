import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, LatheGeometry, SphereGeometry, TorusGeometry, Vector2 } from '@iwsdk/core';
import { block, disc, glow, instances, mat, type Placement, plankTexture, put, seededRandom, skyBody, span, stripeTexture, tileTexture } from './lib/set-kit.js';

/**
 * Hot air balloon basket: the player stands in a wicker basket with a padded
 * rim, ropes rising to the burner frame and a striped envelope overhead,
 * drifting high above a patchwork of fields with clouds below.
 */
export function createBalloonBasketSet(): Group {
  const root = new Group();
  root.name = 'BalloonBasketSet';
  const rand = seededRandom(501);

  // Basket: 1.6 m square, rim at 1.05 m.
  const wicker = plankTexture([176, 132, 80], 14, 502);
  const weave = mat(0xffffff, { map: wicker, rough: 1 });
  const half = 0.8;
  block(root, 'Floor', [2 * half, 0.08, 2 * half], weave, [0, -0.08, 0]);
  for (const [n, x, z, w, d] of [['Front', 0, -half, 2 * half, 0.08], ['Back', 0, half, 2 * half, 0.08], ['Left', -half, 0, 0.08, 2 * half], ['Right', half, 0, 0.08, 2 * half]] as const) {
    block(root, `Wall${n}`, [w, 1.05, d], weave, [x, -0.08, z]);
  }
  const leather = mat(0x5a3a22, { rough: 0.6 });
  for (const [x, z, w, d] of [[0, -half, 2 * half + 0.12, 0.14], [0, half, 2 * half + 0.12, 0.14], [-half, 0, 0.14, 2 * half], [half, 0, 0.14, 2 * half]]) {
    put(root, 'RimPad', new BoxGeometry(w, 0.1, d), leather, [x, 1.0, z]);
  }
  // Ropes and uprights to the burner frame overhead.
  const corners: [number, number, number][] = [[-half, 1, -half], [half, 1, -half], [half, 1, half], [-half, 1, half]];
  const frameY = 2.6;
  const ropes: Placement[] = corners.map((c) => span(c, [c[0] * 0.5, frameY, c[2] * 0.5], 0.015));
  instances(root, 'Uprights', new CylinderGeometry(1, 1, 1, 6), mat(0x2a2a2c, { metal: 0.6 }), ropes);
  put(root, 'BurnerFrame', new BoxGeometry(0.9, 0.06, 0.9), mat(0x8a8e94, { metal: 0.8, rough: 0.3 }), [0, frameY, 0]);
  put(root, 'Burner', new CylinderGeometry(0.2, 0.25, 0.35, 16), mat(0xb8bcc2, { metal: 0.9, rough: 0.25 }), [0, frameY + 0.2, 0]);
  put(root, 'Flame', new ConeGeometry(0.18, 0.9, 16), glow(0xffa83a), [0, frameY + 0.8, 0]);
  put(root, 'FlameCore', new ConeGeometry(0.08, 0.5, 12), glow(0xbfe0ff), [0, frameY + 0.6, 0]);
  instances(root, 'FuelTanks', new CylinderGeometry(0.14, 0.14, 0.8, 16).translate(0, 0.4, 0), mat(0xc8ccd2, { metal: 0.8, rough: 0.3 }), [
    { pos: [-0.6, 0, 0.6] }, { pos: [0.6, 0, 0.6] },
  ]);

  // Envelope: a striped teardrop lathe above the burner, open at the mouth.
  const profile: Vector2[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    // A cone flaring up from the mouth, capped by a round dome.
    const u = (t - 0.35) / 0.65;
    const r = t < 0.35 ? 1.3 + (t / 0.35) * 8.5 : 9.8 * Math.sqrt(Math.max(0, 1 - u * u));
    profile.push(new Vector2(r, t * 16));
  }
  const stripes = stripeTexture([230, 60, 50], [250, 200, 50], 12);
  put(root, 'Envelope', new LatheGeometry(profile, 48), mat(0xffffff, { map: stripes, rough: 0.6, double: true }), [0, frameY + 1.2, 0]);
  put(root, 'Skirt', new TorusGeometry(1.3, 0.06, 6, 32), mat(0x3a3a3c), [0, frameY + 1.2, 0], [90, 0, 0]);
  const shroud: Placement[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    shroud.push(span([Math.sin(a) * 0.45, frameY, Math.cos(a) * 0.45], [Math.sin(a) * 1.3, frameY + 1.2, Math.cos(a) * 1.3], 0.01));
  }
  instances(root, 'Shrouds', new CylinderGeometry(1, 1, 1, 4), mat(0x8a7a5a), shroud);

  // Far below: patchwork fields, cloud puffs and a distant balloon.
  const fields = tileTexture([110, 150, 70], [200, 180, 90], 10);
  fields.repeat.set(8, 8);
  disc(root, 'Fields', 170, mat(0xffffff, { map: fields, rough: 1 }), -90);
  const clouds: Placement[] = [];
  for (let i = 0; i < 90; i++) {
    const a = rand() * Math.PI * 2;
    const r = 20 + rand() * 150;
    const s = 5 + rand() * 9;
    clouds.push({ pos: [Math.sin(a) * r, -40 - rand() * 20, Math.cos(a) * r], scale: [s, s * 0.45, s] });
  }
  instances(root, 'Clouds', new SphereGeometry(1, 14, 10), mat(0xffffff, { rough: 1 }), clouds);
  const other = new Group();
  other.name = 'DistantBalloon';
  other.position.set(-40, -6, -70);
  other.scale.setScalar(0.8);
  root.add(other);
  put(other, 'Envelope', new SphereGeometry(8, 24, 16), mat(0x3a8ad8, { rough: 0.6 }), [0, 10, 0]).scale.set(1, 1.2, 1);
  block(other, 'Basket', [1.6, 1.2, 1.6], weave, [0, -1, 0]);
  skyBody(root, 'Sun', [70, 60, -130], 6, 0xffffff, 0xfff4d8, 3);
  return root;
}
