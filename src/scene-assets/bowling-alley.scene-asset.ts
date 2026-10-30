import { BoxGeometry, CylinderGeometry, Group, LatheGeometry, SphereGeometry, Vector2 } from '@iwsdk/core';
import { block, glow, instances, mat, type Placement, plankTexture, put, room, sign } from './lib/set-kit.js';

/**
 * Bowling alley: the player stands at the foul line of the middle lane of six,
 * the polished lanes running off to pins at the far end, a ball return
 * beside them and a glowing masking panel over the pin decks.
 */
export function createBowlingAlleySet(): Group {
  const root = new Group();
  root.name = 'BowlingAlleySet';
  // The hall floor sits below the lanes so the lane tops and gutters show.
  room(root, 'Hall', [16, 4.7, 28], mat(0x3a3460, { rough: 0.9 }), mat(0x4a3a6a, { rough: 0.9 }), mat(0x1a1830), [0, -11]).position.y = -0.2;

  // Five lanes, 1.06 m wide and 18 m long, the player on the middle one.
  const maple = plankTexture([214, 170, 112], 10, 311);
  maple.rotation = Math.PI / 2;
  maple.repeat.set(6, 1);
  const lane = mat(0xffffff, { map: maple, rough: 0.15, metal: 0.05 });
  const gutter = mat(0x2a2a30, { metal: 0.6, rough: 0.35 });
  const laneX = [-2.72, -1.36, 0, 1.36, 2.72];
  const lanes: Placement[] = laneX.map((x) => ({ pos: [x, -0.01, -9.4] }));
  instances(root, 'Lanes', new BoxGeometry(1.06, 0.02, 18), lane, lanes);
  const gutters: Placement[] = [];
  for (const x of laneX) for (const s of [-1, 1]) gutters.push({ pos: [x + s * 0.63, 0, -9.4] });
  instances(root, 'Gutters', new CylinderGeometry(0.12, 0.12, 18, 12, 1, true, Math.PI / 2, Math.PI).rotateX(-Math.PI / 2), gutter, gutters);
  put(root, 'Approach', new BoxGeometry(9, 0.02, 4.4), mat(0xffffff, { map: maple, rough: 0.3 }), [0, -0.01, 1.8]);
  put(root, 'FoulLine', new BoxGeometry(9, 0.005, 0.03), mat(0x1a1a1a), [0, 0.005, -0.4]);
  const arrows: Placement[] = [];
  for (const x of laneX) for (let i = -2; i <= 2; i++) arrows.push({ pos: [x + i * 0.18, 0.004, -4.4 - Math.abs(i) * 0.25], rotDeg: [-90, 0, 45] });
  instances(root, 'TargetArrows', new BoxGeometry(0.06, 0.06, 0.003), mat(0x3a2a1a), arrows);

  // Pins: ten per lane in a triangle.
  const pinShape = [
    [0, 0], [0.026, 0], [0.05, 0.06], [0.06, 0.12], [0.05, 0.2], [0.03, 0.27], [0.025, 0.31], [0.032, 0.35], [0.025, 0.38], [0, 0.38],
  ].map(([x, y]) => new Vector2(x * 1.0, y));
  const pins: Placement[] = [];
  for (const x of laneX) {
    for (let row = 0; row < 4; row++) for (let i = 0; i <= row; i++) pins.push({ pos: [x + (i - row / 2) * 0.3, 0, -17.6 - row * 0.26] });
  }
  instances(root, 'Pins', new LatheGeometry(pinShape, 14), mat(0xf6f4f0, { rough: 0.25 }), pins);
  const neck: Placement[] = pins.map((p) => ({ pos: [p.pos[0], 0.26, p.pos[2]] }));
  instances(root, 'PinStripes', new CylinderGeometry(0.031, 0.034, 0.03, 14), mat(0xd8282a), neck);
  block(root, 'PinDeckBack', [9, 1.2, 0.3], mat(0x0a0a0c), [0, 0, -18.9]);
  // Masking panel over the pins.
  block(root, 'Masking', [9.2, 1.4, 0.3], mat(0x1a1430), [0, 1.3, -18.2]);
  sign(root, 'Strike', 'STRIKE!', 0.7, [255, 220, 60], [26, 20, 48, 255], [0, 2.0, -18.03], [0, 0, 0], true);
  const neon: Placement[] = laneX.map((x, i) => ({ pos: [x, 1.25, -18.03], color: [0xff3a8a, 0x3ad8ff, 0xffd23a][i % 3] }));
  instances(root, 'LaneNumbers', new BoxGeometry(0.5, 0.08, 0.02), glow(0xffffff), neon);

  // Ball return between the middle lanes, with three balls.
  const ret = new Group();
  ret.name = 'BallReturn';
  ret.position.set(-0.75, 0, 1.2);
  root.add(ret);
  block(ret, 'Hood', [0.5, 0.65, 1.3], mat(0x3a3a8a, { rough: 0.3, metal: 0.3 }), [0, 0, 0]);
  block(ret, 'Rack', [0.42, 0.06, 0.9], mat(0x8a8e94, { metal: 0.8, rough: 0.3 }), [0, 0.65, 0.6]);
  instances(ret, 'Balls', new SphereGeometry(0.11, 24, 16), mat(0xffffff, { rough: 0.1, metal: 0.2 }), [
    { pos: [0, 0.82, 0.3], color: 0x2a4ad8 },
    { pos: [0, 0.82, 0.55], color: 0xd82a6a },
    { pos: [0, 0.82, 0.8], color: 0x1a1a1a },
  ]);
  // Ceiling light strip down each lane.
  instances(root, 'LaneLights', new BoxGeometry(0.2, 0.04, 16), glow(0xe8eeff), laneX.map((x) => ({ pos: [x, 4.47, -9] })));
  return root;
}
