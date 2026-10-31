/**
 * A 7-inch orchestral triangle and its beater. The triangle is a round
 * steel bar bent round two closed corners, open at the third, hanging on a
 * nylon loop from a clip; the beater is a steel rod with a rubber grip.
 * Spaces as in ../triangle/geometry.ts: the triangle's origin is where the
 * clip is pinched (+Y up, +Z toward the player); the beater's is where the
 * fist grips it (+X toward its tip).
 */

import {
  CatmullRomCurve3,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from '@iwsdk/core';
import { BAR, BEATER, CORNERS, TRIANGLE } from '../triangle/geometry.js';
import { bevelBox } from './lib/hardsurface.js';

/** The clip the hand pinches; the loop hangs from its bottom. */
const CLIP = { width: 0.012, height: 0.034, depth: 0.008, bottom: -0.013 };
const CORD_RADIUS = 0.0012;

const steel = () => new MeshStandardMaterial({ name: 'Steel', color: 0xd3d7dd, metalness: 1, roughness: 0.2 });

/** Builds the triangle on its loop and clip. */
export function createTriangle(): Group {
  const root = new Group();
  root.name = 'Triangle';
  const metal = steel();

  // The bar: a tube along its centre line, ends rounded.
  const line: Vector3[] = [];
  for (let i = 0; i < BAR.count; i++) line.push(new Vector3(BAR.points[i * 3], BAR.points[i * 3 + 1], BAR.points[i * 3 + 2]));
  const bar = new Mesh(new TubeGeometry(new CatmullRomCurve3(line, false, 'centripetal'), 260, TRIANGLE.barRadius, 18, false), metal);
  bar.name = 'Bar';
  root.add(bar);
  const capGeo = new SphereGeometry(TRIANGLE.barRadius, 18, 10);
  for (const [name, p] of [
    ['BaseEnd', line[0]],
    ['SideEnd', line[line.length - 1]],
  ] as const) {
    const cap = new Mesh(capGeo, metal);
    cap.name = name;
    cap.position.copy(p);
    root.add(cap);
  }

  // The loop: down the front from the clip, under the bar at the top corner, up the back.
  const under = CORNERS.top[1] - TRIANGLE.barRadius - CORD_RADIUS;
  const cy = (CLIP.bottom + under) / 2;
  const ry = (CLIP.bottom - under) / 2;
  const loopPts: Vector3[] = [];
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    // Narrow at the clip, wide enough round the bottom to wrap the bar.
    const width = 0.002 + 0.0078 * ((1 + Math.cos(a)) / 2);
    loopPts.push(new Vector3(0, cy - ry * Math.cos(a), width * Math.sin(a)));
  }
  const cord = new Mesh(
    new TubeGeometry(new CatmullRomCurve3(loopPts, true, 'centripetal'), 96, CORD_RADIUS, 8, true),
    new MeshStandardMaterial({ name: 'Nylon', color: 0xe9e3d2, roughness: 0.75, metalness: 0 }),
  );
  cord.name = 'Loop';
  root.add(cord);

  const clip = new Mesh(
    bevelBox(CLIP.width, CLIP.height, CLIP.depth, 0.0015),
    new MeshStandardMaterial({ name: 'ClipPlastic', color: 0x1d1e21, roughness: 0.55, metalness: 0.1 }),
  );
  clip.name = 'Clip';
  clip.position.y = CLIP.bottom + CLIP.height / 2;
  root.add(clip);
  return root;
}

/** Builds the beater: a steel rod along +X with a rubber grip at the butt. */
export function createBeater(): Group {
  const root = new Group();
  root.name = 'Beater';
  const butt = -BEATER.behind;
  const tip = BEATER.length - BEATER.behind;
  const along = <T extends CylinderGeometry>(g: T, from: number, to: number) => g.rotateZ(-Math.PI / 2).translate((from + to) / 2, 0, 0);

  const rod = new Mesh(along(new CylinderGeometry(BEATER.radius, BEATER.radius, tip - butt, 14), butt, tip), steel());
  rod.name = 'Rod';
  root.add(rod);
  const end = new Mesh(new SphereGeometry(BEATER.radius, 14, 8), rod.material);
  end.name = 'Tip';
  end.position.x = tip;
  root.add(end);
  const grip = new Mesh(
    along(new CylinderGeometry(BEATER.gripRadius, BEATER.gripRadius, BEATER.gripLength, 18), butt, butt + BEATER.gripLength),
    new MeshStandardMaterial({ name: 'Rubber', color: 0x161616, roughness: 0.92, metalness: 0 }),
  );
  grip.name = 'Grip';
  root.add(grip);
  return root;
}
