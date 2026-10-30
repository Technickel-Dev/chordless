import { createComponent } from '@iwsdk/core';
import { bowedFields } from '../violin/air-violin-component.js';

/** State of the air cello; AirCelloSystem creates its entity. Fields as for the violin. */
export const AirCello = createComponent('AirCello', bowedFields('C2 G2 D3 A3'));
