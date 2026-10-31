/**
 * A five-piece drum kit with hi-hat, crash and ride, plus a kick trigger
 * pad, and a 5A drumstick.
 *
 * Kit space (see ../drums/geometry.ts): the origin is on the floor where
 * the drummer stands, +X to their right, -Z toward the kit. The kit is two
 * groups: `Base`, everything on the floor (the bass drum and its pedal,
 * the stands' tripods and outer tubes, the floor tom's legs), and `Rig`,
 * everything carried on the stands' inner tubes (the drums, cymbals and
 * pad). Raising the rig telescopes the inner tubes out of the outer ones;
 * the kit is modelled with the snare head at NOMINAL_SNARE. Each playing
 * piece is a group whose origin is the centre of its playing surface,
 * +Y out of it.
 */

import {
  CapsuleGeometry,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Material,
} from '@iwsdk/core';
import {
  BASS_DRUM,
  NOMINAL_SNARE,
  type Piece,
  PIECES,
  RIG_TRAVEL,
  STICK,
  surfaceOf,
  TIP_REACH,
} from '../drums/geometry.js';
import { alignSpan, bevelBox } from './lib/hardsurface.js';

/** The group each piece is built in, by id. */
export const PIECE_NAMES: Record<Piece['id'], string> = {
  kick: 'KickPad',
  snare: 'Snare',
  hihat: 'HiHat',
  tom1: 'HighTom',
  tom2: 'MidTom',
  floorTom: 'FloorTom',
  crash: 'Crash',
  ride: 'Ride',
};

const shellFinish = new MeshStandardMaterial({ name: 'ShellLacquer', color: 0x7c1424, roughness: 0.22, metalness: 0.35 });
const chrome = new MeshStandardMaterial({ name: 'Chrome', color: 0xd9dde2, roughness: 0.16, metalness: 1 });
const coatedHead = new MeshStandardMaterial({ name: 'CoatedHead', color: 0xeee8da, roughness: 0.78, metalness: 0 });
const blackHead = new MeshStandardMaterial({ name: 'BlackHead', color: 0x17171a, roughness: 0.45, metalness: 0 });
const bronze = new MeshStandardMaterial({ name: 'CymbalBronze', color: 0xc99b52, roughness: 0.3, metalness: 1, side: DoubleSide });
const rubber = new MeshStandardMaterial({ name: 'Rubber', color: 0x161618, roughness: 0.9, metalness: 0 });
const padRubber = new MeshStandardMaterial({ name: 'PadRubber', color: 0x2b2c30, roughness: 0.86, metalness: 0 });
const felt = new MeshStandardMaterial({ name: 'Felt', color: 0xe8e2d2, roughness: 1, metalness: 0 });
const hickory = new MeshStandardMaterial({ name: 'Hickory', color: 0xd8b787, roughness: 0.5, metalness: 0 });

const UP = new Vector3(0, 1, 0);
const TUBE_OUTER = 0.0125;
const TUBE_INNER = 0.0095;
/** An inner tube reaches this far down inside its outer tube at the rig's highest. */
const TUBE_OVERLAP = 0.06;

function mesh(name: string, geometry: BufferGeometry, material: Material): Mesh {
  const m = new Mesh(geometry, material);
  m.name = name;
  return m;
}

/** A tube from `a` to `b`. */
function tube(name: string, a: Vector3, b: Vector3, radius: number, material: Material = chrome): Mesh {
  const m = mesh(name, new CylinderGeometry(radius, radius, a.distanceTo(b), 16), material);
  alignSpan(m, a, b);
  return m;
}

/**
 * A chrome hoop round a head of radius `r`: a flanged band whose top edge
 * stands `above` over the head.
 */
function hoop(name: string, r: number, above = 0.008, band = 0.02, material: Material = chrome): Mesh {
  const pts = [
    new Vector2(r + 0.001, -band + above),
    new Vector2(r + 0.006, -band + above),
    new Vector2(r + 0.006, above - 0.002),
    new Vector2(r + 0.004, above),
    new Vector2(r + 0.001, above),
    new Vector2(r + 0.001, -band + above),
  ];
  return mesh(name, new LatheGeometry(pts, 64), material);
}

/**
 * A drum in piece space: the batter head at the origin facing +Y, the
 * shell running down to the resonant head `depth` below, hoops at both
 * ends and lugs round the shell.
 */
function drum(name: string, r: number, depth: number, lugs: number, resonant: Material = coatedHead): Group {
  const g = new Group();
  g.name = name;
  const shell = mesh('Shell', new CylinderGeometry(r, r, depth - 0.004, 64, 1, true), shellFinish);
  shell.position.y = -depth / 2;
  const head = mesh('Head', new CircleGeometry(r, 64), coatedHead);
  head.rotation.x = -Math.PI / 2;
  const bottom = mesh('ResonantHead', new CircleGeometry(r, 64), resonant);
  bottom.rotation.x = Math.PI / 2;
  bottom.position.y = -depth;
  const top = hoop('Hoop', r);
  const low = hoop('BottomHoop', r);
  low.rotation.x = Math.PI;
  low.position.y = -depth;
  g.add(shell, head, bottom, top, low);
  // Lugs, each with a tension rod up to the top hoop and down to the bottom one.
  const lugGeo = new CapsuleGeometry(0.0055, Math.min(0.03, depth * 0.35), 4, 8);
  const rodGeo = new CylinderGeometry(0.0022, 0.0022, 0.03, 8);
  const lugRow = new Group();
  lugRow.name = 'Lugs';
  for (let i = 0; i < lugs; i++) {
    const a = ((i + 0.5) / lugs) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const lug = mesh(`Lug${i}`, lugGeo, chrome);
    lug.position.set(c * (r + 0.006), -depth / 2, s * (r + 0.006));
    const rodTop = mesh(`RodTop${i}`, rodGeo, chrome);
    rodTop.position.set(c * (r + 0.009), -0.006, s * (r + 0.009));
    const rodBottom = mesh(`RodBottom${i}`, rodGeo, chrome);
    rodBottom.position.set(c * (r + 0.009), -depth + 0.006, s * (r + 0.009));
    lugRow.add(lug, rodTop, rodBottom);
  }
  g.add(lugRow);
  return g;
}

/**
 * A cymbal in piece space: the playing surface's mid-bow at the origin,
 * +Y up out of it; the bell rises above, the edge dips below. The `Plate`
 * group is what swings when struck.
 */
function cymbal(name: string, r: number, bell: number): Group {
  const g = new Group();
  g.name = name;
  const plate = new Group();
  plate.name = 'Plate';
  const edge = -0.012;
  const bellBase = 0.01;
  const bellTop = 0.034;
  const height = (x: number) => {
    if (x >= bell) return edge + (bellBase - edge) * ((r - x) / (r - bell)) ** 1.1;
    const t = Math.max(0, (x - 0.007) / (bell - 0.007));
    return bellBase + (bellTop - bellBase) * (1 - t * t) ** 0.6;
  };
  const top: Vector2[] = [];
  const under: Vector2[] = [];
  const samples = 40;
  for (let i = 0; i <= samples; i++) {
    const x = 0.007 + (r - 0.007) * (i / samples) ** 1.2;
    const t = x > bell ? 0.0011 + 0.0012 * ((r - x) / (r - bell)) : 0.0024;
    top.push(new Vector2(x, height(x) + t / 2));
    under.push(new Vector2(x, height(x) - t / 2));
  }
  // A closed loop: under the plate out to the edge, round it, back over the top.
  const profile = [...under, new Vector2(r + 0.0004, edge), ...top.reverse(), under[0].clone()];
  plate.add(mesh('Bronze', new LatheGeometry(profile, 96), bronze));
  // Felts and the wing nut that hold it on the stand's tilter.
  const feltGeo = new CylinderGeometry(0.018, 0.018, 0.008, 24);
  const upperFelt = mesh('UpperFelt', feltGeo, felt);
  upperFelt.position.y = bellTop + 0.005;
  const nut = mesh('WingNut', bevelBox(0.03, 0.008, 0.008, 0.002), chrome);
  nut.position.y = bellTop + 0.014;
  plate.add(upperFelt, nut);
  g.add(plate);
  const lowerFelt = mesh('LowerFelt', feltGeo, felt);
  lowerFelt.position.y = bellBase - 0.008;
  const sleeve = mesh('Sleeve', new CylinderGeometry(0.005, 0.005, 0.07, 10), chrome);
  sleeve.position.y = bellTop - 0.02;
  g.add(lowerFelt, sleeve);
  return g;
}

/** The kick trigger pad: a round rubber face on a black housing, its centre at the origin. */
function kickPad(r: number): Group {
  const g = new Group();
  g.name = 'Pad';
  const face = mesh('Face', new CylinderGeometry(r, r, 0.012, 48), padRubber);
  face.position.y = -0.006;
  const housing = mesh('Housing', new CylinderGeometry(r + 0.008, r + 0.004, 0.026, 48), rubber);
  housing.position.y = -0.024;
  const rim = mesh('Rim', new TorusGeometry(r + 0.004, 0.004, 8, 48), rubber);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -0.004;
  g.add(face, housing, rim);
  return g;
}

/**
 * A tripod stand's floor half: three folding legs from a hub, with rubber
 * feet, and the outer tube rising to `top`. `away` (radians about Y) turns
 * the legs so one points that way.
 */
function tripod(name: string, x: number, z: number, top: number, spread = 0.26, away = 0): Group {
  const g = new Group();
  g.name = name;
  const hubY = 0.24;
  const hub = new Vector3(x, hubY, z);
  g.add(tube('OuterTube', new Vector3(x, 0.12, z), new Vector3(x, top, z), TUBE_OUTER));
  const collar = mesh('Collar', new CylinderGeometry(TUBE_OUTER + 0.004, TUBE_OUTER + 0.004, 0.03, 16), chrome);
  collar.position.set(x, top - 0.012, z);
  const bracket = mesh('LegBracket', new CylinderGeometry(TUBE_OUTER + 0.006, TUBE_OUTER + 0.006, 0.04, 16), chrome);
  bracket.position.copy(hub);
  g.add(collar, bracket);
  for (let i = 0; i < 3; i++) {
    const a = away + (i * Math.PI * 2) / 3;
    const foot = new Vector3(x + Math.sin(a) * spread, 0.012, z - Math.cos(a) * spread);
    g.add(tube(`Leg${i}`, hub, foot, 0.008));
    // A brace from low on the tube out to the middle of the leg.
    const mid = hub.clone().lerp(foot, 0.5);
    g.add(tube(`Brace${i}`, new Vector3(x, 0.14, z), mid, 0.004));
    const shoe = mesh(`Foot${i}`, new SphereGeometry(0.014, 12, 8), rubber);
    shoe.scale.set(1, 0.7, 1);
    shoe.position.copy(foot);
    g.add(shoe);
  }
  return g;
}

/** Where a piece is modelled, and the turn that tips piece +Y to its surface's normal. */
function placement(piece: Piece): { at: Vector3; turn: Quaternion; normal: Vector3 } {
  const s = surfaceOf(piece, NOMINAL_SNARE);
  const normal = new Vector3(...s.normal);
  return { at: new Vector3(...s.center), turn: new Quaternion().setFromUnitVectors(UP, normal), normal };
}

/** The bass drum on its side with spurs, and the pedal at its batter head. */
function bassDrum(): Group {
  const g = new Group();
  g.name = 'BassDrum';
  const { x, z, radius: r, depth } = BASS_DRUM;
  const shell = drum('Drum', r, depth, 10, blackHead);
  // The drum lies on its side, batter head toward the drummer, hoops resting on the floor.
  shell.rotation.x = Math.PI / 2;
  shell.position.set(x, r + 0.008, z + depth / 2);
  g.add(shell);
  // Spurs, out from the shell's sides near the front, down to the floor.
  for (const side of [-1, 1]) {
    const from = new Vector3(x + side * (r + 0.01), r * 0.55, z - depth * 0.3);
    const to = new Vector3(x + side * (r + 0.13), 0.01, z - depth * 0.15);
    g.add(tube(side < 0 ? 'SpurLeft' : 'SpurRight', from, to, 0.0075));
  }
  // The tom holder's block on top of the shell.
  const block = mesh('TomHolderBlock', bevelBox(0.05, 0.03, 0.08, 0.006), chrome);
  block.position.set(x, 2 * r + 0.02, z - 0.05);
  g.add(block, tube('TomHolderSocket', new Vector3(x, 2 * r - 0.04, z - 0.05), new Vector3(x, 2 * r + 0.06, z - 0.05), TUBE_OUTER));
  g.add(pedal(x, z + depth / 2));
  return g;
}

/** The kick pedal: footboard, frame, and a felt beater that `KickBeater` swings onto the head. */
function pedal(x: number, head: number): Group {
  const g = new Group();
  g.name = 'KickPedal';
  const base = mesh('BasePlate', bevelBox(0.11, 0.008, 0.3, 0.003), chrome);
  base.position.set(x, 0.004, head + 0.15);
  const board = mesh('Footboard', bevelBox(0.085, 0.012, 0.25, 0.004), padRubber);
  board.position.set(x, 0.045, head + 0.17);
  board.rotation.x = -0.2;
  g.add(base, board);
  const axleY = 0.15;
  const axleZ = head + 0.045;
  for (const side of [-1, 1]) {
    g.add(tube(side < 0 ? 'FrameLeft' : 'FrameRight', new Vector3(x + side * 0.05, 0.008, axleZ), new Vector3(x + side * 0.05, axleY, axleZ), 0.008));
  }
  g.add(tube('Axle', new Vector3(x - 0.055, axleY, axleZ), new Vector3(x + 0.055, axleY, axleZ), 0.006));
  // The beater, pivoting on the axle: at rest it leans back from the head.
  const beater = new Group();
  beater.name = 'KickBeater';
  beater.position.set(x, axleY, axleZ);
  beater.rotation.x = BEATER_REST;
  const shaft = mesh('Shaft', new CylinderGeometry(0.004, 0.004, 0.2, 10), chrome);
  shaft.position.y = 0.1;
  const ball = mesh('Ball', new CylinderGeometry(0.03, 0.03, 0.045, 24), felt);
  ball.rotation.z = Math.PI / 2;
  ball.position.y = 0.19;
  beater.add(shaft, ball);
  g.add(beater);
  return g;
}

/** The beater's lean back from the head at rest (radians about X); 0 is upright, against it. */
export const BEATER_REST = 0.55;

/**
 * Where an inner tube must stop (nominal) so that at the rig's highest it
 * still overlaps the outer tube, which tops out at `outerTop`.
 */
const innerBottom = (outerTop: number) => outerTop - TUBE_OVERLAP - RIG_TRAVEL.up;
/** The outer tube tops out this far below the mount, so some inner tube shows at the rig's lowest. */
const outerTopFor = (mount: number) => mount - RIG_TRAVEL.down - 0.05;

/** One stand: its tripod in the base, its inner tube in the rig, up to `mount`. */
function stand(base: Group, rig: Group, name: string, x: number, z: number, mount: number, spread?: number, away?: number): void {
  const top = outerTopFor(mount);
  base.add(tripod(`${name}Stand`, x, z, top, spread, away));
  rig.add(tube(`${name}InnerTube`, new Vector3(x, innerBottom(top), z), new Vector3(x, mount, z), TUBE_INNER));
}

/** Where the tom holder's arms meet, above the bass drum. */
const TOM_JOIN = new Vector3(BASS_DRUM.x, NOMINAL_SNARE + 0.08, BASS_DRUM.z - 0.03);

/** Builds the kit (see the module comment for its space). */
export function createDrumKit(): Group {
  const root = new Group();
  root.name = 'DrumKit';
  const base = new Group();
  base.name = 'Base';
  const rig = new Group();
  rig.name = 'Rig';
  root.add(base, rig);
  base.add(bassDrum());

  for (const piece of PIECES) {
    const { at, turn, normal } = placement(piece);
    const name = PIECE_NAMES[piece.id];
    const toKit = (p: Vector3) => p.applyQuaternion(turn).add(at);
    let model: Group;
    if (piece.kind === 'drum') {
      model = drum(name, piece.radius, piece.depth, piece.id === 'snare' ? 10 : piece.radius > 0.15 ? 8 : 6);
    } else if (piece.kind === 'cymbal') {
      model = cymbal(name, piece.radius, piece.depth);
    } else {
      model = new Group();
      model.name = name;
      model.add(kickPad(piece.radius));
    }
    model.position.copy(at);
    model.quaternion.copy(turn);
    rig.add(model);

    switch (piece.id) {
      case 'snare': {
        // A basket: three arms up from the tilter to the bottom hoop.
        const knuckle = toKit(new Vector3(0, -piece.depth - 0.035, 0));
        stand(base, rig, name, knuckle.x, knuckle.z, knuckle.y, 0.26, Math.PI);
        for (let i = 0; i < 3; i++) {
          const a = (i * Math.PI * 2) / 3 + Math.PI / 6;
          const end = toKit(new Vector3(Math.cos(a) * piece.radius * 0.95, -piece.depth - 0.006, Math.sin(a) * piece.radius * 0.95));
          rig.add(tube(`BasketArm${i}`, knuckle, end, 0.0055));
        }
        break;
      }
      case 'hihat': {
        // The bottom cymbal, turned over, meets the top one's edge; the pull rod runs through both.
        const bottom = cymbal(`${name}Bottom`, piece.radius, piece.depth);
        bottom.position.copy(toKit(new Vector3(0, -0.026, 0)));
        bottom.quaternion.copy(turn).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI));
        rig.add(bottom);
        const mount = toKit(new Vector3(0, -0.07, 0));
        stand(base, rig, name, mount.x, mount.z, mount.y, 0.24, Math.PI);
        rig.add(tube('PullRod', mount, toKit(new Vector3(0, 0.07, 0)), 0.003));
        const clutch = mesh('Clutch', new CylinderGeometry(0.012, 0.012, 0.03, 16), chrome);
        clutch.position.copy(toKit(new Vector3(0, 0.05, 0)));
        rig.add(clutch);
        const board = mesh('HiHatPedal', bevelBox(0.08, 0.012, 0.26, 0.004), padRubber);
        board.position.set(mount.x, 0.03, mount.z + 0.2);
        board.rotation.x = -0.15;
        base.add(board);
        break;
      }
      case 'crash':
      case 'ride': {
        const knuckle = toKit(new Vector3(0, -0.04, 0));
        const tilter = mesh(`${name}Tilter`, new SphereGeometry(0.014, 16, 12), chrome);
        tilter.position.copy(knuckle);
        rig.add(tilter);
        stand(base, rig, name, knuckle.x, knuckle.z, knuckle.y - 0.01, 0.27, piece.id === 'ride' ? Math.PI / 3 : -Math.PI / 3);
        break;
      }
      case 'kick': {
        const mount = toKit(new Vector3(0, -0.06, 0));
        stand(base, rig, name, mount.x, mount.z, mount.y, 0.18, Math.PI);
        const clamp = mesh('PadClamp', bevelBox(0.04, 0.035, 0.03, 0.005), rubber);
        clamp.position.copy(mount);
        clamp.quaternion.copy(turn);
        rig.add(clamp);
        break;
      }
      case 'tom1':
      case 'tom2': {
        // An arm from the holder's post to a bracket on the back of the shell.
        const mid = toKit(new Vector3(0, -piece.depth * 0.55, 0));
        const out = TOM_JOIN.clone().sub(mid);
        out.addScaledVector(normal, -out.dot(normal)).normalize();
        const bracketAt = mid.clone().addScaledVector(out, piece.radius + 0.012);
        const bracket = mesh(`${name}Bracket`, bevelBox(0.03, 0.05, 0.024, 0.005), chrome);
        bracket.position.copy(bracketAt);
        bracket.quaternion.copy(turn);
        rig.add(bracket, tube(`${name}Arm`, TOM_JOIN, bracketAt, 0.0085));
        break;
      }
      case 'floorTom': {
        // Three legs, through brackets on the shell; the rig slides the brackets up and down them.
        const bracketY = at.y - piece.depth * 0.3;
        const legTop = bracketY + RIG_TRAVEL.up + 0.05;
        const legR = piece.radius + 0.032;
        [-40, 85, 195].forEach((deg, i) => {
          const a = (deg * Math.PI) / 180;
          const sx = Math.sin(a);
          const sz = -Math.cos(a);
          const lx = at.x + sx * legR;
          const lz = at.z + sz * legR;
          const knee = new Vector3(lx, 0.09, lz);
          const foot = new Vector3(lx + sx * 0.07, 0.012, lz + sz * 0.07);
          base.add(tube(`FloorTomLeg${i}`, knee, new Vector3(lx, legTop, lz), 0.0065));
          base.add(tube(`FloorTomFoot${i}`, knee, foot, 0.0065));
          const shoe = mesh(`FloorTomShoe${i}`, new SphereGeometry(0.012, 10, 8), rubber);
          shoe.position.copy(foot);
          base.add(shoe);
          const block = mesh(`FloorTomBracket${i}`, bevelBox(0.026, 0.04, 0.03, 0.005), chrome);
          block.position.set(at.x + sx * (piece.radius + 0.014), bracketY, at.z + sz * (piece.radius + 0.014));
          block.rotation.y = -a;
          rig.add(block);
        });
        break;
      }
    }
  }
  // The tom holder's post, from inside its socket on the bass drum up to where the arms meet.
  const post = new Vector3(BASS_DRUM.x, TOM_JOIN.y, BASS_DRUM.z - 0.05);
  const socketTop = 2 * BASS_DRUM.radius + 0.06;
  rig.add(tube('TomHolderPost', new Vector3(post.x, innerBottom(socketTop + TUBE_OVERLAP), post.z), post, TUBE_INNER));
  const hub = mesh('TomHolderHub', new SphereGeometry(0.02, 16, 12), chrome);
  hub.position.copy(TOM_JOIN);
  rig.add(hub, tube('TomHolderNeck', post, TOM_JOIN, TUBE_INNER));
  return root;
}

/** Builds one drumstick (stick space, see ../drums/geometry.ts). */
export function createDrumstick(): Group {
  const { butt, radius, taperStart, neckRadius, tipRadius, tipLength } = STICK;
  const pts: Vector2[] = [new Vector2(0, -butt)];
  // A rounded butt end.
  for (let k = 1; k <= 4; k++) {
    const a = (Math.PI / 2) * (k / 4);
    pts.push(new Vector2(radius * Math.sin(a), -butt + radius * 0.5 * (1 - Math.cos(a))));
  }
  pts.push(new Vector2(radius, taperStart));
  // The acorn bead is an ellipse round TIP_REACH, joined to the neck where it is as thin.
  const half = tipLength / 2;
  const start = -Math.acos(neckRadius / tipRadius);
  const neckY = TIP_REACH + half * Math.sin(start);
  // The taper to the neck, a gentle curve.
  for (let k = 1; k < 8; k++) {
    const t = k / 8;
    pts.push(new Vector2(radius + (neckRadius - radius) * t ** 1.4, taperStart + (neckY - taperStart) * t));
  }
  for (let k = 0; k <= 8; k++) {
    const a = start + (Math.PI / 2 - start) * (k / 8);
    pts.push(new Vector2(Math.max(0, tipRadius * Math.cos(a)), TIP_REACH + half * Math.sin(a)));
  }
  const root = new Group();
  root.name = 'Drumstick';
  root.add(mesh('Wood', new LatheGeometry(pts, 20), hickory));
  return root;
}
