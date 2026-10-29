import { BoxGeometry, CylinderGeometry, Group, SphereGeometry } from '@iwsdk/core';
import { paramSurface } from './lib/theatre-kit.js';
import { block, clockFaceTexture, disc, glow, instances, mat, noiseTexture, type Placement, put, seededRandom, skyBody, span } from './lib/set-kit.js';

/**
 * Surreal desert: endless flat sand, a lone door standing open onto light,
 * a clock melting over the branch of a dead tree and an enormous moon on the
 * horizon.
 */
export function createSurrealDesertSet(): Group {
  const root = new Group();
  root.name = 'SurrealDesertSet';
  const rand = seededRandom(301);

  const sand = noiseTexture([232, 196, 160], 22, 302);
  sand.repeat.set(60, 60);
  disc(root, 'Sand', 195, mat(0xffffff, { map: sand, rough: 1 }), 0);
  const dunes: Placement[] = [];
  for (let i = 0; i < 18; i++) {
    const a = rand() * Math.PI * 2;
    const r = 25 + rand() * 120;
    dunes.push({ pos: [Math.sin(a) * r, -0.6, Math.cos(a) * r], scale: [10 + rand() * 20, 1.2 + rand() * 2, 6 + rand() * 10], rotDeg: [0, rand() * 180, 0] });
  }
  instances(root, 'Dunes', new SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xe6c09a, { rough: 1 }), dunes);

  // The door: frame, a slab swung half open, and light inside the frame.
  const door = new Group();
  door.name = 'LoneDoor';
  door.position.set(-2.6, 0, -5.5);
  door.rotation.y = 0.35;
  root.add(door);
  const frameMat = mat(0xf2ece0, { rough: 0.6 });
  block(door, 'JambLeft', [0.12, 2.2, 0.16], frameMat, [-0.51, 0, 0]);
  block(door, 'JambRight', [0.12, 2.2, 0.16], frameMat, [0.51, 0, 0]);
  block(door, 'Head', [1.14, 0.12, 0.16], frameMat, [0, 2.2, 0]);
  put(door, 'Light', new BoxGeometry(0.9, 2.2, 0.02), glow(0xfff6e0), [0, 1.1, 0]);
  const slab = new Group();
  slab.name = 'DoorSlab';
  slab.position.set(-0.45, 0, 0.06);
  slab.rotation.y = 1.1;
  door.add(slab);
  block(slab, 'Panel', [0.9, 2.18, 0.05], mat(0x3a6a8a, { rough: 0.5 }), [0.45, 0, 0]);
  put(slab, 'Knob', new SphereGeometry(0.035, 12, 8), mat(0xc8a050, { metal: 0.9, rough: 0.3 }), [0.8, 1, 0.05]);
  put(root, 'DoorGlow', new CylinderGeometry(1.4, 1.4, 0.01, 32), glow(0xfff0d0, 0.18, true), [-2.4, 0.01, -4.9]);

  // A dead tree to the right, one branch held out level.
  const bark = mat(0x5a4636, { rough: 1 });
  const twigs: Placement[] = [
    span([3.2, 0, -6], [3.4, 1.4, -6.1], 0.16),
    span([3.4, 1.4, -6.1], [2.0, 1.55, -6.1], 0.08),
    span([3.4, 1.4, -6.1], [4.2, 2.8, -6.3], 0.07),
    span([4.2, 2.8, -6.3], [4.8, 3.4, -6.2], 0.04),
  ];
  instances(root, 'Tree', new CylinderGeometry(0.6, 1, 1, 8), bark, twigs);
  // The melting clock lies on the branch and sags toward the player (+Z).
  const dial = clockFaceTexture([240, 230, 200], [40, 40, 60], -100, 30);
  const clock = paramSurface(40, 12, (u, v, out) => {
    const a = u * Math.PI * 2;
    const r = v * 0.45;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const over = Math.max(0, z - 0.04);
    out.set(x * (1 - over * 0.4), -over * over * 6 - over * 0.6, z);
  });
  // Map polar (u, v) onto the square dial texture.
  const uv = clock.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) {
    const a = uv.getX(i) * Math.PI * 2;
    const r = uv.getY(i) * 0.5;
    uv.setXY(i, 0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r);
  }
  put(root, 'MeltingClock', clock, mat(0xffffff, { map: dial, rough: 0.5, double: true }), [2.7, 1.54, -6.14]);

  skyBody(root, 'Moon', [10, 18, -180], 46, 0xf6e6d0, 0x6a5a78, 1.25);
  put(root, 'Obelisk', new CylinderGeometry(0.4, 1, 14, 4), mat(0x2a2a3a), [30, 7, -90], [0, 45, 0]);
  return root;
}
