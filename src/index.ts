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
import { AirPianoSystem } from './piano/air-piano-system.js';
import { AirDrumsSystem } from './drums/air-drums-system.js';
import { AirTrumpetSystem } from './trumpet/air-trumpet-system.js';
import { AirTromboneSystem } from './trombone/air-trombone-system.js';
import { AirHornSystem } from './horn/air-horn-system.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(AirGuitarSystem);
  world.registerSystem(AirViolinSystem);
  world.registerSystem(AirCelloSystem);
  world.registerSystem(AirCymbalsSystem);
  world.registerSystem(AirTriangleSystem);
  world.registerSystem(AirPianoSystem);
  world.registerSystem(AirDrumsSystem);
  world.registerSystem(AirTrumpetSystem);
  world.registerSystem(AirTromboneSystem);
  world.registerSystem(AirHornSystem);
  world.registerSystem(PanelSystem);
});
