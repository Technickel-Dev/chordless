import { BoxGeometry, CircleGeometry, CylinderGeometry, Group, TorusGeometry } from '@iwsdk/core';
import { block, glow, instances, mat, type Placement, put, room, sign, tileTexture } from './lib/set-kit.js';

/**
 * Laundromat: a wall of front-loading machines stacked two high facing the
 * player, a folding table off to the side and a buzzing neon sign.
 */
export function createLaundromatSet(): Group {
  const root = new Group();
  root.name = 'LaundromatSet';
  const floorMap = tileTexture([236, 236, 230], [60, 64, 70], 8);
  floorMap.repeat.set(5, 5);
  room(root, 'Room', [10, 3.2, 9], mat(0xe9d9a8), mat(0xffffff, { map: floorMap, rough: 0.4 }), mat(0xe6e6e0), [0, -2]);
  put(root, 'WallStripe', new BoxGeometry(10, 0.25, 0.02), mat(0x2f6fb0), [0, 1.05, -6.48]);

  // Machines along the back wall: 7 across, 2 high.
  const machines: Placement[] = [];
  for (let i = 0; i < 7; i++) for (const y of [0, 0.86]) machines.push({ pos: [(i - 3) * 0.8, y, -6.08] });
  const cabinet = new BoxGeometry(0.76, 0.84, 0.75);
  cabinet.translate(0, 0.42, 0);
  instances(root, 'MachineCabinets', cabinet, mat(0xf4f5f2, { rough: 0.35 }), machines);
  const panel = new BoxGeometry(0.76, 0.12, 0.02);
  panel.translate(0, 0.76, 0.385);
  instances(root, 'ControlPanels', panel, mat(0x8a9096, { metal: 0.6, rough: 0.35 }), machines);
  const ring = new TorusGeometry(0.25, 0.04, 10, 40);
  ring.translate(0, 0.38, 0.385);
  instances(root, 'DoorRings', ring, mat(0xb8bec4, { metal: 0.9, rough: 0.2 }), machines);
  const door = new CircleGeometry(0.24, 40);
  door.translate(0, 0.38, 0.39);
  // Half of them are mid-cycle: dark glass with suds or a colored load.
  const loads = machines.map((m, i): Placement => ({ pos: m.pos, color: [0x1f2a33, 0x3a5f8f, 0x1f2a33, 0xb04a5a, 0x2a3c2a, 0x1f2a33, 0xd8d8e0][i % 7] }));
  instances(root, 'DoorGlass', door, mat(0xffffff, { rough: 0.1 }), loads);
  const coin = new BoxGeometry(0.05, 0.03, 0.01);
  coin.translate(0.28, 0.76, 0.4);
  instances(root, 'CoinSlots', coin, glow(0xff5a3a), machines);
  put(root, 'MachineBase', new BoxGeometry(5.7, 0.06, 0.8), mat(0x6a6e72), [0, 0.03, -6.08]);

  // Folding table to the right with a neat pile of shirts.
  const table = new Group();
  table.name = 'FoldingTable';
  table.position.set(3.4, 0, -3.2);
  table.rotation.y = -0.3;
  root.add(table);
  block(table, 'Top', [1.8, 0.05, 0.8], mat(0xd8d2c4, { rough: 0.5 }), [0, 0.86, 0]);
  for (const [x, z] of [[-0.82, -0.34], [0.82, -0.34], [-0.82, 0.34], [0.82, 0.34]]) {
    put(table, 'Leg', new CylinderGeometry(0.025, 0.025, 0.86, 8), mat(0x9aa0a6, { metal: 0.8 }), [x, 0.43, z]);
  }
  const shirts = [0xd94a4a, 0xf2f2f2, 0x4a7ad9, 0x4f9a5a, 0xe8c24a];
  shirts.forEach((c, i) => block(table, 'Shirt', [0.36, 0.05, 0.3], mat(c, { rough: 1 }), [-0.45, 0.91 + i * 0.05, 0], i * 7 - 10));
  block(table, 'Basket', [0.5, 0.3, 0.38], mat(0x4fa3c8, { rough: 0.6 }), [0.45, 0.885, 0.02]);

  // Ceiling tubes and the neon sign.
  const tubes: Placement[] = [];
  for (const x of [-3, 0, 3]) for (const z of [-4.5, -1.5, 1.5]) tubes.push({ pos: [x, 3.17, z] });
  instances(root, 'CeilingTubes', new BoxGeometry(1.4, 0.04, 0.18), glow(0xf0fff6), tubes);
  sign(root, 'NeonSign', 'WASH - DRY - FOLD', 0.32, [255, 80, 180], [0, 0, 0, 0], [0, 2.45, -6.46], [0, 0, 0], true);
  sign(root, 'Notice', 'NOT RESPONSIBLE\nFOR LOST SOCKS', 0.3, [30, 30, 30], [250, 250, 236, 255], [-4.98, 1.6, -3], [0, 90, 0]);
  return root;
}
