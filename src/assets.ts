/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { AssetType, defineAssets } from '@iwsdk/core';
import { createTheatreMaterials } from './scene-assets/lib/theatre-kit.js';
import { createTheatreHouse } from './scene-assets/theatre-house.scene-asset.js';
import { createLightingRig } from './scene-assets/theatre-rig.scene-asset.js';
import { createTheatreStage } from './scene-assets/theatre-stage.scene-asset.js';

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
  'welcome-panel': uikitml('welcome.uikitml', 'Welcome Panel'),
});
