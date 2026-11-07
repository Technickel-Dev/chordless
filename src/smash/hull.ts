/**
 * A few contact points that hug a shape, measured from its actual vertices,
 * so what lands on the floor rests on what it really is, dents and all.
 */

import { Box3, Matrix4, Mesh, Object3D, Vector3 } from '@iwsdk/core';

const meshMatrix = new Matrix4();

/**
 * 98 directions, spread round the sphere: every (x, y, z) with components
 * from -2 to 2, less those pointing the same way as another. Between two of
 * them a round coil is under-reached by under 3% of its radius.
 */
const HULL_DIRECTIONS: number[] = [];
for (let x = -2; x <= 2; x++)
  for (let y = -2; y <= 2; y++)
    for (let z = -2; z <= 2; z++) {
      if (x === 0 && y === 0 && z === 0) continue;
      // (2, 2, 0) points as (1, 1, 0) does: keep only the smallest of each.
      if (x % 2 === 0 && y % 2 === 0 && z % 2 === 0) continue;
      const len = Math.hypot(x, y, z);
      HULL_DIRECTIONS.push(x / len, y / len, z / len);
    }
export const HULL_SIZE = HULL_DIRECTIONS.length / 3;

/**
 * The furthest point of a shape in each of HULL_SIZE directions: a few
 * points that hug it, so a round bell rests on its rim rather than on the
 * corner of a box drawn round it. A box keeps just its 8 corners.
 */
export class Hull {
  readonly points = new Float32Array(HULL_SIZE * 3);
  count = 0;
  private readonly best = new Float64Array(HULL_SIZE);

  reset(): void {
    this.best.fill(-Infinity);
    this.count = 0;
  }

  add(x: number, y: number, z: number): void {
    for (let d = 0; d < HULL_SIZE; d++) {
      const reach = HULL_DIRECTIONS[d * 3] * x + HULL_DIRECTIONS[d * 3 + 1] * y + HULL_DIRECTIONS[d * 3 + 2] * z;
      if (reach <= this.best[d]) continue;
      this.best[d] = reach;
      this.points[d * 3] = x;
      this.points[d * 3 + 1] = y;
      this.points[d * 3 + 2] = z;
    }
  }

  /** Packs the points found, dropping repeats, and sets `box` round them. */
  finish(box: Box3): void {
    box.makeEmpty();
    let n = 0;
    const p = this.points;
    for (let d = 0; d < HULL_SIZE; d++) {
      if (this.best[d] === -Infinity) continue;
      const x = p[d * 3];
      const y = p[d * 3 + 1];
      const z = p[d * 3 + 2];
      let seen = false;
      for (let i = 0; i < n && !seen; i++) seen = p[i * 3] === x && p[i * 3 + 1] === y && p[i * 3 + 2] === z;
      if (seen) continue;
      p[n * 3] = x;
      p[n * 3 + 1] = y;
      p[n * 3 + 2] = z;
      box.expandByPoint(meshBoxPoint.set(x, y, z));
      n++;
    }
    this.count = n;
  }

  /** The corners of `box`, for something with no shape of its own. */
  fromBox(box: Box3): void {
    let i = 0;
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          this.points[i++] = x;
          this.points[i++] = y;
          this.points[i++] = z;
        }
    this.count = 8;
  }
}

const meshBoxPoint = new Vector3();

/**
 * Adds every vertex of every mesh under `object` (skipping `skip`) to
 * `hull`, in the space `toRoot` maps into. Hidden helpers under it (a glow,
 * a fingertip shadow) can be parked anywhere, so they do not count;
 * `object` itself counts hidden or not, since a put-away instrument is
 * still measured.
 */
export function hullOf(object: Object3D, hull: Hull, toRoot: Matrix4, skip: Set<Object3D> | null, top = true): void {
  if (skip?.has(object) || (!top && !object.visible) || object.userData.scar) return;
  const mesh = object as Mesh;
  if (mesh.isMesh) {
    const e = meshMatrix.multiplyMatrices(toRoot, mesh.matrixWorld).elements;
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      hull.add(
        e[0] * x + e[4] * y + e[8] * z + e[12],
        e[1] * x + e[5] * y + e[9] * z + e[13],
        e[2] * x + e[6] * y + e[10] * z + e[14],
      );
    }
  }
  for (const child of object.children) hullOf(child, hull, toRoot, skip, false);
}
