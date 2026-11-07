import { createSystem, Entity, Group, Matrix4, Object3D, Quaternion, Vector3, VisibilityState } from '@iwsdk/core';
import { ACCENT } from '../guitar/guitar-model.js';
import { TrackedHand } from '../guitar/hands.js';
import { AIR_STOP } from '../trumpet/playing.js';
import { AirTrombone } from './air-trombone-component.js';
import { PropSmasher, type PropPart } from '../smash/prop-smash.js';
import { Smashable, SmashHold } from '../smash/smashable-component.js';
import { createHornPose, holdTrombone, LIPS, toTrombone } from './hold.js';
import { Breath, noteName, PARTIALS, PartialSelector, pitchOf, positionOf, SlideReader } from './playing.js';
import { TromboneSynth } from './synth.js';
import { createTromboneModel, type TromboneModel } from './trombone-model.js';

/** The HUD floats this far in front of, below and right of the head (m): clear of the bell on the left. */
const HUD_FORWARD = 0.6;
const HUD_BELOW = 0.2;
const HUD_RIGHT = 0.32;
/** The left middle knuckle, and the right thumb and index tips (WebXR hand joints). */
const MIDDLE_KNUCKLE = 11;
const THUMB_TIP = 4;
const INDEX_TIP = 9;

/**
 * A B-flat tenor trombone, held to the lips in the left hand with the slide
 * in the right. The horn pivots on the lips: held out at its reach the
 * mouthpiece meets them, and its tilt picks the partial. The right hand's
 * fingertips on the slide brace move the slide, and the pitch follows it
 * continuously; a left-hand pinch tongues the note and blows (closer is
 * louder).
 */
export class AirTromboneSystem extends createSystem({
  items: { required: [AirTrombone] },
}) {
  /** Which instrument this is, for tests and tools. */
  readonly instrument = 'trombone';
  readonly component = AirTrombone;
  private model!: TromboneModel;
  private entity!: Entity;
  private synth!: TromboneSynth;
  private smash!: PropSmasher;
  private debris!: Group;
  private readonly grips: Object3D[] = [new Object3D(), new Object3D()];
  /** Smashed out of the hand: it lies where it fell, silent. */
  private silenced = false;
  /** Which smashable part is the outer slide, or -1. */
  private slidePart = -1;
  private readonly hands = [new TrackedHand(), new TrackedHand()] as const;
  readonly pose = createHornPose();
  readonly slide = new SlideReader();
  readonly partials = new PartialSelector();
  readonly breath = new Breath();
  private shown = false;
  /** The nearest note the component and HUD last showed, so strings are only built on change. */
  private shownMidi = -1;
  private noteName = '';
  private pitch = 58;
  private readonly basis = new Matrix4();
  private readonly ax = new Vector3();
  private readonly ay = new Vector3();
  private readonly az = new Vector3();
  private readonly headPos = new Vector3();
  private readonly headQuat = new Quaternion();
  private readonly look = new Vector3();
  private readonly down = new Vector3();
  private readonly level = new Vector3();
  private readonly lips = new Float32Array(3);
  private readonly lookArr = new Float32Array(3);
  private readonly grip = new Float32Array(3);
  private readonly local: [number, number, number] = [0, 0, 0];
  private readonly sound = { midi: 58, amplitude: 0, mute: 0, tongued: false };

  init(): void {
    this.synth = new TromboneSynth();
    this.model = createTromboneModel();
    this.entity = this.world.createTransformEntity(this.model.trombone, { persistent: true });
    this.entity.addComponent(AirTrombone);
    this.entity.addComponent(Smashable);
    this.debris = new Group();
    this.debris.name = 'AirTromboneDebris';
    this.debris.visible = false;
    this.world.createTransformEntity(this.debris, { persistent: true });
    const root = this.model.trombone;
    // Swung into the floor it dents and sheds these, in this order, as it takes damage.
    const breaks: [string, number][] = [
        ['TromboneBumper', 0.8],
    ];
    const parts: PropPart[] = [];
    for (const [part, breakAt] of breaks) {
      const object = root.getObjectByName(part);
      if (object) parts.push({ name: `LooseTrombone${part}`, objects: [object], breakAt });
    }
    this.slidePart = parts.findIndex((part) => part.objects[0] === this.model.slide);
    this.smash = new PropSmasher(root, this.debris, {
      mass: 1.2,
      wear: 0.028,
      parts,
      // The bell and slide tear apart around where it keeps landing.
      fractures: [
        { sources: [root.getObjectByName('TromboneBell')!], pieces: 6, structural: true },
        { sources: [root.getObjectByName('TromboneSlide')!], pieces: 6, structural: true },
      ],
      sound: (speed, _part, broke) => {
        if (speed > 0.4) this.synth.knock(Math.min(1, speed / 9), broke, 2);
      },
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
    const active = e.getValue(AirTrombone, 'active') ?? false;
    if (!active || this.world.visibilityState.peek() === VisibilityState.NonImmersive) {
      this.show(false);
      return;
    }
    this.show(true);
    const dt = Math.min(delta, 0.1);
    if (e.getValue(AirTrombone, 'resetPlacement')) {
      this.smash.repair();
      e.setValue(AirTrombone, 'resetPlacement', false);
    }
    this.grips[0] = this.player.gripSpaces.left;
    this.grips[1] = this.player.gripSpaces.right;
    this.synth.setVolume(e.getValue(AirTrombone, 'volume') ?? 0.8);

    const adapters = this.input.xr.visualAdapters.hand;
    const [left, right] = this.hands;
    left.update(adapters.left, this.player.gripSpaces.left);
    right.update(adapters.right, this.player.gripSpaces.right);
    if (e.getValue(AirTrombone, 'leftHand') !== left.tracked) e.setValue(AirTrombone, 'leftHand', left.tracked);
    if (e.getValue(AirTrombone, 'rightHand') !== right.tracked) e.setValue(AirTrombone, 'rightHand', right.tracked);
    this.readHead();
    if (this.smash.hold !== SmashHold.Worn) {
      // Smashed out of the hand, it lies where it fell and does not play.
      this.model.trombone.visible = true;
      if (!this.silenced) {
        this.silenced = true;
        this.synth.stopAll();
        this.breath.reset();
      }
      this.smash.update(dt, this.hands, this.grips, e);
      this.publish();
      this.updateHud();
      return;
    }
    this.silenced = false;

    const trombone = this.model.trombone;
    trombone.visible = left.tracked;
    if (!left.tracked) {
      // Without the hand that holds it there is no horn: let go of the note.
      this.pose.atLips = false;
      this.pose.blend = 0;
      this.breath.reset();
      this.slide.reset();
      this.synth.stopAll();
      this.publish();
      this.updateHud();
      return;
    }

    const knuckle = left.positions.subarray(MIDDLE_KNUCKLE * 3, MIDDLE_KNUCKLE * 3 + 3);
    const pose = holdTrombone(this.lips, knuckle, this.lookArr, dt, this.pose);
    this.ax.fromArray(pose.x);
    this.ay.fromArray(pose.y);
    this.az.fromArray(pose.z);
    this.basis.makeBasis(this.ax, this.ay, this.az);
    trombone.quaternion.setFromRotationMatrix(this.basis);
    trombone.position.fromArray(pose.origin);
    this.partials.update(pose.elevation);

    // The right fingertips on the brace move the slide; let go, it stays where it is.
    if (right.tracked) {
      const p = right.positions;
      for (let k = 0; k < 3; k++) this.grip[k] = (p[THUMB_TIP * 3 + k] + p[INDEX_TIP * 3 + k]) / 2;
      this.slide.update(toTrombone(pose, this.grip, this.local));
    } else {
      this.slide.reset();
    }
    // Once the slide has been knocked off it is not the hand's to move.
    if (this.slidePart < 0 || this.smash.isAttached(this.slidePart)) this.model.slide.position.z = -this.slide.slide;
    trombone.updateMatrixWorld(true);
    // Swung into the floor, it takes damage (and once wrecked comes loose).
    this.smash.update(dt, this.hands, this.grips, e);

    const breath = this.breath;
    breath.update(left.pinchDistance(), pose.atLips);
    const sound = this.sound;
    this.pitch = pitchOf(this.partials.index, this.slide.slide);
    sound.midi = this.pitch;
    // Just past the stopping point the note is pianissimo; full air is fortissimo.
    sound.amplitude = breath.blowing ? 0.15 + 0.85 * Math.max(0, (breath.air - AIR_STOP) / (1 - AIR_STOP)) : 0;
    sound.tongued = breath.tongued;
    this.synth.set(sound);
    this.publish();
    this.updateHud();
  }

  /** Shows or puts away the trombone, silencing it when put away. */
  private show(visible: boolean): void {
    if (this.shown === visible) return;
    this.shown = visible;
    this.setVisible(visible);
    this.debris.visible = visible;
    // Put away, it comes back out whole.
    if (!visible) this.smash.repair();
    if (!visible) {
      this.synth.stopAll();
      this.breath.reset();
      this.slide.reset();
      this.pose.atLips = false;
      this.pose.blend = 0;
    }
  }

  private setVisible(visible: boolean): void {
    this.model.trombone.visible = visible;
    this.model.hud.sprite.visible = visible;
  }

  /** The head's position, which way it looks, and where the lips are. */
  private readHead(): void {
    const head = this.player.head;
    head.updateWorldMatrix(true, false);
    head.getWorldPosition(this.headPos);
    head.getWorldQuaternion(this.headQuat);
    this.look.set(0, 0, -1).applyQuaternion(this.headQuat);
    this.down.set(0, -1, 0).applyQuaternion(this.headQuat);
    for (let k = 0; k < 3; k++) {
      this.lookArr[k] = this.look.getComponent(k);
      this.lips[k] = this.headPos.getComponent(k) + this.down.getComponent(k) * LIPS.below + this.lookArr[k] * LIPS.forward;
    }
    this.level.set(this.look.x, 0, this.look.z);
    if (this.level.lengthSq() < 1e-6) this.level.set(0, 0, -1);
    this.level.normalize();
  }

  /** Writes what is playing to the component, building strings only when the nearest note changes. */
  private publish(): void {
    const e = this.entity;
    const nearest = Math.round(this.pitch);
    if (nearest !== this.shownMidi) {
      this.shownMidi = nearest;
      this.noteName = noteName(nearest);
      e.setValue(AirTrombone, 'note', this.noteName);
      e.setValue(AirTrombone, 'midi', nearest);
    }
    const cents = Math.round((this.pitch - nearest) * 100);
    if (e.getValue(AirTrombone, 'cents') !== cents) e.setValue(AirTrombone, 'cents', cents);
    const partial = PARTIALS[this.partials.index].partial;
    if (e.getValue(AirTrombone, 'partial') !== partial) e.setValue(AirTrombone, 'partial', partial);
    const slide = Math.round(this.slide.slide * 1000) / 10;
    if (e.getValue(AirTrombone, 'slide') !== slide) e.setValue(AirTrombone, 'slide', slide);
    const position = Math.round(positionOf(this.slide.slide) * 10) / 10;
    if (e.getValue(AirTrombone, 'position') !== position) e.setValue(AirTrombone, 'position', position);
    if (e.getValue(AirTrombone, 'holdingSlide') !== this.slide.holding) e.setValue(AirTrombone, 'holdingSlide', this.slide.holding);
    const elevation = Math.round(this.pose.elevation);
    if (e.getValue(AirTrombone, 'elevation') !== elevation) e.setValue(AirTrombone, 'elevation', elevation);
    if (e.getValue(AirTrombone, 'atLips') !== this.pose.atLips) e.setValue(AirTrombone, 'atLips', this.pose.atLips);
    const air = Math.round(this.breath.air * 100) / 100;
    if (e.getValue(AirTrombone, 'air') !== air) e.setValue(AirTrombone, 'air', air);
    if (e.getValue(AirTrombone, 'sounding') !== this.breath.blowing) e.setValue(AirTrombone, 'sounding', this.breath.blowing);
    if (e.getValue(AirTrombone, 'notes') !== this.breath.notes) e.setValue(AirTrombone, 'notes', this.breath.notes);
  }

  private updateHud(): void {
    const hud = this.model.hud;
    hud.sprite.position.copy(this.headPos).addScaledVector(this.level, HUD_FORWARD);
    // Right of the way the head faces, level.
    hud.sprite.position.x -= this.level.z * HUD_RIGHT;
    hud.sprite.position.z += this.level.x * HUD_RIGHT;
    hud.sprite.position.y -= HUD_BELOW;
    const [left, right] = this.hands;
    if (!left.tracked) {
      hud.draw(['Show your left hand', 'The trombone goes in it'], ACCENT.idle);
      return;
    }
    if (!this.pose.atLips) {
      hud.draw(['Trombone', 'Hold it out to your lips', 'Right fingertips on the slide brace'], ACCENT.idle);
      return;
    }
    const position = this.entity.getValue(AirTrombone, 'position') ?? 1;
    const partial = PARTIALS[this.partials.index].partial;
    const where = `Position ${position.toFixed(1)} · partial ${partial}`;
    if (!right.tracked || !this.slide.holding) {
      hud.draw([this.noteName, where, 'Right fingertips on the slide brace'], ACCENT.placing);
      return;
    }
    if (this.breath.blowing) {
      hud.draw([this.noteName, where, 'Tilt it to change partial'], ACCENT.playing);
      return;
    }
    hud.draw([this.noteName, where, 'Pinch your left hand to blow'], ACCENT.placing);
  }
}
