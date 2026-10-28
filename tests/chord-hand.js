/**
 * Builds left-hand poses that fret real chord shapes, for driving IWER's
 * emulated hand in the e2e test. Loaded into the page through Vite so it
 * uses the app's own fretboard geometry.
 *
 * Joints are laid out in guitar space (see src/guitar/geometry.ts) like a
 * real fretting hand: wrist below the neck, knuckles under the treble edge,
 * each fretting finger arching over the board and landing just behind its
 * fret with the last joint near vertical, the thumb behind the neck, and
 * unused fingers curled clear of the strings. A barre lays the index flat
 * across every string.
 */

import { fretX, GUITAR, stringSpan, stringY } from '/src/guitar/geometry.ts';

/**
 * Chord shapes: which finger frets which [string, fret] (string 0 = low E),
 * the lowest string to strum, and what the app should read.
 */
export const CHORDS = {
  C: { fingers: { ring: [1, 3], middle: [2, 2], index: [4, 1] }, strumFrom: 1, frets: '0 3 2 0 1 0' },
  G: { fingers: { middle: [0, 3], index: [1, 2], ring: [5, 3] }, strumFrom: 0, frets: '3 2 0 0 0 3' },
  D: { fingers: { index: [3, 2], ring: [4, 3], middle: [5, 2] }, strumFrom: 2, frets: '0 0 0 2 3 2' },
  Am: { fingers: { middle: [2, 2], ring: [3, 2], index: [4, 1] }, strumFrom: 1, frets: '0 0 2 2 1 0' },
  Em: { fingers: { middle: [1, 2], ring: [2, 2] }, strumFrom: 0, frets: '0 2 2 0 0 0' },
  E: { fingers: { middle: [1, 2], ring: [2, 2], index: [3, 1] }, strumFrom: 0, frets: '0 2 2 1 0 0' },
  F: { barre: 1, fingers: { ring: [1, 3], pinky: [2, 3], middle: [3, 2] }, strumFrom: 0, frets: '1 3 3 2 1 1' },
};

const FINGERS = ['index', 'middle', 'ring', 'pinky'];
/** Knuckle spacing along the neck, index nearest the nut. */
const KNUCKLE_X = { index: 0.024, middle: 0.007, ring: -0.01, pinky: -0.026 };
const JOINT_RADIUS = { tip: 0.0066, distal: 0.0075, intermediate: 0.0085, proximal: 0.0095, metacarpal: 0.011 };

const v = (x, y, z) => [x, y, z];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const lerp = (a, b, t) => add(a, scale(sub(b, a), t));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => scale(a, 1 / Math.hypot(...a));

/** Where a fingertip presses string `s` at fret `n`: just behind the fret wire. */
function pressPoint(s, n) {
  const x = fretX(n) + 0.25 * (fretX(n - 1) - fretX(n));
  return v(x, stringY(s, x), GUITAR.stringZ - 0.003);
}

/**
 * Joint frame for a bone pointing along `forward`: WebXR joints look down
 * -Z along the bone with +Y out of the back of the hand.
 */
function frame(position, forward, lateral = v(1, 0, 0)) {
  const z = norm(scale(forward, -1));
  let y = cross(lateral, forward);
  if (Math.hypot(...y) < 1e-6) y = v(0, 0, 1);
  y = norm(sub(y, scale(z, dot(y, z))));
  const x = cross(y, z);
  return { position, x, y, z };
}

/**
 * Left-hand joints (guitar space) fretting `shape`, keyed by WebXR joint name.
 */
function chordJoints(shape) {
  const fretted = Object.entries(shape.fingers).map(([finger, [s, n]]) => [finger, pressPoint(s, n)]);
  if (shape.barre) fretted.push(['index', pressPoint(0, shape.barre)]);
  const hx = fretted.reduce((sum, [, p]) => sum + p[0], 0) / fretted.length;
  const edge = -stringSpan(hx) / 2;

  const wrist = v(hx - 0.004, edge - 0.095, GUITAR.boardTopZ - 0.035);
  const joints = { wrist: frame(wrist, norm(sub(v(hx, edge - 0.012, 0), wrist))) };

  for (const finger of FINGERS) {
    const target = Object.fromEntries(fretted)[finger];
    const knuckle = v(
      target ? (target[0] + hx + KNUCKLE_X[finger]) / 2 : hx + KNUCKLE_X[finger],
      edge - 0.012,
      GUITAR.boardTopZ - 0.016,
    );
    let pip;
    let dip;
    let tip;
    if (finger === 'index' && shape.barre) {
      // Flat across all six strings: tip past the low E, base past the high E.
      const x = pressPoint(0, shape.barre)[0];
      const z = GUITAR.stringZ - 0.003;
      tip = v(x, stringY(0, x) + 0.004, z);
      dip = v(x, stringY(1, x) - 0.002, z);
      pip = v(x, stringY(3, x) - 0.003, z);
      knuckle[0] = x;
      knuckle[1] = stringY(5, x) - 0.012;
      knuckle[2] = z - 0.002;
    } else if (target) {
      // Arch over the strings; the last joint stands almost straight up.
      tip = target;
      const towardKnuckle = norm(v(0, knuckle[1] - tip[1], 0));
      dip = add(add(tip, v(0, 0, 0.019)), scale(towardKnuckle, 0.005));
      pip = add(lerp(knuckle, dip, 0.5), v(0, 0, 0.03));
    } else {
      // Unused finger curled beside the neck, well above the strings.
      pip = add(knuckle, v(0, 0.012, 0.035));
      dip = add(pip, v(0, -0.008, 0.012));
      tip = add(dip, v(0, -0.012, -0.004));
    }
    const metacarpal = lerp(wrist, knuckle, 0.18);
    const chain = [metacarpal, knuckle, pip, dip, tip];
    const names = ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'];
    chain.forEach((p, i) => {
      const forward = i < chain.length - 1 ? sub(chain[i + 1], p) : sub(p, chain[i - 1]);
      joints[`${finger}-finger-${names[i]}`] = frame(p, norm(forward));
    });
  }

  // Thumb behind the neck, on the nut side of the hand.
  const thumb = [
    add(wrist, v(0.016, 0.018, 0.004)),
    add(wrist, v(0.026, 0.045, -0.006)),
    v(hx + 0.016, edge + 0.008, GUITAR.boardTopZ - 0.04),
    v(hx + 0.012, edge + 0.03, GUITAR.boardTopZ - 0.042),
  ];
  ['metacarpal', 'phalanx-proximal', 'phalanx-distal', 'tip'].forEach((name, i) => {
    const forward = i < thumb.length - 1 ? sub(thumb[i + 1], thumb[i]) : sub(thumb[i], thumb[i - 1]);
    joints[`thumb-${name}`] = frame(thumb[i], norm(forward), v(0, 0, -1));
  });
  return joints;
}

/** Column-major 4x4 from a joint frame. */
const toMatrix = (f) => [...f.x, 0, ...f.y, 0, ...f.z, 0, ...f.position, 1];

/**
 * An IWER HandPose for `shape`, plus where to put the wrist in the world.
 * Joint matrices are relative to the wrist, so the wrist's own is identity.
 * `rootMatrix` is the guitar's matrixWorld (column-major array).
 */
export function chordHandPose(shape, rootMatrix) {
  const joints = chordJoints(shape);
  const w = joints.wrist;
  // Wrist-relative transform: R_w^T (p - w), R_w^T R_j.
  const toWrist = (a) => [dot(a, w.x), dot(a, w.y), dot(a, w.z)];
  const jointTransforms = {};
  for (const [name, f] of Object.entries(joints)) {
    const rel = {
      position: toWrist(sub(f.position, w.position)),
      x: toWrist(f.x),
      y: toWrist(f.y),
      z: toWrist(f.z),
    };
    const kind = name.endsWith('tip')
      ? 'tip'
      : name.includes('distal')
        ? 'distal'
        : name.includes('intermediate')
          ? 'intermediate'
          : name.includes('proximal')
            ? 'proximal'
            : 'metacarpal';
    jointTransforms[name] = { offsetMatrix: new Float32Array(toMatrix(rel)), radius: JOINT_RADIUS[kind] };
  }
  // Grip: in the palm, between the wrist and the middle knuckle.
  const grip = lerp(w.position, joints['middle-finger-phalanx-proximal'].position, 0.55);
  const gripOffsetMatrix = new Float32Array(toMatrix({ position: toWrist(sub(grip, w.position)), x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }));

  const m = rootMatrix;
  const toWorldPoint = (p) => [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
  const toWorldDir = (d) => [
    m[0] * d[0] + m[4] * d[1] + m[8] * d[2],
    m[1] * d[0] + m[5] * d[1] + m[9] * d[2],
    m[2] * d[0] + m[6] * d[1] + m[10] * d[2],
  ];
  const [x, y, z] = toWorldPoint(w.position);
  return {
    pose: { jointTransforms, gripOffsetMatrix },
    wrist: {
      position: { x, y, z },
      // IWER's hand directions: fingers along wrist -Z, palm along wrist -Y.
      orientation: { fingers: toWorldDir(scale(w.z, -1)), palm: toWorldDir(scale(w.y, -1)) },
    },
  };
}

/** Registers a custom pose on an IWER hand so set_hand_pose can select it. */
export function registerPose(hand, id, pose) {
  const sym = Object.getOwnPropertySymbols(hand).find((s) => hand[s]?.poses);
  hand[sym].poses[id] = pose;
}
