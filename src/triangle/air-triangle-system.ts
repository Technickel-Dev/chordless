import { createSystem, Entity, Group, Matrix4, Object3D, Quaternion, Vector3, VisibilityState } from '@iwsdk/core';
import { dynamicMark } from '../cymbals/air-cymbals-system.js';
import { ACCENT, type HudStep } from '../guitar/guitar-model.js';
import { TrackedHand } from '../guitar/hands.js';
import { AirTriangle } from './air-triangle-component.js';
import { SIDE_NAMES } from './geometry.js';
import {
  beaterPose,
  createBeaterPose,
  createTrianglePose,
  DAMPING_JOINTS,
  StrikeDetector,
  toTriangle,
  touchesBar,
  trianglePose,
} from './strike.js';
import { TriangleSynth } from './synth.js';
import { PropSmasher, type PropPart } from '../smash/prop-smash.js';
import { Smashable, SmashHold } from '../smash/smashable-component.js';
import { createTriangleModel, type TriangleModel } from './triangle-model.js';

/** The sign's pictograms: how to hold it, how to play, how to stop it ringing. */
const HOW_TO_HOLD: readonly HudStep[] = [
  { icon: 'grab', caption: 'CLIP LEFT' },
  { icon: 'hammer', caption: 'BEATER RIGHT' },
];
const HOW_TO_PLAY: readonly HudStep[] = [
  { icon: 'hammer', caption: 'STRIKE' },
  { icon: 'gauge', caption: 'FAST = LOUD', faint: true },
];
const HOW_TO_STOP: readonly HudStep[] = [{ icon: 'volumeX', caption: 'TOUCH TO STOP', faint: true }];

/** The HUD floats this far in front of, below and left of the head (m), as the cymbals' does. */
const HUD_FORWARD = 0.6;
const HUD_BELOW = 0.14;
const HUD_LEFT = 0.3;

type Vec = [number, number, number];

/**
 * An orchestral triangle hanging from a clip pinched in the left hand, and
 * a steel beater in the right fist. Striking the bar sounds it, as loud as
 * the beater was moving; strikes add to what is ringing, so a roll
 * sustains. Touching the bar with the holding hand's free fingers, or
 * resting the beater on it, damps it.
 */
export class AirTriangleSystem extends createSystem({
  items: { required: [AirTriangle] },
}) {
  /** Which instrument this is, for tests and tools. */
  readonly instrument = 'triangle';
  readonly component = AirTriangle;
  private model!: TriangleModel;
  private entity!: Entity;
  private synth!: TriangleSynth;
  private readonly left = new TrackedHand();
  private readonly right = new TrackedHand();
  private readonly hands: TrackedHand[] = [];
  private readonly grips: Object3D[] = [new Object3D(), new Object3D()];
  private smash!: PropSmasher;
  private debris!: Group;
  private readonly pose = createTrianglePose();
  private readonly beater = createBeaterPose();
  private readonly strike = new StrikeDetector();
  private readonly butt: Vec = [0, 0, 0];
  private readonly tip: Vec = [0, 0, 0];
  private readonly fingers = new Float32Array(DAMPING_JOINTS.length * 3);
  private readonly scratch: Vec = [0, 0, 0];
  private readonly joint: Vec = [0, 0, 0];
  private shown = false;
  private damped = false;
  private damps = 0;
  private shownRinging = -1;
  private readonly basis = new Matrix4();
  private readonly x = new Vector3();
  private readonly y = new Vector3();
  private readonly z = new Vector3();
  private readonly headPos = new Vector3();
  private readonly headQuat = new Quaternion();
  private readonly fwd = new Vector3();
  private readonly head: Vec = [0, 0, 0];

  init(): void {
    this.synth = new TriangleSynth();
    this.model = createTriangleModel();
    this.entity = this.world.createTransformEntity(this.model.triangle, { persistent: true });
    this.entity.addComponent(AirTriangle);
    this.entity.addComponent(Smashable);
    this.world.createTransformEntity(this.model.beater, { persistent: true });
    this.debris = new Group();
    this.debris.name = 'AirTriangleDebris';
    this.debris.visible = false;
    this.world.createTransformEntity(this.debris, { persistent: true });
    this.hands.push(this.left, this.right);
    const parts: PropPart[] = [];
    for (const [name, breakAt] of [['Loop', 0.8], ['Clip', 0.5]] as const) {
      const object = this.model.triangle.getObjectByName(name);
      if (object) parts.push({ name: `LooseTriangle${name}`, objects: [object], breakAt });
    }
    this.smash = new PropSmasher(this.model.triangle, this.debris, {
      mass: 0.3,
      wear: 0.06,
      parts,
      fractures: [{ sources: [this.model.triangle.getObjectByName('Bar')!], pieces: 4, structural: true }],
      // The bar hitting the floor rings, as loud as the blow.
      sound: (speed) => {
        if (speed > 0.6) this.synth.strike({ loudness: Math.min(1, speed / 8), position: 0.5, across: 0 });
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
    const active = e.getValue(AirTriangle, 'active') ?? false;
    if (!active || this.world.visibilityState.peek() === VisibilityState.NonImmersive) {
      this.show(false);
      return;
    }
    this.show(true);
    const dt = Math.min(delta, 0.1);
    if (e.getValue(AirTriangle, 'resetPlacement')) e.setValue(AirTriangle, 'resetPlacement', false);
    this.synth.setVolume(e.getValue(AirTriangle, 'volume') ?? 0.8);

    const adapters = this.input.xr.visualAdapters.hand;
    const { left, right } = this;
    left.update(adapters.left, this.player.gripSpaces.left);
    right.update(adapters.right, this.player.gripSpaces.right);
    if (e.getValue(AirTriangle, 'leftHand') !== left.tracked) e.setValue(AirTriangle, 'leftHand', left.tracked);
    if (e.getValue(AirTriangle, 'rightHand') !== right.tracked) e.setValue(AirTriangle, 'rightHand', right.tracked);
    this.readHead();

    const { triangle, beater } = this.model;
    // Smashed out of the hand, it lies where it fell and is not played.
    const inHand = this.smash.hold === SmashHold.Worn;
    triangle.visible = left.tracked || !inHand;
    beater.visible = right.tracked;
    if (left.tracked && inHand) {
      const p = trianglePose(left.positions, this.head, this.pose);
      this.place(triangle, p.origin, this.x.fromArray(p.x), this.y.fromArray(p.y), this.z.fromArray(p.z));
    }
    if (right.tracked) {
      const b = beaterPose(right.positions, this.beater);
      this.x.fromArray(b.along);
      // Any frame round the rod will do; keep it steady by leaning on world up.
      this.y.set(0, 1, 0).addScaledVector(this.x, -this.x.y);
      if (this.y.lengthSq() < 1e-6) this.y.set(1, 0, 0).addScaledVector(this.x, -this.x.x);
      this.y.normalize();
      this.z.crossVectors(this.x, this.y);
      this.place(beater, b.grip, this.x, this.y, this.z);
    }

    this.grips[0] = this.player.gripSpaces.left;
    this.grips[1] = this.player.gripSpaces.right;
    this.smash.update(dt, this.hands, this.grips, e);

    const strike = this.strike;
    const now = this.synth.ctx.currentTime;
    if (left.tracked && right.tracked && inHand) {
      toTriangle(this.pose, this.beater.butt, this.butt);
      toTriangle(this.pose, this.beater.tip, this.tip);
      strike.update(this.butt, this.tip, dt);
    } else {
      strike.reset();
    }
    if (strike.struck) {
      this.synth.strike({ loudness: strike.loudness, position: strike.position, across: strike.across }, now);
      e.setValue(AirTriangle, 'strikes', strike.strikes);
      e.setValue(AirTriangle, 'lastStrike', Math.round(strike.loudness * 100) / 100);
      e.setValue(AirTriangle, 'lastSpeed', Math.round(strike.speed * 100) / 100);
      e.setValue(AirTriangle, 'lastSide', SIDE_NAMES[strike.side] ?? '');
    }

    // The holding hand's free fingers on the bar, or the beater resting on it, damp it.
    let fingers = false;
    if (left.tracked && inHand) {
      for (let i = 0; i < DAMPING_JOINTS.length; i++) {
        const j = DAMPING_JOINTS[i] * 3;
        this.joint[0] = left.positions[j];
        this.joint[1] = left.positions[j + 1];
        this.joint[2] = left.positions[j + 2];
        toTriangle(this.pose, this.joint, this.scratch);
        this.fingers.set(this.scratch, i * 3);
      }
      fingers = touchesBar(this.fingers, DAMPING_JOINTS.length);
    }
    const damping = strike.damping || fingers;
    if (damping && !this.damped) {
      if (this.synth.ringing(now) > 0.02) e.setValue(AirTriangle, 'damps', ++this.damps);
      this.synth.damp(now);
    } else if (!damping && this.damped) {
      this.synth.release(now);
    }
    this.damped = damping;

    const ringing = this.synth.ringing(now);
    this.model.glow.visible = ringing > 0.01 && triangle.visible && inHand;
    this.model.glowMaterial.opacity = Math.min(0.7, ringing * 0.8);
    const shown = Math.round(ringing * 100) / 100;
    if (shown !== this.shownRinging) {
      this.shownRinging = shown;
      e.setValue(AirTriangle, 'ringing', shown);
    }
    if (e.getValue(AirTriangle, 'touching') !== strike.touching) e.setValue(AirTriangle, 'touching', strike.touching);
    this.updateHud(ringing);
  }

  /** Shows or puts away the triangle and beater, silencing them when put away. */
  private show(visible: boolean): void {
    if (this.shown === visible) return;
    this.shown = visible;
    this.setVisible(visible);
    this.debris.visible = visible;
    if (!visible) {
      // Put away, it comes back out whole.
      this.smash.repair();
      this.synth.stopAll();
      this.strike.reset();
    }
  }

  private setVisible(visible: boolean): void {
    this.model.triangle.visible = visible;
    this.model.beater.visible = visible;
    this.model.hud.sprite.visible = visible;
  }

  private place(object: Group, at: ArrayLike<number>, x: Vector3, y: Vector3, z: Vector3): void {
    this.basis.makeBasis(x, y, z);
    object.quaternion.setFromRotationMatrix(this.basis);
    object.position.set(at[0], at[1], at[2]);
    object.updateMatrixWorld(true);
  }

  /** The head's position, and which way the torso faces (level). */
  private readHead(): void {
    const head = this.player.head;
    head.updateWorldMatrix(true, false);
    head.getWorldPosition(this.headPos);
    head.getWorldQuaternion(this.headQuat);
    this.headPos.toArray(this.head);
    this.fwd.set(0, 0, -1).applyQuaternion(this.headQuat);
    this.fwd.y = 0;
    if (this.fwd.lengthSq() < 1e-6) this.fwd.set(0, 0, -1);
    this.fwd.normalize();
  }

  private updateHud(ringing: number): void {
    const hud = this.model.hud;
    hud.sprite.position.copy(this.headPos).addScaledVector(this.fwd, HUD_FORWARD);
    hud.sprite.position.x += this.fwd.z * HUD_LEFT;
    hud.sprite.position.z -= this.fwd.x * HUD_LEFT;
    hud.sprite.position.y -= HUD_BELOW;
    if (!this.left.tracked || !this.right.tracked) {
      hud.draw({ steps: HOW_TO_HOLD }, ACCENT.idle);
      return;
    }
    const e = this.entity;
    if (ringing > 0.02 && (e.getValue(AirTriangle, 'strikes') ?? 0) > 0) {
      const volume = Math.round((e.getValue(AirTriangle, 'volume') ?? 0.8) * 100);
      hud.draw(
        {
          headline: `DING ${dynamicMark(e.getValue(AirTriangle, 'lastStrike') ?? 0)}`,
          detail: `${e.getValue(AirTriangle, 'lastSide')} · ${volume}%`,
          steps: HOW_TO_STOP,
        },
        ACCENT.playing,
      );
      return;
    }
    hud.draw({ steps: HOW_TO_PLAY }, ACCENT.idle);
  }
}
