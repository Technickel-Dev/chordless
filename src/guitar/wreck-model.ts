/**
 * The pieces a smashed guitar breaks into, built once beside the intact
 * model and hidden until needed, so a smash allocates nothing and a repair
 * just puts them back. The neck snaps between the 5th and 6th frets; the
 * body breaks into Voronoi shards of its outline.
 */

import { Box3, ExtrudeGeometry, Group, Matrix4, Mesh, Shape, Vector3 } from '@iwsdk/core';
import { fretX, GUITAR, STRING_COUNT, stringY } from './geometry.js';
import { boardGeometry, GuitarModel, NECK_START, neckGeometry } from './guitar-model.js';
import {
  fractureCells,
  pointInPolygon,
  Polygon,
  polygonArea,
  polygonCentroid,
  Region,
  scatterSeeds,
  seededRandom,
} from './smash.js';
import { Hull, hullOf, HULL_SIZE } from '../smash/hull.js';
import { RigidBody } from '../smash/tumble.js';

/** Where the neck snaps: between the 5th and 6th frets, clear of the inlays. */
export const BREAK_X = (fretX(5) + fretX(6)) / 2;
const BODY_DEPTH = 0.093;
const SHARD_COUNT = 9;
/** Points round the body's rim, front and back, for the whole guitar. */
const RIM_SAMPLES = 24;
/** Mass per square metre of body outline, for a hollow body of about 1.2 kg. */
const BODY_AREAL_MASS = 7;

/** A piece that flies off on its own. */
export interface WreckPiece {
  /** Sits at the piece's centre of mass; `inner` holds its parts in guitar space. */
  pivot: Group;
  inner: Group;
  /** The pivot's position on the intact guitar. */
  home: Vector3;
  body: RigidBody;
}

export interface GuitarWreck {
  /** The headstock end of the neck, from the break up. */
  upper: WreckPiece;
  /** The stub of neck left on the body. */
  lower: WreckPiece;
  /** The two halves of the neck and fretboard, shown once it snaps. */
  halves: Mesh[];
  shards: WreckPiece[];
  /** Per string, the end left curling off the bridge and the end left at the nut. */
  bridgeStubs: Mesh[];
  nutStubs: Mesh[];
  /** The whole guitar as a thrown body. */
  guitar: RigidBody;
  /** The guitar's centre of mass in its own frame. */
  centre: Vector3;
  /** Guitar-space contact points (xyz), and which part each one is on. */
  points: Float32Array;
  regions: Uint8Array;
  /** The first points, which are all that is left once the neck has snapped. */
  pointsWithoutNeck: number;
  /** The shard each point is on, or -1: it goes when the shard does. */
  pointShard: Int8Array;
  /** The x, y of each shard's middle. */
  shardCentres: number[];
  /** The shard carrying the bridge, and the one over the sound hole. */
  bridgeShard: number;
  holeShard: number;
}

export function createGuitarWreck(model: GuitarModel): GuitarWreck {
  const { root, materials } = model;

  // Upper neck: headstock, nut, the first five frets and their inlays.
  const head = model.head;
  head.updateMatrix();
  const headPoint = (x: number, y: number, z: number) => new Vector3(x, y, z).applyMatrix4(head.matrix);
  // The break end, then the nut end, then the headstock's plate, tuner
  // buttons and peg tops, so it cannot rest with any of them in the floor.
  const upperPoints: Vector3[] = [];
  const upperRegions: Region[] = [];
  for (const x of [BREAK_X, GUITAR.nutX]) {
    for (const y of [0.026, -0.026]) {
      upperPoints.push(new Vector3(x, y, GUITAR.boardTopZ), new Vector3(x, y, -0.028));
      upperRegions.push(Region.Neck, Region.Neck);
    }
  }
  for (const x of [0, 0.19]) {
    for (const y of [0.04, -0.04]) {
      upperPoints.push(headPoint(x, y, 0.008), headPoint(x, y, -0.008));
      upperRegions.push(Region.Head, Region.Head);
    }
  }
  for (const x of [0.045, 0.145]) {
    for (const side of [1, -1]) {
      upperPoints.push(headPoint(x, side * 0.059, 0), headPoint(x, side * 0.026, 0.031));
      upperRegions.push(Region.Head, Region.Head);
    }
  }
  const upper = makePiece('NeckUpper', new Vector3(GUITAR.nutX + 0.03, 0, -0.01), 0.45, [0.4, 0.08, 0.04], upperPoints);
  const lowerPoints = [
    new Vector3(GUITAR.boardEndX, 0.032, GUITAR.boardTopZ),
    new Vector3(GUITAR.boardEndX, -0.032, GUITAR.boardTopZ),
    new Vector3(NECK_START, 0.031, -0.028),
    new Vector3(NECK_START, -0.031, -0.028),
    new Vector3(BREAK_X, 0.027, GUITAR.boardTopZ),
    new Vector3(BREAK_X, -0.027, GUITAR.boardTopZ),
    new Vector3(BREAK_X, 0.027, -0.028),
    new Vector3(BREAK_X, -0.027, -0.028),
  ];
  const lower = makePiece('NeckLower', new Vector3(0.22, 0, -0.006), 0.3, [0.26, 0.06, 0.04], lowerPoints);
  root.add(upper.pivot, lower.pivot);

  upper.inner.add(head, model.nut);
  model.frets.forEach((fret) => (fret.position.x > BREAK_X ? upper : lower).inner.add(fret));
  model.inlays.forEach((dot) => (dot.position.x > BREAK_X ? upper : lower).inner.add(dot));
  const halves = [
    new Mesh(neckGeometry(BREAK_X, GUITAR.nutX + 0.004), materials.neck),
    new Mesh(boardGeometry(BREAK_X, GUITAR.nutX), materials.board),
    new Mesh(neckGeometry(NECK_START, BREAK_X), materials.neck),
    new Mesh(boardGeometry(GUITAR.boardEndX, BREAK_X), materials.board),
  ];
  ['NeckHalfUpper', 'BoardHalfUpper', 'NeckHalfLower', 'BoardHalfLower'].forEach((name, i) => {
    halves[i].name = name;
    halves[i].visible = false;
    (i < 2 ? upper : lower).inner.add(halves[i]);
  });

  // Body shards: each Voronoi cell of the outline, as deep as the body,
  // with its strip of the lighter top.
  const outline = model.outline;
  const cells = fractureCells(outline, scatterSeeds(outline, SHARD_COUNT, 0.07, seededRandom(7)));
  const bridge = model.body.getObjectByName('Bridge')!;
  const saddle = model.body.getObjectByName('Saddle')!;
  const shardCentres: number[] = [];
  let bridgeShard = 0;
  let holeShard = 0;
  const shards = cells.map((cell, i) => {
    const [cx, cy] = polygonCentroid(cell);
    shardCentres.push(cx, cy);
    if (pointInPolygon(0, 0, cell)) holeShard = i;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    // Every corner of the cell, front and back: skipping one can sink a
    // whole corner of the shard into the floor.
    const corners: Vector3[] = [];
    for (let k = 0; k < cell.length; k += 2) {
      minX = Math.min(minX, cell[k]);
      maxX = Math.max(maxX, cell[k]);
      minY = Math.min(minY, cell[k + 1]);
      maxY = Math.max(maxY, cell[k + 1]);
      corners.push(new Vector3(cell[k], cell[k + 1], 0), new Vector3(cell[k], cell[k + 1], -BODY_DEPTH));
    }
    // The bridge stays glued to whichever shard it sits on, standing proud
    // of the top and past the shard's edges.
    const hasBridge = pointInPolygon(GUITAR.bridgeX, 0, cell);
    if (hasBridge) {
      bridgeShard = i;
      for (const y of [0.075, -0.075]) {
        corners.push(new Vector3(GUITAR.bridgeX - 0.023, y, 0.008), new Vector3(GUITAR.bridgeX + 0.007, y, 0.008));
      }
      corners.push(new Vector3(GUITAR.bridgeX, 0.0375, 0.016), new Vector3(GUITAR.bridgeX, -0.0375, 0.016));
    }
    const piece = makePiece(
      `Shard${i}`,
      new Vector3(cx, cy, -BODY_DEPTH / 2),
      polygonArea(cell) * BODY_AREAL_MASS + 0.02,
      [maxX - minX, maxY - minY, BODY_DEPTH],
      corners,
    );
    const shape = shapeOf(cell);
    const sides = new ExtrudeGeometry(shape, { depth: BODY_DEPTH - 0.003, bevelEnabled: false });
    sides.translate(0, 0, -BODY_DEPTH);
    const top = new ExtrudeGeometry(shape, { depth: 0.003, bevelEnabled: false });
    top.translate(0, 0, -0.003);
    piece.inner.add(new Mesh(sides, materials.side), new Mesh(top, materials.top));
    if (hasBridge) piece.inner.add(bridge.clone(), saddle.clone());
    piece.pivot.visible = false;
    root.add(piece.pivot);
    return piece;
  });

  // Snapped strings: a short end curling up off the bridge and another off the nut.
  const bridgeStubs: Mesh[] = [];
  const nutStubs: Mesh[] = [];
  for (let s = 0; s < STRING_COUNT; s++) {
    const string = model.strings[s];
    const r = string.scale.x;
    const flick = s % 2 === 0 ? 1 : -1;
    const yb = stringY(s, GUITAR.bridgeX);
    const atBridge = new Mesh(string.geometry, string.material);
    span(atBridge, r, GUITAR.bridgeX, yb, GUITAR.stringZ, GUITAR.bridgeX + 0.05 + 0.012 * s, yb * 1.5 + flick * 0.015, GUITAR.stringZ + 0.03 + 0.005 * (s % 3));
    atBridge.visible = false;
    root.add(atBridge);
    bridgeStubs.push(atBridge);
    const yn = stringY(s, GUITAR.nutX);
    const atNut = new Mesh(string.geometry, string.material);
    span(atNut, r, GUITAR.nutX, yn, GUITAR.stringZ, GUITAR.nutX - 0.06 - 0.01 * s, yn * 1.8 - flick * 0.012, GUITAR.stringZ + 0.025);
    atNut.visible = false;
    upper.inner.add(atNut);
    nutStubs.push(atNut);
  }

  // The whole guitar: the body's rim front and back, the neck stub, then
  // the upper neck and headstock, which go when the neck snaps.
  const guitarPoints: Vector3[] = [];
  const regions: number[] = [];
  for (let i = 0; i < RIM_SAMPLES; i++) {
    const k = Math.floor((i / RIM_SAMPLES) * (outline.length / 2)) * 2;
    guitarPoints.push(new Vector3(outline[k], outline[k + 1], 0), new Vector3(outline[k], outline[k + 1], -BODY_DEPTH));
    regions.push(Region.Body, Region.Body);
  }
  for (let i = 4; i < 8; i++) {
    guitarPoints.push(lowerPoints[i]);
    regions.push(Region.Neck);
  }
  const pointsWithoutNeck = guitarPoints.length;
  const pointShard = new Int8Array(guitarPoints.length + upperPoints.length).fill(-1);
  for (let i = 0; i < RIM_SAMPLES * 2; i++) {
    let best = Infinity;
    for (let c = 0; c < shardCentres.length / 2; c++) {
      const distance = Math.hypot(guitarPoints[i].x - shardCentres[c * 2], guitarPoints[i].y - shardCentres[c * 2 + 1]);
      if (distance < best) {
        best = distance;
        pointShard[i] = c;
      }
    }
  }
  // The upper piece's break-end points duplicate the stub's, so skip them.
  for (let i = 4; i < upperPoints.length; i++) {
    guitarPoints.push(upperPoints[i]);
    regions.push(upperRegions[i]);
  }
  const centre = new Vector3(0.03, 0, -0.04);
  const points = flatten(guitarPoints, new Vector3());
  const guitar = new RigidBody(flatten(guitarPoints, centre), 2, boxInertia(2, [1.0, 0.38, 0.1]));

  return {
    upper,
    lower,
    halves,
    shards,
    bridgeStubs,
    nutStubs,
    guitar,
    centre,
    points,
    regions: Uint8Array.from(regions),
    pointsWithoutNeck,
    pointShard,
    shardCentres,
    bridgeShard,
    holeShard,
  };
}

/** The neck has snapped: swap the whole neck for its two halves. */
export function showNeckSnapped(model: GuitarModel, wreck: GuitarWreck): void {
  model.neck.visible = false;
  model.board.visible = false;
  for (const half of wreck.halves) half.visible = true;
  for (const stub of wreck.nutStubs) stub.visible = true;
}

/**
 * The body has taken its first real blow: swap its solid sides and top for
 * the shards, still in place, so they can come away one at a time. The
 * sound hole stays until the shard under it goes.
 */
export function showCracked(model: GuitarModel, wreck: GuitarWreck): void {
  for (const name of ['Sides', 'Top', 'Bridge', 'Saddle']) model.body.getObjectByName(name)!.visible = false;
  for (const shard of wreck.shards) shard.pivot.visible = true;
}

/** The shard under the sound hole has gone, and the hole with it. */
export function showHoleGone(model: GuitarModel): void {
  for (const name of ['Rosette', 'SoundHole']) model.body.getObjectByName(name)!.visible = false;
}

/** The shard with the bridge on it has gone: nothing holds the strings' ends there. */
export function showBridgeGone(wreck: GuitarWreck): void {
  for (const stub of wreck.bridgeStubs) stub.visible = false;
}

/** Puts every piece back on the guitar, as new. */
export function restoreGuitar(model: GuitarModel, wreck: GuitarWreck): void {
  for (const piece of [wreck.upper, wreck.lower, ...wreck.shards]) {
    model.root.add(piece.pivot);
    piece.pivot.position.copy(piece.home);
    piece.pivot.quaternion.identity();
    piece.body.wake();
  }
  for (const shard of wreck.shards) shard.pivot.visible = false;
  for (const half of wreck.halves) half.visible = false;
  for (const stub of wreck.bridgeStubs) stub.visible = false;
  for (const stub of wreck.nutStubs) stub.visible = false;
  for (const string of model.strings) string.visible = true;
  for (const part of model.body.children) part.visible = true;
  model.neck.visible = true;
  model.board.visible = true;
}

function makePiece(
  name: string,
  com: Vector3,
  mass: number,
  size: [number, number, number],
  points: Vector3[],
): WreckPiece {
  const pivot = new Group();
  pivot.name = name;
  pivot.position.copy(com);
  const inner = new Group();
  inner.position.copy(com).negate();
  pivot.add(inner);
  // Room for the shape measured when it breaks off, which can have more points than this first guess.
  const measured = flatten(points, com);
  const contact = new Float32Array(Math.max(measured.length, HULL_SIZE * 3));
  contact.set(measured);
  const body = new RigidBody(contact, mass, boxInertia(mass, size));
  body.pointCount = points.length;
  return { pivot, inner, home: com.clone(), body };
}

const hull = new Hull();
const hullBox = new Box3();
const toPivot = new Matrix4();

/** Sets a piece's contact points from its shape as it is now, dents and all. */
export function measurePiece(piece: WreckPiece): void {
  const { pivot, body } = piece;
  pivot.updateMatrixWorld(true);
  toPivot.copy(pivot.matrixWorld).invert();
  hull.reset();
  hullOf(pivot, hull, toPivot, null);
  hull.finish(hullBox);
  if (hull.count === 0) return;
  body.points.set(hull.points.subarray(0, hull.count * 3));
  body.pointCount = hull.count;
}

/** Principal moments of a solid box of the given size. */
function boxInertia(mass: number, [x, y, z]: [number, number, number]): [number, number, number] {
  return [(mass / 12) * (y * y + z * z), (mass / 12) * (x * x + z * z), (mass / 12) * (x * x + y * y)];
}

function flatten(points: Vector3[], origin: Vector3): Float32Array {
  const out = new Float32Array(points.length * 3);
  points.forEach((p, i) => {
    out[i * 3] = p.x - origin.x;
    out[i * 3 + 1] = p.y - origin.y;
    out[i * 3 + 2] = p.z - origin.z;
  });
  return out;
}

function shapeOf(cell: Polygon): Shape {
  const shape = new Shape();
  shape.moveTo(cell[0], cell[1]);
  for (let k = 2; k < cell.length; k += 2) shape.lineTo(cell[k], cell[k + 1]);
  shape.closePath();
  return shape;
}

const yAxis = new Vector3(0, 1, 0);
const dir = new Vector3();

/** Stretches the unit string cylinder from a to b. */
function span(mesh: Mesh, r: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
  dir.set(bx - ax, by - ay, bz - az);
  mesh.scale.set(r, dir.length(), r);
  mesh.quaternion.setFromUnitVectors(yAxis, dir.normalize());
  mesh.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
}
