import { createSystem, Entity, Group, Matrix4, Object3D, Quaternion, Vector3, VisibilityState } from '@iwsdk/core';
import { dynamicMark } from '../cymbals/air-cymbals-system.js';
import { ACCENT } from '../guitar/guitar-model.js';
import { JOINT, TrackedHand } from '../guitar/hands.js';
import { fitPianoStand } from '../scene-assets/piano.scene-asset.js';
import { AirPiano } from './air-piano-component.js';
import { KEY_COUNT, KEYBOARD_WIDTH, keyLever, PIANO } from './geometry.js';
import { heldName, Keyboard, TIP_COUNT, TIPS_PER_HAND } from './keys.js';
import { createPianoModel, type PianoModel } from './piano-model.js';
import { PianoSynth } from './synth.js';
import { PropSmasher, type PropPart } from '../smash/prop-smash.js';
import { Smashable, SmashHold } from '../smash/smashable-component.js';
import { seededRandom } from '../guitar/smash.js';

/** Where the piano is set down when brought out, from the head (m). */
const PLACEMENT = {
  /** The keyboard's front edge, this far ahead of the eyes. */
  forward: 0.3,
  /** The white keys' tops, this far below the eyes: about elbow height. */
  below: 0.58,
  /** But never lower than this above the floor. */
  lowest: 0.45,
};
/** The stage the player stands on. */
const FLOOR_Y = 0.035;
/** Fingertip joints, thumb to little finger. */
const TIPS = [JOINT.thumbTip, JOINT.indexTip, JOINT.middleTip, JOINT.ringTip, JOINT.pinkyTip];
/** How fast a let-go key springs back up (1/s). */
const KEY_RETURN = 45;
/**
 * Where hands push the piano over, in piano space: the case behind the
 * keys, above them, where fingers playing never reach.
 */
const PUSH_BOX = [-KEYBOARD_WIDTH / 2 - 0.08, -0.02, -0.47, KEYBOARD_WIDTH / 2 + 0.08, 0.16, -0.17] as const;
/** How long a cluster from a crash rings before it is let go (s). */
const CRASH_RING = 1.4;

/**
 * A piano keyboard set down in front of the player, played with all ten
 * fingertips: a key goes down as far as a finger pushes it, sounds as loud
 * as the finger was moving when it got most of the way down, and stops when
 * let up. Shoved hard on its case it topples, and hitting the floor shakes
 * its keys, lid and pedals loose (see ../smash/prop-smash.ts); each key
 * sounds its note where it lands.
 */
export class AirPianoSystem extends createSystem({
  items: { required: [AirPiano] },
}) {
  /** Which instrument this is, for tests and tools. */
  readonly instrument = 'piano';
  readonly component = AirPiano;
  private model!: PianoModel;
  private entity!: Entity;
  private synth!: PianoSynth;
  private smash!: PropSmasher;
  private debris!: Group;
  private readonly grips: Object3D[] = [new Object3D(), new Object3D()];
  private readonly crashNotes: number[] = [];
  private crashUntil = 0;
  private readonly keyboard = new Keyboard();
  private readonly hands = [new TrackedHand(), new TrackedHand()] as const;
  private readonly tips = new Float32Array(TIP_COUNT * 3);
  private readonly tracked: boolean[] = Array(TIP_COUNT).fill(false);
  /** Each key's shown dip, easing back up when let go. */
  private readonly shownDepth = new Float32Array(KEY_COUNT);
  private readonly lit = new Uint8Array(KEY_COUNT);
  private readonly heldNotes: number[] = [];
  private shown = false;
  private notes = 0;
  private readonly toPiano = new Matrix4();
  private readonly headPos = new Vector3();
  private readonly headQuat = new Quaternion();
  private readonly fwd = new Vector3();
  private readonly tip = new Vector3();

  init(): void {
    this.synth = new PianoSynth();
    this.model = createPianoModel();
    this.entity = this.world.createTransformEntity(this.model.root, { persistent: true });
    this.entity.addComponent(AirPiano);
    this.entity.addComponent(Smashable);
    this.model.root.visible = false;
    this.debris = new Group();
    this.debris.name = 'AirPianoDebris';
    this.debris.visible = false;
    this.world.createTransformEntity(this.debris, { persistent: true });
    this.smash = new PropSmasher(this.model.root, this.debris, {
      mass: 120,
      wear: 0.13,
      friction: 1.2,
      pushBox: PUSH_BOX,
      parts: this.breakableParts(),
      fractures: [
        {
          sources: ['Body', 'Keybed', 'KeySlip', 'KeyWell'].map((name) => this.model.root.getObjectByName(name)!),
          pieces: 12,
        },
      ],
      sound: (speed, part, broke) => this.crash(speed, part, broke),
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
    const active = e.getValue(AirPiano, 'active') ?? false;
    if (active) void this.synth.warm();
    if (!active || this.world.visibilityState.peek() === VisibilityState.NonImmersive) {
      this.show(false);
      return;
    }
    const broughtOut = !this.shown;
    this.show(true);
    const dt = Math.min(delta, 0.1);
    if (e.getValue(AirPiano, 'resetPlacement')) this.smash.repair();
    if (broughtOut || this.smash.takeRepaired() || e.getValue(AirPiano, 'resetPlacement')) {
      e.setValue(AirPiano, 'resetPlacement', false);
      this.place();
    }
    this.letCrashGo();
    this.synth.setVolume(e.getValue(AirPiano, 'volume') ?? 0.8);

    const adapters = this.input.xr.visualAdapters.hand;
    const [left, right] = this.hands;
    left.update(adapters.left, this.player.gripSpaces.left);
    right.update(adapters.right, this.player.gripSpaces.right);
    if (e.getValue(AirPiano, 'leftHand') !== left.tracked) e.setValue(AirPiano, 'leftHand', left.tracked);
    if (e.getValue(AirPiano, 'rightHand') !== right.tracked) e.setValue(AirPiano, 'rightHand', right.tracked);
    for (let h = 0; h < 2; h++) {
      const hand = this.hands[h];
      for (let f = 0; f < TIPS_PER_HAND; f++) {
        const i = h * TIPS_PER_HAND + f;
        this.tracked[i] = hand.tracked;
        if (!hand.tracked) continue;
        hand.get(TIPS[f], this.tip).applyMatrix4(this.toPiano);
        this.tip.toArray(this.tips, i * 3);
      }
    }

    this.grips[0] = this.player.gripSpaces.left;
    this.grips[1] = this.player.gripSpaces.right;
    this.smash.update(dt, this.hands, this.grips, e);
    // Knocked over, it is no longer there to play.
    if (this.smash.hold === SmashHold.Worn) {
      this.keyboard.update(this.tips, this.tracked, dt);
      this.sound();
      this.animateKeys(dt);
    } else if (this.heldNotes.length > 0 || e.getValue(AirPiano, 'keysDown')) {
      this.letGoOfKeys();
    }
    this.updateHud(left.tracked || right.tracked);
  }

  /**
   * What shakes loose as it takes damage: the music rest first, then the
   * lid, the fallboard and the pedals, with the keys coming away one by one
   * all the way down.
   */
  private breakableParts(): PropPart[] {
    const root = this.model.root;
    const random = seededRandom(88);
    const parts: PropPart[] = this.model.keys.map((key, k) => ({
      name: `LooseKey${PIANO.lowest + k}`,
      objects: [key],
      breakAt: 0.1 + random() * 0.75,
    }));
    const named: [string, number][] = [['MusicRest', 0.85], ['Lid', 0.7], ['Fallboard', 0.5], ['Pedals', 0.35]];
    for (const [name, breakAt] of named) {
      const object = root.getObjectByName(name);
      if (object) parts.push({ name: `Loose${name}`, objects: [object], breakAt });
    }
    return parts;
  }

  /**
   * A hit: a key landing sounds its own note; the piano itself sounds a
   * cluster as loud as the blow, from the end that struck.
   */
  private crash(speed: number, part: number, broke: boolean): void {
    const loudness = Math.min(1, speed / 6);
    if (loudness < 0.06) return;
    const now = this.synth.ctx.currentTime;
    if (part >= 0 && part < KEY_COUNT) {
      this.synth.noteOn(PIANO.lowest + part, loudness * 0.7, now);
      this.synth.noteOff(PIANO.lowest + part, now + 0.6);
      return;
    }
    this.synth.knock(loudness, broke);
    if (part >= KEY_COUNT || speed < 2) return;
    const random = Math.random;
    const low = PIANO.lowest + Math.floor(random() * (KEY_COUNT - 14));
    for (let i = 0; i < 6; i++) {
      const midi = low + Math.floor(random() * 14);
      this.synth.noteOn(midi, loudness * (0.6 + 0.4 * random()), now + i * 0.006);
      this.crashNotes.push(midi);
    }
    this.crashUntil = now + CRASH_RING;
  }

  /** Lets the last crash's cluster go once it has rung. */
  private letCrashGo(): void {
    if (this.crashNotes.length === 0 || this.synth.ctx.currentTime < this.crashUntil) return;
    for (const midi of this.crashNotes) this.synth.noteOff(midi);
    this.crashNotes.length = 0;
  }

  /** Lifts every finger off the keys at once, as when the piano goes over. */
  private letGoOfKeys(): void {
    this.keyboard.reset();
    for (const midi of this.heldNotes) this.synth.noteOff(midi);
    this.heldNotes.length = 0;
    this.entity.setValue(AirPiano, 'keysDown', 0);
    this.entity.setValue(AirPiano, 'chord', '');
  }

  /** Sounds this frame's strikes and lets up this frame's releases. */
  private sound(): void {
    const kb = this.keyboard;
    if (kb.struckCount === 0 && kb.releasedCount === 0) return;
    const e = this.entity;
    const now = this.synth.ctx.currentTime;
    for (let i = 0; i < kb.releasedCount; i++) this.synth.noteOff(kb.released[i].midi, now);
    for (let i = 0; i < kb.struckCount; i++) {
      const s = kb.struck[i];
      this.synth.noteOn(s.midi, s.velocity, now);
      e.setValue(AirPiano, 'notes', ++this.notes);
      e.setValue(AirPiano, 'lastNote', s.midi);
      e.setValue(AirPiano, 'lastVelocity', Math.round(s.velocity * 100) / 100);
    }
    const held = this.heldNotes;
    held.length = 0;
    for (let k = 0; k < KEY_COUNT; k++) if (kb.down[k]) held.push(PIANO.lowest + k);
    e.setValue(AirPiano, 'keysDown', held.length);
    e.setValue(AirPiano, 'chord', heldName(held));
  }

  /** Turns each key about its pivot to its dip, and lights the ones sounding. */
  private animateKeys(dt: number): void {
    const kb = this.keyboard;
    const ease = 1 - Math.exp(-dt * KEY_RETURN);
    for (let k = 0; k < KEY_COUNT; k++) {
      const target = kb.depth[k];
      const shown = this.shownDepth[k];
      const next = target >= shown ? target : shown + (target - shown) * ease;
      if (next !== shown) {
        this.shownDepth[k] = next < 1e-5 ? 0 : next;
        this.model.keys[k].rotation.x = this.shownDepth[k] / keyLever(PIANO.lowest + k);
      }
      if (this.lit[k] !== kb.down[k]) {
        this.lit[k] = kb.down[k];
        this.model.bodies[k].material = kb.down[k] ? this.model.litMaterials[k] : this.model.restMaterials[k];
      }
    }
  }

  /** Sets the piano down in front of the player, level and square to where they face. */
  private place(): void {
    const head = this.player.head;
    head.updateWorldMatrix(true, false);
    head.getWorldPosition(this.headPos);
    head.getWorldQuaternion(this.headQuat);
    this.fwd.set(0, 0, -1).applyQuaternion(this.headQuat);
    this.fwd.y = 0;
    if (this.fwd.lengthSq() < 1e-6) this.fwd.set(0, 0, -1);
    this.fwd.normalize();
    const root = this.model.root;
    const keyY = Math.max(FLOOR_Y + PLACEMENT.lowest, this.headPos.y - PLACEMENT.below);
    root.position.copy(this.headPos).addScaledVector(this.fwd, PLACEMENT.forward);
    root.position.y = keyY;
    // Piano space has +Z toward the player.
    root.rotation.set(0, Math.atan2(-this.fwd.x, -this.fwd.z), 0);
    fitPianoStand(root, keyY - FLOOR_Y);
    root.updateMatrixWorld(true);
    this.toPiano.copy(root.matrixWorld).invert();
    // The stand changed length: measure the piano again for pushing over.
    this.smash.refit();
  }

  /** Shows or puts away the piano, silencing it when put away. */
  private show(visible: boolean): void {
    if (this.shown === visible) return;
    this.shown = visible;
    this.model.root.visible = visible;
    this.debris.visible = visible;
    if (visible) return;
    // Put away, it comes back out whole.
    this.smash.repair();
    this.synth.stopAll();
    this.keyboard.reset();
    this.shownDepth.fill(0);
    for (let k = 0; k < KEY_COUNT; k++) {
      this.model.keys[k].rotation.x = 0;
      this.lit[k] = 0;
      this.model.bodies[k].material = this.model.restMaterials[k];
    }
    if (this.entity.getValue(AirPiano, 'keysDown')) {
      this.entity.setValue(AirPiano, 'keysDown', 0);
      this.entity.setValue(AirPiano, 'chord', '');
    }
  }

  private updateHud(handsTracked: boolean): void {
    const hud = this.model.hud;
    if (!handsTracked) {
      hud.draw(['Show your hands', 'Play the keys with your fingertips'], ACCENT.idle);
      return;
    }
    const e = this.entity;
    const chord = e.getValue(AirPiano, 'chord') ?? '';
    if (chord !== '') {
      const volume = Math.round((e.getValue(AirPiano, 'volume') ?? 0.8) * 100);
      hud.draw([chord, `${dynamicMark(e.getValue(AirPiano, 'lastVelocity') ?? 0)} · ${volume}%`], ACCENT.playing);
      return;
    }
    hud.draw(['Piano', 'Press the keys with your fingertips', 'Faster is louder'], ACCENT.idle);
  }
}
