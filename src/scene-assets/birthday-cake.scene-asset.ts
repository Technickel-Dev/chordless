import { CapsuleGeometry, ConeGeometry, CylinderGeometry, Group, SphereGeometry, TorusGeometry } from '@iwsdk/core';
import {
  arc,
  blobTexture,
  glow,
  instances,
  mat,
  noiseTexture,
  type Placement,
  put,
  seededRandom,
  stripeTexture,
} from './lib/set-kit.js';

/**
 * Inside a giant birthday cake: the player stands on the pink frosting top,
 * ringed by oversized striped candles with lit flames, sprinkles underfoot,
 * the cake dropping away into a dark party room.
 */
export function createBirthdayCakeSet(): Group {
  const root = new Group();
  root.name = 'BirthdayCakeSet';
  const rand = seededRandom(31);
  const radius = 7;

  const frostMap = noiseTexture([246, 176, 200], 14, 32);
  frostMap.repeat.set(8, 8);
  const frosting = mat(0xffffff, { map: frostMap, rough: 0.55 });
  put(root, 'Top', new CylinderGeometry(radius, radius, 0.4, 96), frosting, [0, -0.2, 0]);
  const sponge = blobTexture([238, 214, 170], [[226, 196, 150]], 60, 5, 33);
  sponge.repeat.set(6, 2);
  put(root, 'Sponge', new CylinderGeometry(radius - 0.05, radius - 0.05, 5, 96, 1, true), mat(0xffffff, { map: sponge }), [0, -2.9, 0]);
  put(root, 'TopRoll', new TorusGeometry(radius, 0.32, 12, 96), frosting, [0, -0.05, 0], [90, 0, 0]);
  // Frosting drips over the edge.
  const drips: Placement[] = [];
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2 + rand() * 0.05;
    const len = 0.5 + rand() * 1.3;
    drips.push({ pos: [Math.sin(a) * (radius + 0.02), -0.2 - len / 2, Math.cos(a) * (radius + 0.02)], scale: [1, len, 1] });
  }
  instances(root, 'Drips', new CapsuleGeometry(0.22, 1, 4, 10), frosting, drips);
  put(root, 'Plate', new CylinderGeometry(radius + 1.6, radius + 1.8, 0.3, 96), mat(0xf4f2ee, { rough: 0.25 }), [0, -5.55, 0]);

  // Sprinkles scattered on the top, avoiding the candle ring.
  const sprinkles: Placement[] = [];
  const colors = [0xff4d6d, 0xffd23f, 0x3bceac, 0x5f6cff, 0xffffff, 0xff8c42];
  for (let i = 0; i < 700; i++) {
    const r = Math.sqrt(rand()) * (radius - 0.3);
    const a = rand() * Math.PI * 2;
    sprinkles.push({
      pos: [Math.sin(a) * r, 0.03, Math.cos(a) * r],
      rotDeg: [90, rand() * 360, 0],
      color: colors[i % colors.length],
    });
  }
  instances(root, 'Sprinkles', new CapsuleGeometry(0.025, 0.09, 2, 6), mat(0xffffff, { rough: 0.4 }), sprinkles);

  // Candles: a ring of eight in front and around, open behind the player.
  const candleMap = stripeTexture([250, 248, 240], [90, 170, 240], 8);
  candleMap.repeat.set(1, 3);
  candleMap.rotation = 0.5;
  const candles = arc(8, 4.6, -150, 150);
  const height = 3.2;
  const body = new CylinderGeometry(0.3, 0.3, height, 24);
  body.translate(0, height / 2, 0);
  instances(root, 'Candles', body, mat(0xffffff, { map: candleMap, rough: 0.5 }), candles);
  const wick = new CylinderGeometry(0.025, 0.025, 0.25, 6);
  wick.translate(0, height + 0.12, 0);
  instances(root, 'Wicks', wick, mat(0x222222), candles);
  const flame = new SphereGeometry(0.2, 16, 12);
  flame.scale(1, 2, 1);
  flame.translate(0, height + 0.55, 0);
  instances(root, 'Flames', flame, glow(0xffc65a), candles);
  const core = new ConeGeometry(0.1, 0.4, 12);
  core.translate(0, height + 0.42, 0);
  instances(root, 'FlameCores', core, glow(0xfff6d8), candles);
  const halo = new SphereGeometry(0.6, 16, 12);
  halo.translate(0, height + 0.55, 0);
  const halos = instances(root, 'FlameHalos', halo, glow(0xff9a3a, 0.18, true), candles);
  halos.userData.iwsdkPreviewBounds = 'exclude';
  return root;
}
