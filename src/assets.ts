/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { AssetType, defineAssets } from '@iwsdk/core';
import { createAirportRunwaySet } from './scene-assets/airport-runway.scene-asset.js';
import { createAutumnClearingSet } from './scene-assets/autumn-clearing.scene-asset.js';
import { createBalloonBasketSet } from './scene-assets/balloon-basket.scene-asset.js';
import { createBambooForestSet } from './scene-assets/bamboo-forest.scene-asset.js';
import { createBathtubSet } from './scene-assets/bathtub.scene-asset.js';
import { createBirthdayCakeSet } from './scene-assets/birthday-cake.scene-asset.js';
import { createBlossomGardenSet } from './scene-assets/blossom-garden.scene-asset.js';
import { createBouncyCastleSet } from './scene-assets/bouncy-castle.scene-asset.js';
import { createBowlingAlleySet } from './scene-assets/bowling-alley.scene-asset.js';
import { createBreakRoomSet } from './scene-assets/break-room.scene-asset.js';
import { createCarWashSet } from './scene-assets/car-wash.scene-asset.js';
import { createChessboardSet } from './scene-assets/chessboard.scene-asset.js';
import { createCliffsideSet } from './scene-assets/cliffside.scene-asset.js';
import { createClockTowerSet } from './scene-assets/clock-tower.scene-asset.js';
import { createDentistSet } from './scene-assets/dentist.scene-asset.js';
import { createDesertCanyonSet } from './scene-assets/desert-canyon.scene-asset.js';
import { createDriveInSet } from './scene-assets/drive-in.scene-asset.js';
import { createFarmSet } from './scene-assets/farm.scene-asset.js';
import { createFloatingIslandsSet } from './scene-assets/floating-islands.scene-asset.js';
import { createFridgeSet } from './scene-assets/fridge.scene-asset.js';
import { createGiantDeskSet } from './scene-assets/giant-desk.scene-asset.js';
import { createGiantTableSet } from './scene-assets/giant-table.scene-asset.js';
import { createGiantTurtleSet } from './scene-assets/giant-turtle.scene-asset.js';
import { createHelipadSet } from './scene-assets/helipad.scene-asset.js';
import { createIceCaveSet } from './scene-assets/ice-cave.scene-asset.js';
import { createIceFloeSet } from './scene-assets/ice-floe.scene-asset.js';
import { createJazzClubSet } from './scene-assets/jazz-club.scene-asset.js';
import { createLanternLakeSet } from './scene-assets/lantern-lake.scene-asset.js';
import { createLaundromatSet } from './scene-assets/laundromat.scene-asset.js';
import { createLavaLampSet } from './scene-assets/lava-lamp.scene-asset.js';
import { createLavenderFieldSet } from './scene-assets/lavender-field.scene-asset.js';
import { createTheatreMaterials } from './scene-assets/lib/theatre-kit.js';
import { createLibrarySet } from './scene-assets/library.scene-asset.js';
import { createLighthouseSet } from './scene-assets/lighthouse.scene-asset.js';
import { createLivingRoomSet } from './scene-assets/living-room.scene-asset.js';
import { createMiniGolfSet } from './scene-assets/mini-golf.scene-asset.js';
import { createMountaintopSet } from './scene-assets/mountaintop.scene-asset.js';
import { createMuseumSet } from './scene-assets/museum.scene-asset.js';
import { createNeonArcadeSet } from './scene-assets/neon-arcade.scene-asset.js';
import { createNorthernLightsSet } from './scene-assets/northern-lights.scene-asset.js';
import { createPaperWorldSet } from './scene-assets/paper-world.scene-asset.js';
import { createParkingGarageSet } from './scene-assets/parking-garage.scene-asset.js';
import { createPinballSet } from './scene-assets/pinball.scene-asset.js';
import { createPirateShipSet } from './scene-assets/pirate-ship.scene-asset.js';
import { createRainyRooftopSet } from './scene-assets/rainy-rooftop.scene-asset.js';
import { createRecordPlayerSet } from './scene-assets/record-player.scene-asset.js';
import { createRiceTerracesSet } from './scene-assets/rice-terraces.scene-asset.js';
import { createSchoolGymSet } from './scene-assets/school-gym.scene-asset.js';
import { createSkateBowlSet } from './scene-assets/skate-bowl.scene-asset.js';
import { createSnowGlobeSet } from './scene-assets/snow-globe.scene-asset.js';
import { createSpaceStationSet } from './scene-assets/space-station.scene-asset.js';
import { createStadiumSet } from './scene-assets/stadium.scene-asset.js';
import { createSupermarketSet } from './scene-assets/supermarket.scene-asset.js';
import { createSurrealDesertSet } from './scene-assets/surreal-desert.scene-asset.js';
import { createTheatreHouse } from './scene-assets/theatre-house.scene-asset.js';
import { createLightingRig } from './scene-assets/theatre-rig.scene-asset.js';
import { createTheatreStage } from './scene-assets/theatre-stage.scene-asset.js';
import { createTrainRoofSet } from './scene-assets/train-roof.scene-asset.js';
import { createTropicalBeachSet } from './scene-assets/tropical-beach.scene-asset.js';
import { createUnderwaterSet } from './scene-assets/underwater.scene-asset.js';
import { createUpsideDownRoomSet } from './scene-assets/upside-down-room.scene-asset.js';
import { createVolcanoRimSet } from './scene-assets/volcano-rim.scene-asset.js';
import { createWaterfallPoolSet } from './scene-assets/waterfall-pool.scene-asset.js';
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
  'bowling-alley-set': createBowlingAlleySet(),
  'fridge-set': createFridgeSet(),
  'car-wash-set': createCarWashSet(),
  'mini-golf-set': createMiniGolfSet(),
  'school-gym-set': createSchoolGymSet(),
  'parking-garage-set': createParkingGarageSet(),
  'giant-desk-set': createGiantDeskSet(),
  'bouncy-castle-set': createBouncyCastleSet(),
  'supermarket-set': createSupermarketSet(),
  'pinball-set': createPinballSet(),
  'lavender-field-set': createLavenderFieldSet(),
  'bamboo-forest-set': createBambooForestSet(),
  'waterfall-pool-set': createWaterfallPoolSet(),
  'autumn-clearing-set': createAutumnClearingSet(),
  'tropical-beach-set': createTropicalBeachSet(),
  'ice-cave-set': createIceCaveSet(),
  'rice-terraces-set': createRiceTerracesSet(),
  'airport-runway-set': createAirportRunwaySet(),
  'lighthouse-set': createLighthouseSet(),
  'balloon-basket-set': createBalloonBasketSet(),
  'helipad-set': createHelipadSet(),
  'drive-in-set': createDriveInSet(),
  'skate-bowl-set': createSkateBowlSet(),
  'neon-arcade-set': createNeonArcadeSet(),
  'floating-islands-set': createFloatingIslandsSet(),
  'chessboard-set': createChessboardSet(),
  'lava-lamp-set': createLavaLampSet(),
  'upside-down-room-set': createUpsideDownRoomSet(),
  'record-player-set': createRecordPlayerSet(),
  'paper-world-set': createPaperWorldSet(),
  'welcome-panel': uikitml('welcome.uikitml', 'Welcome Panel'),
});
