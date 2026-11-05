import { createSystem, Entity, Group, Matrix4, Object3D, Quaternion, Vector3, VisibilityState } from '@iwsdk/core';
import { dynamicMark } from '../cymbals/air-cymbals-system.js';
import { ACCENT } from '../guitar/guitar-model.js';
import { JOINT_COUNT, TrackedHand } from '../guitar/hands.js';
import { BEATER_REST, PIECE_NAMES } from '../scene-assets/drum-kit.scene-asset.js';
import { AirDrums } from './air-drums-component.js';
import { NOMINAL_SNARE, PIECES, RIG_TRAVEL } from './geometry.js';
import { createKitModel, type KitModel } from './kit-model.js';
import { createStickPose, restOn, type StickPose, stickPose, StrokeDetector, type Stroke } from './strokes.js';
import { DrumSynth } from './synth.js';
import { PropSmasher } from '../smash/prop-smash.js';
import { Smashable } from '../smash/smashable-component.js';
import type { Articulation } from './strokes.js';

/** The top of the stage the player stands on (m): the kit's feet rest on it. */
const STAGE_TOP = 0.035;
/** The snare's head sits this far below the player's eyes, within the stands' travel. */
const SNARE_BELOW_EYES = 0.72;
/** The HUD floats over the far side of the bass drum, this far above the snare. */
const HUD_AT = { x: 0.02, rise: 0.62, z: -1.08 };
/** How fast a struck rim's glow fades (time constant, s). */
const GLOW_TAU = 0.12;
/** A struck cymbal sways on its stand: stiffness (1/s²), damping (1/s) and kick per stroke (rad/s). */
const SWAY = { stiffness: 90, damping: 3.2, kick: 1.4 };
/** How fast the kick's beater falls back from the head (time constant, s). */
const BEATER_TAU = 0.07;

/** The sound each piece makes when it hits the floor, in PIECES order. */
const FLOOR_SOUND: Record<string, Articulation> = {
  snare: 'rimshot',
  hihat: 'hihatOpen',
  kick: 'kick',
  tom1: 'tom1',
  tom2: 'tom2',
  floorTom: 'floorTom',
  crash: 'crash',
  ride: 'ride',
};

/** How a stroke reads on the HUD, with its zone where it has one. */
const ZONE_NAMES: Partial<Record<Stroke['articulation'], string>> = {
  rimshot: 'rimshot',
  hihatOpen: 'open',
  rideBell: 'bell',
};

/**
 * A full drum kit on stands in front of the player, played with a stick
 * in each fist. A stroke sounds when a stick's tip comes down onto a head,
 * a cymbal or the kick pad, as loud as the tip was moving; the snare's
 * rim, the hi-hat's edge and the ride's bell each sound their own way.
 * The kit is placed in front of the player, at their height, when it is
 * taken out or reset. A fist held on a drum or cymbal pulls it off its
 * stand to throw (see ../smash/prop-smash.ts); it sounds where it lands.
 */
export class AirDrumsSystem extends createSystem({
  items: { required: [AirDrums] },
}) {
  /** Which instrument this is, for tests and tools. */
  readonly instrument = 'drums';
  readonly component = AirDrums;
  private model!: KitModel;
  private entity!: Entity;
  private synth!: DrumSynth;
  private detector!: StrokeDetector;
  private smash!: PropSmasher;
  private debris!: Group;
  private readonly grips: Object3D[] = [new Object3D(), new Object3D()];
  private readonly hands = [new TrackedHand(), new TrackedHand()] as const;
  /** Each hand's joints in kit space. */
  private readonly joints = [new Float32Array(JOINT_COUNT * 3), new Float32Array(JOINT_COUNT * 3)] as const;
  private readonly poses: [StickPose, StickPose] = [createStickPose(), createStickPose()];
  private shown = false;
  private hits = 0;
  private readonly glow = new Float32Array(PIECES.length);
  private readonly sway = new Float32Array(PIECES.length);
  private readonly swaySpeed = new Float32Array(PIECES.length);
  private beaterAge = 1;
  private readonly kitInverse = new Matrix4();
  private readonly basis = new Matrix4();
  private readonly x = new Vector3();
  private readonly y = new Vector3();
  private readonly z = new Vector3();
  private readonly headPos = new Vector3();
  private readonly headQuat = new Quaternion();
  private readonly fwd = new Vector3();
  private readonly joint = new Vector3();

  init(): void {
    this.synth = new DrumSynth();
    this.model = createKitModel();
    this.detector = new StrokeDetector(NOMINAL_SNARE);
    this.entity = this.world.createTransformEntity(this.model.root, { persistent: true });
    this.entity.addComponent(AirDrums);
    this.entity.addComponent(Smashable);
    this.model.root.visible = false;
    this.debris = new Group();
    this.debris.name = 'AirDrumsDebris';
    this.debris.visible = false;
    this.world.createTransformEntity(this.debris, { persistent: true });
    const root = this.model.root;
    const bassDrum = root.getObjectByName('BassDrum')!;
    const hihatBottom = root.getObjectByName(`${PIECE_NAMES.hihat}Bottom`);
    this.smash = new PropSmasher(root, this.debris, {
      mass: 30,
      wear: 0.08,
      grabSeconds: 0.6,
      ignore: [...this.model.sticks],
      parts: [
        ...PIECES.map((piece, i) => ({
          name: `${PIECE_NAMES[piece.id]}Loose`,
          objects: piece.id === 'hihat' && hihatBottom ? [this.model.pieces[i], hihatBottom] : [this.model.pieces[i]],
          breakAt: 0,
          grabbable: true,
        })),
        { name: 'BassDrumLoose', objects: [bassDrum], breakAt: 0, grabbable: true },
      ],
      sound: (speed, part, broke) => {
        const loudness = Math.min(1, speed / 7);
        if (loudness < 0.08) return;
        const piece = PIECES[part];
        const articulation = piece ? FLOOR_SOUND[piece.id] : 'kick';
        this.synth.play({ articulation, loudness, piece: piece?.id ?? 'kick', pan: piece?.pan ?? 0 });
        this.synth.knock(loudness * 0.6, broke);
      },
    });

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
    const active = e.getValue(AirDrums, 'active') ?? false;
    if (!active || this.world.visibilityState.peek() === VisibilityState.NonImmersive) {
      this.show(false);
      return;
    }
    const dt = Math.min(delta, 0.1);
    if (e.getValue(AirDrums, 'resetPlacement')) this.smash.repair();
    if (!this.shown || this.smash.takeRepaired() || e.getValue(AirDrums, 'resetPlacement')) {
      this.place();
      e.setValue(AirDrums, 'resetPlacement', false);
    }
    this.show(true);
    this.synth.setVolume(e.getValue(AirDrums, 'volume') ?? 0.8);

    const root = this.model.root;
    root.updateMatrixWorld(true);
    this.kitInverse.copy(root.matrixWorld).invert();
    const adapters = this.input.xr.visualAdapters.hand;
    const grips = this.player.gripSpaces;
    const now = this.synth.ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const hand = this.hands[i];
      hand.update(i === 0 ? adapters.left : adapters.right, i === 0 ? grips.left : grips.right);
      const field = i === 0 ? 'leftHand' : 'rightHand';
      if (e.getValue(AirDrums, field) !== hand.tracked) e.setValue(AirDrums, field, hand.tracked);
      const stick = this.model.sticks[i];
      stick.visible = hand.tracked;
      if (!hand.tracked) {
        this.detector.reset(i);
        continue;
      }
      const joints = this.joints[i];
      for (let j = 0; j < JOINT_COUNT; j++) {
        hand.get(j, this.joint).applyMatrix4(this.kitInverse).toArray(joints, j * 3);
      }
      const pose = stickPose(joints, this.poses[i]);
      const stroke = this.detector.update(i, pose.tip, dt);
      // A piece that has been pulled off its stand is not there to strike.
      if (stroke != null && this.smash.isAttached(PIECES.indexOf(stroke.piece))) this.strike(stroke, now);
      // A stick that came down on a surface stops on it, rather than passing through.
      const resting = this.detector.restingOn(i);
      if (resting != null) restOn(pose, resting);
      this.placeStick(stick, pose);
    }
    this.grips[0] = grips.left;
    this.grips[1] = grips.right;
    this.smash.update(dt, this.hands, this.grips, e);
    this.animate(dt);
    this.updateHud();
  }

  /** Sounds a stroke and shows it. */
  private strike(stroke: Stroke, now: number): void {
    const { piece, articulation, loudness } = stroke;
    const p = PIECES.indexOf(piece);
    this.synth.play({ articulation, loudness, piece: piece.id, pan: piece.pan }, now);
    const e = this.entity;
    e.setValue(AirDrums, 'hits', ++this.hits);
    const zone = ZONE_NAMES[articulation];
    e.setValue(AirDrums, 'lastPiece', zone ? `${piece.label} (${zone})` : piece.label);
    e.setValue(AirDrums, 'lastHit', Math.round(loudness * 100) / 100);
    e.setValue(AirDrums, 'lastSpeed', Math.round(stroke.speed * 100) / 100);
    this.glow[p] = Math.max(this.glow[p], 0.35 + 0.65 * loudness);
    if (piece.kind === 'cymbal') this.swaySpeed[p] -= SWAY.kick * (0.3 + loudness) * (piece.id === 'hihat' ? 0.25 : 1);
    if (piece.id === 'kick') this.beaterAge = 0;
  }

  /** Fades the glows, sways the struck cymbals and swings the beater back. */
  private animate(dt: number): void {
    const m = this.model;
    const fade = Math.exp(-dt / GLOW_TAU);
    for (let p = 0; p < PIECES.length; p++) {
      this.glow[p] *= fade;
      const lit = this.glow[p] > 0.01;
      m.glows[p].visible = lit;
      if (lit) m.glowMaterials[p].opacity = Math.min(0.85, this.glow[p]);
      const swing = m.swings[p];
      if (swing == null) continue;
      // A damped spring, stepped in small slices so long frames stay stable.
      const steps = Math.ceil(dt / 0.005);
      const h = dt / steps;
      for (let s = 0; s < steps; s++) {
        this.swaySpeed[p] += (-SWAY.stiffness * this.sway[p] - SWAY.damping * this.swaySpeed[p]) * h;
        this.sway[p] += this.swaySpeed[p] * h;
      }
      swing.rotation.x = this.sway[p];
    }
    this.beaterAge += dt;
    m.beater.rotation.x = BEATER_REST * (1 - Math.exp(-this.beaterAge / BEATER_TAU));
  }

  /** Shows or puts away the kit, silencing it when put away. */
  private show(visible: boolean): void {
    if (this.shown === visible) return;
    this.shown = visible;
    this.model.root.visible = visible;
    this.debris.visible = visible;
    if (!visible) {
      // Put away, it comes back out whole.
      this.smash.repair();
      this.synth.stopAll();
      this.detector.reset(0);
      this.detector.reset(1);
    }
  }

  /**
   * Puts the kit where the player stands, with the snare at their height.
   * It faces the way the player's space does, not their gaze, which may be
   * on the panel when they take the kit out.
   */
  private place(): void {
    this.readHead();
    const root = this.model.root;
    root.position.set(this.headPos.x, STAGE_TOP, this.headPos.z);
    this.player.getWorldQuaternion(this.headQuat);
    this.fwd.set(0, 0, -1).applyQuaternion(this.headQuat);
    root.rotation.set(0, Math.atan2(-this.fwd.x, -this.fwd.z), 0);
    const eyes = this.headPos.y - STAGE_TOP;
    const snare = Math.min(NOMINAL_SNARE + RIG_TRAVEL.up, Math.max(NOMINAL_SNARE - RIG_TRAVEL.down, eyes - SNARE_BELOW_EYES));
    this.model.rig.position.y = snare - NOMINAL_SNARE;
    this.detector.setSnareHeight(snare);
    this.detector.reset(0);
    this.detector.reset(1);
    this.model.hud.sprite.position.set(HUD_AT.x, snare + HUD_AT.rise, HUD_AT.z);
    this.entity.setValue(AirDrums, 'snareHeight', Math.round(snare * 1000) / 1000);
    // The rig moved: measure the kit again for smashing.
    this.smash.refit();
  }

  /** Puts a stick where its pose says (kit space). */
  private placeStick(stick: Group, pose: StickPose): void {
    this.y.fromArray(pose.axis);
    this.z.fromArray(pose.side);
    this.x.crossVectors(this.y, this.z);
    this.basis.makeBasis(this.x, this.y, this.z);
    stick.quaternion.setFromRotationMatrix(this.basis);
    stick.position.fromArray(pose.grip);
  }

  private readHead(): void {
    const head = this.player.head;
    head.updateWorldMatrix(true, false);
    head.getWorldPosition(this.headPos);
  }

  private updateHud(): void {
    const hud = this.model.hud;
    const [left, right] = this.hands;
    if (!left.tracked || !right.tracked) {
      hud.draw(['Show both hands', 'A stick goes in each fist'], ACCENT.idle);
      return;
    }
    const e = this.entity;
    let sounding = false;
    for (let p = 0; p < PIECES.length; p++) sounding ||= this.glow[p] > 0.05;
    if (this.hits > 0 && sounding) {
      const volume = Math.round((e.getValue(AirDrums, 'volume') ?? 0.8) * 100);
      hud.draw(
        [`${e.getValue(AirDrums, 'lastPiece')} ${dynamicMark(e.getValue(AirDrums, 'lastHit') ?? 0)}`, `${this.hits} strokes · ${volume}%`],
        ACCENT.playing,
      );
      return;
    }
    hud.draw(['Drums', 'Bring the stick tips down on the heads', 'Faster is louder · the round pad is the kick'], ACCENT.idle);
  }
}
