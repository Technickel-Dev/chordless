import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, SphereGeometry, TorusGeometry } from '@iwsdk/core';
import { block, glow, instances, mat, noiseTexture, type Placement, post, put, seededRandom, skyBody, windowTexture } from './lib/set-kit.js';

/**
 * Rooftop helipad at sunset: a painted landing circle with a big H, a ring
 * of landing lights, a windsock on the edge and a city of towers glowing all
 * around under an orange sky.
 */
export function createHelipadSet(): Group {
  const root = new Group();
  root.name = 'HelipadSet';
  const rand = seededRandom(511);
  const deck = noiseTexture([70, 76, 82], 18, 512);
  deck.repeat.set(6, 6);
  block(root, 'Pad', [22, 0.5, 22], mat(0xffffff, { map: deck, rough: 0.7 }), [0, -0.5, -4]);
  block(root, 'Tower', [22, 90, 22], mat(0x2a2e36, { rough: 0.6 }), [0, -90.5, -4]);
  put(root, 'Circle', new TorusGeometry(7, 0.25, 4, 96), mat(0xf2c42a, { rough: 0.6 }), [0, 0.003, -4], [90, 0, 0]);
  const white = mat(0xf4f4f0, { rough: 0.6 });
  put(root, 'HLeft', new BoxGeometry(0.8, 0.006, 6), white, [-1.8, 0.003, -4]);
  put(root, 'HRight', new BoxGeometry(0.8, 0.006, 6), white, [1.8, 0.003, -4]);
  put(root, 'HBar', new BoxGeometry(3, 0.006, 0.8), white, [0, 0.003, -4]);
  // Landing lights around the circle and a safety net frame at the edges.
  const lights: Placement[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    lights.push({ pos: [Math.sin(a) * 8.6, 0.06, -4 + Math.cos(a) * 8.6], color: i % 2 ? 0x3aff7a : 0xfff4d8 });
  }
  instances(root, 'LandingLights', new CylinderGeometry(0.14, 0.16, 0.12, 12), glow(0xffffff), lights);
  const steel = mat(0x8a8e94, { metal: 0.7, rough: 0.4 });
  for (const [x, z, w, d] of [[0, -15.2, 22.4, 0.1], [0, 7.2, 22.4, 0.1], [-11.2, -4, 0.1, 22.4], [11.2, -4, 0.1, 22.4]]) {
    put(root, 'EdgeRail', new BoxGeometry(w, 0.08, d), steel, [x, 0.6, z]);
  }
  const edgePosts: Placement[] = [];
  for (let t = -11; t <= 11; t += 2.2) edgePosts.push({ pos: [t, 0.3, -15.2] }, { pos: [t, 0.3, 7.2] }, { pos: [-11.2, 0.3, t - 4] }, { pos: [11.2, 0.3, t - 4] });
  instances(root, 'EdgePosts', new BoxGeometry(0.06, 0.6, 0.06), steel, edgePosts);
  // Windsock on a mast at the front right corner.
  post(root, 'SockMast', 0.06, 4, steel, [9.6, 0, -13.6]);
  put(root, 'Windsock', new ConeGeometry(0.4, 2.2, 16, 1, true), mat(0xf26a1a, { rough: 0.7, double: true }), [8.6, 3.9, -13.6], [0, 0, -78]);
  put(root, 'SockRing', new TorusGeometry(0.4, 0.03, 6, 20), steel, [9.6, 4, -13.6], [0, 90, 0]);
  put(root, 'MastBeacon', new SphereGeometry(0.12, 10, 8), glow(0xff3030), [9.6, 4.15, -13.6]);
  // Access stairs housing behind the player.
  block(root, 'StairHouse', [3.4, 2.6, 2.6], mat(0x4a5058, { rough: 0.7 }), [-7, 0, 5]);
  block(root, 'Door', [1, 2, 0.05], mat(0x2a2e34), [-7.6, 0, 3.68]);

  // City: towers of lit windows at 30-170 m, some taller than the helipad.
  const facade = windowTexture(513, 0.4);
  facade.repeat.set(2, 3);
  const lit = mat(0xffffff, { map: facade, emissive: 0xffffff, glow: 1 });
  lit.emissiveMap = facade;
  const towers: Placement[] = [];
  for (let i = 0; i < 150; i++) {
    const a = rand() * Math.PI * 2;
    const r = 30 + Math.pow(rand(), 0.7) * 140;
    const h = 40 + rand() * (r > 80 ? 110 : 60);
    const w = 10 + rand() * 16;
    towers.push({ pos: [Math.sin(a) * r, -90, -Math.cos(a) * r - 4], rotDeg: [0, rand() * 90, 0], scale: [w, h, w] });
  }
  instances(root, 'Skyline', new BoxGeometry(1, 1, 1).translate(0, 0.5, 0), lit, towers);
  skyBody(root, 'Sun', [-30, 10, -180], 12, 0xffc070, 0xff7a3a, 4);
  return root;
}
