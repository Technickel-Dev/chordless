/**
 * Shared materials and geometry builders for the theatre set. Everything is
 * authored in one frame so the stage, house and rig line up when each is
 * placed at the scene origin: the origin is center stage on the deck, +Y up,
 * and the audience sits toward -Z (the way the player faces on arrival).
 */

import {
  BufferGeometry,
  Color,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
  Vector3,
} from '@iwsdk/core';

/** House layout shared by the stage, house and rig modules, in meters. */
export const THEATRE = {
  /** House floor in front of the stage; the deck top is y = 0. */
  houseFloorY: -1.1,
  /** Center of the seating arcs, slightly upstage of the player. */
  arcCenterZ: 1,
  /** Downstage face of the proscenium wall, and its thickness. */
  prosceniumZ: -2.6,
  prosceniumDepth: 0.6,
  /** Proscenium opening: half width, height at the sides and at the crown. */
  openingHalfWidth: 6,
  openingHeight: 7,
  openingCrown: 7.8,
  /** House side walls (inner face), back wall and ceiling. */
  houseHalfWidth: 10.6,
  houseBackZ: -24.5,
  houseCeilingY: 12,
  /** Stage house: side walls, back wall and fly-loft ceiling. */
  stageHalfWidth: 9,
  stageBackZ: 7.6,
  stageCeilingY: 14,
  /** Downstage edge of the apron at center, and the half chord of its curve. */
  apronZ: -4.2,
  apronHalfChord: 7,
} as const;

const APRON_SAGITTA = -THEATRE.prosceniumZ + THEATRE.apronZ;
const APRON_RADIUS =
  (THEATRE.apronHalfChord ** 2 + APRON_SAGITTA ** 2) / (2 * -APRON_SAGITTA);

/** Z of the stage's downstage edge at `x`: the apron curve, or the proscenium. */
export function apronEdgeZ(x: number): number {
  if (Math.abs(x) >= THEATRE.apronHalfChord) return THEATRE.prosceniumZ;
  const centerZ = THEATRE.apronZ + APRON_RADIUS;
  return centerZ - Math.sqrt(APRON_RADIUS ** 2 - x * x);
}

/** Point on a seating arc of radius `r` at angle `phi` (0 faces the stage). */
export function arcPoint(r: number, phi: number, y: number, out: Vector3): Vector3 {
  return out.set(r * Math.sin(phi), y, THEATRE.arcCenterZ - r * Math.cos(phi));
}

/**
 * Largest arc angle at radius `r` that stays inside the house: within the
 * side walls and downstage of the proscenium.
 */
export function arcLimit(r: number, margin = 0): number {
  const wall = Math.asin(Math.min(1, (THEATRE.houseHalfWidth - margin) / r));
  const front = (THEATRE.arcCenterZ - THEATRE.prosceniumZ) / r;
  return front >= 1 ? 0 : Math.min(wall, Math.acos(front));
}

/** Small seeded random generator (mulberry32) so the set is identical on every load. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Grid surface from a parametric function over u, v in [0, 1]. UVs are
 * scaled by `uvScale` so textures can tile in meters.
 */
export function paramSurface(
  cols: number,
  rows: number,
  at: (u: number, v: number, out: Vector3) => void,
  uvScale: [number, number] = [1, 1],
): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const p = new Vector3();
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      at(i / cols, j / rows, p);
      positions.push(p.x, p.y, p.z);
      uvs.push((i / cols) * uvScale[0], (j / rows) * uvScale[1]);
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i;
      const c = a + cols + 1;
      indices.push(a, a + 1, c + 1, a, c + 1, c);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Flat annular sector of the seating arcs at height `y`, clipped to the house. */
export function arcBand(r0: number, r1: number, y: number, margin = 0): BufferGeometry {
  const limit = arcLimit(r1, margin) || arcLimit(r0, margin);
  const cols = Math.max(8, Math.ceil((2 * limit * r1) / 0.6));
  return paramSurface(
    cols,
    1,
    (u, v, out) => {
      const r = r0 + (r1 - r0) * v;
      // Each radius runs out to its own limit, so the band's ends meet the walls.
      const phi = (u * 2 - 1) * arcLimit(r, margin);
      arcPoint(r, phi, y, out);
    },
    [(2 * limit * r1) / 2, (r1 - r0) / 2],
  );
}

/** Vertical face along a seating arc of radius `r`, from `y0` up to `y1`. */
export function arcWall(r: number, y0: number, y1: number, margin = 0): BufferGeometry {
  const limit = arcLimit(r, margin);
  const cols = Math.max(8, Math.ceil((2 * limit * r) / 0.6));
  return paramSurface(cols, 1, (u, v, out) => {
    arcPoint(r, (u * 2 - 1) * limit, y0 + (y1 - y0) * v, out);
  });
}

/** Opaque sRGB texture from RGBA pixels, filtered like an image texture. */
export function pixelTexture(size: number, pixels: Uint8Array): DataTexture {
  const texture = new DataTexture(pixels, size, size, RGBAFormat, UnsignedByteType);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Worn, dark-stained stage boards running up and down stage: one 2.4 m tile
 * of 16 planks, each with its own tone, a staggered butt joint and fine grain.
 */
function createStageBoardTexture(size = 512): DataTexture {
  const random = seededRandom(31);
  const planks = 16;
  const plankPx = size / planks;
  const tones = Array.from({ length: planks }, () => 0.85 + random() * 0.3);
  const joints = Array.from({ length: planks }, () => Math.floor(random() * size));
  const phases = Array.from({ length: planks }, () => random() * 40);
  const base = [0x4a, 0x33, 0x24];
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const plank = Math.floor(x / plankPx);
      const across = x - plank * plankPx;
      const grain =
        0.06 * Math.sin(across * 0.9 + Math.sin(y * 0.021 + phases[plank]) * 4) +
        0.04 * Math.sin(y * 0.13 + phases[plank] * 3 + across * 0.2);
      let shade = tones[plank] * (1 + grain);
      if (across < 1.5) shade *= 0.45;
      if (Math.abs(y - joints[plank]) < 1) shade *= 0.5;
      const index = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) {
        pixels[index + c] = Math.min(255, Math.round(base[c] * shade));
      }
      pixels[index + 3] = 255;
    }
  }
  const texture = pixelTexture(size, pixels);
  // Shape UVs are in meters; one tile covers 2.4 m.
  texture.repeat.set(1 / 2.4, 1 / 2.4);
  return texture;
}

/** Every material the set uses, created once per manifest evaluation. */
export function createTheatreMaterials() {
  return {
    curtainVelvet: new MeshPhysicalMaterial({
      name: 'curtain-velvet',
      color: 0x7d0c16,
      roughness: 0.82,
      sheen: 1,
      sheenRoughness: 0.45,
      sheenColor: new Color(0xff5b5b),
      side: DoubleSide,
    }),
    backDrape: new MeshPhysicalMaterial({
      name: 'back-drape',
      color: 0x3c070c,
      roughness: 0.88,
      sheen: 0.6,
      sheenRoughness: 0.5,
      sheenColor: new Color(0xa83040),
      side: DoubleSide,
    }),
    blackVelour: new MeshStandardMaterial({
      name: 'black-velour',
      color: 0x0c0b0c,
      roughness: 0.95,
      side: DoubleSide,
    }),
    blackPaint: new MeshStandardMaterial({ name: 'black-paint', color: 0x111012, roughness: 0.9 }),
    stageBoards: new MeshStandardMaterial({
      name: 'stage-boards',
      map: createStageBoardTexture(),
      roughness: 0.62,
    }),
    seatVelvet: new MeshStandardMaterial({ name: 'seat-velvet', color: 0x9a1222, roughness: 0.78 }),
    seatWood: new MeshStandardMaterial({ name: 'seat-wood', color: 0x2a160e, roughness: 0.55 }),
    carpet: new MeshStandardMaterial({
      name: 'carpet',
      color: 0x3b0d14,
      roughness: 1,
      side: DoubleSide,
    }),
    wallFabric: new MeshStandardMaterial({ name: 'wall-fabric', color: 0x4a1019, roughness: 0.9 }),
    ceiling: new MeshStandardMaterial({ name: 'ceiling', color: 0x2a1418, roughness: 0.9 }),
    gold: new MeshStandardMaterial({
      name: 'gold-leaf',
      color: 0xc99a3e,
      roughness: 0.32,
      metalness: 1,
    }),
    rigMetal: new MeshStandardMaterial({
      name: 'rig-metal',
      color: 0x1b1c1f,
      roughness: 0.5,
      metalness: 0.7,
    }),
    exitGlow: new MeshStandardMaterial({
      name: 'exit-glow',
      color: 0x000000,
      emissive: new Color(0x2bff6a),
      emissiveIntensity: 1.6,
    }),
    warmGlow: new MeshStandardMaterial({
      name: 'warm-glow',
      color: 0x000000,
      emissive: new Color(0xffc988),
      emissiveIntensity: 2.2,
    }),
  };
}

export type TheatreMaterials = ReturnType<typeof createTheatreMaterials>;
