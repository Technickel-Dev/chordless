/**
 * The playable violin and bow: the models from the asset module, plus the
 * overlays the system animates (glowing strings, stop markers, fingertip
 * shadows, the bow's contact point and the HUD).
 */

import {
  CircleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  RingGeometry,
  Vector3,
} from '@iwsdk/core';
import { LabelSprite } from '../guitar/guitar-model.js';
import { createBow, createViolin } from '../scene-assets/violin.scene-asset.js';
import { STRING_COUNT, stringY, stringZ, VIOLIN } from './geometry.js';

export interface ViolinModel {
  root: Group;
  bow: Group;
  /** Glow over each string's sounding length, bridge to stop. */
  vibrations: Mesh[];
  vibrationMaterials: MeshBasicMaterial[];
  /** Marker where each string is stopped, hidden when open. */
  stopDots: Mesh[];
  /** Shadows of the left fingertips on the fingerboard. */
  fingerShadows: Mesh[];
  fingerShadowMaterials: MeshBasicMaterial[];
  /** Where the bow's hair meets the strings. */
  bowMark: Mesh;
  hud: LabelSprite;
}

export function createViolinModel(): ViolinModel {
  const root = new Group();
  root.name = 'AirViolin';
  root.add(createViolin());

  const unit = new CylinderGeometry(1, 1, 1, 6);
  const vibrations: Mesh[] = [];
  const vibrationMaterials: MeshBasicMaterial[] = [];
  const stopDots: Mesh[] = [];
  const dotGeo = new CircleGeometry(0.0032, 16);
  const dotMat = new MeshBasicMaterial({ color: 0x3dff8f, depthWrite: false });
  for (let s = 0; s < STRING_COUNT; s++) {
    const mat = new MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0, depthWrite: false });
    const glow = new Mesh(unit, mat);
    glow.visible = false;
    root.add(glow);
    vibrations.push(glow);
    vibrationMaterials.push(mat);
    const dot = new Mesh(dotGeo, dotMat);
    dot.visible = false;
    root.add(dot);
    stopDots.push(dot);
  }

  const shadowGeo = new CircleGeometry(0.005, 20);
  const fingerShadows: Mesh[] = [];
  const fingerShadowMaterials: MeshBasicMaterial[] = [];
  for (let i = 0; i < 4; i++) {
    const mat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
    const shadow = new Mesh(shadowGeo, mat);
    shadow.visible = false;
    root.add(shadow);
    fingerShadows.push(shadow);
    fingerShadowMaterials.push(mat);
  }

  const bowMark = new Mesh(
    new RingGeometry(0.003, 0.0055, 20),
    new MeshBasicMaterial({ color: 0xffb000, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  bowMark.visible = false;
  root.add(bowMark);

  const hud = new LabelSprite(512, 256);
  hud.sprite.name = 'ViolinDisplay';
  hud.sprite.scale.set(0.16, 0.08, 1);
  hud.sprite.position.set(VIOLIN.nutX + 0.12, -0.06, 0.12);
  root.add(hud.sprite);

  const bow = new Group();
  bow.name = 'AirBow';
  bow.add(createBow());

  return { root, bow, vibrations, vibrationMaterials, stopDots, fingerShadows, fingerShadowMaterials, bowMark, hud };
}

const start = new Vector3();
const end = new Vector3();
const dir = new Vector3();
const yAxis = new Vector3(0, 1, 0);
const rotation = new Quaternion();

/** Stretches a unit cylinder along string `s` from the bridge to `stopX` (the nut, or where it is stopped). */
export function placeString(mesh: Mesh, s: number, stopX: number, radius: number): void {
  start.set(VIOLIN.bridgeX, stringY(s, VIOLIN.bridgeX), stringZ(s, VIOLIN.bridgeX));
  end.set(stopX, stringY(s, stopX), stringZ(s, stopX));
  dir.subVectors(end, start);
  mesh.scale.set(radius, dir.length(), radius);
  mesh.quaternion.copy(rotation.setFromUnitVectors(yAxis, dir.normalize()));
  mesh.position.addVectors(start, end).multiplyScalar(0.5);
}
