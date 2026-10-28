import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  DataTexture,
  type ColorRepresentation,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LinearFilter,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  type Object3D,
  Points,
  PointsMaterial,
  Quaternion,
  RGBAFormat,
  SRGBColorSpace,
  type Texture,
  UnsignedByteType,
  Vector3,
} from '@iwsdk/core';
import { pixelTexture, seededRandom } from './theatre-kit.js';

/**
 * Small construction kit shared by the simple scene sets: material factories,
 * named primitive placement, instancing, procedural textures and sky details.
 * Every set uses the same frame as the theatre: origin where the player
 * stands, floor at y = 0, the "audience" toward -Z.
 */

export type V3 = readonly [number, number, number];

export function mat(
  color: ColorRepresentation,
  opts: { rough?: number; metal?: number; map?: Texture; emissive?: ColorRepresentation; glow?: number; double?: boolean } = {},
): MeshStandardMaterial {
  const m = new MeshStandardMaterial({
    color,
    roughness: opts.rough ?? 0.8,
    metalness: opts.metal ?? 0,
    map: opts.map ?? null,
  });
  if (opts.emissive != null) {
    m.emissive = new Color(opts.emissive);
    m.emissiveIntensity = opts.glow ?? 1;
  }
  if (opts.double) m.side = DoubleSide;
  return m;
}

/** Unlit color, for skies, flames, screens and other things that glow. */
export function glow(color: ColorRepresentation, opacity = 1, additive = false): MeshBasicMaterial {
  const m = new MeshBasicMaterial({ color, toneMapped: false, fog: false });
  if (opacity < 1 || additive) {
    m.transparent = true;
    m.opacity = opacity;
    m.depthWrite = false;
    if (additive) m.blending = AdditiveBlending;
  }
  return m;
}

/** Adds a named mesh to `parent` at `pos`, rotated by degrees. */
export function put(
  parent: Object3D,
  name: string,
  geometry: BufferGeometry,
  material: Material,
  pos: V3 = [0, 0, 0],
  rotDeg: V3 = [0, 0, 0],
): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(pos[0], pos[1], pos[2]);
  const d = Math.PI / 180;
  mesh.rotation.set(rotDeg[0] * d, rotDeg[1] * d, rotDeg[2] * d);
  parent.add(mesh);
  return mesh;
}

/** A box resting on its base: `pos` is the center of its bottom face. */
export function block(parent: Object3D, name: string, size: V3, material: Material, pos: V3, rotYDeg = 0): Mesh {
  const geometry = new BoxGeometry(size[0], size[1], size[2]);
  geometry.translate(0, size[1] / 2, 0);
  return put(parent, name, geometry, material, pos, [0, rotYDeg, 0]);
}

/** A cylinder resting on its base. */
export function post(
  parent: Object3D,
  name: string,
  radius: number,
  height: number,
  material: Material,
  pos: V3,
  topRadius = radius,
  segments = 24,
): Mesh {
  const geometry = new CylinderGeometry(topRadius, radius, height, segments);
  geometry.translate(0, height / 2, 0);
  return put(parent, name, geometry, material, pos);
}

/** A flat disc on the XZ plane at height y. */
export function disc(parent: Object3D, name: string, radius: number, material: Material, y = 0, segments = 64): Mesh {
  const geometry = new CircleGeometry(radius, segments);
  geometry.rotateX(-Math.PI / 2);
  return put(parent, name, geometry, material, [0, y, 0]);
}

/** A room seen from inside: floor, four walls and a ceiling (BackSide box). */
export function room(
  parent: Object3D,
  name: string,
  size: V3,
  walls: Material,
  floor: Material,
  ceiling: Material,
  center: readonly [number, number] = [0, 0],
): Group {
  const g = new Group();
  g.name = name;
  const [w, h, d] = size;
  const at = (x: number, z: number): V3 => [center[0] + x, 0, center[1] + z];
  const plane = (pw: number, ph: number) => new BoxGeometry(pw, ph, 0.02);
  put(g, 'Floor', new BoxGeometry(w, 0.02, d), floor, [center[0], -0.01, center[1]]);
  put(g, 'Ceiling', new BoxGeometry(w, 0.02, d), ceiling, [center[0], h + 0.01, center[1]]);
  put(g, 'WallBack', plane(w, h), walls, [at(0, -d / 2)[0], h / 2, at(0, -d / 2)[2]]);
  put(g, 'WallFront', plane(w, h), walls, [at(0, d / 2)[0], h / 2, at(0, d / 2)[2]]);
  put(g, 'WallLeft', plane(d, h), walls, [at(-w / 2, 0)[0], h / 2, center[1]], [0, 90, 0]);
  put(g, 'WallRight', plane(d, h), walls, [at(w / 2, 0)[0], h / 2, center[1]], [0, 90, 0]);
  parent.add(g);
  return g;
}

export interface Placement {
  pos: V3;
  rotDeg?: V3;
  scale?: number | V3;
  color?: ColorRepresentation;
}

/** One InstancedMesh for many copies of a part; optional per-copy color. */
export function instances(
  parent: Object3D,
  name: string,
  geometry: BufferGeometry,
  material: Material,
  placements: readonly Placement[],
): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, placements.length);
  mesh.name = name;
  const m = new Matrix4();
  const q = new Quaternion();
  const e = new Euler();
  const p = new Vector3();
  const s = new Vector3();
  const c = new Color();
  const d = Math.PI / 180;
  placements.forEach((pl, i) => {
    const r = pl.rotDeg ?? [0, 0, 0];
    q.setFromEuler(e.set(r[0] * d, r[1] * d, r[2] * d));
    const sc = pl.scale ?? 1;
    if (typeof sc === 'number') s.setScalar(sc);
    else s.set(sc[0], sc[1], sc[2]);
    mesh.setMatrixAt(i, m.compose(p.set(pl.pos[0], pl.pos[1], pl.pos[2]), q, s));
    if (pl.color != null) mesh.setColorAt(i, c.set(pl.color));
  });
  mesh.computeBoundingSphere();
  parent.add(mesh);
  return mesh;
}

/** Points evenly spread on an arc of radius r, each yawed to face the center. */
export function arc(count: number, r: number, fromDeg: number, toDeg: number, y = 0): Placement[] {
  const out: Placement[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const a = ((fromDeg + (toDeg - fromDeg) * t) * Math.PI) / 180;
    // a = 0 is straight ahead (-Z); positive angles turn toward +X.
    out.push({ pos: [Math.sin(a) * r, y, -Math.cos(a) * r], rotDeg: [0, (-a * 180) / Math.PI, 0] });
  }
  return out;
}

type RGB = readonly [number, number, number];

function fill(size: number, at: (x: number, y: number, out: number[]) => void): Texture {
  const px = new Uint8Array(size * size * 4);
  const out = [0, 0, 0, 255];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      out[3] = 255;
      at(x, y, out);
      px.set(out, (y * size + x) * 4);
    }
  }
  return pixelTexture(size, px);
}

const clamp8 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/** Speckled color, for grass, sand, snow, stone and frosting. */
export function noiseTexture(base: RGB, spread: number, seed: number, size = 128): Texture {
  const rand = seededRandom(seed);
  return fill(size, (_x, _y, o) => {
    const n = (rand() - 0.5) * spread;
    o[0] = clamp8(base[0] + n);
    o[1] = clamp8(base[1] + n);
    o[2] = clamp8(base[2] + n);
  });
}

/** Wood planks running along U with per-board tone and grain. */
export function plankTexture(base: RGB, boards: number, seed: number, size = 256): Texture {
  const rand = seededRandom(seed);
  const tone = Array.from({ length: boards }, () => 0.82 + rand() * 0.3);
  const grain = Array.from({ length: size }, () => (rand() - 0.5) * 18);
  return fill(size, (x, y, o) => {
    const b = Math.floor((y / size) * boards);
    const seam = (y * boards) % size < 2 ? 0.55 : 1;
    const k = tone[b] * seam;
    const g = grain[(x + b * 37) % size] + Math.sin((x + b * 13) * 0.09) * 6;
    o[0] = clamp8(base[0] * k + g);
    o[1] = clamp8(base[1] * k + g * 0.8);
    o[2] = clamp8(base[2] * k + g * 0.6);
  });
}

/** Two-color checks or tiles with a grout line. */
export function tileTexture(a: RGB, b: RGB, tiles: number, grout: RGB | null = null, size = 256): Texture {
  const cell = size / tiles;
  return fill(size, (x, y, o) => {
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    let c = (cx + cy) % 2 === 0 ? a : b;
    if (grout != null && (x % cell < 2 || y % cell < 2)) c = grout;
    o[0] = c[0];
    o[1] = c[1];
    o[2] = c[2];
  });
}

/** Stripes along U (vertical stripes on a wall). */
export function stripeTexture(a: RGB, b: RGB, stripes: number, size = 128): Texture {
  return fill(size, (x, _y, o) => {
    const c = Math.floor((x / size) * stripes) % 2 === 0 ? a : b;
    o[0] = c[0];
    o[1] = c[1];
    o[2] = c[2];
  });
}

/** Scattered soft blobs on a background: florals, polka dots, sprinkles. */
export function blobTexture(bg: RGB, colors: readonly RGB[], count: number, radius: number, seed: number, size = 256): Texture {
  const rand = seededRandom(seed);
  const blobs = Array.from({ length: count }, () => ({
    x: rand() * size,
    y: rand() * size,
    r: radius * (0.6 + rand() * 0.8),
    c: colors[Math.floor(rand() * colors.length)],
  }));
  return fill(size, (x, y, o) => {
    let c: RGB = bg;
    for (const b of blobs) {
      const dx = Math.min(Math.abs(x - b.x), size - Math.abs(x - b.x));
      const dy = Math.min(Math.abs(y - b.y), size - Math.abs(y - b.y));
      if (dx * dx + dy * dy < b.r * b.r) c = b.c;
    }
    o[0] = c[0];
    o[1] = c[1];
    o[2] = c[2];
  });
}

// 5x7 pixel font, one hex byte per row (bit 4 = left column).
const FONT: Record<string, string> = {
  A: '0E11111F111111', B: '1E11111E11111E', C: '0E11101010110E', D: '1E11111111111E',
  E: '1F10101E10101F', F: '1F10101E101010', G: '0E11101711110F', H: '1111111F111111',
  I: '0E04040404040E', J: '0702020202120C', K: '11121418141211', L: '1010101010101F',
  M: '111B1515111111', N: '11111915131111', O: '0E11111111110E', P: '1E11111E101010',
  Q: '0E11111115120D', R: '1E11111E141211', S: '0F10100E01011E', T: '1F040404040404',
  U: '1111111111110E', V: '11111111110A04', W: '1111111515150A',
  X: '11110A040A1111', Y: '11110A04040404', Z: '1F01020408101F', ' ': '00000000000000',
  '!': '04040404040004', '-': '0000001F000000', '.': '00000000000004', "'": '04040800000000',
};

/**
 * A texture with `text` in the pixel font (lines split on \n), sharp-edged.
 * Returns the texture and its width/height aspect.
 */
export function textTexture(text: string, fg: RGB, bg: readonly [number, number, number, number]): { map: Texture; aspect: number } {
  const lines = text.toUpperCase().split('\n');
  const cols = Math.max(...lines.map((l) => l.length));
  const w = cols * 6 + 3;
  const h = lines.length * 9 + 3;
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) px.set(bg, i * 4);
  lines.forEach((line, li) => {
    const offset = Math.floor((cols - line.length) * 3);
    [...line].forEach((ch, ci) => {
      const glyph = FONT[ch] ?? FONT[' '];
      for (let row = 0; row < 7; row++) {
        const bits = parseInt(glyph.slice(row * 2, row * 2 + 2), 16);
        for (let col = 0; col < 5; col++) {
          if ((bits >> (4 - col)) & 1) {
            const x = 2 + offset + ci * 6 + col;
            const y = h - 1 - (2 + li * 9 + row);
            px.set([fg[0], fg[1], fg[2], 255], (y * w + x) * 4);
          }
        }
      }
    });
  });
  const map = new DataTexture(px, w, h, RGBAFormat, UnsignedByteType);
  map.colorSpace = SRGBColorSpace;
  map.magFilter = NearestFilter;
  map.minFilter = LinearFilter;
  map.needsUpdate = true;
  return { map, aspect: w / h };
}

/** A flat sign `height` meters tall showing `text`; glows when `lit`. */
export function sign(
  parent: Object3D,
  name: string,
  text: string,
  height: number,
  fg: RGB,
  bg: readonly [number, number, number, number],
  pos: V3,
  rotDeg: V3 = [0, 0, 0],
  lit = false,
): Mesh {
  const { map, aspect } = textTexture(text, fg, bg);
  const geometry = new BoxGeometry(height * aspect, height, 0.01);
  const material = lit
    ? new MeshBasicMaterial({ map, toneMapped: false, transparent: bg[3] < 255 })
    : new MeshStandardMaterial({ map, roughness: 0.7, transparent: bg[3] < 255 });
  return put(parent, name, geometry, material, pos, rotDeg);
}

/** Stars on the upper sky sphere, fixed pixel size. */
export function stars(parent: Object3D, count: number, radius: number, seed: number, minY = 0.05, size = 2): Points {
  const rand = seededRandom(seed);
  const pos: number[] = [];
  const col: number[] = [];
  while (pos.length < count * 3) {
    const v = new Vector3(rand() * 2 - 1, rand(), rand() * 2 - 1);
    if (v.lengthSq() > 1 || v.lengthSq() < 0.01) continue;
    v.normalize();
    if (v.y < minY) continue;
    v.multiplyScalar(radius);
    pos.push(v.x, v.y, v.z);
    const b = 0.5 + rand() * 0.5;
    col.push(b, b, b * (0.9 + rand() * 0.2));
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(col, 3));
  const points = new Points(
    geometry,
    new PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, toneMapped: false, fog: false }),
  );
  points.name = 'Stars';
  points.userData.iwsdkPreviewBounds = 'exclude';
  parent.add(points);
  return points;
}

/** A sun or moon: an unlit disc facing the origin with a soft additive halo. */
export function skyBody(parent: Object3D, name: string, pos: V3, radius: number, color: ColorRepresentation, halo: ColorRepresentation, haloScale = 3): Group {
  const g = new Group();
  g.name = name;
  g.position.set(pos[0], pos[1], pos[2]);
  g.lookAt(0, pos[1] * 0.2, 0);
  put(g, 'Disc', new CircleGeometry(radius, 48), glow(color));
  const haloMesh = put(g, 'Halo', new CircleGeometry(radius * haloScale, 48), glow(halo, 0.35, true), [0, 0, -0.1]);
  haloMesh.userData.iwsdkPreviewBounds = 'exclude';
  parent.add(g);
  return g;
}

export { seededRandom };
