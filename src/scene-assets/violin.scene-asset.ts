/**
 * A full-size violin and its bow, as deterministic parentless prototypes.
 * AirViolinSystem builds its instrument from these, so the same geometry is
 * in the asset manifest for isolated previews.
 *
 * Violin frame (see src/violin/geometry.ts): +X up the neck toward the
 * scroll, +Y across the strings (G side), +Z out of the top; the origin is
 * on the top under the bridge.
 * Bow frame: the origin is where the hand holds the frog; +X runs along the
 * bow to the tip; the hair lies on the -Z side of the stick.
 */

import {
  CircleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Shape,
  ShapeGeometry,
  TorusGeometry,
  Vector3,
} from '@iwsdk/core';
import {
  BOW,
} from '../violin/bow.js';
import {
  boardZ,
  STRING_COUNT,
  stringY,
  stringZ,
  VIOLIN,
} from '../violin/geometry.js';
import { alignSpan, bevelBox, LoftSurface, placeOnSurface, type TubeSection } from './lib/hardsurface.js';

/** The loft library sweeps along Z with width on X and height on Y; violin parts run along X. */
const TO_VIOLIN = new Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1);

function materials() {
  return {
    spruce: new MeshStandardMaterial({ color: 0xc7863f, roughness: 0.38 }),
    maple: new MeshStandardMaterial({ color: 0x8e3b16, roughness: 0.35 }),
    ebony: new MeshStandardMaterial({ color: 0x121010, roughness: 0.45 }),
    bone: new MeshStandardMaterial({ color: 0xeee4cf, roughness: 0.4 }),
    bridgeMaple: new MeshStandardMaterial({ color: 0xe2c48e, roughness: 0.5 }),
    hole: new MeshStandardMaterial({ color: 0x050302, roughness: 0.9 }),
    steel: new MeshStandardMaterial({ color: 0xd2d2d2, roughness: 0.25, metalness: 0.9 }),
    gut: new MeshStandardMaterial({ color: 0xc9a86a, roughness: 0.3, metalness: 0.7 }),
    pernambuco: new MeshStandardMaterial({ color: 0x6b2a12, roughness: 0.3 }),
    hair: new MeshStandardMaterial({ color: 0xf1ead8, roughness: 0.8 }),
    pearl: new MeshStandardMaterial({ color: 0xe8f0f5, roughness: 0.2, metalness: 0.3 }),
    silver: new MeshStandardMaterial({ color: 0xc8c8cc, roughness: 0.3, metalness: 0.9 }),
  };
}
type Materials = ReturnType<typeof materials>;

const named = <T extends Object3D>(object: T, name: string): T => {
  object.name = name;
  return object;
};

/** Half the body's width along its length: lower bout, C-waist, upper bout. */
export function bodyHalfWidth(x: number): number {
  // Each bout a rounded-square superellipse; the C-bouts a concave curve
  // between them, which leaves the four corners standing out where they meet.
  const bout = (centre: number, halfLength: number, halfWidth: number) =>
    halfWidth * Math.max(0, 1 - Math.abs((x - centre) / halfLength) ** 2.6) ** (1 / 2.6);
  const lower = bout(-0.075, 0.098, 0.103);
  const upper = bout(0.112, 0.08, 0.084);
  const cBout = x > 0.0 && x < 0.062 ? 0.053 + 12 * (x - 0.031) ** 2 : 0;
  return Math.max(0.002, lower, upper, cBout);
}

const RIB = 0.031;
const TOP_ARCH = 0.015;
const BACK_ARCH = 0.014;

/** The body: one lofted shell, its top and back arched, the ribs straight. */
function body(m: Materials): Group {
  const group = named(new Group(), 'Body');
  const sections: TubeSection[] = [];
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const x = VIOLIN.tailX + ((VIOLIN.shoulderX - VIOLIN.tailX) * i) / steps;
    // The arch rises toward the middle of the body, lower at the ends.
    const along = Math.sin((Math.PI * i) / steps) ** 0.6;
    sections.push({
      z: x,
      halfW: bodyHalfWidth(x),
      hUp: RIB / 2 + TOP_ARCH * along,
      hDown: RIB / 2 + BACK_ARCH * along,
      cy: -TOP_ARCH - RIB / 2,
      power: 2.4,
    });
  }
  const shell = LoftSurface.tube(sections).build(sections.map((s) => s.z), 40, true);
  shell.applyMatrix4(TO_VIOLIN);
  group.add(named(new Mesh(shell, m.maple), 'Shell'));
  // The spruce top: a thin dome on the rim, overhanging the ribs a little.
  const top = sections.map((s) => ({ ...s, halfW: s.halfW + 0.0012, cy: (s.cy ?? 0) + RIB / 2, hUp: s.hUp - RIB / 2 + 0.0007, hDown: 0.0012 }));
  const topSurface = LoftSurface.tube(top);
  const plate = topSurface.build(top.map((s) => s.z), 40, true);
  plate.applyMatrix4(TO_VIOLIN);
  group.add(named(new Mesh(plate, m.spruce), 'Top'));
  group.add(fHoles(topSurface, m));
  return group;
}

/** The two f-holes either side of the bridge, laid on the top's own surface. */
function fHoles(top: LoftSurface, m: Materials): Group {
  // Placed in the loft's own frame, then turned into the violin's with it.
  const group = named(new Group(), 'FHoles');
  group.applyMatrix4(TO_VIOLIN);
  for (const side of [1, -1]) {
    // The long axis runs along the body; the S bends toward the bridge at the ends.
    const centre = (t: number) => side * 0.006 * Math.sin(Math.PI * (t - 0.5));
    const width = (t: number) => 0.0009 + 0.0008 * Math.sin(Math.PI * t);
    const shape = new Shape();
    const n = 24;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = -0.034 + 0.068 * t;
      if (i === 0) shape.moveTo(x, centre(t) + width(t));
      else shape.lineTo(x, centre(t) + width(t));
    }
    for (let i = n; i >= 0; i--) {
      const t = i / n;
      shape.lineTo(-0.034 + 0.068 * t, centre(t) - width(t));
    }
    const hole = named(new Group(), side > 0 ? 'FHoleG' : 'FHoleE');
    // Frame: tangent along the body (local X), on the top where it faces out toward that side.
    const frame = top.frameToward(0.003, new Vector3(side * 0.75, 1, 0));
    placeOnSurface(hole, frame, 0.0004);
    hole.add(new Mesh(new ShapeGeometry(shape), m.hole));
    for (const end of [0, 1]) {
      const eye = new Mesh(new CircleGeometry(end === 0 ? 0.0032 : 0.0026, 16), m.hole);
      eye.position.set(-0.034 + 0.068 * end, centre(end), 0.0001);
      hole.add(eye);
    }
    group.add(hole);
  }
  return group;
}

/** Neck, fingerboard and nut: the fingerboard rises toward its end, clear of the top. */
function neck(m: Materials): Group {
  const group = named(new Group(), 'Neck');
  const boardThickness = (x: number) => 0.0055 + 0.0035 * ((VIOLIN.nutX - x) / (VIOLIN.nutX - VIOLIN.boardEndX));
  const boardHalf = (x: number) =>
    (VIOLIN.boardWidthEnd + ((VIOLIN.boardWidthNut - VIOLIN.boardWidthEnd) * (x - VIOLIN.boardEndX)) / (VIOLIN.nutX - VIOLIN.boardEndX)) / 2;
  const board: TubeSection[] = [VIOLIN.boardEndX, (VIOLIN.boardEndX + VIOLIN.nutX) / 2, VIOLIN.nutX].map((x) => ({
    z: x,
    halfW: boardHalf(x),
    hUp: 0.0022,
    hDown: boardThickness(x) - 0.0022,
    cy: boardZ(x) - 0.0022,
    power: 2.6,
  }));
  const boardGeometry = LoftSurface.tube(board).build(board.map((s) => s.z), 24, true);
  boardGeometry.applyMatrix4(TO_VIOLIN);
  group.add(named(new Mesh(boardGeometry, m.ebony), 'Fingerboard'));

  // The neck: a rounded U under the fingerboard, deepening into the heel
  // where it meets the body.
  const heelX = VIOLIN.shoulderX - 0.012;
  const handle: TubeSection[] = [];
  for (const x of [heelX, heelX + 0.012, heelX + 0.035, 0.27, VIOLIN.nutX + 0.004]) {
    const bottomOfBoard = boardZ(Math.min(x, VIOLIN.nutX)) - boardThickness(Math.min(x, VIOLIN.nutX));
    const depth = x <= heelX + 0.001 ? bottomOfBoard + TOP_ARCH + 0.002 : x < heelX + 0.02 ? 0.024 : 0.019 - 0.002 * ((x - heelX) / 0.15);
    handle.push({ z: x, halfW: x <= heelX + 0.001 ? 0.0145 : 0.0125 - 0.0012 * ((x - heelX) / 0.15), hUp: 0.0006, hDown: depth, cy: bottomOfBoard, power: 2 });
  }
  const neckGeometry = LoftSurface.tube(handle).build(handle.map((s) => s.z), 20, true);
  neckGeometry.applyMatrix4(TO_VIOLIN);
  group.add(named(new Mesh(neckGeometry, m.maple), 'Handle'));

  const nut = new Mesh(bevelBox(0.004, VIOLIN.boardWidthNut, 0.0035, 0.0008), m.ebony);
  nut.position.set(VIOLIN.nutX + 0.002, 0, boardZ(VIOLIN.nutX) + 0.0006);
  group.add(named(nut, 'Nut'));
  return group;
}

/** Pegbox, scroll and pegs, past the nut and tilted back a little. */
function head(m: Materials): Group {
  const group = named(new Group(), 'Head');
  group.position.set(VIOLIN.nutX + 0.004, 0, boardZ(VIOLIN.nutX) - 0.006);
  group.rotation.y = (8 * Math.PI) / 180; // tips the scroll back, away from the strings
  const length = 0.07;
  for (const side of [1, -1]) {
    const wall = new Mesh(bevelBox(length, 0.004, 0.02, 0.0012), m.maple);
    wall.position.set(length / 2, side * 0.0085, -0.004);
    group.add(named(wall, side > 0 ? 'PegboxG' : 'PegboxE'));
  }
  const floor = new Mesh(bevelBox(length, 0.021, 0.004, 0.001), m.maple);
  floor.position.set(length / 2, 0, -0.0125);
  group.add(named(floor, 'PegboxBack'));

  // The scroll: a volute winding in on each side, round a central boss.
  const scroll = named(new Group(), 'Scroll');
  scroll.position.set(length + 0.014, 0, -0.002);
  const turns: [number, number, number][] = [
    [0.016, 0.0055, Math.PI * 1.5],
    [0.0095, 0.0045, Math.PI * 1.6],
    [0.0045, 0.0035, Math.PI * 2],
  ];
  for (const [radius, tube, arc] of turns) {
    const turn = new Mesh(new TorusGeometry(radius, tube, 10, 28, arc), m.maple);
    turn.rotation.x = Math.PI / 2; // wind about the across-strings axis
    scroll.add(turn);
  }
  const boss = new Mesh(new CylinderGeometry(0.004, 0.004, 0.02, 16), m.maple);
  scroll.add(named(boss, 'Boss'));
  group.add(scroll);

  // Pegs: through the pegbox, alternate sides, thumb pieces outside.
  for (let s = 0; s < STRING_COUNT; s++) {
    const peg = named(new Group(), `Peg${s}`);
    const side = s % 2 === 0 ? 1 : -1;
    peg.position.set(0.014 + s * 0.014, 0, -0.004);
    const shaft = new Mesh(new CylinderGeometry(0.0028, 0.0035, 0.034, 10), m.ebony);
    shaft.position.y = side * 0.004;
    peg.add(shaft);
    const thumb = new Mesh(bevelBox(0.018, 0.005, 0.014, 0.002), m.ebony);
    thumb.position.y = side * 0.024;
    peg.add(thumb);
    group.add(peg);
  }
  return group;
}

/** Bridge, tailpiece, chinrest and end button. */
function fittings(m: Materials): Group {
  const group = named(new Group(), 'Fittings');

  // The bridge, cut to the strings' arch, standing on two feet.
  const outline = new Shape();
  const half = VIOLIN.bridgeSpan / 2 + 0.004;
  outline.moveTo(-0.021, 0);
  outline.lineTo(-0.012, 0);
  outline.quadraticCurveTo(0, 0.008, 0.012, 0);
  outline.lineTo(0.021, 0);
  outline.lineTo(half, VIOLIN.bridgeZ * 0.55);
  for (let i = 0; i <= 16; i++) {
    const y = half - (2 * half * i) / 16;
    const sag = VIOLIN.archRadius - Math.sqrt(VIOLIN.archRadius ** 2 - y * y);
    outline.lineTo(y, VIOLIN.bridgeZ - 0.0008 - sag);
  }
  outline.lineTo(-half, VIOLIN.bridgeZ * 0.55);
  outline.closePath();
  const heart = new Shape();
  heart.absellipse(0, VIOLIN.bridgeZ * 0.5, 0.0035, 0.0045, 0, Math.PI * 2, false, 0);
  outline.holes.push(heart);
  const bridgeGeometry = new ExtrudeGeometry(outline, { depth: 0.0035, bevelEnabled: false, curveSegments: 6 });
  bridgeGeometry.translate(0, 0, -0.00175);
  bridgeGeometry.applyMatrix4(TO_VIOLIN);
  group.add(named(new Mesh(bridgeGeometry, m.bridgeMaple), 'Bridge'));

  const tailpiece = new Mesh(bevelBox(0.11, 0.036, 0.005, 0.0018), m.ebony);
  tailpiece.position.set(-0.1, 0, 0.013);
  tailpiece.rotation.y = (5 * Math.PI) / 180; // its tail end dips toward the saddle
  group.add(named(tailpiece, 'Tailpiece'));
  const saddle = new Mesh(bevelBox(0.006, 0.026, 0.006, 0.001), m.ebony);
  saddle.position.set(VIOLIN.tailX + 0.002, 0, -0.001);
  group.add(named(saddle, 'Saddle'));

  // The chin rest sits over the tail on the G side, clamped to the rim.
  const chin = new Mesh(bevelBox(0.066, 0.058, 0.008, 0.0035, 0.02), m.ebony);
  chin.position.set(VIOLIN.tailX + 0.04, 0.03, 0.009);
  group.add(named(chin, 'ChinRest'));
  const clamp = new Mesh(new CylinderGeometry(0.0025, 0.0025, 0.03, 8), m.silver);
  clamp.position.set(VIOLIN.tailX + 0.012, 0.012, -0.012);
  clamp.rotation.x = Math.PI / 2;
  group.add(named(clamp, 'ChinClamp'));

  const button = new Mesh(new CylinderGeometry(0.0045, 0.0035, 0.01, 12), m.ebony);
  button.rotation.z = Math.PI / 2;
  button.position.set(VIOLIN.tailX - 0.004, 0, -0.03);
  group.add(named(button, 'EndButton'));
  return group;
}

/** The strings: tailpiece to bridge, bridge to nut, nut into the pegbox. */
function strings(m: Materials): Group {
  const group = named(new Group(), 'Strings');
  const unit = new CylinderGeometry(1, 1, 1, 6);
  for (let s = 0; s < STRING_COUNT; s++) {
    const radius = 0.00062 - s * 0.00008;
    const points = [
      new Vector3(-0.05, stringY(s, 0) * 0.7, 0.0165),
      new Vector3(VIOLIN.bridgeX, stringY(s, VIOLIN.bridgeX), stringZ(s, VIOLIN.bridgeX)),
      new Vector3(VIOLIN.nutX, stringY(s, VIOLIN.nutX), stringZ(s, VIOLIN.nutX)),
      new Vector3(VIOLIN.nutX + 0.018 + s * 0.014, stringY(s, VIOLIN.nutX) * 0.4, stringZ(s, VIOLIN.nutX) - 0.006),
    ];
    for (let i = 0; i < points.length - 1; i++) {
      const piece = new Mesh(unit, s === 3 ? m.steel : m.gut);
      piece.scale.set(radius, alignSpan(piece, points[i], points[i + 1]), radius);
      group.add(named(piece, `String${s}_${i}`));
    }
  }
  return group;
}

/** A violin, with its parts named for inspection. */
export function createViolin(): Group {
  const m = materials();
  const root = named(new Group(), 'Violin');
  root.add(body(m), neck(m), head(m), fittings(m), strings(m));
  return root;
}

/**
 * A bow. The stick is cambered toward the hair (closest at the middle);
 * the frog holds the hair 14 mm from the stick at the hand, the tip's head
 * holds it at the far end. Origin at the grip, +X to the tip, hair on -Z.
 */
export function createBow(): Group {
  const m = materials();
  const root = named(new Group(), 'Bow');
  const start = BOW.frogToHair;
  const end = start + BOW.hairLength;
  const hairZ = -BOW.hairDrop;

  // Stick: round, tapering from 8.6 mm to 5.4 mm, its height above the hair
  // following the camber.
  const stickHeight = (x: number) => {
    const t = Math.min(1, Math.max(0, (x - start) / BOW.hairLength));
    return hairZ + 0.0135 - 0.0075 * Math.sin(Math.PI * t) ** 1.3 + 0.002 * t;
  };
  const stick: TubeSection[] = [];
  for (let i = 0; i <= 16; i++) {
    const x = -BOW.buttonLength + ((end + 0.006 + BOW.buttonLength) * i) / 16;
    const r = 0.0043 - 0.0016 * Math.max(0, x / end);
    stick.push({ z: x, halfW: r, hUp: r, cy: stickHeight(x), power: 2 });
  }
  const stickGeometry = LoftSurface.tube(stick).build(stick.map((s) => s.z), 12, true);
  stickGeometry.applyMatrix4(TO_VIOLIN);
  root.add(named(new Mesh(stickGeometry, m.pernambuco), 'Stick'));

  // Frog: ebony block between stick and hair under the hand, with its pearl eye.
  const frog = named(new Group(), 'Frog');
  const block = new Mesh(bevelBox(0.042, 0.011, 0.014, 0.0025), m.ebony);
  block.position.set(0.004, 0, hairZ + 0.007);
  frog.add(block);
  for (const side of [1, -1]) {
    const eye = new Mesh(new CircleGeometry(0.0022, 16), m.pearl);
    eye.position.set(0.004, side * 0.0056, hairZ + 0.008);
    eye.rotation.x = -side * Math.PI / 2;
    frog.add(eye);
  }
  const ferrule = new Mesh(bevelBox(0.004, 0.012, 0.004, 0.001), m.silver);
  ferrule.position.set(start, 0, hairZ + 0.002);
  frog.add(ferrule);
  root.add(frog);

  const button = new Mesh(new CylinderGeometry(0.0042, 0.0042, 0.02, 12), m.silver);
  button.rotation.z = Math.PI / 2;
  button.position.set(-BOW.buttonLength + 0.01, 0, stickHeight(0));
  root.add(named(button, 'Button'));
  const winding = new Mesh(new CylinderGeometry(0.0046, 0.0046, 0.05, 12), m.silver);
  winding.rotation.z = Math.PI / 2;
  winding.position.set(0.05, 0, stickHeight(0.05));
  root.add(named(winding, 'Grip'));

  // The head at the tip: a swept block from the stick down to the hair.
  const tip = new Mesh(bevelBox(0.016, 0.008, Math.abs(stickHeight(end) - hairZ) + 0.004, 0.002), m.pernambuco);
  tip.position.set(end + 0.004, 0, (stickHeight(end) + hairZ) / 2);
  root.add(named(tip, 'Head'));
  const plate = new Mesh(bevelBox(0.012, 0.0085, 0.0016, 0.0006), m.bone);
  plate.position.set(end + 0.004, 0, hairZ - 0.0012);
  root.add(named(plate, 'TipPlate'));

  // Hair: a flat ribbon 10 mm wide, facing the strings.
  const hair = new Mesh(bevelBox(BOW.hairLength, 0.01, 0.0006, 0.0002), m.hair);
  hair.position.set(start + BOW.hairLength / 2, 0, hairZ);
  root.add(named(hair, 'Hair'));
  return root;
}
