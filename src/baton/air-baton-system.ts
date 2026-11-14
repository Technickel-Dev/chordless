import { createSystem, Entity, Group, Matrix4, Object3D, Quaternion, Vector3, VisibilityState } from '@iwsdk/core';
import { dynamicMark } from '../cymbals/air-cymbals-system.js';
import { ACCENT, type HudStep } from '../guitar/guitar-model.js';
import { TrackedHand } from '../guitar/hands.js';
import { PropSmasher } from '../smash/prop-smash.js';
import { Smashable, SmashHold } from '../smash/smashable-component.js';
import { SMASH_CARD, SmashHints } from '../smash/smash-hints.js';
import { AirBaton } from './air-baton-component.js';
import { createBatonModel, type BatonModel } from './baton-model.js';
import { BATON, NOMINAL_LEDGE, RIG_TRAVEL, STAND } from './geometry.js';
import { BatonSynth } from './synth.js';
import { batonPose, createBatonPose, restOnDesk, SPOT_NAMES, SPOTS, STRIKING_LENGTH, TapDetector, type Spot, type Tap } from './tap.js';

/** The sign's pictograms. */
const SHOW_FIST: readonly HudStep[] = [{ icon: 'grab', caption: 'RIGHT FIST' }];
const HOW_TO_PLAY: readonly HudStep[] = [
  { icon: 'arrowDown', caption: 'TAP STAND' },
  { icon: 'gauge', caption: 'FAST = LOUD', faint: true },
];

/** The stage the player stands on. */
const FLOOR_Y = 0.035;
/** Where the stand is set down: its column this far ahead of the eyes (m)... */
const STAND_AHEAD = 0.55;
/** ...with its ledge this far below them, within the inner tube's travel. */
const LEDGE_BELOW_EYES = 0.5;
/** The HUD floats this far over the desk's top edge (m). */
const HUD_RISE = 0.17;
/** How fast a tapped spot's glow fades (time constant, s). */
const GLOW_TAU = 0.1;
/** A tap jolts the desk back this far at most (radians), and it springs back. */
const WOBBLE = { kick: 0.035, stiffness: 260, damping: 9 };
/** Hands shove the stand over inside this box (stand space): round the desk at any height it can be raised to. */
const PUSH_BOX = [-STAND.deskWidth / 2 - 0.03, NOMINAL_LEDGE - RIG_TRAVEL.down - 0.05, -0.26, STAND.deskWidth / 2 + 0.03, NOMINAL_LEDGE + RIG_TRAVEL.up + STAND.deskHeight + 0.03, 0.09] as const;

/**
 * A conductor's baton in the right fist and a music stand set down in front
 * of the player to tap it on. A tap sounds where it lands, as loud as the
 * baton was moving: the sharp tick of the top edge, the hollow desk, the dry
 * ledge. Waved fast, the baton swishes. Swung into the floor the baton
 * snaps; the stand can be shoved over, and a left fist on the desk pulls it
 * off to throw (see ../smash/prop-smash.ts).
 */
export class AirBatonSystem extends createSystem({
  items: { required: [AirBaton] },
}) {
  /** Which instrument this is, for tests and tools. */
  readonly instrument = 'baton';
  readonly component = AirBaton;
  private model!: BatonModel;
  private entity!: Entity;
  private standEntity!: Entity;
  private synth!: BatonSynth;
  private batonSmash!: PropSmasher;
  private standSmash!: PropSmasher;
  private readonly batonHints = new SmashHints(SMASH_CARD.swing, SMASH_CARD.reset);
  private readonly standHints = new SmashHints(SMASH_CARD.topple, SMASH_CARD.reset);
  private debris!: Group;
  private readonly hands = [new TrackedHand(), new TrackedHand()] as const;
  private readonly grips: Object3D[] = [new Object3D(), new Object3D()];
  private readonly pose = createBatonPose();
  private readonly detector = new TapDetector();
  private shown = false;
  private taps = 0;
  private deskPart = -1;
  private readonly glow: Record<Spot, number> = { rim: 0, desk: 0, ledge: 0 };
  private wobble = 0;
  private wobbleSpeed = 0;
  private deskTilt = 0;
  private hudTop = new Vector3();
  private readonly toDesk = new Matrix4();
  private readonly basis = new Matrix4();
  private readonly x = new Vector3();
  private readonly y = new Vector3();
  private readonly z = new Vector3();
  private readonly v = new Vector3();
  private readonly headPos = new Vector3();
  private readonly headQuat = new Quaternion();
  private readonly fwd = new Vector3();
  private readonly gripDesk: [number, number, number] = [0, 0, 0];
  private readonly tipDesk: [number, number, number] = [0, 0, 0];
  private readonly baseDesk: [number, number, number] = [0, 0, 0];
  private readonly lastTip = new Vector3();
  private hasLastTip = false;

  init(): void {
    this.synth = new BatonSynth();
    this.model = createBatonModel();
    const { baton, stand } = this.model;
    this.entity = this.world.createTransformEntity(baton, { persistent: true });
    this.entity.addComponent(AirBaton);
    this.entity.addComponent(Smashable);
    this.standEntity = this.world.createTransformEntity(stand, { persistent: true });
    this.standEntity.addComponent(Smashable);
    this.debris = new Group();
    this.debris.name = 'AirBatonDebris';
    this.debris.visible = false;
    this.world.createTransformEntity(this.debris, { persistent: true });
    this.world.createTransformEntity(this.model.hud.sprite, { persistent: true });
    this.deskTilt = this.model.desk.rotation.x;

    const handle = baton.getObjectByName('Handle')!;
    this.batonSmash = new PropSmasher(baton, this.debris, {
      mass: 0.02,
      // A thin stick of wood: a few good blows on the floor snap it.
      wear: 0.08,
      parts: [{ name: 'LooseBatonHandle', objects: [handle, baton.getObjectByName('Ferrule')!], breakAt: 0.45 }],
      fractures: [{ sources: [baton.getObjectByName('Shaft')!], pieces: 4, structural: true, fragility: 1.6 }],
      sound: (speed, _part, broke) => {
        const loudness = Math.min(1, speed / 7);
        if (loudness < 0.05) return;
        this.synth.tap({ spot: 'ledge', loudness: loudness * 0.6, across: 0 });
        this.synth.knock(loudness * 0.5, broke, 2.4);
      },
    });

    const find = (name: string) => stand.getObjectByName(name)!;
    const parts = [
      { name: 'LooseSheets', objects: [find('Sheets')], breakAt: 0.95 },
      { name: 'LooseKnob', objects: [find('Knob')], breakAt: 0.55 },
      ...[0, 1, 2].map((i) => ({ name: `LooseLeg${i}`, objects: [find(`Leg${i}`)], breakAt: 0.3 + 0.08 * i })),
      { name: 'LooseDesk', objects: [this.model.desk], breakAt: 0.25, grabbable: true },
    ];
    this.deskPart = parts.length - 1;
    this.standSmash = new PropSmasher(stand, this.debris, {
      mass: 4,
      // Rocking on its feet does nothing; going over from full height bends and scatters it.
      tap: 1.6,
      wear: 0.55,
      splinterSpeed: 3,
      friction: 0.9,
      grabSeconds: 0.5,
      // The right fist is round the baton; the left takes hold of the desk.
      grabHands: [0],
      pushBox: PUSH_BOX,
      parts,
      fractures: [{ sources: [find('Plate')], pieces: 6, owner: this.deskPart, fragility: 1.3 }],
      sound: (speed, part, broke) => {
        const loudness = Math.min(1, speed / 6);
        if (loudness < 0.06) return;
        // The desk clangs as it lands; the sheets only rustle down.
        if (part !== 0) this.synth.tap({ spot: part === this.deskPart || part < 0 ? 'desk' : 'rim', loudness, across: 0 });
        this.synth.knock(loudness * 0.7, broke, part === 0 ? 0.5 : 1.3);
      },
    });
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
    const active = e.getValue(AirBaton, 'active') ?? false;
    if (!active || this.world.visibilityState.peek() === VisibilityState.NonImmersive) {
      this.show(false);
      return;
    }
    const broughtOut = !this.shown;
    this.show(true);
    const dt = Math.min(delta, 0.1);
    const reset = e.getValue(AirBaton, 'resetPlacement') ?? false;
    if (reset) {
      this.standSmash.repair();
      this.batonSmash.repair();
    }
    this.batonSmash.takeRepaired();
    if (broughtOut || this.standSmash.takeRepaired() || reset) {
      e.setValue(AirBaton, 'resetPlacement', false);
      this.place();
    }
    this.synth.setVolume(e.getValue(AirBaton, 'volume') ?? 0.8);

    const adapters = this.input.xr.visualAdapters.hand;
    const [left, right] = this.hands;
    left.update(adapters.left, this.player.gripSpaces.left);
    right.update(adapters.right, this.player.gripSpaces.right);
    if (e.getValue(AirBaton, 'leftHand') !== left.tracked) e.setValue(AirBaton, 'leftHand', left.tracked);
    if (e.getValue(AirBaton, 'rightHand') !== right.tracked) e.setValue(AirBaton, 'rightHand', right.tracked);

    const { baton, desk } = this.model;
    // Snapped, the baton lies where it fell and is not played.
    const inHand = this.batonSmash.hold === SmashHold.Worn;
    const standUp = this.standSmash.hold === SmashHold.Worn && this.standSmash.isAttached(this.deskPart);
    baton.visible = right.tracked || !inHand;
    let tap: Tap | null = null;
    if (right.tracked && inHand) {
      const p = batonPose(right.positions, this.pose);
      if (standUp) {
        desk.updateWorldMatrix(true, false);
        this.toDesk.copy(desk.matrixWorld).invert();
        this.v.fromArray(p.grip).applyMatrix4(this.toDesk).toArray(this.gripDesk);
        this.v.fromArray(p.tip).applyMatrix4(this.toDesk).toArray(this.tipDesk);
        const reach = STRIKING_LENGTH / BATON.reach;
        for (let k = 0; k < 3; k++) this.baseDesk[k] = this.tipDesk[k] + (this.gripDesk[k] - this.tipDesk[k]) * reach;
        tap = this.detector.update(this.baseDesk, this.tipDesk, dt);
        // A baton that came down on the desk stops on it, rather than passing through.
        if (restOnDesk(this.gripDesk, this.tipDesk)) {
          this.v.fromArray(this.tipDesk).applyMatrix4(desk.matrixWorld);
          this.v.x -= p.grip[0];
          this.v.y -= p.grip[1];
          this.v.z -= p.grip[2];
          this.v.normalize().toArray(p.along);
        }
      } else {
        this.detector.reset();
      }
      this.placeBaton(baton, p.grip, p.along);
      // The tip's speed through the air, for the swish.
      this.v.fromArray(p.grip).addScaledVector(this.x, BATON.reach);
      const speed = this.hasLastTip && dt > 0 ? this.v.distanceTo(this.lastTip) / dt : 0;
      this.lastTip.copy(this.v);
      this.hasLastTip = true;
      this.synth.swish(speed < 25 ? speed : 0);
    } else {
      this.detector.reset();
      this.hasLastTip = false;
      this.synth.swish(0);
    }
    if (tap != null) this.sound(tap);
    if (e.getValue(AirBaton, 'touching') !== this.detector.touching) e.setValue(AirBaton, 'touching', this.detector.touching);

    this.grips[0] = this.player.gripSpaces.left;
    this.grips[1] = this.player.gripSpaces.right;
    this.batonSmash.update(dt, this.hands, this.grips, e);
    this.standSmash.update(dt, this.hands, this.grips, this.standEntity);
    this.animate(dt, standUp);
    this.updateHud();
  }

  /** Sounds a tap and shows it. */
  private sound(tap: Tap): void {
    this.synth.tap({ spot: tap.spot, loudness: tap.loudness, across: tap.across });
    const e = this.entity;
    e.setValue(AirBaton, 'taps', ++this.taps);
    e.setValue(AirBaton, 'lastTap', Math.round(tap.loudness * 100) / 100);
    e.setValue(AirBaton, 'lastSpeed', Math.round(tap.speed * 100) / 100);
    e.setValue(AirBaton, 'lastSpot', SPOT_NAMES[tap.spot]);
    this.glow[tap.spot] = Math.max(this.glow[tap.spot], 0.3 + 0.7 * tap.loudness);
    this.wobbleSpeed -= WOBBLE.kick * 20 * (0.2 + tap.loudness) * (tap.spot === 'desk' ? 1 : 0.6);
  }

  /** Fades the glows and lets a jolted desk spring back. */
  private animate(dt: number, standUp: boolean): void {
    const m = this.model;
    const fade = Math.exp(-dt / GLOW_TAU);
    for (const spot of SPOTS) {
      this.glow[spot] *= fade;
      const lit = this.glow[spot] > 0.01 && standUp;
      m.glows[spot].visible = lit;
      if (lit) m.glowMaterials[spot].opacity = Math.min(0.8, this.glow[spot] * (spot === 'desk' ? 0.35 : 1));
    }
    if (!standUp) return;
    const steps = Math.ceil(dt / 0.004);
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      this.wobbleSpeed += (-WOBBLE.stiffness * this.wobble - WOBBLE.damping * this.wobbleSpeed) * h;
      this.wobble += this.wobbleSpeed * h;
    }
    this.wobble = Math.max(-WOBBLE.kick, Math.min(WOBBLE.kick, this.wobble));
    m.desk.rotation.x = this.deskTilt + this.wobble;
  }

  /** Shows or puts away the baton and stand, silencing them when put away. */
  private show(visible: boolean): void {
    if (this.shown === visible) return;
    this.shown = visible;
    this.setVisible(visible);
    this.debris.visible = visible;
    if (!visible) {
      // Put away, they come back out whole.
      this.batonSmash.repair();
      this.standSmash.repair();
      this.synth.stopAll();
      this.detector.reset();
    }
  }

  private setVisible(visible: boolean): void {
    this.model.baton.visible = visible;
    this.model.stand.visible = visible;
    this.model.hud.sprite.visible = visible;
  }

  /**
   * Sets the stand down in front of the player, its desk facing them at a
   * height to read and tap. It faces the way the player's space does, not
   * their gaze, which may be on the panel when they take the baton out.
   */
  private place(): void {
    const head = this.player.head;
    head.updateWorldMatrix(true, false);
    head.getWorldPosition(this.headPos);
    this.player.getWorldQuaternion(this.headQuat);
    this.fwd.set(0, 0, -1).applyQuaternion(this.headQuat);
    this.fwd.y = 0;
    if (this.fwd.lengthSq() < 1e-6) this.fwd.set(0, 0, -1);
    this.fwd.normalize();
    const stand = this.model.stand;
    stand.position.set(this.headPos.x + this.fwd.x * STAND_AHEAD, FLOOR_Y, this.headPos.z + this.fwd.z * STAND_AHEAD);
    stand.rotation.set(0, Math.atan2(-this.fwd.x, -this.fwd.z), 0);
    const eyes = this.headPos.y - FLOOR_Y;
    const ledge = Math.min(NOMINAL_LEDGE + RIG_TRAVEL.up, Math.max(NOMINAL_LEDGE - RIG_TRAVEL.down, eyes - LEDGE_BELOW_EYES));
    this.model.rig.position.y = ledge - NOMINAL_LEDGE;
    this.wobble = 0;
    this.wobbleSpeed = 0;
    this.model.desk.rotation.x = this.deskTilt;
    stand.updateMatrixWorld(true);
    // The HUD over the desk's top edge, where it stays even if the stand goes over.
    this.hudTop.set(0, STAND.deskHeight + HUD_RISE, 0);
    this.model.desk.localToWorld(this.hudTop);
    this.model.hud.sprite.position.copy(this.hudTop);
    this.entity.setValue(AirBaton, 'deskHeight', Math.round(ledge * 1000) / 1000);
    this.detector.reset();
    // The rig moved: measure the stand again for smashing.
    this.standSmash.refit();
  }

  /** Puts the baton at the grip, pointing along `along`, its frame kept steady by leaning on world up. */
  private placeBaton(baton: Group, grip: ArrayLike<number>, along: ArrayLike<number>): void {
    this.x.set(along[0], along[1], along[2]);
    this.y.set(0, 1, 0).addScaledVector(this.x, -this.x.y);
    if (this.y.lengthSq() < 1e-6) this.y.set(1, 0, 0).addScaledVector(this.x, -this.x.x);
    this.y.normalize();
    this.z.crossVectors(this.x, this.y);
    this.basis.makeBasis(this.x, this.y, this.z);
    baton.quaternion.setFromRotationMatrix(this.basis);
    baton.position.set(grip[0], grip[1], grip[2]);
    baton.updateMatrixWorld(true);
  }

  private updateHud(): void {
    const hud = this.model.hud;
    if (this.standHints.drawSmashing(hud, this.standSmash)) return;
    if (this.batonHints.drawSmashing(hud, this.batonSmash)) return;
    if (!this.hands[1].tracked) {
      hud.draw({ steps: SHOW_FIST }, ACCENT.idle);
      return;
    }
    let sounding = false;
    for (const spot of SPOTS) sounding ||= this.glow[spot] > 0.05;
    const e = this.entity;
    if (this.taps > 0 && sounding) {
      const volume = Math.round((e.getValue(AirBaton, 'volume') ?? 0.8) * 100);
      hud.draw({ headline: `TAP ${dynamicMark(e.getValue(AirBaton, 'lastTap') ?? 0)}`, detail: `${e.getValue(AirBaton, 'lastSpot')} · ${volume}%` }, ACCENT.playing);
      return;
    }
    // Between taps: how to play, in turn with how to smash the stand.
    this.standHints.drawHowTo(hud, HOW_TO_PLAY);
  }
}
