import { AdditiveBlending, BoxGeometry, ConeGeometry, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial } from '@iwsdk/core';
import { block, disc, glow, instances, mat, noiseTexture, type Placement, put, seededRandom, sign, stars } from './lib/set-kit.js';

/**
 * Drive-in cinema: a gravel lot with rows of speaker posts, a giant glowing
 * screen ahead, the projection booth behind throwing a beam over the lot, a
 * snack bar to one side and a starry sky.
 */
export function createDriveInSet(): Group {
  const root = new Group();
  root.name = 'DriveInSet';
  const rand = seededRandom(521);
  const gravel = noiseTexture([110, 104, 96], 40, 522);
  gravel.repeat.set(50, 50);
  disc(root, 'Lot', 160, mat(0xffffff, { map: gravel, rough: 1 }), 0);
  const grass = noiseTexture([46, 70, 40], 30, 523);
  grass.repeat.set(40, 40);
  put(root, 'Field', new CylinderGeometry(195, 195, 0.02, 64), mat(0xffffff, { map: grass, rough: 1 }), [0, -0.03, 0]);

  // Screen: a huge panel on a steel frame 40 m ahead.
  const screen = new Group();
  screen.name = 'Screen';
  screen.position.set(0, 0, -42);
  root.add(screen);
  put(screen, 'Face', new BoxGeometry(32, 14, 0.2), mat(0xf4f2ea, { emissive: 0xc8d8ff, glow: 0.55, rough: 0.9 }), [0, 11, 0]);
  block(screen, 'Back', [33, 15, 0.4], mat(0x2a2a2e), [0, 3.5, -0.4]);
  const legs: Placement[] = [];
  for (const x of [-15, -7.5, 0, 7.5, 15]) legs.push({ pos: [x, 0, -0.8] });
  instances(screen, 'Legs', new BoxGeometry(0.5, 4, 0.5).translate(0, 2, 0), mat(0x3a3a3e, { metal: 0.6 }), legs);

  // Speaker posts in curved rows across the lot.
  const posts: Placement[] = [];
  const speakers: Placement[] = [];
  for (let row = 0; row < 6; row++) {
    const r = 18 + row * 7;
    for (let k = -6; k <= 6; k++) {
      const a = k * 0.12;
      const x = Math.sin(a) * r;
      const z = -42 + Math.cos(a) * r;
      if (Math.hypot(x, z) < 2.5) continue;
      posts.push({ pos: [x, 0, z] });
      for (const s of [-1, 1]) speakers.push({ pos: [x + s * 0.18, 1.05, z], rotDeg: [0, (a * 180) / Math.PI, 0] });
    }
  }
  instances(root, 'SpeakerPosts', new CylinderGeometry(0.05, 0.06, 1.1, 8).translate(0, 0.55, 0), mat(0x6a6e72, { metal: 0.6 }), posts);
  instances(root, 'Speakers', new BoxGeometry(0.2, 0.26, 0.1), mat(0x8a8e94, { metal: 0.5, rough: 0.4 }), speakers);

  // Projection booth and its beam, behind the player.
  block(root, 'Booth', [8, 4, 6], mat(0xd8d0c0, { rough: 0.8 }), [0, 0, 12]);
  block(root, 'SnackBar', [10, 3.2, 5], mat(0xd84a3a, { rough: 0.7 }), [-22, 0, 4], 20);
  sign(root, 'SnackSign', 'SNACKS', 1, [255, 240, 200], [200, 40, 40, 255], [-21.1, 3.8, 6.4], [0, 20, 0], true);
  instances(root, 'BoothWindow', new BoxGeometry(1.2, 0.6, 0.05), glow(0xfff0c8), [{ pos: [0, 2.6, 8.97] }]);
  const cone = new ConeGeometry(7, 54, 24, 4, true);
  cone.translate(0, -27, 0);
  const colors: number[] = [];
  const pos = cone.getAttribute('position');
  for (let k = 0; k < pos.count; k++) {
    const t = 1 + pos.getY(k) / 54;
    const c = 0.03 + Math.pow(t, 2) * 0.1;
    colors.push(c * 0.8, c * 0.85, c);
  }
  cone.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const beam = new Mesh(cone, new MeshBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }));
  beam.name = 'ProjectorBeam';
  beam.position.set(0, 2.6, 9);
  // The cone hangs along -Y; tip it forward and up toward the screen center.
  beam.rotation.x = Math.PI / 2 + Math.atan2(11 - 2.6, 51);
  beam.userData.iwsdkPreviewBounds = 'exclude';
  root.add(beam);
  // Trees ringing the lot.
  const trees: Placement[] = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 + rand() * 0.1;
    trees.push({ pos: [Math.sin(a) * 90, 4, -Math.cos(a) * 90 - 20], scale: [4, 6 + rand() * 3, 4] });
  }
  instances(root, 'Trees', new ConeGeometry(1, 1.6, 8), mat(0x1a2a1a, { rough: 1 }), trees);
  stars(root, 1600, 185, 524);
  return root;
}
