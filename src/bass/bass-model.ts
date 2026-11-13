/**
 * The bass guitar's model: the shared fretted neck, strings and marks (see
 * ../guitar/guitar-model.ts) on a solid, offset double-cutaway body with a
 * split pickup, a pickguard, two knobs and a through-body bridge.
 */

import {
  BoxGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from '@iwsdk/core';
import { type FrettedModelSpec, type GuitarBody, named, shapeOfOutline } from '../guitar/guitar-model.js';
import { BASS, BASS_BOARD } from './geometry.js';

/** The neck heel runs this far into the body. */
const NECK_START = 0.04;
const BODY_DEPTH = 0.045;
const TOP_DEPTH = 0.003;

/**
 * The body's outline, round from the neck pocket on the low strings' side
 * (+Y): the long upper horn, the upper bout, the waist, the lower bout and
 * the tail, then back up the treble side to the shorter lower horn.
 */
const OUTLINE_POINTS: readonly [number, number][] = [
  [0.08, 0.033],
  [0.115, 0.048],
  [0.155, 0.078],
  [0.178, 0.104],
  [0.166, 0.126],
  [0.12, 0.138],
  [0.055, 0.126],
  [-0.03, 0.134],
  [-0.12, 0.165],
  [-0.2, 0.158],
  [-0.252, 0.118],
  [-0.276, 0.05],
  [-0.28, 0],
  [-0.276, -0.05],
  [-0.252, -0.12],
  [-0.2, -0.16],
  [-0.12, -0.165],
  [-0.04, -0.14],
  [0.03, -0.126],
  [0.082, -0.12],
  [0.112, -0.1],
  [0.118, -0.074],
  [0.1, -0.048],
  [0.08, -0.033],
];

function bassOutline(): number[] {
  const curve = new CatmullRomCurve3(
    OUTLINE_POINTS.map(([x, y]) => new Vector3(x, y, 0)),
    true,
    'centripetal',
  );
  const out: number[] = [];
  for (const p of curve.getSpacedPoints(120).slice(0, -1)) out.push(p.x, p.y);
  return out;
}

function bassBody({ top, side, dark, metal }: Parameters<FrettedModelSpec['body']>[0]): GuitarBody {
  const outline = bassOutline();
  const shape = shapeOfOutline(outline);
  const body = new Group();

  // A solid slab, painted; the top is a thin layer of the same paint, lighter where it catches the light.
  const slab = new ExtrudeGeometry(shape, { depth: BODY_DEPTH - TOP_DEPTH, bevelEnabled: false, curveSegments: 4 });
  slab.translate(0, 0, -BODY_DEPTH);
  body.add(named(new Mesh(slab, side), 'Sides'));
  const topGeometry = new ExtrudeGeometry(shape, { depth: TOP_DEPTH, bevelEnabled: false, curveSegments: 4 });
  topGeometry.translate(0, 0, -TOP_DEPTH);
  const topMesh = named(new Mesh(topGeometry, top), 'Top');
  body.add(topMesh);

  // A pearl pickguard round the pickup and two control knobs, on the top (so they go when it cracks).
  const guardMat = new MeshStandardMaterial({ color: 0xf1ece0, roughness: 0.35 });
  const guard = new Mesh(new BoxGeometry(0.2, 0.11, 0.002), guardMat);
  guard.name = 'Pickguard';
  guard.position.set(0.035, 0.03, 0.001);
  topMesh.add(guard);
  const knobGeo = new CylinderGeometry(0.011, 0.012, 0.016, 20);
  for (const [x, y] of [[-0.14, -0.105], [-0.09, -0.115]]) {
    const knob = new Mesh(knobGeo, dark);
    knob.rotation.x = Math.PI / 2;
    knob.position.set(x, y, 0.008);
    topMesh.add(knob);
  }

  // A split pickup: one half under the E and A strings, the other, nearer the bridge, under the D and G.
  const pickupGeo = new BoxGeometry(0.022, 0.034, 0.009);
  const poleGeo = new CylinderGeometry(0.0022, 0.0022, 0.002, 10);
  const halves: [string, number, number][] = [
    ['PickupLow', 0.04, BASS_BOARD.stringY(0.5, 0.04)],
    ['PickupHigh', 0.022, BASS_BOARD.stringY(2.5, 0.022)],
  ];
  for (const [name, x, y] of halves) {
    const pickup = named(new Mesh(pickupGeo, dark), name);
    pickup.position.set(x, y, 0.0065);
    for (const dy of [-0.0085, -0.0025, 0.0025, 0.0085]) {
      const pole = new Mesh(poleGeo, metal);
      pole.rotation.x = Math.PI / 2;
      pole.position.set(0, dy, 0.0046);
      pickup.add(pole);
    }
    body.add(pickup);
  }

  // A plated bridge through the body, with a saddle under each string.
  const bridge = named(new Mesh(new BoxGeometry(0.06, 0.08, 0.004), metal), 'Bridge');
  bridge.position.set(BASS.bridgeX - 0.018, 0, 0.002);
  body.add(bridge);
  const saddle = named(new Mesh(new BoxGeometry(0.01, 0.066, 0.015), metal), 'Saddle');
  saddle.position.set(BASS.bridgeX, 0, 0.0075);
  body.add(saddle);

  return { group: body, outline, depth: BODY_DEPTH, holeParts: ['PickupLow', 'PickupHigh'] };
}

/** A red short-scale bass with a maple neck and a rosewood board. */
export const BASS_MODEL: FrettedModelSpec = {
  name: 'AirBass',
  board: BASS_BOARD,
  neckStart: NECK_START,
  colors: { top: 0xb3201f, side: 0x8a1616, neck: 0xd2a066, board: 0x3a2416 },
  body: bassBody,
  inlayFrets: [3, 5, 7, 9, 15, 17, 19],
  stringRadius: (s) => 0.0023 - s * 0.0003,
  wound: () => false,
  head: { length: 0.2, width: 0.09, peg: 0.0065 },
  hudFromNut: [0.2, 0.07, 0.1],
  physics: { mass: 3.6, size: [1.15, 0.33, 0.06], centre: [0.06, 0, -0.022] },
};
