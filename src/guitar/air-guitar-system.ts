import {
  createSystem,
  Entity,
  InputComponent,
  Matrix4,
  Mesh,
  Quaternion,
  StatefulGamepad,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { AirGuitar, GuitarToneMode } from './air-guitar-component.js';
import {
  ChordSpec,
  chordName,
  diatonicChord,
  flipQuality,
  noteName,
  STRING_COUNT,
  voiceChord,
  Voicing,
  ZONE_COUNT,
  ZONE_DEGREES,
} from './chords.js';
import {
  createGuitarModel,
  createPick,
  GUITAR,
  GuitarModel,
  LabelSprite,
  stringY,
  ZONE_COLORS,
} from './guitar-model.js';
import { GuitarSynth } from './synth.js';

const UP = new Vector3(0, 1, 0);
/** How far the body tilts its top face up toward the player. */
const FACE_TILT = (15 * Math.PI) / 180;

/** Body placement relative to the head, in metres (yaw-only frame). */
const BODY_OFFSET = { down: 0.58, forward: 0.2, right: 0.06 };

/** Pick position in the right controller's grip space. */
const PICK_OFFSET = new Vector3(0, -0.015, -0.075);

/** Where the pick counts as being "on the strings", in guitar space. */
const STRUM_ZONE = { minX: -0.24, maxX: 0.26, halfY: 0.14, halfZ: 0.15 };
/** Dead band around each string so jitter does not re-pluck it. */
const STRING_HYSTERESIS = 0.003;

const AUTO_STRUM_GAP = 0.012;

type HapticGamepad = Gamepad & {
  hapticActuators?: readonly { pulse?: (value: number, ms: number) => Promise<boolean> }[];
};

/**
 * Air guitar: the body hangs at the player's hip, the neck points at the left
 * controller, the left hand's position along the neck picks the chord, and
 * sweeping the right-hand pick through the strings plucks them.
 *
 * Left controller: slide along the neck to pick one of six chords in the
 * key (I IV V vi ii iii), squeeze swaps major/minor, X makes a power chord,
 * Y adds a seventh, trigger palm-mutes, thumbstick left/right changes key.
 * Right controller: strum through the strings, trigger strums down, A strums
 * up, B toggles clean/overdrive, thumbstick up/down sets volume.
 */
export class AirGuitarSystem extends createSystem({
  guitars: { required: [AirGuitar] },
}) {
  private model!: GuitarModel;
  private entity!: Entity;
  private hud!: LabelSprite;
  private pick!: Mesh;
  private synth!: GuitarSynth;

  private readonly headPos = new Vector3();
  private readonly headQuat = new Quaternion();
  private readonly forward = new Vector3();
  private readonly smoothForward = new Vector3(0, 0, -1);
  private readonly right = new Vector3();
  private readonly anchorTarget = new Vector3();
  private readonly anchor = new Vector3();
  private readonly leftPos = new Vector3();
  private readonly pickPos = new Vector3();
  private readonly pickLocal = new Vector3();
  private readonly prevPickLocal = new Vector3();
  private readonly leftLocal = new Vector3();
  private readonly axisX = new Vector3(1, 0, 0);
  private readonly axisY = new Vector3();
  private readonly axisZ = new Vector3();
  private readonly faceTarget = new Vector3();
  private readonly basis = new Matrix4();
  private readonly inverse = new Matrix4();
  private readonly targetQuat = new Quaternion();
  private placed = false;

  private readonly stringSide = new Int8Array(STRING_COUNT);
  private readonly stringDelta = new Float32Array(STRING_COUNT);
  private readonly stringAmp = new Float32Array(STRING_COUNT);
  private wasInStrumZone = false;

  private chordKey = -1;
  private zone = 0;
  private muted = false;
  private voicing: Voicing = { name: '', frets: [], midi: [] };
  private readonly zoneSpec: ChordSpec = { root: 0, quality: 'maj', seventh: false, power: false };

  init(): void {
    this.synth = new GuitarSynth(STRING_COUNT);

    this.model = createGuitarModel();
    this.entity = this.world.createTransformEntity(this.model.root, { persistent: true });
    this.entity.addComponent(AirGuitar);

    this.hud = new LabelSprite(512, 256);
    this.hud.sprite.name = 'ChordDisplay';
    this.hud.sprite.scale.set(0.3, 0.15, 1);
    this.world.createTransformEntity(this.hud.sprite, { persistent: true });

    this.pick = createPick();
    this.pick.position.copy(PICK_OFFSET);
    this.player.gripSpaces.right.add(this.pick);

    // Audio can only start from a user gesture: entering XR is one.
    const unlock = () => this.synth.resume();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.cleanupFuncs.push(
      () => window.removeEventListener('pointerdown', unlock),
      () => window.removeEventListener('keydown', unlock),
      this.world.visibilityState.subscribe((state) => {
        const immersive = state !== VisibilityState.NonImmersive;
        if (immersive) this.synth.resume();
        else this.synth.chokeAll();
        this.model.root.visible = immersive;
        this.hud.sprite.visible = immersive;
        this.pick.visible = immersive;
        this.placed = false;
      }),
      () => {
        this.pick.removeFromParent();
        void this.synth.ctx.close();
      },
    );
  }

  update(delta: number, time: number): void {
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) return;
    const dt = Math.min(delta, 0.1);
    const left = this.input.xr.gamepads.left;
    const right = this.input.xr.gamepads.right;

    this.placeGuitar(dt);
    this.readControls(left, right);
    this.updateChord(left);
    this.detectStrum(dt, right);
    this.animateStrings(dt, time);
  }

  /** Hangs the body off the head (yaw only) and aims the neck at the left hand. */
  private placeGuitar(dt: number): void {
    const head = this.player.head;
    head.updateWorldMatrix(true, false);
    head.getWorldPosition(this.headPos);
    head.getWorldQuaternion(this.headQuat);

    this.forward.set(0, 0, -1).applyQuaternion(this.headQuat);
    this.forward.y = 0;
    if (this.forward.lengthSq() > 1e-4) {
      this.forward.normalize();
      // The body follows head yaw slowly, so glancing at the neck does not
      // swing the whole guitar around.
      if (this.placed) this.smoothForward.lerp(this.forward, 1 - Math.exp(-dt * 2.5));
      else this.smoothForward.copy(this.forward);
      this.smoothForward.normalize();
    }
    this.right.crossVectors(this.smoothForward, UP);

    this.anchorTarget
      .copy(this.headPos)
      .addScaledVector(UP, -BODY_OFFSET.down)
      .addScaledVector(this.smoothForward, BODY_OFFSET.forward)
      .addScaledVector(this.right, BODY_OFFSET.right);
    if (this.placed) this.anchor.lerp(this.anchorTarget, 1 - Math.exp(-dt * 10));
    else this.anchor.copy(this.anchorTarget);

    const leftGrip = this.player.gripSpaces.left;
    leftGrip.updateWorldMatrix(true, false);
    leftGrip.getWorldPosition(this.leftPos);
    this.axisZ.subVectors(this.leftPos, this.anchor);
    if (this.axisZ.lengthSq() > 0.15 * 0.15) this.axisX.copy(this.axisZ).normalize();
    else if (!this.placed) this.axisX.copy(this.right).negate();

    // Top face points away from the player, tilted up so they can see it.
    this.faceTarget
      .copy(this.smoothForward)
      .multiplyScalar(Math.cos(FACE_TILT))
      .addScaledVector(UP, Math.sin(FACE_TILT));
    this.axisZ.copy(this.faceTarget).addScaledVector(this.axisX, -this.faceTarget.dot(this.axisX));
    if (this.axisZ.lengthSq() < 0.01) this.axisZ.copy(UP);
    this.axisZ.normalize();
    this.axisY.crossVectors(this.axisZ, this.axisX).normalize();
    this.axisZ.crossVectors(this.axisX, this.axisY);
    this.basis.makeBasis(this.axisX, this.axisY, this.axisZ);
    this.targetQuat.setFromRotationMatrix(this.basis);

    const root = this.model.root;
    root.position.copy(this.anchor);
    if (this.placed) root.quaternion.slerp(this.targetQuat, 1 - Math.exp(-dt * 18));
    else root.quaternion.copy(this.targetQuat);
    root.updateMatrixWorld(true);
    this.inverse.copy(root.matrixWorld).invert();

    this.hud.sprite.position
      .copy(this.anchor)
      .addScaledVector(this.smoothForward, 0.45)
      .addScaledVector(UP, 0.42);

    this.placed = true;
  }

  private readControls(left: StatefulGamepad | undefined, right: StatefulGamepad | undefined): void {
    const e = this.entity;
    if (left?.getAxesEnteringLeft(InputComponent.Thumbstick)) {
      e.setValue(AirGuitar, 'key', ((e.getValue(AirGuitar, 'key') ?? 7) + 11) % 12);
    }
    if (left?.getAxesEnteringRight(InputComponent.Thumbstick)) {
      e.setValue(AirGuitar, 'key', ((e.getValue(AirGuitar, 'key') ?? 7) + 1) % 12);
    }
    if (right?.getButtonDown(InputComponent.B_Button)) {
      const drive = e.getValue(AirGuitar, 'tone') === GuitarToneMode.Drive;
      e.setValue(AirGuitar, 'tone', drive ? GuitarToneMode.Clean : GuitarToneMode.Drive);
    }
    const volume = e.getValue(AirGuitar, 'volume') ?? 0.8;
    if (right?.getAxesEnteringUp(InputComponent.Thumbstick)) {
      e.setValue(AirGuitar, 'volume', Math.min(1, volume + 0.1));
    }
    if (right?.getAxesEnteringDown(InputComponent.Thumbstick)) {
      e.setValue(AirGuitar, 'volume', Math.max(0, volume - 0.1));
    }

    const wasMuted = this.muted;
    this.muted = left?.getButtonPressed(InputComponent.Trigger) ?? false;
    if (this.muted && !wasMuted) this.synth.chokeAll();

    if (right?.getButtonDown(InputComponent.Trigger)) this.autoStrum(true, 0.85, right);
    if (right?.getButtonDown(InputComponent.A_Button)) this.autoStrum(false, 0.7, right);
  }

  private updateChord(left: StatefulGamepad | undefined): void {
    const e = this.entity;
    this.leftLocal.copy(this.leftPos).applyMatrix4(this.inverse);
    const zoneLen = (GUITAR.zoneStartX - GUITAR.zoneEndX) / ZONE_COUNT;
    const zone = Math.max(
      0,
      Math.min(ZONE_COUNT - 1, Math.floor((GUITAR.zoneStartX - this.leftLocal.x) / zoneLen)),
    );

    const flip = left?.getButtonPressed(InputComponent.Squeeze) ?? false;
    const power = left?.getButtonPressed(InputComponent.X_Button) ?? false;
    const seventh = left?.getButtonPressed(InputComponent.Y_Button) ?? false;
    const key = e.getValue(AirGuitar, 'key') ?? 7;
    const tone = e.getValue(AirGuitar, 'tone') ?? GuitarToneMode.Clean;
    const volume = e.getValue(AirGuitar, 'volume') ?? 0.8;
    const chordKey =
      key * 10000 +
      zone * 1000 +
      (flip ? 100 : 0) +
      (power ? 10 : 0) +
      (seventh ? 1 : 0) +
      (tone === GuitarToneMode.Drive ? 0.5 : 0) +
      volume * 0.01 +
      (this.muted ? 0.001 : 0);
    if (chordKey === this.chordKey) return;
    const zoneChanged = zone !== this.zone || this.chordKey < 0;
    this.chordKey = chordKey;
    this.zone = zone;

    this.synth.setTone(tone === GuitarToneMode.Drive ? 'drive' : 'clean');
    this.synth.setVolume(volume);

    const spec = this.zoneSpec;
    for (let z = ZONE_COUNT - 1; z >= 0; z--) {
      Object.assign(spec, diatonicChord(key, ZONE_DEGREES[z]));
      if (flip) spec.quality = flipQuality(spec.quality);
      spec.power = power;
      spec.seventh = seventh;
      const active = z === zone;
      this.model.zoneLabels[z].draw([chordName(spec)], hex(ZONE_COLORS[z]), active);
      this.model.zoneMaterials[z].emissiveIntensity = active ? 1.4 : 0.12;
    }
    // The loop ends on z = 0; rebuild the active zone's chord.
    Object.assign(spec, diatonicChord(key, ZONE_DEGREES[zone]));
    if (flip) spec.quality = flipQuality(spec.quality);
    spec.power = power;
    spec.seventh = seventh;

    const next = voiceChord(spec);
    // Changing the fretting shape stops strings whose note changes.
    for (let s = 0; s < STRING_COUNT; s++) {
      if (next.midi[s] !== this.voicing.midi[s]) this.synth.choke(s);
    }
    this.voicing = next;
    this.synth.prepare(next.midi);

    const toneLabel = tone === GuitarToneMode.Drive ? 'OVERDRIVE' : 'CLEAN';
    this.hud.draw(
      [
        next.name,
        `Key of ${noteName(key)}  ·  ${toneLabel}  ·  vol ${Math.round(volume * 100)}%`,
        this.muted ? 'PALM MUTE' : shapeText(next),
      ],
      hex(ZONE_COLORS[zone]),
      true,
    );
    e.setValue(AirGuitar, 'zone', zone);
    e.setValue(AirGuitar, 'chord', next.name);
    if (zoneChanged) pulse(left, 0.25, 12);
  }

  /**
   * Tracks which side of every string the pick is on. Crossing a string
   * plucks it, so a fast sweep becomes a natural strum and a slow one an
   * arpeggio. Speed sets loudness.
   */
  private detectStrum(dt: number, right: StatefulGamepad | undefined): void {
    this.pick.updateWorldMatrix(true, false);
    this.pick.getWorldPosition(this.pickPos);
    this.pickLocal.copy(this.pickPos).applyMatrix4(this.inverse);
    const p = this.pickLocal;

    const inZone =
      p.x > STRUM_ZONE.minX &&
      p.x < STRUM_ZONE.maxX &&
      Math.abs(p.y) < STRUM_ZONE.halfY &&
      Math.abs(p.z - GUITAR.stringZ) < STRUM_ZONE.halfZ;

    if (!inZone) {
      this.stringSide.fill(0);
      this.wasInStrumZone = false;
      this.prevPickLocal.copy(p);
      return;
    }

    const speed = this.wasInStrumZone && dt > 0 ? Math.abs(p.y - this.prevPickLocal.y) / dt : 0;
    const velocity = Math.min(1, 0.25 + speed / 2.2);
    let plucked = 0;
    for (let s = 0; s < STRING_COUNT; s++) {
      const delta = p.y - stringY(s, p.x);
      const prevDelta = this.stringDelta[s];
      this.stringDelta[s] = delta;
      if (Math.abs(delta) < STRING_HYSTERESIS) continue;
      const side = delta > 0 ? 1 : -1;
      const prevSide = this.stringSide[s];
      this.stringSide[s] = side;
      if (prevSide === 0 || prevSide === side) continue;

      // Fraction of the last frame at which the crossing happened, so the
      // notes of a strum keep their spacing.
      const frac =
        Math.sign(prevDelta) !== side ? Math.min(1, Math.max(0, prevDelta / (prevDelta - delta))) : 1;
      if (this.pluckString(s, velocity, this.synth.now + frac * dt)) plucked++;
    }
    if (plucked > 0) pulse(right, 0.2 + 0.4 * velocity, 18);

    this.wasInStrumZone = true;
    this.prevPickLocal.copy(p);
  }

  private autoStrum(down: boolean, velocity: number, right: StatefulGamepad): void {
    const start = this.synth.now + 0.005;
    let i = 0;
    for (let k = 0; k < STRING_COUNT; k++) {
      const s = down ? k : STRING_COUNT - 1 - k;
      if (this.pluckString(s, velocity, start + i * AUTO_STRUM_GAP)) i++;
    }
    pulse(right, 0.5, 30);
  }

  private pluckString(s: number, velocity: number, when: number): boolean {
    const midi = this.voicing.midi[s];
    if (midi == null) return false;
    this.synth.pluck(s, midi, velocity, when, this.muted);
    this.stringAmp[s] = Math.max(this.stringAmp[s], velocity);
    const strums = this.entity.getValue(AirGuitar, 'strums') ?? 0;
    this.entity.setValue(AirGuitar, 'strums', strums + 1);
    return true;
  }

  private animateStrings(dt: number, time: number): void {
    const decay = Math.exp(-dt * (this.muted ? 14 : 3));
    for (let s = 0; s < STRING_COUNT; s++) {
      const amp = (this.stringAmp[s] *= decay);
      const string = this.model.strings[s];
      string.position.z = this.model.stringRestZ + amp * 0.003 * Math.sin(time * 95 + s * 1.7);
      this.model.stringMaterials[s].emissiveIntensity = amp * 1.6;
    }
  }
}

function pulse(pad: StatefulGamepad | undefined, intensity: number, ms: number): void {
  const actuator = (pad?.gamepad as HapticGamepad | undefined)?.hapticActuators?.[0];
  void actuator?.pulse?.(intensity, ms)?.catch(() => {});
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Chord diagram text, low E to high E: "x 3 2 0 1 0". */
function shapeText(voicing: Voicing): string {
  return voicing.frets.map((f) => (f == null ? 'x' : String(f))).join(' ');
}
