/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { AssetType, defineAssets } from '@iwsdk/core';
import {
  createGallerySet,
  createSideboardSet,
} from './scene-assets/decor.scene-asset.js';
import {
  createStage,
  createStudioFloor,
} from './scene-assets/studio.scene-asset.js';
import { CELLO_BOW } from './cello/geometry.js';
import { createCymbal } from './scene-assets/cymbal.scene-asset.js';
import { createBeater, createTriangle } from './scene-assets/triangle.scene-asset.js';
import { createBow, createCello, createViolin } from './scene-assets/violin.scene-asset.js';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

const uikitml = (fileName: string, name: string) => ({
  url: publicAssetUrl(`ui/${fileName}`),
  type: AssetType.UIKitML,
  name,
});

export default defineAssets({
  'studio-floor': createStudioFloor(),
  stage: createStage(),
  'gallery-set': createGallerySet(),
  'sideboard-set': createSideboardSet(),
  'welcome-panel': uikitml('welcome.uikitml', 'Welcome Panel'),
  violin: createViolin(),
  'violin-bow': createBow(),
  cello: createCello(),
  'cello-bow': createBow(CELLO_BOW),
  cymbal: createCymbal(),
  triangle: createTriangle(),
  'triangle-beater': createBeater(),
});
