/**
 * The marks a hit leaves on an instrument, right where it landed: the
 * surface dents in, cracks spread across it, and chips of it fly off. Marks
 * add up over repeated hits, and cracks travel with the piece they are on
 * when it breaks away. Repairing puts the original geometry back.
 */

import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Raycaster,
  TetrahedronGeometry,
  Vector3,
} from '@iwsdk/core';
import { dentPositions } from './dent.js';
import { STAGE_FLOOR } from './tumble.js';

/** Slower hits leave no mark. */
const SCAR_SPEED = 1.2;
const DENT_PER_SPEED = 0.004;
const MAX_DENT = 0.035;
const CRACK_POOL = 24;
const CHIP_POOL = 16;
const GRAVITY = 9.81;

const raycaster = new Raycaster();
const AXES = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const;

/** A jagged star of thin dark strips, about one unit across, in the XY plane. */
function crackGeometry(seed: number): BufferGeometry {
  let state = seed;
  const random = () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
  const points: number[] = [];
  const arms = 3 + Math.floor(random() * 3);
  for (let a = 0; a < arms; a++) {
    let angle = (a / arms) * Math.PI * 2 + random();
    let x = 0;
    let y = 0;
    let width = 0.05;
    const steps = 3 + Math.floor(random() * 3);
    for (let s = 0; s < steps; s++) {
      angle += (random() - 0.5) * 1.1;
      const length = (0.55 / steps) * (0.6 + random() * 0.8);
      const nx = x + Math.cos(angle) * length;
      const ny = y + Math.sin(angle) * length;
      const w = width * 0.6;
      const sx = -Math.sin(angle);
      const sy = Math.cos(angle);
      points.push(x + sx * width, y + sy * width, 0, x - sx * width, y - sy * width, 0, nx + sx * w, ny + sy * w, 0);
      points.push(x - sx * width, y - sy * width, 0, nx - sx * w, ny - sy * w, 0, nx + sx * w, ny + sy * w, 0);
      x = nx;
      y = ny;
      width = w;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(points), 3));
  geometry.computeVertexNormals();
  return geometry;
}

export class Scars {
  /** How many dents this instrument has taken since it was last repaired. */
  dents = 0;

  /** The geometry each dented mesh had before its first dent. */
  private readonly originals = new Map<Mesh, BufferGeometry>();
  private readonly cracks: Mesh[] = [];
  private nextCrack = 0;
  private readonly chipGroup = new Group();
  private readonly chips: Mesh[] = [];
  private readonly chipState = new Float32Array(CHIP_POOL * 6);
  private nextChip = 0;
  private readonly targets: Mesh[] = [];

  private readonly at = new Vector3();
  private readonly local = new Vector3();
  private readonly dir = new Vector3();
  private readonly localDir = new Vector3();
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly point = new Vector3();
  private readonly normal = new Vector3();

  /**
   * `scale` shrinks everything for a small instrument: 1 suits something
   * about a metre long.
   */
  constructor(
    debrisRoot: Object3D,
    private readonly scale = 1,
    crackColor = 0x0d0705,
  ) {
    const material = new MeshBasicMaterial({
      color: crackColor,
      side: DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const variants = [crackGeometry(11), crackGeometry(4711), crackGeometry(90210), crackGeometry(31337)];
    for (let i = 0; i < CRACK_POOL; i++) {
      const crack = new Mesh(variants[i % variants.length], material);
      crack.name = 'Crack';
      crack.userData.scar = true;
      this.cracks.push(crack);
    }
    this.chipGroup.name = 'Chips';
    this.chipGroup.userData.scar = true;
    const chipGeometry = new TetrahedronGeometry(0.014 * scale);
    for (let i = 0; i < CHIP_POOL; i++) {
      const chip = new Mesh(chipGeometry, material);
      chip.name = 'Chip';
      chip.visible = false;
      chip.userData.scar = true;
      this.chipGroup.add(chip);
      this.chips.push(chip);
    }
    debrisRoot.add(this.chipGroup);
  }

  /** A hit at `speed` m/s on what is under `within`, at world point `at`, against the floor. */
  hit(within: Object3D, at: Vector3, speed: number): void {
    if (speed < SCAR_SPEED) return;
    const excess = speed - SCAR_SPEED;
    const depth = Math.min(MAX_DENT, excess * DENT_PER_SPEED) * this.scale;
    const radius = (0.05 + 0.007 * speed) * this.scale;
    within.updateMatrixWorld(true);
    this.at.copy(at);
    // The floor pushes up, and a little in toward the middle of what hit it.
    within.getWorldPosition(this.tmp).sub(at);
    if (this.tmp.lengthSq() > 1e-8) this.tmp.normalize();
    this.dir.set(0, 1, 0).multiplyScalar(0.75).addScaledVector(this.tmp, 0.25).normalize();
    let struck: Material | null = null;
    let nearest = Infinity;
    within.traverse((o) => {
      const mesh = o as Mesh;
      if (!this.canScar(mesh)) return;
      const inverse = mesh.matrixWorld.clone().invert();
      this.local.copy(at).applyMatrix4(inverse);
      const g = mesh.geometry;
      if (g.boundingSphere == null) g.computeBoundingSphere();
      const sphere = g.boundingSphere!;
      const distance = sphere.center.distanceTo(this.local) - sphere.radius;
      if (distance >= radius) return;
      if (mesh.visible && distance < nearest) {
        nearest = distance;
        struck = mesh.material as Material;
      }
      const dented = this.editable(mesh);
      const positions = dented.attributes.position;
      this.localDir.copy(this.dir).transformDirection(inverse);
      const moved = dentPositions(
        positions.array as Float32Array,
        this.local.x,
        this.local.y,
        this.local.z,
        this.localDir.x,
        this.localDir.y,
        this.localDir.z,
        radius,
        depth,
      );
      if (moved === 0) return;
      positions.needsUpdate = true;
      this.shade(dented, radius);
      dented.computeBoundingSphere();
      dented.boundingBox = null;
    });
    this.dents++;
    this.crack(within, radius, 1 + Math.floor(speed / 3));
    this.throwChips(struck, speed);
  }

  /** Flying chips fall to the floor and stay there. */
  update(dt: number): void {
    const s = this.chipState;
    for (let i = 0; i < CHIP_POOL; i++) {
      const chip = this.chips[i];
      if (!chip.visible) continue;
      const k = i * 6;
      if (s[k + 3] === 0 && s[k + 4] === 0 && s[k + 5] === 0) continue;
      s[k + 4] -= GRAVITY * dt;
      s[k] += s[k + 3] * dt;
      s[k + 1] += s[k + 4] * dt;
      s[k + 2] += s[k + 5] * dt;
      if (s[k + 1] <= STAGE_FLOOR + 0.004) {
        s[k + 1] = STAGE_FLOOR + 0.004;
        s[k + 3] = 0;
        s[k + 4] = 0;
        s[k + 5] = 0;
      } else {
        chip.rotation.x += dt * 9;
        chip.rotation.z += dt * 7;
      }
      chip.position.set(s[k], s[k + 1], s[k + 2]);
    }
  }

  /** Puts the original geometry back and clears every mark. */
  restore(): void {
    for (const [mesh, original] of this.originals) {
      mesh.geometry.dispose();
      mesh.geometry = original;
    }
    this.originals.clear();
    for (const crack of this.cracks) crack.removeFromParent();
    for (const chip of this.chips) chip.visible = false;
    this.dents = 0;
  }

  private canScar(mesh: Mesh): boolean {
    if (!mesh.isMesh || mesh.userData.scar || (mesh as unknown as { isInstancedMesh?: boolean }).isInstancedMesh) return false;
    const material = mesh.material as Material & { isMeshBasicMaterial?: boolean };
    if (Array.isArray(mesh.material) || material.transparent || material.isMeshBasicMaterial) return false;
    // Stretched meshes (a string, a fret, a stand's leg) share a unit shape that would not dent true.
    const s = mesh.getWorldScale(this.tmp2);
    return Math.abs(s.x - 1) < 0.01 && Math.abs(s.y - 1) < 0.01 && Math.abs(s.z - 1) < 0.01;
  }

  /**
   * Fixes the shading after a dent. A mesh whose triangles each have their
   * own vertices would turn faceted all over if its normals were recomputed,
   * so only the triangles round the dent are; they are meant to look crumpled.
   */
  private shade(g: BufferGeometry, radius: number): void {
    if (g.index != null) {
      g.computeVertexNormals();
      return;
    }
    const p = g.attributes.position.array as Float32Array;
    const n = g.attributes.normal;
    if (n == null) {
      g.computeVertexNormals();
      return;
    }
    const normals = n.array as Float32Array;
    const { x, y, z } = this.local;
    const reach = (radius * 1.2) ** 2;
    for (let i = 0; i + 8 < p.length; i += 9) {
      let near = false;
      for (let k = 0; k < 9 && !near; k += 3) {
        near = (p[i + k] - x) ** 2 + (p[i + k + 1] - y) ** 2 + (p[i + k + 2] - z) ** 2 < reach;
      }
      if (!near) continue;
      const ax = p[i + 3] - p[i];
      const ay = p[i + 4] - p[i + 1];
      const az = p[i + 5] - p[i + 2];
      const bx = p[i + 6] - p[i];
      const by = p[i + 7] - p[i + 1];
      const bz = p[i + 8] - p[i + 2];
      let nx = ay * bz - az * by;
      let ny = az * bx - ax * bz;
      let nz = ax * by - ay * bx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      for (let k = 0; k < 9; k += 3) {
        normals[i + k] = nx;
        normals[i + k + 1] = ny;
        normals[i + k + 2] = nz;
      }
    }
    n.needsUpdate = true;
  }

  /** The mesh's own copy of its geometry, as meshes can share one. */
  private editable(mesh: Mesh): BufferGeometry {
    if (!this.originals.has(mesh)) {
      this.originals.set(mesh, mesh.geometry);
      mesh.geometry = mesh.geometry.clone();
      // A clone shares its original's userData.
      mesh.geometry.userData = { dented: true };
    }
    return mesh.geometry;
  }

  /** Lays up to `count` cracks on the visible surfaces around the hit. */
  private crack(within: Object3D, radius: number, count: number): void {
    this.targets.length = 0;
    within.traverseVisible((o) => {
      const mesh = o as Mesh;
      if (this.canScar(mesh)) this.targets.push(mesh);
    });
    if (this.targets.length === 0) return;
    // Aim from every side at a spot a little inside the hit, and keep what lands near it.
    within.getWorldPosition(this.tmp2);
    this.point.copy(this.at).lerp(this.tmp2, 0.12);
    this.point.y = Math.max(this.point.y, this.at.y + radius * 0.3);
    const origin = this.tmp;
    let placed = 0;
    for (let a = 0; a < AXES.length && placed < count; a++) {
      const axis = AXES[a];
      this.normal.set(axis[0], axis[1], axis[2]).transformDirection(within.matrixWorld);
      origin.copy(this.point).addScaledVector(this.normal, 3);
      raycaster.set(origin, this.normal.negate());
      raycaster.near = 0;
      raycaster.far = 6;
      const found = raycaster.intersectObjects(this.targets, false)[0];
      if (found == null || found.face == null || found.point.distanceTo(this.at) > radius * 2.5) continue;
      const mesh = found.object as Mesh;
      const crack = this.cracks[this.nextCrack];
      this.nextCrack = (this.nextCrack + 1) % CRACK_POOL;
      mesh.add(crack);
      crack.position.copy(mesh.worldToLocal(found.point.clone())).addScaledVector(found.face.normal, 0.0006);
      crack.lookAt(mesh.localToWorld(crack.position.clone().add(found.face.normal)));
      crack.rotateZ(Math.random() * Math.PI * 2);
      // No bigger than the surface: the middle of a mesh's three sizes is
      // the width of a plate or a tube, where its length would overhang.
      const g = mesh.geometry;
      if (g.boundingBox == null) g.computeBoundingBox();
      const size = g.boundingBox!.getSize(this.tmp2);
      const width = size.x + size.y + size.z - Math.max(size.x, size.y, size.z) - Math.min(size.x, size.y, size.z);
      crack.scale.setScalar(Math.min(radius * (0.8 + Math.random() * 0.7), width * 0.9));
      placed++;
    }
  }

  private throwChips(material: Material | null, speed: number): void {
    const count = Math.min(CHIP_POOL, 2 + Math.floor(speed));
    const s = this.chipState;
    for (let n = 0; n < count; n++) {
      const i = this.nextChip;
      this.nextChip = (this.nextChip + 1) % CHIP_POOL;
      const chip = this.chips[i];
      chip.visible = true;
      if (material != null) chip.material = material;
      const angle = Math.random() * Math.PI * 2;
      const out = speed * (0.08 + Math.random() * 0.22);
      const k = i * 6;
      s[k] = this.at.x;
      s[k + 1] = this.at.y + 0.02;
      s[k + 2] = this.at.z;
      s[k + 3] = Math.cos(angle) * out;
      s[k + 4] = speed * (0.15 + Math.random() * 0.3);
      s[k + 5] = Math.sin(angle) * out;
      chip.position.set(s[k], s[k + 1], s[k + 2]);
      chip.scale.setScalar(0.5 + Math.random());
    }
  }
}
