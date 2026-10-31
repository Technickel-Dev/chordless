/**
 * The kit the system places and plays: the model from the asset module,
 * a glow round each piece's rim that flashes when it is struck, a stick
 * for each hand and the HUD, all in kit space (see geometry.ts).
 */

import { AdditiveBlending, DoubleSide, Group, Mesh, MeshBasicMaterial, Object3D, RingGeometry } from '@iwsdk/core';
import { LabelSprite } from '../guitar/guitar-model.js';
import { createDrumKit, createDrumstick, PIECE_NAMES } from '../scene-assets/drum-kit.scene-asset.js';
import { PIECES } from './geometry.js';

export interface KitModel {
  /** The whole kit, placed in front of the player. */
  root: Group;
  /** Everything on the stands' inner tubes, raised or lowered to the player. */
  rig: Object3D;
  /** Each piece's group (origin on its playing surface, +Y out of it), in PIECES order. */
  pieces: Object3D[];
  /** What swings on each piece when struck (a cymbal's plate), or null. */
  swings: (Object3D | null)[];
  glows: Mesh[];
  glowMaterials: MeshBasicMaterial[];
  /** The kick pedal's beater, which swings onto the bass drum when the pad is struck. */
  beater: Object3D;
  /** The sticks in the left and right hands, in stick space, children of the root. */
  sticks: [Group, Group];
  hud: LabelSprite;
}

export function createKitModel(): KitModel {
  const root = createDrumKit();
  root.name = 'AirDrums';
  const find = (name: string) => {
    const o = root.getObjectByName(name);
    if (o == null) throw new Error(`drum kit has no ${name}`);
    return o;
  };
  const pieces = PIECES.map((p) => find(PIECE_NAMES[p.id]));
  const swings = PIECES.map((p, i) => (p.kind === 'cymbal' ? pieces[i].getObjectByName('Plate') ?? null : null));
  const glows: Mesh[] = [];
  const glowMaterials: MeshBasicMaterial[] = [];
  PIECES.forEach((p, i) => {
    const mat = new MeshBasicMaterial({
      color: 0xffc040,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    });
    const glow = new Mesh(new RingGeometry(p.radius - 0.015, p.radius + 0.006, 64), mat);
    glow.name = `${PIECE_NAMES[p.id]}Glow`;
    glow.rotation.x = -Math.PI / 2;
    // Just over a drum's hoop; on a cymbal, at its edge.
    glow.position.y = p.kind === 'cymbal' ? -0.008 : 0.01;
    glow.visible = false;
    glow.userData.iwsdkPreviewBounds = 'exclude';
    (swings[i] ?? pieces[i]).add(glow);
    glows.push(glow);
    glowMaterials.push(mat);
  });

  const stick = createDrumstick();
  const left = stick;
  left.name = 'AirDrumstickLeft';
  const right = stick.clone();
  right.name = 'AirDrumstickRight';
  root.add(left, right);

  const hud = new LabelSprite(512, 256);
  hud.sprite.name = 'AirDrumsDisplay';
  hud.sprite.scale.set(0.3, 0.15, 1);
  root.add(hud.sprite);
  return { root, rig: find('Rig'), pieces, swings, glows, glowMaterials, beater: find('KickBeater'), sticks: [left, right], hud };
}
