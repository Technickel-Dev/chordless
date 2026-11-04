/**
 * The horn the system moves with the hands: the model from the asset
 * module, its three levers found by name so the left fingers can push them
 * down, plus the HUD.
 */

import { Group, Object3D } from '@iwsdk/core';
import { LabelSprite } from '../guitar/guitar-model.js';
import { createFrenchHorn } from '../scene-assets/french-horn.scene-asset.js';

export interface HornModel {
  /** The horn, in horn space (see geometry.ts). */
  horn: Group;
  /** The first, second and third valves' levers, at rest where the model puts them. */
  levers: [Object3D, Object3D, Object3D];
  hud: LabelSprite;
}

export function createHornModel(): HornModel {
  const horn = createFrenchHorn();
  horn.name = 'AirHorn';
  const lever = (n: number) => {
    const l = horn.getObjectByName(`HornLever${n}`);
    if (l == null) throw new Error(`horn model has no HornLever${n}`);
    return l;
  };
  const hud = new LabelSprite(512, 256);
  hud.sprite.name = 'AirHornDisplay';
  hud.sprite.scale.set(0.2, 0.1, 1);
  return { horn, levers: [lever(1), lever(2), lever(3)], hud };
}
