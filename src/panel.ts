/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createSystem, Entity, UIKitMLAsset, VisibilityState } from '@iwsdk/core';
import { AirGuitar, GuitarToneMode } from './guitar/air-guitar-component.js';
import { SCENES, sceneFromQuery, sceneUrl } from './scene-list.js';

export class PanelSystem extends createSystem({
  guitars: { required: [AirGuitar] },
}) {
  private sceneIndex = 0;
  private loadingScene = false;
  /** Listener teardown for the current level's panel; reset on every level load. */
  private panelCleanup: (() => void)[] = [];

  init(): void {
    this.wirePanel();
    this.cleanupFuncs.push(() => this.unwirePanel());
    const fromQuery = sceneFromQuery(window.location.search);
    if (fromQuery > 0) void this.goToScene(fromQuery);
  }

  /** Each scene file brings its own welcome panel, so wire whichever is loaded. */
  private wirePanel(): void {
    this.unwirePanel();
    const panel = this.world.getSceneObject<UIKitMLAsset>('welcome-panel');
    if (panel == null) return;

    this.wireGuitarControls(panel);
    this.wireSceneControls(panel);

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
    this.panelCleanup.push(
      () => xrButton.removeEventListener('click', launchXR),
      () => exitButton.removeEventListener('click', exitXR),
      this.world.visibilityState.subscribe((visibilityState) => {
        const is2D = visibilityState === VisibilityState.NonImmersive;
        xrButton.setProperties({ display: is2D ? 'flex' : 'none' });
        exitButton.setProperties({ display: is2D ? 'none' : 'flex' });
      }),
    );
  }

  private unwirePanel(): void {
    for (const cleanup of this.panelCleanup) cleanup();
    this.panelCleanup = [];
  }

  /** Prev/Next swap the whole level; the persistent guitar and player stay put. */
  private wireSceneControls(panel: UIKitMLAsset): void {
    panel.getElementById('scene-name')?.setProperties({ text: SCENES[this.sceneIndex].name });
    const handlers: [string, () => void][] = [
      ['scene-prev', () => void this.goToScene(this.sceneIndex - 1)],
      ['scene-next', () => void this.goToScene(this.sceneIndex + 1)],
    ];
    this.listen(panel, handlers);
  }

  private async goToScene(index: number): Promise<void> {
    if (this.loadingScene) return;
    this.loadingScene = true;
    const next = (index + SCENES.length) % SCENES.length;
    try {
      await this.world.loadLevel(sceneUrl(SCENES[next]));
      this.sceneIndex = next;
    } catch (error) {
      console.error(`Could not load scene "${SCENES[next].file}"`, error);
    } finally {
      this.loadingScene = false;
      this.wirePanel();
    }
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
    // A freshly loaded panel defaults to Clean; show the guitar's real tone.
    forEachGuitar((e) => showTone(e.getValue(AirGuitar, 'tone') ?? GuitarToneMode.Clean));
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
    this.listen(panel, handlers);
  }

  private listen(panel: UIKitMLAsset, handlers: [string, () => void][]): void {
    for (const [id, handler] of handlers) {
      const element = panel.getElementById(id);
      if (element == null) continue;
      element.name = id;
      element.addEventListener('click', handler);
      this.panelCleanup.push(() => element.removeEventListener('click', handler));
    }
  }
}
