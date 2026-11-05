/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createSystem, Entity, UIKitMLAsset, VisibilityState } from '@iwsdk/core';
import { AirGuitar, GuitarToneMode } from './guitar/air-guitar-component.js';
import { AirCello } from './cello/air-cello-component.js';
import { AirCymbals } from './cymbals/air-cymbals-component.js';
import { AirTriangle } from './triangle/air-triangle-component.js';
import { AirPiano } from './piano/air-piano-component.js';
import { AirDrums } from './drums/air-drums-component.js';
import { AirHorn } from './horn/air-horn-component.js';
import { AirTrombone } from './trombone/air-trombone-component.js';
import { AirTrumpet } from './trumpet/air-trumpet-component.js';
import { AirViolin } from './violin/air-violin-component.js';
import { SCENES, sceneFromQuery, sceneUrl } from './scene-list.js';
import { Smashable } from './smash/smashable-component.js';

/** The instruments, by the panel button that takes each one out. */
type Instrument = 'guitar' | 'violin' | 'cello' | 'cymbals' | 'triangle' | 'piano' | 'drums' | 'trumpet' | 'trombone' | 'horn';
const INSTRUMENTS: Instrument[] = ['guitar', 'violin', 'cello', 'cymbals', 'triangle', 'piano', 'drums', 'trumpet', 'trombone', 'horn'];

export class PanelSystem extends createSystem({
  guitars: { required: [AirGuitar] },
  violins: { required: [AirViolin] },
  cellos: { required: [AirCello] },
  cymbals: { required: [AirCymbals] },
  triangles: { required: [AirTriangle] },
  pianos: { required: [AirPiano] },
  drums: { required: [AirDrums] },
  trumpets: { required: [AirTrumpet] },
  trombones: { required: [AirTrombone] },
  horns: { required: [AirHorn] },
  smashables: { required: [Smashable] },
}) {
  private readonly buttons = new Map<Instrument, ReturnType<UIKitMLAsset['getElementById']>>();
  private showing: Instrument | null = null;
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

  /** Prev/Next swap the whole level; the persistent instruments and player stay put. */
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

  /**
   * Instrument, tone, volume and reset buttons write to the AirGuitar,
   * AirViolin, AirCello, AirCymbals, AirTriangle, AirPiano, AirDrums, AirTrumpet, AirTrombone and AirHorn components.
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
    // The bowed instruments share their fields.
    const forEachBowed = (fn: (e: Entity, c: typeof AirViolin) => void) => {
      for (const entity of this.queries.violins.entities) fn(entity, AirViolin);
      for (const entity of this.queries.cellos.entities) fn(entity, AirCello);
    };
    // A freshly loaded panel shows its defaults; let update() repaint the
    // instrument buttons and show the guitar's real tone.
    this.buttons.clear();
    for (const name of INSTRUMENTS) this.buttons.set(name, panel.getElementById(`instrument-${name}`));
    this.showing = null;
    forEachGuitar((e) => showTone(e.getValue(AirGuitar, 'tone') ?? GuitarToneMode.Clean));
    const choose = (name: Instrument) => {
      forEachGuitar((e) => e.setValue(AirGuitar, 'active', name === 'guitar'));
      for (const entity of this.queries.violins.entities) entity.setValue(AirViolin, 'active', name === 'violin');
      for (const entity of this.queries.cellos.entities) entity.setValue(AirCello, 'active', name === 'cello');
      for (const entity of this.queries.cymbals.entities) entity.setValue(AirCymbals, 'active', name === 'cymbals');
      for (const entity of this.queries.triangles.entities) entity.setValue(AirTriangle, 'active', name === 'triangle');
      for (const entity of this.queries.pianos.entities) entity.setValue(AirPiano, 'active', name === 'piano');
      for (const entity of this.queries.drums.entities) entity.setValue(AirDrums, 'active', name === 'drums');
      for (const entity of this.queries.trumpets.entities) entity.setValue(AirTrumpet, 'active', name === 'trumpet');
      for (const entity of this.queries.trombones.entities) entity.setValue(AirTrombone, 'active', name === 'trombone');
      for (const entity of this.queries.horns.entities) entity.setValue(AirHorn, 'active', name === 'horn');
    };
    const nudgeVolume = (step: number) => {
      forEachGuitar((e) => e.setValue(AirGuitar, 'volume', clamp01((e.getValue(AirGuitar, 'volume') ?? 0.8) + step)));
      forEachBowed((e, c) => e.setValue(c, 'volume', clamp01((e.getValue(c, 'volume') ?? 0.8) + step)));
      for (const e of this.queries.cymbals.entities) {
        e.setValue(AirCymbals, 'volume', clamp01((e.getValue(AirCymbals, 'volume') ?? 0.8) + step));
      }
      for (const e of this.queries.triangles.entities) {
        e.setValue(AirTriangle, 'volume', clamp01((e.getValue(AirTriangle, 'volume') ?? 0.8) + step));
      }
      for (const e of this.queries.pianos.entities) {
        e.setValue(AirPiano, 'volume', clamp01((e.getValue(AirPiano, 'volume') ?? 0.8) + step));
      }
      for (const e of this.queries.drums.entities) {
        e.setValue(AirDrums, 'volume', clamp01((e.getValue(AirDrums, 'volume') ?? 0.8) + step));
      }
      for (const e of this.queries.trumpets.entities) {
        e.setValue(AirTrumpet, 'volume', clamp01((e.getValue(AirTrumpet, 'volume') ?? 0.8) + step));
      }
      for (const e of this.queries.trombones.entities) {
        e.setValue(AirTrombone, 'volume', clamp01((e.getValue(AirTrombone, 'volume') ?? 0.8) + step));
      }
      for (const e of this.queries.horns.entities) {
        e.setValue(AirHorn, 'volume', clamp01((e.getValue(AirHorn, 'volume') ?? 0.8) + step));
      }
    };
    const handlers: [string, () => void][] = [
      ['instrument-guitar', () => choose('guitar')],
      ['instrument-violin', () => choose('violin')],
      ['instrument-cello', () => choose('cello')],
      ['instrument-cymbals', () => choose('cymbals')],
      ['instrument-triangle', () => choose('triangle')],
      ['instrument-piano', () => choose('piano')],
      ['instrument-drums', () => choose('drums')],
      ['instrument-trumpet', () => choose('trumpet')],
      ['instrument-trombone', () => choose('trombone')],
      ['instrument-horn', () => choose('horn')],
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
          forEachGuitar((e) => {
            e.setValue(AirGuitar, 'resetPlacement', true);
            e.setValue(AirGuitar, 'repair', true);
          });
          forEachBowed((e, c) => e.setValue(c, 'resetPlacement', true));
          for (const e of this.queries.pianos.entities) e.setValue(AirPiano, 'resetPlacement', true);
          for (const e of this.queries.drums.entities) e.setValue(AirDrums, 'resetPlacement', true);
          // And everything smashed is put back together.
          for (const e of this.queries.smashables.entities) e.setValue(Smashable, 'repair', true);
        },
      ],
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

  /** The instrument buttons show which instrument is out, however it was chosen. */
  update(): void {
    let out: Instrument = 'guitar';
    for (const e of this.queries.violins.entities) if (e.getValue(AirViolin, 'active')) out = 'violin';
    for (const e of this.queries.cellos.entities) if (e.getValue(AirCello, 'active')) out = 'cello';
    for (const e of this.queries.cymbals.entities) if (e.getValue(AirCymbals, 'active')) out = 'cymbals';
    for (const e of this.queries.triangles.entities) if (e.getValue(AirTriangle, 'active')) out = 'triangle';
    for (const e of this.queries.pianos.entities) if (e.getValue(AirPiano, 'active')) out = 'piano';
    for (const e of this.queries.drums.entities) if (e.getValue(AirDrums, 'active')) out = 'drums';
    for (const e of this.queries.trumpets.entities) if (e.getValue(AirTrumpet, 'active')) out = 'trumpet';
    for (const e of this.queries.trombones.entities) if (e.getValue(AirTrombone, 'active')) out = 'trombone';
    for (const e of this.queries.horns.entities) if (e.getValue(AirHorn, 'active')) out = 'horn';
    if (out === this.showing) return;
    this.showing = out;
    for (const [name, button] of this.buttons) button?.setProperties({ variant: name === out ? 'primary' : 'secondary' });
  }
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
