import { createSystem, Entity, Matrix4, Quaternion, Vector3, VisibilityState } from '@iwsdk/core';
import { ACCENT } from '../guitar/guitar-model.js';
import { TrackedHand } from '../guitar/hands.js';
import { AIR_STOP } from '../trumpet/playing.js';
import { AirHorn } from './air-horn-component.js';
import { BELL, BELL_AXIS, HORN } from './geometry.js';
import { createHornPose, holdFrenchHorn, LIPS, toHorn } from './hold.js';
import { Breath, fingeringName, handCover, noteName, PARTIALS, PartialSelector, soundingNote, ValveReader, WRITTEN_ABOVE } from './playing.js';
import { HornSynth } from './synth.js';
import { createHornModel, type HornModel } from './horn-model.js';

/** The HUD floats this far in front of, below and left of the head (m): clear of the bell on the right. */
const HUD_FORWARD = 0.6;
const HUD_BELOW = 0.12;
const HUD_LEFT = 0.32;
/** The middle knuckle and the wrist (WebXR hand joints). */
const MIDDLE_KNUCKLE = 11;
const WRIST = 0;
/** How fast the hand-in-bell reading follows the hand (time constant, s), so tracking jitter does not buzz the filter. */
const COVER_TAU = 0.04;

/**
 * A single B-flat French horn, held to the lips in the left hand, whose
 * index, middle and ring fingers press the three valves' levers, with the
 * right hand in the bell. The horn pivots on the lips: held out at its
 * reach the mouthpiece meets them, and its tilt picks the partial. The
 * right hand's pinch tongues the note and blows (closer is louder), and the
 * deeper it goes into the bell the more it covers the tone.
 */
export class AirHornSystem extends createSystem({
  items: { required: [AirHorn] },
}) {
  /** Which instrument this is, for tests and tools. */
  readonly instrument = 'horn';
  readonly component = AirHorn;
  private model!: HornModel;
  private entity!: Entity;
  private synth!: HornSynth;
  private readonly hands = [new TrackedHand(), new TrackedHand()] as const;
  readonly pose = createHornPose();
  readonly valves = new ValveReader();
  readonly partials = new PartialSelector();
  readonly breath = new Breath();
  private cover = 0;
  private shown = false;
  /** What the component and HUD last showed, so strings are only built on change. */
  private shownKey = -1;
  private writtenName = '';
  private fingering = '';
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
  private readonly palm = new Float32Array(3);
  private readonly local: [number, number, number] = [0, 0, 0];
  private readonly sound = { midi: 58, amplitude: 0, mute: 0, tongued: false };

  init(): void {
    this.synth = new HornSynth();
    this.model = createHornModel();
    this.entity = this.world.createTransformEntity(this.model.horn, { persistent: true });
    this.entity.addComponent(AirHorn);
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
    const active = e.getValue(AirHorn, 'active') ?? false;
    if (!active || this.world.visibilityState.peek() === VisibilityState.NonImmersive) {
      this.show(false);
      return;
    }
    this.show(true);
    const dt = Math.min(delta, 0.1);
    if (e.getValue(AirHorn, 'resetPlacement')) e.setValue(AirHorn, 'resetPlacement', false);
    this.synth.setVolume(e.getValue(AirHorn, 'volume') ?? 0.8);

    const adapters = this.input.xr.visualAdapters.hand;
    const [left, right] = this.hands;
    left.update(adapters.left, this.player.gripSpaces.left);
    right.update(adapters.right, this.player.gripSpaces.right);
    if (e.getValue(AirHorn, 'leftHand') !== left.tracked) e.setValue(AirHorn, 'leftHand', left.tracked);
    if (e.getValue(AirHorn, 'rightHand') !== right.tracked) e.setValue(AirHorn, 'rightHand', right.tracked);
    this.readHead();

    const horn = this.model.horn;
    horn.visible = left.tracked;
    if (!left.tracked) {
      // Without the hand that holds it there is no horn: let go of the note.
      this.pose.atLips = false;
      this.pose.blend = 0;
      this.valves.reset();
      this.breath.reset();
      this.synth.stopAll();
      this.publish();
      this.updateHud();
      return;
    }

    const knuckle = left.positions.subarray(MIDDLE_KNUCKLE * 3, MIDDLE_KNUCKLE * 3 + 3);
    const pose = holdFrenchHorn(this.lips, knuckle, this.lookArr, dt, this.pose);
    this.ax.fromArray(pose.x);
    this.ay.fromArray(pose.y);
    this.az.fromArray(pose.z);
    this.basis.makeBasis(this.ax, this.ay, this.az);
    horn.quaternion.setFromRotationMatrix(this.basis);
    horn.position.fromArray(pose.origin);
    horn.updateMatrixWorld(true);

    this.valves.update(left.positions);
    for (let i = 0; i < 3; i++) this.model.levers[i].position.y = HORN.leverTop - this.valves.depth[i] * HORN.travel;
    this.partials.update(pose.elevation);

    // The right hand: its palm in the bell covers the tone, its pinch is the air.
    let target = 0;
    if (right.tracked) {
      const p = right.positions;
      for (let k = 0; k < 3; k++) this.palm[k] = (p[WRIST * 3 + k] + p[MIDDLE_KNUCKLE * 3 + k]) / 2;
      const local = toHorn(pose, this.palm, this.local);
      let inside = 0;
      for (let k = 0; k < 3; k++) inside += (BELL[k] - local[k]) * BELL_AXIS[k];
      let across = 0;
      for (let k = 0; k < 3; k++) across += (local[k] - (BELL[k] - BELL_AXIS[k] * inside)) ** 2;
      target = handCover(inside, Math.sqrt(across), HORN.bellRadius);
    }
    this.cover += (target - this.cover) * (1 - Math.exp(-dt / COVER_TAU));
    const breath = this.breath;
    breath.update(right.tracked ? right.pinchDistance() : 1, pose.atLips);

    const sound = this.sound;
    sound.midi = soundingNote(this.partials.index, this.valves.down);
    // Just past the stopping point the note is pianissimo; full air is fortissimo.
    sound.amplitude = breath.blowing ? 0.15 + 0.85 * Math.max(0, (breath.air - AIR_STOP) / (1 - AIR_STOP)) : 0;
    // A hand in the bell darkens the tone; even closed it does not silence it.
    sound.mute = this.cover * 0.7;
    sound.tongued = breath.tongued;
    this.synth.set(sound);
    this.publish();
    this.updateHud();
  }

  /** Shows or puts away the horn, silencing it when put away. */
  private show(visible: boolean): void {
    if (this.shown === visible) return;
    this.shown = visible;
    this.setVisible(visible);
    if (!visible) {
      this.synth.stopAll();
      this.breath.reset();
      this.valves.reset();
      this.pose.atLips = false;
      this.pose.blend = 0;
    }
  }

  private setVisible(visible: boolean): void {
    this.model.horn.visible = visible;
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

  /** Writes what is playing to the component, building strings only when it changes. */
  private publish(): void {
    const e = this.entity;
    const down = this.valves.down;
    const key = this.partials.index * 8 + (down[0] ? 1 : 0) + (down[1] ? 2 : 0) + (down[2] ? 4 : 0);
    if (key !== this.shownKey) {
      this.shownKey = key;
      const sounding = soundingNote(this.partials.index, down);
      this.writtenName = noteName(sounding + WRITTEN_ABOVE);
      this.fingering = fingeringName(down);
      e.setValue(AirHorn, 'written', this.writtenName);
      e.setValue(AirHorn, 'valves', this.fingering);
      e.setValue(AirHorn, 'midi', sounding);
      e.setValue(AirHorn, 'partial', PARTIALS[this.partials.index].partial);
    }
    const elevation = Math.round(this.pose.elevation);
    if (e.getValue(AirHorn, 'elevation') !== elevation) e.setValue(AirHorn, 'elevation', elevation);
    if (e.getValue(AirHorn, 'atLips') !== this.pose.atLips) e.setValue(AirHorn, 'atLips', this.pose.atLips);
    const air = Math.round(this.breath.air * 100) / 100;
    if (e.getValue(AirHorn, 'air') !== air) e.setValue(AirHorn, 'air', air);
    if (e.getValue(AirHorn, 'sounding') !== this.breath.blowing) e.setValue(AirHorn, 'sounding', this.breath.blowing);
    if (e.getValue(AirHorn, 'notes') !== this.breath.notes) e.setValue(AirHorn, 'notes', this.breath.notes);
    const cover = Math.round(this.cover * 100) / 100;
    if (e.getValue(AirHorn, 'cover') !== cover) e.setValue(AirHorn, 'cover', cover);
  }

  private updateHud(): void {
    const hud = this.model.hud;
    hud.sprite.position.copy(this.headPos).addScaledVector(this.level, HUD_FORWARD);
    // Left of the way the head faces, level.
    hud.sprite.position.x += this.level.z * HUD_LEFT;
    hud.sprite.position.z -= this.level.x * HUD_LEFT;
    hud.sprite.position.y -= HUD_BELOW;
    const [left, right] = this.hands;
    if (!left.tracked) {
      hud.draw(['Show your left hand', 'The horn goes in it'], ACCENT.idle);
      return;
    }
    if (!this.pose.atLips) {
      hud.draw(['French horn', 'Hold it out to your lips', 'Left fingers on the levers'], ACCENT.idle);
      return;
    }
    if (!right.tracked) {
      hud.draw([this.writtenName, `Valves ${this.fingering}`, 'Show your right hand: pinch it to blow'], ACCENT.placing);
      return;
    }
    const partial = PARTIALS[this.partials.index].partial;
    if (this.breath.blowing) {
      hud.draw([this.writtenName, `Valves ${this.fingering} · partial ${partial}`, 'Tilt it to change partial'], ACCENT.playing);
      return;
    }
    hud.draw([this.writtenName, `Valves ${this.fingering} · partial ${partial}`, 'Pinch your right hand to blow'], ACCENT.placing);
  }
}
