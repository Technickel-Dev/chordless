import { createSystem, Entity, Matrix4, Quaternion, Vector3, VisibilityState } from '@iwsdk/core';
import { ACCENT } from '../guitar/guitar-model.js';
import { TrackedHand } from '../guitar/hands.js';
import { AirTrumpet } from './air-trumpet-component.js';
import { BELL, TRUMPET } from './geometry.js';
import { createHornPose, holdHorn, LIPS, toTrumpet } from './hold.js';
import {
  AIR_STOP,
  Breath,
  fingeringName,
  noteName,
  PARTIALS,
  PartialSelector,
  plungerAmount,
  TRANSPOSITION,
  ValveReader,
  writtenNote,
} from './playing.js';
import { TrumpetSynth } from './synth.js';
import { createTrumpetModel, type TrumpetModel } from './trumpet-model.js';

/** The HUD floats this far in front of, below and left of the head (m): clear of the horn on the right. */
const HUD_FORWARD = 0.6;
const HUD_BELOW = 0.16;
const HUD_LEFT = 0.3;
/** The right middle knuckle and the left wrist (WebXR hand joints). */
const MIDDLE_KNUCKLE = 11;
const WRIST = 0;
/** How fast the plunger reading follows the hand (time constant, s), so tracking jitter does not buzz the filter. */
const MUTE_TAU = 0.03;

/**
 * A B-flat trumpet, held in the right hand and played from the left. The
 * horn pivots on the lips: held out at its length the mouthpiece meets them,
 * and the bell's tilt picks the partial. The right fingers press the valves;
 * a left-hand pinch tongues the note and blows (closer is louder), and the
 * open left hand over the bell is a plunger mute.
 */
export class AirTrumpetSystem extends createSystem({
  items: { required: [AirTrumpet] },
}) {
  /** Which instrument this is, for tests and tools. */
  readonly instrument = 'trumpet';
  readonly component = AirTrumpet;
  private model!: TrumpetModel;
  private entity!: Entity;
  private synth!: TrumpetSynth;
  private readonly hands = [new TrackedHand(), new TrackedHand()] as const;
  readonly pose = createHornPose();
  readonly valves = new ValveReader();
  readonly partials = new PartialSelector();
  readonly breath = new Breath();
  private mute = 0;
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
  private readonly sound = { midi: 70, amplitude: 0, mute: 0, tongued: false };

  init(): void {
    this.synth = new TrumpetSynth();
    this.model = createTrumpetModel();
    this.entity = this.world.createTransformEntity(this.model.trumpet, { persistent: true });
    this.entity.addComponent(AirTrumpet);
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
    const active = e.getValue(AirTrumpet, 'active') ?? false;
    if (!active || this.world.visibilityState.peek() === VisibilityState.NonImmersive) {
      this.show(false);
      return;
    }
    this.show(true);
    const dt = Math.min(delta, 0.1);
    if (e.getValue(AirTrumpet, 'resetPlacement')) e.setValue(AirTrumpet, 'resetPlacement', false);
    this.synth.setVolume(e.getValue(AirTrumpet, 'volume') ?? 0.8);

    const adapters = this.input.xr.visualAdapters.hand;
    const [left, right] = this.hands;
    left.update(adapters.left, this.player.gripSpaces.left);
    right.update(adapters.right, this.player.gripSpaces.right);
    if (e.getValue(AirTrumpet, 'leftHand') !== left.tracked) e.setValue(AirTrumpet, 'leftHand', left.tracked);
    if (e.getValue(AirTrumpet, 'rightHand') !== right.tracked) e.setValue(AirTrumpet, 'rightHand', right.tracked);
    this.readHead();

    const trumpet = this.model.trumpet;
    trumpet.visible = right.tracked;
    if (!right.tracked) {
      // Without the hand there is no horn: let go of the note.
      this.pose.atLips = false;
      this.pose.blend = 0;
      this.valves.reset();
      this.breath.reset();
      this.synth.stopAll();
      this.publish();
      this.updateHud();
      return;
    }

    const knuckle = right.positions.subarray(MIDDLE_KNUCKLE * 3, MIDDLE_KNUCKLE * 3 + 3);
    const pose = holdHorn(this.lips, knuckle, this.lookArr, dt, this.pose);
    this.ax.fromArray(pose.x);
    this.ay.fromArray(pose.y);
    this.az.fromArray(pose.z);
    this.basis.makeBasis(this.ax, this.ay, this.az);
    trumpet.quaternion.setFromRotationMatrix(this.basis);
    trumpet.position.fromArray(pose.origin);
    trumpet.updateMatrixWorld(true);

    this.valves.update(right.positions);
    for (let i = 0; i < 3; i++) this.model.pistons[i].position.y = -this.valves.depth[i] * TRUMPET.travel;
    this.partials.update(pose.elevation);

    // The left hand: its pinch is the air, its palm over the bell the plunger.
    let target = 0;
    if (left.tracked) {
      const p = left.positions;
      for (let k = 0; k < 3; k++) this.palm[k] = (p[WRIST * 3 + k] + p[MIDDLE_KNUCKLE * 3 + k]) / 2;
      const local = toTrumpet(pose, this.palm, this.local);
      // The bell points along -Z, so in front of its rim is further toward -Z.
      target = plungerAmount(TRUMPET.bellRimZ - local[2], Math.hypot(local[0] - BELL[0], local[1] - BELL[1]), TRUMPET.bellRadius);
    }
    this.mute += (target - this.mute) * (1 - Math.exp(-dt / MUTE_TAU));
    const breath = this.breath;
    breath.update(left.tracked ? left.pinchDistance() : 1, pose.atLips);

    const sound = this.sound;
    sound.midi = writtenNote(this.partials.index, this.valves.down) + TRANSPOSITION;
    // Just past the stopping point the note is pianissimo; full air is fortissimo.
    sound.amplitude = breath.blowing ? 0.15 + 0.85 * Math.max(0, (breath.air - AIR_STOP) / (1 - AIR_STOP)) : 0;
    sound.mute = this.mute;
    sound.tongued = breath.tongued;
    this.synth.set(sound);
    this.publish();
    this.updateHud();
  }

  /** Shows or puts away the trumpet, silencing it when put away. */
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
    this.model.trumpet.visible = visible;
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
      const written = writtenNote(this.partials.index, down);
      this.writtenName = noteName(written);
      this.fingering = fingeringName(down);
      e.setValue(AirTrumpet, 'written', this.writtenName);
      e.setValue(AirTrumpet, 'valves', this.fingering);
      e.setValue(AirTrumpet, 'midi', written + TRANSPOSITION);
      e.setValue(AirTrumpet, 'partial', PARTIALS[this.partials.index].partial);
    }
    const elevation = Math.round(this.pose.elevation);
    if (e.getValue(AirTrumpet, 'elevation') !== elevation) e.setValue(AirTrumpet, 'elevation', elevation);
    if (e.getValue(AirTrumpet, 'atLips') !== this.pose.atLips) e.setValue(AirTrumpet, 'atLips', this.pose.atLips);
    const air = Math.round(this.breath.air * 100) / 100;
    if (e.getValue(AirTrumpet, 'air') !== air) e.setValue(AirTrumpet, 'air', air);
    if (e.getValue(AirTrumpet, 'sounding') !== this.breath.blowing) e.setValue(AirTrumpet, 'sounding', this.breath.blowing);
    if (e.getValue(AirTrumpet, 'notes') !== this.breath.notes) e.setValue(AirTrumpet, 'notes', this.breath.notes);
    const mute = Math.round(this.mute * 100) / 100;
    if (e.getValue(AirTrumpet, 'mute') !== mute) e.setValue(AirTrumpet, 'mute', mute);
  }

  private updateHud(): void {
    const hud = this.model.hud;
    hud.sprite.position.copy(this.headPos).addScaledVector(this.level, HUD_FORWARD);
    // Left of the way the head faces, level.
    hud.sprite.position.x += this.level.z * HUD_LEFT;
    hud.sprite.position.z -= this.level.x * HUD_LEFT;
    hud.sprite.position.y -= HUD_BELOW;
    const [left, right] = this.hands;
    if (!right.tracked) {
      hud.draw(['Show your right hand', 'The trumpet goes in it'], ACCENT.idle);
      return;
    }
    if (!this.pose.atLips) {
      hud.draw(['Trumpet', 'Hold it out to your lips', 'Fingers on the valves'], ACCENT.idle);
      return;
    }
    if (!left.tracked) {
      hud.draw([this.writtenName, `Valves ${this.fingering}`, 'Show your left hand: pinch it to blow'], ACCENT.placing);
      return;
    }
    const partial = PARTIALS[this.partials.index].partial;
    const muted = this.mute > 0.3 ? ' · plunger' : '';
    if (this.breath.blowing) {
      hud.draw([this.writtenName, `Valves ${this.fingering} · partial ${partial}${muted}`, 'Tilt the bell to change partial'], ACCENT.playing);
      return;
    }
    hud.draw([this.writtenName, `Valves ${this.fingering} · partial ${partial}`, 'Pinch your left hand to blow'], ACCENT.placing);
  }
}
