import { BoxGeometry, CylinderGeometry, Group, SphereGeometry } from '@iwsdk/core';
import { disc, instances, mat, noiseTexture, type Placement, put, seededRandom, skyBody, span } from './lib/set-kit.js';

/**
 * Tropical beach at dusk: white sand sloping into the sea, two leaning palm
 * trees, lines of gentle surf and a pink sky with the sun going down.
 */
export function createTropicalBeachSet(): Group {
  const root = new Group();
  root.name = 'TropicalBeachSet';
  const rand = seededRandom(451);
  const sand = noiseTexture([236, 220, 190], 18, 452);
  sand.repeat.set(40, 40);
  // Dry sand from 6 m ahead back past the player; the sea fills the rest.
  put(root, 'Sand', new BoxGeometry(160, 0.6, 70), mat(0xffffff, { map: sand, rough: 1 }), [0, -0.3, 29]);
  put(root, 'WetSand', new BoxGeometry(160, 0.3, 3.5), mat(0xb8a080, { rough: 0.3 }), [0, -0.3, -7.7], [-2, 0, 0]);
  disc(root, 'Sea', 195, mat(0x3a6a9a, { rough: 0.12, metal: 0.2 }), -0.25);

  // Surf lines: thin white foam bands rolling in from the sea.
  const surf: Placement[] = [];
  for (let i = 0; i < 5; i++) {
    for (let k = 0; k < 16; k++) {
      surf.push({ pos: [-60 + k * 8 + (rand() - 0.5) * 3, -0.2, -9 - i * 4 - rand()], scale: [6 + rand() * 4, 1, 1] });
    }
  }
  instances(root, 'Surf', new BoxGeometry(1, 0.04, 0.35), mat(0xf6f8fa, { rough: 0.6 }), surf);

  // Palms: curved trunks of short segments and a crown of fronds.
  const trunkSegs: Placement[] = [];
  const fronds: Placement[] = [];
  const coconuts: Placement[] = [];
  for (const [bx, bz, lean, yaw] of [[-3.6, -3, 0.35, 0.5], [4.2, -2.2, 0.28, -0.4]]) {
    let p: [number, number, number] = [bx, 0, bz];
    for (let i = 0; i < 10; i++) {
      const t = (i + 1) / 10;
      const next: [number, number, number] = [bx + Math.sin(yaw) * lean * 8 * t * t, t * 7.5, bz - Math.cos(yaw) * lean * 8 * t * t];
      trunkSegs.push(span(p, next, 0.28 - t * 0.1));
      p = next;
    }
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      const tip: [number, number, number] = [p[0] + Math.cos(a) * 3.2, p[1] - 1.2 - rand() * 0.6, p[2] + Math.sin(a) * 3.2];
      const mid: [number, number, number] = [p[0] + Math.cos(a) * 1.6, p[1] + 0.3, p[2] + Math.sin(a) * 1.6];
      fronds.push({ ...span(p, mid, 1), scale: [0.6, Math.hypot(1.6, 0.3), 0.04] });
      fronds.push({ ...span(mid, tip, 1), scale: [0.5, Math.hypot(1.6, 1.5), 0.04] });
    }
    for (let k = 0; k < 3; k++) coconuts.push({ pos: [p[0] + Math.cos(k * 2.1) * 0.3, p[1] - 0.35, p[2] + Math.sin(k * 2.1) * 0.3] });
  }
  instances(root, 'PalmTrunks', new CylinderGeometry(1, 1.1, 1, 10), mat(0x8a6a48, { rough: 1 }), trunkSegs);
  instances(root, 'Fronds', new BoxGeometry(1, 1, 1), mat(0x3a7a3a, { rough: 0.8 }), fronds);
  instances(root, 'Coconuts', new SphereGeometry(0.2, 12, 8), mat(0x5a3a1a, { rough: 0.8 }), coconuts);
  put(root, 'Towel', new BoxGeometry(0.9, 0.01, 1.8), mat(0xd83a6a, { rough: 1 }), [2.2, 0.005, 0.6], [0, 20, 0]);
  instances(root, 'Shells', new SphereGeometry(0.06, 8, 6), mat(0xf6e8e0), [
    { pos: [0.8, 0.02, -2.5], scale: [1, 0.4, 0.7] }, { pos: [-1.4, 0.02, -4.4], scale: [1, 0.4, 0.8] }, { pos: [1.9, 0.02, -5.2], scale: [0.8, 0.4, 1] },
  ]);
  skyBody(root, 'Sun', [-20, 8, -185], 12, 0xffc890, 0xff7a8a, 4);
  return root;
}
