import { AdditiveBlending, ConeGeometry, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial } from '@iwsdk/core';
import { paramSurface } from './lib/theatre-kit.js';
import { disc, instances, mat, noiseTexture, type Placement, seededRandom, stars } from './lib/set-kit.js';

/**
 * Northern lights: flat snow, a scatter of dark pines and rippling curtains of
 * green and violet aurora across a starry sky.
 */
export function createNorthernLightsSet(): Group {
  const root = new Group();
  root.name = 'NorthernLightsSet';
  const rand = seededRandom(121);

  const snowMap = noiseTexture([226, 234, 246], 16, 122);
  snowMap.repeat.set(40, 40);
  disc(root, 'Snow', 190, mat(0xffffff, { map: snowMap, rough: 0.9 }), 0);

  // Pines: three stacked cones on a trunk, kept clear of the player.
  const trees: Placement[] = [];
  while (trees.length < 90) {
    const a = rand() * Math.PI * 2;
    const r = 9 + Math.pow(rand(), 0.7) * 70;
    const s = 0.7 + rand() * 1.1;
    trees.push({ pos: [Math.sin(a) * r, 0, -Math.cos(a) * r], rotDeg: [0, rand() * 360, 0], scale: s });
  }
  const pine = mat(0x1d3a2c, { rough: 0.9 });
  for (const [r, h, y] of [[1.6, 2.6, 1.4], [1.25, 2.2, 2.6], [0.85, 1.9, 3.7]]) {
    const tier = new ConeGeometry(r, h, 9);
    tier.translate(0, y + h / 2, 0);
    instances(root, 'PineTier', tier, pine, trees);
  }
  const trunk = new CylinderGeometry(0.16, 0.22, 1.5, 6);
  trunk.translate(0, 0.75, 0);
  instances(root, 'PineTrunks', trunk, mat(0x3a2a20), trees);
  // Snow caps on the lowest tier.
  const cap = new ConeGeometry(1.0, 0.9, 9);
  cap.translate(0, 4.65, 0);
  instances(root, 'SnowCaps', cap, mat(0xf2f6fb, { rough: 0.9 }), trees);

  // Aurora: wavy vertical ribbons, bright at the hem and fading upward.
  const ribbon = (radius: number, from: number, to: number, base: number, height: number, phase: number, tint: [number, number, number]) => {
    const geometry = paramSurface(160, 12, (u, v, out) => {
      const a = from + (to - from) * u;
      const wave = Math.sin(u * 14 + phase) * 6 + Math.sin(u * 31 + phase * 2) * 2.5;
      const r = radius + wave;
      out.set(Math.sin(a) * r, base + v * height + Math.sin(u * 9 + phase) * 4, -Math.cos(a) * r);
    });
    const colors: number[] = [];
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      const hem = Math.pow(1 - v, 1.6) * Math.min(1, v * 12);
      const flicker = 0.55 + 0.45 * Math.sin(u * 47 + phase) * Math.sin(u * 13);
      const edge = Math.sin(Math.PI * u);
      const k = hem * flicker * edge;
      const top = Math.pow(v, 2);
      colors.push(k * (tint[0] + top * 0.6), k * Math.max(0, tint[1] - top * 0.5), k * (tint[2] + top * 0.4));
    }
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    const material = new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
      fog: false,
    });
    const mesh = new Mesh(geometry, material);
    mesh.name = 'AuroraRibbon';
    mesh.userData.iwsdkPreviewBounds = 'exclude';
    root.add(mesh);
  };
  const aurora = Math.PI / 180;
  ribbon(120, -75 * aurora, 60 * aurora, 30, 55, 0.3, [0.15, 1.0, 0.55]);
  ribbon(150, -30 * aurora, 95 * aurora, 42, 60, 2.1, [0.2, 0.9, 0.7]);
  ribbon(100, -120 * aurora, -20 * aurora, 38, 45, 4.4, [0.55, 0.35, 0.95]);
  stars(root, 1800, 180, 123);
  return root;
}
