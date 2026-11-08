import { createSystem, Entity, Group, Matrix4, Object3D, Quaternion, Vector3, VisibilityState } from '@iwsdk/core';
import { midiName } from '../guitar/chords.js';
import { PRESS } from '../guitar/fretting.js';
import { ACCENT, type HudStep } from '../guitar/guitar-model.js';
import { JOINT, JOINT_COUNT, TrackedHand } from '../guitar/hands.js';
import { AirViolin, Intonation } from './air-violin-component.js';
import type { BowSpec } from './bow.js';
import { BowContact, bowedAmplitude, bowPose, collideBow, createBowPose } from './bow.js';
import type { BowedGeometry } from './geometry.js';
import { StopReader } from './stopping.js';
import { BowedSynth, type BowedVoice } from './synth.js';
import { placeString, ViolinModel } from './violin-model.js';
import { PropSmasher, type PropPart } from '../smash/prop-smash.js';
import { Smashable, SmashHold } from '../smash/smashable-component.js';

/** The sign's pictograms until the bow first sounds. */
const SHOW_HANDS: readonly HudStep[] = [{ icon: 'hand', caption: 'SHOW HANDS' }];
const SHOW_BOW_HAND: readonly HudStep[] = [{ icon: 'hand', caption: 'BOW HAND' }];
const HOW_TO_BOW: readonly HudStep[] = [
  { icon: 'hand', caption: 'PRESS LEFT' },
  { icon: 'moveHorizontal', caption: 'BOW RIGHT' },
  { icon: 'rotateCw', caption: 'TILT = STRING', faint: true },
];

const UP = new Vector3(0, 1, 0);
/** The torso turns with the head only past this yaw, so glancing along the neck is free. */
const YAW_DEADBAND = (35 * Math.PI) / 180;

/** A direction or offset along the torso's right, up and forward axes. */
interface TorsoVector {
  right: number;
  up: number;
  forward: number;
}

/** Where an instrument is held, relative to the player's head and torso. */
export interface Placement {
  /** Where the tail of the body is, from the head. */
  tail: TorsoVector;
  /** Which way the neck points, toward the scroll. */
  neck: TorsoVector;
  /** Which way the top faces, before rolling it about the neck. */
  face: TorsoVector;
  /** Roll about the neck (radians): positive turns the top toward the high strings' side. */
  roll: number;
}

/** Everything that makes one bowed instrument's system its own. */
export interface BowedConfig {
  /** 'violin', 'cello': how tests and tools find this system. */
  instrument: string;
  component: typeof AirViolin;
  geometry: BowedGeometry;
  bow: BowSpec;
  voice: BowedVoice;
  createModel: () => ViolinModel;
  placement: Placement;
}

/** Joints along each stopping finger, tip first, down to the knuckle. */
const STOP_FINGERS = [
  [JOINT.indexTip, JOINT.indexDistal, JOINT.indexIntermediate, JOINT.indexProximal],
  [JOINT.middleTip, JOINT.middleDistal, JOINT.middleIntermediate, JOINT.middleProximal],
  [JOINT.ringTip, JOINT.ringDistal, JOINT.ringIntermediate, JOINT.ringProximal],
  [JOINT.pinkyTip, JOINT.pinkyDistal, JOINT.pinkyIntermediate, JOINT.pinkyProximal],
] as const;
/** As on the guitar: the fingertip pad stops a string; the rest only where it lies flat. */
const PAD_FRACTION = 0.5;
const SAMPLE_SPACING = 0.006;
/** A held note grows vibrato after this long (snap intonation only; in free, the finger makes its own). */
const VIBRATO_DELAY = 0.35;
/**
 * What comes off a bowed instrument as it is smashed, and at what health:
 * the strings and bridge first, then the chin rest, the tailpiece and endpin, the
 * scroll, and finally the neck.
 */
const BREAKS: [string, number][] = [
  ['Strings', 0.85],
  ['Bridge', 0.85],
  ['ChinRest', 0.65],
  ['Tailpiece', 0.5],
  ['Endpin', 0.5],
  ['Head', 0.35],
  ['Neck', 0.15],
];

/**
 * A hand-played bowed instrument. It is held where its placement says and
 * follows the player; left fingertips stop real strings anywhere along the
 * fingerboard (no frets), and the right hand holds a bow, drawn across the
 * strings near the bridge. Tilting the bow chooses the string; bow speed
 * sets the loudness. A left fist round it takes it off the player to swing
 * into the floor, which knocks its fittings, scroll and neck off (see
 * ../smash/prop-smash.ts); opening the hand throws it.
 */
export function createBowedSystem(config: BowedConfig) {
  const AirViolin = config.component;
  const G = config.geometry;
  const { boardZ, OPEN_MIDI, STRING_COUNT, STRING_NAMES, stopX, stringY, stringZ } = G;
  const VIOLIN = G.dims;
  const P = config.placement;

  return class BowedSystem extends createSystem({
    items: { required: [AirViolin] },
  }) {
    /** Which instrument this is. */
    readonly instrument = config.instrument;
    /** Its state component. */
    readonly component = AirViolin;
    private model!: ViolinModel;
    private entity!: Entity;
    private synth!: BowedSynth;
    private smash!: PropSmasher;
    private debris!: Group;
    private readonly hands: TrackedHand[] = [];
    private readonly grips: Object3D[] = [new Object3D(), new Object3D()];
    private playing = true;

    private readonly left = new TrackedHand();
    private readonly right = new TrackedHand();
    private readonly stops = new StopReader(G);
    private readonly bow = new BowContact(G);
    private readonly pose = createBowPose();
    private readonly worldPose = createBowPose();

    private torsoYaw = 0;
    private placed = false;
    private shown = false;
    private readonly headPos = new Vector3();
    private readonly headQuat = new Quaternion();
    private readonly fwd = new Vector3();
    private readonly rgt = new Vector3();
    private readonly target = new Vector3();
    private readonly axisX = new Vector3();
    private readonly axisY = new Vector3();
    private readonly axisZ = new Vector3();
    private readonly basis = new Matrix4();
    private readonly targetQuat = new Quaternion();
    private readonly inverse = new Matrix4();
    private readonly tmp = new Vector3();
    private readonly leftLocal = new Float32Array(JOINT_COUNT * 3);
    private readonly rightLocal = new Float32Array(JOINT_COUNT * 3);

    private readonly amp = new Float32Array(STRING_COUNT);
    private readonly held = new Float32Array(STRING_COUNT);
    private readonly sound = { midi: 69, amplitude: 0, brightness: 0.5, vibrato: 0 };
    private strokes = 0;
    private shownStops = '';
    private shownBowing = '';

    init(): void {
      this.synth = new BowedSynth(STRING_COUNT, undefined, config.voice);
      this.model = config.createModel();
      this.entity = this.world.createTransformEntity(this.model.root, { persistent: true });
      this.entity.addComponent(AirViolin);
      this.entity.addComponent(Smashable);
      this.world.createTransformEntity(this.model.bow, { persistent: true });
      this.model.root.visible = false;
      this.model.bow.visible = false;
      this.debris = new Group();
      this.debris.name = `Air${config.instrument[0].toUpperCase()}${config.instrument.slice(1)}Debris`;
      this.debris.visible = false;
      this.world.createTransformEntity(this.debris, { persistent: true });
      this.hands.push(this.left, this.right);
      const root = this.model.root;
      const title = config.instrument[0].toUpperCase() + config.instrument.slice(1);
      const parts: PropPart[] = [];
      for (const [name, breakAt] of BREAKS) {
        const object = root.getObjectByName(name);
        if (object) parts.push({ name: `Loose${title}${name}`, objects: [object], breakAt, vanish: name === 'Strings' });
      }
      const cello = config.instrument === 'cello';
      this.smash = new PropSmasher(root, this.debris, {
        mass: cello ? 3 : 0.5,
        wear: cello ? 0.05 : 0.07,
        grabWhole: true,
        // The bow hand curls round the frog, close to the strings: only the left hand grabs.
        grabHands: [0],
        parts,
        fractures: [{ sources: [root.getObjectByName('Body')!], pieces: cello ? 12 : 9, structural: true }],
        sound: (speed, _part, broke) => {
          if (speed > 0.4) this.synth.knock(Math.min(1, speed / 9), broke, cello ? 0.75 : 1.3);
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
          this.placed = false;
        }),
        () => this.synth.dispose(),
      );
    }

    update(delta: number): void {
      const e = this.entity;
      const active = e.getValue(AirViolin, 'active') ?? false;
      if (!active || this.world.visibilityState.peek() === VisibilityState.NonImmersive) {
        this.show(false);
        return;
      }
      this.show(true);
      const dt = Math.min(delta, 0.1);

      const hands = this.input.xr.visualAdapters.hand;
      this.left.update(hands.left, this.player.gripSpaces.left);
      this.right.update(hands.right, this.player.gripSpaces.right);
      if (e.getValue(AirViolin, 'leftHand') !== this.left.tracked) e.setValue(AirViolin, 'leftHand', this.left.tracked);
      if (e.getValue(AirViolin, 'rightHand') !== this.right.tracked) e.setValue(AirViolin, 'rightHand', this.right.tracked);

      this.readHead();
      if (e.getValue(AirViolin, 'resetPlacement')) this.smash.repair();
      if (!this.placed || this.smash.takeRepaired() || e.getValue(AirViolin, 'resetPlacement')) {
        e.setValue(AirViolin, 'resetPlacement', false);
        this.torsoYaw = this.headYaw();
        this.placed = true;
        this.model.root.userData.posed = false;
      }
      const worn = this.smash.hold === SmashHold.Worn;
      if (worn) {
        this.followTorso(dt);
        this.poseViolin(dt);
      }
      this.synth.setVolume(e.getValue(AirViolin, 'volume') ?? 0.8);
      this.grips[0] = this.player.gripSpaces.left;
      this.grips[1] = this.player.gripSpaces.right;
      this.smash.update(dt, this.hands, this.grips, e);

      // Taken off the player, it is not being played.
      const playing = this.smash.hold === SmashHold.Worn;
      if (playing !== this.playing) {
        this.playing = playing;
        if (!playing) {
          this.synth.stopAll();
          this.amp.fill(0);
          this.bow.reset();
          // Nothing marks where fingers and bow meet a broken instrument.
          const m = this.model;
          for (const glow of m.vibrations) glow.visible = false;
          for (const dot of m.stopDots) dot.visible = false;
          for (const shadow of m.fingerShadows) shadow.visible = false;
          m.bowMark.visible = false;
        }
      }
      if (playing) {
        this.updateStops(dt);
        this.updateBow(dt);
        this.updateSound(dt);
      }
      this.updateHud();
    }

    /** Shows or puts away the violin and bow, silencing it when put away. */
    private show(visible: boolean): void {
      if (this.shown === visible) return;
      this.shown = visible;
      this.model.root.visible = visible;
      this.model.bow.visible = visible;
      this.debris.visible = visible;
      if (!visible) {
        // Put away, it comes back out whole.
        this.smash.repair();
        this.synth.stopAll();
        this.amp.fill(0);
        this.bow.reset();
      }
    }

    private readHead(): void {
      const head = this.player.head;
      head.updateWorldMatrix(true, false);
      head.getWorldPosition(this.headPos);
      head.getWorldQuaternion(this.headQuat);
    }

    private headYaw(): number {
      this.tmp.set(0, 0, -1).applyQuaternion(this.headQuat);
      return Math.atan2(-this.tmp.x, -this.tmp.z);
    }

    /** Big turns carry the violin round; glances along the neck do not. */
    private followTorso(dt: number): void {
      const diff = Math.atan2(Math.sin(this.headYaw() - this.torsoYaw), Math.cos(this.headYaw() - this.torsoYaw));
      if (Math.abs(diff) > YAW_DEADBAND) {
        this.torsoYaw += (diff - Math.sign(diff) * YAW_DEADBAND) * (1 - Math.exp(-dt * 4));
      }
      this.fwd.set(-Math.sin(this.torsoYaw), 0, -Math.cos(this.torsoYaw));
      this.rgt.set(Math.cos(this.torsoYaw), 0, -Math.sin(this.torsoYaw));
    }

    private poseViolin(dt: number): void {
      const { fwd, rgt } = this;
      this.axisX.set(0, 0, 0).addScaledVector(rgt, P.neck.right).addScaledVector(UP, P.neck.up).addScaledVector(fwd, P.neck.forward).normalize();
      // The top facing its way, then rolled about the neck.
      this.axisZ.set(0, 0, 0).addScaledVector(rgt, P.face.right).addScaledVector(UP, P.face.up).addScaledVector(fwd, P.face.forward);
      this.axisZ.addScaledVector(this.axisX, -this.axisZ.dot(this.axisX)).normalize();
      this.axisY.crossVectors(this.axisZ, this.axisX);
      // Positive roll turns the top toward the high strings, on the -lowSide of Y.
      const roll = P.roll * G.dims.lowSide;
      this.axisZ.multiplyScalar(Math.cos(roll)).addScaledVector(this.axisY, -Math.sin(roll)).normalize();
      this.axisY.crossVectors(this.axisZ, this.axisX).normalize();
      this.basis.makeBasis(this.axisX, this.axisY, this.axisZ);
      this.targetQuat.setFromRotationMatrix(this.basis);
      // The tail where the placement puts it; the origin (under the bridge) is up the body from it.
      this.target
        .copy(this.headPos)
        .addScaledVector(rgt, P.tail.right)
        .addScaledVector(UP, P.tail.up)
        .addScaledVector(fwd, P.tail.forward)
        .addScaledVector(this.axisX, -VIOLIN.tailX);

      const root = this.model.root;
      const k = 1 - Math.exp(-dt * 14);
      if (root.userData.posed) {
        root.position.lerp(this.target, k);
        root.quaternion.slerp(this.targetQuat, k);
      } else {
        root.position.copy(this.target);
        root.quaternion.copy(this.targetQuat);
        root.userData.posed = true;
      }
      root.updateMatrixWorld(true);
      this.inverse.copy(root.matrixWorld).invert();
    }

    /** Puts a hand's joints into violin space. */
    private toLocal(hand: TrackedHand, out: Float32Array): void {
      for (let j = 0; j < JOINT_COUNT; j++) {
        this.tmp.fromArray(hand.positions, j * 3).applyMatrix4(this.inverse).toArray(out, j * 3);
      }
    }

    /** Reads the left hand into where each string is stopped. */
    private updateStops(dt: number): void {
      const reader = this.stops;
      const local = this.leftLocal;
      reader.begin();
      if (this.left.tracked) {
        this.toLocal(this.left, local);
        for (const joints of STOP_FINGERS) {
          for (let k = 0; k < joints.length - 1; k++) {
            const a = joints[k] * 3;
            const b = joints[k + 1] * 3;
            const flat = local[a + 2] - stringZ(1, local[a]) <= PRESS.above && local[b + 2] - stringZ(1, local[b]) <= PRESS.above;
            if (k > 0 && !flat) break;
            const reach = flat ? 1 : PAD_FRACTION;
            const len = Math.hypot(local[b] - local[a], local[b + 1] - local[a + 1], local[b + 2] - local[a + 2]);
            const n = Math.max(1, Math.min(8, Math.ceil((len * reach) / SAMPLE_SPACING)));
            for (let i = 0; i <= n; i++) {
              const t = (i / n) * reach;
              reader.addPoint(
                local[a] + (local[b] - local[a]) * t,
                local[a + 1] + (local[b + 1] - local[a + 1]) * t,
                local[a + 2] + (local[b + 2] - local[a + 2]) * t,
              );
            }
          }
        }
      }
      const snap = (this.entity.getValue(AirViolin, 'intonation') ?? Intonation.Snap) === Intonation.Snap;
      const changed = reader.commit(dt, this.left.tracked, snap);

      // Fingertip shadows on the fingerboard: green while stopping a string.
      for (let f = 0; f < 4; f++) {
        const shadow = this.model.fingerShadows[f];
        const tip = STOP_FINGERS[f][0] * 3;
        const x = local[tip];
        const y = local[tip + 1];
        const height = local[tip + 2] - boardZ(Math.min(VIOLIN.nutX, Math.max(VIOLIN.boardEndX, x)));
        shadow.visible =
          this.left.tracked && x > VIOLIN.boardEndX && x < VIOLIN.nutX && Math.abs(y) < VIOLIN.boardWidthEnd && height < 0.06 && height > -0.02;
        if (!shadow.visible) continue;
        shadow.position.set(x, y, boardZ(x) + 0.0004);
        const pressing = height < PRESS.above + 0.002;
        const mat = this.model.fingerShadowMaterials[f];
        mat.color.setHex(pressing ? 0x3dff8f : 0xffffff);
        mat.opacity = pressing ? 0.9 : 0.15 + 0.55 * (1 - Math.min(1, Math.max(0, height) / 0.06));
      }
      for (let s = 0; s < STRING_COUNT; s++) {
        const semis = reader.semitones[s];
        const dot = this.model.stopDots[s];
        dot.visible = semis > 0;
        if (dot.visible) {
          const x = stopX(semis);
          dot.position.set(x, stringY(s, x), stringZ(s, x) + 0.0009);
        }
      }
      if (changed || this.shownStops === '') {
        this.shownStops = Array.from({ length: STRING_COUNT }, (_, s) => noteName(OPEN_MIDI[s] + reader.semitones[s])).join(' ');
        this.entity.setValue(AirViolin, 'stops', this.shownStops);
      }
    }

    /** Puts the bow in the right hand and finds what it is drawing. */
    private updateBow(dt: number): void {
      const bowRoot = this.model.bow;
      if (!this.right.tracked) {
        // Tracking drops for a moment in fast strokes; the bow stays put, silent.
        this.bow.reset();
        return;
      }
      // The hair is found in violin space first, so the body can stop it.
      this.toLocal(this.right, this.rightLocal);
      const pose = bowPose(this.rightLocal, this.pose, config.bow);
      const lift = collideBow(pose, G);

      bowPose(this.right.positions, this.worldPose, config.bow);
      const p = this.worldPose;
      this.axisX.fromArray(p.along);
      this.axisZ.fromArray(p.hairSide).negate();
      this.axisY.crossVectors(this.axisZ, this.axisX).normalize();
      this.axisZ.crossVectors(this.axisX, this.axisY);
      this.basis.makeBasis(this.axisX, this.axisY, this.axisZ);
      bowRoot.quaternion.setFromRotationMatrix(this.basis);
      bowRoot.position.fromArray(p.frog);
      if (lift > 0) {
        // The same lift, up out of the top, in the world.
        this.tmp.set(0, 0, 1).transformDirection(this.model.root.matrixWorld);
        bowRoot.position.addScaledVector(this.tmp, lift);
      }
      bowRoot.updateMatrixWorld(true);

      this.bow.update(pose, dt);
    }

    /** Turns the bow's contact and the stops into each string's sound and glow. */
    private updateSound(dt: number): void {
      const bow = this.bow;
      const speed = Math.abs(bow.velocity);
      const autoVibrato = (this.entity.getValue(AirViolin, 'intonation') ?? Intonation.Snap) === Intonation.Snap;
      let deepest = -1;
      let bowing = '';
      let notes = '';
      for (let s = 0; s < STRING_COUNT; s++) {
        const semis = this.stops.semitones[s];
        const midi = OPEN_MIDI[s] + semis;
        let amplitude = 0;
        if (bow.sounding[s] && this.right.tracked) {
          amplitude = bowedAmplitude(speed, bow.press[s]);
          if (deepest < 0 || bow.press[s] > bow.press[deepest]) deepest = s;
          if (amplitude > 0.05) {
            bowing += (bowing ? ' ' : '') + STRING_NAMES[s];
            notes += (notes ? '+' : '') + noteName(midi);
          }
        }
        this.held[s] = amplitude > 0.15 && semis > 0 ? this.held[s] + dt : 0;
        const sound = this.sound;
        sound.midi = midi;
        sound.amplitude = amplitude;
        // Near the bridge and pressed is bright; over the fingerboard, sweet.
        const nearBridge = 1 - Math.min(1, Math.max(0, (bow.contactX[s] - VIOLIN.bowMinX) / (VIOLIN.bowMaxX - VIOLIN.bowMinX)));
        sound.brightness = 0.35 + 0.45 * nearBridge + 0.2 * Math.min(1, Math.max(0, bow.press[s] / 0.004));
        sound.vibrato = autoVibrato ? Math.min(1, Math.max(0, (this.held[s] - VIBRATO_DELAY) / 0.4)) : 0;
        this.synth.setString(s, sound);

        // The string glows over its sounding length while it speaks and rings on a little after.
        this.amp[s] = Math.max(amplitude, this.amp[s] * Math.exp(-dt * 8));
        const glow = this.model.vibrations[s];
        glow.visible = this.amp[s] > 0.02;
        if (glow.visible) {
          placeString(glow, s, semis > 0 ? stopX(semis) : VIOLIN.nutX, (0.0012 + 0.0008 * this.amp[s]) * (VIOLIN.stringLength / 0.328) ** 0.5, G);
          this.model.vibrationMaterials[s].opacity = Math.min(0.85, this.amp[s] * 1.1);
        }
      }

      const mark = this.model.bowMark;
      mark.visible = bow.touching && deepest >= 0;
      if (mark.visible) {
        const x = bow.contactX[deepest];
        mark.position.set(x, stringY(deepest, x), stringZ(deepest, x) + 0.0012);
      }

      const e = this.entity;
      if (bowing !== this.shownBowing) {
        this.shownBowing = bowing;
        e.setValue(AirViolin, 'bowing', bowing);
        if (notes) e.setValue(AirViolin, 'lastNote', notes);
      }
      if (bow.strokes !== this.strokes) {
        this.strokes = bow.strokes;
        e.setValue(AirViolin, 'strokes', bow.strokes);
        if (notes) e.setValue(AirViolin, 'lastNote', notes);
      }
      const shownSpeed = Math.round(speed * 100) / 100;
      if (e.getValue(AirViolin, 'bowSpeed') !== shownSpeed) e.setValue(AirViolin, 'bowSpeed', shownSpeed);
    }

    private updateHud(): void {
      const hud = this.model.hud;
      if (!this.left.tracked && !this.right.tracked) {
        hud.draw({ steps: SHOW_HANDS }, ACCENT.idle);
        return;
      }
      if (this.shownBowing === '') {
        hud.draw({ steps: this.right.tracked ? HOW_TO_BOW : SHOW_BOW_HAND }, ACCENT.idle);
        return;
      }
      const volume = Math.round((this.entity.getValue(AirViolin, 'volume') ?? 0.8) * 100);
      hud.draw(
        {
          headline: this.entity.getValue(AirViolin, 'lastNote') ?? '',
          detail: `${this.bow.velocity > 0 ? 'UP' : 'DOWN'} BOW · ${volume}%`,
        },
        ACCENT.playing,
      );
    }
  };
}

/** A note's name, rounded to the nearest semitone, with how far off it is in free intonation. */
function noteName(midi: number): string {
  const nearest = Math.round(midi);
  const cents = Math.round((midi - nearest) * 100);
  return Math.abs(cents) < 5 ? midiName(nearest) : `${midiName(nearest)}${cents > 0 ? '+' : ''}${cents}`;
}
