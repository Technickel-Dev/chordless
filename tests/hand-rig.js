/**
 * Anatomical hand rig for driving IWER's emulated hands frame by frame.
 * Loaded into the page through Vite, so it uses the app's own fretboard
 * geometry. Everything is laid out in guitar space (see
 * src/guitar/geometry.ts) and converted to IWER's wrist-relative hand pose.
 *
 * The hand is a real one: knuckles a fixed hand-width apart, fingers and
 * thumb with real bone lengths that never stretch, and joints that only
 * bend within human limits. Each finger reaches its fingertip target by
 * choosing a posture, from fingertip upright (pressing a string) to finger
 * straight, that keeps every joint in range; fingers fan out from the
 * knuckles to reach frets further apart than the hand is wide.
 */

import { fretX, GUITAR, stringSpan, stringY } from '/src/guitar/geometry.ts';

export const FINGERS = ['index', 'middle', 'ring', 'pinky'];

/** Proximal, intermediate and distal (to the tip) bone lengths, metres. */
export const BONES = {
  index: [0.045, 0.026, 0.021],
  middle: [0.05, 0.03, 0.022],
  ring: [0.047, 0.029, 0.021],
  pinky: [0.036, 0.021, 0.019],
  thumb: [0.046, 0.032, 0.025],
};

/** Knuckle positions across the hand (towards the index) and back from the middle knuckle. */
const KNUCKLES = {
  index: { across: 0.027, back: 0.003 },
  middle: { across: 0.008, back: 0 },
  ring: { across: -0.01, back: 0.004 },
  pinky: { across: -0.026, back: 0.013 },
};
/** Wrist to middle knuckle. */
const PALM_LENGTH = 0.088;

/** Flexion limits in degrees: knuckle (MCP), middle joint (PIP), end joint (DIP). */
export const LIMITS = { mcp: [-25, 95], pip: [-2, 115], dip: [-5, 85] };

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
const DEG = 180 / Math.PI;

/** A point inside fret `n`'s space; `fraction` 0 is at the fret wire, 1 at the wire before it. */
export function slotX(n, fraction = 0.35) {
  return fretX(n) + fraction * (fretX(n - 1) - fretX(n));
}

/** Where a fingertip presses string `s` at fret `n`. */
export function pressPoint(s, n, fraction = 0.35, depth = 0.003) {
  const x = slotX(n, fraction);
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
function frame(position, forward, back) {
  const z = norm(scale(forward, -1));
  let y = sub(back, scale(z, dot(back, z)));
  if (len(y) < 1e-6) y = v(0, 0, 1);
  y = norm(y);
  return { position, x: cross(y, z), y, z };
}

/** Two-bone IK: the middle joint between `a` and `c`, bulging toward `hint`. */
function bend(a, c, l1, l2, hint) {
  const d = sub(c, a);
  const dist = Math.min(len(d), (l1 + l2) * 0.9999);
  const u = norm(d);
  let w = sub(hint, scale(u, dot(hint, u)));
  w = norm(len(w) < 1e-6 ? v(0, 0, 1) : w);
  const cosA = Math.min(1, Math.max(-1, (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist)));
  const sinA = Math.sqrt(1 - cosA * cosA);
  return add(a, add(scale(u, l1 * cosA), scale(w, l1 * sinA)));
}

/**
 * Signed bend from bone direction `u` to `w` about the hand's hinge axis
 * (along the knuckle line), positive towards the palm, in degrees.
 */
function flexion(u, w, hinge) {
  return Math.atan2(dot(cross(u, w), hinge), dot(u, w)) * DEG;
}

/** The axis fingers bend about: rotating forward about it turns toward the palm. */
function hingeOf(forward, palm) {
  return norm(cross(forward, palm));
}

/** How far each joint angle is outside its limit, in degrees (0 when all are in range). */
function violation(mcp, pip, dip) {
  const over = (a, [lo, hi]) => Math.max(0, lo - a, a - hi);
  return over(mcp, LIMITS.mcp) + over(pip, LIMITS.pip) + over(dip, LIMITS.dip);
}

/**
 * Solves one finger. `pressing` (0..1) prefers an upright fingertip, as on
 * a string; otherwise the finger takes a relaxed curl, its end joint
 * bending about two thirds as much as its middle joint.
 */
function solveFinger(name, metacarpal, knuckle, target, hand, pressing, flatToward) {
  const [l1, l2, l3] = BONES[name];
  const { back, upright } = hand;
  const hinge = hingeOf(hand.forward, hand.palm);

  // A fingertip can only be where the straight finger reaches.
  let tip = target;
  const reach = (l1 + l2 + l3) * 0.97;
  const d = sub(target, knuckle);
  if (len(d) > reach) {
    // Keep a hovering tip's height (pulling straight toward the knuckle,
    // which is below the fretboard, would dip it into the strings).
    const across = Math.hypot(d[0], d[1]);
    const keep = Math.sqrt(Math.max(0, reach * reach - d[2] * d[2]));
    tip = across > 1e-6 && keep > 0 ? [knuckle[0] + (d[0] * keep) / across, knuckle[1] + (d[1] * keep) / across, target[2]] : add(knuckle, scale(norm(d), reach));
  }

  const forward = norm(sub(knuckle, metacarpal));
  let best = null;
  // Postures from fingertip curled a little under (s < 0), through upright
  // (s = 0), to finger straight (s = 1).
  const straight = norm(sub(knuckle, tip));
  const steps = Array.from({ length: 17 }, (_, i) => -0.6 + (1.6 * i) / 16);
  const directions = flatToward
    ? [norm(sub(flatToward, tip))]
    : steps.map((s) => norm(add(upright, scale(sub(straight, upright), s))));
  for (let i = 0; i < directions.length; i++) {
    const dip = add(tip, scale(directions[i], l3));
    const span = len(sub(dip, knuckle));
    if (span > l1 + l2 - 1e-4 || span < Math.abs(l1 - l2) + 1e-4) continue;
    const pip = bend(knuckle, dip, l1, l2, back);
    const mcp = flexion(forward, norm(sub(pip, knuckle)), hinge);
    const pipA = flexion(norm(sub(pip, knuckle)), norm(sub(dip, pip)), hinge);
    const dipA = flexion(norm(sub(dip, pip)), norm(sub(tip, dip)), hinge);
    const bad = violation(mcp, pipA, dipA);
    const style = pressing * Math.abs(steps[i] ?? 0) + (1 - pressing) * Math.abs(dipA - 0.66 * pipA) / 60;
    const cost = bad * 10 + style;
    if (!best || cost < best.cost) best = { cost, pip, dip, mcp, pipA, dipA, bad };
  }
  if (!best) {
    // Out of reach in every posture: point the finger straight at the tip.
    const dir = norm(sub(tip, knuckle));
    const pip = add(knuckle, scale(dir, l1));
    const dip = add(pip, scale(dir, l2));
    tip = add(dip, scale(dir, l3));
    best = { pip, dip, bad: 0 };
  }
  const chain = [metacarpal, knuckle, best.pip, best.dip, tip];
  const names = ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'];
  const joints = {};
  chain.forEach((p, i) => {
    const fwd = i < chain.length - 1 ? sub(chain[i + 1], p) : sub(p, chain[i - 1]);
    joints[`${name}-finger-${names[i]}`] = frame(p, norm(fwd), back);
  });
  return joints;
}

/** The thumb: a fixed metacarpal direction, then two bones that reach for the tip target. */
function solveThumb(base, metacarpalDir, target, hand) {
  const [lm, lp, ld] = BONES.thumb;
  const proximal = add(base, scale(metacarpalDir, lm));
  let tip = target;
  const d = sub(target, proximal);
  if (len(d) > (lp + ld) * 0.97) tip = add(proximal, scale(norm(d), (lp + ld) * 0.97));
  if (len(d) < Math.abs(lp - ld) + 0.002) tip = add(proximal, scale(norm(d), Math.abs(lp - ld) + 0.002));
  const distal = bend(proximal, tip, lp, ld, hand.back);
  const chain = [base, proximal, distal, tip];
  const names = ['metacarpal', 'phalanx-proximal', 'phalanx-distal', 'tip'];
  const joints = {};
  chain.forEach((p, i) => {
    const fwd = i < chain.length - 1 ? sub(chain[i + 1], p) : sub(p, chain[i - 1]);
    joints[`thumb-${names[i]}`] = frame(p, norm(fwd), hand.back);
  });
  return joints;
}

/**
 * A hand's basis and knuckles from its wrist, forward (to the middle
 * knuckle) and index side. Left and right hands are mirror images, so the
 * palm is on opposite sides of forward x index for each.
 */
function handBasis(wrist, forward, indexSide, right) {
  const lateral = norm(sub(indexSide, scale(forward, dot(indexSide, forward))));
  const palm = norm(right ? cross(lateral, forward) : cross(forward, lateral));
  const back = scale(palm, -1);
  const knuckles = {};
  const metacarpals = {};
  for (const f of FINGERS) {
    const k = KNUCKLES[f];
    knuckles[f] = add(add(wrist, scale(forward, PALM_LENGTH - k.back)), scale(lateral, k.across));
    metacarpals[f] = add(add(wrist, scale(forward, 0.014)), scale(lateral, k.across * 0.45));
  }
  return { wrist, forward, lateral, palm, back, knuckles, metacarpals };
}

/**
 * Keeps resting fingers from overlapping: in finger order along the hand,
 * a finger that is not pressing stays at least `gap` from its neighbours.
 */
function spaceFreeFingers(tips, pressedOf, axis, gap = 0.017) {
  const along = (p) => dot(p, axis);
  const moveTo = (p, value) => add(p, scale(axis, value - along(p)));
  for (let k = 1; k < 4; k++) {
    const f = FINGERS[k];
    const prev = FINGERS[k - 1];
    if (!pressedOf(f) && along(tips[f]) > along(tips[prev]) - gap) tips[f] = moveTo(tips[f], along(tips[prev]) - gap);
  }
  for (let k = 2; k >= 0; k--) {
    const f = FINGERS[k];
    const next = FINGERS[k + 1];
    if (!pressedOf(f) && along(tips[f]) < along(tips[next]) + gap) tips[f] = moveTo(tips[f], along(tips[next]) + gap);
  }
}

/**
 * Fretting hand. `position` is the (fractional) fret the index covers;
 * `tips` maps each finger to its fingertip target in guitar space;
 * `flat` maps a finger to a point its last joint lies flat toward (a barre).
 */
export function leftHand({ position, tips, flat = {} }) {
  const hx = (slotX(position) + slotX(position + 3)) / 2;
  const edge = -stringSpan(hx) / 2;
  const pressingOf = (f) => Math.min(1, Math.max(0, (GUITAR.stringZ + 0.02 - tips[f][2]) / 0.02));
  // The hand moves across the neck with the strings its fingers work on, as
  // a player's does: knuckles about 4.7 cm toward the treble side of the
  // fingertips and 4.5 cm in front of the strings, wrist down beside the
  // neck. That puts a pressing finger in its natural curve, the bend shared
  // between all three joints (roughly 40, 75 and 30 degrees).
  let weight = 0;
  let across = 0;
  for (const f of FINGERS) {
    const w = 0.3 + pressingOf(f);
    weight += w;
    across += w * tips[f][1];
  }
  const middleKnuckle = v(hx, Math.max(edge - 0.06, across / weight - 0.047), GUITAR.stringZ + 0.042);
  const forward = norm(v(0, 0.72, 0.69));
  const wrist = sub(middleKnuckle, scale(forward, PALM_LENGTH));
  const hand = handBasis(wrist, forward, v(1, 0, 0), false);
  const targets = { ...tips };
  spaceFreeFingers(targets, (f) => pressingOf(f) > 0.5, v(1, 0, 0));
  const joints = { wrist: frame(wrist, hand.forward, hand.back) };
  for (const f of FINGERS) {
    const toHand = norm(v(0, hand.knuckles[f][1] - targets[f][1], 0));
    const upright = norm(add(v(0, 0, 1), scale(toHand, 0.35)));
    Object.assign(
      joints,
      solveFinger(f, hand.metacarpals[f], hand.knuckles[f], targets[f], { ...hand, upright }, pressingOf(f), flat[f]),
    );
  }
  // Thumb behind the neck (or as far round it as it reaches), on the nut side.
  const thumbBase = add(add(wrist, scale(hand.lateral, 0.018)), scale(hand.forward, 0.012));
  const thumbDir = norm(add(add(scale(hand.lateral, 0.55), scale(hand.forward, 0.7)), scale(hand.palm, 0.45)));
  const thumbTip = v(hx + 0.02, Math.min(edge + 0.022, wrist[1] + 0.075), GUITAR.boardTopZ - 0.036);
  Object.assign(joints, solveThumb(thumbBase, thumbDir, thumbTip, hand));
  return joints;
}

/**
 * Picking hand over the sound hole: the forearm rests on the body's upper
 * edge and the fingers hang down to the strings. `wrist` is the wrist
 * position; `indexTip` the index fingertip target. The thumb rests on the
 * strings toward the low E, the other fingers curl loosely.
 */
export function rightHand({ wrist, indexTip }) {
  // Palm down over the strings, the back of the hand sloping down toward
  // the treble strings; the thumb and index are on the neck side. A curled
  // fingertip's last joint leans away from the hand.
  const hand = handBasis(wrist, norm(v(0, -0.9, -0.43)), v(1, 0, 0), true);
  const upright = norm(v(0, -0.3, 1));
  const joints = { wrist: frame(wrist, hand.forward, hand.back) };
  for (const f of FINGERS) {
    const k = hand.knuckles[f];
    // Resting fingers hang relaxed beside the index, just above the strings.
    const rest = v(k[0], k[1] - 0.04, Math.max(GUITAR.stringZ + 0.015, k[2] - 0.05));
    const target = f === 'index' ? indexTip : rest;
    Object.assign(
      joints,
      solveFinger(f, hand.metacarpals[f], k, target, { ...hand, upright }, f === 'index' ? 1 : 0, null),
    );
  }
  const thumbBase = add(add(wrist, scale(hand.lateral, 0.018)), scale(hand.forward, 0.012));
  const thumbDir = norm(add(add(scale(hand.lateral, 0.6), scale(hand.forward, 0.55)), scale(hand.palm, 0.45)));
  // The thumb floats over the bass strings.
  const thumbTip = v(wrist[0] + 0.05, stringY(0, wrist[0] + 0.05) + 0.02, GUITAR.stringZ + 0.03);
  Object.assign(joints, solveThumb(thumbBase, thumbDir, thumbTip, hand));
  return joints;
}

/**
 * Measures how natural a hand pose is: the largest bone-length error, the
 * closest two different fingers (or a finger and the thumb) come, and the
 * largest joint-limit violation.
 */
export function measureHand(joints) {
  const chainOf = (f) =>
    f === 'thumb'
      ? ['metacarpal', 'phalanx-proximal', 'phalanx-distal', 'tip'].map((n) => joints[`thumb-${n}`].position)
      : ['phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'].map((n) => joints[`${f}-finger-${n}`].position);
  let boneError = 0;
  for (const f of [...FINGERS, 'thumb']) {
    const c = chainOf(f);
    const lengths = f === 'thumb' ? BONES.thumb : BONES[f];
    for (let i = 0; i < 3; i++) boneError = Math.max(boneError, Math.abs(len(sub(c[i + 1], c[i])) - lengths[i]));
  }
  // Fingers as points along their bones (tips included, knuckles excluded).
  const samples = (c) => {
    const pts = [];
    for (let i = 0; i < c.length - 1; i++) for (let s = i === 0 ? 0.5 : 0; s <= 1; s += 0.25) pts.push(lerp(c[i], c[i + 1], s));
    return pts;
  };
  const all = [...FINGERS, 'thumb'].map((f) => ({ f, pts: samples(chainOf(f)) }));
  let closest = Infinity;
  let pair = '';
  for (let a = 0; a < all.length; a++) {
    for (let b = a + 1; b < all.length; b++) {
      for (const p of all[a].pts) {
        for (const q of all[b].pts) {
          const dist = len(sub(p, q));
          if (dist < closest) {
            closest = dist;
            pair = `${all[a].f}/${all[b].f}`;
          }
        }
      }
    }
  }
  // Joint angles, with the palm as the bend direction.
  const w = joints.wrist;
  const hinge = hingeOf(scale(w.z, -1), scale(w.y, -1));
  let worstAngle = 0;
  let worstJoint = '';
  for (const f of FINGERS) {
    const meta = joints[`${f}-finger-metacarpal`].position;
    const [k, p, d, t] = chainOf(f);
    const u0 = norm(sub(k, meta));
    const u1 = norm(sub(p, k));
    const u2 = norm(sub(d, p));
    const u3 = norm(sub(t, d));
    const bad = violation(flexion(u0, u1, hinge), flexion(u1, u2, hinge), flexion(u2, u3, hinge));
    if (bad > worstAngle) {
      worstAngle = bad;
      worstJoint = f;
    }
  }
  return { boneError, closest, pair, worstAngle, worstJoint };
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
