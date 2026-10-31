/**
 * The triangle and beater the system moves with the hands: the models from
 * the asset module, a glow along the bar that shows it ringing, and the HUD.
 */

import { AdditiveBlending, CatmullRomCurve3, Group, Mesh, MeshBasicMaterial, TubeGeometry, Vector3 } from '@iwsdk/core';
import { LabelSprite } from '../guitar/guitar-model.js';
import { createBeater, createTriangle } from '../scene-assets/triangle.scene-asset.js';
import { BAR, TRIANGLE } from './geometry.js';

export interface TriangleModel {
  /** The triangle, in triangle space (see geometry.ts), named AirTriangle. */
  triangle: Group;
  /** The beater, in beater space, named AirTriangleBeater. */
  beater: Group;
  glow: Mesh;
  glowMaterial: MeshBasicMaterial;
  hud: LabelSprite;
}

export function createTriangleModel(): TriangleModel {
  const triangle = new Group();
  triangle.name = 'AirTriangle';
  triangle.add(createTriangle());
  const line: Vector3[] = [];
  for (let i = 0; i < BAR.count; i++) line.push(new Vector3(BAR.points[i * 3], BAR.points[i * 3 + 1], BAR.points[i * 3 + 2]));
  const glowMaterial = new MeshBasicMaterial({
    color: 0xfff0b0,
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const glow = new Mesh(new TubeGeometry(new CatmullRomCurve3(line, false, 'centripetal'), 200, TRIANGLE.barRadius * 1.9, 10, false), glowMaterial);
  glow.name = 'AirTriangleGlow';
  glow.visible = false;
  triangle.add(glow);

  const beater = new Group();
  beater.name = 'AirTriangleBeater';
  beater.add(createBeater());

  const hud = new LabelSprite(512, 256);
  hud.sprite.name = 'AirTriangleDisplay';
  hud.sprite.scale.set(0.2, 0.1, 1);
  return { triangle, beater, glow, glowMaterial, hud };
}
