/**
 * The baton and music stand the system moves and plays: the models from
 * the asset module, a glow on each spot of the stand that flashes when it
 * is tapped, and the HUD.
 */

import { AdditiveBlending, BoxGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry } from '@iwsdk/core';
import { LabelSprite } from '../guitar/guitar-model.js';
import { createBaton, createMusicStand } from '../scene-assets/baton.scene-asset.js';
import { STAND } from './geometry.js';
import type { Spot } from './tap.js';

export interface BatonModel {
  /** The baton, in baton space, named AirBaton. */
  baton: Group;
  /** The music stand, in stand space, named AirMusicStand. */
  stand: Group;
  /** Raised or lowered to suit the player. */
  rig: Object3D;
  /** The desk, framed on its ledge: taps are found in its space. */
  desk: Object3D;
  glows: Record<Spot, Mesh>;
  glowMaterials: Record<Spot, MeshBasicMaterial>;
  hud: LabelSprite;
}

export function createBatonModel(): BatonModel {
  const baton = new Group();
  baton.name = 'AirBaton';
  baton.add(createBaton());

  const stand = createMusicStand();
  stand.name = 'AirMusicStand';
  const find = (name: string) => {
    const o = stand.getObjectByName(name);
    if (o == null) throw new Error(`music stand has no ${name}`);
    return o;
  };
  const desk = find('Desk');
  const material = () =>
    new MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
  const glowMaterials: Record<Spot, MeshBasicMaterial> = { rim: material(), desk: material(), ledge: material() };
  const w = STAND.deskWidth;
  const rim = new Mesh(new CylinderGeometry(STAND.rimRadius * 2.2, STAND.rimRadius * 2.2, w, 12).rotateZ(Math.PI / 2), glowMaterials.rim);
  rim.position.set(0, STAND.deskHeight - STAND.rimRadius * 0.6, -STAND.deskThickness / 2);
  const face = new Mesh(new PlaneGeometry(w, STAND.deskHeight), glowMaterials.desk);
  face.position.set(0, STAND.deskHeight / 2, 0.004);
  const ledge = new Mesh(new BoxGeometry(w, STAND.ledgeLip * 1.8, 0.012), glowMaterials.ledge);
  ledge.position.set(0, STAND.ledgeLip / 2, STAND.ledgeDepth - STAND.deskThickness);
  const glows: Record<Spot, Mesh> = { rim, desk: face, ledge };
  for (const [spot, glow] of Object.entries(glows)) {
    glow.name = `AirBaton${spot[0].toUpperCase()}${spot.slice(1)}Glow`;
    glow.visible = false;
    glow.userData.iwsdkPreviewBounds = 'exclude';
    desk.add(glow);
  }

  const hud = new LabelSprite(512, 256);
  hud.sprite.name = 'AirBatonDisplay';
  hud.sprite.scale.set(0.24, 0.12, 1);
  return { baton, stand, rig: find('Rig'), desk, glows, glowMaterials, hud };
}
