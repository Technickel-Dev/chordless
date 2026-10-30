import { AdditiveBlending, BoxGeometry, ConeGeometry, CylinderGeometry, DodecahedronGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, SphereGeometry, TorusGeometry } from '@iwsdk/core';
import { glow, instances, mat, noiseTexture, type Placement, put, seededRandom, stripeTexture } from './lib/set-kit.js';

/**
 * Waterfall pool: a flat rock ledge at the edge of a green pool, a tall sheet
 * of water pouring down the cliff ahead, mist boiling up at its foot and a
 * rainbow arched through the spray.
 */
export function createWaterfallPoolSet(): Group {
  const root = new Group();
  root.name = 'WaterfallPoolSet';
  const rand = seededRandom(431);
  const rock = mat(0xffffff, { map: noiseTexture([108, 100, 92], 40, 432), rough: 1 });
  const moss = mat(0xffffff, { map: noiseTexture([70, 110, 54], 40, 433), rough: 1 });

  // Ledge underfoot, rocks around the pool and the cliff behind the falls.
  put(root, 'Ledge', new CylinderGeometry(2.6, 3.4, 1.4, 9), rock, [0, -0.7, 0.4]);
  put(root, 'LedgeMoss', new CylinderGeometry(2.62, 2.62, 0.04, 9), moss, [0, 0.0, 0.4]);
  const boulders: Placement[] = [];
  for (let i = 0; i < 40; i++) {
    const a = rand() * Math.PI * 2;
    const r = 9 + rand() * 4;
    const s = 1 + rand() * 2.5;
    boulders.push({ pos: [Math.sin(a) * r, -0.6, -8 - Math.cos(a) * r * 0.8], rotDeg: [rand() * 90, rand() * 360, 0], scale: [s, s * 0.8, s] });
  }
  instances(root, 'PoolRocks', new DodecahedronGeometry(1, 1), rock, boulders);
  const cliff: Placement[] = [];
  for (let i = 0; i < 60; i++) {
    const x = (rand() - 0.5) * 50;
    const y = rand() * 26;
    const s = 3 + rand() * 4;
    if (Math.abs(x) < 3.4 && y < 24) continue; // the notch the water falls through
    cliff.push({ pos: [x, y, -20 - rand() * 3 + Math.abs(x) * 0.1], rotDeg: [rand() * 90, rand() * 360, 0], scale: [s, s, s * 0.8] });
  }
  instances(root, 'Cliff', new DodecahedronGeometry(1, 1), rock, cliff);
  instances(root, 'CliffMoss', new SphereGeometry(1, 12, 8), moss, cliff.filter((_, i) => i % 3 === 0).map((c) => ({ pos: [c.pos[0], c.pos[1] + 2.4, c.pos[2] + 0.6], scale: [2.6, 0.8, 2] })));
  put(root, 'Backrock', new BoxGeometry(8, 26, 1), mat(0x4a4a46, { rough: 1 }), [0, 12, -21.5]);

  // Water: the pool and the falling sheet with streaky foam.
  put(root, 'Pool', new CylinderGeometry(11, 11, 0.1, 64), mat(0x2a7a6a, { rough: 0.08, metal: 0.3 }), [0, -0.7, -9]);
  const streaks = stripeTexture([230, 244, 250], [150, 200, 220], 14);
  streaks.repeat.set(2, 1);
  const falling = mat(0xffffff, { map: streaks, emissive: 0x6aa8c0, glow: 0.5, rough: 0.3 });
  falling.transparent = true;
  falling.opacity = 0.85;
  // A shallow arc of a wide cylinder: the sheet bows gently toward the player.
  put(root, 'Falls', new CylinderGeometry(7.5, 7, 25, 24, 1, true, -0.45, 0.9), falling, [0, 12, -27.1]);
  const mist: Placement[] = [];
  for (let i = 0; i < 30; i++) mist.push({ pos: [(rand() - 0.5) * 7, -0.4 + rand() * 2, -17 + rand() * 3], scale: 1 + rand() * 1.6 });
  instances(root, 'Mist', new SphereGeometry(1, 12, 8), glow(0xffffff, 0.14, true), mist).userData.iwsdkPreviewBounds = 'exclude';
  const foam: Placement[] = [];
  for (let i = 0; i < 40; i++) foam.push({ pos: [(rand() - 0.5) * 8, -0.63, -18 + rand() * 4], scale: [0.6 + rand(), 0.1, 0.6 + rand()] });
  instances(root, 'Foam', new SphereGeometry(1, 10, 6), mat(0xffffff, { rough: 0.8 }), foam);

  // Rainbow: a half ring whose vertices are colored by their radius.
  const bow = new TorusGeometry(9, 0.5, 8, 64, Math.PI);
  const pos = bow.getAttribute('position');
  const colors: number[] = [];
  const bands = [[0.6, 0.1, 0.1], [0.6, 0.35, 0.05], [0.55, 0.55, 0.05], [0.1, 0.5, 0.15], [0.1, 0.25, 0.6], [0.3, 0.1, 0.5]];
  for (let k = 0; k < pos.count; k++) {
    const r = Math.hypot(pos.getX(k), pos.getY(k));
    const t = Math.min(5, Math.max(0, Math.floor(((9.5 - r) / 1) * 6)));
    const c = bands[t];
    colors.push(c[0] * 0.2, c[1] * 0.2, c[2] * 0.2);
  }
  bow.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const rainbow = new Mesh(bow, new MeshBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }));
  rainbow.name = 'Rainbow';
  rainbow.position.set(1, -1, -14);
  rainbow.userData.iwsdkPreviewBounds = 'exclude';
  root.add(rainbow);
  // Ferns along the pool edge.
  const ferns: Placement[] = [];
  for (let i = 0; i < 40; i++) {
    const a = rand() * Math.PI * 2;
    const r = 6 + rand() * 7;
    ferns.push({ pos: [Math.sin(a) * r, -0.2, -6 - Math.cos(a) * r * 0.7], rotDeg: [0, rand() * 360, (rand() - 0.5) * 30], scale: [0.6, 0.8 + rand() * 0.6, 0.6] });
  }
  instances(root, 'Ferns', new ConeGeometry(0.6, 1.2, 5).translate(0, 0.6, 0), mat(0x3a8a3a, { rough: 0.9 }), ferns);
  return root;
}
