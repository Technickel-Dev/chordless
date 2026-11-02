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

import { fretAt, fretX, GUITAR, nearestString, STRING_COUNT, stringSpacing, stringSpan, stringY } from '/src/guitar/geometry.ts';
import { PRESS } from '/src/guitar/fretting.ts';

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
/** Tracked joints are the middle of the finger, about this far inside the skin. */
const SKIN = 0.009;
/** Fretting knuckles: how far out from the fretboard's treble edge, and above the strings, at most. */
const KNUCKLE_GAP = 0.012;
const KNUCKLE_HEIGHT = 0.008;
/**
 * Reaching the treble strings the knuckles drop back from the fretboard's
 * edge, up to this far: closer in, a finger is too long for the gap to the
 * high E and hooks over onto it from the bass side, its pad across the B.
 */
const TREBLE_REACH = 0.042;
/** The back of the neck (the neck is about 4 cm deep below the strings). */
const NECK_BACK_Z = -0.028;

/** Half the fretboard's width at x (it widens from nut to body like the model's). */
function neckHalfWidth(x) {
  const t = (x - GUITAR.boardEndX) / (GUITAR.nutX - GUITAR.boardEndX);
  return (GUITAR.neckWidthBody + (GUITAR.neckWidthNut - GUITAR.neckWidthBody) * t) / 2;
}

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


/** How far each joint angle is outside its limit, in degrees (0 when all are in range). */
function violation(mcp, pip, dip) {
  const over = (a, [lo, hi]) => Math.max(0, lo - a, a - hi);
  return over(mcp, LIMITS.mcp) + over(pip, LIMITS.pip) + over(dip, LIMITS.dip);
}

/**
 * How many points of a fingertip's pad (the half of the end bone nearest the
 * tip, as the app samples it) press somewhere other than the string and
 * fret under the tip: the pad touching the next string, or lying over the
 * next fret wire toward the bridge, sounds the wrong note (over the wire
 * toward the nut is harmless: the higher fret sounds). Points must keep a
 * margin (a third of a string spacing to either side, 2 mm from the wire)
 * because tracked hands are never exactly where they were posed. A bone lying flat on the
 * strings presses along its whole length, and the app reads on into the
 * next one (`pip` is the middle joint).
 */
export function padStrays(tip, dip, pip) {
  const fret = fretAt(tip[0]);
  if (fret === 0 || tip[2] - GUITAR.stringZ > PRESS.above) return 0;
  const string = nearestString(tip[0], tip[1]);
  const low = (p) => p[2] - GUITAR.stringZ <= PRESS.above;
  let strays = 0;
  for (const [a, b] of [[tip, dip], [dip, pip]]) {
    const flat = low(a) && low(b);
    if (a !== tip && !flat) break;
    const reach = flat ? 1 : 0.5;
    for (let i = 1; i <= 4; i++) {
      const p = lerp(a, b, (i / 4) * reach);
      // Once a string is held it stays held up to the release height.
      if (p[2] - GUITAR.stringZ > PRESS.release) break;
      // Leaning toward a neighbouring string strays; past the low or high E,
      // over the fretboard's edge, there is no string to touch.
      const signed = (p[1] - stringY(string, p[0])) / stringSpacing(p[0]);
      const towardBass = string > 0 && signed * Math.sign(stringY(0, p[0]) - stringY(string, p[0])) > 0.33;
      const towardTreble = string < STRING_COUNT - 1 && signed * Math.sign(stringY(STRING_COUNT - 1, p[0]) - stringY(string, p[0])) > 0.33;
      if (fretAt(p[0] - 0.002) > fret || towardBass || towardTreble) strays++;
    }
  }
  return strays;
}

/** How far a knuckle swings a finger sideways out of the hand's plane, in degrees. */
const ROLLS = [0, -8, 8, -16, 16, -24, 24];
/** A resting finger, making room for the others, also shifts its tip along the neck or up. */
const FREE_SHIFTS = [[0, 0, 0], [-0.012, 0, 0], [0.012, 0, 0], [-0.024, 0, 0], [0.024, 0, 0], [0, 0, 0.012], [-0.012, 0, 0.012], [0.012, 0, 0.012]];
const FREE_ROLLS = [0, -12, 12];
/** Postures of the last bone, by its angle back from in line with the finger. */
const DIRECTIONS = Array.from({ length: 21 }, (_, i) => [Math.cos((i / 20) * (150 / DEG)), Math.sin((i / 20) * (150 / DEG))]);

/** Fingers are about this thick: closer bone centrelines would pass through each other. */
const FINGER_CLEARANCE = 0.016;

/** Shortest distance between segments a0-a1 and b0-b1. */
function segmentGap(a0, a1, b0, b1) {
  const d1 = sub(a1, a0);
  const d2 = sub(b1, b0);
  const r = sub(a0, b0);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  const c = dot(d1, r);
  const b = dot(d1, d2);
  const denom = a * e - b * b;
  let s = denom > 1e-12 ? Math.min(1, Math.max(0, (b * f - c * e) / denom)) : 0;
  let t = (b * s + f) / e;
  if (t < 0) {
    t = 0;
    s = Math.min(1, Math.max(0, -c / a));
  } else if (t > 1) {
    t = 1;
    s = Math.min(1, Math.max(0, (b - c) / a));
  }
  return len(sub(add(a0, scale(d1, s)), add(b0, scale(d2, t))));
}

/** How far a finger's bones press into the others', summed, in metres. */
function intrusion(bones, others) {
  let total = 0;
  for (const [a0, a1] of bones) {
    for (const [b0, b1] of others) total += Math.max(0, FINGER_CLEARANCE - segmentGap(a0, a1, b0, b1));
  }
  return total;
}

/** A solved finger's three bones as segments. */
const bonesOf = (joints, f) => {
  const p = ['phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'].map((n) => joints[`${f}-finger-${n}`].position);
  return [[p[0], p[1]], [p[1], p[2]], [p[2], p[3]]];
};

/**
 * Solves one finger. `pressing` (0..1) prefers an upright fingertip, as on
 * a string; otherwise the finger takes a relaxed curl, its end joint
 * bending about two thirds as much as its middle joint. `others` are the
 * other fingers' bones, which this finger must not pass through; a finger
 * that is not pressing may also shift its tip a little to make room.
 */
function solveFinger(name, metacarpal, knuckle, target, hand, pressing, others = []) {
  const [l1, l2, l3] = BONES[name];
  const { back, upright } = hand;
  const forward = norm(sub(knuckle, metacarpal));
  const yields = pressing < 0.5 && others.length > 0;
  let best = null;
  for (const shift of yields ? FREE_SHIFTS : [v(0, 0, 0)]) {
    // A fingertip can only be where the straight finger reaches.
    let tip = add(target, shift);
    const reach = (l1 + l2 + l3) * 0.97;
    const d = sub(tip, knuckle);
    if (len(d) > reach) {
      // Keep a hovering tip's height (pulling straight toward the knuckle,
      // which is below the fretboard, would dip it into the strings).
      const across = Math.hypot(d[0], d[1]);
      const keep = Math.sqrt(Math.max(0, reach * reach - d[2] * d[2]));
      tip = across > 1e-6 && keep > 0 ? [knuckle[0] + (d[0] * keep) / across, knuckle[1] + (d[1] * keep) / across, tip[2]] : add(knuckle, scale(norm(d), reach));
    }

    // The finger's middle and end joints are hinges, so all three bones lie in
    // one plane through the knuckle and fingertip. It turns about the hinge
    // across the knuckles, rolled a little either way as the knuckle swings
    // the finger sideways. Every posture is solved inside one such plane.
    const plane = hingePlane(knuckle, tip, hingeOf(back, hand.forward));
    const { along } = plane;
    for (const roll of yields ? FREE_ROLLS : ROLLS) {
      const dorsal = add(scale(plane.dorsal, Math.cos(roll / DEG)), scale(plane.axis, Math.sin(roll / DEG)));
      const axis = norm(cross(dorsal, along));
      const inPlane = norm(sub(forward, scale(axis, dot(forward, axis))));
      // Postures by the angle of the last bone: from in line with the finger
      // (straight) to folded well back over the tip (curled).
      for (const [c, s] of DIRECTIONS) {
        const dir = add(scale(along, -c), scale(dorsal, s));
        const dip = add(tip, scale(dir, l3));
        const span = len(sub(dip, knuckle));
        if (span > l1 + l2 - 1e-4 || span < Math.abs(l1 - l2) + 1e-4) continue;
        const pip = bend(knuckle, dip, l1, l2, dorsal);
        const mcp = flexion(inPlane, norm(sub(pip, knuckle)), axis);
        const pipA = flexion(norm(sub(pip, knuckle)), norm(sub(dip, pip)), axis);
        const dipA = flexion(norm(sub(dip, pip)), norm(sub(tip, dip)), axis);
        const bad = violation(mcp, pipA, dipA);
        // Pressing: the last bone as close to upright as the plane allows.
        // Relaxed: the end joint bending about two thirds as much as the middle.
        const style = pressing * (1 - dot(dir, upright)) + (1 - pressing) * (Math.abs(dipA - 0.66 * pipA) / 60);
        // A pressing pad must stay on its own string and fret, as a player
        // arches the finger to keep it off the next string. Fingers make
        // room for each other rather than pass through. Swinging the finger
        // sideways is the last resort.
        // (The costlier terms are skipped once a posture cannot win.)
        let cost = bad * 10 + style + Math.abs(roll) / 200 + len(shift) * 20;
        if (best && cost >= best.cost) continue;
        cost += (hand.strays ?? padStrays)(tip, dip, pip) * 10;
        if (best && cost >= best.cost) continue;
        if (others.length) cost += intrusion([[knuckle, pip], [pip, dip], [dip, tip]], others) * 150;
        if (!best || cost < best.cost) best = { cost, pip, dip, tip, axis };
      }
    }
    if (!best) {
      // Out of reach in every posture: point the finger straight at the tip.
      const pip = add(knuckle, scale(along, l1));
      const dip = add(pip, scale(along, l2));
      best = { cost: Infinity, pip, dip, tip: add(dip, scale(along, l3)), axis: plane.axis };
    }
  }
  const chain = [metacarpal, knuckle, best.pip, best.dip, best.tip];
  const names = ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'];
  const joints = {};
  chain.forEach((p, i) => {
    const fwd = norm(i < chain.length - 1 ? sub(chain[i + 1], p) : sub(p, chain[i - 1]));
    // The palm bone takes the hand's back; the phalanges take the finger's
    // own, so no bone is twisted about its length.
    joints[`${name}-finger-${names[i]}`] = frame(p, fwd, i === 0 ? back : cross(fwd, best.axis));
  });
  return joints;
}

/**
 * A finger's bending plane: `along` from knuckle to tip, `dorsal` the back
 * of the finger within the plane, and `axis` the hinge the joints turn
 * about (bending toward the palm is positive about it).
 */
export function fingerPlane(knuckle, tip, back) {
  const along = norm(sub(tip, knuckle));
  let dorsal = sub(back, scale(along, dot(back, along)));
  dorsal = len(dorsal) < 1e-6 ? v(0, 0, 1) : norm(dorsal);
  return { along, dorsal, axis: norm(cross(dorsal, along)) };
}

/**
 * The same plane for a finger, found from the knuckles' hinge (`hinge`,
 * across the hand) rather than the back of the hand: a finger curled right
 * round, pointing back the way the hand's back faces, still bends about it.
 */
export function hingePlane(knuckle, tip, hinge) {
  const along = norm(sub(tip, knuckle));
  let axis = sub(hinge, scale(along, dot(hinge, along)));
  axis = len(axis) < 1e-6 ? hinge : norm(axis);
  return { along, dorsal: cross(along, axis), axis };
}

/** A hand's knuckle hinge: positive about it bends the fingers toward the palm. */
const hingeOf = (back, forward) => norm(cross(back, forward));

/** The thumb: a fixed metacarpal direction, then two bones that reach for the tip target. */
function solveThumb(base, metacarpalDir, target, hand) {
  const [lm, lp, ld] = BONES.thumb;
  const proximal = add(base, scale(metacarpalDir, lm));
  let tip = target;
  const d = sub(target, proximal);
  if (len(d) > (lp + ld) * 0.97) tip = add(proximal, scale(norm(d), (lp + ld) * 0.97));
  if (len(d) < Math.abs(lp - ld) + 0.002) tip = add(proximal, scale(norm(d), Math.abs(lp - ld) + 0.002));
  // The thumb's two outer joints are hinges too: solve in its own plane.
  const { dorsal, axis } = fingerPlane(proximal, tip, hand.back);
  const distal = bend(proximal, tip, lp, ld, dorsal);
  const chain = [base, proximal, distal, tip];
  const names = ['metacarpal', 'phalanx-proximal', 'phalanx-distal', 'tip'];
  const joints = {};
  chain.forEach((p, i) => {
    const fwd = norm(i < chain.length - 1 ? sub(chain[i + 1], p) : sub(p, chain[i - 1]));
    joints[`thumb-${names[i]}`] = frame(p, fwd, i === 0 ? hand.back : cross(fwd, axis));
  });
  return joints;
}

/**
 * A hand's basis and knuckles from its wrist, forward (to the middle
 * knuckle) and index side. Left and right hands are mirror images, so the
 * palm is on opposite sides of forward x index for each.
 */
export function handBasis(wrist, forward, indexSide, right) {
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
 * A pressing finger takes up the whole stretch from its knuckle to its tip,
 * since it slants across the neck.
 */
export function spaceFreeFingers(tips, knuckles, pressedOf, axis, gap = 0.017) {
  const along = (p) => dot(p, axis);
  const moveTo = (p, value) => add(p, scale(axis, value - along(p)));
  const low = (f) => (pressedOf(f) ? Math.min(along(tips[f]), along(knuckles[f])) : along(tips[f]));
  const high = (f) => (pressedOf(f) ? Math.max(along(tips[f]), along(knuckles[f])) : along(tips[f]));
  for (let k = 1; k < 4; k++) {
    const f = FINGERS[k];
    const prev = FINGERS[k - 1];
    if (!pressedOf(f) && along(tips[f]) > low(prev) - gap) tips[f] = moveTo(tips[f], low(prev) - gap);
  }
  for (let k = 2; k >= 0; k--) {
    const f = FINGERS[k];
    const next = FINGERS[k + 1];
    if (!pressedOf(f) && along(tips[f]) < high(next) + gap) tips[f] = moveTo(tips[f], high(next) + gap);
  }
}

/**
 * Fretting hand. `position` is the (fractional) fret the index covers;
 * `tips` maps each finger to its fingertip target in guitar space.
 */
export function leftHand({ position, tips }) {
  const hx = (slotX(position) + slotX(position + 3)) / 2;
  const edge = -stringSpan(hx) / 2;
  const pressingOf = (f) => Math.min(1, Math.max(0, (GUITAR.stringZ + 0.02 - tips[f][2]) / 0.02));
  // The palm sits under the neck, as a player's does: the knuckles just
  // beyond the treble edge of the fretboard, about level with the strings,
  // and the wrist below, so the fingers arch over the fretboard to the
  // strings. Reaching for the bass strings, the hand comes up to the edge;
  // on the treble strings it drops back a little so the fingers can arch.
  let weight = 0;
  let across = 0;
  for (const f of FINGERS) {
    const w = 0.3 + pressingOf(f);
    weight += w;
    across += w * tips[f][1];
  }
  const neckEdge = -neckHalfWidth(hx);
  const knuckleY = Math.min(neckEdge - KNUCKLE_GAP, Math.max(neckEdge - TREBLE_REACH, across / weight - 0.05));
  const middleKnuckle = v(hx, knuckleY, GUITAR.stringZ + KNUCKLE_HEIGHT);
  const forward = norm(v(0, 0.33, 0.94));
  const wrist = sub(middleKnuckle, scale(forward, PALM_LENGTH));
  const hand = handBasis(wrist, forward, v(1, 0, 0), false);
  const targets = { ...tips };
  spaceFreeFingers(targets, hand.knuckles, (f) => pressingOf(f) > 0.5, v(1, 0, 0));
  // A pressing fingertip comes straight down on its string, so its pad
  // stays off the neighbouring ones. The thumb lies along the back of the
  // neck, its pad behind the index and middle fingers and pointing toward
  // the headstock.
  return poseHand(
    { ...hand, upright: v(0, 0, 1) },
    {
      targets,
      pressingOf,
      thumbTip: v(hx + 0.035, neckEdge + neckHalfWidth(hx) * 0.9, NECK_BACK_Z - SKIN),
      thumbWeights: [0.6, 0.55, 0.55],
    },
  );
}

/**
 * Solves a whole hand from its basis (handBasis, plus `upright`, the way a
 * pressing fingertip should point, and optionally `strays`, which scores a
 * pressing pad off its note; the guitar's padStrays by default): each
 * finger to its target, then again any finger that runs into another, then
 * the thumb toward `thumbTip`, its metacarpal along `thumbWeights` (of the
 * hand's lateral, forward and palm directions). `pressingOf(f)` is how much
 * finger f presses, 0 to 1.
 */
export function poseHand(hand, { targets, pressingOf, thumbTip, thumbWeights }) {
  const joints = { wrist: frame(hand.wrist, hand.forward, hand.back) };
  for (const f of FINGERS) {
    Object.assign(joints, solveFinger(f, hand.metacarpals[f], hand.knuckles[f], targets[f], hand, pressingOf(f)));
  }
  // Then any finger that runs into another again, making room for where
  // the others ended up (up to twice, so they settle on postures that suit
  // each other). Fingers on the strings come first: they only avoid each
  // other, and resting fingers get out of their way.
  const pressed = (f) => pressingOf(f) >= 0.5;
  const othersOf = (f) => FINGERS.filter((n) => n !== f && (pressed(n) || !pressed(f))).flatMap((n) => bonesOf(joints, n));
  for (let pass = 0; pass < 2; pass++) {
    const crowded = FINGERS.filter((f) => intrusion(bonesOf(joints, f), othersOf(f)) > 0);
    if (crowded.length === 0) break;
    for (const f of crowded) {
      Object.assign(joints, solveFinger(f, hand.metacarpals[f], hand.knuckles[f], targets[f], hand, pressingOf(f), othersOf(f)));
    }
  }
  const [wl, wf, wp] = thumbWeights;
  const thumbBase = add(add(hand.wrist, scale(hand.lateral, 0.018)), scale(hand.forward, 0.012));
  const thumbDir = norm(add(add(scale(hand.lateral, wl), scale(hand.forward, wf)), scale(hand.palm, wp)));
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
      solveFinger(f, hand.metacarpals[f], k, target, { ...hand, upright }, f === 'index' ? 1 : 0),
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
  // Joint angles in each finger's own bending plane; how far the joints sit
  // out of that plane (a kinked finger); how far the plane swings sideways
  // from the hand's; how twisted each bone is.
  const back = joints.wrist.y;
  let worstAngle = 0;
  let worstJoint = '';
  let kinkMm = 0;
  let rollDeg = 0;
  let twistDeg = 0;
  for (const f of FINGERS) {
    const meta = joints[`${f}-finger-metacarpal`].position;
    const [k, p, d, t] = chainOf(f);
    const u1 = norm(sub(p, k));
    const u2 = norm(sub(d, p));
    const u3 = norm(sub(t, d));
    // The two hinged joints share one axis. Find it from whichever joint is
    // bent enough to show it (else the finger is straight and any plane
    // facing the hand's back will do).
    const handAxis = hingePlane(k, d, hingeOf(back, scale(joints.wrist.z, -1))).axis;
    const bentAxis = [cross(u1, u2), cross(u2, u3)].find((n) => len(n) > 0.17);
    let axis = bentAxis ? norm(bentAxis) : handAxis;
    if (dot(axis, handAxis) < 0) axis = scale(axis, -1);
    kinkMm = Math.max(kinkMm, Math.max(Math.abs(dot(sub(p, k), axis)), Math.abs(dot(sub(t, k), axis))) * 1000);
    rollDeg = Math.max(rollDeg, Math.acos(Math.min(1, dot(axis, handAxis))) * DEG);
    const u0 = norm(sub(k, meta));
    const u0p = norm(sub(u0, scale(axis, dot(u0, axis))));
    const bad = violation(flexion(u0p, u1, axis), flexion(u1, u2, axis), flexion(u2, u3, axis));
    if (bad > worstAngle) {
      worstAngle = bad;
      worstJoint = f;
    }
    // Each phalanx's back should face the finger's own back.
    for (const n of ['phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal']) {
      const j = joints[`${f}-finger-${n}`];
      const expected = cross(scale(j.z, -1), axis);
      twistDeg = Math.max(twistDeg, Math.acos(Math.min(1, Math.max(-1, dot(j.y, norm(expected))))) * DEG);
    }
  }
  let strays = 0;
  for (const f of FINGERS) {
    const [, p, d, tip] = chainOf(f);
    strays += padStrays(tip, d, p);
  }
  return { boneError, closest, pair, worstAngle, worstJoint, kinkMm, rollDeg, twistDeg, strays };
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
