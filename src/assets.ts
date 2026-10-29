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
import { createClockTowerSet } from './scene-assets/clock-tower.scene-asset.js';
import { createDentistSet } from './scene-assets/dentist.scene-asset.js';
import { createDesertCanyonSet } from './scene-assets/desert-canyon.scene-asset.js';
import { createFarmSet } from './scene-assets/farm.scene-asset.js';
import { createGiantTableSet } from './scene-assets/giant-table.scene-asset.js';
import { createGiantTurtleSet } from './scene-assets/giant-turtle.scene-asset.js';
import { createIceFloeSet } from './scene-assets/ice-floe.scene-asset.js';
import { createJazzClubSet } from './scene-assets/jazz-club.scene-asset.js';
import { createLanternLakeSet } from './scene-assets/lantern-lake.scene-asset.js';
import { createLaundromatSet } from './scene-assets/laundromat.scene-asset.js';
import { createTheatreMaterials } from './scene-assets/lib/theatre-kit.js';
import { createLibrarySet } from './scene-assets/library.scene-asset.js';
import { createLivingRoomSet } from './scene-assets/living-room.scene-asset.js';
import { createMountaintopSet } from './scene-assets/mountaintop.scene-asset.js';
import { createMuseumSet } from './scene-assets/museum.scene-asset.js';
import { createNorthernLightsSet } from './scene-assets/northern-lights.scene-asset.js';
import { createPirateShipSet } from './scene-assets/pirate-ship.scene-asset.js';
import { createRainyRooftopSet } from './scene-assets/rainy-rooftop.scene-asset.js';
import { createSnowGlobeSet } from './scene-assets/snow-globe.scene-asset.js';
import { createSpaceStationSet } from './scene-assets/space-station.scene-asset.js';
import { createStadiumSet } from './scene-assets/stadium.scene-asset.js';
import { createSurrealDesertSet } from './scene-assets/surreal-desert.scene-asset.js';
import { createTheatreHouse } from './scene-assets/theatre-house.scene-asset.js';
import { createLightingRig } from './scene-assets/theatre-rig.scene-asset.js';
import { createTheatreStage } from './scene-assets/theatre-stage.scene-asset.js';
import { createTrainRoofSet } from './scene-assets/train-roof.scene-asset.js';
import { createUnderwaterSet } from './scene-assets/underwater.scene-asset.js';
import { createVolcanoRimSet } from './scene-assets/volcano-rim.scene-asset.js';
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
  'desert-canyon-set': createDesertCanyonSet(),
  'rainy-rooftop-set': createRainyRooftopSet(),
  'stadium-set': createStadiumSet(),
  'space-station-set': createSpaceStationSet(),
  'volcano-rim-set': createVolcanoRimSet(),
  'train-roof-set': createTrainRoofSet(),
  'jazz-club-set': createJazzClubSet(),
  'mountaintop-set': createMountaintopSet(),
  'pirate-ship-set': createPirateShipSet(),
  'snow-globe-set': createSnowGlobeSet(),
  'library-set': createLibrarySet(),
  'clock-tower-set': createClockTowerSet(),
  'giant-turtle-set': createGiantTurtleSet(),
  'museum-set': createMuseumSet(),
  'surreal-desert-set': createSurrealDesertSet(),
  'welcome-panel': uikitml('welcome.uikitml', 'Welcome Panel'),
});
