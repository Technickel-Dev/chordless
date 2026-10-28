/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createSystem, Entity, UIKitMLAsset, VisibilityState } from '@iwsdk/core';
import { AirGuitar, GuitarToneMode } from './guitar/air-guitar-component.js';

export class PanelSystem extends createSystem({
  guitars: { required: [AirGuitar] },
}) {
  init(): void {
    const panel = this.world.getSceneObject<UIKitMLAsset>('welcome-panel');
    if (panel == null) return;

    this.wireGuitarControls(panel);

    const xrButton = panel.getElementById('xr-button');
    const exitButton = panel.getElementById('exit-button');
    if (xrButton == null || exitButton == null) {
      return;
    }
    if (!this.world.xrEnabled) {
      xrButton.setProperties({ display: 'none' });
      exitButton.setProperties({ display: 'none' });
      return;
    }

    const launchXR = () => this.world.launchXR();
    const exitXR = () => this.world.exitXR();
    xrButton.addEventListener('click', launchXR);
    exitButton.addEventListener('click', exitXR);
    this.cleanupFuncs.push(
      () => xrButton.removeEventListener('click', launchXR),
      () => exitButton.removeEventListener('click', exitXR),
      this.world.visibilityState.subscribe((visibilityState) => {
        const is2D = visibilityState === VisibilityState.NonImmersive;
        xrButton.setProperties({ display: is2D ? 'flex' : 'none' });
        exitButton.setProperties({ display: is2D ? 'none' : 'flex' });
      }),
    );
  }

  /** Tone, volume and reset buttons write to the AirGuitar component. */
  private wireGuitarControls(panel: UIKitMLAsset): void {
    const clean = panel.getElementById('tone-clean');
    const drive = panel.getElementById('tone-drive');
    const showTone = (tone: string) => {
      clean?.setProperties({ variant: tone === GuitarToneMode.Clean ? 'primary' : 'secondary' });
      drive?.setProperties({ variant: tone === GuitarToneMode.Drive ? 'primary' : 'secondary' });
    };
    const forEachGuitar = (fn: (e: Entity) => void) => {
      for (const entity of this.queries.guitars.entities) fn(entity);
    };
    const handlers: [string, () => void][] = [
      [
        'tone-clean',
        () => {
          forEachGuitar((e) => e.setValue(AirGuitar, 'tone', GuitarToneMode.Clean));
          showTone(GuitarToneMode.Clean);
        },
      ],
      [
        'tone-drive',
        () => {
          forEachGuitar((e) => e.setValue(AirGuitar, 'tone', GuitarToneMode.Drive));
          showTone(GuitarToneMode.Drive);
        },
      ],
      [
        'volume-down',
        () =>
          forEachGuitar((e) =>
            e.setValue(AirGuitar, 'volume', Math.max(0, (e.getValue(AirGuitar, 'volume') ?? 0.8) - 0.1)),
          ),
      ],
      [
        'volume-up',
        () =>
          forEachGuitar((e) =>
            e.setValue(AirGuitar, 'volume', Math.min(1, (e.getValue(AirGuitar, 'volume') ?? 0.8) + 0.1)),
          ),
      ],
      ['reset-guitar', () => forEachGuitar((e) => e.setValue(AirGuitar, 'resetPlacement', true))],
    ];
    for (const [id, handler] of handlers) {
      const element = panel.getElementById(id);
      if (element == null) continue;
      element.name = id;
      element.addEventListener('click', handler);
      this.cleanupFuncs.push(() => element.removeEventListener('click', handler));
    }
  }
}
