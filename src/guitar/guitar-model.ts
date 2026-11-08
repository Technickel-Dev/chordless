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
import { HUD_ICONS, HudIcon } from '../hud-icons.js';
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
  // The parts that come apart when it is smashed (see wreck-model.ts).
  /** Everything of the body: sides, top, rosette, bridge. Hidden once it shatters. */
  body: Group;
  /** The body's outline in the top face's plane, as x, y pairs. */
  outline: number[];
  /** The whole neck and fretboard, hidden once the neck snaps. */
  neck: Mesh;
  board: Mesh;
  head: Group;
  nut: Mesh;
  frets: Mesh[];
  inlays: Mesh[];
  strings: Mesh[];
  materials: { top: MeshStandardMaterial; side: MeshStandardMaterial; neck: MeshStandardMaterial; board: MeshStandardMaterial };
}

/** Where the neck runs from, over the body. */
export const NECK_START = 0.17;

/** A slab of the tapered neck outline between x0 and x1. */
export function neckShape(x0: number, x1: number): Shape {
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
}

/** The neck's rounded back between x0 and x1. */
export function neckGeometry(x0: number, x1: number): ExtrudeGeometry {
  const neck = new ExtrudeGeometry(neckShape(x0, x1), {
    depth: 0.03,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.004,
    bevelSegments: 3,
  });
  neck.translate(0, 0, -0.022);
  return neck;
}

/** The fretboard between x0 and x1. */
export function boardGeometry(x0: number, x1: number): ExtrudeGeometry {
  const board = new ExtrudeGeometry(neckShape(x0, x1), { depth: 0.006, bevelEnabled: false });
  board.translate(0, 0, GUITAR.boardTopZ - 0.006);
  return board;
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
  const outlinePoints: number[] = [];
  const xMin = lower.c - lower.r;
  const xMax = upper.c + upper.r;
  const steps = 64;
  for (let i = 0; i <= steps; i++) {
    const x = xMin + ((xMax - xMin) * i) / steps;
    outlinePoints.push(x, halfWidth(x));
  }
  for (let i = steps; i >= 0; i--) {
    const x = xMin + ((xMax - xMin) * i) / steps;
    outlinePoints.push(x, -halfWidth(x));
  }
  const outline = new Shape();
  outline.moveTo(outlinePoints[0], outlinePoints[1]);
  for (let i = 2; i < outlinePoints.length; i += 2) outline.lineTo(outlinePoints[i], outlinePoints[i + 1]);

  const body = new Group();
  body.name = 'Body';
  root.add(body);
  const depth = 0.09;
  const sides = new ExtrudeGeometry(outline, { depth, bevelEnabled: false, curveSegments: 4 });
  sides.translate(0, 0, -depth - 0.003);
  body.add(named(new Mesh(sides, sideMat), 'Sides'));
  const top = new ExtrudeGeometry(outline, { depth: 0.003, bevelEnabled: false, curveSegments: 4 });
  top.translate(0, 0, -0.003);
  body.add(named(new Mesh(top, topMat), 'Top'));

  const rosette = named(new Mesh(new RingGeometry(0.045, 0.054, 48), darkMat), 'Rosette');
  rosette.position.z = 0.0004;
  body.add(rosette);
  const soundHole = named(new Mesh(new CircleGeometry(0.043, 48), darkMat), 'SoundHole');
  soundHole.position.z = 0.0003;
  body.add(soundHole);

  const bridge = named(new Mesh(new BoxGeometry(0.03, 0.15, 0.008), darkMat), 'Bridge');
  bridge.position.set(GUITAR.bridgeX - 0.008, 0, 0.004);
  body.add(bridge);
  const saddle = named(new Mesh(new BoxGeometry(0.003, 0.075, 0.016), boneMat), 'Saddle');
  saddle.position.set(GUITAR.bridgeX, 0, 0.008);
  body.add(saddle);

  // Neck and fretboard: tapered slabs from over the body to the nut.
  const neck = named(new Mesh(neckGeometry(NECK_START, GUITAR.nutX + 0.004), neckMat), 'Neck');
  root.add(neck);
  const board = named(new Mesh(boardGeometry(GUITAR.boardEndX, GUITAR.nutX), boardMat), 'Fretboard');
  root.add(board);

  const nut = named(new Mesh(new BoxGeometry(0.005, GUITAR.neckWidthNut, 0.008), boneMat), 'Nut');
  nut.position.set(GUITAR.nutX + 0.0025, 0, GUITAR.boardTopZ + 0.003);
  root.add(nut);

  const fretGeo = new BoxGeometry(0.0022, 1, 0.0016);
  const frets: Mesh[] = [];
  for (let n = 1; n <= GUITAR.fretCount; n++) {
    const x = fretX(n);
    const fret = named(new Mesh(fretGeo, metalMat), `Fret${n}`);
    fret.scale.y = stringSpan(x) + 0.012;
    fret.position.set(x, 0, GUITAR.boardTopZ + 0.0008);
    root.add(fret);
    frets.push(fret);
  }

  const inlayGeo = new CircleGeometry(0.0042, 20);
  const inlays: Mesh[] = [];
  const addInlay = (n: number, y: number) => {
    const dot = named(new Mesh(inlayGeo, boneMat), `Inlay${n}`);
    dot.position.set((fretX(n) + fretX(n - 1)) / 2, y, GUITAR.boardTopZ + 0.0003);
    root.add(dot);
    inlays.push(dot);
  };
  for (const n of INLAY_FRETS) addInlay(n, 0);
  addInlay(12, 0.011);
  addInlay(12, -0.011);

  // Headstock, tilted back like a real one, with tuners.
  const head = new Group();
  head.name = 'Headstock';
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
  const strings: Mesh[] = [];
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
    string.name = `String${s}`;
    const radius = 0.0012 - s * 0.0001;
    placeString(string, s, GUITAR.nutX, radius);
    root.add(string);
    strings.push(string);

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
    body,
    outline: outlinePoints,
    neck,
    board,
    head,
    nut,
    frets,
    inlays,
    strings,
    materials: { top: topMat, side: sideMat, neck: neckMat, board: boardMat },
  };
}

function named<T extends Mesh>(mesh: T, name: string): T {
  mesh.name = name;
  return mesh;
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

/** Sign border colours for the instruments' states; playing is the hints' sky blue, smashing red. */
export const ACCENT = { idle: '#8a8f99', playing: '#85b7eb', placing: '#3dff8f', smash: '#ff4a3d' };

/** The hint colour shared with the panel's pictograms: a sky-blue disc, a navy glyph. */
const HINT_DISC = '#85b7eb';
const HINT_GLYPH = '#042c53';
/** Smashing hints: a red disc, a dark red glyph, and the chevrons that join them. */
const SMASH_DISC = '#ff6a5c';
const SMASH_GLYPH = '#3a0703';
const SMASH_LINK = '#ff9a90';
const HINT_LINK = '#a9cdf2';

/** One pictogram on a sign: an icon in a disc, over a one- or two-word caption if it needs one. */
export interface HudStep {
  icon: HudIcon;
  caption?: string;
  /** A reminder rather than the next thing to do, drawn faded. */
  faint?: boolean;
  /** About smashing the instrument: drawn red. */
  smash?: boolean;
}

/**
 * What a sign shows: pictograms for what to do, and live feedback (the
 * chord, note or hit) as short text. Any part may be left out.
 */
export interface HudSign {
  /** The large readout. */
  headline?: string;
  /** A short line under the headline. */
  detail?: string;
  /** Valves held down as a fingering name ('0', '1-3'), drawn as three dots. */
  valves?: string;
  steps?: readonly HudStep[];
  /** The steps are a sequence, read left to right: chevrons join them (a faint step stands apart). */
  chain?: boolean;
}

/** Path2D needs the DOM, so the icons are built on first use. */
const iconPaths = new Map<HudIcon, Path2D[]>();
function iconPath(icon: HudIcon): Path2D[] {
  let paths = iconPaths.get(icon);
  if (paths == null) {
    paths = HUD_ICONS[icon].map((d) => new Path2D(d));
    iconPaths.set(icon, paths);
  }
  return paths;
}

/** A camera-facing sign sprite backed by a canvas, redrawn only on change. */
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

  /**
   * Draws the readout on the left and the pictograms on the right, or
   * whichever of them there is centred.
   */
  draw(sign: HudSign, accent = ACCENT.idle): void {
    const steps = sign.steps ?? [];
    let key = `${sign.headline}|${sign.detail}|${sign.valves}|${accent}|${sign.chain === true}`;
    for (const step of steps) key += `|${step.icon}:${step.caption}:${step.faint === true}:${step.smash === true}`;
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

    const pad = height * 0.1;
    const hasText = sign.headline != null || sign.detail != null || sign.valves != null;
    // Pictograms with no words say it all, so they are drawn bigger.
    const bare = steps.length > 0 && steps.every((s) => s.caption == null);
    const most = bare ? height * (hasText ? 0.66 : 0.86) : height * 0.7;
    // A readout keeps at least a third of the sign.
    const room = hasText ? width * 0.66 - pad : width - 2 * pad;
    const stepWidth = steps.length === 0 ? 0 : Math.min(most, room / steps.length);
    const textRight = width - pad - stepWidth * steps.length;
    if (hasText) this.drawReadout(g, sign, pad, steps.length === 0 ? width - pad : textRight - pad * 0.5);
    let x = hasText ? textRight : (width - stepWidth * steps.length) / 2;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (sign.chain === true && i > 0) this.drawLink(g, x, stepWidth, step.faint === true, step.smash === true);
      this.drawStep(g, step, x + stepWidth / 2, stepWidth);
      x += stepWidth;
    }
    this.texture.needsUpdate = true;
  }

  /** Between two steps at `x`: a chevron (then) or, before a faint step, a dot (or). */
  private drawLink(g: CanvasRenderingContext2D, x: number, room: number, faint: boolean, smash: boolean): void {
    const { height } = this.canvas;
    const cy = height * 0.5;
    const size = Math.min(room * 0.07, height * 0.05);
    g.save();
    g.strokeStyle = g.fillStyle = smash ? SMASH_LINK : HINT_LINK;
    if (faint) {
      g.globalAlpha = 0.6;
      g.beginPath();
      g.arc(x, cy, size * 0.45, 0, Math.PI * 2);
      g.fill();
    } else {
      g.lineWidth = size * 0.55;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(x - size * 0.45, cy - size);
      g.lineTo(x + size * 0.55, cy);
      g.lineTo(x - size * 0.45, cy + size);
      g.stroke();
    }
    g.restore();
  }

  /** The headline, valve dots and detail line, stacked and centred between `left` and `right`. */
  private drawReadout(g: CanvasRenderingContext2D, sign: HudSign, left: number, right: number): void {
    const { height } = this.canvas;
    const room = right - left;
    const cx = (left + right) / 2;
    const detailSize = height * 0.12;
    const dot = height * 0.045;
    let big = sign.headline != null ? height * 0.36 : 0;
    if (sign.headline != null) {
      g.font = `700 ${big}px system-ui, sans-serif`;
      big *= Math.min(1, room / Math.max(1, g.measureText(sign.headline).width));
    }
    const valvesHeight = sign.valves != null ? dot * 2 + height * 0.06 : 0;
    const detailHeight = sign.detail != null ? detailSize * 1.4 : 0;
    let y = (height - big - valvesHeight - detailHeight) / 2;

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (sign.headline != null) {
      g.font = `700 ${big}px system-ui, sans-serif`;
      g.fillStyle = '#ffffff';
      g.fillText(sign.headline, cx, y + big / 2);
      y += big;
    }
    if (sign.valves != null) {
      y += height * 0.06;
      g.lineWidth = height * 0.014;
      for (let v = 1; v <= 3; v++) {
        g.beginPath();
        g.arc(cx + (v - 2) * dot * 3, y + dot, dot, 0, Math.PI * 2);
        g.strokeStyle = HINT_DISC;
        g.stroke();
        if (sign.valves.includes(String(v))) {
          g.fillStyle = HINT_DISC;
          g.fill();
        }
      }
      y += dot * 2;
    }
    if (sign.detail != null) {
      g.font = `700 ${detailSize}px system-ui, sans-serif`;
      g.fillStyle = '#c8ccd4';
      g.fillText(sign.detail, cx, y + detailHeight / 2, room);
    }
  }

  /** A disc with the icon in it and the caption, if any, under it, centred on `cx`. */
  private drawStep(g: CanvasRenderingContext2D, step: HudStep, cx: number, room: number): void {
    const { height } = this.canvas;
    const captioned = step.caption != null;
    const radius = captioned ? height * 0.2 : Math.min(height * 0.3, room * 0.38);
    const cy = captioned ? height * 0.42 : height * 0.5;
    const smash = step.smash === true;
    g.save();
    g.globalAlpha = step.faint === true ? 0.45 : 1;
    g.beginPath();
    g.arc(cx, cy, radius, 0, Math.PI * 2);
    g.fillStyle = smash ? SMASH_DISC : HINT_DISC;
    g.fill();

    const glyph = radius * 1.15;
    g.save();
    g.translate(cx - glyph / 2, cy - glyph / 2);
    g.scale(glyph / 24, glyph / 24);
    g.lineWidth = 2.2;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = smash ? SMASH_GLYPH : HINT_GLYPH;
    for (const path of iconPath(step.icon)) g.stroke(path);
    g.restore();

    if (step.caption == null) {
      g.restore();
      return;
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `700 ${height * 0.095}px system-ui, sans-serif`;
    g.fillStyle = '#e4e5e9';
    g.fillText(step.caption, cx, cy + radius + height * 0.12, room * 0.94);
    g.restore();
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
