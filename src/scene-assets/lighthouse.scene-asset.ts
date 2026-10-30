import { AdditiveBlending, ConeGeometry, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, SphereGeometry, TorusGeometry } from '@iwsdk/core';
import { disc, glow, instances, mat, noiseTexture, type Placement, post, put, seededRandom, stripeTexture, tileTexture } from './lib/set-kit.js';

/**
 * Lighthouse gallery: the player stands on the railed walkway outside the
 * lamp room at the top of a striped tower, the great lamp glowing behind the
 * glass, its beam sweeping out over a stormy sea far below.
 */
export function createLighthouseSet(): Group {
  const root = new Group();
  root.name = 'LighthouseSet';
  const rand = seededRandom(491);
  // The lamp room sits behind the player; the gallery rings it.
  const lampZ = 3.3;
  const grating = tileTexture([60, 64, 70], [44, 48, 54], 16, [20, 22, 24]);
  grating.repeat.set(3, 3);
  put(root, 'Gallery', new CylinderGeometry(4.4, 4.2, 0.2, 48), mat(0xffffff, { map: grating, metal: 0.6, rough: 0.5 }), [0, -0.1, lampZ]);
  const iron = mat(0x1a1c20, { metal: 0.7, rough: 0.45 });
  put(root, 'Rail', new TorusGeometry(4.3, 0.04, 6, 64), iron, [0, 1.05, lampZ], [90, 0, 0]);
  put(root, 'MidRail', new TorusGeometry(4.3, 0.025, 6, 64), iron, [0, 0.55, lampZ], [90, 0, 0]);
  const posts: Placement[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    posts.push({ pos: [Math.sin(a) * 4.3, 0.52, lampZ + Math.cos(a) * 4.3] });
  }
  instances(root, 'RailPosts', new CylinderGeometry(0.03, 0.03, 1.05, 6), iron, posts);

  // Lamp room: glazing between iron mullions, the lens and a red cupola.
  const glass = mat(0xd8f0ff, { rough: 0.05, metal: 0.1 });
  glass.transparent = true;
  glass.opacity = 0.2;
  glass.depthWrite = false;
  put(root, 'Glazing', new CylinderGeometry(2, 2, 3, 32, 1, true), glass, [0, 1.9, lampZ]);
  post(root, 'Plinth', 2.1, 0.4, mat(0xf2f2ee, { rough: 0.6 }), [0, 0, lampZ], 2.1, 32);
  const mullions: Placement[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    mullions.push({ pos: [Math.sin(a) * 2.02, 1.9, lampZ + Math.cos(a) * 2.02] });
  }
  instances(root, 'Mullions', new CylinderGeometry(0.04, 0.04, 3, 6), iron, mullions);
  put(root, 'Lens', new SphereGeometry(0.9, 24, 16), mat(0xfff6d8, { emissive: 0xfff0c0, glow: 2.4 }), [0, 1.9, lampZ]).scale.set(1, 1.3, 1);
  put(root, 'Cupola', new ConeGeometry(2.6, 1.8, 32), mat(0xb02a2a, { rough: 0.5, metal: 0.3 }), [0, 4.3, lampZ]);
  put(root, 'Vane', new SphereGeometry(0.2, 10, 8), iron, [0, 5.3, lampZ]);

  // The tower below, striped red and white.
  const stripes = stripeTexture([240, 240, 236], [190, 40, 40], 2, 64);
  stripes.rotation = Math.PI / 2;
  stripes.repeat.set(1, 4);
  post(root, 'Tower', 3.6, 46, mat(0xffffff, { map: stripes, rough: 0.6 }), [0, -46.2, lampZ], 2.9, 40);
  // Rocks and the stormy sea.
  disc(root, 'Sea', 195, mat(0x1a2c3a, { rough: 0.3, metal: 0.2 }), -46);
  instances(root, 'Rocks', new SphereGeometry(1, 12, 8), mat(0xffffff, { map: noiseTexture([70, 66, 62], 30, 492) }), Array.from({ length: 16 }, () => {
    const a = rand() * Math.PI * 2;
    const r = 6 + rand() * 8;
    const s = 2 + rand() * 4;
    return { pos: [Math.sin(a) * r, -47, lampZ + Math.cos(a) * r], scale: [s, s * 0.6, s] } as Placement;
  }));
  const whitecaps: Placement[] = [];
  for (let i = 0; i < 200; i++) {
    const a = rand() * Math.PI * 2;
    const r = 15 + Math.sqrt(rand()) * 170;
    whitecaps.push({ pos: [Math.sin(a) * r, -45.95, Math.cos(a) * r], rotDeg: [0, rand() * 180, 0], scale: [1 + rand() * 3, 1, 0.3 + rand() * 0.5] });
  }
  instances(root, 'Whitecaps', new CylinderGeometry(1, 1, 0.02, 10), mat(0xe8eef2, { rough: 0.8 }), whitecaps);

  // Beam: a long additive cone out over the sea, ahead and to the left.
  const cone = new ConeGeometry(9, 150, 32, 6, true);
  cone.translate(0, -75, 0);
  const colors: number[] = [];
  const pos = cone.getAttribute('position');
  for (let k = 0; k < pos.count; k++) {
    const t = 1 + pos.getY(k) / 150;
    const c = Math.pow(t, 2) * 0.05;
    colors.push(c, c * 0.96, c * 0.82);
  }
  cone.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const beam = new Mesh(cone, new MeshBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }));
  beam.name = 'Beam';
  // The cone hangs along -Y from its apex; tip it out level, then swing the
  // pivot at the lamp so the beam passes well to the player's left.
  beam.rotation.x = Math.PI / 2 - 0.06;
  const pivot = new Group();
  pivot.name = 'BeamPivot';
  pivot.position.set(0, 1.9, lampZ);
  pivot.rotation.y = 0.55;
  pivot.add(beam);
  beam.userData.iwsdkPreviewBounds = 'exclude';
  root.add(pivot);
  put(root, 'LensFlare', new SphereGeometry(1.6, 16, 12), glow(0xfff0c0, 0.12, true), [0, 1.9, lampZ]).userData.iwsdkPreviewBounds = 'exclude';
  return root;
}
