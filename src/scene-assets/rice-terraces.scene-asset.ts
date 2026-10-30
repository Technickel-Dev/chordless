import { DodecahedronGeometry, ExtrudeGeometry, Group, Shape, SphereGeometry } from '@iwsdk/core';
import { disc, instances, mat, noiseTexture, type Placement, put, seededRandom, skyBody } from './lib/set-kit.js';

/**
 * A flat annular sector, rIn..rOut, over angles a0..a1 (a = 0 points at +Z
 * from the center), extruded `height` upward from y = 0.
 */
function sector(rIn: number, rOut: number, a0: number, a1: number, height: number): ExtrudeGeometry {
  // Shape (X, Y) maps to world (X, -Y) after the rotation, so t = a - 90 deg.
  const t0 = a0 - Math.PI / 2;
  const t1 = a1 - Math.PI / 2;
  const shape = new Shape();
  shape.moveTo(Math.cos(t0) * rOut, Math.sin(t0) * rOut);
  shape.absarc(0, 0, rOut, t0, t1, false);
  shape.lineTo(Math.cos(t1) * rIn, Math.sin(t1) * rIn);
  shape.absarc(0, 0, rIn, t1, t0, true);
  const g = new ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 96 });
  g.rotateX(-Math.PI / 2);
  return g;
}

/**
 * Rice terraces: the player stands on the top step of a hillside of curved
 * paddies stepping down into a valley, each flooded step mirroring the sky,
 * green rice tufts along their edges and misty hills beyond.
 */
export function createRiceTerracesSet(): Group {
  const root = new Group();
  root.name = 'RiceTerracesSet';
  const rand = seededRandom(471);
  // Brown bunds against sky-blue water so every step reads from above.
  const earth = mat(0xffffff, { map: noiseTexture([128, 100, 62], 34, 472), rough: 1 });
  const water = mat(0x8ac8f0, { rough: 0.03, metal: 0.7, emissive: 0x2a5a8a, glow: 0.35 });

  // Terraces are concentric arcs centered 70 m ahead, each 2.6 m wide and
  // 1.1 m lower than the last. The player's step has radius ~70 at z = 0.
  const center: [number, number] = [0, -70];
  const arc = Math.PI * 0.75;
  for (let i = 0; i < 18; i++) {
    const outer = 70.3 - i * 2.6; // the player (r = 70) stands on the top bund
    const inner = outer - 2.6;
    if (inner < 4) break;
    const top = -i * 1.1;
    put(root, `Terrace${i}`, sector(inner, outer, -arc / 2, arc / 2, 1.3), earth, [center[0], top - 1.3, center[1]]);
    put(root, `Paddy${i}`, sector(inner, outer - 0.6, -arc / 2, arc / 2, 0.02), water, [center[0], top - 0.015, center[1]]); // just above the step top
    // Rice tufts along each step's outer bund.
    const tufts: Placement[] = [];
    const n = Math.floor(outer * arc * 0.25);
    for (let k = 0; k < n; k++) {
      const a = -arc / 2 + (k / n) * arc;
      const r = outer - 0.6 - rand() * 1.8;
      tufts.push({ pos: [center[0] + Math.sin(a) * r, top - 0.05, center[1] + Math.cos(a) * r], scale: [0.25, 0.45 + rand() * 0.2, 0.25] });
    }
    instances(root, `Rice${i}`, new SphereGeometry(1, 6, 5, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x6ac04a, { rough: 0.9 }), tufts);
  }
  // Dry ground behind the player's bund, and the valley floor below.
  put(root, 'Hilltop', sector(70.3, 100, -arc / 2, arc / 2, 2), earth, [center[0], -2, center[1]]);
  disc(root, 'Valley', 195, mat(0x5a7a42, { rough: 1 }), -21);
  // Misty hills and a few trees.
  const hills: Placement[] = [];
  for (let i = 0; i < 18; i++) {
    const a = -Math.PI / 2 + (i / 17) * Math.PI;
    hills.push({ pos: [Math.sin(a) * 160, -24, -Math.cos(a) * 160], scale: [40 + rand() * 30, 30 + rand() * 30, 30] });
  }
  instances(root, 'Hills', new SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x7a9a8a, { rough: 1 }), hills);
  instances(root, 'Trees', new DodecahedronGeometry(1, 1), mat(0x3a6a3a, { rough: 1 }), [
    { pos: [-9, 1.6, 4], scale: [1.8, 2.2, 1.8] }, { pos: [8, 1.4, 5], scale: [1.6, 2, 1.6] }, { pos: [12, 1.8, 1], scale: [2, 2.4, 2] },
  ]);
  skyBody(root, 'Sun', [60, 70, -140], 6, 0xffffff, 0xfff4d8, 3);
  return root;
}
