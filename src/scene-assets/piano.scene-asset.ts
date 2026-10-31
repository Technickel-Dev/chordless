/**
 * A 61-key console piano in black lacquer: ivory and ebony keys, each its
 * own lever, in a case with cheek blocks, a fallboard over the back of the
 * keys with its red felt, a lid and a music rest, on two side panels with
 * toe blocks and a three-pedal box.
 *
 * Piano space (see ../piano/geometry.ts): the origin is the middle of the
 * keyboard's front edge, level with the white keys' tops; +X runs bass to
 * treble, +Z toward the player. As authored the floor is PIANO.keyHeight
 * below the keys; `fitPianoStand` stretches the stand to another height.
 *
 * Named parts: `Keys/Key<midi>` is each key's pivot (rotate it about X to
 * press it; its mesh is `Key<midi>Body`), `Stand/Legs` stretches and
 * `Stand/Floor` sits on the floor, and `HudAnchor` marks a spot above the
 * music rest.
 */

import {
  BufferGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  Shape,
} from '@iwsdk/core';
import { isBlack, KEYBOARD_WIDTH, PIANO, whiteKeyOutline, keyCenterX } from '../piano/geometry.js';
import { bevelBox, taperPlate } from './lib/hardsurface.js';

/** The case's underside, below the keys. */
export const CASE_BOTTOM = -0.062;
/** Depth of the case and stand, back from the keyboard's front edge. */
const CASE_BACK = -0.43;
const HALF = KEYBOARD_WIDTH / 2;
const OUTER = HALF + PIANO.cheekWidth;
/** The stand's legs as authored, from the case's underside to the floor. */
const LEG_LENGTH = PIANO.keyHeight + CASE_BOTTOM;

function materials() {
  return {
    lacquer: new MeshPhysicalMaterial({
      name: 'BlackLacquer',
      color: 0x0d0d10,
      roughness: 0.24,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
    }),
    ivory: new MeshStandardMaterial({ name: 'Ivory', color: 0xf2eee3, roughness: 0.3 }),
    ebony: new MeshStandardMaterial({ name: 'Ebony', color: 0x121214, roughness: 0.36 }),
    felt: new MeshStandardMaterial({ name: 'RedFelt', color: 0x7a1326, roughness: 1 }),
    shadow: new MeshStandardMaterial({ name: 'InnerFelt', color: 0x050506, roughness: 1 }),
    brass: new MeshStandardMaterial({ name: 'Brass', color: 0xc9a157, roughness: 0.26, metalness: 1 }),
  };
}

/** A named mesh of a bevelled box, its centre at (x, y, z). */
function block(
  name: string,
  mat: MeshStandardMaterial,
  size: [number, number, number],
  at: [number, number, number],
  bevel = 0.004,
): Mesh {
  const mesh = new Mesh(bevelBox(size[0], size[1], size[2], bevel), mat);
  mesh.name = name;
  mesh.position.set(...at);
  return mesh;
}

/**
 * Turns a shape drawn as seen from above (x across, y back from the front)
 * and extruded `t` up into a key: top at y = 0, front at z = 0, rounded
 * along its top edges.
 */
function keyFromOutline(shape: Shape, t: number): BufferGeometry {
  const b = 0.0007;
  const g = new ExtrudeGeometry(shape, {
    depth: t - 2 * b,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments: 2,
    curveSegments: 1,
  });
  // Extruded z spans [-b, t - b]; put it at [-t, 0], then turn it to be height.
  g.translate(0, 0, -(t - b));
  g.rotateX(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

function whiteKeyGeometry(midi: number): BufferGeometry {
  const o = whiteKeyOutline(midi);
  const notch = -o.notchZ;
  const back = PIANO.whiteLength;
  const s = new Shape();
  s.moveTo(o.left, 0);
  s.lineTo(o.right, 0);
  s.lineTo(o.right, notch);
  s.lineTo(o.backRight, notch);
  s.lineTo(o.backRight, back);
  s.lineTo(o.backLeft, back);
  s.lineTo(o.backLeft, notch);
  s.lineTo(o.left, notch);
  s.closePath();
  return keyFromOutline(s, PIANO.whiteThickness);
}

/** A black key: narrower on top than at its base, its sides sloping, rounded over. */
function blackKeyGeometry(midi: number): BufferGeometry {
  const cx = keyCenterX(midi);
  const base = -0.012;
  const top = PIANO.blackHeight;
  const b = 0.0012;
  const s = new Shape();
  s.moveTo(-PIANO.blackWidth / 2 + b, base);
  s.lineTo(PIANO.blackWidth / 2 - b, base);
  s.lineTo(PIANO.blackTopWidth / 2, top - b / 2);
  s.lineTo(-PIANO.blackTopWidth / 2, top - b / 2);
  s.closePath();
  const g = new ExtrudeGeometry(s, {
    depth: PIANO.blackLength - 2 * b,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b * 0.5,
    bevelSegments: 2,
    curveSegments: 1,
  });
  // z spans [-b, L - b]: run it from the back end of the white keys forward.
  g.translate(cx, 0, -PIANO.whiteLength + b);
  g.computeVertexNormals();
  return g;
}

/** The keys, each on its own pivot behind its back end. */
function createKeys(m: ReturnType<typeof materials>): Group {
  const keys = new Group();
  keys.name = 'Keys';
  const pivotZ = -(PIANO.whiteLength + PIANO.pivotBehind);
  for (let midi = PIANO.lowest; midi <= PIANO.highest; midi++) {
    const black = isBlack(midi);
    const pivot = new Group();
    pivot.name = `Key${midi}`;
    pivot.position.set(0, 0, pivotZ);
    const body = new Mesh(black ? blackKeyGeometry(midi) : whiteKeyGeometry(midi), black ? m.ebony : m.ivory);
    body.name = `Key${midi}Body`;
    body.position.set(0, 0, -pivotZ);
    body.castShadow = true;
    body.receiveShadow = true;
    pivot.add(body);
    keys.add(pivot);
  }
  return keys;
}

function createCase(m: ReturnType<typeof materials>): Group {
  const c = new Group();
  c.name = 'Case';
  const keyBottom = -PIANO.whiteThickness;
  // The keybed the keys rest on, deep enough below them for a full key dip.
  const bedTop = keyBottom - PIANO.travel - 0.002;
  const depth = -CASE_BACK + 0.02;
  c.add(block('Keybed', m.lacquer, [OUTER * 2, bedTop - CASE_BOTTOM, depth], [0, (bedTop + CASE_BOTTOM) / 2, CASE_BACK + depth / 2], 0.003));
  // The key slip, under the front of the keys.
  c.add(block('KeySlip', m.lacquer, [KEYBOARD_WIDTH + 0.004, 0.034, 0.016], [0, -0.0285, 0.009], 0.003));
  for (const side of [-1, 1]) {
    const cheekTop = 0.034;
    c.add(
      block(
        side < 0 ? 'CheekBass' : 'CheekTreble',
        m.lacquer,
        [PIANO.cheekWidth, cheekTop - CASE_BOTTOM, depth],
        [side * (HALF + PIANO.cheekWidth / 2), (cheekTop + CASE_BOTTOM) / 2, CASE_BACK + depth / 2],
        0.012,
      ),
    );
  }
  // Behind the keys: dark inside the case, under the fallboard.
  const innerFront = -PIANO.whiteLength - 0.001;
  c.add(block('KeyWell', m.shadow, [KEYBOARD_WIDTH, 0.05, 0.045], [0, -0.012, innerFront - 0.0225], 0.001));
  c.add(block('KeyFelt', m.felt, [KEYBOARD_WIDTH, 0.0115, 0.004], [0, 0.0058, innerFront - 0.002], 0.0008));
  // The body of the case, its top the lid, the fallboard leaning out over the keys.
  const bodyFront = -0.19;
  const lidY = 0.112;
  c.add(block('Body', m.lacquer, [OUTER * 2, lidY - 0.012, bodyFront - CASE_BACK], [0, (lidY + 0.012) / 2, (bodyFront + CASE_BACK) / 2], 0.006));
  c.add(block('Lid', m.lacquer, [OUTER * 2 + 0.01, 0.016, bodyFront - CASE_BACK + 0.016], [0, lidY + 0.008, (bodyFront + CASE_BACK) / 2 + 0.004], 0.006));
  const fall = new Group();
  fall.name = 'Fallboard';
  // From over the felt (bottom edge) up and back to the body's front at the lid.
  const a = { y: 0.0135, z: innerFront - 0.004 };
  const b = { y: lidY - 0.004, z: bodyFront };
  const length = Math.hypot(b.y - a.y, b.z - a.z);
  fall.position.set(0, (a.y + b.y) / 2, (a.z + b.z) / 2 - 0.006);
  fall.rotation.x = Math.atan2(b.z - a.z, b.y - a.y);
  fall.add(block('FallboardPanel', m.lacquer, [KEYBOARD_WIDTH + 0.002, length, 0.014], [0, 0, 0], 0.004));
  c.add(fall);
  // The music rest, leaning back on a ledge on the lid.
  const rest = new Group();
  rest.name = 'MusicRest';
  rest.position.set(0, lidY + 0.016, -0.265);
  rest.add(block('RestLedge', m.lacquer, [0.62, 0.022, 0.05], [0, 0.011, 0.012], 0.005));
  const panel = new Group();
  panel.name = 'RestPanelFrame';
  panel.rotation.x = -0.24;
  const panelMesh = new Mesh(taperPlate(0.24, 0.6, 0.62, 0.012, 0.004), m.lacquer);
  panelMesh.name = 'RestPanel';
  // taperPlate lies in XY with its length along X: stand it up, the wider edge at the bottom.
  panelMesh.rotation.z = Math.PI / 2;
  panelMesh.position.set(0, 0.12 + 0.02, -0.008);
  panel.add(panelMesh);
  rest.add(panel);
  c.add(rest);
  for (const mesh of c.children) mesh.traverse((o) => ((o as Mesh).castShadow = (o as Mesh).receiveShadow = true));
  return c;
}

/** Side panels and modesty panel (stretched), toe blocks and pedals (on the floor). */
function createStand(m: ReturnType<typeof materials>): Group {
  const stand = new Group();
  stand.name = 'Stand';
  const legs = new Group();
  legs.name = 'Legs';
  legs.position.y = CASE_BOTTOM;
  const panelDepth = -CASE_BACK - 0.05;
  for (const side of [-1, 1]) {
    legs.add(
      block(
        side < 0 ? 'LegBass' : 'LegTreble',
        m.lacquer,
        [0.034, LEG_LENGTH + 0.004, panelDepth],
        [side * (OUTER - 0.022), -LEG_LENGTH / 2, CASE_BACK + 0.01 + panelDepth / 2],
        0.006,
      ),
    );
  }
  legs.add(block('ModestyPanel', m.lacquer, [OUTER * 2 - 0.08, LEG_LENGTH * 0.62, 0.016], [0, -LEG_LENGTH * 0.31, CASE_BACK + 0.045], 0.004));
  stand.add(legs);

  const floor = new Group();
  floor.name = 'Floor';
  floor.position.y = -PIANO.keyHeight;
  for (const side of [-1, 1]) {
    floor.add(block(side < 0 ? 'ToeBass' : 'ToeTreble', m.lacquer, [0.05, 0.05, -CASE_BACK + 0.06], [side * (OUTER - 0.022), 0.025, (CASE_BACK + 0.06) / 2], 0.012));
  }
  const box = { front: -0.25, back: CASE_BACK + 0.06, height: 0.075 };
  floor.add(block('PedalBox', m.lacquer, [0.3, box.height, box.front - box.back], [0, box.height / 2, (box.front + box.back) / 2], 0.01));
  const pedals = new Group();
  pedals.name = 'Pedals';
  for (const [i, name] of ['PedalSoft', 'PedalSostenuto', 'PedalSustain'].entries()) {
    const x = (i - 1) * 0.075;
    const pedal = new Group();
    pedal.name = name;
    // The lever comes out of the box and tilts up a little to the foot pad.
    pedal.position.set(x, 0.042, box.front);
    pedal.rotation.x = 0.1;
    pedal.add(block(`${name}Lever`, m.brass, [0.016, 0.008, 0.1], [0, 0, 0.05], 0.002));
    pedal.add(block(`${name}Pad`, m.brass, [0.034, 0.011, 0.075], [0, 0.002, 0.125], 0.0045));
    pedals.add(pedal);
  }
  floor.add(pedals);
  stand.add(floor);
  stand.traverse((o) => ((o as Mesh).castShadow = (o as Mesh).receiveShadow = true));
  return stand;
}

/** Builds the piano (see the module comment for its space). */
export function createPiano(): Group {
  const root = new Group();
  root.name = 'Piano';
  const m = materials();
  root.add(createCase(m), createKeys(m), createStand(m));
  const hud = new Object3D();
  hud.name = 'HudAnchor';
  hud.position.set(0, 0.46, -0.3);
  root.add(hud);
  return root;
}

/** Stretches the stand so the floor is `keyHeight` below the tops of the white keys. */
export function fitPianoStand(piano: Object3D, keyHeight: number): void {
  const legs = piano.getObjectByName('Legs');
  const floor = piano.getObjectByName('Floor');
  if (legs == null || floor == null) return;
  legs.scale.y = Math.max(0.05, (keyHeight + CASE_BOTTOM) / LEG_LENGTH);
  floor.position.y = -keyHeight;
}
