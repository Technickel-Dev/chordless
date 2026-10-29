import { AdditiveBlending, BoxGeometry, CylinderGeometry, Group, SphereGeometry, TorusGeometry } from '@iwsdk/core';
import { blobTexture, glow, instances, mat, type Placement, put, skyBody, stars, tileTexture } from './lib/set-kit.js';

/**
 * Space station: a round observation deck under a ribbed glass dome, the
 * Earth filling the view below and ahead, the sun off to one side and a sky
 * thick with stars.
 */
export function createSpaceStationSet(): Group {
  const root = new Group();
  root.name = 'SpaceStationSet';

  // Deck: a metal grid plate with a glowing ring inset.
  const grid = tileTexture([70, 74, 82], [62, 66, 74], 8, [40, 42, 48]);
  grid.repeat.set(3, 3);
  put(root, 'Deck', new CylinderGeometry(5.5, 5.2, 0.3, 64), mat(0xffffff, { map: grid, metal: 0.6, rough: 0.45 }), [0, -0.15, 0]);
  put(root, 'DeckRing', new TorusGeometry(4.6, 0.03, 6, 96), glow(0x5ad8ff), [0, 0.01, 0], [90, 0, 0]);
  put(root, 'Hull', new CylinderGeometry(5.2, 3, 2.5, 48), mat(0xc8ccd2, { metal: 0.7, rough: 0.35 }), [0, -1.55, 0]);

  // Dome: faint glass shell and six meridian ribs plus two rings.
  const glass = mat(0xbfe0ff, { rough: 0.05, metal: 0.2, double: true });
  glass.transparent = true;
  glass.opacity = 0.08;
  glass.depthWrite = false;
  put(root, 'DomeGlass', new SphereGeometry(5.5, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  const frame = mat(0xd8dce2, { metal: 0.8, rough: 0.3 });
  for (let i = 0; i < 6; i++) {
    put(root, 'Rib', new TorusGeometry(5.5, 0.05, 6, 64, Math.PI), frame, [0, 0, 0], [0, (i * 180) / 6, 0]);
  }
  for (const [y, r] of [[2.75, 4.76], [4.76, 2.75]]) put(root, 'DomeRing', new TorusGeometry(r, 0.04, 6, 64), frame, [0, y, 0], [90, 0, 0]);
  put(root, 'DomeBase', new TorusGeometry(5.5, 0.12, 8, 96), frame, [0, 0.02, 0], [90, 0, 0]);
  // A small console in front, off center.
  put(root, 'Console', new BoxGeometry(1.2, 0.9, 0.5), mat(0x30343c, { metal: 0.5, rough: 0.5 }), [-2.6, 0.45, -3.4], [0, 35, 0]);
  instances(root, 'ConsoleLights', new BoxGeometry(0.12, 0.06, 0.02), glow(0xffffff), [
    { pos: [-2.75, 0.75, -3.15], rotDeg: [0, 35, 0], color: 0x5aff9a },
    { pos: [-2.6, 0.75, -3.05], rotDeg: [0, 35, 0], color: 0xff5a5a },
    { pos: [-2.45, 0.75, -2.95], rotDeg: [0, 35, 0], color: 0x5ad8ff },
  ] as Placement[]);

  // The Earth: oceans with continents and clouds, plus a thin blue limb.
  const earthMap = blobTexture([24, 64, 140], [[60, 110, 50], [140, 120, 70], [70, 120, 60]], 30, 26, 191, 512);
  const earth = put(root, 'Earth', new SphereGeometry(70, 96, 64), mat(0xffffff, { map: earthMap, rough: 0.8 }), [-10, -62, -105]);
  earth.rotation.z = 0.3;
  const clouds = blobTexture([0, 0, 0], [[255, 255, 255]], 70, 14, 192, 512);
  const cloudMat = mat(0xffffff, { map: clouds, rough: 1 });
  cloudMat.transparent = true;
  cloudMat.opacity = 0.5;
  cloudMat.blending = AdditiveBlending;
  cloudMat.depthWrite = false;
  put(root, 'Clouds', new SphereGeometry(70.6, 96, 64), cloudMat, [-10, -62, -105], [0, 40, 17]);
  const limb = put(root, 'Atmosphere', new SphereGeometry(73, 96, 64), glow(0x4aa8ff, 0.16, true), [-10, -62, -105]);
  limb.userData.iwsdkPreviewBounds = 'exclude';
  // The sun is high behind the player so the Earth's near face is in daylight.
  skyBody(root, 'Sun', [-90, 70, 110], 6, 0xffffff, 0xfff2c8, 3);
  stars(root, 3000, 185, 193, -0.6, 2);
  return root;
}
