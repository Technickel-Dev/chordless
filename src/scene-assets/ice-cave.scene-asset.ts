import { ConeGeometry, DodecahedronGeometry, Group, IcosahedronGeometry } from '@iwsdk/core';
import { disc, glow, instances, mat, noiseTexture, type Placement, seededRandom } from './lib/set-kit.js';

/**
 * Ice cave: a domed chamber of blue translucent ice glowing from daylight
 * behind it, icicles hanging from the roof, a glassy floor and a bright
 * opening at the far end.
 */
export function createIceCaveSet(): Group {
  const root = new Group();
  root.name = 'IceCaveSet';
  const rand = seededRandom(461);
  const floorMap = noiseTexture([170, 210, 230], 20, 462);
  floorMap.repeat.set(10, 10);
  disc(root, 'IceFloor', 40, mat(0xffffff, { map: floorMap, rough: 0.12, metal: 0.1 }), 0);

  // Walls and roof: a shell of chunky ice blocks around an elongated dome.
  const ice = mat(0x7ac0e0, { rough: 0.2, emissive: 0x2a7ab0, glow: 0.3 });
  const chunks: Placement[] = [];
  for (let i = 0; i < 520; i++) {
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(rand());
    const dir = [Math.sin(phi) * Math.sin(theta), Math.cos(phi), -Math.sin(phi) * Math.cos(theta)];
    // Leave an opening far ahead.
    if (dir[2] < -0.85 && dir[1] < 0.35) continue;
    const s = 1.4 + rand() * 1.8;
    const r = 9 + rand() * 1.5;
    chunks.push({ pos: [dir[0] * r * 0.8, dir[1] * r * 0.62 - 0.5, dir[2] * r * 1.4 - 4], rotDeg: [rand() * 90, rand() * 360, 0], scale: [s, s * 0.8, s] });
  }
  instances(root, 'IceShell', new DodecahedronGeometry(1, 1), ice, chunks);
  const outer = mat(0x5aa8d8, { emissive: 0x3a98d8, glow: 0.5, rough: 0.5 });
  instances(root, 'BacklitIce', new IcosahedronGeometry(1, 1), outer, chunks.filter((_, i) => i % 2 === 0).map((c) => ({
    pos: [c.pos[0] * 1.12, c.pos[1] * 1.12, (c.pos[2] + 4) * 1.12 - 4],
    scale: 3,
  })));

  // Icicles hanging from the roof.
  const icicles: Placement[] = [];
  for (let i = 0; i < 160; i++) {
    const x = (rand() - 0.5) * 12;
    const z = -4 + (rand() - 0.5) * 22;
    const roof = 5.6 * Math.sqrt(Math.max(0.05, 1 - (x / 7.2) ** 2 - ((z + 4) / 12.6) ** 2)) - 0.9;
    const len = 0.4 + rand() * 1.4;
    if (roof - len < 2.4) continue;
    icicles.push({ pos: [x, roof - len / 2, z], rotDeg: [180, 0, 0], scale: [1, len, 1] });
  }
  instances(root, 'Icicles', new ConeGeometry(0.08, 1, 6), mat(0xe0f6ff, { rough: 0.05, emissive: 0x5ab8e8, glow: 0.4 }), icicles);
  // Frozen boulders on the floor and the bright mouth of the cave.
  instances(root, 'FloorIce', new DodecahedronGeometry(1, 0), ice, [
    { pos: [-3.6, 0.3, -4], scale: [0.9, 0.6, 0.8] },
    { pos: [3.2, 0.2, -6], scale: [1.1, 0.5, 0.9] },
    { pos: [-2, 0.15, -9], scale: [0.6, 0.4, 0.6] },
  ]);
  const mouth = glow(0xf0fbff);
  instances(root, 'CaveMouth', new IcosahedronGeometry(1, 2), mouth, [{ pos: [0, 1.6, -20.5], scale: [4.5, 3.4, 0.6] }]);
  return root;
}
