/**
 * Denting a mesh's vertices where it struck something. No Three.js or IWSDK
 * imports, so it can be unit tested in Node.
 */

/**
 * A repeatable roughness from 0 to 1 for a point in space. It depends only on
 * the position, because non-indexed meshes repeat each vertex once per
 * triangle: copies of a vertex must move together or the surface would tear.
 */
function roughness(x: number, y: number, z: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Pushes `positions` (xyz triples) within `radius` of the hit along the unit
 * direction (dx, dy, dz) by up to `depth`: most at the hit, fading smoothly to
 * nothing at the radius, and crumpled rather than perfectly smooth. Returns
 * how many vertices moved.
 */
export function dentPositions(
  positions: { length: number; [index: number]: number },
  hx: number,
  hy: number,
  hz: number,
  dx: number,
  dy: number,
  dz: number,
  radius: number,
  depth: number,
): number {
  let moved = 0;
  const r2 = radius * radius;
  for (let i = 0; i + 2 < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    const ax = x - hx;
    const ay = y - hy;
    const az = z - hz;
    const d2 = ax * ax + ay * ay + az * az;
    if (d2 >= r2) continue;
    const t = 1 - Math.sqrt(d2) / radius;
    const push = depth * t * t * (3 - 2 * t) * (0.65 + 0.35 * roughness(x, y, z));
    positions[i] = x + dx * push;
    positions[i + 1] = y + dy * push;
    positions[i + 2] = z + dz * push;
    moved++;
  }
  return moved;
}
