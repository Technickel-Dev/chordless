import {
  AdditiveBlending,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
} from '@iwsdk/core';
import { disc, glow, instances, mat, noiseTexture, type Placement, put, seededRandom } from './lib/set-kit.js';

/**
 * Underwater: a sandy seabed, a few clusters of branching and brain coral,
 * shafts of light slanting down from the surface and rising bubbles. The
 * scene's DomeFade on this node supplies the blue murk with distance.
 */
export function createUnderwaterSet(): Group {
  const root = new Group();
  root.name = 'UnderwaterSet';
  const rand = seededRandom(131);

  const sandMap = noiseTexture([200, 184, 140], 36, 132);
  sandMap.repeat.set(50, 50);
  disc(root, 'Seabed', 120, mat(0xffffff, { map: sandMap, rough: 1 }), 0);
  // Gentle dunes so the floor isn't a flat plate.
  const dunes: Placement[] = [];
  for (let i = 0; i < 40; i++) {
    const a = rand() * Math.PI * 2;
    const r = 6 + rand() * 50;
    dunes.push({ pos: [Math.sin(a) * r, -0.4, Math.cos(a) * r], scale: [3 + rand() * 6, 0.7 + rand() * 0.6, 3 + rand() * 6] });
  }
  instances(root, 'Dunes', new SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xffffff, { map: sandMap, rough: 1 }), dunes);

  // Coral clusters: branching fingers, brain domes and fan plates.
  const clusters: [number, number][] = [[-3.2, -4.5], [3.8, -5.5], [-6.5, -1], [6.2, -0.5], [0.5, -9], [-4, 4.5], [4.5, 5]];
  const fingers: Placement[] = [];
  const domes: Placement[] = [];
  const fans: Placement[] = [];
  const pinks = [0xff6f91, 0xff9f5a, 0xc86bfa, 0xffd166, 0x5ad1c8];
  for (const [cx, cz] of clusters) {
    for (let i = 0; i < 14; i++) {
      const s = 0.4 + rand() * 0.8;
      fingers.push({
        pos: [cx + (rand() - 0.5) * 1.6, 0, cz + (rand() - 0.5) * 1.6],
        rotDeg: [(rand() - 0.5) * 50, rand() * 360, (rand() - 0.5) * 50],
        scale: [s, s * (1 + rand()), s],
        color: pinks[Math.floor(rand() * 3)],
      });
    }
    for (let i = 0; i < 3; i++) {
      const s = 0.4 + rand() * 0.5;
      domes.push({ pos: [cx + (rand() - 0.5) * 2, 0, cz + (rand() - 0.5) * 2], scale: [s, s * 0.7, s], color: pinks[3 + (i % 2)] });
    }
    fans.push({ pos: [cx + (rand() - 0.5), 0, cz + (rand() - 0.5)], rotDeg: [0, rand() * 360, 0], scale: 0.8 + rand() * 0.8, color: 0x8a5ad9 });
  }
  const finger = new CylinderGeometry(0.05, 0.12, 1, 7);
  finger.translate(0, 0.5, 0);
  instances(root, 'CoralFingers', finger, mat(0xffffff, { rough: 0.8 }), fingers);
  instances(root, 'BrainCoral', new IcosahedronGeometry(1, 2), mat(0xffffff, { rough: 0.95 }), domes);
  const fan = new CylinderGeometry(0.8, 0.8, 0.03, 20, 1, false, -Math.PI / 2, Math.PI);
  fan.rotateX(Math.PI / 2);
  fan.translate(0, 0.1, 0);
  instances(root, 'SeaFans', fan, mat(0xffffff, { rough: 0.9, double: true }), fans);

  // Light shafts: tall slanted quads, bright at the top and fading out.
  const shaftMat = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
  });
  for (let i = 0; i < 9; i++) {
    const w = 1 + rand() * 2.4;
    const g = new CylinderGeometry(w, w * 0.4, 18, 16, 6, true);
    const colors: number[] = [];
    const pos = g.getAttribute('position');
    for (let k = 0; k < pos.count; k++) {
      const t = (pos.getY(k) + 9) / 18;
      const c = Math.pow(t, 1.8) * 0.16;
      colors.push(c * 0.6, c * 0.95, c);
    }
    g.setAttribute('color', new Float32BufferAttribute(colors, 3));
    const a = rand() * Math.PI * 2;
    const r = 4 + rand() * 14;
    const shaft = new Mesh(g, shaftMat);
    shaft.name = 'LightShaft';
    shaft.position.set(Math.sin(a) * r, 9, Math.cos(a) * r - 4);
    shaft.rotation.set(0.25, 0, 0.18);
    shaft.userData.iwsdkPreviewBounds = 'exclude';
    root.add(shaft);
  }

  // Bubble streams rising from a few coral heads.
  const bubbles: Placement[] = [];
  for (const [cx, cz] of clusters.slice(0, 5)) {
    for (let i = 0; i < 18; i++) {
      bubbles.push({ pos: [cx + Math.sin(i * 1.7) * 0.15, 0.8 + i * 0.55 + rand() * 0.2, cz + Math.cos(i * 1.3) * 0.15], scale: 0.5 + rand() });
    }
  }
  instances(root, 'Bubbles', new SphereGeometry(0.04, 8, 6), glow(0xd8f8ff, 0.7), bubbles);
  put(root, 'Surface', new CylinderGeometry(120, 120, 0.05, 48), glow(0x5ab8d8, 0.25), [0, 18, 0]);
  return root;
}
