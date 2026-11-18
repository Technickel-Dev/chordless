/**
 * A conductor's baton and the orchestral music stand it is tapped on.
 * Spaces as in ../baton/geometry.ts: the baton's origin is where the fist
 * grips the handle (+X toward the tip); the stand's is on the floor under
 * its column (+Y up, +Z toward the player). The stand's `Rig` carries the
 * inner tube and the desk, so raising it suits the stand to the player;
 * its `Desk` is framed on the ledge (+Y up the plate, +Z out of its face).
 */

import {
  CylinderGeometry,
  DataTexture,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RGBAFormat,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
} from '@iwsdk/core';
import { BATON, NOMINAL_LEDGE, STAND, deskFrame } from '../baton/geometry.js';
import { alignSpan, bevelBox, makeRandom } from './lib/hardsurface.js';

/** Revolves a (radius, along) profile round +X. */
function latheX(profile: [number, number][], segments = 20) {
  return new LatheGeometry(profile.map(([r, x]) => new Vector2(r, x)), segments).rotateZ(-Math.PI / 2);
}

/** Builds the baton: a cork pear in the palm, a nickel ferrule, and a white shaft tapering to a point. */
export function createBaton(): Group {
  const root = new Group();
  root.name = 'Baton';
  const b = BATON;
  const back = -b.behind;
  const front = b.handleFront;
  const R = b.handleRadius;
  const handle = new Mesh(
    latheX([
      [0, back],
      [R * 0.45, back + 0.0006],
      [R * 0.8, back + 0.003],
      [R, back + 0.009],
      [R * 0.97, back + 0.017],
      [R * 0.8, back + 0.03],
      [R * 0.62, back + 0.045],
      [b.shaftRadius * 1.5, front - 0.004],
      [b.shaftRadius * 1.45, front],
      [0, front],
    ], 24),
    new MeshStandardMaterial({ name: 'Cork', color: 0xb98a5c, roughness: 0.95, metalness: 0 }),
  );
  handle.name = 'Handle';
  root.add(handle);
  const ferrule = new Mesh(
    latheX([
      [b.shaftRadius * 1.55, front - 0.0045],
      [b.shaftRadius * 1.6, front - 0.002],
      [b.shaftRadius * 1.3, front + 0.003],
      [b.shaftRadius * 1.05, front + 0.005],
    ], 18),
    new MeshStandardMaterial({ name: 'Nickel', color: 0xc9ccd1, roughness: 0.28, metalness: 1 }),
  );
  ferrule.name = 'Ferrule';
  root.add(ferrule);
  const tip = b.reach;
  const shaft = new Mesh(
    latheX([
      [0, front - 0.002],
      [b.shaftRadius, front - 0.002],
      [b.shaftRadius * 0.82, front + 0.08],
      [b.tipRadius * 1.6, tip - 0.06],
      [b.tipRadius, tip - 0.001],
      [b.tipRadius * 0.6, tip],
      [0, tip + 0.0004],
    ], 14),
    new MeshStandardMaterial({ name: 'BatonWhite', color: 0xf6f4ee, roughness: 0.35, metalness: 0 }),
  );
  shaft.name = 'Shaft';
  root.add(shaft);
  return root;
}

/** A page of printed music: staves of five lines, with note heads scattered on them. Deterministic, no DOM. */
function musicTexture(seed: number): DataTexture {
  const W = 128;
  const H = 168;
  const data = new Uint8Array(W * H * 4);
  const paper = [246, 241, 228];
  for (let i = 0; i < W * H; i++) data.set([...paper, 255], i * 4);
  const ink = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    data.set([34, 32, 30, 255], ((H - 1 - y) * W + x) * 4);
  };
  const random = makeRandom(seed);
  // A title, as a bar of ink.
  for (let x = 38; x < 90; x++) for (let y = 8; y < 11; y++) ink(x, y);
  for (let staff = 0; staff < 9; staff++) {
    const top = 20 + staff * 16;
    for (let line = 0; line < 5; line++) for (let x = 8; x < W - 8; x++) ink(x, top + line * 2);
    // Bar lines, then note heads with stems.
    for (const x of [8, 46, 84, W - 9]) for (let y = top; y <= top + 8; y++) ink(x, y);
    for (let x = 14; x < W - 12; x += 5 + Math.floor(random() * 4)) {
      const y = top + Math.floor(random() * 9);
      ink(x, y);
      ink(x + 1, y);
      ink(x, y + 1);
      ink(x + 1, y + 1);
      for (let s = 1; s < 6; s++) ink(x + 2, y - s);
    }
  }
  const texture = new DataTexture(data, W, H, RGBAFormat);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Builds the music stand: tripod, telescoping column, and the tilted desk with its ledge and music. */
export function createMusicStand(): Group {
  const root = new Group();
  root.name = 'MusicStand';
  const s = STAND;
  const steel = new MeshStandardMaterial({ name: 'BlackSteel', color: 0x1c1d20, roughness: 0.5, metalness: 0.65 });
  const plastic = new MeshStandardMaterial({ name: 'KnobPlastic', color: 0x0d0d0e, roughness: 0.6, metalness: 0.05 });
  const rubber = new MeshStandardMaterial({ name: 'Rubber', color: 0x111111, roughness: 0.95, metalness: 0 });

  // The tripod: three tapered legs from a collar on the outer tube, out to rubber feet.
  const hub = new Mesh(new CylinderGeometry(s.outerRadius + 0.007, s.outerRadius + 0.009, 0.05, 20), steel);
  hub.name = 'Hub';
  hub.position.y = s.hubHeight;
  root.add(hub);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 3;
    const dir = new Vector3(Math.sin(a), 0, Math.cos(a));
    const leg = new Group();
    leg.name = `Leg${i}`;
    const from = dir.clone().multiplyScalar(s.outerRadius + 0.012).setY(s.hubHeight - 0.01);
    const foot = dir.clone().multiplyScalar(s.legReach).setY(0.012);
    const tube = new Mesh(new CylinderGeometry(0.0055, 0.0075, 1, 12), steel);
    tube.name = `Leg${i}Tube`;
    tube.scale.y = alignSpan(tube, foot, from);
    leg.add(tube);
    const knuckle = new Mesh(new SphereGeometry(0.009, 12, 8), steel);
    knuckle.name = `Leg${i}Hinge`;
    knuckle.position.copy(from);
    leg.add(knuckle);
    const cap = new Mesh(new SphereGeometry(0.011, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), rubber);
    cap.name = `Leg${i}Foot`;
    cap.scale.y = 0.9;
    cap.position.copy(foot).setY(0.001);
    leg.add(cap);
    root.add(leg);
  }
  const outer = new Mesh(new CylinderGeometry(s.outerRadius, s.outerRadius, s.outerTop - s.hubHeight + 0.04, 18), steel);
  outer.name = 'OuterTube';
  outer.position.y = (s.outerTop + s.hubHeight - 0.04) / 2;
  root.add(outer);

  // The clamp at the outer tube's top, and its wing knob.
  const knob = new Group();
  knob.name = 'Knob';
  const collar = new Mesh(new CylinderGeometry(s.outerRadius + 0.004, s.outerRadius + 0.004, 0.03, 18), steel);
  collar.name = 'Collar';
  collar.position.y = s.outerTop;
  knob.add(collar);
  const screw = new Mesh(new CylinderGeometry(0.003, 0.003, 0.022, 8).rotateX(Math.PI / 2), steel);
  screw.name = 'Screw';
  screw.position.set(0, s.outerTop, s.outerRadius + 0.012);
  knob.add(screw);
  const wing = new Mesh(bevelBox(0.034, 0.016, 0.008, 0.003), plastic);
  wing.name = 'Wing';
  wing.position.set(0, s.outerTop, s.outerRadius + 0.026);
  knob.add(wing);
  root.add(knob);

  // The rig: the inner tube and the desk on it.
  const rig = new Group();
  rig.name = 'Rig';
  root.add(rig);
  const desk = deskFrame();
  const t = s.deskTilt;
  // Where the plate's back crosses the column's axis, up the plate from the ledge.
  const v = (s.deskAhead - Math.cos(t) * s.deskThickness) / Math.sin(t);
  const meetY = NOMINAL_LEDGE + Math.cos(t) * v - Math.sin(t) * s.deskThickness;
  const innerBottom = s.outerTop - 0.12;
  const inner = new Mesh(new CylinderGeometry(s.innerRadius, s.innerRadius, meetY - innerBottom, 16), new MeshStandardMaterial({ name: 'Chrome', color: 0xb8bcc2, roughness: 0.2, metalness: 1 }));
  inner.name = 'InnerTube';
  inner.position.y = (meetY + innerBottom) / 2 - 0.01;
  rig.add(inner);

  const deskGroup = new Group();
  deskGroup.name = 'Desk';
  deskGroup.position.set(...desk.ledge);
  deskGroup.rotation.x = -t;
  rig.add(deskGroup);
  const plate = new Mesh(bevelBox(s.deskWidth, s.deskHeight, s.deskThickness, 0.001, 0.012), steel);
  plate.name = 'Plate';
  plate.position.set(0, s.deskHeight / 2, -s.deskThickness / 2);
  deskGroup.add(plate);
  const rim = new Mesh(new CylinderGeometry(s.rimRadius, s.rimRadius, s.deskWidth - 0.012, 12).rotateZ(Math.PI / 2), steel);
  rim.name = 'Rim';
  rim.position.set(0, s.deskHeight - s.rimRadius * 0.6, -s.deskThickness / 2 - s.rimRadius * 0.4);
  deskGroup.add(rim);
  for (const side of [-1, 1]) {
    const edge = new Mesh(new CylinderGeometry(s.rimRadius * 0.8, s.rimRadius * 0.8, s.deskHeight - 0.02, 10), steel);
    edge.name = side < 0 ? 'LeftEdge' : 'RightEdge';
    edge.position.set(side * (s.deskWidth / 2 - s.rimRadius * 0.5), s.deskHeight / 2, -s.deskThickness / 2);
    deskGroup.add(edge);
  }
  const ledge = new Mesh(bevelBox(s.deskWidth, 0.003, s.ledgeDepth, 0.001), steel);
  ledge.name = 'Ledge';
  ledge.position.set(0, 0.0015, s.ledgeDepth / 2 - s.deskThickness);
  deskGroup.add(ledge);
  const lip = new Mesh(bevelBox(s.deskWidth, s.ledgeLip, 0.003, 0.001), steel);
  lip.name = 'Lip';
  lip.position.set(0, s.ledgeLip / 2, s.ledgeDepth - s.deskThickness);
  deskGroup.add(lip);
  // The bracket on the plate's back that the inner tube plugs into.
  const bracket = new Mesh(bevelBox(0.07, 0.06, 0.022, 0.004), steel);
  bracket.name = 'Bracket';
  bracket.position.set(0, v, -s.deskThickness - 0.011);
  deskGroup.add(bracket);
  const hinge = new Mesh(new TorusGeometry(0.013, 0.005, 8, 18).rotateY(Math.PI / 2), steel);
  hinge.name = 'Hinge';
  hinge.position.set(0, v - 0.02, -s.deskThickness - 0.018);
  deskGroup.add(hinge);

  // Two pages of music standing on the ledge, flat on the plate side by
  // side, clear of its face (and of each other) so neither flickers through.
  const sheets = new Group();
  sheets.name = 'Sheets';
  const PAGE = { width: 0.215, height: 0.28, gap: 0.001, standOff: 0.0015 };
  const page = new PlaneGeometry(PAGE.width, PAGE.height);
  for (const side of [-1, 1]) {
    const paper = new MeshStandardMaterial({
      name: 'Paper',
      map: musicTexture(side < 0 ? 11 : 23),
      roughness: 0.9,
      metalness: 0,
      // Drawn just ahead of the steel at any distance.
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const sheet = new Mesh(page, paper);
    sheet.name = side < 0 ? 'LeftPage' : 'RightPage';
    sheet.position.set(side * (PAGE.width + PAGE.gap) / 2, 0.003 + PAGE.height / 2, PAGE.standOff);
    sheets.add(sheet);
  }
  deskGroup.add(sheets);
  return root;
}
