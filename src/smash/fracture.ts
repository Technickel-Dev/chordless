/**
 * Splits meshes into the chunks they will break into, built once, hidden, and
 * looking exactly like the original until they are swapped in. Each triangle
 * goes to its nearest seed point, with long triangles cut small first, so a
 * chunk of a hollow body is a piece of its shell with a ragged edge. The
 * chunks are double-sided: through the hole one leaves, you see inside.
 */

import { BufferAttribute, BufferGeometry, Material, Mesh, Object3D, Vector3 } from '@iwsdk/core';
import { seededRandom } from '../guitar/smash.js';

/** Stops a dense mesh being cut up without end. */
const MAX_TRIANGLES = 60000;
/** Candidates tried for each seed; the one furthest from the others wins, spreading them evenly. */
const SEED_TRIES = 12;

interface Soup {
  source: Mesh;
  /** Flat: three vertices per triangle. */
  positions: number[];
  normals: number[];
  uvs: number[] | null;
  /** Each triangle's middle, in world space. */
  middles: number[];
}

/** Every mesh under `objects` that can break: visible, solid and of one material. */
export function breakableMeshes(objects: Object3D[]): Mesh[] {
  const meshes: Mesh[] = [];
  const visit = (o: Object3D) => {
    if (!o.visible || o.userData.scar) return;
    const mesh = o as Mesh;
    if (mesh.isMesh && !Array.isArray(mesh.material)) {
      const material = mesh.material as Material & { isMeshBasicMaterial?: boolean };
      if (!material.transparent && !material.isMeshBasicMaterial) meshes.push(mesh);
    }
    for (const child of o.children) visit(child);
  };
  for (const o of objects) visit(o);
  return meshes;
}

/** Cuts a triangle's attributes in two across its longest edge until every edge is under `maxEdge`. */
function emit(soup: Soup, v: number[][], maxEdge: number, budget: { left: number }): void {
  const [a, b, c] = v;
  const length = (p: number[], q: number[]) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const ab = length(a, b);
  const bc = length(b, c);
  const ca = length(c, a);
  const longest = Math.max(ab, bc, ca);
  if (longest > maxEdge && budget.left > 0) {
    budget.left--;
    const mid = (p: number[], q: number[]) => p.map((x, i) => (x + q[i]) / 2);
    if (longest === ab) {
      const m = mid(a, b);
      emit(soup, [a, m, c], maxEdge, budget);
      emit(soup, [m, b, c], maxEdge, budget);
    } else if (longest === bc) {
      const m = mid(b, c);
      emit(soup, [a, b, m], maxEdge, budget);
      emit(soup, [a, m, c], maxEdge, budget);
    } else {
      const m = mid(c, a);
      emit(soup, [a, b, m], maxEdge, budget);
      emit(soup, [m, b, c], maxEdge, budget);
    }
    return;
  }
  for (const vertex of v) {
    soup.positions.push(vertex[0], vertex[1], vertex[2]);
    soup.normals.push(vertex[3], vertex[4], vertex[5]);
    if (soup.uvs != null) soup.uvs.push(vertex[6], vertex[7]);
  }
  const m = new Vector3((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3).applyMatrix4(soup.source.matrixWorld);
  soup.middles.push(m.x, m.y, m.z);
}

function toSoup(source: Mesh, maxEdge: number, budget: { left: number }): Soup {
  const g = source.geometry.index != null ? source.geometry.toNonIndexed() : source.geometry;
  const pos = g.attributes.position;
  if (g.attributes.normal == null) g.computeVertexNormals();
  const normal = g.attributes.normal;
  const uv = g.attributes.uv;
  const soup: Soup = { source, positions: [], normals: [], uvs: uv ? [] : null, middles: [] };
  const vertex = (i: number) => {
    const out = [pos.getX(i), pos.getY(i), pos.getZ(i), normal.getX(i), normal.getY(i), normal.getZ(i)];
    if (uv) out.push(uv.getX(i), uv.getY(i));
    return out;
  };
  for (let i = 0; i + 2 < pos.count; i += 3) emit(soup, [vertex(i), vertex(i + 1), vertex(i + 2)], maxEdge, budget);
  return soup;
}

/**
 * Builds about `pieces` chunks from `sources`. Each chunk is a list of hidden
 * meshes, one per source it has any of, beside the source in the scene and
 * posed as it is. `seed` makes the break repeatable.
 */
export function fractureMeshes(sources: Mesh[], pieces: number, maxEdge: number, seed: number): Mesh[][] {
  for (const source of sources) source.updateWorldMatrix(true, false);
  const budget = { left: MAX_TRIANGLES };
  const soups = sources.map((source) => toSoup(source, maxEdge, budget));
  const random = seededRandom(seed);

  // Seeds are triangle middles, spread out over the whole shape.
  const seeds: number[] = [];
  const pick = (): [number, number, number] => {
    const soup = soups[Math.floor(random() * soups.length)];
    const t = Math.floor(random() * (soup.middles.length / 3));
    return [soup.middles[t * 3] ?? 0, soup.middles[t * 3 + 1] ?? 0, soup.middles[t * 3 + 2] ?? 0];
  };
  for (let s = 0; s < pieces; s++) {
    let best: [number, number, number] = pick();
    let bestGap = -1;
    for (let c = 0; c < SEED_TRIES; c++) {
      const candidate = pick();
      let gap = Infinity;
      for (let k = 0; k < seeds.length; k += 3) {
        gap = Math.min(gap, Math.hypot(seeds[k] - candidate[0], seeds[k + 1] - candidate[1], seeds[k + 2] - candidate[2]));
      }
      if (gap > bestGap) {
        bestGap = gap;
        best = candidate;
      }
    }
    seeds.push(...best);
  }

  const materials = new Map<Material, Material>();
  const doubleSided = (material: Material) => {
    let clone = materials.get(material);
    if (clone == null) {
      clone = material.clone();
      clone.side = 2;
      materials.set(material, clone);
    }
    return clone;
  };

  const chunks: Mesh[][] = [];
  for (let s = 0; s < pieces; s++) chunks.push([]);
  for (const soup of soups) {
    const triangles = soup.middles.length / 3;
    const bins: number[][] = chunks.map(() => []);
    for (let t = 0; t < triangles; t++) {
      let nearest = 0;
      let best = Infinity;
      // A little noise on the distance makes the edges ragged rather than straight.
      const noise = random() * maxEdge * 0.6;
      for (let s = 0; s < pieces; s++) {
        const d =
          Math.hypot(soup.middles[t * 3] - seeds[s * 3], soup.middles[t * 3 + 1] - seeds[s * 3 + 1], soup.middles[t * 3 + 2] - seeds[s * 3 + 2]) +
          (s % 2 === 0 ? noise : 0);
        if (d < best) {
          best = d;
          nearest = s;
        }
      }
      bins[nearest].push(t);
    }
    for (let s = 0; s < pieces; s++) {
      const list = bins[s];
      if (list.length === 0) continue;
      const position = new Float32Array(list.length * 9);
      const normal = new Float32Array(list.length * 9);
      const uv = soup.uvs ? new Float32Array(list.length * 6) : null;
      list.forEach((t, i) => {
        for (let k = 0; k < 9; k++) {
          position[i * 9 + k] = soup.positions[t * 9 + k];
          normal[i * 9 + k] = soup.normals[t * 9 + k];
        }
        if (uv != null) for (let k = 0; k < 6; k++) uv[i * 6 + k] = soup.uvs![t * 6 + k];
      });
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(position, 3));
      geometry.setAttribute('normal', new BufferAttribute(normal, 3));
      if (uv != null) geometry.setAttribute('uv', new BufferAttribute(uv, 2));
      geometry.computeBoundingSphere();
      const chunk = new Mesh(geometry, doubleSided(soup.source.material as Material));
      chunk.name = 'Chunk';
      chunk.visible = false;
      chunk.position.copy(soup.source.position);
      chunk.quaternion.copy(soup.source.quaternion);
      chunk.scale.copy(soup.source.scale);
      soup.source.parent!.add(chunk);
      chunks[s].push(chunk);
    }
  }
  return chunks.filter((chunk) => chunk.length > 0);
}
