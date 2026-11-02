/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { defineComponents } from '@iwsdk/core';
import { AirGuitar } from './guitar/air-guitar-component.js';
import { AirCello } from './cello/air-cello-component.js';
import { AirCymbals } from './cymbals/air-cymbals-component.js';
import { AirDrums } from './drums/air-drums-component.js';
import { AirPiano } from './piano/air-piano-component.js';
import { AirTriangle } from './triangle/air-triangle-component.js';
import { AirTrumpet } from './trumpet/air-trumpet-component.js';
import { AirViolin } from './violin/air-violin-component.js';

export default defineComponents([AirGuitar, AirViolin, AirCello, AirCymbals, AirTriangle, AirPiano, AirDrums, AirTrumpet]);
