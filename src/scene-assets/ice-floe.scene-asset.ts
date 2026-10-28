import { DodecahedronGeometry, ExtrudeGeometry, Group, Shape } from '@iwsdk/core';
import { disc, instances, mat, noiseTexture, type Placement, put, seededRandom } from './lib/set-kit.js';

/**
 * Ice floe: one flat, ragged slab of ice on dark open water, with a handful
 * of icebergs on the horizon under a pale polar sky.
 */
export function createIceFloeSet(): Group {
  const root = new Group();
  root.name = 'IceFloeSet';
  const rand = seededRandom(61);

  // The floe: a ragged outline about 4.5 m across, 0.7 m thick, top at y = 0.
  const outline = new Shape();
  const n = 26;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 4.2 + Math.sin(a * 3 + 1) * 0.5 + (rand() - 0.5) * 0.7;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) outline.moveTo(x, y);
    else outline.lineTo(x, y);
  }
  const slab = new ExtrudeGeometry(outline, { depth: 0.7, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.15, bevelSegments: 2 });
  slab.rotateX(Math.PI / 2);
  slab.translate(0, -0.12, 0);
  const snowMap = noiseTexture([236, 244, 250], 18, 62);
  snowMap.repeat.set(0.3, 0.3);
  put(root, 'Floe', slab, mat(0xdce8f0, { map: snowMap, rough: 0.7 }));

  // Small broken chunks drifting nearby.
  const chunks: Placement[] = [];
  for (let i = 0; i < 14; i++) {
    const a = rand() * Math.PI * 2;
    const r = 6 + rand() * 10;
    const s = 0.25 + rand() * 0.6;
    chunks.push({ pos: [Math.cos(a) * r, -0.3, Math.sin(a) * r], rotDeg: [rand() * 30, rand() * 360, 0], scale: [s * 1.4, s * 0.5, s] });
  }
  const ice = mat(0xe8f6ff, { rough: 0.35 });
  instances(root, 'Chunks', new DodecahedronGeometry(1, 0), ice, chunks);

  // Icebergs far off: chunky, flattened, mostly ahead.
  const bergs: Placement[] = [
    { pos: [-30, -2, -70], rotDeg: [0, 20, 0], scale: [14, 10, 9] },
    { pos: [18, -2, -95], rotDeg: [0, 70, 0], scale: [20, 16, 12] },
    { pos: [55, -2, -60], rotDeg: [0, 40, 0], scale: [10, 7, 8] },
    { pos: [-70, -2, -30], rotDeg: [0, 10, 0], scale: [12, 12, 10] },
    { pos: [75, -2, 20], rotDeg: [0, 80, 0], scale: [16, 9, 10] },
    { pos: [-45, -2, 60], rotDeg: [0, 50, 0], scale: [12, 8, 9] },
  ];
  instances(root, 'Icebergs', new DodecahedronGeometry(1, 1), mat(0xcfe4f2, { rough: 0.6 }), bergs);

  disc(root, 'Sea', 190, mat(0x06121e, { rough: 0.32 }), -0.35);
  return root;
}
