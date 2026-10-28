/**
 * Procedural steel-string guitar at real scale. See geometry.ts for the
 * local frame and dimensions.
 */

import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  RingGeometry,
  Shape,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
} from '@iwsdk/core';
import { fretX, GUITAR, STRING_COUNT, stringSpan, stringY } from './geometry.js';

const INLAY_FRETS = [3, 5, 7, 9, 15, 17];

export interface GuitarModel {
  root: Group;
  /** Glowing overlay over each string's vibrating length. */
  vibrations: Mesh[];
  vibrationMaterials: MeshBasicMaterial[];
  /** Marker where each string is pressed, hidden when open. */
  pressDots: Mesh[];
  /** Shadows of the left fingertips on the fretboard. */
  fingerShadows: Mesh[];
  fingerShadowMaterials: MeshBasicMaterial[];
  /** Shadow of the right index fingertip on the strings. */
  pickShadow: Mesh;
  pickShadowMaterial: MeshBasicMaterial;
  hud: LabelSprite;
}

export function createGuitarModel(): GuitarModel {
  const root = new Group();
  root.name = 'AirGuitar';

  const topMat = new MeshStandardMaterial({ color: 0xd9a35b, roughness: 0.45 });
  const sideMat = new MeshStandardMaterial({ color: 0x5a2e14, roughness: 0.5 });
  const neckMat = new MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.6 });
  const boardMat = new MeshStandardMaterial({ color: 0x2b1d14, roughness: 0.75 });
  const darkMat = new MeshStandardMaterial({ color: 0x0d0907, roughness: 0.6 });
  const metalMat = new MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.25, metalness: 0.9 });
  const boneMat = new MeshStandardMaterial({ color: 0xf2e8d5, roughness: 0.4 });

  // Body: the union of a lower and an upper bout gives the figure-of-eight
  // outline. The top is a separate thin slab so it can be a lighter wood.
  const lower = { c: -0.12, r: 0.185 };
  const upper = { c: 0.075, r: 0.135 };
  const halfWidth = (x: number) =>
    Math.max(
      Math.sqrt(Math.max(0, lower.r ** 2 - (x - lower.c) ** 2)),
      Math.sqrt(Math.max(0, upper.r ** 2 - (x - upper.c) ** 2)),
    );
  const outline = new Shape();
  const xMin = lower.c - lower.r;
  const xMax = upper.c + upper.r;
  const steps = 64;
  for (let i = 0; i <= steps; i++) {
    const x = xMin + ((xMax - xMin) * i) / steps;
    if (i === 0) outline.moveTo(x, halfWidth(x));
    else outline.lineTo(x, halfWidth(x));
  }
  for (let i = steps; i >= 0; i--) {
    const x = xMin + ((xMax - xMin) * i) / steps;
    outline.lineTo(x, -halfWidth(x));
  }
  const depth = 0.09;
  const sides = new ExtrudeGeometry(outline, { depth, bevelEnabled: false, curveSegments: 4 });
  sides.translate(0, 0, -depth - 0.003);
  root.add(new Mesh(sides, sideMat));
  const top = new ExtrudeGeometry(outline, { depth: 0.003, bevelEnabled: false, curveSegments: 4 });
  top.translate(0, 0, -0.003);
  root.add(new Mesh(top, topMat));

  const rosette = new Mesh(new RingGeometry(0.045, 0.054, 48), darkMat);
  rosette.position.z = 0.0004;
  root.add(rosette);
  const soundHole = new Mesh(new CircleGeometry(0.043, 48), darkMat);
  soundHole.position.z = 0.0003;
  root.add(soundHole);

  const bridge = new Mesh(new BoxGeometry(0.03, 0.15, 0.008), darkMat);
  bridge.position.set(GUITAR.bridgeX - 0.008, 0, 0.004);
  root.add(bridge);
  const saddle = new Mesh(new BoxGeometry(0.003, 0.075, 0.016), boneMat);
  saddle.position.set(GUITAR.bridgeX, 0, 0.008);
  root.add(saddle);

  // Neck and fretboard: tapered slabs from over the body to the nut.
  const neckStart = 0.17;
  const taper = (x0: number, x1: number) => {
    const w = (x: number) =>
      (GUITAR.neckWidthBody +
        ((GUITAR.neckWidthNut - GUITAR.neckWidthBody) * (x - GUITAR.boardEndX)) /
          (GUITAR.nutX - GUITAR.boardEndX)) /
      2;
    const s = new Shape();
    s.moveTo(x0, w(x0));
    s.lineTo(x1, w(x1));
    s.lineTo(x1, -w(x1));
    s.lineTo(x0, -w(x0));
    s.closePath();
    return s;
  };
  const neck = new ExtrudeGeometry(taper(neckStart, GUITAR.nutX + 0.004), {
    depth: 0.03,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.004,
    bevelSegments: 3,
  });
  neck.translate(0, 0, -0.022);
  root.add(new Mesh(neck, neckMat));
  const board = new ExtrudeGeometry(taper(GUITAR.boardEndX, GUITAR.nutX), {
    depth: 0.006,
    bevelEnabled: false,
  });
  board.translate(0, 0, GUITAR.boardTopZ - 0.006);
  root.add(new Mesh(board, boardMat));

  const nut = new Mesh(new BoxGeometry(0.005, GUITAR.neckWidthNut, 0.008), boneMat);
  nut.position.set(GUITAR.nutX + 0.0025, 0, GUITAR.boardTopZ + 0.003);
  root.add(nut);

  const fretGeo = new BoxGeometry(0.0022, 1, 0.0016);
  for (let n = 1; n <= GUITAR.fretCount; n++) {
    const x = fretX(n);
    const fret = new Mesh(fretGeo, metalMat);
    fret.scale.y = stringSpan(x) + 0.012;
    fret.position.set(x, 0, GUITAR.boardTopZ + 0.0008);
    root.add(fret);
  }

  const inlayGeo = new CircleGeometry(0.0042, 20);
  const addInlay = (n: number, y: number) => {
    const dot = new Mesh(inlayGeo, boneMat);
    dot.position.set((fretX(n) + fretX(n - 1)) / 2, y, GUITAR.boardTopZ + 0.0003);
    root.add(dot);
  };
  for (const n of INLAY_FRETS) addInlay(n, 0);
  addInlay(12, 0.011);
  addInlay(12, -0.011);

  // Headstock, tilted back like a real one, with tuners.
  const head = new Group();
  head.position.set(GUITAR.nutX + 0.005, 0, 0.002);
  head.rotation.y = (13 * Math.PI) / 180;
  const plate = new Mesh(new BoxGeometry(0.19, 0.08, 0.016), neckMat);
  plate.position.set(0.095, 0, 0);
  head.add(plate);
  const pegGeo = new CylinderGeometry(0.005, 0.005, 0.03, 10);
  const buttonGeo = new BoxGeometry(0.018, 0.012, 0.02);
  for (let i = 0; i < STRING_COUNT; i++) {
    const side = i < 3 ? 1 : -1;
    const x = 0.045 + (i % 3) * 0.05;
    const post = new Mesh(pegGeo, metalMat);
    post.rotation.x = Math.PI / 2;
    post.position.set(x, side * 0.026, 0.016);
    head.add(post);
    const button = new Mesh(buttonGeo, metalMat);
    button.position.set(x, side * 0.05, 0);
    head.add(button);
  }
  root.add(head);

  // Strings, plus a glowing overlay over each one's vibrating length.
  const unit = new CylinderGeometry(1, 1, 1, 6);
  const vibrations: Mesh[] = [];
  const vibrationMaterials: MeshBasicMaterial[] = [];
  const pressDots: Mesh[] = [];
  const dotGeo = new CylinderGeometry(0.0045, 0.0045, 0.003, 16);
  const dotMat = new MeshBasicMaterial({ color: 0x3dff8f });
  for (let s = 0; s < STRING_COUNT; s++) {
    const wound = s < 3;
    const string = new Mesh(
      unit,
      new MeshStandardMaterial({
        color: wound ? 0xc9a86a : 0xe6e6e6,
        roughness: 0.3,
        metalness: 0.85,
      }),
    );
    const radius = 0.0012 - s * 0.0001;
    placeString(string, s, GUITAR.nutX, radius);
    root.add(string);

    const mat = new MeshBasicMaterial({
      color: 0xffe9a8,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const glow = new Mesh(unit, mat);
    placeString(glow, s, GUITAR.nutX, radius * 2.4);
    glow.visible = false;
    root.add(glow);
    vibrations.push(glow);
    vibrationMaterials.push(mat);

    const dot = new Mesh(dotGeo, dotMat);
    dot.rotation.x = Math.PI / 2;
    dot.visible = false;
    root.add(dot);
    pressDots.push(dot);
  }

  // Fingertip shadows: discs lying on the fretboard and strings.
  const shadowGeo = new CircleGeometry(0.006, 20);
  const fingerShadows: Mesh[] = [];
  const fingerShadowMaterials: MeshBasicMaterial[] = [];
  for (let i = 0; i < 4; i++) {
    const mat = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const shadow = new Mesh(shadowGeo, mat);
    shadow.visible = false;
    root.add(shadow);
    fingerShadows.push(shadow);
    fingerShadowMaterials.push(mat);
  }
  const pickShadowMaterial = new MeshBasicMaterial({
    color: 0xffb000,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const pickShadow = new Mesh(new RingGeometry(0.004, 0.0075, 20), pickShadowMaterial);
  pickShadow.visible = false;
  root.add(pickShadow);

  const hud = new LabelSprite(512, 256);
  hud.sprite.name = 'ChordDisplay';
  hud.sprite.scale.set(0.2, 0.1, 1);
  hud.sprite.position.set(GUITAR.nutX + 0.2, 0.07, 0.1);
  root.add(hud.sprite);

  return {
    root,
    vibrations,
    vibrationMaterials,
    pressDots,
    fingerShadows,
    fingerShadowMaterials,
    pickShadow,
    pickShadowMaterial,
    hud,
  };
}

const start = new Vector3();
const end = new Vector3();
const dir = new Vector3();
const yAxis = new Vector3(0, 1, 0);
const rotation = new Quaternion();

/**
 * Stretches a unit cylinder along string `s` from the bridge to `stopX`
 * (the nut, or the fret a finger holds).
 */
export function placeString(mesh: Mesh, s: number, stopX: number, radius?: number): void {
  start.set(GUITAR.bridgeX, stringY(s, GUITAR.bridgeX), GUITAR.stringZ);
  end.set(stopX, stringY(s, stopX), GUITAR.stringZ);
  dir.subVectors(end, start);
  const r = radius ?? mesh.scale.x;
  mesh.scale.set(r, dir.length(), r);
  mesh.quaternion.copy(rotation.setFromUnitVectors(yAxis, dir.normalize()));
  mesh.position.addVectors(start, end).multiplyScalar(0.5);
}

/** HUD border colours for the guitar's states. */
export const ACCENT = { idle: '#8a8f99', playing: '#ffb000', placing: '#3dff8f' };

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
  draw(lines: string[], accent = ACCENT.idle): void {
    const key = `${lines.join('|')}|${accent}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    const { width, height } = this.canvas;
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, width, height);
    g.fillStyle = 'rgba(20,20,24,0.82)';
    roundRect(g, 4, 4, width - 8, height - 8, height * 0.18);
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = accent;
    g.stroke();

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const big = lines.length > 1 ? height * 0.4 : height * 0.5;
    const small = height * 0.12;
    const total = big + (lines.length - 1) * small * 1.35;
    let y = height / 2 - total / 2 + big / 2;
    lines.forEach((line, i) => {
      g.font = `700 ${i === 0 ? big : small}px system-ui, sans-serif`;
      g.fillStyle = i === 0 ? '#ffffff' : '#c8ccd4';
      g.fillText(line, width / 2, y);
      y += i === 0 ? big / 2 + small * 0.95 : small * 1.35;
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
