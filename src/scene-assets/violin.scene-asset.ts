/**
 * A full-size violin and cello and their bows, as deterministic parentless
 * prototypes. The instruments' systems build from these, so the same
 * geometry is in the asset manifest for isolated previews. The cello is the
 * violin's design at its own size: the outline about 2.1 times larger, the
 * ribs four times deeper, the neck and scroll about twice the size, and an
 * endpin instead of a chin rest.
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
import { CELLO_GEOMETRY } from '../cello/geometry.js';
import { BOW, type BowSpec } from '../violin/bow.js';
import { type BowedGeometry, VIOLIN_GEOMETRY } from '../violin/geometry.js';
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

/** How an instrument's model differs from the violin's. */
interface ModelSpec {
  name: string;
  geo: BowedGeometry;
  /** The body's outline is the violin's scaled by this. */
  scale: number;
  /** Rib depth and the arching of the top and back. */
  rib: number;
  topArch: number;
  backArch: number;
  /** Neck, pegbox, scroll and pegs are the violin's scaled by this. */
  neck: number;
  /** Height of the tailpiece over the top, and string thickness relative to a violin's. */
  tailpieceZ: number;
  strings: number;
  chinRest: boolean;
  endpin: boolean;
}

const VIOLIN_MODEL: ModelSpec = {
  name: 'Violin',
  geo: VIOLIN_GEOMETRY,
  scale: 1,
  rib: 0.031,
  topArch: 0.015,
  backArch: 0.014,
  neck: 1,
  tailpieceZ: 0.013,
  strings: 1,
  chinRest: true,
  endpin: false,
};
const CELLO_MODEL: ModelSpec = {
  name: 'Cello',
  geo: CELLO_GEOMETRY,
  scale: 2.127,
  rib: 0.12,
  topArch: 0.026,
  backArch: 0.024,
  neck: 1.9,
  tailpieceZ: 0.034,
  strings: 1.8,
  chinRest: false,
  endpin: true,
};
/** The instrument being built: set by createViolin and createCello for the length of one (synchronous) build. */
let B: ModelSpec = VIOLIN_MODEL;

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

/** The body: one lofted shell, its top and back arched, the ribs straight. */
function body(m: Materials): Group {
  const group = named(new Group(), 'Body');
  const sections: TubeSection[] = [];
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const x = B.geo.dims.tailX + ((B.geo.dims.shoulderX - B.geo.dims.tailX) * i) / steps;
    // The arch rises toward the middle of the body, lower at the ends.
    const along = Math.sin((Math.PI * i) / steps) ** 0.6;
    sections.push({
      z: x,
      halfW: B.scale * bodyHalfWidth(x / B.scale),
      hUp: B.rib / 2 + B.topArch * along,
      hDown: B.rib / 2 + B.backArch * along,
      cy: -B.topArch - B.rib / 2,
      power: 2.4,
    });
  }
  const shell = LoftSurface.tube(sections).build(sections.map((s) => s.z), 40, true);
  shell.applyMatrix4(TO_VIOLIN);
  group.add(named(new Mesh(shell, m.maple), 'Shell'));
  // The spruce top: a thin dome on the rim, overhanging the ribs a little.
  const top = sections.map((s) => ({ ...s, halfW: s.halfW + 0.0012, cy: (s.cy ?? 0) + B.rib / 2, hUp: s.hUp - B.rib / 2 + 0.0007, hDown: 0.0012 }));
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
    const frame = top.frameToward(0.003 * B.scale, new Vector3(side * 0.75, 1, 0));
    placeOnSurface(hole, frame, 0.0004);
    hole.scale.setScalar(B.scale);
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
  const n = B.neck;
  const boardThickness = (x: number) => n * (0.0055 + 0.0035 * ((B.geo.dims.nutX - x) / (B.geo.dims.nutX - B.geo.dims.boardEndX)));
  const boardHalf = (x: number) =>
    (B.geo.dims.boardWidthEnd + ((B.geo.dims.boardWidthNut - B.geo.dims.boardWidthEnd) * (x - B.geo.dims.boardEndX)) / (B.geo.dims.nutX - B.geo.dims.boardEndX)) / 2;
  const board: TubeSection[] = [B.geo.dims.boardEndX, (B.geo.dims.boardEndX + B.geo.dims.nutX) / 2, B.geo.dims.nutX].map((x) => ({
    z: x,
    halfW: boardHalf(x),
    hUp: 0.0022 * n,
    hDown: boardThickness(x) - 0.0022 * n,
    cy: B.geo.boardZ(x) - 0.0022 * n,
    power: 2.6,
  }));
  const boardGeometry = LoftSurface.tube(board).build(board.map((s) => s.z), 24, true);
  boardGeometry.applyMatrix4(TO_VIOLIN);
  group.add(named(new Mesh(boardGeometry, m.ebony), 'Fingerboard'));

  // The neck: a rounded U under the fingerboard, deepening into the heel
  // where it meets the body.
  const heelX = B.geo.dims.shoulderX - 0.012 * n;
  const taper = (x: number) => (x - heelX) / (B.geo.dims.nutX - heelX);
  const handle: TubeSection[] = [];
  for (const x of [heelX, heelX + 0.012 * n, heelX + 0.035 * n, heelX + (B.geo.dims.nutX - heelX) * 0.62, B.geo.dims.nutX + 0.004 * n]) {
    const bottomOfBoard = B.geo.boardZ(Math.min(x, B.geo.dims.nutX)) - boardThickness(Math.min(x, B.geo.dims.nutX));
    const depth = x <= heelX + 0.001 ? bottomOfBoard + B.topArch + 0.002 * n : x < heelX + 0.02 * n ? 0.024 * n : n * (0.019 - 0.003 * taper(x));
    const halfW = x <= heelX + 0.001 ? 0.0145 * n : n * (0.0125 - 0.0018 * taper(x));
    handle.push({ z: x, halfW, hUp: 0.0006 * n, hDown: depth, cy: bottomOfBoard, power: 2 });
  }
  const neckGeometry = LoftSurface.tube(handle).build(handle.map((s) => s.z), 20, true);
  neckGeometry.applyMatrix4(TO_VIOLIN);
  group.add(named(new Mesh(neckGeometry, m.maple), 'Handle'));

  const nut = new Mesh(bevelBox(0.004 * n, B.geo.dims.boardWidthNut, 0.0035 * n, 0.0008 * n), m.ebony);
  nut.position.set(B.geo.dims.nutX + 0.002 * n, 0, B.geo.boardZ(B.geo.dims.nutX) + 0.0006 * n);
  group.add(named(nut, 'Nut'));
  return group;
}

/** Pegbox, scroll and pegs, past the nut and tilted back a little. */
function head(m: Materials): Group {
  const group = named(new Group(), 'Head');
  group.position.set(B.geo.dims.nutX + 0.004, 0, B.geo.boardZ(B.geo.dims.nutX) - 0.006);
  group.rotation.y = (8 * Math.PI) / 180; // tips the scroll back, away from the strings
  group.scale.setScalar(B.neck);
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
  for (let s = 0; s < B.geo.STRING_COUNT; s++) {
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
  const k = B.scale;
  const outline = new Shape();
  const half = B.geo.dims.bridgeSpan / 2 + 0.004 * k;
  outline.moveTo(-0.021 * k, 0);
  outline.lineTo(-0.012 * k, 0);
  outline.quadraticCurveTo(0, 0.008 * k, 0.012 * k, 0);
  outline.lineTo(0.021 * k, 0);
  outline.lineTo(half, B.geo.dims.bridgeZ * 0.55);
  for (let i = 0; i <= 16; i++) {
    const y = half - (2 * half * i) / 16;
    const sag = B.geo.dims.archRadius - Math.sqrt(B.geo.dims.archRadius ** 2 - y * y);
    outline.lineTo(y, B.geo.dims.bridgeZ - 0.0008 - sag);
  }
  outline.lineTo(-half, B.geo.dims.bridgeZ * 0.55);
  outline.closePath();
  const heart = new Shape();
  heart.absellipse(0, B.geo.dims.bridgeZ * 0.5, 0.0035 * k, 0.0045 * k, 0, Math.PI * 2, false, 0);
  outline.holes.push(heart);
  const thick = 0.0035 * Math.sqrt(k);
  const bridgeGeometry = new ExtrudeGeometry(outline, { depth: thick, bevelEnabled: false, curveSegments: 6 });
  bridgeGeometry.translate(0, 0, -thick / 2);
  bridgeGeometry.applyMatrix4(TO_VIOLIN);
  group.add(named(new Mesh(bridgeGeometry, m.bridgeMaple), 'Bridge'));

  const tailpiece = new Mesh(bevelBox(0.11 * k, 0.036 * k, 0.005 * Math.sqrt(k), 0.0018 * k), m.ebony);
  tailpiece.position.set(-0.1 * k, 0, B.tailpieceZ);
  tailpiece.rotation.y = (5 * Math.PI) / 180; // its tail end dips toward the saddle
  group.add(named(tailpiece, 'Tailpiece'));
  const saddle = new Mesh(bevelBox(0.006 * k, 0.026 * k, 0.006 * k, 0.001 * k), m.ebony);
  saddle.position.set(B.geo.dims.tailX + 0.002, 0, -0.001);
  group.add(named(saddle, 'Saddle'));

  if (B.endpin) {
    // The endpin: a collar on the end block and a rod down to the floor.
    const middle = -B.topArch - B.rib / 2;
    const collar = new Mesh(new CylinderGeometry(0.012, 0.016, 0.025, 16), m.ebony);
    collar.rotation.z = Math.PI / 2;
    collar.position.set(B.geo.dims.tailX - 0.01, 0, middle);
    group.add(named(collar, 'EndpinCollar'));
    const rod = new Mesh(new CylinderGeometry(0.004, 0.004, 0.4, 10), m.silver);
    rod.rotation.z = Math.PI / 2;
    rod.position.set(B.geo.dims.tailX - 0.2, 0, middle);
    group.add(named(rod, 'Endpin'));
    return group;
  }

  // The chin rest sits over the tail on the G side, clamped to the rim.
  const chin = new Mesh(bevelBox(0.066, 0.058, 0.008, 0.0035, 0.02), m.ebony);
  chin.position.set(B.geo.dims.tailX + 0.04, 0.03, 0.009);
  group.add(named(chin, 'ChinRest'));
  const clamp = new Mesh(new CylinderGeometry(0.0025, 0.0025, 0.03, 8), m.silver);
  clamp.position.set(B.geo.dims.tailX + 0.012, 0.012, -0.012);
  clamp.rotation.x = Math.PI / 2;
  group.add(named(clamp, 'ChinClamp'));

  const button = new Mesh(new CylinderGeometry(0.0045, 0.0035, 0.01, 12), m.ebony);
  button.rotation.z = Math.PI / 2;
  button.position.set(B.geo.dims.tailX - 0.004, 0, -0.03);
  group.add(named(button, 'EndButton'));
  return group;
}

/** The strings: tailpiece to bridge, bridge to nut, nut into the pegbox. */
function strings(m: Materials): Group {
  const group = named(new Group(), 'Strings');
  const unit = new CylinderGeometry(1, 1, 1, 6);
  for (let s = 0; s < B.geo.STRING_COUNT; s++) {
    const radius = (0.00062 - s * 0.00008) * B.strings;
    const points = [
      new Vector3(-0.05 * B.scale, B.geo.stringY(s, 0) * 0.7, B.tailpieceZ + 0.0035 * B.scale),
      new Vector3(B.geo.dims.bridgeX, B.geo.stringY(s, B.geo.dims.bridgeX), B.geo.stringZ(s, B.geo.dims.bridgeX)),
      new Vector3(B.geo.dims.nutX, B.geo.stringY(s, B.geo.dims.nutX), B.geo.stringZ(s, B.geo.dims.nutX)),
      new Vector3(B.geo.dims.nutX + (0.018 + s * 0.014) * B.neck, B.geo.stringY(s, B.geo.dims.nutX) * 0.4, B.geo.stringZ(s, B.geo.dims.nutX) - 0.006 * B.neck),
    ];
    for (let i = 0; i < points.length - 1; i++) {
      const piece = new Mesh(unit, s === B.geo.STRING_COUNT - 1 ? m.steel : m.gut);
      piece.scale.set(radius, alignSpan(piece, points[i], points[i + 1]), radius);
      group.add(named(piece, `String${s}_${i}`));
    }
  }
  return group;
}

function createInstrument(spec: ModelSpec): Group {
  B = spec;
  const m = materials();
  const root = named(new Group(), spec.name);
  root.add(body(m), neck(m), head(m), fittings(m), strings(m));
  B = VIOLIN_MODEL;
  return root;
}

/** A violin, with its parts named for inspection. */
export function createViolin(): Group {
  return createInstrument(VIOLIN_MODEL);
}

/** A cello, with its parts named for inspection; its endpin runs down along -X. */
export function createCello(): Group {
  return createInstrument(CELLO_MODEL);
}

/**
 * A bow. The stick is cambered toward the hair (closest at the middle);
 * the frog holds the hair 14 mm from the stick at the hand, the tip's head
 * holds it at the far end. Origin at the grip, +X to the tip, hair on -Z.
 */
export function createBow(bow: BowSpec = BOW): Group {
  const m = materials();
  // A cello bow's stick is a little thicker.
  const thick = bow.hairLength < BOW.hairLength ? 1.15 : 1;
  const root = named(new Group(), 'Bow');
  const start = bow.frogToHair;
  const end = start + bow.hairLength;
  const hairZ = -bow.hairDrop;

  // Stick: round, tapering from 8.6 mm to 5.4 mm, its height above the hair
  // following the camber.
  const stickHeight = (x: number) => {
    const t = Math.min(1, Math.max(0, (x - start) / bow.hairLength));
    return hairZ + 0.0135 - 0.0075 * Math.sin(Math.PI * t) ** 1.3 + 0.002 * t;
  };
  const stick: TubeSection[] = [];
  for (let i = 0; i <= 16; i++) {
    const x = -bow.buttonLength + ((end + 0.006 + bow.buttonLength) * i) / 16;
    const r = (0.0043 - 0.0016 * Math.max(0, x / end)) * thick;
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
  button.position.set(-bow.buttonLength + 0.01, 0, stickHeight(0));
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
  const hair = new Mesh(bevelBox(bow.hairLength, 0.01, 0.0006, 0.0002), m.hair);
  hair.position.set(start + bow.hairLength / 2, 0, hairZ);
  root.add(named(hair, 'Hair'));
  return root;
}
