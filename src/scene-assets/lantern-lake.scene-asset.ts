import { BoxGeometry, CylinderGeometry, Group, SphereGeometry } from '@iwsdk/core';
import { disc, glow, instances, mat, type Placement, plankTexture, put, seededRandom, skyBody, stars } from './lib/set-kit.js';

/**
 * Lantern lake: the end of a short wooden dock on still black water, a field
 * of glowing paper lanterns drifting on and above the lake, low dark hills
 * on the shore and a rising moon.
 */
export function createLanternLakeSet(): Group {
  const root = new Group();
  root.name = 'LanternLakeSet';
  const rand = seededRandom(141);

  // Dock: planks from behind the player out to a little past them.
  const boards = plankTexture([110, 84, 60], 6, 142);
  put(root, 'Dock', new BoxGeometry(2.4, 0.1, 12), mat(0xffffff, { map: boards, rough: 0.85 }), [0, -0.05, 4.8]);
  const pilings: Placement[] = [];
  for (const z of [-1.1, 2, 5, 8, 10.7]) for (const x of [-1.15, 1.15]) pilings.push({ pos: [x, -0.8, z] });
  instances(root, 'Pilings', new CylinderGeometry(0.11, 0.12, 1.9, 10), mat(0x3e3024, { rough: 1 }), pilings);
  put(root, 'Lamp', new SphereGeometry(0.12, 12, 8), glow(0xffcf8a), [1.15, 0.25, -1.1]);

  disc(root, 'Lake', 190, mat(0x05080f, { rough: 0.06, metal: 0.5 }), -0.6);

  // Lanterns: most floating on the water, some drifting up into the air.
  const lanterns: Placement[] = [];
  const glowLanterns: Placement[] = [];
  const warm = [0xffb04a, 0xffc86a, 0xff9840, 0xffd890];
  while (lanterns.length < 340) {
    const a = rand() * Math.PI * 2;
    const r = 6 + Math.pow(rand(), 0.8) * 90;
    const x = Math.sin(a) * r;
    const z = -Math.cos(a) * r;
    if (Math.abs(x) < 1.6 && z > -1.5) continue; // keep the dock clear
    const flying = rand() < 0.22;
    const y = flying ? 2 + rand() * 30 : -0.55;
    const s = 0.8 + rand() * 0.5;
    const p: Placement = { pos: [x, y, z], rotDeg: [0, rand() * 360, 0], scale: s, color: warm[lanterns.length % warm.length] };
    lanterns.push(p);
    glowLanterns.push({ ...p, scale: s * 1.5 });
  }
  const paper = new CylinderGeometry(0.17, 0.13, 0.32, 10);
  paper.translate(0, 0.16, 0);
  instances(root, 'Lanterns', paper, glow(0xffffff), lanterns);
  const halo = new SphereGeometry(0.24, 10, 8);
  halo.translate(0, 0.16, 0);
  const halos = instances(root, 'LanternHalos', halo, glow(0xff9a40, 0.22, true), glowLanterns);
  halos.userData.iwsdkPreviewBounds = 'exclude';
  // Reflections on the water under the floating ones.
  const reflections = lanterns
    .filter((l) => l.pos[1] < 0)
    .map((l): Placement => ({ pos: [l.pos[0], -0.595, l.pos[2]], scale: [1, 1, 3.2], color: l.color }));
  const streak = new CylinderGeometry(0.12, 0.12, 0.005, 10);
  instances(root, 'Reflections', streak, glow(0xffffff, 0.35, true), reflections).userData.iwsdkPreviewBounds = 'exclude';

  // Low rolling hills ringing the lake.
  const hills: Placement[] = [];
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rand() * 0.2;
    const r = 150 + rand() * 25;
    const s = 22 + rand() * 25;
    hills.push({ pos: [Math.sin(a) * r, -4, -Math.cos(a) * r], scale: [s, 6 + rand() * 12, s] });
  }
  instances(root, 'Hills', new SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x070a10, { rough: 1 }), hills);
  skyBody(root, 'Moon', [-60, 55, -150], 7, 0xf4ecd8, 0x26303e, 1.5);
  stars(root, 1400, 185, 143);
  return root;
}
