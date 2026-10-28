import {
  AdditiveBlending,
  BoxGeometry,
  type BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from '@iwsdk/core';
import { THEATRE, type TheatreMaterials } from './lib/theatre-kit.js';

/**
 * The lighting rig: three overhead electrics of PAR cans over the stage, a
 * front-of-house truss of profile spots, a followspot on the balcony rail
 * trained on center stage, and faint haze beams under the brightest units.
 * It only shows the fixtures; the scene's light components do the lighting.
 * Same frame as the stage asset: origin center stage, audience toward -Z.
 */

export const GEL = {
  amber: 0xffb35c,
  white: 0xfff1d6,
  blue: 0x4a6bff,
  magenta: 0xff4fb8,
} as const;
type Gel = keyof typeof GEL;

/** Where the followspot sits on the balcony rail, and the point it holds. */
export const FOLLOWSPOT = {
  position: [0, 5.75, -16.85] as const,
  target: [0, 1, 0] as const,
};

interface Fixture {
  /** Pivot of the tilt, below the pipe clamp. */
  pivot: Vector3;
  target: Vector3;
  gel: Gel;
  kind: 'par' | 'profile';
  beam?: number;
}

const UP = new Vector3(0, 1, 0);
const ONE = new Vector3(1, 1, 1);
/** Haze beams fade to nothing by this height. */
const HAZE_FLOOR_Y = 2.6;
/** Fixture pivots hang this far under their pipe. */
const DROP = 0.26;

/** Three electrics over the stage and the FOH truss, as pipe heights and fixtures. */
function planRig(): { pipes: { y: number; z: number; halfLength: number }[]; fixtures: Fixture[] } {
  const pipes = [
    { y: 7.4, z: -1.1, halfLength: 7 },
    { y: 7.7, z: 1.6, halfLength: 7 },
    { y: 7.7, z: 4.6, halfLength: 7 },
    { y: 10.2, z: -9, halfLength: 6 },
  ];
  const plan: { gels: Gel[]; aim: (x: number) => [number, number, number]; beams: number }[] = [
    { gels: ['amber', 'white'], aim: (x) => [x * 0.35, 0, 0.8], beams: 0.05 },
    { gels: ['blue', 'magenta'], aim: (x) => [x * 0.3, 0, 1.4], beams: 0.05 },
    { gels: ['blue', 'amber'], aim: (x) => [x * 0.4, 0, 0.4], beams: 0.06 },
  ];
  const fixtures: Fixture[] = [];
  plan.forEach(({ gels, aim, beams }, p) => {
    for (let i = 0; i < 8; i++) {
      const x = -5.25 + i * 1.5;
      fixtures.push({
        pivot: new Vector3(x, pipes[p].y - DROP, pipes[p].z),
        target: new Vector3(...aim(x)),
        gel: gels[i % 2],
        kind: 'par',
        // Haze beams under the inner four of each pipe.
        beam: i >= 2 && i <= 5 ? beams : undefined,
      });
    }
  });
  for (let i = 0; i < 6; i++) {
    const x = -4.5 + i * 1.8;
    fixtures.push({
      pivot: new Vector3(x, pipes[3].y - DROP, pipes[3].z),
      target: new Vector3(x * 0.2, 1, 0),
      gel: 'white',
      kind: 'profile',
    });
  }
  return { pipes, fixtures };
}

/** Yaw frame (for the yoke) and tilted frame (for the body) of a fixture. */
function aimFrames(f: Fixture): { yaw: Matrix4; tilt: Matrix4 } {
  const d = new Vector3().subVectors(f.target, f.pivot);
  const yawAngle = Math.atan2(d.x, d.z);
  const pitch = Math.atan2(-d.y, Math.hypot(d.x, d.z));
  const yawQ = new Quaternion().setFromAxisAngle(UP, yawAngle);
  const tiltQ = yawQ.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), pitch));
  return {
    yaw: new Matrix4().compose(f.pivot, yawQ, ONE),
    tilt: new Matrix4().compose(f.pivot, tiltQ, ONE),
  };
}

/** Cylinder whose axis runs along local +Z instead of +Y. */
function zCylinder(rTop: number, rBottom: number, length: number, segments = 14): BufferGeometry {
  return new CylinderGeometry(rTop, rBottom, length, segments).rotateX(Math.PI / 2);
}

/** Open cone from `from` (narrow) to `to`, fading out toward `to`, for additive haze. */
function hazeBeam(
  from: Vector3,
  to: Vector3,
  r0: number,
  r1: number,
  color: number,
  strength: number,
): BufferGeometry {
  const length = from.distanceTo(to);
  const geometry = new CylinderGeometry(r0, r1, length, 24, 6, true);
  const tint = new Color(color);
  const position = geometry.getAttribute('position');
  const colors: number[] = [];
  for (let i = 0; i < position.count; i++) {
    const t = position.getY(i) / length + 0.5;
    // Fades out completely at the far end, so a beam never wraps the performer.
    const k = strength * t ** 1.5;
    colors.push(tint.r * k, tint.g * k, tint.b * k);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const axis = new Vector3().subVectors(from, to).normalize();
  geometry.applyQuaternion(new Quaternion().setFromUnitVectors(UP, axis));
  const mid = new Vector3().addVectors(from, to).multiplyScalar(0.5);
  geometry.translate(mid.x, mid.y, mid.z);
  return geometry;
}

function instanced(
  group: Group,
  name: string,
  geometry: BufferGeometry,
  material: Material,
  placements: Matrix4[],
): void {
  if (placements.length === 0) return;
  const mesh = new InstancedMesh(geometry, material, placements.length);
  placements.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  mesh.name = name;
  group.add(mesh);
}

export function createLightingRig(m: TheatreMaterials): Group {
  const root = new Group();
  root.name = 'LightingRig';
  const { pipes, fixtures } = planRig();
  const lensMaterials = Object.fromEntries(
    Object.entries(GEL).map(([gel, color]) => [gel, new MeshBasicMaterial({ color, name: `lens-${gel}` })]),
  ) as Record<Gel, MeshBasicMaterial>;
  const hazeMaterial = new MeshBasicMaterial({
    name: 'haze-beam',
    vertexColors: true,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
  });

  // Pipes, plus the lines they fly on.
  const pipeGeo = new CylinderGeometry(0.024, 0.024, 1, 8).rotateZ(Math.PI / 2);
  const pipeMats: Matrix4[] = [];
  const lineMats: Matrix4[] = [];
  for (const pipe of pipes) {
    pipeMats.push(new Matrix4().compose(new Vector3(0, pipe.y, pipe.z), new Quaternion(), new Vector3(pipe.halfLength * 2, 1, 1)));
    const top = pipe.z > THEATRE.prosceniumZ ? THEATRE.stageCeilingY : THEATRE.houseCeilingY;
    for (const x of [-0.8, -0.3, 0.3, 0.8].map((k) => k * pipe.halfLength)) {
      const length = top - pipe.y;
      lineMats.push(new Matrix4().compose(new Vector3(x, pipe.y + length / 2, pipe.z), new Quaternion(), new Vector3(1, length, 1)));
    }
  }
  // The FOH truss gets a lower chord and struts so it reads as a truss.
  const foh = pipes[3];
  pipeMats.push(new Matrix4().compose(new Vector3(0, foh.y - 0.45, foh.z), new Quaternion(), new Vector3(foh.halfLength * 2, 1, 1)));
  const strutMats: Matrix4[] = [];
  for (let x = -foh.halfLength; x <= foh.halfLength + 1e-6; x += 0.75) {
    strutMats.push(new Matrix4().makeTranslation(x, foh.y - 0.225, foh.z));
  }
  instanced(root, 'Pipes', pipeGeo, m.rigMetal, pipeMats);
  instanced(root, 'FlyLines', new CylinderGeometry(0.006, 0.006, 1, 4), m.rigMetal, lineMats);
  instanced(root, 'TrussStruts', new CylinderGeometry(0.015, 0.015, 0.45, 6), m.rigMetal, strutMats);

  // Fixture parts, gathered per part so each is one draw.
  const parts = {
    clamp: [] as Matrix4[],
    yokeBar: [] as Matrix4[],
    yokeArm: [] as Matrix4[],
    par: [] as Matrix4[],
    profile: [] as Matrix4[],
    barrel: [] as Matrix4[],
  };
  const lenses: Record<Gel, Matrix4[]> = { amber: [], white: [], blue: [], magenta: [] };
  const at = (frame: Matrix4, x: number, y: number, z: number) =>
    frame.clone().multiply(new Matrix4().makeTranslation(x, y, z));
  const hazeParts: BufferGeometry[] = [];
  for (const f of fixtures) {
    const { yaw, tilt } = aimFrames(f);
    parts.clamp.push(at(yaw, 0, DROP - 0.04, 0));
    parts.yokeBar.push(at(yaw, 0, 0.2, 0));
    parts.yokeArm.push(at(yaw, 0.15, 0.09, 0), at(yaw, -0.15, 0.09, 0));
    const lensZ = f.kind === 'par' ? 0.162 : 0.47;
    if (f.kind === 'par') {
      parts.par.push(tilt.clone());
    } else {
      parts.profile.push(tilt.clone());
      parts.barrel.push(at(tilt, 0, 0, 0.3));
    }
    lenses[f.gel].push(at(tilt, 0, 0, lensZ));
    if (f.beam) {
      const lens = new Vector3(0, 0, lensZ).applyMatrix4(tilt);
      // Stop above head height: the haze dissolves before it reaches the stage.
      const reach = (lens.y - HAZE_FLOOR_Y) / (lens.y - f.target.y);
      const end = lens.clone().lerp(f.target, reach);
      hazeParts.push(hazeBeam(lens, end, 0.09, 0.09 + 1.4 * reach, GEL[f.gel], f.beam));
    }
  }
  instanced(root, 'Clamps', new BoxGeometry(0.06, 0.08, 0.06), m.rigMetal, parts.clamp);
  instanced(root, 'YokeBars', new BoxGeometry(0.32, 0.03, 0.04), m.rigMetal, parts.yokeBar);
  instanced(root, 'YokeArms', new BoxGeometry(0.025, 0.22, 0.04), m.rigMetal, parts.yokeArm);
  instanced(root, 'ParCans', zCylinder(0.1, 0.12, 0.32), m.rigMetal, parts.par);
  instanced(root, 'ProfileBodies', zCylinder(0.12, 0.12, 0.34), m.rigMetal, parts.profile);
  instanced(root, 'ProfileBarrels', zCylinder(0.075, 0.08, 0.3), m.rigMetal, parts.barrel);
  const lensGeo = new CircleGeometry(0.092, 18);
  for (const gel of Object.keys(lenses) as Gel[]) {
    instanced(root, `Lenses_${gel}`, lensGeo, lensMaterials[gel], lenses[gel]);
  }
  const followspot = createFollowspot(m, lensMaterials.white);
  root.add(followspot.group);

  // Haze: the overhead beams plus the followspot's long shaft onto the performer.
  // The followspot shaft dies out over the apron, short of the performer.
  const shaftEnd = followspot.lens.clone().lerp(new Vector3(...FOLLOWSPOT.target), 0.78);
  hazeParts.push(hazeBeam(followspot.lens, shaftEnd, 0.12, 0.9, GEL.white, 0.06));
  for (const [i, geometry] of hazeParts.entries()) {
    const beam = new Mesh(geometry, hazeMaterial);
    beam.name = `HazeBeam${i}`;
    beam.renderOrder = 10;
    root.add(beam);
  }
  return root;
}

/** Long-throw followspot on a pedestal behind the balcony rail. */
function createFollowspot(m: TheatreMaterials, lensMaterial: Material): { group: Group; lens: Vector3 } {
  const group = new Group();
  group.name = 'Followspot';
  const pivot = new Vector3(...FOLLOWSPOT.position);
  const { yaw, tilt } = aimFrames({
    pivot,
    target: new Vector3(...FOLLOWSPOT.target),
    gel: 'white',
    kind: 'profile',
  });
  const add = (name: string, geometry: BufferGeometry, material: Material, frame: Matrix4) => {
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    frame.decompose(mesh.position, mesh.quaternion, mesh.scale);
    group.add(mesh);
  };
  const floorY = 4.5;
  const standHeight = pivot.y - 0.2 - floorY;
  add('Stand', new CylinderGeometry(0.04, 0.05, standHeight, 10), m.rigMetal,
    new Matrix4().makeTranslation(pivot.x, floorY + standHeight / 2, pivot.z));
  add('Base', new CylinderGeometry(0.3, 0.34, 0.05, 16), m.rigMetal,
    new Matrix4().makeTranslation(pivot.x, floorY + 0.025, pivot.z));
  add('Yoke', new BoxGeometry(0.46, 0.04, 0.08), m.rigMetal, yaw.clone().multiply(new Matrix4().makeTranslation(0, -0.2, 0)));
  add('Body', zCylinder(0.17, 0.2, 1.1, 18), m.rigMetal, tilt.clone());
  add('Lens', new CircleGeometry(0.16, 24), lensMaterial, tilt.clone().multiply(new Matrix4().makeTranslation(0, 0, 0.552)));
  return { group, lens: new Vector3(0, 0, 0.56).applyMatrix4(tilt) };
}
