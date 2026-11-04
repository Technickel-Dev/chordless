/**
 * A single B-flat French horn in lacquered brass: a silver funnel
 * mouthpiece, the leadpipe forward and down to three rotary valves with
 * their finger levers, the coils wound in a vertical plane below, and the
 * bell tail sweeping out to a 12-inch bell that opens down and back on the
 * right. The levers (HornLever1 to 3, first nearest the player) are their
 * own groups, so the system pushes them down along -Y.
 *
 * Horn space (see ../horn/geometry.ts): +Y up, -Z forward, +X the
 * player's right; the origin is the mouthpiece receiver.
 */

import {
  CatmullRomCurve3,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from '@iwsdk/core';
import { BELL_AXIS, HORN } from '../horn/geometry.js';
import { alignSpan, bevelBox } from './lib/hardsurface.js';

const brass = () => new MeshStandardMaterial({ name: 'LacqueredBrass', color: 0xd9a04c, metalness: 0.9, roughness: 0.27 });
const nickel = () => new MeshStandardMaterial({ name: 'Nickel', color: 0xd6d8dc, metalness: 1, roughness: 0.22 });
const silver = () => new MeshStandardMaterial({ name: 'Silver', color: 0xe4e6ea, metalness: 1, roughness: 0.16 });

type P = [number, number, number];

/** A tube swept along `points`. */
function pipe(name: string, points: P[], material: MeshStandardMaterial, radius: number = HORN.tube, closed = false): Mesh {
  const curve = new CatmullRomCurve3(points.map((p) => new Vector3(...p)), closed, 'centripetal');
  const mesh = new Mesh(new TubeGeometry(curve, Math.max(32, points.length * 8), radius, 12, closed), material);
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

/** The bell's radius `s` metres along the flare: a Bessel horn from the tube to the rim. */
export function bellRadiusAt(s: number): number {
  const L = HORN.flareLength;
  const ratio = (HORN.bellRadius / HORN.tube) ** (1 / 0.8);
  const c = (ratio * L) / (ratio - 1);
  return HORN.tube * (c / (c - Math.min(s, L))) ** 0.8;
}

/** The bell's lathe profile (+Y along the flare): outside out to a rolled rim, then back inside. */
function bellProfile(): [number, number][] {
  const L = HORN.flareLength;
  const bead = 0.003;
  const N = 60;
  const at = (i: number) => L * (1 - (1 - i / N) ** 2.2) - (i === N ? bead : 0);
  const outer: [number, number][] = [];
  for (let i = 0; i <= N; i++) outer.push([bellRadiusAt(at(i)), at(i)]);
  const rim = outer[outer.length - 1];
  const roll: [number, number][] = [];
  for (let k = 1; k <= 8; k++) {
    const a = -Math.PI / 2 + (Math.PI * 1.5 * k) / 8;
    roll.push([rim[0] + bead * Math.cos(a) * 0.9, L - bead + bead * Math.sin(a) + bead]);
  }
  const inner: [number, number][] = [];
  for (let i = N; i >= 14; i--) inner.push([Math.max(0.001, bellRadiusAt(at(i)) - 0.0009), at(i) - bead * 0.5]);
  return [...outer, ...roll, ...inner];
}

/** The funnel mouthpiece, rim at +Y, in lathe space. */
function mouthpieceProfile(): [number, number][] {
  const L = HORN.mouthpieceZ;
  const R = HORN.mouthpieceRim;
  return [
    [0.0036, -0.01], [0.0044, -0.01], [0.005, 0.02], [0.0058, 0.035], [0.0072, L - 0.016],
    [0.0088, L - 0.005], [R, L - 0.0025], [R + 0.0012, L - 0.0008], [R, L], [R - 0.0028, L - 0.0006],
    [0.0062, L - 0.012], [0.0028, L - 0.03], [0.0024, L - 0.045],
  ];
}

/** Points round a circle in the plane of `u` and `v` about `center`. */
function circle(center: P, u: P, v: P, radius: number, steps = 48): P[] {
  const pts: P[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (2 * Math.PI * i) / steps;
    pts.push([0, 1, 2].map((k) => center[k] + (u[k] * Math.cos(a) + v[k] * Math.sin(a)) * radius) as P);
  }
  return pts;
}

/** A valve's finger lever, its top at the group's origin: the spatula and the arm down to the rotor. */
function lever(n: number, metal: MeshStandardMaterial): Group {
  const g = new Group();
  g.name = `HornLever${n}`;
  const spatula = new Mesh(bevelBox(0.017, 0.003, 2 * HORN.leverWidth, 0.0008), metal);
  spatula.name = `HornLeverPad${n}`;
  spatula.position.set(0, -0.0015, 0);
  g.add(spatula);
  const rotor: P = [HORN.valveX - HORN.leverX - 0.012, HORN.valveY - HORN.leverTop + 0.008, 0];
  g.add(rod(`HornLeverArm${n}`, [0.004, -0.003, 0], rotor, 0.0022, metal));
  return g;
}

export function createFrenchHorn(): Group {
  const metal = brass();
  const trim = nickel();
  const H = HORN;
  const root = new Group();
  root.name = 'FrenchHorn';

  const mouthpiece = new Mesh(new LatheGeometry(mouthpieceProfile().map(([r, y]) => new Vector2(r, y)), 36), silver());
  mouthpiece.name = 'HornMouthpiece';
  mouthpiece.rotation.x = Math.PI / 2;
  root.add(mouthpiece);
  root.add(rod('HornReceiver', [0, 0, 0.004], [0, 0, -0.03], H.tube + 0.0012, metal));

  const [v1, v2, v3] = H.valveZ;
  const vy = H.valveY;
  root.add(pipe('HornLeadpipe', [[0, 0, -0.02], [0, -0.012, -0.06], [-0.012, -0.04, -0.105], [H.valveX, vy + 0.014, v1 + 0.018], [H.valveX, vy + 0.006, v1 + 0.004]], metal, H.tube * 0.9));

  // The valve section: three rotor casings across the coil's left face, joined, each with its slide below.
  const valves = new Group();
  valves.name = 'HornValves';
  H.valveZ.forEach((z, i) => {
    valves.add(rod(`HornCasing${i + 1}`, [H.valveX - H.casingLength / 2, vy, z], [H.valveX + H.casingLength / 2, vy, z], H.casingRadius, metal, 24));
    for (const s of [-1, 1]) {
      const x = H.valveX + (s * H.casingLength) / 2;
      valves.add(rod(`HornCap${i + 1}`, [x, vy, z], [x + s * 0.003, vy, z], H.casingRadius + 0.0008, trim, 24));
    }
    const drop = 0.055 + 0.012 * i;
    valves.add(pipe(`HornValveSlide${i + 1}`, [[H.valveX, vy - 0.01, z - 0.006], [H.valveX, vy - drop, z - 0.008], [H.valveX, vy - drop - 0.012, z + 0.002], [H.valveX, vy - drop, z + 0.01], [H.valveX, vy - 0.01, z + 0.007]], metal, H.tube * 0.85));
  });
  valves.add(rod('HornValveLink', [H.valveX, vy + 0.011, v1], [H.valveX, vy + 0.011, v3], H.tube * 0.8, metal));
  root.add(valves);
  H.valveZ.forEach((z, i) => {
    const l = lever(i + 1, trim);
    l.position.set(H.leverX, H.leverTop, z);
    root.add(l);
  });

  // The coils, wound in the vertical plane below the leadpipe.
  const coils = new Group();
  coils.name = 'HornCoils';
  const c = H.coilCenter as unknown as P;
  H.coilRadii.forEach((r, i) => coils.add(pipe(`HornCoil${i + 1}`, circle([c[0] + (i - 1) * 0.0105, c[1], c[2]], [0, 0, 1], [0, 1, 0], r), metal, H.tube, true)));
  coils.add(pipe('HornValveToCoil', [[H.valveX + 0.016, vy, v3], [-0.004, vy - 0.02, v3 - 0.03], [c[0] - 0.0105, c[1] + 0.06, c[2] - H.coilRadii[0] + 0.012]], metal));
  // Braces from the leadpipe and the valves to the coils.
  coils.add(rod('HornBrace1', [-0.006, -0.03, -0.08], [c[0] - 0.0105, c[1] + H.coilRadii[0] - 0.002, c[2] + 0.025], 0.0022, metal));
  coils.add(rod('HornBrace2', [H.valveX + 0.012, vy - 0.012, v2], [c[0] - 0.0105, c[1] + H.coilRadii[2], c[2] - 0.02], 0.0022, metal));
  root.add(coils);

  // The bell tail from the bottom of the coils to the throat, and the bell opening down and back on the right.
  const bell = new Group();
  bell.name = 'HornBell';
  const throat = H.throat as unknown as P;
  const lead: P = [0, 1, 2].map((k) => throat[k] - BELL_AXIS[k] * 0.02) as P;
  const a = (25 * Math.PI) / 180;
  bell.add(pipe('HornBellTail', [[c[0] + 0.0105, c[1] - H.coilRadii[0] * Math.cos(a), c[2] - H.coilRadii[0] * Math.sin(a)], lead, throat], metal, H.tube * 1.15));
  const flare = new Mesh(new LatheGeometry(bellProfile().map(([r, y]) => new Vector2(r, y)), 64), metal);
  flare.name = 'HornBellFlare';
  flare.position.set(...throat);
  flare.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(...BELL_AXIS));
  bell.add(flare);
  const garland = new Mesh(new TorusGeometry(0.03, 0.0016, 8, 40), trim);
  garland.name = 'HornBellGarland';
  garland.position.set(...([0, 1, 2].map((k) => throat[k] + BELL_AXIS[k] * 0.12) as P));
  garland.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(...BELL_AXIS));
  garland.scale.setScalar(bellRadiusAt(0.12) / 0.03 + 0.03);
  bell.add(garland);
  root.add(bell);
  return root;
}
