/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createSystem, Entity, UIKitMLAsset, VisibilityState } from '@iwsdk/core';
import { AirGuitar, GuitarToneMode } from './guitar/air-guitar-component.js';
import { AirViolin } from './violin/air-violin-component.js';

export class PanelSystem extends createSystem({
  guitars: { required: [AirGuitar] },
  violins: { required: [AirViolin] },
}) {
  private guitarButton: ReturnType<UIKitMLAsset['getElementById']> = null;
  private violinButton: ReturnType<UIKitMLAsset['getElementById']> = null;
  private showingViolin: boolean | null = null;

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

  /**
   * Instrument, tone, volume and reset buttons write to the AirGuitar and
   * AirViolin components.
   */
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
    const forEachViolin = (fn: (e: Entity) => void) => {
      for (const entity of this.queries.violins.entities) fn(entity);
    };
    this.guitarButton = panel.getElementById('instrument-guitar');
    this.violinButton = panel.getElementById('instrument-violin');
    const choose = (violin: boolean) => {
      forEachGuitar((e) => e.setValue(AirGuitar, 'active', !violin));
      forEachViolin((e) => e.setValue(AirViolin, 'active', violin));
    };
    const nudgeVolume = (step: number) => {
      forEachGuitar((e) => e.setValue(AirGuitar, 'volume', clamp01((e.getValue(AirGuitar, 'volume') ?? 0.8) + step)));
      forEachViolin((e) => e.setValue(AirViolin, 'volume', clamp01((e.getValue(AirViolin, 'volume') ?? 0.8) + step)));
    };
    const handlers: [string, () => void][] = [
      ['instrument-guitar', () => choose(false)],
      ['instrument-violin', () => choose(true)],
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
      ['volume-down', () => nudgeVolume(-0.1)],
      ['volume-up', () => nudgeVolume(0.1)],
      [
        'reset-guitar',
        () => {
          forEachGuitar((e) => e.setValue(AirGuitar, 'resetPlacement', true));
          forEachViolin((e) => e.setValue(AirViolin, 'resetPlacement', true));
        },
      ],
    ];
    for (const [id, handler] of handlers) {
      const element = panel.getElementById(id);
      if (element == null) continue;
      element.name = id;
      element.addEventListener('click', handler);
      this.cleanupFuncs.push(() => element.removeEventListener('click', handler));
    }
  }

  /** The instrument buttons show which instrument is out, however it was chosen. */
  update(): void {
    let violin = false;
    for (const e of this.queries.violins.entities) violin = e.getValue(AirViolin, 'active') ?? false;
    if (violin === this.showingViolin) return;
    this.showingViolin = violin;
    this.guitarButton?.setProperties({ variant: violin ? 'secondary' : 'primary' });
    this.violinButton?.setProperties({ variant: violin ? 'primary' : 'secondary' });
  }
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
