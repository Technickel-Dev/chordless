/**
 * What a hard hit does to a piece it breaks off: rather than coming away
 * whole, it bursts into jagged fragments, small and many where it was struck
 * and fewer and bigger further away, flung out with the force of the blow.
 * Fragments tumble with tumble.ts, settle, and stay until repaired; the
 * oldest make way once there are too many.
 */

import { BufferAttribute, BufferGeometry, Box3, Material, Matrix3, Mesh, Object3D, Vector3 } from '@iwsdk/core';
import { Hull, HULL_SIZE } from './hull.js';
import { RigidBody, STAGE_FLOOR } from './tumble.js';

/** Fragments in flight or lying about at once, at most. */
const MAX_FRAGMENTS = 120;
/** Fragment mass per cubic metre of its box: light, as the shells of hollow instruments are. */
const DENSITY = 180;

interface Fragment {
  mesh: Mesh;
  body: RigidBody;
}

const doubleSided = new Map<Material, Material>();

/** A double-sided copy of a material, so a fragment of a shell shows its inside. */
function twoSided(material: Material): Material {
  if (material.side === 2) return material;
  let copy = doubleSided.get(material);
  if (copy == null) {
    copy = material.clone();
    copy.side = 2;
    doubleSided.set(material, copy);
  }
  return copy;
}

export class Splinters {
  /** Fragments made since the last repair. */
  made = 0;

  private readonly fragments: Fragment[] = [];
  private readonly hull = new Hull();
  private readonly box = new Box3();

  constructor(private readonly debrisRoot: Object3D) {}

  /**
   * Bursts the visible meshes under `piece` into about `pieces` fragments
   * around world point `at`, each moving as the piece was (velocity `v` at
   * `centre`, spin `w`) and flung out by `kick` m/s. The caller hides the piece.
   */
  burst(piece: Object3D, at: Vector3, pieces: number, v: Vector3, w: Vector3, centre: Vector3, kick: number): void {
    piece.updateMatrixWorld(true);
    const meshes: Mesh[] = [];
    piece.traverseVisible((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh && !mesh.userData.scar && !Array.isArray(mesh.material)) meshes.push(mesh);
    });
    if (meshes.length === 0) return;
    for (const part of splitAround(meshes, at, pieces)) {
      const mesh = new Mesh(part.geometry, twoSided(part.material));
      mesh.name = 'Splinter';
      mesh.position.copy(part.centre);
      this.debrisRoot.add(mesh);

      // Contact points from its own shape; mass from its size.
      const pos = part.geometry.attributes.position;
      this.hull.reset();
      for (let i = 0; i < pos.count; i++) this.hull.add(pos.getX(i), pos.getY(i), pos.getZ(i));
      this.hull.finish(this.box);
      const size = this.box.getSize(new Vector3());
      const x = Math.max(size.x, 0.01);
      const y = Math.max(size.y, 0.01);
      const z = Math.max(size.z, 0.01);
      const mass = Math.max(0.01, x * y * z * DENSITY);
      const body = new RigidBody(new Float32Array(HULL_SIZE * 3), mass, [(mass / 12) * (y * y + z * z), (mass / 12) * (x * x + z * z), (mass / 12) * (x * x + y * y)]);
      body.points.set(this.hull.points.subarray(0, this.hull.count * 3));
      body.pointCount = Math.max(1, this.hull.count);
      body.floor = STAGE_FLOOR;
      body.restitution = 0.3;
      body.setPose(part.centre.x, part.centre.y, part.centre.z, 0, 0, 0, 1);

      // Carried by the piece's motion, and thrown out from the hit: hardest close to it.
      const arm = new Vector3().subVectors(part.centre, centre);
      const u = new Vector3().copy(w).cross(arm).add(v);
      const away = new Vector3().subVectors(part.centre, at);
      const distance = away.length();
      away.y = Math.abs(away.y) + 0.35;
      away.normalize();
      const fling = kick * (0.35 + 0.65 * Math.exp(-distance / 0.08)) * (0.6 + 0.8 * Math.random());
      body.setVelocity(
        u.x + away.x * fling,
        Math.abs(u.y) * 0.3 + away.y * fling,
        u.z + away.z * fling,
        w.x + (Math.random() - 0.5) * kick * 6,
        w.y + (Math.random() - 0.5) * kick * 6,
        w.z + (Math.random() - 0.5) * kick * 6,
      );
      this.fragments.push({ mesh, body });
      this.made++;
    }
    while (this.fragments.length > MAX_FRAGMENTS) this.remove(this.fragments.shift()!);
  }

  update(dt: number): void {
    for (let i = 0; i < this.fragments.length; i++) {
      const { mesh, body } = this.fragments[i];
      if (body.asleep) continue;
      body.step(dt);
      mesh.position.set(body.p[0], body.p[1], body.p[2]);
      mesh.quaternion.set(body.q[0], body.q[1], body.q[2], body.q[3]);
    }
  }

  /** Every fragment gone, as on a repair. */
  clear(): void {
    for (const fragment of this.fragments) this.remove(fragment);
    this.fragments.length = 0;
    this.made = 0;
  }

  private remove({ mesh }: Fragment): void {
    mesh.removeFromParent();
    mesh.geometry.dispose();
  }
}

interface Part {
  geometry: BufferGeometry;
  material: Material;
  centre: Vector3;
}

/**
 * Splits meshes' triangles into about `pieces` parts around world point
 * `at`: seed points crowd close to it, so fragments there come out small and
 * those further off big. Geometry comes back in world space about each
 * part's own centre.
 */
function splitAround(meshes: Mesh[], at: Vector3, pieces: number): Part[] {
  interface Soup {
    material: Material;
    positions: number[];
    normals: number[];
    middles: number[];
  }
  const soups: Soup[] = [];
  const p = new Vector3();
  const n = new Vector3();
  const normalMatrix = new Matrix3();
  let extent = 0;
  for (const mesh of meshes) {
    const g = mesh.geometry.index != null ? mesh.geometry.toNonIndexed() : mesh.geometry;
    if (g.attributes.normal == null) g.computeVertexNormals();
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    normalMatrix.getNormalMatrix(mesh.matrixWorld);
    const soup: Soup = { material: mesh.material as Material, positions: [], normals: [], middles: [] };
    for (let i = 0; i + 2 < pos.count; i += 3) {
      let mx = 0;
      let my = 0;
      let mz = 0;
      for (let k = 0; k < 3; k++) {
        p.fromBufferAttribute(pos, i + k).applyMatrix4(mesh.matrixWorld);
        n.fromBufferAttribute(nor, i + k).applyMatrix3(normalMatrix).normalize();
        soup.positions.push(p.x, p.y, p.z);
        soup.normals.push(n.x, n.y, n.z);
        mx += p.x / 3;
        my += p.y / 3;
        mz += p.z / 3;
      }
      soup.middles.push(mx, my, mz);
      extent = Math.max(extent, Math.hypot(mx - at.x, my - at.y, mz - at.z));
    }
    soups.push(soup);
  }

  // Seeds drawn from the triangles, far likelier close to the hit.
  const near = Math.max(0.01, extent * 0.2);
  const all: number[] = [];
  const weights: number[] = [];
  let total = 0;
  for (const soup of soups) {
    for (let t = 0; t < soup.middles.length; t += 3) {
      const d = Math.hypot(soup.middles[t] - at.x, soup.middles[t + 1] - at.y, soup.middles[t + 2] - at.z);
      const weight = 1 / (d + near) ** 2;
      all.push(soup.middles[t], soup.middles[t + 1], soup.middles[t + 2]);
      total += weight;
      weights.push(total);
    }
  }
  if (all.length === 0) return [];
  const seeds: number[] = [];
  const count = Math.max(1, Math.min(pieces, all.length / 3));
  for (let s = 0; s < count; s++) {
    const r = Math.random() * total;
    let lo = 0;
    let hi = weights.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (weights[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    seeds.push(all[lo * 3], all[lo * 3 + 1], all[lo * 3 + 2]);
  }

  const parts: Part[] = [];
  for (const soup of soups) {
    const bins: number[][] = seeds.map(() => []);
    for (let t = 0; t < soup.middles.length / 3; t++) {
      let best = Infinity;
      let nearest = 0;
      // A little noise on the distance makes the breaks ragged.
      const jitter = Math.random() * near * 0.5;
      for (let s = 0; s < seeds.length / 3; s++) {
        const d =
          Math.hypot(soup.middles[t * 3] - seeds[s * 3], soup.middles[t * 3 + 1] - seeds[s * 3 + 1], soup.middles[t * 3 + 2] - seeds[s * 3 + 2]) +
          (s % 2 === 0 ? jitter : 0);
        if (d < best) {
          best = d;
          nearest = s;
        }
      }
      bins[nearest].push(t);
    }
    for (const list of bins) {
      if (list.length === 0) continue;
      const position = new Float32Array(list.length * 9);
      const normal = new Float32Array(list.length * 9);
      const centre = new Vector3();
      list.forEach((t, i) => {
        for (let k = 0; k < 9; k++) {
          position[i * 9 + k] = soup.positions[t * 9 + k];
          normal[i * 9 + k] = soup.normals[t * 9 + k];
        }
      });
      for (let i = 0; i < position.length; i += 3) centre.x += position[i], centre.y += position[i + 1], centre.z += position[i + 2];
      centre.divideScalar(position.length / 3);
      for (let i = 0; i < position.length; i += 3) {
        position[i] -= centre.x;
        position[i + 1] -= centre.y;
        position[i + 2] -= centre.z;
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(position, 3));
      geometry.setAttribute('normal', new BufferAttribute(normal, 3));
      geometry.computeBoundingSphere();
      parts.push({ geometry, material: soup.material, centre });
    }
  }
  return parts;
}
