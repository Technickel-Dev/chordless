import { BoxGeometry, CylinderGeometry, Group, LatheGeometry, SphereGeometry, Vector2 } from '@iwsdk/core';
import { block, disc, instances, mat, type Placement, put, skyBody, stars, tileTexture } from './lib/set-kit.js';

/** A lathed chess piece from (radius, height) pairs, scaled. */
function piece(points: [number, number][], scale: number): LatheGeometry {
  return new LatheGeometry(points.map(([r, y]) => new Vector2(r * scale, y * scale)), 32);
}

/**
 * Chessboard plain: an endless black-and-white checkerboard under a strange
 * twilight with two moons, a few giant chess pieces standing about mid-game.
 */
export function createChessboardSet(): Group {
  const root = new Group();
  root.name = 'ChessboardSet';
  const board = tileTexture([236, 230, 214], [30, 28, 34], 2);
  board.repeat.set(95, 95);
  disc(root, 'Board', 190, mat(0xffffff, { map: board, rough: 0.25, metal: 0.05 }), 0);

  const ivory = mat(0xf2ece0, { rough: 0.3 });
  const ebony = mat(0x1e1c24, { rough: 0.25, metal: 0.1 });
  const S = 6;
  const pawn: [number, number][] = [[0, 0], [0.42, 0], [0.42, 0.08], [0.3, 0.16], [0.18, 0.55], [0.26, 0.6], [0.12, 0.66], [0, 0.66]];
  const rook: [number, number][] = [[0, 0], [0.48, 0], [0.48, 0.1], [0.34, 0.2], [0.3, 0.85], [0.4, 0.92], [0.4, 1.1], [0, 1.1]];
  const bishop: [number, number][] = [[0, 0], [0.46, 0], [0.46, 0.1], [0.3, 0.2], [0.16, 0.9], [0.28, 0.95], [0.12, 1.0], [0.24, 1.2], [0.16, 1.42], [0, 1.5]];
  const king: [number, number][] = [[0, 0], [0.52, 0], [0.52, 0.12], [0.36, 0.22], [0.2, 1.2], [0.42, 1.3], [0.34, 1.6], [0.2, 1.68], [0, 1.68]];
  const placed: [string, [number, number][], number, number, boolean][] = [
    ['WhitePawn', pawn, -6, -9, true],
    ['BlackPawn', pawn, 6, -15, false],
    ['BlackRook', rook, -14, -26, false],
    ['WhiteBishop', bishop, 12, -8, true],
    ['BlackKing', king, 2, -34, false],
    ['WhiteRook', rook, -22, 8, true],
  ];
  for (const [name, pts, x, z, white] of placed) {
    put(root, name, piece(pts, S), white ? ivory : ebony, [x, 0, z]);
  }
  // Heads and crowns for the lathed pieces.
  put(root, 'WhitePawnHead', new SphereGeometry(0.24 * S, 24, 16), ivory, [-6, 0.82 * S, -9]);
  put(root, 'BlackPawnHead', new SphereGeometry(0.24 * S, 24, 16), ebony, [6, 0.82 * S, -15]);
  put(root, 'BishopTip', new SphereGeometry(0.06 * S, 12, 8), ivory, [12, 1.55 * S, -8]);
  const crenels: Placement[] = [];
  for (const [x, z] of [[-14, -26], [-22, 8]]) for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    crenels.push({ pos: [x + Math.sin(a) * 0.34 * S, 1.1 * S, z + Math.cos(a) * 0.34 * S], rotDeg: [0, (a * 180) / Math.PI, 0], color: x === -14 ? 0x1e1c24 : 0xf2ece0 });
  }
  instances(root, 'Crenellations', new BoxGeometry(0.16 * S, 0.14 * S, 0.12 * S).translate(0, 0.07 * S, 0), mat(0xffffff, { rough: 0.3 }), crenels);
  block(root, 'CrossV', [0.1 * S, 0.4 * S, 0.1 * S], ebony, [2, 1.68 * S, -34]);
  block(root, 'CrossH', [0.3 * S, 0.1 * S, 0.1 * S], ebony, [2, 1.83 * S, -34]);
  // A knight, toppled, rendered simply as a tilted block-headed piece.
  const knight = new Group();
  knight.name = 'FallenKnight';
  knight.position.set(-10, 0.45 * 4, -14);
  knight.rotation.set(0, 0.6, Math.PI / 2);
  root.add(knight);
  put(knight, 'Base', new CylinderGeometry(0.46 * 4, 0.5 * 4, 0.3 * 4, 32), ebony, [0, 0, 0]);
  put(knight, 'Neck', new BoxGeometry(0.4 * 4, 0.8 * 4, 0.5 * 4), ebony, [0, 0.55 * 4, 0], [0, 0, 10]);
  put(knight, 'Head', new BoxGeometry(0.36 * 4, 0.36 * 4, 0.8 * 4), ebony, [0, 1 * 4, 0.2 * 4], [20, 0, 0]);

  skyBody(root, 'MoonBig', [-60, 40, -150], 16, 0xd8f0e8, 0x3a6a7a, 1.6);
  skyBody(root, 'MoonSmall', [70, 70, -130], 6, 0xffd8f0, 0x7a3a6a, 1.8);
  stars(root, 900, 185, 561, 0.3, 2);
  return root;
}
