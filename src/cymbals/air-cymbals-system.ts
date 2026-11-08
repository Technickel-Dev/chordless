import { createSystem, Entity, Group, Matrix4, Object3D, Quaternion, Vector3, VisibilityState } from '@iwsdk/core';
import { ACCENT, type HudStep } from '../guitar/guitar-model.js';
import { TrackedHand } from '../guitar/hands.js';
import { AirCymbals } from './air-cymbals-component.js';
import { CHEST, ClashDetector, createCymbalPose, cymbalPose, type CymbalPose, touchesSphere } from './clash.js';
import { createCymbalsModel, type CymbalsModel } from './cymbals-model.js';
import { CymbalSynth } from './synth.js';
import { PropSmasher, type PropPart } from '../smash/prop-smash.js';
import { Smashable, SmashHold } from '../smash/smashable-component.js';
import { SMASH_CARD, SmashHints } from '../smash/smash-hints.js';

/** The sign's pictograms: how to play between clashes, how to stop while ringing. */
const SHOW_HANDS: readonly HudStep[] = [{ icon: 'hand', caption: 'BOTH HANDS' }];
const HOW_TO_PLAY: readonly HudStep[] = [
  { icon: 'arrowLeftRight', caption: 'CLASH' },
  { icon: 'gauge', caption: 'FAST = LOUD', faint: true },
];
const HOW_TO_STOP: readonly HudStep[] = [{ icon: 'volumeX', caption: 'PRESS TO STOP', faint: true }];

/** The HUD floats this far in front of, below and left of the head (m): up and aside from where the plates meet. */
const HUD_FORWARD = 0.6;
const HUD_BELOW = 0.14;
const HUD_LEFT = 0.3;

/** A dynamic marking for a clash's loudness. */
export function dynamicMark(loudness: number): string {
  if (loudness < 0.25) return 'pp';
  if (loudness < 0.4) return 'p';
  if (loudness < 0.55) return 'mp';
  if (loudness < 0.7) return 'mf';
  if (loudness < 0.85) return 'f';
  return 'ff';
}

/**
 * A pair of orchestral clash cymbals, one in each hand, held by the strap.
 * Bringing the plates together clashes them, as loud as they were closing;
 * they ring until held together, laid together gently or pressed against
 * the chest. Swung down onto the floor a plate crashes, loses its pad and
 * strap, and once wrecked drops from the hand to roll on its rim (see
 * ../smash/prop-smash.ts).
 */
export class AirCymbalsSystem extends createSystem({
  items: { required: [AirCymbals] },
}) {
  /** Which instrument this is, for tests and tools. */
  readonly instrument = 'cymbals';
  readonly component = AirCymbals;
  private model!: CymbalsModel;
  private entity!: Entity;
  private synth!: CymbalSynth;
  /** Each plate is smashed on its own, left then right, each on its own entity. */
  private readonly smash: PropSmasher[] = [];
  private readonly hints = new SmashHints(SMASH_CARD.swing, SMASH_CARD.reset);
  private readonly entities: Entity[] = [];
  private debris!: Group;
  private readonly grips: Object3D[] = [new Object3D(), new Object3D()];
  private readonly hands = [new TrackedHand(), new TrackedHand()] as const;
  private readonly poses: [CymbalPose, CymbalPose] = [createCymbalPose(), createCymbalPose()];
  private readonly clash = new ClashDetector();
  private shown = false;
  private wasDamping = false;
  private damps = 0;
  private shownRinging = -1;
  private readonly basis = new Matrix4();
  private readonly x = new Vector3();
  private readonly y = new Vector3();
  private readonly z = new Vector3();
  private readonly headPos = new Vector3();
  private readonly headQuat = new Quaternion();
  private readonly fwd = new Vector3();
  private readonly chest = new Float32Array(3);

  init(): void {
    this.synth = new CymbalSynth();
    this.model = createCymbalsModel();
    const [left, right] = this.model.cymbals;
    this.entity = this.world.createTransformEntity(left, { persistent: true });
    this.entity.addComponent(AirCymbals);
    const rightEntity = this.world.createTransformEntity(right, { persistent: true });
    this.debris = new Group();
    this.debris.name = 'AirCymbalsDebris';
    this.debris.visible = false;
    this.world.createTransformEntity(this.debris, { persistent: true });
    this.entities.push(this.entity, rightEntity);
    this.model.cymbals.forEach((cymbal, i) => {
      this.entities[i].addComponent(Smashable);
      const parts: PropPart[] = [];
      for (const [name, breakAt] of [['Pad', 0.75], ['Strap', 0.45]] as const) {
        const object = cymbal.getObjectByName(name);
        if (object) parts.push({ name: `LooseCymbal${i}${name}`, objects: [object], breakAt });
      }
      this.smash.push(
        new PropSmasher(cymbal, this.debris, {
          mass: 1.4,
          wear: 0.08,
          parts,
          fractures: [{ sources: [cymbal.getObjectByName('Plate')!], pieces: 7, structural: true }],
          // A plate hitting the floor crashes, as loud as the blow.
          sound: (speed) => {
            if (speed > 0.6) this.synth.clash({ loudness: Math.min(1, speed / 8), flush: false });
          },
        }),
      );
    });
    this.world.createTransformEntity(this.model.hud.sprite, { persistent: true });
    this.setVisible(false);

    const unlock = () => this.synth.resume();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.cleanupFuncs.push(
      () => window.removeEventListener('pointerdown', unlock),
      () => window.removeEventListener('keydown', unlock),
      this.world.visibilityState.subscribe((state) => {
        // Entering XR is a user gesture, so audio can start here.
        if (state !== VisibilityState.NonImmersive) this.synth.resume();
        else this.show(false);
      }),
      () => this.synth.dispose(),
    );
  }

  update(delta: number): void {
    const e = this.entity;
    const active = e.getValue(AirCymbals, 'active') ?? false;
    if (!active || this.world.visibilityState.peek() === VisibilityState.NonImmersive) {
      this.show(false);
      return;
    }
    this.show(true);
    const dt = Math.min(delta, 0.1);
    if (e.getValue(AirCymbals, 'resetPlacement')) e.setValue(AirCymbals, 'resetPlacement', false);
    this.synth.setVolume(e.getValue(AirCymbals, 'volume') ?? 0.8);

    const adapters = this.input.xr.visualAdapters.hand;
    const [left, right] = this.hands;
    left.update(adapters.left, this.player.gripSpaces.left);
    right.update(adapters.right, this.player.gripSpaces.right);
    if (e.getValue(AirCymbals, 'leftHand') !== left.tracked) e.setValue(AirCymbals, 'leftHand', left.tracked);
    if (e.getValue(AirCymbals, 'rightHand') !== right.tracked) e.setValue(AirCymbals, 'rightHand', right.tracked);
    this.grips[0] = this.player.gripSpaces.left;
    this.grips[1] = this.player.gripSpaces.right;
    let inHands = true;
    for (let i = 0; i < 2; i++) {
      const cymbal = this.model.cymbals[i];
      if (this.smash[i].hold === SmashHold.Worn) {
        cymbal.visible = this.hands[i].tracked;
        if (cymbal.visible) this.place(cymbal, cymbalPose(this.hands[i].positions, this.poses[i]));
      } else {
        // Smashed out of the hand, it lies where it fell.
        cymbal.visible = true;
        inHands = false;
      }
      this.smash[i].update(dt, this.hands, this.grips, this.entities[i]);
    }

    const clash = this.clash;
    const now = this.synth.ctx.currentTime;
    if (left.tracked && right.tracked && inHands) clash.update(this.poses[0], this.poses[1], dt);
    else clash.reset();
    if (clash.clashed) {
      this.synth.clash({ loudness: clash.loudness, flush: clash.flush }, now);
      e.setValue(AirCymbals, 'clashes', clash.clashes);
      e.setValue(AirCymbals, 'lastClash', Math.round(clash.loudness * 100) / 100);
      e.setValue(AirCymbals, 'lastSpeed', Math.round(clash.speed * 100) / 100);
    }

    // Plates held or laid together, or either one against the chest, damp the ringing.
    this.readHead();
    for (let k = 0; k < 3; k++) {
      this.chest[k] = this.headPos.getComponent(k) - this.fwd.getComponent(k) * CHEST.behind;
    }
    this.chest[1] -= CHEST.below;
    const onChest =
      (left.tracked && touchesSphere(this.poses[0], this.chest, CHEST.radius)) ||
      (right.tracked && touchesSphere(this.poses[1], this.chest, CHEST.radius));
    const damping = clash.damping || onChest;
    if (damping) {
      if (!this.wasDamping && this.synth.ringing(now) > 0.02) e.setValue(AirCymbals, 'damps', ++this.damps);
      this.synth.damp(now);
    }
    this.wasDamping = damping;

    const ringing = this.synth.ringing(now);
    for (let i = 0; i < 2; i++) {
      this.model.glows[i].visible = ringing > 0.01 && this.model.cymbals[i].visible && this.smash[i].hold === SmashHold.Worn;
      this.model.glowMaterials[i].opacity = Math.min(0.8, ringing * 0.9);
    }
    const shown = Math.round(ringing * 100) / 100;
    if (shown !== this.shownRinging) {
      this.shownRinging = shown;
      e.setValue(AirCymbals, 'ringing', shown);
    }
    const gap = Math.round(Math.min(1, clash.gap) * 1000) / 1000;
    if (e.getValue(AirCymbals, 'gap') !== gap) e.setValue(AirCymbals, 'gap', gap);
    if (e.getValue(AirCymbals, 'touching') !== clash.touching) e.setValue(AirCymbals, 'touching', clash.touching);
    this.updateHud(ringing);
  }

  /** Shows or puts away the cymbals, silencing them when put away. */
  private show(visible: boolean): void {
    if (this.shown === visible) return;
    this.shown = visible;
    this.setVisible(visible);
    this.debris.visible = visible;
    if (!visible) {
      // Put away, they come back out whole.
      for (const smash of this.smash) smash.repair();
      this.synth.stopAll();
      this.clash.reset();
    }
  }

  private setVisible(visible: boolean): void {
    for (const c of this.model.cymbals) c.visible = visible;
    this.model.hud.sprite.visible = visible;
  }

  /** Puts a cymbal where its pose says. */
  private place(cymbal: Group, pose: CymbalPose): void {
    this.x.fromArray(pose.across);
    this.y.fromArray(pose.up);
    this.z.fromArray(pose.normal);
    this.basis.makeBasis(this.x, this.y, this.z);
    cymbal.quaternion.setFromRotationMatrix(this.basis);
    cymbal.position.fromArray(pose.center);
    cymbal.updateMatrixWorld(true);
  }

  /** The head's position, and which way the torso faces (level). */
  private readHead(): void {
    const head = this.player.head;
    head.updateWorldMatrix(true, false);
    head.getWorldPosition(this.headPos);
    head.getWorldQuaternion(this.headQuat);
    this.fwd.set(0, 0, -1).applyQuaternion(this.headQuat);
    this.fwd.y = 0;
    if (this.fwd.lengthSq() < 1e-6) this.fwd.set(0, 0, -1);
    this.fwd.normalize();
  }

  private updateHud(ringing: number): void {
    const hud = this.model.hud;
    hud.sprite.position.copy(this.headPos).addScaledVector(this.fwd, HUD_FORWARD);
    // Left of the torso's forward, level.
    hud.sprite.position.x += this.fwd.z * HUD_LEFT;
    hud.sprite.position.z -= this.fwd.x * HUD_LEFT;
    hud.sprite.position.y -= HUD_BELOW;
    // Whichever plate is broken or out of the hand says what to do next.
    const [first, second] = this.smash;
    if (this.hints.drawSmashing(hud, first.hold !== SmashHold.Worn || first.holding ? first : second)) return;
    const [left, right] = this.hands;
    if (!left.tracked || !right.tracked) {
      hud.draw({ steps: SHOW_HANDS }, ACCENT.idle);
      return;
    }
    const e = this.entity;
    const count = e.getValue(AirCymbals, 'clashes') ?? 0;
    if (ringing > 0.02 && count > 0) {
      const volume = Math.round((e.getValue(AirCymbals, 'volume') ?? 0.8) * 100);
      hud.draw(
        { headline: `CRASH ${dynamicMark(e.getValue(AirCymbals, 'lastClash') ?? 0)}`, detail: `${volume}%`, steps: HOW_TO_STOP },
        ACCENT.playing,
      );
      return;
    }
    this.hints.drawHowTo(hud, HOW_TO_PLAY);
  }
}
