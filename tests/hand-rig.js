/**
 * Anatomical hand rig for driving IWER's emulated hands frame by frame.
 * Loaded into the page through Vite, so it uses the app's own fretboard
 * geometry. Everything is laid out in guitar space (see
 * src/guitar/geometry.ts) and converted to IWER's wrist-relative hand pose.
 *
 * Fingers have real bone lengths. Given a fingertip target, a finger's
 * joints are solved like a real one: the last joint stands nearly upright
 * over a pressing tip (or lies flat in a barre), and the two joints behind
 * it bend at the middle knuckle, which arches away from the palm.
 */

import { fretX, GUITAR, stringSpan, stringY } from '/src/guitar/geometry.ts';

export const FINGERS = ['index', 'middle', 'ring', 'pinky'];

/** Proximal, intermediate and distal (to the tip) bone lengths, metres. */
const BONES = {
  index: [0.045, 0.026, 0.021],
  middle: [0.05, 0.03, 0.022],
  ring: [0.047, 0.029, 0.021],
  pinky: [0.036, 0.021, 0.019],
};
const JOINT_RADIUS = { tip: 0.0066, distal: 0.0075, intermediate: 0.0085, proximal: 0.0095, metacarpal: 0.011 };

export const v = (x, y, z) => [x, y, z];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const lerp = (a, b, t) => add(a, scale(sub(b, a), t));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => scale(a, 1 / (len(a) || 1));

/** Fret slot centre for a (possibly fractional) fret number: just behind the wire. */
export function slotX(n) {
  return fretX(n) + 0.35 * (fretX(n - 1) - fretX(n));
}

/** Where a fingertip presses string `s` at fret `n`. */
export function pressPoint(s, n, depth = 0.003) {
  const x = slotX(n);
  return v(x, stringY(s, x), GUITAR.stringZ - depth);
}

/** Midpoint between two strings (gap g lies between strings g-1 and g). */
export function gapY(g, x = 0) {
  const half = (stringSpan(x) / 5) * 0.5;
  if (g <= 0) return stringY(0, x) + half;
  if (g >= 6) return stringY(5, x) - half;
  return (stringY(g - 1, x) + stringY(g, x)) / 2;
}

/**
 * Joint frame for a bone pointing along `forward`: WebXR joints look down
 * -Z along the bone with +Y out of the back of the hand.
 */
function frame(position, forward, lateral) {
  const z = norm(scale(forward, -1));
  let y = cross(lateral, forward);
  if (len(y) < 1e-6) y = v(0, 0, 1);
  y = norm(sub(y, scale(z, dot(y, z))));
  return { position, x: cross(y, z), y, z };
}

/** Two-bone IK: the middle joint between `a` and `c`, bulging toward `hint`. */
function bend(a, c, l1, l2, hint) {
  const d = sub(c, a);
  const dist = Math.min(len(d), (l1 + l2) * 0.999);
  const u = norm(d);
  let w = sub(hint, scale(u, dot(hint, u)));
  w = norm(len(w) < 1e-6 ? v(0, 0, 1) : w);
  const cosA = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  return add(a, add(scale(u, l1 * cosA), scale(w, l1 * sinA)));
}

/**
 * Pulls `tip` in so the finger can reach it from `knuckle`, keeping the
 * tip's height: pulling straight toward the knuckle (below the fretboard)
 * would dip a hovering finger into the strings.
 */
function reachable(knuckle, tip, maxReach) {
  const d = sub(tip, knuckle);
  if (len(d) <= maxReach) return tip;
  const across = Math.hypot(d[0], d[1]);
  const keep = Math.sqrt(Math.max(0, maxReach * maxReach - d[2] * d[2]));
  if (across < 1e-6 || keep <= 0) return add(knuckle, scale(norm(d), maxReach));
  const s = keep / across;
  return [knuckle[0] + d[0] * s, knuckle[1] + d[1] * s, tip[2]];
}

/**
 * A finger chain from the knuckle to the tip.
 * `flatToward`: lay the last joint flat toward this point (a barre).
 */
function finger(name, metacarpal, knuckle, tipTarget, { flatToward, upright, curlHint, lateral }) {
  const [l1, l2, l3] = BONES[name];
  const tip = reachable(knuckle, tipTarget, l1 + l2 + l3 * 0.95);
  let dip;
  if (flatToward) {
    dip = add(tip, scale(norm(sub(flatToward, tip)), l3));
  } else {
    // The last bone stands up from the tip, leaning back toward the knuckle
    // across the strings only: leaning along the neck would put the pad
    // over the next fret.
    const back = norm(v(0, knuckle[1] - tip[1], knuckle[2] - tip[2]));
    dip = add(tip, scale(norm(add(scale(upright, 1), scale(back, 0.35))), l3));
  }
  const pip = bend(knuckle, dip, l1, l2, curlHint);
  const chain = [metacarpal, knuckle, pip, dip, tip];
  const names = ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'];
  const joints = {};
  chain.forEach((p, i) => {
    const forward = i < chain.length - 1 ? sub(chain[i + 1], p) : sub(p, chain[i - 1]);
    joints[`${name}-finger-${names[i]}`] = frame(p, norm(forward), lateral);
  });
  return joints;
}

function thumb(points, lateral) {
  const joints = {};
  ['metacarpal', 'phalanx-proximal', 'phalanx-distal', 'tip'].forEach((name, i) => {
    const forward = i < points.length - 1 ? sub(points[i + 1], points[i]) : sub(points[i], points[i - 1]);
    joints[`thumb-${name}`] = frame(points[i], norm(forward), lateral);
  });
  return joints;
}

/**
 * Fretting hand. `position` is the (fractional) fret the index covers;
 * `tips` maps each finger to its fingertip target in guitar space;
 * `flat` maps a finger to a point its last joint lies flat toward.
 */
export function leftHand({ position, tips, flat = {} }) {
  const edge = -stringSpan(slotX(position + 1.5)) / 2;
  const knuckles = {};
  FINGERS.forEach((f, k) => {
    knuckles[f] = v(slotX(position + k * 0.95), edge - 0.011, GUITAR.boardTopZ - 0.012);
  });
  const hx = (knuckles.index[0] + knuckles.pinky[0]) / 2;
  const wrist = v(hx - 0.004, edge - 0.092, GUITAR.boardTopZ - 0.034);
  const lateral = v(1, 0, 0);
  const joints = { wrist: frame(wrist, norm(sub(knuckles.middle, wrist)), lateral) };
  for (const f of FINGERS) {
    Object.assign(
      joints,
      finger(f, lerp(wrist, knuckles[f], 0.18), knuckles[f], tips[f], {
        flatToward: flat[f],
        upright: v(0, 0, 1),
        curlHint: v(0, -0.25, 1),
        lateral,
      }),
    );
  }
  // Thumb behind the neck, on the nut side of the hand.
  Object.assign(
    joints,
    thumb(
      [
        add(wrist, v(0.016, 0.018, 0.004)),
        add(wrist, v(0.026, 0.045, -0.006)),
        v(hx + 0.016, edge + 0.008, GUITAR.boardTopZ - 0.04),
        v(hx + 0.012, edge + 0.03, GUITAR.boardTopZ - 0.042),
      ],
      v(0, 0, -1),
    ),
  );
  return joints;
}

/**
 * Picking hand over the sound hole: the forearm rests on the body's upper
 * edge and the fingers hang down to the strings. `wrist` is the wrist
 * position; `indexTip` the index fingertip target. The thumb rests on the
 * top near the low E, the other fingers curl loosely.
 */
export function rightHand({ wrist, indexTip }) {
  const lateral = v(-1, 0, 0);
  const knuckleBase = add(wrist, v(0.0, -0.06, -0.01));
  const knuckles = {
    index: add(knuckleBase, v(0.012, 0, 0)),
    middle: add(knuckleBase, v(-0.006, 0.003, 0)),
    ring: add(knuckleBase, v(-0.023, 0.006, 0.002)),
    pinky: add(knuckleBase, v(-0.038, 0.01, 0.006)),
  };
  const joints = { wrist: frame(wrist, norm(sub(knuckles.middle, wrist)), lateral) };
  const curl = v(0, 0.35, 1);
  for (const f of FINGERS) {
    const k = knuckles[f];
    const tip =
      f === 'index'
        ? indexTip
        : add(k, v(0, -0.028 - (f === 'pinky' ? 0 : 0.006), GUITAR.stringZ + 0.03 - k[2]));
    Object.assign(
      joints,
      finger(f, lerp(wrist, k, 0.18), k, tip, {
        upright: norm(v(0, 0.6, 1)),
        curlHint: curl,
        lateral,
      }),
    );
  }
  const thumbTip = v(wrist[0] + 0.045, stringY(0, wrist[0] + 0.045) + 0.012, GUITAR.stringZ + 0.004);
  Object.assign(
    joints,
    thumb(
      [
        add(wrist, v(0.016, -0.012, -0.008)),
        add(wrist, v(0.03, -0.03, -0.02)),
        lerp(add(wrist, v(0.03, -0.03, -0.02)), thumbTip, 0.55),
        thumbTip,
      ],
      v(0, 0, 1),
    ),
  );
  return joints;
}

/** Column-major 4x4 from a joint frame. */
const toMatrix = (f) => [...f.x, 0, ...f.y, 0, ...f.z, 0, ...f.position, 1];
/** IWER stores right-hand poses as mirrored left-hand ones: S M S, S = diag(-1, 1, 1). */
const MIRROR = [1, -1, -1, 0, -1, 1, 1, 0, -1, 1, 1, 0, -1, 1, 1, 1];

function kindOf(name) {
  if (name.endsWith('tip')) return 'tip';
  if (name.includes('distal')) return 'distal';
  if (name.includes('intermediate')) return 'intermediate';
  if (name.includes('proximal')) return 'proximal';
  return 'metacarpal';
}

/**
 * Writes `joints` (guitar space) into `pose` as IWER expects (relative to
 * the wrist, mirrored for a right hand) and returns the wrist's world
 * position and rotation axes for pinning the hand.
 */
export function applyPose(pose, joints, rootMatrix, right) {
  const w = joints.wrist;
  const toWrist = (a) => [dot(a, w.x), dot(a, w.y), dot(a, w.z)];
  const write = (target, rel) => {
    const m = toMatrix(rel);
    for (let i = 0; i < 16; i++) target[i] = right ? m[i] * MIRROR[i] : m[i];
  };
  for (const [name, f] of Object.entries(joints)) {
    let entry = pose.jointTransforms[name];
    if (!entry) entry = pose.jointTransforms[name] = { offsetMatrix: new Float32Array(16), radius: 0.008 };
    entry.radius = JOINT_RADIUS[kindOf(name)];
    write(entry.offsetMatrix, {
      position: toWrist(sub(f.position, w.position)),
      x: toWrist(f.x),
      y: toWrist(f.y),
      z: toWrist(f.z),
    });
  }
  const grip = lerp(w.position, joints['middle-finger-phalanx-proximal'].position, 0.55);
  pose.gripOffsetMatrix ??= new Float32Array(16);
  write(pose.gripOffsetMatrix, { position: toWrist(sub(grip, w.position)), x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] });

  const m = rootMatrix;
  const point = (p) => [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
  const dir = (d) => [
    m[0] * d[0] + m[4] * d[1] + m[8] * d[2],
    m[1] * d[0] + m[5] * d[1] + m[9] * d[2],
    m[2] * d[0] + m[6] * d[1] + m[10] * d[2],
  ];
  return { position: point(w.position), x: dir(w.x), y: dir(w.y), z: dir(w.z) };
}

/** Quaternion [x, y, z, w] from orthonormal basis columns. */
export function quatFromAxes(x, y, z) {
  const [m00, m10, m20] = x;
  const [m01, m11, m21] = y;
  const [m02, m12, m22] = z;
  const trace = m00 + m11 + m22;
  let qx;
  let qy;
  let qz;
  let qw;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    qw = 0.25 / s;
    qx = (m21 - m12) * s;
    qy = (m02 - m20) * s;
    qz = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    qw = (m21 - m12) / s;
    qx = 0.25 * s;
    qy = (m01 + m10) / s;
    qz = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    qw = (m02 - m20) / s;
    qx = (m01 + m10) / s;
    qy = 0.25 * s;
    qz = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    qw = (m10 - m01) / s;
    qx = (m02 + m20) / s;
    qy = (m12 + m21) / s;
    qz = 0.25 * s;
  }
  const n = Math.hypot(qx, qy, qz, qw);
  return [qx / n, qy / n, qz / n, qw / n];
}
