import {
  BoxGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  createScenePrimitiveObject,
  BufferGeometry,
  Group,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from '@iwsdk/core';
import {
  apronEdgeZ,
  arcBand,
  arcPoint,
  arcWall,
  THEATRE,
  type TheatreMaterials,
} from './lib/theatre-kit.js';

/**
 * The auditorium: raked orchestra rows and a balcony of red upholstered
 * seats on concentric arcs facing the stage, carpeted risers with aisle step
 * lights, paneled walls with sconces, and a chandelier. Same frame as the
 * stage asset: origin center stage, audience toward -Z.
 */

const SEAT_WIDTH = 0.56;
/** Seats run from the center out to this arc length, then an aisle. */
const CENTER_HALF = 2.8;
const AISLE_END = 4.0;
const ROW_PITCH = 0.95;

interface Tier {
  firstRadius: number;
  rows: number;
  baseY: number;
  rise: number;
  /** Inner edge of the first row's platform. */
  frontRadius: number;
}

const ORCHESTRA: Tier = {
  firstRadius: 6.8,
  rows: 16,
  baseY: THEATRE.houseFloorY + 0.15,
  rise: 0.15,
  frontRadius: 6.8 - ROW_PITCH / 2,
};
const BALCONY: Tier = {
  firstRadius: 18.4,
  rows: 5,
  baseY: 4.5,
  rise: 0.42,
  frontRadius: 17.6,
};
const BALCONY_SOFFIT_Y = 3.9;
/** Platforms behind the last row run back past the house's back wall. */
const BACK_RADIUS = 27;

const rowRadius = (tier: Tier, row: number) => tier.firstRadius + row * ROW_PITCH;
const rowY = (tier: Tier, row: number) => tier.baseY + row * tier.rise;

function named<T extends Mesh | Group | InstancedMesh>(object: T, name: string): T {
  object.name = name;
  return object;
}

/** World matrices of every seat and every seat-divider standard. */
interface SeatLayout {
  seats: Matrix4[];
  standards: Matrix4[];
  aisleLights: Matrix4[];
}

const UP = new Vector3(0, 1, 0);

/** Matrix for a point on an arc, turned to face the stage. */
function arcMatrix(radius: number, s: number, y: number): Matrix4 {
  const phi = s / radius;
  const position = arcPoint(radius, phi, y, new Vector3());
  const rotation = new Quaternion().setFromAxisAngle(UP, -phi);
  return new Matrix4().compose(position, rotation, new Vector3(1, 1, 1));
}

function seatFits(radius: number, s: number, y: number, tier: Tier): boolean {
  const p = arcPoint(radius, s / radius, y, new Vector3());
  if (Math.abs(p.x) > THEATRE.houseHalfWidth - 0.9) return false;
  return tier !== ORCHESTRA || p.z < apronEdgeZ(p.x) - 1.1;
}

/** Lays out one tier's rows in three blocks split by two aisles. */
function layoutTier(tier: Tier, out: SeatLayout): void {
  for (let row = 0; row < tier.rows; row++) {
    const radius = rowRadius(tier, row);
    const y = rowY(tier, row);
    // Seat centers by arc length from the center line, block by block.
    const blocks: number[][] = [[]];
    for (let s = -CENTER_HALF + SEAT_WIDTH / 2; s < CENTER_HALF; s += SEAT_WIDTH) {
      blocks[0].push(s);
    }
    for (const side of [1, -1]) {
      const block: number[] = [];
      for (let s = AISLE_END + SEAT_WIDTH / 2; ; s += SEAT_WIDTH) {
        if (!seatFits(radius, side * s, y, tier)) break;
        block.push(side * s);
      }
      if (side < 0) block.reverse();
      blocks.push(block);
    }
    for (const block of blocks) {
      if (block.length === 0) continue;
      for (const s of block) {
        if (seatFits(radius, s, y, tier)) out.seats.push(arcMatrix(radius, s, y));
      }
      // One standard between neighbours and one at each end of the block.
      const first = Math.min(...block) - SEAT_WIDTH / 2;
      for (let k = 0; k <= block.length; k++) {
        out.standards.push(arcMatrix(radius, first + k * SEAT_WIDTH, y));
      }
    }
    // Step lights at the foot of each riser, in both aisles.
    const riser = radius - ROW_PITCH / 2;
    for (const side of [1, -1]) {
      out.aisleLights.push(arcMatrix(riser, side * (CENTER_HALF + AISLE_END) / 2, y - 0.1));
    }
  }
}

/** Joins indexed geometries with position, normal and uv into one draw. */
function merge(parts: BufferGeometry[]): BufferGeometry {
  const merged = new BufferGeometry();
  const attrs = ['position', 'normal', 'uv'] as const;
  const data = Object.fromEntries(attrs.map((a) => [a, [] as number[]]));
  const indices: number[] = [];
  let offset = 0;
  for (const part of parts) {
    for (const a of attrs) data[a].push(...Array.from(part.getAttribute(a).array as ArrayLike<number>));
    const index = part.getIndex()!.array;
    for (let i = 0; i < index.length; i++) indices.push(index[i] + offset);
    offset += part.getAttribute('position').count;
  }
  for (const a of attrs) {
    const size = parts[0].getAttribute(a).itemSize;
    merged.setAttribute(a, new Float32BufferAttribute(data[a], size));
  }
  merged.setIndex(indices);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/** Carpeted platform and riser for every row of a tier. */
function tierPlatforms(tier: Tier, riserFloorY: number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let row = 0; row < tier.rows; row++) {
    const radius = rowRadius(tier, row);
    const y = rowY(tier, row);
    const inner = row === 0 ? tier.frontRadius : radius - ROW_PITCH / 2;
    const outer = row === tier.rows - 1 ? BACK_RADIUS : radius + ROW_PITCH / 2;
    parts.push(arcBand(inner, outer, y));
    const below = row === 0 ? riserFloorY : y - tier.rise;
    parts.push(arcWall(inner, below, y));
  }
  return merge(parts);
}

function createSeating(m: TheatreMaterials): Group {
  const group = named(new Group(), 'Seating');
  const layout: SeatLayout = { seats: [], standards: [], aisleLights: [] };
  layoutTier(ORCHESTRA, layout);
  layoutTier(BALCONY, layout);

  const rounded = (size: [number, number, number], radius: number) =>
    createScenePrimitiveObject(
      { geometry: { type: 'roundedBox', size, radius, segments: 1 } },
      m.seatVelvet,
    ).geometry;
  const lean = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.2);
  const upright = new Quaternion();
  const one = new Vector3(1, 1, 1);
  const part = (x: number, y: number, z: number, q = upright) =>
    new Matrix4().compose(new Vector3(x, y, z), q, one);
  const backCenter = part(0, 0.8, -0.2, lean);
  const shellOffset = backCenter.clone().multiply(part(0, 0, -0.07));

  const instanced = (
    name: string,
    geometry: BufferGeometry,
    material: Material,
    placements: Matrix4[],
    local: Matrix4,
  ) => {
    const mesh = new InstancedMesh(geometry, material, placements.length);
    const matrix = new Matrix4();
    placements.forEach((p, i) => mesh.setMatrixAt(i, matrix.multiplyMatrices(p, local)));
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    group.add(named(mesh, name));
  };
  const { seats, standards, aisleLights } = layout;
  instanced('SeatCushions', rounded([0.5, 0.11, 0.46], 0.04), m.seatVelvet, seats, part(0, 0.44, 0.05));
  instanced('SeatBacks', rounded([0.5, 0.6, 0.11], 0.045), m.seatVelvet, seats, backCenter);
  instanced('SeatShells', new BoxGeometry(0.52, 0.66, 0.03), m.seatWood, seats, shellOffset);
  instanced('Standards', new BoxGeometry(0.06, 0.62, 0.56), m.seatWood, standards, part(0, 0.31, -0.05));
  instanced('Armrests', new BoxGeometry(0.09, 0.04, 0.5), m.seatWood, standards, part(0, 0.64, 0));
  instanced('AisleLights', new BoxGeometry(0.14, 0.035, 0.02), m.warmGlow, aisleLights, part(0, 0, 0));
  group.userData.seatCount = seats.length;
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

function createShell(m: TheatreMaterials): Group {
  const group = named(new Group(), 'HouseShell');
  const { houseHalfWidth: w, houseBackZ: back, houseCeilingY: top, houseFloorY: floor } = THEATRE;
  const front = THEATRE.prosceniumZ;
  const t = 0.3;
  const depth = front - back;
  const midZ = (front + back) / 2;
  const height = top - floor;
  group.add(
    box([2 * w, 0.1, depth], [0, floor - 0.05, midZ], m.carpet, 'Floor'),
    box([2 * w + 2 * t, t, depth], [0, top + t / 2, midZ], m.ceiling, 'Ceiling'),
    box([2 * w + 2 * t, height, t], [0, floor + height / 2, back - t / 2], m.wallFabric, 'BackWall'),
  );
  for (const side of [1, -1]) {
    group.add(
      box([t, height, depth], [side * (w + t / 2), floor + height / 2, midZ], m.wallFabric, 'SideWall'),
      box([0.3, 0.3, depth], [side * (w - 0.15), top - 0.25, midZ], m.gold, 'Cornice'),
    );
    for (const z of [-5, -8.5, -12, -15.5, -19, -22.5]) {
      group.add(
        box([0.14, height, 0.5], [side * (w - 0.07), floor + height / 2, z], m.seatWood, 'Pilaster'),
        box([0.24, 0.35, 0.62], [side * (w - 0.12), top - 0.6, z], m.gold, 'Capital'),
      );
    }
  }
  group.add(box([2 * w, 0.3, 0.3], [0, top - 0.25, back + 0.15], m.gold, 'Cornice'));

  // Exits at the back of the cross aisle, under the balcony.
  const aisleY = rowY(ORCHESTRA, ORCHESTRA.rows - 1);
  for (const x of [-5, 5]) {
    group.add(
      box([1.3, 2.2, 0.06], [x, aisleY + 1.1, back + 0.03], m.seatWood, 'ExitDoor'),
      box([0.45, 0.16, 0.05], [x, aisleY + 2.45, back + 0.03], m.exitGlow, 'ExitSign'),
    );
  }
  return group;
}

function createBalconyFront(m: TheatreMaterials): Group {
  const group = named(new Group(), 'BalconyFront');
  const r = BALCONY.frontRadius;
  const railY = BALCONY.baseY + 0.9;
  group.add(
    named(new Mesh(arcWall(r, BALCONY_SOFFIT_Y, railY), m.wallFabric), 'Fascia'),
    named(new Mesh(arcBand(r - 0.12, r + 0.12, railY), m.gold), 'RailCap'),
    named(new Mesh(arcWall(r - 0.03, railY - 0.16, railY - 0.08), m.gold), 'RailMolding'),
    named(new Mesh(arcWall(r - 0.03, BALCONY_SOFFIT_Y, BALCONY_SOFFIT_Y + 0.16), m.gold), 'BaseMolding'),
    named(new Mesh(arcBand(r, BACK_RADIUS, BALCONY_SOFFIT_Y), m.ceiling), 'Soffit'),
  );
  return group;
}

/** Wall sconces in two tiers and a gilded chandelier, the house lights. */
function createHouseLights(m: TheatreMaterials): Group {
  const group = named(new Group(), 'HouseLights');
  const w = THEATRE.houseHalfWidth;
  const plates: Matrix4[] = [];
  const shades: Matrix4[] = [];
  for (const side of [1, -1]) {
    for (const z of [-6.75, -10.25, -13.75, -17.25, -20.75]) {
      for (const y of [3.2, 8.4]) {
        plates.push(new Matrix4().makeTranslation(side * (w - 0.02), y, z));
        shades.push(new Matrix4().makeTranslation(side * (w - 0.16), y + 0.08, z));
      }
    }
  }
  const instanced = (name: string, geometry: BufferGeometry, material: Material, at: Matrix4[]) => {
    const mesh = new InstancedMesh(geometry, material, at.length);
    at.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    group.add(named(mesh, name));
  };
  instanced('SconcePlates', new BoxGeometry(0.04, 0.42, 0.22), m.gold, plates);
  instanced('SconceShades', new CylinderGeometry(0.08, 0.12, 0.22, 12), m.warmGlow, shades);

  const center = new Vector3(0, 10.2, -11.5);
  const chandelier = named(new Group(), 'Chandelier');
  chandelier.position.copy(center);
  const chain = new Mesh(new CylinderGeometry(0.02, 0.02, THEATRE.houseCeilingY - center.y, 6), m.gold);
  chain.position.y = (THEATRE.houseCeilingY - center.y) / 2;
  const body = new Mesh(new CylinderGeometry(0.16, 0.36, 0.6, 16), m.gold);
  body.position.y = 0.2;
  chandelier.add(named(chain, 'Chain'), named(body, 'Body'));
  const bulbs: Matrix4[] = [];
  for (const [radius, y, count] of [[1.2, 0, 16], [0.75, 0.45, 10]] as const) {
    const ring = new Mesh(new TorusGeometry(radius, 0.04, 8, 48), m.gold);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    chandelier.add(named(ring, 'Ring'));
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      bulbs.push(new Matrix4().makeTranslation(Math.cos(a) * radius, y + 0.09, Math.sin(a) * radius));
    }
  }
  const bulbMesh = new InstancedMesh(new SphereGeometry(0.06, 10, 6), m.warmGlow, bulbs.length);
  bulbs.forEach((matrix, i) => bulbMesh.setMatrixAt(i, matrix));
  bulbMesh.computeBoundingBox();
  bulbMesh.computeBoundingSphere();
  chandelier.add(named(bulbMesh, 'Bulbs'));
  const medallion = new Mesh(new TorusGeometry(5.5, 0.12, 8, 96), m.gold);
  medallion.rotation.x = Math.PI / 2;
  medallion.position.set(0, THEATRE.houseCeilingY - 0.1, center.z);
  group.add(chandelier, named(medallion, 'CeilingMedallion'));
  return group;
}

/** The whole auditorium. See the module comment for its frame. */
export function createTheatreHouse(m: TheatreMaterials): Group {
  const root = named(new Group(), 'TheatreHouse');
  root.add(
    named(new Mesh(tierPlatforms(ORCHESTRA, THEATRE.houseFloorY), m.carpet), 'OrchestraRake'),
    named(new Mesh(tierPlatforms(BALCONY, BALCONY_SOFFIT_Y), m.carpet), 'BalconyRake'),
    createSeating(m),
    createShell(m),
    createBalconyFront(m),
    createHouseLights(m),
  );
  return root;
}
