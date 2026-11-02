/**
 * A B-flat trumpet in lacquered brass: the leadpipe from a silver
 * mouthpiece forward to the main tuning slide, three piston valves, the
 * bell bow behind them and the bell pipe forward to a Bessel-flared bell
 * with a rolled rim. The pistons (TrumpetValve1 to 3, first nearest the
 * player) are their own groups, so the system pushes them down along -Y.
 *
 * Trumpet space (see ../trumpet/geometry.ts): +Y up out of the buttons,
 * -Z toward the bell, +X the player's right; the origin is the second
 * valve's axis at the height of the bell pipe.
 */

import {
  CatmullRomCurve3,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from '@iwsdk/core';
import { TRUMPET } from '../trumpet/geometry.js';
import { alignSpan, bevelBox } from './lib/hardsurface.js';

const brass = () =>
  new MeshStandardMaterial({ name: 'LacqueredBrass', color: 0xd8a24a, metalness: 0.9, roughness: 0.26 });
const silver = () => new MeshStandardMaterial({ name: 'Silver', color: 0xdfe1e6, metalness: 1, roughness: 0.18 });
const pearl = () => new MeshStandardMaterial({ name: 'Pearl', color: 0xf3eee4, metalness: 0, roughness: 0.32 });

type P = [number, number, number];

/** Points round an arc in the plane of `u` and `v` about `center`, from angle `a0` to `a1`. */
function arc(center: P, u: P, v: P, radius: number, a0: number, a1: number, steps = 10): P[] {
  const pts: P[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    const c = Math.cos(a) * radius;
    const s = Math.sin(a) * radius;
    pts.push([center[0] + u[0] * c + v[0] * s, center[1] + u[1] * c + v[1] * s, center[2] + u[2] * c + v[2] * s]);
  }
  return pts;
}

/** A tube swept along `points` (trumpet space). */
function pipe(name: string, points: P[], material: MeshStandardMaterial, radius: number = TRUMPET.tube): Mesh {
  const curve = new CatmullRomCurve3(points.map((p) => new Vector3(...p)), false, 'centripetal');
  const mesh = new Mesh(new TubeGeometry(curve, Math.max(24, points.length * 6), radius, 14, false), material);
  mesh.name = name;
  return mesh;
}

/** A lathe-turned part from an (r, y) profile, about the Y axis. */
function turned(name: string, profile: [number, number][], material: MeshStandardMaterial, segments = 40): Mesh {
  const mesh = new Mesh(new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), segments), material);
  mesh.name = name;
  return mesh;
}

/** A short rod between two points. */
function rod(name: string, a: P, b: P, radius: number, material: MeshStandardMaterial): Mesh {
  const mesh = new Mesh(new CylinderGeometry(radius, radius, 1, 10), material);
  mesh.name = name;
  const length = alignSpan(mesh, new Vector3(...a), new Vector3(...b));
  mesh.scale.y = length;
  return mesh;
}

/** The bell's radius `s` metres along the flare from where it leaves the tube: a Bessel horn. */
export function bellRadiusAt(s: number): number {
  const L = TRUMPET.flareStartZ - TRUMPET.bellRimZ;
  // r = A / (c - s)^0.7, through the tube's radius at 0 and the rim's at L.
  const ratio = (TRUMPET.bellRadius / TRUMPET.tube) ** (1 / 0.7);
  const c = (ratio * L) / (ratio - 1);
  return TRUMPET.tube * (c / (c - Math.min(s, L))) ** 0.7;
}

/** The bell: the flare's outer surface out to a rolled rim and back inside, in lathe space (+Y along the flare). */
function bellProfile(): [number, number][] {
  const L = TRUMPET.flareStartZ - TRUMPET.bellRimZ;
  const wall = 0.0007;
  const bead = 0.0024;
  const outer: [number, number][] = [];
  const N = 48;
  for (let i = 0; i <= N; i++) {
    // Denser toward the rim, where it flares.
    const s = L * (1 - (1 - i / N) ** 2) - (i === N ? bead : 0);
    outer.push([bellRadiusAt(s), s]);
  }
  const rim = outer[outer.length - 1];
  const bead0: [number, number][] = [];
  for (let k = 1; k <= 8; k++) {
    const a = -Math.PI / 2 + (Math.PI * 1.5 * k) / 8;
    bead0.push([rim[0] + bead * Math.cos(a) * 0.9, L - bead + bead * Math.sin(a) + bead]);
  }
  const inner: [number, number][] = [];
  for (let i = N; i >= 10; i--) {
    const s = L * (1 - (1 - i / N) ** 2) - bead * 0.5;
    inner.push([Math.max(0.001, bellRadiusAt(s) - wall), s]);
  }
  return [...outer, ...bead0, ...inner];
}

/** A valve casing, its caps and ferrules, about the Y axis. */
function casingProfile(): [number, number][] {
  const { casingRadius: r, casingBottom: b, casingTop: t } = TRUMPET;
  return [
    [0.001, b - 0.007],
    [r + 0.0012, b - 0.007],
    [r + 0.0014, b - 0.001],
    [r, b],
    [r, b + 0.012],
    [r + 0.0008, b + 0.013],
    [r + 0.0008, b + 0.017],
    [r, b + 0.018],
    [r, t - 0.014],
    [r + 0.0008, t - 0.013],
    [r + 0.0008, t - 0.009],
    [r, t - 0.008],
    [r, t],
    [r + 0.0014, t + 0.001],
    [r + 0.0012, t + 0.006],
    [0.004, t + 0.007],
    [0.0028, t + 0.008],
  ];
}

/** A piston's stem and finger button, at rest; the group's origin is on the valve's axis. */
function piston(index: number, metal: MeshStandardMaterial, inlay: MeshStandardMaterial): Group {
  const { buttonTop: top, buttonRadius: br, casingTop } = TRUMPET;
  const g = new Group();
  g.name = `TrumpetValve${index + 1}`;
  g.add(turned(`TrumpetValve${index + 1}Stem`, [[0.001, casingTop + 0.004], [0.0026, casingTop + 0.004], [0.0026, top - 0.007], [0.001, top - 0.007]], metal, 16));
  g.add(
    turned(
      `TrumpetValve${index + 1}Button`,
      [
        [0.001, top - 0.008],
        [br * 0.6, top - 0.008],
        [br, top - 0.0055],
        [br, top - 0.0012],
        [br - 0.0008, top],
        [br - 0.0016, top],
      ],
      metal,
      32,
    ),
  );
  const pad = new Mesh(new CylinderGeometry(br - 0.0016, br - 0.0016, 0.0012, 32), inlay);
  pad.name = `TrumpetValve${index + 1}Pearl`;
  pad.position.y = top - 0.0004;
  g.add(pad);
  return g;
}

/** The B-flat trumpet (see the header). */
export function createTrumpet(): Group {
  const T = TRUMPET;
  const metal = brass();
  const plate = silver();
  const inlay = pearl();
  const root = new Group();
  root.name = 'Trumpet';

  // Bell section: bell pipe back to the bell bow, round and forward to the first valve.
  const bx = T.bellPipeX;
  const bowR = (T.bellPipeY - T.lowerY) / 2;
  const bowC: P = [bx, (T.bellPipeY + T.lowerY) / 2, T.bellBowZ];
  const tubing = new Group();
  tubing.name = 'Tubing';
  tubing.add(
    pipe(
      'BellPipe',
      [
        [bx, T.bellPipeY, T.flareStartZ],
        [bx, T.bellPipeY, T.bellBowZ - 0.03],
        ...arc(bowC, [0, 1, 0], [0, 0, 1], bowR, 0, Math.PI, 14),
        [bx, T.lowerY, T.valveZ[0] + 0.035],
        [bx + 0.004, T.lowerY + 0.008, T.valveZ[0] + 0.006],
        [-T.casingRadius + 0.002, -0.036, T.valveZ[0]],
      ],
      metal,
    ),
  );
  // Leadpipe: from the receiver past the valves to the main slide's crook, round and back to the third valve.
  const lx = 0.022;
  const slideR = (T.leadpipeEndY - T.lowerY) / 2;
  const slideC: P = [lx, (T.leadpipeEndY + T.lowerY) / 2, T.mainSlideZ + slideR];
  tubing.add(
    pipe(
      'Leadpipe',
      [
        [T.leadpipeX, T.receiverY, T.receiverZ],
        [T.leadpipeX + 0.002, T.receiverY - 0.002, 0.11],
        [lx, 0.014, 0.05],
        [lx, 0.004, -0.04],
        [lx, T.leadpipeEndY, T.leadpipeEndZ],
        ...arc(slideC, [0, 1, 0], [0, 0, -1], slideR, 0, Math.PI, 14),
        [lx, T.lowerY, T.valveZ[2] - 0.03],
        [lx - 0.004, T.lowerY + 0.008, T.valveZ[2] - 0.008],
        [T.casingRadius - 0.002, -0.036, T.valveZ[2]],
      ],
      metal,
    ),
  );
  // Third valve slide, under the bell on the left, with its ring for the left hand.
  tubing.add(
    pipe(
      'ThirdSlide',
      [
        [-T.casingRadius + 0.002, -0.022, T.valveZ[2]],
        [-0.02, -0.021, T.valveZ[2] - 0.012],
        [-0.022, -0.021, -0.07],
        ...arc([-0.022, -0.032, -0.07], [0, 1, 0], [0, 0, -1], 0.011, 0, Math.PI, 8),
        [-0.022, -0.043, T.valveZ[2] - 0.012],
        [-T.casingRadius + 0.002, -0.042, T.valveZ[2]],
      ],
      metal,
      T.tube * 0.85,
    ),
  );
  const ring = new Mesh(new TorusGeometry(0.0085, 0.0014, 8, 24), metal);
  ring.name = 'ThirdSlideRing';
  ring.position.set(-0.034, -0.044, -0.05);
  ring.rotation.y = Math.PI / 2;
  tubing.add(ring);
  // Braces between the pipes.
  tubing.add(rod('BraceFront', [bx, T.bellPipeY, -0.085], [lx, -0.003, -0.085], 0.0018, metal));
  tubing.add(rod('BraceRear', [bx, T.bellPipeY, 0.12], [T.leadpipeX, T.receiverY - 0.001, 0.12], 0.0018, metal));
  root.add(tubing);

  // Bell: lathe space +Y runs along the flare, turned to point down -Z.
  const bell = turned('Bell', bellProfile(), metal, 64);
  bell.geometry.rotateX(-Math.PI / 2);
  bell.position.set(bx, T.bellPipeY, T.flareStartZ);
  root.add(bell);

  // Valves.
  const valves = new Group();
  valves.name = 'Valves';
  T.valveZ.forEach((z, i) => {
    const casing = turned(`ValveCasing${i + 1}`, casingProfile(), metal, 36);
    casing.position.z = z;
    valves.add(casing);
    const p = piston(i, plate, inlay);
    p.position.z = z;
    valves.add(p);
  });
  root.add(valves);

  // Mouthpiece in its receiver: lathe space +Y turned to +Z.
  const receiver = turned('Receiver', [[0.0058, 0], [0.0076, 0], [0.0076, 0.016], [0.0064, 0.018]], metal, 24);
  receiver.geometry.rotateX(Math.PI / 2);
  receiver.position.set(T.leadpipeX, T.receiverY, T.receiverZ - 0.012);
  root.add(receiver);
  const len = T.mouthpieceZ - (T.receiverZ - 0.01);
  const mouthpiece = turned(
    'Mouthpiece',
    [
      [0.0035, 0],
      [0.0048, 0],
      [0.0058, len * 0.45],
      [0.0072, len * 0.7],
      [0.0118, len * 0.92],
      [T.mouthpieceRim, len * 0.97],
      [T.mouthpieceRim - 0.001, len],
      [0.0085, len],
      [0.0078, len * 0.97],
      [0.003, len * 0.84],
    ],
    plate,
    40,
  );
  mouthpiece.geometry.rotateX(Math.PI / 2);
  mouthpiece.position.set(T.leadpipeX, T.receiverY, T.receiverZ - 0.01);
  root.add(mouthpiece);

  // Finger hook for the right little finger, on the leadpipe in front of the valves.
  const hook = new Mesh(new TorusGeometry(0.008, 0.0016, 8, 20, Math.PI), metal);
  hook.name = 'FingerHook';
  hook.rotation.y = Math.PI / 2;
  hook.position.set(lx, 0.0, -0.058);
  root.add(hook);

  // Water key at the bottom of the main slide's crook.
  const key = new Group();
  key.name = 'WaterKey';
  const lever = new Mesh(bevelBox(0.0042, 0.0022, 0.026, 0.0006), metal);
  lever.name = 'WaterKeyLever';
  lever.position.set(lx, T.lowerY - T.tube - 0.0016, T.mainSlideZ + 0.022);
  key.add(lever);
  const cork = new Mesh(new CylinderGeometry(0.0026, 0.0026, 0.003, 12), metal);
  cork.name = 'WaterKeyCup';
  cork.position.set(lx, T.lowerY - T.tube - 0.001, T.mainSlideZ + 0.012);
  key.add(cork);
  root.add(key);

  root.traverse((o: Object3D) => {
    if (o instanceof Mesh) o.castShadow = true;
  });
  return root;
}
