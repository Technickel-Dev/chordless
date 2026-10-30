/**
 * The pair of cymbals the system moves with the hands: the model from the
 * asset module twice (the second a clone, sharing its geometry and maps),
 * each with a glow round its rim that shows it ringing, plus the HUD.
 */

import { AdditiveBlending, DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry } from '@iwsdk/core';
import { LabelSprite } from '../guitar/guitar-model.js';
import { createCymbal } from '../scene-assets/cymbal.scene-asset.js';
import { CYMBAL } from './geometry.js';

export interface CymbalsModel {
  /** The cymbals in the left and right hands, in cymbal space (see geometry.ts). */
  cymbals: [Group, Group];
  /** Glow round each rim, brighter while it rings. */
  glows: [Mesh, Mesh];
  glowMaterials: [MeshBasicMaterial, MeshBasicMaterial];
  hud: LabelSprite;
}

export function createCymbalsModel(): CymbalsModel {
  const plate = createCymbal();
  const glowGeo = new RingGeometry(CYMBAL.radius - 0.02, CYMBAL.radius + 0.004, 96);
  const make = (name: string, cymbal: Group) => {
    const root = new Group();
    root.name = name;
    root.add(cymbal);
    const mat = new MeshBasicMaterial({
      color: 0xffc040,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    });
    const glow = new Mesh(glowGeo, mat);
    glow.name = `${name}Glow`;
    glow.position.z = 0.0015;
    glow.visible = false;
    root.add(glow);
    return { root, glow, mat };
  };
  const left = make('AirCymbalLeft', plate);
  const right = make('AirCymbalRight', plate.clone());

  const hud = new LabelSprite(512, 256);
  hud.sprite.name = 'AirCymbalsDisplay';
  hud.sprite.scale.set(0.2, 0.1, 1);
  return { cymbals: [left.root, right.root], glows: [left.glow, right.glow], glowMaterials: [left.mat, right.mat], hud };
}
