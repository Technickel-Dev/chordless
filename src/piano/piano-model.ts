/**
 * The piano the system plays: the model from the asset module, its keys
 * gathered for pressing, a lit variant of the key materials to show which
 * notes sound, and the HUD above the music rest.
 */

import { Color, Mesh, MeshStandardMaterial, Object3D, Group } from '@iwsdk/core';
import { LabelSprite } from '../guitar/guitar-model.js';
import { createPiano } from '../scene-assets/piano.scene-asset.js';
import { KEY_COUNT, PIANO } from './geometry.js';

export interface PianoModel {
  root: Group;
  /** Each key's pivot, indexed by midi - PIANO.lowest. */
  keys: Object3D[];
  bodies: Mesh[];
  /** Each key's material at rest and while its note sounds. */
  restMaterials: MeshStandardMaterial[];
  litMaterials: MeshStandardMaterial[];
  hud: LabelSprite;
}

export function createPianoModel(): PianoModel {
  const root = createPiano();
  root.name = 'AirPiano';
  const keys: Object3D[] = [];
  const bodies: Mesh[] = [];
  const restMaterials: MeshStandardMaterial[] = [];
  const litMaterials: MeshStandardMaterial[] = [];
  const lit = new Map<MeshStandardMaterial, MeshStandardMaterial>();
  for (let i = 0; i < KEY_COUNT; i++) {
    const midi = PIANO.lowest + i;
    const pivot = root.getObjectByName(`Key${midi}`)!;
    const body = root.getObjectByName(`Key${midi}Body`) as Mesh;
    const rest = body.material as MeshStandardMaterial;
    if (!lit.has(rest)) {
      const glow = rest.clone();
      glow.name = `${rest.name}Lit`;
      glow.emissive = new Color(0xffa020);
      glow.emissiveIntensity = rest.name === 'Ebony' ? 0.55 : 0.3;
      lit.set(rest, glow);
    }
    keys.push(pivot);
    bodies.push(body);
    restMaterials.push(rest);
    litMaterials.push(lit.get(rest)!);
  }

  const hud = new LabelSprite(512, 256);
  hud.sprite.name = 'AirPianoDisplay';
  hud.sprite.scale.set(0.2, 0.1, 1);
  root.getObjectByName('HudAnchor')!.add(hud.sprite);
  return { root, keys, bodies, restMaterials, litMaterials, hud };
}
