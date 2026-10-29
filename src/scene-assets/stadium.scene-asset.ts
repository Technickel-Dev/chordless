import { AdditiveBlending, BoxGeometry, ConeGeometry, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial } from '@iwsdk/core';
import { block, glow, instances, mat, type Placement, put, seededRandom, tileTexture } from './lib/set-kit.js';

/**
 * Stadium headliner: the front of a big black stage, a dark field and bowl
 * of stands twinkling with thousands of phone lights, a wall of video
 * screens behind the player and a few beams cutting the dark.
 */
export function createStadiumSet(): Group {
  const root = new Group();
  root.name = 'StadiumSet';
  const rand = seededRandom(181);

  // Stage: deck top at y = 0, front edge 4 m ahead, the field 2 m below.
  const deck = tileTexture([22, 22, 24], [30, 30, 33], 6);
  deck.repeat.set(4, 2);
  block(root, 'StageDeck', [22, 2, 12], mat(0xffffff, { map: deck, rough: 0.5 }), [0, -2, 2]);
  block(root, 'Thrust', [5, 2, 4], mat(0xffffff, { map: deck, rough: 0.5 }), [0, -2, -5.9]);
  put(root, 'StageLip', new BoxGeometry(22, 0.05, 0.05), glow(0xff3a8a), [0, 0.02, -3.98]);
  put(root, 'ThrustLip', new BoxGeometry(5, 0.05, 0.05), glow(0xff3a8a), [0, 0.02, -7.88]);
  for (const x of [-1.2, 1.2]) block(root, 'Wedge', [0.9, 0.45, 0.6], mat(0x111114, { rough: 0.6 }), [x, 0, -3.4], 0);
  put(root, 'MicStand', new CylinderGeometry(0.012, 0.012, 1.5, 8), mat(0x222222, { metal: 0.8 }), [0, 0.75, -6.8]);

  // Field and stands as a wide bowl ahead.
  put(root, 'Field', new CylinderGeometry(110, 110, 0.1, 64), mat(0x0b0b10, { rough: 1 }), [0, -2.05, -50]);
  const bowl = new CylinderGeometry(110, 70, 45, 64, 1, true, Math.PI / 2, Math.PI);
  put(root, 'Stands', bowl, mat(0x111118, { rough: 1, double: true }), [0, 20, -40]);

  // Phone lights: dense on the field near the stage, then up the stands.
  const phones: Placement[] = [];
  const tints = [0xffffff, 0xdfe8ff, 0xfff2d8, 0xcfe0ff];
  for (let i = 0; i < 3500; i++) {
    const x = (rand() - 0.5) * 90;
    const z = -9 - Math.pow(rand(), 0.8) * 85;
    phones.push({ pos: [x, -0.45 + rand() * 0.5, z], color: tints[i % 4] });
  }
  for (let i = 0; i < 3500; i++) {
    const t = rand();
    const a = Math.PI / 2 + rand() * Math.PI;
    const r = 70 + t * 40;
    phones.push({ pos: [Math.sin(a) * r, -2 + t * 45 + 1, -40 + Math.cos(a) * r], color: tints[i % 4] });
  }
  const pts = instances(root, 'PhoneLights', new BoxGeometry(0.08, 0.12, 0.08), glow(0xffffff), phones);
  pts.userData.iwsdkPreviewBounds = 'exclude';

  // Screen wall behind the player, and one tall screen each side of the stage.
  const screens: Placement[] = [];
  const hues = [0xff3a8a, 0x7a3aff, 0x3a8aff, 0xff7a3a];
  for (let c = -5; c <= 5; c++) for (let r = 0; r < 5; r++) screens.push({ pos: [c * 1.9, 1 + r * 1.9, 7.9], color: hues[(c + 5 + r * 2) % 4] });
  instances(root, 'ScreenWall', new BoxGeometry(1.8, 1.8, 0.1), glow(0xffffff), screens);
  block(root, 'ScreenFrame', [21.2, 10, 0.3], mat(0x050507), [0, 0, 8.2]);
  for (const x of [-15, 15]) {
    block(root, 'SideScreenFrame', [6.4, 9, 0.4], mat(0x050507), [x, 2, -2], x > 0 ? -25 : 25);
    block(root, 'SideScreen', [6, 8.4, 0.1], glow(0x3a6aff), [x - Math.sign(x) * 0.12, 2.3, -2.25], x > 0 ? -25 : 25);
  }

  // Beams from the truss, crossing above the crowd.
  const beamMat = new MeshBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false });
  for (let i = 0; i < 8; i++) {
    const cone = new ConeGeometry(1.6, 40, 20, 4, true);
    cone.translate(0, -20, 0);
    const colors: number[] = [];
    const pos = cone.getAttribute('position');
    const tint = [[1, 0.3, 0.7], [0.4, 0.3, 1], [0.3, 0.7, 1]][i % 3];
    for (let k = 0; k < pos.count; k++) {
      const t = 1 + pos.getY(k) / 40;
      const c = Math.pow(t, 2) * 0.045;
      colors.push(c * tint[0], c * tint[1], c * tint[2]);
    }
    cone.setAttribute('color', new Float32BufferAttribute(colors, 3));
    const beam = new Mesh(cone, beamMat);
    beam.name = 'Beam';
    beam.position.set((i - 3.5) * 2.6, 11, 1);
    // The cone hangs along -Y from its apex; tip it forward over the crowd.
    beam.rotation.set(Math.PI / 2 - 0.35 - rand() * 0.3, 0, (i - 3.5) * 0.08);
    beam.userData.iwsdkPreviewBounds = 'exclude';
    root.add(beam);
  }
  block(root, 'Truss', [22, 0.5, 0.5], mat(0x2a2a2e, { metal: 0.8, rough: 0.4 }), [0, 11, 1]);
  return root;
}
