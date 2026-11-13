import {
  createSystem,
  Entity,
  Group,
  Matrix4,
  Object3D,
  Quaternion,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { AirGuitar as AirGuitarComponent, GuitarCondition, GuitarHold, GuitarToneMode } from './air-guitar-component.js';
import { midiName, recognizeChord } from './chords.js';
import { FretReader, PRESS } from './fretting.js';
import type { Fretboard } from './geometry.js';
import { ACCENT, createGuitarModel, type FrettedModelSpec, GuitarModel, type HudStep, placeString } from './guitar-model.js';
import { JOINT, TrackedHand } from './hands.js';
import { PluckDetector } from './pluck-detector.js';
import { intactStrings } from './smash.js';
import { GuitarSmasher } from './smashing.js';
import { SMASH_CARD, SmashHints, type SmashState } from '../smash/smash-hints.js';
import { decaySeconds, GuitarSynth, type GuitarVoice, midiToHz } from './synth.js';

/** The sign's pictograms: until the first pluck, how to play; while moving it, the pinch to keep. */
const SHOW_HANDS: readonly HudStep[] = [{ icon: 'hand', caption: 'SHOW HANDS' }];
const KEEP_PINCHING: readonly HudStep[] = [{ icon: 'grab', caption: 'KEEP PINCHING' }];

const UP = new Vector3(0, 1, 0);
/**
 * How far the top face tilts up toward the player. Much more than a real
 * guitar: with nothing to feel, players need to see the fretboard.
 */
const FACE_TILT = (60 * Math.PI) / 180;

/**
 * Where the guitar sits relative to the player's torso. `right` and
 * `forward` are horizontal offsets of the body (sound hole) from the head,
 * `drop` how far below the head it hangs, and `neck` the neck direction as
 * components along the torso's right, up and forward axes.
 */
export interface Placement {
  right: number;
  forward: number;
  drop: number;
  neck: [number, number, number];
}

/** Everything that makes one fretted instrument's system its own. */
export interface FrettedConfig {
  /** 'guitar', 'bass': how tests and tools find this system. */
  instrument: string;
  component: typeof AirGuitarComponent;
  board: Fretboard;
  model: FrettedModelSpec;
  voice: GuitarVoice;
  /** Where it hangs until the player moves it, and where a moved placement is saved. */
  placement: Placement;
  placementKey: string;
  /** The sign's pictograms until the first pluck. */
  howToPlay: readonly HudStep[];
  /**
   * Plucking a string damps the others still ringing, as a bassist's free
   * fingers and thumb do, so low notes never pile up into mud. Strings
   * plucked in one sweep still ring together.
   */
  muteOtherStrings?: boolean;
}

/** Strings plucked within this long of each other are one sweep (a strum or double stop), left ringing together. */
const SWEEP_SECONDS = 0.08;

/** The torso turns with the head only past this yaw, so glancing at the neck is free. */
const YAW_DEADBAND = (45 * Math.PI) / 180;
/** The torso moves with the head only past this distance, so leaning in is free. */
const LEAN_RADIUS = 0.2;

/** Both hands pinched this long re-places the guitar. */
const PLACE_HOLD_SECONDS = 1;
const PINCH_DISTANCE = 0.018;

/** Joints along each fretting finger, tip first, down to the knuckle. */
const FRET_FINGERS = [
  [JOINT.indexTip, JOINT.indexDistal, JOINT.indexIntermediate, JOINT.indexProximal],
  [JOINT.middleTip, JOINT.middleDistal, JOINT.middleIntermediate, JOINT.middleProximal],
  [JOINT.ringTip, JOINT.ringDistal, JOINT.ringIntermediate, JOINT.ringProximal],
  [JOINT.pinkyTip, JOINT.pinkyDistal, JOINT.pinkyIntermediate, JOINT.pinkyProximal],
] as const;
/**
 * The fingertip pad (the first half of the last segment) always frets.
 * The rest of a finger only frets where it lies flat on the strings, as in
 * a barre: an arched finger passes over strings without touching them.
 */
const PAD_FRACTION = 0.5;
const SAMPLE_SPACING = 0.006;

/** A string counts toward the chord display above this envelope level. */
const RINGING = 0.06;
/** Hammer-ons and pull-offs work while the note is still audible (about -40 dB). */
const AUDIBLE = 0.01;

/**
 * A hand-played fretted instrument (see air-guitar-system.ts and
 * ../bass/air-bass-system.ts). It is worn: it hangs in front of the
 * player and follows their body, not their hands. Left fingertips fret real
 * strings at real fret positions; the right index fingertip plucks or
 * strums whatever strings it crosses. Pinch both hands for a second to move
 * the guitar: the body goes to the right pinch, the neck toward the left.
 * A fist round the neck picks it up to smash (see smashing.ts); the same
 * two-handed pinch puts it back on, and a wrecked one comes back new.
 */
export function createFrettedSystem(config: FrettedConfig) {
  const AirGuitar = config.component;
  const board = config.board;
  const GUITAR = board.dims;
  const { openMidi: OPEN_MIDI, stringCount: STRING_COUNT, fretMidX, fretX, stringSpan, stringY } = board;
  const DEFAULT_PLACEMENT = config.placement;
  const PLACEMENT_KEY = config.placementKey;
  const HOW_TO_PLAY = config.howToPlay;

  return class FrettedSystem extends createSystem({
    guitars: { required: [AirGuitar] },
  }) {
    /** Which instrument this is. */
    readonly instrument = config.instrument;
    /** Its state component. */
    readonly component = AirGuitar;
    private model!: GuitarModel;
    private entity!: Entity;
    private synth!: GuitarSynth;
    private smash!: GuitarSmasher;
    private readonly hints = new SmashHints(SMASH_CARD.grabAndSwing);
    private readonly smashState: SmashState = { hold: GuitarHold.Worn, holding: false, wrecked: false, health: 1 };
    private debris!: Group;
    private syncedVersion = -1;

    private readonly left = new TrackedHand();
    private readonly right = new TrackedHand();
    private readonly hands: readonly [TrackedHand, TrackedHand] = [this.left, this.right];
    private readonly grips: [Object3D, Object3D] = [new Object3D(), new Object3D()];
    private readonly fretReader = new FretReader(board);
    private readonly plucker = new PluckDetector({ board });

    private placement: Placement = { ...DEFAULT_PLACEMENT, neck: [...DEFAULT_PLACEMENT.neck] };
    private readonly torso = new Vector3();
    private torsoYaw = 0;
    private bodyHeight = 1;
    private placed = false;
    private placeHold = 0;
    private placeLatched = false;

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
    private readonly tmp2 = new Vector3();
    private readonly leftLocal = new Float32Array(25 * 3);

    private readonly amp = new Float32Array(STRING_COUNT);
    private readonly soundingMidi = new Int16Array(STRING_COUNT);
    private readonly lastFrets = new Int8Array(STRING_COUNT);
    /** When each string was last plucked, on the picking clock. */
    private readonly pluckedAt = new Float64Array(STRING_COUNT).fill(-Infinity);
    private pickClock = 0;
    private readonly ringingNotes: number[] = [];
    private readonly shapeNotes: number[] = [];
    private shownFrets = '';

    init(): void {
      this.synth = new GuitarSynth(STRING_COUNT, undefined, config.voice);
      // Every note the fretboard can play, open strings to the top fret.
      const playable = new Set<number>();
      for (const open of OPEN_MIDI) for (let f = 0; f <= GUITAR.fretCount; f++) playable.add(open + f);
      this.synth.prewarm(playable);
      this.model = createGuitarModel(config.model);
      this.entity = this.world.createTransformEntity(this.model.root, { persistent: true });
      this.entity.addComponent(AirGuitar);
      this.placement = loadPlacement(PLACEMENT_KEY, DEFAULT_PLACEMENT);
      // Pieces knocked off the guitar live here, in world space.
      this.debris = new Group();
      this.debris.name = 'AirGuitarDebris';
      this.world.createTransformEntity(this.debris, { persistent: true });
      this.smash = new GuitarSmasher(this.model, this.synth, this.debris, this.amp, this.soundingMidi);

      const unlock = () => this.synth.resume();
      window.addEventListener('pointerdown', unlock);
      window.addEventListener('keydown', unlock);
      this.cleanupFuncs.push(
        () => window.removeEventListener('pointerdown', unlock),
        () => window.removeEventListener('keydown', unlock),
        this.world.visibilityState.subscribe((state) => {
          const immersive = state !== VisibilityState.NonImmersive;
          // Entering XR is a user gesture, so audio can start here.
          if (immersive) this.synth.resume();
          else this.synth.chokeAll();
          this.model.root.visible = immersive;
          this.debris.visible = immersive;
          this.placed = false;
        }),
        () => this.synth.dispose(),
      );
    }

    update(delta: number, time: number): void {
      if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) return;
      const dt = Math.min(delta, 0.1);
      const e = this.entity;
      // Put away while another instrument is played.
      const active = e.getValue(AirGuitar, 'active') ?? true;
      if (active !== this.model.root.visible) {
        this.model.root.visible = active;
        this.debris.visible = active;
        if (!active) {
          this.synth.chokeAll();
          this.smash.wear();
        }
        this.placed = false;
      }
      if (!active) return;
      if (e.getValue(AirGuitar, 'repair')) {
        this.smash.repair();
        e.setValue(AirGuitar, 'repair', false);
        this.placed = false;
        this.model.root.userData.posed = false;
      }

      const hands = this.input.xr.visualAdapters.hand;
      this.left.update(hands.left, this.player.gripSpaces.left);
      this.right.update(hands.right, this.player.gripSpaces.right);
      if (e.getValue(AirGuitar, 'leftHand') !== this.left.tracked) {
        e.setValue(AirGuitar, 'leftHand', this.left.tracked);
      }
      if (e.getValue(AirGuitar, 'rightHand') !== this.right.tracked) {
        e.setValue(AirGuitar, 'rightHand', this.right.tracked);
      }

      this.readHead();
      if (!this.placed || e.getValue(AirGuitar, 'resetPlacement')) {
        if (e.getValue(AirGuitar, 'resetPlacement')) {
          this.placement = { ...DEFAULT_PLACEMENT, neck: [...DEFAULT_PLACEMENT.neck] };
          savePlacement(PLACEMENT_KEY, this.placement);
          e.setValue(AirGuitar, 'resetPlacement', false);
        }
        this.anchorTorso();
      }
      // The hold is wall-clock time, so a slow frame cannot stretch it.
      const placing = this.updatePlaceGesture(delta);
      const smash = this.smash;
      if (smash.hold === GuitarHold.Worn) {
        this.followTorso(dt);
        this.poseGuitar(dt);
      }
      this.grips[0] = this.player.gripSpaces.left;
      this.grips[1] = this.player.gripSpaces.right;
      smash.update(dt, this.hands, this.grips, e.getValue(AirGuitar, 'smashable') ?? true);
      this.syncSmash();

      const tone = e.getValue(AirGuitar, 'tone') ?? GuitarToneMode.Clean;
      this.synth.setTone(tone === GuitarToneMode.Drive ? 'drive' : 'clean');
      this.synth.setVolume(e.getValue(AirGuitar, 'volume') ?? 0.8);

      if (smash.hold === GuitarHold.Worn) {
        this.updateFretting(dt);
        this.updatePicking(dt);
      } else {
        this.hideHandMarks();
      }
      this.animateStrings(dt, time);
      this.updateHud(placing, tone);
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

    /** Puts the torso frame under the head, facing where the head faces. */
    private anchorTorso(): void {
      this.torso.set(this.headPos.x, 0, this.headPos.z);
      this.torsoYaw = this.headYaw();
      this.bodyHeight = this.headPos.y - this.placement.drop;
      this.placed = true;
    }

    /** Steps and big turns carry the guitar along; glances and leans do not. */
    private followTorso(dt: number): void {
      const dx = this.headPos.x - this.torso.x;
      const dz = this.headPos.z - this.torso.z;
      const dist = Math.hypot(dx, dz);
      if (dist > LEAN_RADIUS) {
        const k = ((dist - LEAN_RADIUS) / dist) * (1 - Math.exp(-dt * 6));
        this.torso.x += dx * k;
        this.torso.z += dz * k;
      }
      const diff = wrapAngle(this.headYaw() - this.torsoYaw);
      if (Math.abs(diff) > YAW_DEADBAND) {
        this.torsoYaw += (diff - Math.sign(diff) * YAW_DEADBAND) * (1 - Math.exp(-dt * 4));
      }
    }

    /** Torso basis: forward and right, horizontal. */
    private torsoAxes(): void {
      this.fwd.set(-Math.sin(this.torsoYaw), 0, -Math.cos(this.torsoYaw));
      this.rgt.set(Math.cos(this.torsoYaw), 0, -Math.sin(this.torsoYaw));
    }

    private poseGuitar(dt: number): void {
      const p = this.placement;
      this.torsoAxes();
      this.target
        .copy(this.torso)
        .addScaledVector(this.rgt, p.right)
        .addScaledVector(this.fwd, p.forward);
      this.target.y = this.bodyHeight;

      this.axisX
        .set(0, 0, 0)
        .addScaledVector(this.rgt, p.neck[0])
        .addScaledVector(UP, p.neck[1])
        .addScaledVector(this.fwd, p.neck[2])
        .normalize();
      // Top face points away from the player, tilted up so they can see it.
      this.tmp
        .copy(this.fwd)
        .multiplyScalar(Math.cos(FACE_TILT))
        .addScaledVector(UP, Math.sin(FACE_TILT));
      this.axisZ.copy(this.tmp).addScaledVector(this.axisX, -this.tmp.dot(this.axisX));
      if (this.axisZ.lengthSq() < 1e-4) this.axisZ.copy(UP);
      this.axisZ.normalize();
      this.axisY.crossVectors(this.axisZ, this.axisX).normalize();
      this.axisZ.crossVectors(this.axisX, this.axisY);
      this.basis.makeBasis(this.axisX, this.axisY, this.axisZ);
      this.targetQuat.setFromRotationMatrix(this.basis);

      const root = this.model.root;
      const k = 1 - Math.exp(-dt * 12);
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

    /**
     * Pinching both hands for a second re-places the guitar: the sound hole
     * goes to the right pinch and the neck points at the left one.
     * Returns the hold progress 0..1, or -1 when not pinching.
     */
    private updatePlaceGesture(dt: number): number {
      const pinching =
        this.left.tracked &&
        this.right.tracked &&
        this.left.pinchDistance() < PINCH_DISTANCE &&
        this.right.pinchDistance() < PINCH_DISTANCE;
      if (!pinching) {
        this.placeHold = 0;
        this.placeLatched = false;
        return -1;
      }
      if (this.placeLatched) return -1;
      this.placeHold += dt;
      if (this.placeHold < PLACE_HOLD_SECONDS) return this.placeHold / PLACE_HOLD_SECONDS;
      // Picked up, thrown or wrecked: this puts it back on (a wrecked one new).
      this.smash.wear();

      this.torso.set(this.headPos.x, 0, this.headPos.z);
      this.torsoYaw = this.headYaw();
      this.torsoAxes();
      // Midpoints between thumb and index tips.
      const rightPinch = this.right
        .get(JOINT.thumbTip, this.tmp)
        .add(this.right.get(JOINT.indexTip, this.tmp2))
        .multiplyScalar(0.5);
      const leftPinch = this.left
        .get(JOINT.thumbTip, this.target)
        .add(this.left.get(JOINT.indexTip, this.tmp2))
        .multiplyScalar(0.5);
      const neck = this.tmp2.subVectors(leftPinch, rightPinch).normalize();
      const offset = this.target.subVectors(rightPinch, this.torso);
      this.placement = {
        right: offset.dot(this.rgt),
        forward: offset.dot(this.fwd),
        drop: this.headPos.y - rightPinch.y,
        neck: [neck.dot(this.rgt), neck.y, neck.dot(this.fwd)],
      };
      this.bodyHeight = rightPinch.y;
      savePlacement(PLACEMENT_KEY, this.placement);
      this.placeLatched = true;
      this.model.root.userData.posed = false;
      return 1;
    }

    /** Reads the left hand into frets, with hammer-ons, pull-offs and damping. */
    private updateFretting(dt: number): void {
      const reader = this.fretReader;
      reader.begin();
      if (this.left.tracked) {
        const src = this.left.positions;
        const local = this.leftLocal;
        for (let j = 0; j < 25; j++) {
          this.tmp.fromArray(src, j * 3).applyMatrix4(this.inverse).toArray(local, j * 3);
        }
        for (let f = 0; f < FRET_FINGERS.length; f++) {
          const joints = FRET_FINGERS[f];
          for (let k = 0; k < joints.length - 1; k++) {
            const a = joints[k] * 3;
            const b = joints[k + 1] * 3;
            const flat =
              local[a + 2] - GUITAR.stringZ <= PRESS.above &&
              local[b + 2] - GUITAR.stringZ <= PRESS.above;
            // Past the pad, stop at the first segment that lifts off.
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

      if (!reader.commit(dt, this.left.tracked) && this.shownFrets !== '') {
        this.updateFingerShadows();
        return;
      }

      for (let s = 0; s < STRING_COUNT; s++) {
        const fret = reader.frets[s];
        const was = this.lastFrets[s];
        this.lastFrets[s] = fret;
        if (fret !== was || this.shownFrets === '') {
          placeString(this.model.vibrations[s], s, fret > 0 ? fretX(fret) : GUITAR.nutX, undefined, board);
          const dot = this.model.pressDots[s];
          dot.visible = fret > 0;
          if (fret > 0) dot.position.set(fretMidX(fret), stringY(s, fretMidX(fret)), GUITAR.stringZ + 0.0012);

          if (this.amp[s] > AUDIBLE && this.synth.isRinging(s)) {
            if (fret > 0) {
              // Hammer-on, pull-off to another fret, or slide: the string
              // keeps vibrating at the new length.
              const v = this.amp[s] * 0.7;
              this.synth.pluck(s, OPEN_MIDI[s] + fret, v, this.synth.now, false, true);
              this.soundingMidi[s] = OPEN_MIDI[s] + fret;
              this.amp[s] = v;
              this.entity.setValue(AirGuitar, 'lastNote', midiName(OPEN_MIDI[s] + fret));
            } else {
              // Lifting a finger off a ringing string damps it.
              this.damp(s);
            }
          }
        }
      }
      this.shownFrets = Array.from(reader.frets).join(' ');
      this.entity.setValue(AirGuitar, 'frets', this.shownFrets);
      this.updateFingerShadows();
    }

    /** Discs under each left fingertip: brighter as it nears, green when pressing. */
    private updateFingerShadows(): void {
      const local = this.leftLocal;
      for (let f = 0; f < FRET_FINGERS.length; f++) {
        const shadow = this.model.fingerShadows[f];
        const mat = this.model.fingerShadowMaterials[f];
        if (!this.left.tracked) {
          shadow.visible = false;
          continue;
        }
        const j = FRET_FINGERS[f][0] * 3;
        const x = local[j];
        const y = local[j + 1];
        const height = local[j + 2] - GUITAR.stringZ;
        const overNeck =
          x < GUITAR.nutX + 0.02 &&
          x > GUITAR.boardEndX &&
          Math.abs(y) < stringSpan(x) / 2 + 0.015 &&
          height < 0.06 &&
          height > -(GUITAR.stringZ - GUITAR.boardTopZ) - PRESS.below;
        shadow.visible = overNeck;
        if (!overNeck) continue;
        const pressing = height <= PRESS.above;
        shadow.position.set(x, y, GUITAR.boardTopZ + 0.0007);
        mat.color.setHex(pressing ? 0x3dff8f : 0xffffff);
        mat.opacity = pressing ? 0.9 : 0.15 + 0.55 * (1 - Math.min(1, Math.max(0, height) / 0.06));
      }
    }

    /** Plucks the strings the right index fingertip crosses. */
    private updatePicking(dt: number): void {
      const shadow = this.model.pickShadow;
      if (!this.right.tracked) {
        // Fast motion often drops hand tracking for a frame or two; the
        // detector bridges short gaps so the strum does not lose strings.
        this.plucker.lost(dt);
        shadow.visible = false;
        return;
      }
      const tip = this.right.get(JOINT.indexTip, this.tmp).applyMatrix4(this.inverse);
      const count = this.plucker.update(tip.x, tip.y, tip.z, dt);
      this.pickClock += dt;
      for (let i = 0; i < count; i++) {
        const event = this.plucker.events[i];
        const s = event.string;
        // A snapped string has nothing left to pluck.
        if (!this.smash.damage.strings[s]) continue;
        if (config.muteOtherStrings) {
          for (let o = 0; o < STRING_COUNT; o++) {
            if (o !== s && this.amp[o] > AUDIBLE && this.pickClock - this.pluckedAt[o] > SWEEP_SECONDS) this.damp(o);
          }
          this.pluckedAt[s] = this.pickClock;
        }
        const midi = OPEN_MIDI[s] + this.fretReader.frets[s];
        this.synth.pluck(s, midi, event.velocity, this.synth.now + event.delay, false);
        this.soundingMidi[s] = midi;
        this.amp[s] = Math.max(this.amp[s], event.velocity);
        this.entity.setValue(AirGuitar, 'plucks', (this.entity.getValue(AirGuitar, 'plucks') ?? 0) + 1);
        this.entity.setValue(AirGuitar, 'lastNote', midiName(midi));
      }
      // A fingertip resting on a ringing string stops it.
      for (let s = 0; s < STRING_COUNT; s++) {
        if (this.plucker.damping[s] && this.amp[s] > 0) this.damp(s);
      }

      const height = tip.z - GUITAR.stringZ;
      const zone = this.plucker.zone;
      const near =
        tip.x > zone.minX - 0.02 &&
        tip.x < zone.maxX + 0.02 &&
        Math.abs(tip.y) < stringSpan(tip.x) / 2 + zone.edge + 0.02 &&
        height < 0.08 &&
        height > -zone.below;
      shadow.visible = near;
      if (near) {
        shadow.position.set(tip.x, tip.y, GUITAR.stringZ + 0.001);
        this.model.pickShadowMaterial.opacity = this.plucker.inZone
          ? 0.95
          : 0.2 + 0.5 * (1 - Math.min(1, Math.max(0, height) / 0.08));
      }
    }

    /** Stops a ringing string, counting it so damping can be inspected. */
    private damp(s: number): void {
      this.synth.choke(s);
      this.amp[s] = 0;
      this.entity.setValue(AirGuitar, 'damps', (this.entity.getValue(AirGuitar, 'damps') ?? 0) + 1);
    }

    private animateStrings(dt: number, time: number): void {
      for (let s = 0; s < STRING_COUNT; s++) {
        // Follow the synth's per-note decay so "still ringing" means audible.
        const t60 = decaySeconds(midiToHz(this.soundingMidi[s] || OPEN_MIDI[s]));
        const amp = (this.amp[s] *= Math.exp((-dt * 6.91) / t60));
        const glow = this.model.vibrations[s];
        glow.visible = amp > 0.01;
        if (!glow.visible) continue;
        this.model.vibrationMaterials[s].opacity = Math.min(0.9, amp * 1.2);
        glow.position.z = GUITAR.stringZ + Math.sin(time * 90 + s * 1.7) * amp * 0.0012;
      }
    }

    /** Copies the smash state to the AirGuitar component when it changes. */
    private syncSmash(): void {
      const smash = this.smash;
      if (smash.version === this.syncedVersion) return;
      this.syncedVersion = smash.version;
      const d = smash.damage;
      const e = this.entity;
      e.setValue(AirGuitar, 'hold', smash.hold);
      e.setValue(
        AirGuitar,
        'condition',
        d.wrecked ? GuitarCondition.Wrecked : d.health < 1 ? GuitarCondition.Damaged : GuitarCondition.Intact,
      );
      e.setValue(AirGuitar, 'health', d.health);
      e.setValue(AirGuitar, 'strings', intactStrings(d));
      e.setValue(AirGuitar, 'neckBroken', d.neckBroken);
      e.setValue(AirGuitar, 'impacts', smash.impacts);
      e.setValue(AirGuitar, 'dents', smash.scars.dents);
      let shardsOff = 0;
      for (let i = 0; i < d.shards.length; i++) if (d.shards[i] <= 0) shardsOff++;
      e.setValue(AirGuitar, 'shardsOff', shardsOff);
      e.setValue(AirGuitar, 'lastImpact', smash.lastImpact);
    }

    /** Fingertip marks only make sense while the guitar is worn and played. */
    private hideHandMarks(): void {
      for (const shadow of this.model.fingerShadows) shadow.visible = false;
      for (const dot of this.model.pressDots) dot.visible = false;
      this.model.pickShadow.visible = false;
    }

    private stringsNote(): string {
      const left = intactStrings(this.smash.damage);
      return left < STRING_COUNT ? ` · ${left} strings` : '';
    }

    /** Picked up, thrown or wrecked: what to do next, and how much is left. */
    private drawSmashHud(): void {
      const smash = this.smash;
      const state = this.smashState;
      state.hold = smash.hold;
      state.holding = smash.hold === GuitarHold.Held;
      state.wrecked = smash.damage.wrecked;
      state.health = smash.damage.health;
      this.hints.drawSmashing(this.model.hud, state);
    }

    private updateHud(placing: number, tone: string): void {
      const hud = this.model.hud;
      if (placing >= 0 && placing < 1) {
        hud.draw({ headline: `${Math.round(placing * 100)}%`, steps: KEEP_PINCHING }, ACCENT.placing);
        return;
      }
      if (this.smash.hold !== GuitarHold.Worn) {
        this.drawSmashHud();
        return;
      }
      if (!this.left.tracked && !this.right.tracked) {
        hud.draw({ steps: SHOW_HANDS }, ACCENT.idle);
        return;
      }

      this.ringingNotes.length = 0;
      this.shapeNotes.length = 0;
      for (let s = 0; s < STRING_COUNT; s++) {
        if (this.amp[s] > RINGING) this.ringingNotes.push(this.soundingMidi[s]);
        this.shapeNotes.push(OPEN_MIDI[s] + this.fretReader.frets[s]);
      }
      const playing = this.ringingNotes.length > 0;
      const chord = recognizeChord(playing ? this.ringingNotes : this.shapeNotes) ?? '?';
      if (this.entity.getValue(AirGuitar, 'chord') !== chord) {
        this.entity.setValue(AirGuitar, 'chord', chord);
      }
      if ((this.entity.getValue(AirGuitar, 'plucks') ?? 0) === 0) {
        this.hints.drawHowTo(hud, HOW_TO_PLAY);
        return;
      }
      const volume = Math.round((this.entity.getValue(AirGuitar, 'volume') ?? 0.8) * 100);
      hud.draw(
        {
          headline: chord,
          detail: `${this.shownFrets} · ${tone === GuitarToneMode.Drive ? 'DRIVE' : 'CLEAN'} ${volume}%${this.stringsNote()}`,
        },
        playing ? ACCENT.playing : ACCENT.idle,
      );
    }
  };
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function loadPlacement(key: string, fallback: Placement): Placement {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const p = JSON.parse(raw) as Placement;
      if ([p.right, p.forward, p.drop, ...p.neck].every(Number.isFinite)) return p;
    }
  } catch {
    // Storage can be unavailable; the default placement still works.
  }
  return { ...fallback, neck: [...fallback.neck] };
}

function savePlacement(key: string, p: Placement): void {
  try {
    localStorage.setItem(key, JSON.stringify(p));
  } catch {
    // Not persisting is fine.
  }
}
