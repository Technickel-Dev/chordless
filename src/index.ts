/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { AirGuitarSystem } from './guitar/air-guitar-system.js';
import { PanelSystem } from './panel.js';
import { AirViolinSystem } from './violin/air-violin-system.js';
import { AirCelloSystem } from './cello/air-cello-system.js';
import { AirCymbalsSystem } from './cymbals/air-cymbals-system.js';
import { AirTriangleSystem } from './triangle/air-triangle-system.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(AirGuitarSystem);
  world.registerSystem(AirViolinSystem);
  world.registerSystem(AirCelloSystem);
  world.registerSystem(AirCymbalsSystem);
  world.registerSystem(AirTriangleSystem);
  world.registerSystem(PanelSystem);
});
