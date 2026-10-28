/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { AssetType, defineAssets } from '@iwsdk/core';
import { createBathtubSet } from './scene-assets/bathtub.scene-asset.js';
import { createBirthdayCakeSet } from './scene-assets/birthday-cake.scene-asset.js';
import { createBlossomGardenSet } from './scene-assets/blossom-garden.scene-asset.js';
import { createBreakRoomSet } from './scene-assets/break-room.scene-asset.js';
import { createCliffsideSet } from './scene-assets/cliffside.scene-asset.js';
import { createDentistSet } from './scene-assets/dentist.scene-asset.js';
import { createFarmSet } from './scene-assets/farm.scene-asset.js';
import { createGiantTableSet } from './scene-assets/giant-table.scene-asset.js';
import { createIceFloeSet } from './scene-assets/ice-floe.scene-asset.js';
import { createLanternLakeSet } from './scene-assets/lantern-lake.scene-asset.js';
import { createLaundromatSet } from './scene-assets/laundromat.scene-asset.js';
import { createTheatreMaterials } from './scene-assets/lib/theatre-kit.js';
import { createLivingRoomSet } from './scene-assets/living-room.scene-asset.js';
import { createNorthernLightsSet } from './scene-assets/northern-lights.scene-asset.js';
import { createTheatreHouse } from './scene-assets/theatre-house.scene-asset.js';
import { createLightingRig } from './scene-assets/theatre-rig.scene-asset.js';
import { createTheatreStage } from './scene-assets/theatre-stage.scene-asset.js';
import { createUnderwaterSet } from './scene-assets/underwater.scene-asset.js';
import { createWeddingSet } from './scene-assets/wedding.scene-asset.js';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

const uikitml = (fileName: string, name: string) => ({
  url: publicAssetUrl(`ui/${fileName}`),
  type: AssetType.UIKitML,
  name,
});

// One material set shared by the theatre's three pieces.
const theatre = createTheatreMaterials();

export default defineAssets({
  'theatre-stage': createTheatreStage(theatre),
  'theatre-house': createTheatreHouse(theatre),
  'theatre-rig': createLightingRig(theatre),
  // One set per alternative scene; see src/scene-list.ts.
  'farm-set': createFarmSet(),
  'living-room-set': createLivingRoomSet(),
  'birthday-cake-set': createBirthdayCakeSet(),
  'dentist-set': createDentistSet(),
  'laundromat-set': createLaundromatSet(),
  'ice-floe-set': createIceFloeSet(),
  'break-room-set': createBreakRoomSet(),
  'giant-table-set': createGiantTableSet(),
  'bathtub-set': createBathtubSet(),
  'wedding-set': createWeddingSet(),
  'cliffside-set': createCliffsideSet(),
  'northern-lights-set': createNorthernLightsSet(),
  'underwater-set': createUnderwaterSet(),
  'lantern-lake-set': createLanternLakeSet(),
  'blossom-garden-set': createBlossomGardenSet(),
  'welcome-panel': uikitml('welcome.uikitml', 'Welcome Panel'),
});
