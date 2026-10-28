import { BoxGeometry, CylinderGeometry, Group, LatheGeometry, SphereGeometry, TorusGeometry, Vector2 } from '@iwsdk/core';
import { block, mat, plankTexture, post, put, room, tileTexture } from './lib/set-kit.js';

/**
 * Giant's kitchen table: the player is mouse-sized on a vast wooden tabletop,
 * with a teacup, a fork and a salt shaker towering around them.
 */
export function createGiantTableSet(): Group {
  const root = new Group();
  root.name = 'GiantTableSet';

  const top = plankTexture([164, 112, 66], 6, 81);
  top.repeat.set(1, 1);
  block(root, 'Tabletop', [70, 2, 46], mat(0xffffff, { map: top, rough: 0.55 }), [0, -2, -8]);
  // The far kitchen: checker floor way below, cream walls and a window glow.
  const floor = tileTexture([230, 226, 214], [60, 64, 72], 16);
  floor.repeat.set(4, 4);
  const kitchen = room(root, 'Kitchen', [240, 120, 240], mat(0xe9dcc0), mat(0xffffff, { map: floor }), mat(0xf4efe4), [0, -8]);
  kitchen.position.y = -40;
  for (const [x, z] of [[-30, -27], [30, -27], [-30, 11], [30, 11]]) {
    post(root, 'TableLeg', 2.4, 38, mat(0x8a5a36), [x, -40, z], 2.4, 16);
  }
  put(root, 'Window', new BoxGeometry(60, 40, 0.5), mat(0xbfe4ff, { emissive: 0xbfe4ff, glow: 0.8 }), [0, 30, -127.5]);
  put(root, 'WindowBarV', new BoxGeometry(1.5, 40, 0.8), mat(0xf4efe4), [0, 30, -127.3]);
  put(root, 'WindowBarH', new BoxGeometry(60, 1.5, 0.8), mat(0xf4efe4), [0, 30, -127.3]);

  // Teacup with saucer, ahead and to the left.
  const china = mat(0xf6f3ee, { rough: 0.25 });
  const cup = new Group();
  cup.name = 'Teacup';
  cup.position.set(-7, 0, -11);
  root.add(cup);
  const saucer = new LatheGeometry(
    [new Vector2(0, 0), new Vector2(5.4, 0), new Vector2(6.6, 0.5), new Vector2(6.5, 0.6), new Vector2(5.2, 0.25), new Vector2(0, 0.25)],
    64,
  );
  put(cup, 'Saucer', saucer, china);
  const profile = [
    new Vector2(0, 0.25),
    new Vector2(2.2, 0.25),
    new Vector2(2.4, 0.6),
    new Vector2(3.4, 2),
    new Vector2(4.1, 4.2),
    new Vector2(4.2, 4.6),
    new Vector2(4.0, 4.6),
    new Vector2(3.9, 4.3),
    new Vector2(3.2, 2.2),
    new Vector2(0, 1.6),
  ];
  put(cup, 'Cup', new LatheGeometry(profile, 64), china);
  put(cup, 'Tea', new CylinderGeometry(3.95, 3.95, 0.05, 64), mat(0x7a4518, { rough: 0.1 }), [0, 3.9, 0]);
  put(cup, 'Handle', new TorusGeometry(1.3, 0.35, 12, 32, Math.PI * 1.2), china, [4.2, 2.6, 0], [0, 0, -100]);
  put(cup, 'Rim', new TorusGeometry(4.12, 0.06, 8, 96), mat(0xd4a640, { metal: 0.9, rough: 0.3 }), [0, 4.6, 0], [90, 0, 0]);

  // Fork lying flat across the table to the right.
  const steel = mat(0xd4d8dc, { metal: 0.95, rough: 0.2 });
  const fork = new Group();
  fork.name = 'Fork';
  fork.position.set(6, 0, -6);
  fork.rotation.y = 0.6;
  root.add(fork);
  block(fork, 'Handle', [1.1, 0.35, 9], steel, [0, 0, 4.5]);
  block(fork, 'Neck', [0.8, 0.35, 2.4], steel, [0, 0, -1.2]);
  block(fork, 'Head', [2.6, 0.3, 1.2], steel, [0, 0, -2.9]);
  for (const x of [-1.05, -0.35, 0.35, 1.05]) block(fork, 'Tine', [0.38, 0.3, 3.6], steel, [x, 0, -5.3]);

  // Salt shaker, tall, behind the fork.
  const shaker = new Group();
  shaker.name = 'SaltShaker';
  shaker.position.set(9, 0, -16);
  root.add(shaker);
  const glass = mat(0xe6f2f6, { rough: 0.08 });
  glass.transparent = true;
  glass.opacity = 0.45;
  glass.depthWrite = false;
  post(shaker, 'Salt', 1.9, 4, mat(0xf8f8f8, { rough: 1 }), [0, 0.1, 0], 1.9, 32);
  post(shaker, 'Glass', 2, 7, glass, [0, 0, 0], 1.8, 32);
  post(shaker, 'Cap', 1.85, 1.2, steel, [0, 7, 0], 1.85, 32);
  put(shaker, 'CapDome', new SphereGeometry(1.85, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), steel, [0, 8.2, 0]);
  // Crumbs.
  for (const [x, z, s] of [[2, -3, 0.25], [-2.5, -4, 0.35], [3.2, -9, 0.3], [-1, -7, 0.2]]) {
    put(root, 'Crumb', new SphereGeometry(s, 6, 4), mat(0xd6a45a, { rough: 1 }), [x, s * 0.5, z]);
  }
  return root;
}
