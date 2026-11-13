import { createComponent } from '@iwsdk/core';
import { frettedFields } from '../guitar/air-guitar-component.js';

/**
 * State of the air bass; AirBassSystem creates its entity. Fields as for the
 * guitar (its tone, hold and condition enums included), for four strings.
 */
export const AirBass = createComponent('AirBass', frettedFields(4, 'low E', false));
