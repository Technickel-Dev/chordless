/**
 * An 18-inch orchestral clash cymbal: a lathed bronze plate with a domed
 * bell and a shallow conical bow, its tonal grooves and hammer marks in the
 * surface maps, a leather pad on the bell and a leather strap handle through
 * the bell's hole, knotted inside. One model serves both hands.
 *
 * Cymbal space (see ../cymbals/geometry.ts): the origin is the centre of
 * the rim's plane, +Z out of the concave playing face, the bell and strap
 * toward -Z. X runs across the strap handle. `Grip` marks where the hand
 * closes round the strap.
 */

import {
  CatmullRomCurve3,
  DataTexture,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  LinearMipmapLinearFilter,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  RepeatWrapping,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
} from '@iwsdk/core';
import { BELL_TOP, CYMBAL, GRIP_DEPTH, midlineHeight, thicknessAt } from '../cymbals/geometry.js';
import { makeRandom } from './lib/hardsurface.js';

/** Lathe space has the axis along +Y (toward the hand); cymbal space has it along -Z. */
const toCymbalSpace = <T extends { rotateX(a: number): T }>(g: T): T => g.rotateX(-Math.PI / 2);

const RADIAL_SAMPLES = 72;
const AROUND = 128;
/** Texture size: around the plate, and along its profile (front, edge, back). */
const TEX_U = 512;
const TEX_V = 1024;
/** Tonal grooves, as texture cycles along the whole profile (front and back together). */
const GROOVES = 250;

/** The plate's profile, as a closed loop: playing face out to the rim, round the edge, back in to the hole. */
function plateProfile(): Vector2[] {
  const { radius, holeRadius, edgeThickness } = CYMBAL;
  const pts: Vector2[] = [];
  // Denser toward the bell, where the curvature is.
  const rAt = (i: number) => holeRadius + (radius - edgeThickness / 2 - holeRadius) * (i / RADIAL_SAMPLES) ** 1.35;
  for (let i = 0; i <= RADIAL_SAMPLES; i++) {
    const r = rAt(i);
    pts.push(new Vector2(r, midlineHeight(r) - thicknessAt(r) / 2));
  }
  // A rounded rim.
  const e = edgeThickness / 2;
  for (let k = 1; k < 6; k++) {
    const a = -Math.PI / 2 + (Math.PI * k) / 6;
    pts.push(new Vector2(radius - e + e * Math.cos(a), e * Math.sin(a)));
  }
  for (let i = RADIAL_SAMPLES; i >= 0; i--) {
    const r = rAt(i);
    pts.push(new Vector2(r, midlineHeight(r) + thicknessAt(r) / 2));
  }
  // Down the wall of the hole, closing the loop.
  pts.push(pts[0].clone());
  return pts;
}

/**
 * Colour and roughness maps: concentric lathe grooves (stripes along the
 * profile) and soft hammer dimples, both stronger in roughness, which is
 * what catches the light on polished bronze.
 */
function plateMaps(): { color: DataTexture; rough: DataTexture } {
  const rand = makeRandom(18);
  const color = new Uint8Array(TEX_U * TEX_V * 4);
  const rough = new Uint8Array(TEX_U * TEX_V * 4);
  const dent = new Float32Array(TEX_U * TEX_V);
  // Hammer marks: overlapping shallow dimples, a few hundred per face.
  for (let n = 0; n < 1400; n++) {
    const cu = rand() * TEX_U;
    const cv = rand() * TEX_V;
    // About 6-10 mm round on the plate: a few texels around, many along the profile.
    const su = 1.2 + rand() * 1.2;
    const sv = 5 + rand() * 6;
    const depth = 0.25 + rand() * 0.3;
    for (let dv = -Math.ceil(sv * 2); dv <= sv * 2; dv++) {
      const v = Math.floor(cv + dv);
      if (v < 0 || v >= TEX_V) continue;
      for (let du = -Math.ceil(su * 2); du <= su * 2; du++) {
        const u = (Math.floor(cu + du) + TEX_U) % TEX_U;
        const d2 = (du / su) ** 2 + (dv / sv) ** 2;
        if (d2 < 4) dent[v * TEX_U + u] += depth * Math.exp(-d2 * 1.5);
      }
    }
  }
  // Groove depth varies a little ring to ring, as on a real lathe.
  const ring = new Float32Array(TEX_V);
  for (let v = 0; v < TEX_V; v++) ring[v] = 0.75 + 0.5 * rand();
  for (let v = 0; v < TEX_V; v++) {
    const groove = 0.5 + 0.5 * Math.cos((v / TEX_V) * GROOVES * Math.PI * 2);
    for (let u = 0; u < TEX_U; u++) {
      const i = v * TEX_U + u;
      const g = groove * ring[v];
      const d = Math.min(1, dent[i]);
      const shade = 1 - 0.07 * g - 0.03 * d;
      color[i * 4] = Math.round(196 * shade);
      color[i * 4 + 1] = Math.round(152 * shade);
      color[i * 4 + 2] = Math.round(86 * shade);
      color[i * 4 + 3] = 255;
      const r = 0.2 + 0.16 * g + 0.08 * d;
      rough[i * 4 + 1] = Math.round(r * 255);
      rough[i * 4 + 3] = 255;
    }
  }
  const make = (data: Uint8Array) => {
    const t = new DataTexture(data, TEX_U, TEX_V);
    t.wrapS = RepeatWrapping;
    t.generateMipmaps = true;
    t.minFilter = LinearMipmapLinearFilter;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  };
  const colorTex = make(color);
  colorTex.colorSpace = SRGBColorSpace;
  return { color: colorTex, rough: make(rough) };
}

/** The leather pad on the crown of the bell, its edge rounded. */
function padGeometry() {
  const { padRadius: r, padThickness: t } = CYMBAL;
  const b = BELL_TOP;
  const pts = [
    new Vector2(0.004, b),
    new Vector2(r - 0.003, b),
    new Vector2(r - 0.0004, b + 0.0012),
    new Vector2(r, b + 0.003),
    new Vector2(r - 0.0004, b + t - 0.0012),
    new Vector2(r - 0.003, b + t),
    new Vector2(0.004, b + t),
  ];
  return toCymbalSpace(new LatheGeometry(pts, 48));
}

/**
 * The strap handle: both ends come up through the hole and the pad and
 * arch over into a short loop that the hand closes round (lathe space,
 * across X).
 */
function strapGeometry() {
  const top = BELL_TOP + CYMBAL.padThickness;
  const pts: Vector3[] = [new Vector3(-0.0035, BELL_TOP - 0.004, 0), new Vector3(-0.005, top + 0.001, 0)];
  const arc = 9;
  for (let k = 0; k <= arc; k++) {
    const a = Math.PI * (1.12 - (1.24 * k) / arc);
    pts.push(new Vector3(0.03 * Math.cos(a), top + 0.006 + 0.021 * Math.sin(a), 0));
  }
  pts.push(new Vector3(0.005, top + 0.001, 0), new Vector3(0.0035, BELL_TOP - 0.004, 0));
  const path = new CatmullRomCurve3(pts, false, 'centripetal');
  // A flat band, wide across the loop's plane and thin within it, its
  // edges lightly chamfered (shape X follows the path's binormal).
  const band = new Shape();
  const w = 0.011;
  const h = 0.0019;
  const c = 0.0006;
  band.moveTo(-w + c, -h);
  band.lineTo(w - c, -h);
  band.lineTo(w, -h + c);
  band.lineTo(w, h - c);
  band.lineTo(w - c, h);
  band.lineTo(-w + c, h);
  band.lineTo(-w, h - c);
  band.lineTo(-w, -h + c);
  band.closePath();
  return toCymbalSpace(new ExtrudeGeometry(band, { steps: 64, bevelEnabled: false, extrudePath: path }));
}

/** Builds one cymbal (see the module comment for its space). */
export function createCymbal(): Group {
  const root = new Group();
  root.name = 'Cymbal';

  const { color, rough } = plateMaps();
  const bronze = new MeshStandardMaterial({
    name: 'Bronze',
    color: 0xffffff,
    map: color,
    roughnessMap: rough,
    roughness: 1,
    metalness: 1,
  });
  const plate = new Mesh(toCymbalSpace(new LatheGeometry(plateProfile(), AROUND)), bronze);
  plate.name = 'Plate';
  root.add(plate);

  const leather = new MeshStandardMaterial({ name: 'Leather', color: 0x4a2c17, roughness: 0.68, metalness: 0 });
  const padLeather = new MeshStandardMaterial({ name: 'PadLeather', color: 0x2c1b10, roughness: 0.82, metalness: 0 });
  const pad = new Mesh(padGeometry(), padLeather);
  pad.name = 'Pad';
  root.add(pad);

  const strap = new Mesh(strapGeometry(), leather);
  strap.name = 'Strap';
  root.add(strap);

  // The knot that keeps the strap in, inside the bell on the playing face.
  const knot = new Group();
  knot.name = 'Knot';
  const inner = BELL_TOP - CYMBAL.bellThickness;
  const lump = new Mesh(new SphereGeometry(0.0085, 16, 12), leather);
  lump.name = 'KnotLump';
  lump.scale.set(1, 1, 0.7);
  lump.position.set(0, 0, -(inner - 0.0055));
  const turn = new Mesh(new TorusGeometry(0.0075, 0.0028, 8, 20), leather);
  turn.name = 'KnotTurn';
  turn.position.set(0, 0, -(inner - 0.0035));
  knot.add(lump, turn);
  root.add(knot);

  // Where the hand closes round the strap.
  const grip = new Object3D();
  grip.name = 'Grip';
  grip.position.set(0, 0, -GRIP_DEPTH);
  root.add(grip);
  return root;
}
