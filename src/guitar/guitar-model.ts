/**
 * Procedural air guitar. Local frame: +X runs up the neck toward the
 * headstock, +Y across the strings (low E on top), +Z out of the top face.
 * The origin is the centre of the body's top face.
 */

import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Shape,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
} from '@iwsdk/core';
import { STRING_COUNT, ZONE_COUNT } from './chords.js';

export const GUITAR = {
  bridgeX: -0.13,
  nutX: 0.7,
  /** The neck starts where it leaves the body. */
  neckStartX: 0.2,
  stringZ: 0.022,
  bridgeSpread: 0.09,
  nutSpread: 0.036,
  /** Neck zones run from the nut back toward the body. */
  zoneStartX: 0.7,
  zoneEndX: 0.25,
} as const;

/** Distinct colours per chord zone, nut to body. */
export const ZONE_COLORS = [0x2ecc71, 0xe74c3c, 0xf1c40f, 0x3498db, 0xe67e22, 0x9b59b6];

export interface GuitarModel {
  root: Group;
  strings: Mesh[];
  stringMaterials: MeshStandardMaterial[];
  zoneMaterials: MeshStandardMaterial[];
  zoneLabels: LabelSprite[];
  stringRestZ: number;
}

/** Y of string `s` at local `x`; strings fan out from nut to bridge. */
export function stringY(s: number, x: number): number {
  const t = (x - GUITAR.bridgeX) / (GUITAR.nutX - GUITAR.bridgeX);
  const spread = GUITAR.bridgeSpread + (GUITAR.nutSpread - GUITAR.bridgeSpread) * t;
  const centre = (STRING_COUNT - 1) / 2;
  return ((centre - s) / (STRING_COUNT - 1)) * spread;
}

/** Local X range [far, near] covered by zone `i` (0 = at the nut). */
export function zoneRange(i: number): [number, number] {
  const len = (GUITAR.zoneStartX - GUITAR.zoneEndX) / ZONE_COUNT;
  return [GUITAR.zoneStartX - i * len, GUITAR.zoneStartX - (i + 1) * len];
}

export function createGuitarModel(): GuitarModel {
  const root = new Group();
  root.name = 'AirGuitar';

  const bodyMat = new MeshStandardMaterial({ color: 0xb3261e, roughness: 0.32, metalness: 0.1 });
  const woodMat = new MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.6 });
  const boardMat = new MeshStandardMaterial({ color: 0x2b1d14, roughness: 0.7 });
  const darkMat = new MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });
  const metalMat = new MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.25, metalness: 0.9 });
  const creamMat = new MeshStandardMaterial({ color: 0xf2e8d5, roughness: 0.4 });

  // Body: the outline is the union of a lower and an upper bout circle,
  // which gives the classic figure-of-eight waist.
  const bodyDepth = 0.07;
  const bevel = 0.008;
  const outline = new Shape();
  const lower = { c: -0.07, r: 0.17 };
  const upper = { c: 0.14, r: 0.125 };
  const halfWidth = (x: number) =>
    Math.max(
      Math.sqrt(Math.max(0, lower.r ** 2 - (x - lower.c) ** 2)),
      Math.sqrt(Math.max(0, upper.r ** 2 - (x - upper.c) ** 2)),
    );
  const xMin = lower.c - lower.r;
  const xMax = upper.c + upper.r;
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const x = xMin + ((xMax - xMin) * i) / steps;
    if (i === 0) outline.moveTo(x, halfWidth(x));
    else outline.lineTo(x, halfWidth(x));
  }
  for (let i = steps; i >= 0; i--) {
    const x = xMin + ((xMax - xMin) * i) / steps;
    outline.lineTo(x, -halfWidth(x));
  }
  const bodyGeo = new ExtrudeGeometry(outline, {
    depth: bodyDepth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 4,
  });
  bodyGeo.translate(0, 0, -bodyDepth - bevel);
  root.add(new Mesh(bodyGeo, bodyMat));

  const soundHole = new Mesh(new CircleGeometry(0.045, 32), darkMat);
  soundHole.position.set(0.1, 0, 0.0006);
  root.add(soundHole);
  const rosette = new Mesh(new CircleGeometry(0.055, 32), creamMat);
  rosette.position.set(0.1, 0, 0.0003);
  root.add(rosette);

  const bridge = new Mesh(new BoxGeometry(0.025, 0.12, 0.012), darkMat);
  bridge.position.set(GUITAR.bridgeX, 0, 0.006);
  root.add(bridge);

  // Neck and fretboard.
  const neckLen = GUITAR.nutX - GUITAR.neckStartX;
  const neck = new Mesh(new BoxGeometry(neckLen + 0.04, 0.05, 0.03), woodMat);
  neck.position.set(GUITAR.neckStartX + neckLen / 2, 0, -0.005);
  root.add(neck);
  const board = new Mesh(new BoxGeometry(neckLen + 0.04, 0.052, 0.008), boardMat);
  board.position.set(GUITAR.neckStartX + neckLen / 2, 0, 0.012);
  root.add(board);

  const nut = new Mesh(new BoxGeometry(0.006, 0.05, 0.01), creamMat);
  nut.position.set(GUITAR.nutX, 0, 0.018);
  root.add(nut);

  // Zone inlays, plus a fret wire at each zone boundary.
  const zoneMaterials: MeshStandardMaterial[] = [];
  const zoneLabels: LabelSprite[] = [];
  for (let i = 0; i < ZONE_COUNT; i++) {
    const [far, near] = zoneRange(i);
    const mat = new MeshStandardMaterial({
      color: ZONE_COLORS[i],
      emissive: new Color(ZONE_COLORS[i]),
      emissiveIntensity: 0.15,
      roughness: 0.4,
    });
    zoneMaterials.push(mat);
    const inlay = new Mesh(new BoxGeometry((far - near) * 0.7, 0.03, 0.002), mat);
    inlay.position.set((far + near) / 2, 0, 0.0165);
    root.add(inlay);

    const fret = new Mesh(new BoxGeometry(0.003, 0.052, 0.004), metalMat);
    fret.position.set(near, 0, 0.017);
    root.add(fret);

    const label = new LabelSprite(256, 128);
    label.sprite.scale.set(0.07, 0.035, 1);
    label.sprite.position.set((far + near) / 2, 0.055, 0.03);
    root.add(label.sprite);
    zoneLabels.push(label);
  }

  // Headstock with tuning pegs.
  const head = new Mesh(new BoxGeometry(0.17, 0.075, 0.018), woodMat);
  head.position.set(GUITAR.nutX + 0.09, 0, 0.002);
  root.add(head);
  const pegGeo = new CylinderGeometry(0.006, 0.006, 0.03, 10);
  for (let i = 0; i < STRING_COUNT; i++) {
    const peg = new Mesh(pegGeo, metalMat);
    const side = i < 3 ? 1 : -1;
    peg.position.set(GUITAR.nutX + 0.04 + (i % 3) * 0.045, side * 0.045, 0.002);
    root.add(peg);
  }

  // Strings: a unit cylinder along Y, stretched and rotated between the
  // bridge and the nut. Low strings are thicker.
  const strings: Mesh[] = [];
  const stringMaterials: MeshStandardMaterial[] = [];
  const unitString = new CylinderGeometry(1, 1, 1, 6);
  const start = new Vector3();
  const end = new Vector3();
  const dir = new Vector3();
  const yAxis = new Vector3(0, 1, 0);
  for (let s = 0; s < STRING_COUNT; s++) {
    start.set(GUITAR.bridgeX, stringY(s, GUITAR.bridgeX), GUITAR.stringZ);
    end.set(GUITAR.nutX, stringY(s, GUITAR.nutX), GUITAR.stringZ);
    dir.subVectors(end, start);
    const mat = new MeshStandardMaterial({
      color: s < 3 ? 0xc9a86a : 0xe0e0e0,
      emissive: new Color(0xfff2c0),
      emissiveIntensity: 0,
      roughness: 0.3,
      metalness: 0.8,
    });
    const string = new Mesh(unitString, mat);
    const radius = 0.0018 - s * 0.0002;
    string.scale.set(radius, dir.length(), radius);
    string.quaternion.copy(new Quaternion().setFromUnitVectors(yAxis, dir.normalize()));
    string.position.addVectors(start, end).multiplyScalar(0.5);
    root.add(string);
    strings.push(string);
    stringMaterials.push(mat);
  }

  return {
    root,
    strings,
    stringMaterials,
    zoneMaterials,
    zoneLabels,
    stringRestZ: GUITAR.stringZ,
  };
}

/** The guitar pick that rides on the strumming hand. */
export function createPick(): Mesh {
  const pick = new Mesh(
    new CylinderGeometry(0.014, 0.014, 0.003, 3),
    new MeshStandardMaterial({
      color: 0xffb000,
      emissive: new Color(0xff8800),
      emissiveIntensity: 0.4,
      roughness: 0.3,
    }),
  );
  pick.name = 'GuitarPick';
  pick.rotation.x = Math.PI / 2;
  return pick;
}

/** A camera-facing text sprite backed by a canvas, redrawn only on change. */
export class LabelSprite {
  readonly sprite: Sprite;
  private readonly canvas: HTMLCanvasElement;
  private readonly texture: CanvasTexture;
  private lastKey = '';

  constructor(width: number, height: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.sprite = new Sprite(
      new SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false }),
    );
  }

  /** Draws centred lines of text; the first line is the large one. */
  draw(lines: string[], accent = '#ffffff', highlighted = false): void {
    const key = `${lines.join('|')}|${accent}|${highlighted}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    const { width, height } = this.canvas;
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, width, height);
    g.fillStyle = highlighted ? 'rgba(20,20,24,0.92)' : 'rgba(20,20,24,0.7)';
    roundRect(g, 4, 4, width - 8, height - 8, height * 0.18);
    g.fill();
    g.lineWidth = highlighted ? 8 : 3;
    g.strokeStyle = accent;
    g.stroke();

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const big = lines.length > 1 ? height * 0.42 : height * 0.55;
    const small = height * 0.15;
    const total = big + (lines.length - 1) * small * 1.3;
    let y = height / 2 - total / 2 + big / 2;
    lines.forEach((line, i) => {
      g.font = `700 ${i === 0 ? big : small}px system-ui, sans-serif`;
      g.fillStyle = i === 0 ? '#ffffff' : '#c8ccd4';
      g.fillText(line, width / 2, y);
      y += i === 0 ? big / 2 + small * 0.9 : small * 1.3;
    });
    this.texture.needsUpdate = true;
  }
}

function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
