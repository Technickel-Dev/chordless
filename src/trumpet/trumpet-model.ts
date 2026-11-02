/**
 * The trumpet the system moves with the hands: the model from the asset
 * module, its three pistons found by name so the fingers can push them
 * down, plus the HUD.
 */

import { Group, Object3D } from '@iwsdk/core';
import { LabelSprite } from '../guitar/guitar-model.js';
import { createTrumpet } from '../scene-assets/trumpet.scene-asset.js';

export interface TrumpetModel {
  /** The trumpet, in trumpet space (see geometry.ts). */
  trumpet: Group;
  /** The first, second and third valves' pistons, at rest at y = 0. */
  pistons: [Object3D, Object3D, Object3D];
  hud: LabelSprite;
}

export function createTrumpetModel(): TrumpetModel {
  const trumpet = createTrumpet();
  trumpet.name = 'AirTrumpet';
  const piston = (n: number) => {
    const p = trumpet.getObjectByName(`TrumpetValve${n}`);
    if (p == null) throw new Error(`trumpet model has no TrumpetValve${n}`);
    return p;
  };
  const hud = new LabelSprite(512, 256);
  hud.sprite.name = 'AirTrumpetDisplay';
  hud.sprite.scale.set(0.2, 0.1, 1);
  return { trumpet, pistons: [piston(1), piston(2), piston(3)], hud };
}
