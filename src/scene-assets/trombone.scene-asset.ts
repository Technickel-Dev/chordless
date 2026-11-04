/**
 * A B-flat tenor trombone in lacquered brass: a silver mouthpiece, the
 * slide (two nickel inner tubes, the outer slide over them with its crook,
 * brace and rubber bumper) and, on the left, the bell section: the
 * gooseneck from the slide's lower tube, the tuning slide behind the head,
 * and the bell tube forward to an 8.5-inch Bessel-flared bell with a rolled
 * rim. The outer slide is its own group (TromboneSlide), so the system
 * moves it out along -Z.
 *
 * Trombone space (see ../trombone/geometry.ts): +Y up, -Z forward along
 * the slide toward the bell, +X the player's right; the origin is the
 * mouthpiece receiver at the slide's upper tube.
 */

import {
  CatmullRomCurve3,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  TubeGeometry,
  Vector2,
  Vector3,
} from '@iwsdk/core';
import { TROMBONE } from '../trombone/geometry.js';
import { alignSpan } from './lib/hardsurface.js';

const brass = () =>
  new MeshStandardMaterial({ name: 'LacqueredBrass', color: 0xdba64c, metalness: 0.9, roughness: 0.25 });
const nickel = () => new MeshStandardMaterial({ name: 'Nickel', color: 0xd9dade, metalness: 1, roughness: 0.22 });
const silver = () => new MeshStandardMaterial({ name: 'Silver', color: 0xe4e6ea, metalness: 1, roughness: 0.16 });
const rubber = () => new MeshStandardMaterial({ name: 'Rubber', color: 0x1d1d20, metalness: 0, roughness: 0.8 });

type P = [number, number, number];

/** Points round an arc in the plane of `u` and `v` about `center`, from angle `a0` to `a1`. */
function arc(center: P, u: P, v: P, radius: number, a0: number, a1: number, steps = 12): P[] {
  const pts: P[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    const c = Math.cos(a) * radius;
    const s = Math.sin(a) * radius;
    pts.push([center[0] + u[0] * c + v[0] * s, center[1] + u[1] * c + v[1] * s, center[2] + u[2] * c + v[2] * s]);
  }
  return pts;
}

/** A tube swept along `points`. */
function pipe(name: string, points: P[], material: MeshStandardMaterial, radius: number = TROMBONE.tube): Mesh {
  const curve = new CatmullRomCurve3(points.map((p) => new Vector3(...p)), false, 'centripetal');
  const mesh = new Mesh(new TubeGeometry(curve, Math.max(24, points.length * 6), radius, 14, false), material);
  mesh.name = name;
  return mesh;
}

/** A straight tube (or rod) between two points. */
function rod(name: string, a: P, b: P, radius: number, material: MeshStandardMaterial, segments = 14): Mesh {
  const mesh = new Mesh(new CylinderGeometry(radius, radius, 1, segments), material);
  mesh.name = name;
  mesh.scale.y = alignSpan(mesh, new Vector3(...a), new Vector3(...b));
  return mesh;
}

/** A lathe-turned part from an (r, y) profile about the Y axis, its +Y turned to point along `axis` (+1 for +Z, -1 for -Z). */
function turned(name: string, profile: [number, number][], material: MeshStandardMaterial, axis: 1 | -1, segments = 40): Mesh {
  const mesh = new Mesh(new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), segments), material);
  mesh.name = name;
  mesh.rotation.x = (axis * Math.PI) / 2;
  return mesh;
}

/** The bell's radius `s` metres along the flare from where it leaves the tube: a Bessel horn. */
export function bellRadiusAt(s: number): number {
  const L = TROMBONE.flareStartZ - TROMBONE.bellRimZ;
  // r = A / (c - s)^0.75, through the tube's radius at 0 and the rim's at L.
  const ratio = (TROMBONE.bellRadius / TROMBONE.tube) ** (1 / 0.75);
  const c = (ratio * L) / (ratio - 1);
  return TROMBONE.tube * (c / (c - Math.min(s, L))) ** 0.75;
}

/** The bell: the flare's outer surface out to a rolled rim and back inside, in lathe space (+Y along the flare). */
function bellProfile(): [number, number][] {
  const L = TROMBONE.flareStartZ - TROMBONE.bellRimZ;
  const wall = 0.0008;
  const bead = 0.003;
  const N = 56;
  const at = (i: number) => L * (1 - (1 - i / N) ** 2.2);
  const outer: [number, number][] = [];
  for (let i = 0; i <= N; i++) outer.push([bellRadiusAt(at(i) - (i === N ? bead : 0)), at(i) - (i === N ? bead : 0)]);
  const rim = outer[outer.length - 1];
  const roll: [number, number][] = [];
  for (let k = 1; k <= 8; k++) {
    const a = -Math.PI / 2 + (Math.PI * 1.5 * k) / 8;
    roll.push([rim[0] + bead * Math.cos(a) * 0.9, L - bead + bead * Math.sin(a) + bead]);
  }
  const inner: [number, number][] = [];
  for (let i = N; i >= 12; i--) inner.push([Math.max(0.001, bellRadiusAt(at(i) - bead * 0.5) - wall), at(i) - bead * 0.5]);
  return [...outer, ...roll, ...inner];
}

/** The mouthpiece, rim at +Y: shank, backbore, throat, cup and rim, in lathe space. */
function mouthpieceProfile(): [number, number][] {
  const L = TROMBONE.mouthpieceZ;
  const R = TROMBONE.mouthpieceRim;
  return [
    [0.0045, -0.012], [0.0054, -0.012], [0.0062, 0.02], [0.0068, 0.03], [0.0078, 0.04],
    [0.0092, L - 0.03], [0.0125, L - 0.012], [R, L - 0.004], [R + 0.0012, L - 0.0015],
    [R, L], [R - 0.0035, L - 0.0008], [0.0088, L - 0.012], [0.0042, L - 0.03], [0.0032, L - 0.04],
  ];
}

/** The outer slide, closed: its two tubes, the crook, the brace the right hand holds and the bumper. */
function outerSlide(metal: MeshStandardMaterial, trim: MeshStandardMaterial, bumper: MeshStandardMaterial): Group {
  const { outerStartZ: z0, outerEndZ: z1, slideGap: gap, outerTube: r, braceZ } = TROMBONE;
  const slide = new Group();
  slide.name = 'TromboneSlide';
  slide.add(rod('TromboneOuterUpper', [0, 0, z0], [0, 0, z1], r, metal));
  slide.add(rod('TromboneOuterLower', [0, -gap, z0], [0, -gap, z1], r, metal));
  // The crook: a half circle forward, joining the two tubes' ends.
  const crook = arc([0, -gap / 2, z1], [0, 1, 0], [0, 0, -1], gap / 2, 0, Math.PI, 16);
  slide.add(pipe('TromboneSlideCrook', crook, metal, r));
  // Nickel stockings where the outer tubes start, and a ferrule each side of the crook.
  for (const [y, name] of [[0, 'Upper'], [-gap, 'Lower']] as const) {
    slide.add(rod(`TromboneStocking${name}`, [0, y, z0 + 0.002], [0, y, z0 - 0.03], r + 0.0009, trim));
    slide.add(rod(`TromboneCrookFerrule${name}`, [0, y, z1 + 0.004], [0, y, z1 - 0.006], r + 0.0009, trim));
  }
  const bump = new Mesh(new CylinderGeometry(0.0085, 0.0085, 0.012, 16), bumper);
  bump.name = 'TromboneBumper';
  bump.rotation.x = Math.PI / 2;
  bump.position.set(0, -gap / 2, z1 - gap / 2 - 0.004);
  slide.add(bump);
  // The brace: a bar between the tubes with a grip in the middle, sleeved onto each tube.
  slide.add(rod('TromboneSlideBrace', [0, -0.004, braceZ], [0, -gap + 0.004, braceZ], 0.0034, metal));
  const grip = new Mesh(new CylinderGeometry(0.0052, 0.0052, 0.026, 14), metal);
  grip.name = 'TromboneSlideGrip';
  grip.position.set(0, -gap / 2, braceZ);
  slide.add(grip);
  for (const y of [0, -gap]) slide.add(rod('TromboneBraceSleeve', [0, y, braceZ + 0.008], [0, y, braceZ - 0.008], r + 0.0012, metal));
  return slide;
}

export function createTrombone(): Group {
  const metal = brass();
  const trim = nickel();
  const T = TROMBONE;
  const gap = T.slideGap;
  const root = new Group();
  root.name = 'Trombone';

  root.add(turned('TromboneMouthpiece', mouthpieceProfile(), silver(), 1));

  // The inner slide: two nickel tubes from the receiver forward, held by the brace the left hand grips.
  const inner = new Group();
  inner.name = 'TromboneInnerSlide';
  inner.add(rod('TromboneInnerUpper', [0, 0, 0.004], [0, 0, T.innerEndZ], T.innerTube, trim));
  inner.add(rod('TromboneInnerLower', [0, -gap, -0.004], [0, -gap, T.innerEndZ], T.innerTube, trim));
  inner.add(rod('TromboneReceiver', [0, 0, 0.012], [0, 0, -0.03], T.outerTube + 0.0012, metal));
  inner.add(rod('TromboneSlideLock', [0, -gap, 0.004], [0, -gap, -0.03], T.outerTube + 0.0012, metal));
  inner.add(rod('TromboneInnerBrace', [0, -0.004, T.innerBraceZ], [0, -gap + 0.004, T.innerBraceZ], 0.0036, metal));
  for (const y of [0, -gap]) {
    inner.add(rod('TromboneInnerBraceSleeve', [0, y, T.innerBraceZ + 0.01], [0, y, T.innerBraceZ - 0.01], T.innerTube + 0.0014, metal));
  }
  root.add(inner);
  root.add(outerSlide(metal, trim, rubber()));

  // The bell section, on the left.
  const bellSection = new Group();
  bellSection.name = 'TromboneBell';
  const lowerLegX = -0.1;
  const legY = -gap;
  bellSection.add(
    pipe('TromboneGooseneck', [
      [0, -gap, 0.004], [0, -gap, 0.02], [-0.03, -gap, 0.04], [-0.07, -gap, 0.05],
      [lowerLegX, legY, 0.07], [lowerLegX, legY, 0.1],
    ], metal),
  );
  // The tuning slide behind the head: two legs and a crook, its outer tubes sleeved over the section's.
  const upper: P = [T.bellX, T.bellY, T.tuningZ];
  const lower: P = [lowerLegX, legY, T.tuningZ];
  bellSection.add(rod('TromboneTuningLower', [lowerLegX, legY, 0.1], lower, T.tube, metal));
  bellSection.add(rod('TromboneTuningUpper', [T.bellX, T.bellY, T.flareStartZ], upper, T.tube, metal));
  const mid: P = [(upper[0] + lower[0]) / 2, (upper[1] + lower[1]) / 2, T.tuningZ];
  const half = Math.hypot(upper[0] - lower[0], upper[1] - lower[1]) / 2;
  const u: P = [(lower[0] - mid[0]) / half, (lower[1] - mid[1]) / half, 0];
  bellSection.add(pipe('TromboneTuningCrook', arc(mid, u, [0, 0, 1], half, 0, Math.PI, 16), metal));
  for (const [p, name] of [[lower, 'Lower'], [upper, 'Upper']] as const) {
    bellSection.add(rod(`TromboneTuningSleeve${name}`, [p[0], p[1], T.tuningZ], [p[0], p[1], T.tuningZ - 0.11], T.tube + 0.001, metal));
  }
  bellSection.add(rod('TromboneTuningBrace', [lowerLegX, legY, T.tuningZ - 0.06], [T.bellX, T.bellY, T.tuningZ - 0.06], 0.0028, metal));
  const flare = turned('TromboneBellFlare', bellProfile(), metal, -1, 56);
  flare.position.set(T.bellX, T.bellY, T.flareStartZ);
  bellSection.add(flare);
  // The bell brace, from the bell tube across to the slide lock, where the left thumb hooks round.
  bellSection.add(rod('TromboneBellBrace', [T.bellX, T.bellY, T.bellBraceZ], [-0.008, -gap + 0.004, -0.02], 0.0034, metal));
  bellSection.add(rod('TromboneBellBraceCollar', [T.bellX, T.bellY, T.bellBraceZ + 0.01], [T.bellX, T.bellY, T.bellBraceZ - 0.01], T.tube + 0.0014, metal));
  root.add(bellSection);
  return root;
}
