import {
  AdditiveBlending,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  MeshBasicMaterial,
  SphereGeometry,
  Vector2,
} from '@iwsdk/core';
import { blobTexture, glow, instances, mat, noiseTexture, type Placement, put, seededRandom } from './lib/set-kit.js';

/**
 * Volcano rim: a ledge of black rock on the lip of a crater, a lake of lava
 * glowing far below and embers drifting up through the dark.
 */
export function createVolcanoRimSet(): Group {
  const root = new Group();
  root.name = 'VolcanoRimSet';
  const rand = seededRandom(201);
  const basalt = mat(0xffffff, { map: noiseTexture([46, 40, 38], 30, 202), rough: 1 });

  // The ledge the player stands on, flat on top.
  put(root, 'Ledge', new CylinderGeometry(3.2, 4.5, 2.5, 9), basalt, [0, -1.25, 0.6]);
  const rubble: Placement[] = [];
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const r = 3.4 + rand() * 4;
    const s = 0.4 + rand() * 1.1;
    rubble.push({ pos: [Math.sin(a) * r, -0.3 - rand() * 0.6, Math.cos(a) * r + 1], rotDeg: [rand() * 90, rand() * 360, 0], scale: [s, s * 0.8, s] });
  }
  instances(root, 'Rubble', new DodecahedronGeometry(1, 0), basalt, rubble);

  // Crater: a lathed bowl centered ahead, its near rim just below the ledge.
  const profile = [
    new Vector2(28, -30),
    new Vector2(32, -21),
    new Vector2(38, -11),
    new Vector2(43, -4),
    new Vector2(46, -1),
    new Vector2(52, -2),
    new Vector2(70, -16),
    new Vector2(110, -50),
  ];
  put(root, 'Crater', new LatheGeometry(profile, 96), mat(0xffffff, { map: noiseTexture([58, 48, 44], 40, 203), rough: 1, double: true }), [0, 0, -46]);
  const lavaMap = blobTexture([255, 110, 20], [[255, 200, 60], [120, 30, 10], [60, 16, 8]], 120, 10, 204, 256);
  lavaMap.repeat.set(4, 4);
  const lava = glow(0xffffff);
  lava.map = lavaMap;
  put(root, 'Lava', new CylinderGeometry(29, 29, 0.5, 64), lava, [0, -29.5, -46]);
  // Lava light climbing the lower crater walls: an additive skirt just inside them.
  const skirt = new LatheGeometry(profile.slice(0, 4).map((p) => new Vector2(p.x * 0.985, p.y)), 96);
  const skirtColors: number[] = [];
  const skirtPos = skirt.getAttribute('position');
  for (let k = 0; k < skirtPos.count; k++) {
    const t = Math.max(0, 1 - (skirtPos.getY(k) + 30) / 26);
    skirtColors.push(t * 0.9, t * 0.3, t * 0.05);
  }
  skirt.setAttribute('color', new Float32BufferAttribute(skirtColors, 3));
  const skirtMesh = put(root, 'WallGlow', skirt, new MeshBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }), [0, 0, -46]);
  skirtMesh.userData.iwsdkPreviewBounds = 'exclude';
  const haze = put(root, 'LavaGlow', new SphereGeometry(34, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), glow(0xff5a1a, 0.12, true), [0, -29.5, -46]);
  haze.userData.iwsdkPreviewBounds = 'exclude';

  // Embers rising out of the crater toward the rim.
  const embers: Placement[] = [];
  for (let i = 0; i < 900; i++) {
    const r = Math.sqrt(rand()) * 42;
    const a = rand() * Math.PI * 2;
    embers.push({ pos: [Math.sin(a) * r, -28 + Math.pow(rand(), 0.6) * 42, -46 + Math.cos(a) * r], scale: 0.5 + rand() * 1.2, color: rand() < 0.3 ? 0xffd27a : 0xff6a1a });
  }
  const sparks = instances(root, 'Embers', new SphereGeometry(0.06, 6, 4), glow(0xffffff), embers);
  sparks.userData.iwsdkPreviewBounds = 'exclude';
  // Distant peaks against the sky.
  instances(root, 'FarPeaks', new CylinderGeometry(0.15, 1, 1, 7), basalt, [
    { pos: [-120, -40, -120], scale: [40, 60, 40] },
    { pos: [130, -40, -90], scale: [50, 50, 50] },
    { pos: [60, -40, 140], scale: [40, 45, 40] },
  ]);
  return root;
}
