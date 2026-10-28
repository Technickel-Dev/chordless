import {
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  type Material,
  BoxGeometry,
  Quaternion,
  Shape,
  TubeGeometry,
  Vector3,
} from '@iwsdk/core';
import {
  apronEdgeZ,
  paramSurface,
  THEATRE,
  type TheatreMaterials,
} from './lib/theatre-kit.js';

/**
 * The stage end of the theatre: deck and apron, proscenium arch, the red
 * main curtains tied back, valance, masking legs and borders, the back drape
 * and the black stage house. Origin is center stage on the deck top, with
 * the audience toward -Z.
 */

const OPENING_ARCH_RADIUS =
  (THEATRE.openingHalfWidth ** 2 + (THEATRE.openingCrown - THEATRE.openingHeight) ** 2) /
  (2 * (THEATRE.openingCrown - THEATRE.openingHeight));

/** Height of the proscenium arch at `x`, grown outward by `offset`. */
function archY(x: number, offset = 0): number {
  const r = OPENING_ARCH_RADIUS + offset;
  const centerY = THEATRE.openingCrown - OPENING_ARCH_RADIUS;
  return centerY + Math.sqrt(Math.max(0, r * r - x * x));
}

function named<T extends Mesh | Group>(object: T, name: string): T {
  object.name = name;
  return object;
}

function createDeck(m: TheatreMaterials): Mesh {
  // Drawn in plan with shape y = -z, then stood up so shape y becomes world z.
  const { stageHalfWidth: w, stageBackZ, prosceniumZ, apronHalfChord } = THEATRE;
  const plan = new Shape();
  plan.moveTo(-w, -stageBackZ);
  plan.lineTo(w, -stageBackZ);
  plan.lineTo(w, -prosceniumZ);
  for (let i = 0; i <= 48; i++) {
    const x = apronHalfChord - (2 * apronHalfChord * i) / 48;
    plan.lineTo(x, -apronEdgeZ(x));
  }
  plan.lineTo(-w, -prosceniumZ);
  plan.closePath();
  const depth = -THEATRE.houseFloorY;
  const geometry = new ExtrudeGeometry(plan, { depth, bevelEnabled: false, curveSegments: 1 });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -depth, 0);
  return named(new Mesh(geometry, [m.stageBoards, m.blackPaint]), 'Deck');
}

/** U-shaped outline up one side, over the arch and down the other, from `bottom`. */
function archOutline(shape: Shape, offset: number, bottom: number, reverse: boolean): void {
  const half = THEATRE.openingHalfWidth + offset;
  const steps = 32;
  const pts: [number, number][] = [[-half, bottom]];
  for (let i = 0; i <= steps; i++) {
    const x = -half + (2 * half * i) / steps;
    pts.push([x, archY(x, offset)]);
  }
  pts.push([half, bottom]);
  if (reverse) pts.reverse();
  for (const [x, y] of pts) shape.lineTo(x, y);
}

function createProscenium(m: TheatreMaterials): Group {
  const group = named(new Group(), 'Proscenium');
  const { houseFloorY, stageCeilingY, prosceniumZ, prosceniumDepth } = THEATRE;
  const outer = THEATRE.houseHalfWidth + 0.4;

  const wall = new Shape();
  wall.moveTo(-outer, houseFloorY);
  archOutline(wall, 0, houseFloorY, false);
  wall.lineTo(outer, houseFloorY);
  wall.lineTo(outer, stageCeilingY);
  wall.lineTo(-outer, stageCeilingY);
  wall.closePath();
  const wallGeo = new ExtrudeGeometry(wall, { depth: prosceniumDepth, bevelEnabled: false });
  wallGeo.translate(0, 0, prosceniumZ);
  group.add(named(new Mesh(wallGeo, m.wallFabric), 'ArchWall'));

  // Gilded frame in two steps: a broad flat band and a proud inner bead.
  const band = (inner: number, outerOffset: number, proud: number, name: string) => {
    const shape = new Shape();
    shape.moveTo(-THEATRE.openingHalfWidth - outerOffset, 0);
    archOutline(shape, outerOffset, 0, false);
    archOutline(shape, inner, 0, true);
    shape.closePath();
    const geo = new ExtrudeGeometry(shape, { depth: proud, bevelEnabled: false });
    geo.translate(0, 0, prosceniumZ - proud);
    group.add(named(new Mesh(geo, m.gold), name));
  };
  band(0, 0.5, 0.08, 'FrameBand');
  band(0, 0.12, 0.18, 'FrameBead');
  band(0.62, 0.7, 0.14, 'FrameOuterBead');
  return group;
}

/**
 * Straight pleated drape hanging in the XY plane at depth `z`, from `x0` to
 * `x1` and `y0` to `y1`. Pleats are about `pitch` apart and `depth` deep.
 */
function pleatedDrape(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z: number,
  pitch: number,
  depth: number,
): BufferGeometry {
  const pleats = Math.max(2, Math.round(Math.abs(x1 - x0) / pitch));
  return paramSurface(pleats * 8, 1, (u, v, out) => {
    out.set(
      x0 + (x1 - x0) * u,
      y0 + (y1 - y0) * v,
      z + depth * Math.sin(Math.PI * 2 * pleats * u),
    );
  });
}

const CURTAIN = {
  /** Outer edge, hidden behind the arch wall. */
  outerX: 6.9,
  trackY: 8.4,
  z: -1.55,
  pleats: 10,
  /** Where the tieback gathers the curtain, as a fraction of its height. */
  tieV: 0.33,
  /** Gathered width at the top, at the tieback and at the floor. */
  topWidth: 3.0,
  tieWidth: 1.1,
  floorWidth: 1.6,
};

function gatheredWidth(v: number): number {
  const { tieV, topWidth, tieWidth, floorWidth } = CURTAIN;
  if (v >= tieV) return tieWidth + (topWidth - tieWidth) * ((v - tieV) / (1 - tieV)) ** 1.6;
  return tieWidth + (floorWidth - tieWidth) * ((tieV - v) / tieV) ** 1.3;
}

/** One half of the main curtain, drawn open and tied back. `side` is +1 or -1. */
function createMainCurtain(m: TheatreMaterials, side: 1 | -1): Group {
  const group = named(new Group(), side > 0 ? 'MainCurtainRight' : 'MainCurtainLeft');
  const { outerX, trackY, z, pleats, tieV, tieWidth } = CURTAIN;
  const cloth = paramSurface(pleats * 12, 48, (u, v, out) => {
    const width = gatheredWidth(v);
    // The same cloth bunched narrower folds deeper.
    const depth = 0.09 * Math.sqrt(CURTAIN.topWidth / width);
    // A little extra cloth puddles forward at the hem.
    const hem = 0.12 * Math.max(0, 1 - v / 0.04);
    out.set(
      side * (outerX - u * width),
      Math.max(0.005, v * trackY),
      z - hem + depth * Math.sin(Math.PI * 2 * pleats * u),
    );
  });
  group.add(named(new Mesh(cloth, m.curtainVelvet), 'Cloth'));

  // Gold rope tieback cinched around the gathered cloth, with a tassel.
  const tieY = tieV * trackY;
  const centerX = side * (outerX - tieWidth / 2);
  const ring: Vector3[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    ring.push(
      new Vector3(
        centerX + Math.cos(a) * (tieWidth / 2 + 0.03),
        tieY + Math.sin(a * 2) * 0.015,
        z + Math.sin(a) * 0.2,
      ),
    );
  }
  const rope = new TubeGeometry(new CatmullRomCurve3(ring, true), 64, 0.028, 8, true);
  group.add(named(new Mesh(rope, m.gold), 'Tieback'));
  const tasselX = side * (outerX - tieWidth - 0.04);
  const cord = new Mesh(new CylinderGeometry(0.012, 0.012, 0.35, 6), m.gold);
  cord.position.set(tasselX, tieY - 0.175, z - 0.12);
  const tassel = new Mesh(new CylinderGeometry(0.03, 0.075, 0.26, 12), m.gold);
  tassel.position.set(tasselX, tieY - 0.48, z - 0.12);
  group.add(named(cord, 'TasselCord'), named(tassel, 'Tassel'));
  return group;
}

/** Swagged valance across the top of the opening, with a gold fringe. */
function createValance(m: TheatreMaterials): Group {
  const group = named(new Group(), 'Valance');
  const halfWidth = 6.8;
  const top = 8.7;
  const z = -1.85;
  const swags = 5;
  const pleats = 40;
  const swagSag = (u: number) => Math.sin(Math.PI * ((u * swags) % 1));
  const bottom = (u: number) => 7.15 - 0.6 * swagSag(u);
  const pleat = (u: number) => 0.045 * Math.sin(Math.PI * 2 * pleats * u);
  const cloth = paramSurface(pleats * 8, 20, (u, v, out) => {
    const b = bottom(u);
    // Swags fold horizontally, deepest in the middle of each loop.
    const fold = 0.05 * Math.sin(Math.PI * 2 * 4 * (1 - v)) * swagSag(u);
    out.set(-halfWidth + 2 * halfWidth * u, b + v * (top - b), z + pleat(u) + fold);
  });
  group.add(named(new Mesh(cloth, m.curtainVelvet), 'Cloth'));
  const fringe = paramSurface(pleats * 8, 1, (u, v, out) => {
    const b = bottom(u);
    out.set(-halfWidth + 2 * halfWidth * u, b - 0.14 + v * 0.16, z - 0.02 + pleat(u));
  });
  group.add(named(new Mesh(fringe, m.gold), 'Fringe'));
  return group;
}

function createMasking(m: TheatreMaterials): Group {
  const group = named(new Group(), 'Masking');
  const legs: [number, number, number][] = [
    [5.4, 7.8, 1.2],
    [5.6, 8.0, 4.2],
  ];
  for (const [inner, outer, z] of legs) {
    for (const side of [1, -1]) {
      const geo = pleatedDrape(side * inner, side * outer, 0, 9.6, z, 0.26, 0.05);
      group.add(named(new Mesh(geo, m.blackVelour), `Leg${side > 0 ? 'Right' : 'Left'}`));
    }
  }
  for (const z of [0.95, 3.95]) {
    const geo = pleatedDrape(-8.2, 8.2, 7.1, 9.8, z, 0.3, 0.04);
    group.add(named(new Mesh(geo, m.blackVelour), 'Border'));
  }
  const drape = pleatedDrape(-8.4, 8.4, 0, 9.8, 6.8, 0.3, 0.07);
  group.add(named(new Mesh(drape, m.backDrape), 'BackDrape'));
  return group;
}

function box(
  size: [number, number, number],
  center: [number, number, number],
  material: Material,
  name: string,
): Mesh {
  const mesh = new Mesh(new BoxGeometry(...size), material);
  mesh.position.set(...center);
  return named(mesh, name);
}

/** Black walls and fly loft behind the arch, so the stage reads as enclosed. */
function createStageHouse(m: TheatreMaterials): Group {
  const group = named(new Group(), 'StageHouse');
  const { stageHalfWidth: w, stageBackZ: back, stageCeilingY: top, houseFloorY } = THEATRE;
  const front = THEATRE.prosceniumZ + THEATRE.prosceniumDepth;
  const t = 0.3;
  const height = top - houseFloorY;
  const depth = back - front;
  for (const side of [1, -1]) {
    group.add(
      box(
        [t, height, depth],
        [side * (w + t / 2), houseFloorY + height / 2, front + depth / 2],
        m.blackPaint,
        'SideWall',
      ),
    );
  }
  group.add(
    box([2 * w + 2 * t, height, t], [0, houseFloorY + height / 2, back + t / 2], m.blackPaint, 'BackWall'),
    box([2 * w + 2 * t, t, depth], [0, top + t / 2, front + depth / 2], m.blackPaint, 'FlyLoft'),
  );
  return group;
}

/** Footlights set into the apron edge, angled up at center stage. */
function createFootlights(m: TheatreMaterials): Group {
  const group = named(new Group(), 'Footlights');
  const count = 21;
  const hoods = new InstancedMesh(new BoxGeometry(0.3, 0.09, 0.14), m.rigMetal, count);
  const lenses = new InstancedMesh(new BoxGeometry(0.26, 0.05, 0.012), m.warmGlow, count);
  const position = new Vector3();
  const rotation = new Quaternion();
  const unit = new Vector3(1, 1, 1);
  const matrix = new Matrix4();
  const lens = new Matrix4().makeTranslation(0, 0.005, 0.072);
  const up = new Vector3(0, 1, 0);
  for (let i = 0; i < count; i++) {
    const x = -6 + (12 * i) / (count - 1);
    position.set(x, 0.045, apronEdgeZ(x) + 0.24);
    rotation.setFromAxisAngle(up, Math.atan2(-position.x, -position.z));
    matrix.compose(position, rotation, unit);
    hoods.setMatrixAt(i, matrix);
    lenses.setMatrixAt(i, matrix.multiply(lens));
  }
  group.add(named(hoods, 'Hoods'), named(lenses, 'Lenses'));
  return group;
}

/** The whole stage end of the theatre. See the module comment for its frame. */
export function createTheatreStage(m: TheatreMaterials): Group {
  const root = named(new Group(), 'TheatreStage');
  root.add(
    createDeck(m),
    createProscenium(m),
    createMainCurtain(m, 1),
    createMainCurtain(m, -1),
    createValance(m),
    createMasking(m),
    createStageHouse(m),
    createFootlights(m),
  );
  return root;
}
