/**
 * Picking the guitar up by the neck and smashing it. A fist round the neck
 * takes the guitar off the player's body and into that hand; swinging it
 * into the floor damages it (see smash.ts for the rules); opening the hand
 * throws it. Thrown guitars and their broken pieces tumble with tumble.ts,
 * and every hit sounds through the guitar's own synth.
 */

import { Matrix4, Object3D, Quaternion, Vector3 } from '@iwsdk/core';
import { GuitarHold } from './air-guitar-component.js';
import { GuitarModel } from './guitar-model.js';
import { JOINT, TrackedHand } from './hands.js';
import {
  applyImpact,
  freshDamage,
  type GuitarDamage,
  newOutcome,
  Region,
  repairDamage,
  seededRandom,
  SMASH,
} from './smash.js';
import { GuitarSynth } from './synth.js';
import { Scars } from '../smash/scars.js';
import { Splinters } from '../smash/splinter.js';
import { STAGE_FLOOR } from '../smash/tumble.js';
import {
  createGuitarWreck,
  GuitarWreck,
  measurePiece,
  restoreGuitar,
  showBridgeGone,
  showCracked,
  showHoleGone,
  showNeckSnapped,
  WreckPiece,
} from './wreck-model.js';

export type Hold = (typeof GuitarHold)[keyof typeof GuitarHold];

/** Index, middle and ring fingertips this close to the palm make a fist... */
const FIST_REACH = 0.05;
/** ...and two of them this far out open it again. */
const OPEN_REACH = 0.075;
/** A fist held round the neck this long picks the guitar up. */
const GRAB_SECONDS = 0.25;
/** How far the palm can be from the neck's centre line. */
const GRAB_RADIUS = 0.1;
/** A held guitar is dropped after the hand is lost from tracking this long. */
const LOST_SECONDS = 0.5;
/** Frames of the held pose kept to work out how fast it was thrown. */
const HISTORY = 12;
const THROW_WINDOW = 0.1;
const MAX_THROW_SPEED = 15;
const MAX_THROW_SPIN = 25;
/** A point must lift this far off the floor before it can strike it again. */
const REARM_HEIGHT = 0.03;
/** A thrown guitar's bounces closer together than this count as one. */
const IMPACT_COOLDOWN = 0.08;
/** Different points of a swung guitar reach the floor over several frames: that is one blow. */
const SWING_COOLDOWN = 0.25;
/** A shard broken off by a hit this hard (m/s) bursts into fragments rather than coming off whole. */
const SPLINTER_SPEED = 4;
/** Debris clatters at most this often. */
const CLATTER_INTERVAL = 0.05;

const FIST_TIPS = [JOINT.indexTip, JOINT.middleTip, JOINT.ringTip] as const;

export class GuitarSmasher {
  hold: Hold = GuitarHold.Worn;
  readonly damage: GuitarDamage;
  impacts = 0;
  /** Speed of the last hit that counted, m/s. */
  lastImpact = 0;
  /** Bumped whenever something the AirGuitar component shows has changed. */
  version = 0;

  private readonly wreck: GuitarWreck;
  /** The dents, cracks and chips each hit leaves where it lands. */
  readonly scars: Scars;
  /** The fragments of shards a hard hit burst. */
  readonly splinters: Splinters;
  /** The body is in its shards, still in place. */
  private cracked = false;
  /** The contact points still on the guitar: where in it, and what part of it. */
  private readonly activeLocal: Float32Array;
  private readonly activeRegion: Uint8Array;
  private activeCount = 0;
  private readonly outcome = newOutcome();
  private readonly random = seededRandom(1);
  /** Pieces off the guitar, flying or lying on the floor. */
  private readonly debris: WreckPiece[] = [];

  private holder: TrackedHand | null = null;
  private holderGrip: Object3D | null = null;
  /** What the hand holds: the guitar's root, or the neck's upper piece once it has snapped off in hand. */
  private held: Object3D | null = null;
  private heldPiece: WreckPiece | null = null;
  private readonly fistTime = [0, 0];
  private lostTime = 0;
  private cooldown = 0;
  private clatter = 0;
  private clock = 0;

  /** The held object in grip space. */
  private readonly offset = new Matrix4();
  private readonly desired = new Matrix4();
  private readonly inverse = new Matrix4();
  private readonly prevY: Float32Array;
  private readonly armed: Uint8Array;
  private readonly histPos = new Float64Array(HISTORY * 3);
  private readonly histQuat = new Float64Array(HISTORY * 4);
  private readonly histTime = new Float64Array(HISTORY);
  private histCount = 0;
  private histHead = 0;

  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly palm = new Vector3();
  private readonly hit = new Vector3();
  private readonly centre = new Vector3();
  private readonly debrisHit = new Vector3();
  private readonly vel = new Vector3();
  private readonly spin = new Vector3();
  private readonly scale = new Vector3();
  private readonly quat = new Quaternion();
  private readonly quat2 = new Quaternion();

  constructor(
    private readonly model: GuitarModel,
    private readonly synth: GuitarSynth,
    /** An empty group at the world origin that holds debris. */
    private readonly debrisRoot: Object3D,
    /** The system's per-string envelope and note, kept current for the string glow. */
    private readonly amp: Float32Array,
    private readonly soundingMidi: Int16Array,
  ) {
    this.wreck = createGuitarWreck(model);
    for (const piece of [this.wreck.upper, this.wreck.lower, ...this.wreck.shards]) piece.body.floor = STAGE_FLOOR;
    this.wreck.guitar.floor = STAGE_FLOOR;
    this.damage = freshDamage(model.board.stringCount, this.wreck.shards.length);
    this.scars = new Scars(debrisRoot);
    this.splinters = new Splinters(debrisRoot);
    const count = this.wreck.points.length / 3;
    this.prevY = new Float32Array(count);
    this.armed = new Uint8Array(count);
    this.activeLocal = new Float32Array(count * 3);
    this.activeRegion = new Uint8Array(count);
    this.rebuildPoints();
  }

  /**
   * Runs every frame the guitar is out. `hands` and `grips` are left then
   * right. While `hold` is Worn the system poses the guitar; otherwise this does.
   */
  update(
    dt: number,
    hands: readonly [TrackedHand, TrackedHand],
    grips: readonly [Object3D, Object3D],
    smashable: boolean,
  ): void {
    this.clock += dt;
    this.cooldown -= dt;
    this.clatter -= dt;
    if (this.held != null) this.updateHeld(dt);
    else if (smashable && !this.damage.wrecked) this.updateGrab(dt, hands, grips);
    if (this.hold === GuitarHold.Thrown && !this.damage.wrecked) this.updateThrown(dt);
    this.updateDebris(dt);
    this.scars.update(dt);
    this.splinters.update(dt);
  }

  /** Back on the player's body. A wrecked guitar comes back new. */
  wear(): void {
    if (this.damage.wrecked) {
      this.repair();
      return;
    }
    if (this.heldPiece != null) this.launch(this.heldPiece, this.vel.set(0, 0, 0), this.spin.set(0, 0, 0), 0);
    this.letGo();
    if (this.hold !== GuitarHold.Worn) {
      this.hold = GuitarHold.Worn;
      this.version++;
    }
  }

  /** Every piece back on, every string back on, and back on the player. */
  repair(): void {
    restoreGuitar(this.model, this.wreck);
    this.debris.length = 0;
    repairDamage(this.damage);
    this.scars.restore();
    this.splinters.clear();
    this.cracked = false;
    this.rebuildPoints();
    this.letGo();
    this.hold = GuitarHold.Worn;
    this.impacts = 0;
    this.lastImpact = 0;
    this.version++;
  }

  private letGo(): void {
    this.holder = null;
    this.holderGrip = null;
    this.held = null;
    this.heldPiece = null;
  }

  /** A fist held round the neck for GRAB_SECONDS picks the guitar up. */
  private updateGrab(
    dt: number,
    hands: readonly [TrackedHand, TrackedHand],
    grips: readonly [Object3D, Object3D],
  ): void {
    const root = this.model.root;
    root.updateMatrixWorld(true);
    this.inverse.copy(root.matrixWorld).invert();
    const reach = this.damage.neckBroken ? this.wreck.breakX + 0.02 : this.model.board.dims.nutX + 0.2;
    for (let i = 0; i < 2; i++) {
      const hand = hands[i];
      const gripping = hand.tracked && this.isFist(hand) && this.nearNeck(reach);
      this.fistTime[i] = gripping ? this.fistTime[i] + dt : 0;
      if (this.fistTime[i] >= GRAB_SECONDS) {
        this.grab(hand, grips[i], root, null);
        if (this.hold !== GuitarHold.Held) {
          this.hold = GuitarHold.Held;
          this.version++;
        }
        return;
      }
    }
  }

  private grab(hand: TrackedHand, grip: Object3D, object: Object3D, piece: WreckPiece | null): void {
    this.holder = hand;
    this.holderGrip = grip;
    this.held = object;
    this.heldPiece = piece;
    this.fistTime[0] = 0;
    this.fistTime[1] = 0;
    this.lostTime = 0;
    this.histCount = 0;
    grip.updateWorldMatrix(true, false);
    object.updateMatrixWorld(true);
    this.desired.copy(object.matrixWorld);
    this.offset.copy(grip.matrixWorld).invert().multiply(object.matrixWorld);
    if (object === this.model.root) this.rebuildPoints();
  }

  /** Gathers the contact points of what is still on the guitar, and starts them afresh. */
  private rebuildPoints(): void {
    const { points, regions, pointShard, pointsWithoutNeck, centre, guitar } = this.wreck;
    const d = this.damage;
    const root = this.model.root;
    root.updateMatrixWorld(true);
    // In the hand's pose, not where the floor stopped it, as the strike check compares against.
    const pose = this.held === root ? this.desired : root.matrixWorld;
    let n = 0;
    for (let i = 0; i < points.length / 3; i++) {
      if (i >= pointsWithoutNeck && d.neckBroken) continue;
      if (pointShard[i] >= 0 && d.shards[pointShard[i]] <= 0) continue;
      for (let k = 0; k < 3; k++) {
        this.activeLocal[n * 3 + k] = points[i * 3 + k];
        guitar.points[n * 3 + k] = points[i * 3 + k] - centre.getComponent(k);
      }
      this.activeRegion[n] = regions[i];
      const y = this.tmp.fromArray(points, i * 3).applyMatrix4(pose).y - STAGE_FLOOR;
      this.prevY[n] = y;
      this.armed[n] = y > REARM_HEIGHT ? 1 : 0;
      n++;
    }
    this.activeCount = n;
    guitar.pointCount = n;
  }

  private updateHeld(dt: number): void {
    const hand = this.holder!;
    const grip = this.holderGrip!;
    const held = this.held!;
    if (!hand.tracked) {
      // Fast swings drop tracking for a moment; only a long loss lets go.
      this.lostTime += dt;
      if (this.lostTime > LOST_SECONDS) this.release();
      return;
    }
    this.lostTime = 0;
    if (this.isOpen(hand)) {
      this.release();
      return;
    }
    grip.updateWorldMatrix(true, false);
    this.desired.multiplyMatrices(grip.matrixWorld, this.offset);
    this.desired.decompose(held.position, held.quaternion, this.scale);
    if (held === this.model.root && !this.damage.wrecked) {
      this.strikeFloor(dt);
      // A snapped neck can leave the hand holding a different piece.
      if (this.held !== held) return;
    }
    held.updateMatrixWorld(true);
    this.record(held);
  }

  /**
   * Checks the held guitar against the floor. The hand's motion is the
   * guitar's, so a point crossing y = 0 strikes at the speed it was moving
   * down; the floor then stops the guitar even though the hand goes on.
   */
  private strikeFloor(dt: number): void {
    const points = this.activeLocal;
    const count = this.activeCount;
    let lowest = 0;
    let fastest = 0;
    let struck = -1;
    for (let i = 0; i < count; i++) {
      const p = this.tmp.fromArray(points, i * 3).applyMatrix4(this.desired);
      const y = p.y - STAGE_FLOOR;
      const down = dt > 0 ? (this.prevY[i] - y) / dt : 0;
      if (this.armed[i] && y < 0 && down > fastest) {
        fastest = down;
        struck = i;
        this.hit.set(p.x, STAGE_FLOOR, p.z);
      }
      if (y < 0) this.armed[i] = 0;
      else if (y > REARM_HEIGHT) this.armed[i] = 1;
      this.prevY[i] = y;
      lowest = Math.min(lowest, y);
    }
    const root = this.model.root;
    root.position.y -= lowest;
    root.updateMatrixWorld(true);
    if (struck >= 0 && this.cooldown <= 0) {
      this.cooldown = SWING_COOLDOWN;
      this.strike(fastest, this.activeRegion[struck] as Region);
    }
  }

  /** Remembers where the held object's centre was, to throw it at its speed. */
  private record(held: Object3D): void {
    const k = this.histHead;
    const c = this.tmp;
    if (held === this.model.root) c.copy(this.wreck.centre).applyMatrix4(held.matrixWorld);
    else c.copy(held.position);
    c.toArray(this.histPos, k * 3);
    held.quaternion.toArray(this.histQuat, k * 4);
    this.histTime[k] = this.clock;
    this.histHead = (k + 1) % HISTORY;
    this.histCount = Math.min(HISTORY, this.histCount + 1);
  }

  /** Linear and angular velocity of the held object over the last THROW_WINDOW. */
  private throwVelocity(v: Vector3, w: Vector3): void {
    v.set(0, 0, 0);
    w.set(0, 0, 0);
    if (this.histCount < 2) return;
    const newest = (this.histHead - 1 + HISTORY) % HISTORY;
    let oldest = newest;
    for (let n = 1; n < this.histCount; n++) {
      oldest = (newest - n + HISTORY) % HISTORY;
      if (this.histTime[newest] - this.histTime[oldest] >= THROW_WINDOW) break;
    }
    const span = this.histTime[newest] - this.histTime[oldest];
    if (span <= 0) return;
    v.fromArray(this.histPos, newest * 3)
      .sub(this.tmp2.fromArray(this.histPos, oldest * 3))
      .divideScalar(span);
    if (v.length() > MAX_THROW_SPEED) v.setLength(MAX_THROW_SPEED);
    // The rotation from the oldest pose to the newest, as axis times rate.
    const q = this.quat.fromArray(this.histQuat, newest * 4);
    q.multiply(this.quat2.fromArray(this.histQuat, oldest * 4).invert());
    if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
    const sinHalf = Math.sqrt(Math.max(0, 1 - q.w * q.w));
    if (sinHalf > 1e-6) {
      const angle = 2 * Math.acos(Math.min(1, q.w));
      w.set(q.x / sinHalf, q.y / sinHalf, q.z / sinHalf).multiplyScalar(angle / span);
      if (w.length() > MAX_THROW_SPIN) w.setLength(MAX_THROW_SPIN);
    }
  }

  /** Opening the hand throws whatever it held at the speed it was moving. */
  private release(): void {
    this.throwVelocity(this.vel, this.spin);
    const piece = this.heldPiece;
    this.letGo();
    if (piece != null) {
      this.launch(piece, this.vel, this.spin, 0);
      return;
    }
    if (this.damage.wrecked) {
      // Only the neck was left in hand: it falls in its two pieces.
      const root = this.model.root;
      root.getWorldPosition(this.hit);
      this.launchNeck(this.vel, this.spin, 0, this.centre.copy(this.wreck.centre).applyMatrix4(root.matrixWorld));
      this.parkHud();
      this.hold = GuitarHold.Thrown;
      this.version++;
      return;
    }
    this.throwGuitar(this.vel, this.spin);
  }

  private throwGuitar(v: Vector3, w: Vector3): void {
    const root = this.model.root;
    const body = this.wreck.guitar;
    root.updateMatrixWorld(true);
    const c = this.tmp.copy(this.wreck.centre).applyMatrix4(root.matrixWorld);
    const q = root.quaternion;
    body.setPose(c.x, c.y, c.z, q.x, q.y, q.z, q.w);
    body.setVelocity(v.x, v.y, v.z, w.x, w.y, w.z);
    this.rebuildPoints();
    body.wake();
    this.cooldown = 0;
    if (this.hold !== GuitarHold.Thrown) {
      this.hold = GuitarHold.Thrown;
      this.version++;
    }
  }

  private updateThrown(dt: number): void {
    const body = this.wreck.guitar;
    if (body.asleep) return;
    body.step(dt);
    const root = this.model.root;
    root.quaternion.set(body.q[0], body.q[1], body.q[2], body.q[3]);
    const c = this.tmp.copy(this.wreck.centre).applyQuaternion(root.quaternion);
    root.position.set(body.p[0] - c.x, body.p[1] - c.y, body.p[2] - c.z);
    root.updateMatrixWorld(true);
    if (body.impactPoint < 0 || body.impactSpeed < 0.3 || this.cooldown > 0) return;
    this.cooldown = IMPACT_COOLDOWN;
    this.hit.fromArray(this.activeLocal, body.impactPoint * 3).applyMatrix4(root.matrixWorld);
    this.hit.y = STAGE_FLOOR;
    this.strike(body.impactSpeed, this.activeRegion[body.impactPoint] as Region);
  }

  /** A hit at `speed` m/s on `region`, struck at `this.hit`. */
  private strike(speed: number, region: Region): void {
    const d = this.damage;
    const root = this.model.root;
    root.updateMatrixWorld(true);
    this.inverse.copy(root.matrixWorld).invert();
    const at = this.tmp.copy(this.hit).applyMatrix4(this.inverse);
    const out = applyImpact(d, speed, region, at.x, at.y, this.wreck.shardCentres, this.random, this.outcome, this.model.board);
    const now = this.synth.now;
    // The first real blow to the body, or any shard coming off, shows the body in its shards.
    if (!this.cracked && (out.shardsOff.length > 0 || (region === Region.Body && out.loss > 0))) {
      this.cracked = true;
      showCracked(this.model, this.wreck);
    }
    // Before anything flies, so the marks are on the pieces that do.
    this.scars.hit(root, this.hit, speed);
    if (speed >= SMASH.tap) {
      this.impacts++;
      this.lastImpact = speed;
      this.version++;
    }
    this.synth.knock(speed / 10, out.shardsOff.length > 0 || out.neckBroke || out.shattered, now);
    // Every string still on crashes out together.
    if (speed >= SMASH.snap) {
      const velocity = Math.min(1, speed / 9);
      for (let s = 0; s < d.strings.length; s++) {
        if (!d.strings[s]) continue;
        const midi = this.model.board.openMidi[s] + Math.floor(this.random() * 5);
        this.synth.pluck(s, midi, velocity, now + s * 0.004, false);
        this.soundingMidi[s] = midi;
        this.amp[s] = Math.max(this.amp[s], velocity);
      }
    }
    for (let i = 0; i < out.snapped.length; i++) this.snapString(out.snapped[i], now);
    this.knockOffShards(speed, now);
    if (out.neckBroke) this.snapNeck(speed);
    if (out.shattered) this.shatter(speed);
    // Only when a point has gone: rebuilding re-arms them all.
    if (out.shardsOff.length > 0 || out.neckBroke) this.rebuildPoints();
  }

  /** The shards this hit broke loose fly off, taking what was on them. */
  private knockOffShards(speed: number, now: number): void {
    const { shardsOff } = this.outcome;
    if (shardsOff.length === 0) return;
    const root = this.model.root;
    this.guitarMotion(this.vel, this.spin);
    this.centre.copy(this.wreck.centre).applyMatrix4(root.matrixWorld);
    for (let i = 0; i < shardsOff.length; i++) {
      const shard = shardsOff[i];
      const piece = this.wreck.shards[shard];
      if (speed >= SPLINTER_SPEED) {
        // Hit hard, it bursts where it was struck rather than coming away whole.
        this.detach(piece);
        this.splinters.burst(piece.pivot, this.hit, Math.min(9, Math.max(2, Math.round((speed - 3) * 1.3))), this.vel, this.spin, this.centre, speed * 0.5);
        // Its fragments are all that is left of it; a repair brings it back.
        piece.pivot.removeFromParent();
      } else {
        this.launch(piece, this.vel, this.spin, speed, this.centre);
      }
      if (shard === this.wreck.holeShard) showHoleGone(this.model);
      if (shard === this.wreck.bridgeShard) {
        // Nothing holds the strings at this end now.
        showBridgeGone(this.wreck);
        for (let s = 0; s < this.damage.strings.length; s++) {
          if (!this.damage.strings[s]) continue;
          this.damage.strings[s] = false;
          this.snapString(s, now);
        }
      }
    }
  }

  private snapString(s: number, now: number): void {
    this.model.strings[s].visible = false;
    this.model.vibrations[s].visible = false;
    this.wreck.bridgeStubs[s].visible = !this.damage.wrecked;
    this.wreck.nutStubs[s].visible = true;
    // A string snapping: a bright ping, cut short.
    const board = this.model.board;
    this.synth.pluck(s, board.openMidi[s] + board.dims.fretCount, 1, now + 0.01, false);
    this.synth.choke(s, now + 0.1);
    this.amp[s] = 0;
  }

  private snapNeck(speed: number): void {
    const { upper } = this.wreck;
    const root = this.model.root;
    showNeckSnapped(this.model, this.wreck);
    this.guitarMotion(this.vel, this.spin);
    this.centre.copy(this.wreck.centre).applyMatrix4(root.matrixWorld);
    const holder = this.holder;
    const grip = this.holderGrip;
    if (this.held === root && holder != null && grip != null && this.palmAboveBreak(holder)) {
      // The hand keeps the headstock end; the rest of the guitar flies on.
      this.detach(upper);
      this.throwGuitar(this.vel, this.spin);
      // It is already on the floor: this hit has been counted.
      this.cooldown = IMPACT_COOLDOWN * 2;
      this.grab(holder, grip, upper.pivot, upper);
      return;
    }
    this.launch(upper, this.vel, this.spin, speed, this.centre);
  }

  private shatter(speed: number): void {
    const root = this.model.root;
    this.model.body.visible = false;
    showBridgeGone(this.wreck);
    this.guitarMotion(this.vel, this.spin);
    this.centre.copy(this.wreck.centre).applyMatrix4(root.matrixWorld);
    // A hand on the neck keeps it; otherwise the neck goes too.
    if (this.held === root) return;
    this.launchNeck(this.vel, this.spin, speed, this.centre);
    this.parkHud();
  }

  /** Whatever of the neck is still on the guitar flies off. */
  private launchNeck(v: Vector3, w: Vector3, kick: number, centre: Vector3): void {
    const root = this.model.root;
    const { lower, upper } = this.wreck;
    if (lower.pivot.parent === root) this.launch(lower, v, w, kick, centre);
    if (upper.pivot.parent === root) this.launch(upper, v, w, kick, centre);
  }

  /** How the guitar is moving: from the hand while held, from the simulation once thrown. */
  private guitarMotion(v: Vector3, w: Vector3): void {
    if (this.held === this.model.root) {
      this.throwVelocity(v, w);
    } else if (this.hold === GuitarHold.Thrown) {
      const b = this.wreck.guitar;
      v.set(b.v[0], b.v[1], b.v[2]);
      w.set(b.w[0], b.w[1], b.w[2]);
    } else {
      v.set(0, 0, 0);
      w.set(0, 0, 0);
    }
  }

  /** Moves a piece off the guitar into world space, where it simulates on its own. */
  private detach(piece: WreckPiece): void {
    const pivot = piece.pivot;
    pivot.visible = true;
    this.debrisRoot.attach(pivot);
    measurePiece(piece);
    const p = pivot.position;
    const q = pivot.quaternion;
    piece.body.setPose(p.x, p.y, p.z, q.x, q.y, q.z, q.w);
    piece.body.wake();
  }

  /**
   * Sends a piece off on its own, carried by the guitar's motion: velocity
   * `v` at `centre`, spinning at `w`. A piece knocked off by a hit of `kick`
   * m/s also bounces up and away from where it hit.
   */
  private launch(piece: WreckPiece, v: Vector3, w: Vector3, kick: number, centre: Vector3 | null = null): void {
    if (piece.pivot.parent !== this.debrisRoot) this.detach(piece);
    const p = piece.pivot.position;
    const arm = this.tmp2.set(0, 0, 0);
    if (centre != null) arm.subVectors(p, centre);
    const u = this.tmp.copy(w).cross(arm).add(v);
    let ux = u.x;
    let uy = u.y;
    let uz = u.z;
    let wx = w.x;
    let wy = w.y;
    let wz = w.z;
    if (kick > 0) {
      const rand = this.random;
      let ax = p.x - this.hit.x;
      let az = p.z - this.hit.z;
      const d = Math.hypot(ax, az);
      if (d < 1e-4) {
        const angle = rand() * Math.PI * 2;
        ax = Math.cos(angle);
        az = Math.sin(angle);
      } else {
        ax /= d;
        az /= d;
      }
      const out = kick * (0.1 + 0.25 * rand());
      ux += ax * out;
      uz += az * out;
      uy = Math.abs(uy) * 0.25 + kick * (0.15 + 0.25 * rand());
      wx += (rand() - 0.5) * kick * 3;
      wy += (rand() - 0.5) * kick * 3;
      wz += (rand() - 0.5) * kick * 3;
    }
    piece.body.setVelocity(ux, uy, uz, wx, wy, wz);
    piece.body.wake();
    if (!this.debris.includes(piece)) this.debris.push(piece);
  }

  /** With nothing left of the guitar to carry it, its HUD floats over the wreck. */
  private parkHud(): void {
    const root = this.model.root;
    const hud = this.model.hud.sprite.position;
    root.quaternion.identity();
    root.position.set(this.hit.x - hud.x, 1.1 - hud.y, this.hit.z - hud.z);
    root.updateMatrixWorld(true);
  }

  private updateDebris(dt: number): void {
    for (let i = 0; i < this.debris.length; i++) {
      const piece = this.debris[i];
      const b = piece.body;
      if (b.asleep) continue;
      b.step(dt);
      piece.pivot.position.set(b.p[0], b.p[1], b.p[2]);
      piece.pivot.quaternion.set(b.q[0], b.q[1], b.q[2], b.q[3]);
      if (b.impactSpeed > 1 && this.clatter <= 0) {
        this.synth.knock(Math.min(0.5, b.impactSpeed / 12), false);
        this.clatter = CLATTER_INTERVAL;
        // A piece landing hard takes its own dents.
        piece.pivot.updateMatrixWorld(true);
        this.debrisHit.fromArray(b.points, Math.max(0, b.impactPoint) * 3).applyMatrix4(piece.pivot.matrixWorld);
        this.debrisHit.y = STAGE_FLOOR;
        this.scars.hit(piece.pivot, this.debrisHit, b.impactSpeed);
        measurePiece(piece);
      }
    }
  }

  /** Midway between the wrist and the middle knuckle. */
  private palmOf(hand: TrackedHand): Vector3 {
    return hand
      .get(JOINT.wrist, this.palm)
      .add(hand.get(JOINT.middleProximal, this.tmp))
      .multiplyScalar(0.5);
  }

  private isFist(hand: TrackedHand): boolean {
    this.palmOf(hand);
    for (let i = 0; i < FIST_TIPS.length; i++) {
      if (hand.get(FIST_TIPS[i], this.tmp).distanceTo(this.palm) > FIST_REACH) return false;
    }
    return true;
  }

  private isOpen(hand: TrackedHand): boolean {
    this.palmOf(hand);
    let open = 0;
    for (let i = 0; i < FIST_TIPS.length; i++) {
      if (hand.get(FIST_TIPS[i], this.tmp).distanceTo(this.palm) > OPEN_REACH) open++;
    }
    return open >= 2;
  }

  /** Whether the palm (from isFist) is round the neck, up to `reach` along it. */
  private nearNeck(reach: number): boolean {
    const p = this.tmp.copy(this.palm).applyMatrix4(this.inverse);
    return p.x > this.model.neckStart - 0.02 && p.x < reach && Math.hypot(p.y, p.z + 0.008) < GRAB_RADIUS;
  }

  private palmAboveBreak(hand: TrackedHand): boolean {
    this.inverse.copy(this.model.root.matrixWorld).invert();
    return this.palmOf(hand).applyMatrix4(this.inverse).x > this.wreck.breakX;
  }
}
