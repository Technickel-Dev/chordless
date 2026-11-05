/**
 * A small rigid-body simulator for a thrown guitar and its debris. The floor
 * (y = 0) is the only thing to hit, so each body is just a cloud of contact
 * points round its centre of mass, and the simulator reports exactly how
 * fast each body struck the floor, which the guitar's damage needs.
 * No Three.js or IWSDK imports, so it can be unit tested in Node.
 */

export const GRAVITY = 9.81;
/** Fast throws are split into substeps this long so points cannot tunnel. */
const MAX_STEP = 1 / 240;
/**
 * A body on the floor that stays within SLEEP_DRIFT metres and SLEEP_TURN
 * radians of one pose for SLEEP_SECONDS stops simulating. Its pose, not its
 * velocity, decides: impulses on a resting body leave a little velocity
 * that only cancels out over successive steps.
 */
const SLEEP_DRIFT = 0.005;
const SLEEP_TURN = 0.03;
const SLEEP_SECONDS = 0.4;
/** Slower approaches do not bounce, so resting bodies stop jittering. */
const BOUNCE_THRESHOLD = 0.6;
/** How fast spin dies away (per second) on one or two contact points, and on three or more. */
const ROLL_FRICTION = 2;
const SPIN_FRICTION = 10;
/**
 * Points this close above the floor count as touching it, so a body
 * resting on a face pushes on every corner together rather than on
 * whichever corners a tiny tilt happens to put lowest.
 */
const CONTACT_MARGIN = 0.003;

export class RigidBody {
  /** Centre of mass, world space. */
  readonly p = new Float64Array(3);
  /** Orientation quaternion, x y z w. */
  readonly q = new Float64Array([0, 0, 0, 1]);
  readonly v = new Float64Array(3);
  /** Angular velocity, world space, radians per second. */
  readonly w = new Float64Array(3);
  readonly invMass: number;
  /** Inverse principal moments of inertia, in the body's frame. */
  readonly invInertia = new Float64Array(3);
  /** Contact points (xyz) relative to the centre of mass, body frame. */
  readonly points: Float32Array;
  /** How many of `points` take part; a guitar that loses its neck uses fewer. */
  pointCount: number;
  restitution = 0.25;
  friction = 0.6;
  asleep = false;
  /** Fastest approach onto the floor during the last step, and the point that made it. */
  impactSpeed = 0;
  impactPoint = -1;

  private still = 0;
  private readonly restP = new Float64Array(3);
  private readonly restQ = new Float64Array(4);
  private touching = false;
  private readonly r = new Float64Array(3);
  private readonly a = new Float64Array(3);
  private readonly b = new Float64Array(3);

  constructor(points: Float32Array, mass: number, inertia: readonly [number, number, number]) {
    this.points = points;
    this.pointCount = points.length / 3;
    this.invMass = 1 / mass;
    for (let i = 0; i < 3; i++) this.invInertia[i] = 1 / inertia[i];
  }

  /** Starts it moving again after it went to sleep or was posed by hand. */
  wake(): void {
    this.asleep = false;
    this.still = 0;
  }

  setPose(px: number, py: number, pz: number, qx: number, qy: number, qz: number, qw: number): void {
    this.p[0] = px;
    this.p[1] = py;
    this.p[2] = pz;
    this.q[0] = qx;
    this.q[1] = qy;
    this.q[2] = qz;
    this.q[3] = qw;
  }

  setVelocity(vx: number, vy: number, vz: number, wx: number, wy: number, wz: number): void {
    this.v[0] = vx;
    this.v[1] = vy;
    this.v[2] = vz;
    this.w[0] = wx;
    this.w[1] = wy;
    this.w[2] = wz;
  }

  step(dt: number): void {
    this.impactSpeed = 0;
    this.impactPoint = -1;
    if (this.asleep || dt <= 0) return;
    const n = Math.max(1, Math.ceil(dt / MAX_STEP));
    const h = dt / n;
    this.touching = false;
    for (let i = 0; i < n; i++) this.substep(h);

    const { p, q, restP, restQ } = this;
    const drift = Math.hypot(p[0] - restP[0], p[1] - restP[1], p[2] - restP[2]);
    const dot = Math.abs(q[0] * restQ[0] + q[1] * restQ[1] + q[2] * restQ[2] + q[3] * restQ[3]);
    const turn = 2 * Math.acos(Math.min(1, dot));
    if (this.touching && this.still > 0 && drift < SLEEP_DRIFT && turn < SLEEP_TURN) {
      this.still += dt;
      if (this.still >= SLEEP_SECONDS) {
        this.asleep = true;
        this.v.fill(0);
        this.w.fill(0);
      }
    } else {
      // Start timing stillness from here.
      restP.set(p);
      restQ.set(q);
      this.still = this.touching ? dt : 0;
    }
  }

  private substep(h: number): void {
    const { p, q, v, w, r, points } = this;
    v[1] -= GRAVITY * h;

    // Every point below the floor, merged into one contact at their average:
    // a face resting flat then pushes straight up through its middle, where
    // impulses at each corner in turn would leave the body rocking.
    let touching = 0;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let i = 0; i < this.pointCount; i++) {
      rotate(q, points[i * 3], points[i * 3 + 1], points[i * 3 + 2], r);
      if (p[1] + r[1] >= CONTACT_MARGIN) continue;
      touching++;
      cx += r[0];
      cy += r[1];
      cz += r[2];
      // How hard this point strikes, before any impulse changes the answer.
      const vy = v[1] + w[2] * r[0] - w[0] * r[2];
      if (-vy > this.impactSpeed) {
        this.impactSpeed = -vy;
        this.impactPoint = i;
      }
    }
    if (touching > 0) {
      this.touching = true;
      r[0] = cx / touching;
      r[1] = cy / touching;
      r[2] = cz / touching;
      // Velocity of the contact point: v + w x r.
      const vx = v[0] + w[1] * r[2] - w[2] * r[1];
      const vy = v[1] + w[2] * r[0] - w[0] * r[2];
      const vz = v[2] + w[0] * r[1] - w[1] * r[0];
      if (vy < 0) {
        const e = -vy > BOUNCE_THRESHOLD ? this.restitution : 0;
        const jn = (-(1 + e) * vy) / this.effectiveMass(0, 1, 0);
        this.applyImpulse(0, jn, 0);
        // Friction against the sliding direction, at most mu times the normal impulse.
        const slide = Math.hypot(vx, vz);
        if (slide > 1e-6) {
          const tx = vx / slide;
          const tz = vz / slide;
          const jt = Math.min(slide / this.effectiveMass(tx, 0, tz), this.friction * jn);
          this.applyImpulse(-tx * jt, 0, -tz * jt);
        }
      }
      // Resting on an edge or a face, friction also stops it spinning in place.
      const k = Math.exp(-(touching >= 3 ? SPIN_FRICTION : ROLL_FRICTION) * h);
      w[0] *= k;
      w[1] *= k;
      w[2] *= k;
    }

    p[0] += v[0] * h;
    p[1] += v[1] * h;
    p[2] += v[2] * h;
    // q += h/2 * (w, 0) * q
    const [qx, qy, qz, qw] = q;
    const [wx, wy, wz] = w;
    q[0] += 0.5 * h * (wx * qw + wy * qz - wz * qy);
    q[1] += 0.5 * h * (-wx * qz + wy * qw + wz * qx);
    q[2] += 0.5 * h * (wx * qy - wy * qx + wz * qw);
    q[3] += 0.5 * h * (-wx * qx - wy * qy - wz * qz);
    const len = Math.hypot(q[0], q[1], q[2], q[3]);
    for (let i = 0; i < 4; i++) q[i] /= len;

    // Push whatever sank below the floor back out of it.
    let lowest = 0;
    for (let i = 0; i < this.pointCount; i++) {
      rotate(q, points[i * 3], points[i * 3 + 1], points[i * 3 + 2], r);
      lowest = Math.min(lowest, p[1] + r[1]);
    }
    if (lowest < 0) p[1] -= lowest * 0.8;
  }

  /**
   * Inverse of the mass the contact at `this.r` presents along direction n:
   * 1/m + n . ((I^-1 (r x n)) x r). Leaves I^-1 (r x n) in `this.b`.
   */
  private effectiveMass(nx: number, ny: number, nz: number): number {
    const { r, a, b } = this;
    a[0] = r[1] * nz - r[2] * ny;
    a[1] = r[2] * nx - r[0] * nz;
    a[2] = r[0] * ny - r[1] * nx;
    this.applyInverseInertia(a, b);
    const cx = b[1] * r[2] - b[2] * r[1];
    const cy = b[2] * r[0] - b[0] * r[2];
    const cz = b[0] * r[1] - b[1] * r[0];
    return this.invMass + cx * nx + cy * ny + cz * nz;
  }

  /** Applies impulse j at the contact in `this.r`. */
  private applyImpulse(jx: number, jy: number, jz: number): void {
    const { r, a, b, v, w } = this;
    v[0] += jx * this.invMass;
    v[1] += jy * this.invMass;
    v[2] += jz * this.invMass;
    a[0] = r[1] * jz - r[2] * jy;
    a[1] = r[2] * jx - r[0] * jz;
    a[2] = r[0] * jy - r[1] * jx;
    this.applyInverseInertia(a, b);
    w[0] += b[0];
    w[1] += b[1];
    w[2] += b[2];
  }

  /** out = R diag(invInertia) R^T x, the world-space inverse inertia applied to x. */
  private applyInverseInertia(x: Float64Array, out: Float64Array): void {
    const q = this.q;
    rotate(q, x[0], x[1], x[2], out, true);
    out[0] *= this.invInertia[0];
    out[1] *= this.invInertia[1];
    out[2] *= this.invInertia[2];
    rotate(q, out[0], out[1], out[2], out);
  }
}

/** Rotates (x, y, z) by quaternion q (or by its inverse) into out. */
export function rotate(
  q: ArrayLike<number>,
  x: number,
  y: number,
  z: number,
  out: Float64Array,
  inverse = false,
): void {
  const s = inverse ? -1 : 1;
  const qx = q[0] * s;
  const qy = q[1] * s;
  const qz = q[2] * s;
  const qw = q[3];
  // t = 2 (q.xyz x v); v' = v + w t + q.xyz x t
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  out[0] = x + qw * tx + (qy * tz - qz * ty);
  out[1] = y + qw * ty + (qz * tx - qx * tz);
  out[2] = z + qw * tz + (qx * ty - qy * tx);
}
