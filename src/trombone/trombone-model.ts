/**
 * The trombone the system moves with the hands: the model from the asset
 * module, its outer slide found by name so the right hand can move it,
 * plus the HUD.
 */

import { Group, Object3D } from '@iwsdk/core';
import { LabelSprite } from '../guitar/guitar-model.js';
import { createTrombone } from '../scene-assets/trombone.scene-asset.js';

export interface TromboneModel {
  /** The trombone, in trombone space (see geometry.ts). */
  trombone: Group;
  /** The outer slide, closed at z = 0; it moves out along -Z. */
  slide: Object3D;
  hud: LabelSprite;
}

export function createTromboneModel(): TromboneModel {
  const trombone = createTrombone();
  trombone.name = 'AirTrombone';
  const slide = trombone.getObjectByName('TromboneSlide');
  if (slide == null) throw new Error('trombone model has no TromboneSlide');
  const hud = new LabelSprite(512, 256);
  hud.sprite.name = 'AirTromboneDisplay';
  hud.sprite.scale.set(0.2, 0.1, 1);
  return { trombone, slide, hud };
}
