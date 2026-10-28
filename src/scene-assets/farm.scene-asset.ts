import { BoxGeometry, CylinderGeometry, ExtrudeGeometry, Group, Shape } from '@iwsdk/core';
import {
  arc,
  block,
  disc,
  instances,
  mat,
  noiseTexture,
  plankTexture,
  type Placement,
  put,
  seededRandom,
  skyBody,
} from './lib/set-kit.js';

/**
 * Farm festival: a red barn, a horseshoe of hay bales in front of the player
 * and a split-rail fence ringing the yard, under a low sunset sun.
 */
export function createFarmSet(): Group {
  const root = new Group();
  root.name = 'FarmSet';
  const rand = seededRandom(11);

  const grassMap = noiseTexture([92, 128, 52], 40, 3);
  grassMap.repeat.set(60, 60);
  disc(root, 'Grass', 150, mat(0xffffff, { map: grassMap }), -0.02);
  const dirtMap = noiseTexture([132, 98, 64], 34, 4);
  dirtMap.repeat.set(6, 6);
  disc(root, 'DirtPatch', 5, mat(0xffffff, { map: dirtMap }), 0);

  // Barn: a gambrel-roofed red shed off to the left, doors facing the yard.
  const barn = new Group();
  barn.name = 'Barn';
  barn.position.set(-9, 0, -13);
  barn.rotation.y = 0.5;
  root.add(barn);
  const w = 9;
  const wallH = 4.5;
  const depth = 12;
  const profile = new Shape();
  profile.moveTo(-w / 2, 0);
  profile.lineTo(w / 2, 0);
  profile.lineTo(w / 2, wallH);
  profile.lineTo(w * 0.32, wallH + 2.2);
  profile.lineTo(0, wallH + 3.2);
  profile.lineTo(-w * 0.32, wallH + 2.2);
  profile.lineTo(-w / 2, wallH);
  const body = new ExtrudeGeometry(profile, { depth, bevelEnabled: false });
  body.translate(0, 0, -depth / 2);
  const redMap = plankTexture([168, 38, 30], 10, 5);
  redMap.repeat.set(0.12, 0.12);
  put(barn, 'Walls', body, mat(0xffffff, { map: redMap }));
  const roofMat = mat(0x3b3532, { rough: 0.9 });
  const roofPts: [number, number][] = [
    [-w / 2 - 0.3, wallH - 0.2],
    [-w * 0.32, wallH + 2.2],
    [0, wallH + 3.25],
    [w * 0.32, wallH + 2.2],
    [w / 2 + 0.3, wallH - 0.2],
  ];
  for (let i = 0; i < roofPts.length - 1; i++) {
    const [x0, y0] = roofPts[i];
    const [x1, y1] = roofPts[i + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const slab = put(barn, `Roof${i}`, new BoxGeometry(len, 0.18, depth + 0.8), roofMat, [
      (x0 + x1) / 2,
      (y0 + y1) / 2 + 0.09,
      0,
    ]);
    slab.rotation.z = Math.atan2(y1 - y0, x1 - x0);
  }
  const white = mat(0xf2eee4);
  const doorZ = depth / 2 + 0.03;
  block(barn, 'DoorFrame', [4, 3.6, 0.08], white, [0, 0, doorZ]);
  block(barn, 'Door', [3.6, 3.3, 0.1], mat(0x8e2a22), [0, 0, doorZ + 0.02]);
  for (const s of [1, -1]) {
    const brace = put(barn, `DoorX${s}`, new BoxGeometry(4.6, 0.18, 0.06), white, [0, 1.65, doorZ + 0.09]);
    brace.rotation.z = s * Math.atan2(3.3, 3.6);
  }
  block(barn, 'Loft', [1.6, 1.4, 0.1], white, [0, wallH + 0.5, doorZ]);
  block(barn, 'LoftDoor', [1.3, 1.15, 0.12], mat(0x5a1c17), [0, wallH + 0.62, doorZ + 0.02]);

  // Hay bales: a horseshoe in front, a couple stacked, a few lying loose.
  const hay = mat(0xffffff, { map: noiseTexture([214, 176, 88], 70, 6), rough: 1 });
  const baleGeo = new BoxGeometry(1.2, 0.55, 0.6);
  baleGeo.translate(0, 0.275, 0);
  const bales: Placement[] = arc(9, 3.6, -80, 80).map((p) => ({
    pos: p.pos,
    rotDeg: [0, p.rotDeg![1] + (rand() - 0.5) * 14, 0],
  }));
  bales.push(
    { pos: [-2.4, 0.55, -2.7], rotDeg: [0, 38, 0] },
    { pos: [2.5, 0.55, -2.6], rotDeg: [0, -42, 0] },
    { pos: [-6, 0, -6], rotDeg: [0, 20, 0] },
    { pos: [6.5, 0, -4], rotDeg: [0, 70, 0] },
    { pos: [5.2, 0, -8.5], rotDeg: [0, 15, 0] },
  );
  instances(root, 'HayBales', baleGeo, hay, bales);
  const twine = new BoxGeometry(0.02, 0.56, 0.62);
  twine.translate(0, 0.275, 0);
  const twinePlacements = bales.flatMap((b) => {
    const a = (b.rotDeg![1] * Math.PI) / 180;
    return [-0.3, 0.3].map(
      (o): Placement => ({
        pos: [b.pos[0] + Math.cos(a) * o, b.pos[1] + 0.003, b.pos[2] - Math.sin(a) * o],
        rotDeg: b.rotDeg,
      }),
    );
  });
  instances(root, 'BaleTwine', twine, mat(0x7a5a2c), twinePlacements);

  // Split-rail fence on a 10 m ring, open behind the player.
  const wood = mat(0x8a6a48, { rough: 0.95 });
  const posts = arc(28, 10, -170, 170);
  const postGeo = new CylinderGeometry(0.09, 0.11, 1.3, 8);
  postGeo.translate(0, 0.65, 0);
  instances(root, 'FencePosts', postGeo, wood, posts);
  const rails: Placement[] = [];
  for (let i = 0; i < posts.length - 1; i++) {
    const a = posts[i].pos;
    const b = posts[i + 1].pos;
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const yaw = (-Math.atan2(b[2] - a[2], b[0] - a[0]) * 180) / Math.PI;
    for (const y of [0.55, 1.05]) {
      rails.push({ pos: [(a[0] + b[0]) / 2, y, (a[2] + b[2]) / 2], rotDeg: [0, yaw, 0], scale: [len + 0.1, 1, 1] });
    }
  }
  instances(root, 'FenceRails', new BoxGeometry(1, 0.1, 0.06), wood, rails);

  skyBody(root, 'Sun', [40, 9, -150], 9, 0xffd28a, 0xff8a4a, 4);
  return root;
}
