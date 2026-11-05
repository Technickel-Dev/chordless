/**
 * Smashing an instrument, shared by every instrument but the guitar (which
 * has its own strings-and-shards version in ../guitar/smashing.ts).
 *
 * While its system plays it, the instrument is "worn": the system poses it,
 * and a point of it striking the floor (y = 0) faster than `tap` m/s costs
 * health, so an instrument played in the hands is smashed by swinging it
 * into the floor. A fist can also pick it up whole, or pull a grabbable part
 * off it; opening the hand throws what it held. Hands can push it over. As
 * health falls, parts break off and tumble away; at zero it is wrecked and
 * comes loose entirely. Loose things tumble with tumble.ts. Pinching both
 * hands for a second, or setting Smashable.repair, puts it back together.
 */

import { Box3, Entity, Group, Matrix4, Mesh, Object3D, Quaternion, Vector3 } from '@iwsdk/core';
import { JOINT, TrackedHand } from '../guitar/hands.js';
import { Smashable, SmashCondition, SmashHold } from './smashable-component.js';
import { RigidBody, STAGE_FLOOR } from './tumble.js';

export type SmashHoldValue = (typeof SmashHold)[keyof typeof SmashHold];

export interface PropPart {
  name: string;
  /** What breaks off together. */
  objects: Object3D[];
  /** Breaks off on any hit that leaves health at or below this. */
  breakAt: number;
  /** A fist can pull it off and throw it on its own. */
  grabbable?: boolean;
  /** It snaps and is gone (strings) rather than flying off. */
  vanish?: boolean;
}

export interface PropSmashConfig {
  /** Total mass, kg. */
  mass: number;
  /** Health lost per m/s above `tap`. */
  wear: number;
  /** Slower hits only knock. */
  tap?: number;
  /** Grip of the whole instrument on the floor: rubber feet grip hard, so a shove tips it rather than sliding it. */
  friction?: number;
  /** A fist on the instrument picks the whole of it up. */
  grabWhole?: boolean;
  /** How long a fist must stay to pick something up. */
  grabSeconds?: number;
  /** Which hands (0 left, 1 right) can grab; both by default. */
  grabHands?: readonly number[];
  /** Hands push the instrument inside this box, in its own space: min xyz, then max xyz. */
  pushBox?: readonly [number, number, number, number, number, number];
  parts: PropPart[];
  /** Objects under the instrument that are not part of it, such as drumsticks in the hands. */
  ignore?: Object3D[];
  /**
   * Sounds a hit: its speed in m/s, the part that struck (-1 for the
   * instrument itself), and whether it broke something off.
   */
  sound(speed: number, part: number, broke: boolean): void;
}

/** Index, middle and ring fingertips this close to the palm make a fist... */
const FIST_REACH = 0.05;
/** ...and two of them this far out open it again. */
const OPEN_REACH = 0.075;
/** How far outside something the fist can be and still take hold of it. */
const GRAB_MARGIN = 0.04;
const LOST_SECONDS = 0.5;
const HISTORY = 12;
const THROW_WINDOW = 0.1;
const MAX_THROW_SPEED = 15;
const MAX_THROW_SPIN = 25;
const REARM_HEIGHT = 0.03;
const IMPACT_COOLDOWN = 0.08;
/** Faster "hits" are the system moving the instrument somewhere new. */
const TELEPORT_SPEED = 25;
/** A hand moving into the push box slower than this is resting on it. */
const PUSH_MIN_SPEED = 0.15;
/** A hand "moving" faster than this jumped (tracking was lost and found), so it does not push. */
const PUSH_MAX_SPEED = 4;
const RETURN_SECONDS = 1;
const PINCH_DISTANCE = 0.018;
const CLATTER_INTERVAL = 0.03;
const FIST_TIPS = [JOINT.indexTip, JOINT.middleTip, JOINT.ringTip] as const;
/** No part or the whole: what a hand is not about to grab. */
const NOTHING = -2;
const WHOLE = -1;

interface Home {
  object: Object3D;
  parent: Object3D;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
}

interface Part {
  spec: PropPart;
  index: number;
  /** In the instrument's space. */
  box: Box3;
  centre: Vector3;
  /** Its contact points: the extremes of its shape, in the instrument's space. */
  hull: Hull;
  /** Holds the part's objects once it is off, at its centre. */
  pivot: Group;
  body: RigidBody;
  homes: Home[];
  attached: boolean;
  cooldown: number;
}

export class PropSmasher {
  hold: SmashHoldValue = SmashHold.Worn;
  health = 1;
  impacts = 0;
  lastImpact = 0;
  piecesOff = 0;
  /** Bumped whenever something the Smashable component shows has changed. */
  version = 0;

  private readonly parts: Part[] = [];
  private readonly loose: Part[] = [];
  /** The whole instrument, once it comes loose. */
  private readonly body: RigidBody;
  private readonly centre = new Vector3();
  private readonly coreBox = new Box3();
  private readonly wholeBox = new Box3();
  private readonly coreHull = new Hull();
  /** What the core is measured without: the parts and anything ignored. */
  private readonly owned = new Set<Object3D>();
  /** Contact points in use, in the instrument's space, and the part (or -1) each is on. */
  private readonly pointLocal: Float32Array;
  private readonly pointPart: Int16Array;
  private pointCount = 0;
  private readonly prevY: Float32Array;
  private readonly armed: Uint8Array;
  private syncedVersion = -1;
  private repaired = false;

  private holder: TrackedHand | null = null;
  private holderGrip: Object3D | null = null;
  private held: Object3D | null = null;
  private heldPart: Part | null = null;
  private readonly grabTarget = [NOTHING, NOTHING];
  private readonly grabTime = [0, 0];
  private readonly pushPalm = [new Vector3(), new Vector3()];
  private readonly pushValid = [false, false];
  private lostTime = 0;
  private returnTime = 0;
  private cooldown = 0;
  private clatter = 0;
  private clock = 0;

  private readonly offset = new Matrix4();
  private readonly desired = new Matrix4();
  private readonly inverse = new Matrix4();
  private readonly histPos = new Float64Array(HISTORY * 3);
  private readonly histQuat = new Float64Array(HISTORY * 4);
  private readonly histTime = new Float64Array(HISTORY);
  private histCount = 0;
  private histHead = 0;
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly palm = new Vector3();
  private readonly hit = new Vector3();
  private readonly vel = new Vector3();
  private readonly spin = new Vector3();
  private readonly world = new Vector3();
  private readonly scale = new Vector3();
  private readonly quat = new Quaternion();
  private readonly quat2 = new Quaternion();

  constructor(
    private readonly root: Object3D,
    /** An empty group at the world origin that holds broken-off parts. */
    private readonly debrisRoot: Object3D,
    private readonly config: PropSmashConfig,
  ) {
    for (const spec of config.parts) for (const o of spec.objects) this.owned.add(o);
    for (const o of config.ignore ?? []) this.owned.add(o);
    config.parts.forEach((spec, index) => {
      const pivot = new Group();
      pivot.name = spec.name;
      const homes = spec.objects.map((object) => ({
        object,
        parent: object.parent!,
        position: object.position.clone(),
        quaternion: object.quaternion.clone(),
        scale: object.scale.clone(),
      }));
      this.parts.push({
        spec,
        index,
        box: new Box3(),
        centre: new Vector3(),
        hull: new Hull(),
        pivot,
        body: onStage(new RigidBody(new Float32Array(HULL_SIZE * 3), 1, [1, 1, 1])),
        homes,
        attached: true,
        cooldown: 0,
      });
    });
    const capacity = HULL_SIZE * (1 + this.parts.length);
    this.pointLocal = new Float32Array(capacity * 3);
    this.pointPart = new Int16Array(capacity);
    this.prevY = new Float32Array(capacity);
    this.armed = new Uint8Array(capacity);
    this.body = onStage(new RigidBody(new Float32Array(capacity * 3), config.mass, [1, 1, 1]));
    this.body.friction = config.friction ?? this.body.friction;
    this.refit();
  }

  /**
   * Measures the instrument and its parts again, as they are posed now. A
   * system that moves parts of its instrument about (a drum rig raised to
   * the player's height, say) calls this after doing so.
   */
  refit(): void {
    const root = this.root;
    root.updateMatrixWorld(true);
    const toRoot = this.inverse.copy(root.matrixWorld).invert();
    this.coreHull.reset();
    hullOf(root, this.coreHull, toRoot, this.owned);
    this.coreHull.finish(this.coreBox);
    const whole = this.wholeBox.copy(this.coreBox);
    for (const part of this.parts) {
      if (!part.attached) continue;
      part.hull.reset();
      for (const o of part.spec.objects) hullOf(o, part.hull, toRoot, null);
      part.hull.finish(part.box);
      whole.union(part.box);
    }
    const total = volume(whole);
    for (const part of this.parts) {
      if (!part.attached) continue;
      part.box.getCenter(part.centre);
      const { points, count } = part.hull;
      for (let i = 0; i < count * 3; i += 3) {
        part.body.points[i] = points[i] - part.centre.x;
        part.body.points[i + 1] = points[i + 1] - part.centre.y;
        part.body.points[i + 2] = points[i + 2] - part.centre.z;
      }
      part.body.pointCount = count;
      setMass(part.body, Math.max(0.05, (this.config.mass * volume(part.box)) / total), part.box);
    }
    whole.getCenter(this.centre);
    // With every part counted separately the core can be empty; it is then the whole's box.
    if (this.coreHull.count === 0) this.coreHull.fromBox(whole);
    setMass(this.body, this.config.mass, whole);
    this.rebuildPoints();
  }

  /** Whether part `index` (in config order) is still on the instrument. */
  isAttached(index: number): boolean {
    return this.parts[index].attached;
  }

  get wrecked(): boolean {
    return this.health <= 0;
  }

  /** True once after a repair, so the system can put the instrument back in place. */
  takeRepaired(): boolean {
    const was = this.repaired;
    this.repaired = false;
    return was;
  }

  /**
   * Runs every frame the instrument is out, after its system has posed it.
   * `hands` and `grips` are left then right.
   */
  update(dt: number, hands: readonly TrackedHand[], grips: readonly Object3D[], entity: Entity): void {
    if (entity.getValue(Smashable, 'repair')) {
      entity.setValue(Smashable, 'repair', false);
      this.repair();
    }
    if (dt > 0) {
      const smashable = entity.getValue(Smashable, 'smashable') ?? true;
      this.clock += dt;
      this.cooldown -= dt;
      this.clatter -= dt;
      if (this.held != null) this.updateHeld(dt);
      if (this.hold === SmashHold.Worn) this.kinematicStrikes(dt);
      if (this.held == null && smashable) this.updateGrab(dt, hands, grips);
      if (this.config.pushBox != null && smashable && this.hold !== SmashHold.Held) this.updatePush(dt, hands);
      if (this.hold === SmashHold.Thrown) this.updateLoose(dt);
      this.updateDebris(dt);
      this.updateReturn(dt, hands);
    }
    this.sync(entity);
  }

  /** Every part back on, health full, and back in play. */
  repair(): void {
    for (const part of this.parts) {
      if (part.attached) continue;
      for (const home of part.homes) {
        home.parent.add(home.object);
        home.object.position.copy(home.position);
        home.object.quaternion.copy(home.quaternion);
        home.object.scale.copy(home.scale);
      }
      part.pivot.removeFromParent();
      if (part.spec.vanish) for (const o of part.spec.objects) o.visible = true;
      part.attached = true;
    }
    this.loose.length = 0;
    this.letGo();
    this.hold = SmashHold.Worn;
    this.health = 1;
    this.impacts = 0;
    this.lastImpact = 0;
    this.piecesOff = 0;
    this.histCount = 0;
    this.rebuildPoints();
    this.repaired = true;
    this.version++;
  }

  private sync(entity: Entity): void {
    if (this.version === this.syncedVersion) return;
    this.syncedVersion = this.version;
    entity.setValue(Smashable, 'hold', this.hold);
    entity.setValue(
      Smashable,
      'condition',
      this.health <= 0 ? SmashCondition.Wrecked : this.health < 1 || this.piecesOff > 0 ? SmashCondition.Damaged : SmashCondition.Intact,
    );
    entity.setValue(Smashable, 'health', this.health);
    entity.setValue(Smashable, 'piecesOff', this.piecesOff);
    entity.setValue(Smashable, 'impacts', this.impacts);
    entity.setValue(Smashable, 'lastImpact', this.lastImpact);
  }

  private letGo(): void {
    this.holder = null;
    this.holderGrip = null;
    this.held = null;
    this.heldPart = null;
  }

  /** The contact points of the instrument and the parts still on it. */
  private rebuildPoints(): void {
    let n = 0;
    const add = (hull: Hull, part: number) => {
      for (let i = 0; i < hull.count; i++, n++) {
        for (let k = 0; k < 3; k++) {
          this.pointLocal[n * 3 + k] = hull.points[i * 3 + k];
          this.body.points[n * 3 + k] = hull.points[i * 3 + k] - this.centre.getComponent(k);
        }
        this.pointPart[n] = part;
      }
    };
    add(this.coreHull, -1);
    for (const part of this.parts) if (part.attached) add(part.hull, part.index);
    this.pointCount = n;
    this.body.pointCount = n;
    this.root.updateMatrixWorld(true);
    for (let i = 0; i < n; i++) {
      const y = this.tmp.fromArray(this.pointLocal, i * 3).applyMatrix4(this.root.matrixWorld).y - STAGE_FLOOR;
      this.prevY[i] = y;
      this.armed[i] = y > REARM_HEIGHT ? 1 : 0;
    }
  }

  /** The system posed it: any point that crossed the floor going down struck it. */
  private kinematicStrikes(dt: number): void {
    this.root.updateMatrixWorld(true);
    // The pose history is the held thing's while a hand holds a part of it.
    if (this.held == null) this.record(this.root);
    const struck = this.scanFloor(this.root.matrixWorld, dt);
    if (struck >= 0) this.strike(this.lastScan, this.pointPart[struck]);
  }

  private lastScan = 0;
  private lowest = 0;

  /**
   * Checks every contact point at `matrix` against the floor, returning the
   * one that struck it fastest (its speed in `lastScan`, the hit in `hit`)
   * or -1, and leaving the lowest point's height in `lowest`.
   */
  private scanFloor(matrix: Matrix4, dt: number): number {
    let fastest = 0;
    let struck = -1;
    this.lowest = 0;
    for (let i = 0; i < this.pointCount; i++) {
      const p = this.tmp.fromArray(this.pointLocal, i * 3).applyMatrix4(matrix);
      const y = p.y - STAGE_FLOOR;
      const down = (this.prevY[i] - y) / dt;
      if (this.armed[i] && y < 0 && down > fastest && down < TELEPORT_SPEED) {
        fastest = down;
        struck = i;
        this.hit.set(p.x, STAGE_FLOOR, p.z);
      }
      if (y < 0) this.armed[i] = 0;
      else if (y > REARM_HEIGHT) this.armed[i] = 1;
      this.prevY[i] = y;
      this.lowest = Math.min(this.lowest, y);
    }
    this.lastScan = fastest;
    return struck;
  }

  /** A fist kept on a grabbable part, or on the whole, for grabSeconds takes it. */
  private updateGrab(dt: number, hands: readonly TrackedHand[], grips: readonly Object3D[]): void {
    this.root.updateMatrixWorld(true);
    this.inverse.copy(this.root.matrixWorld).invert();
    for (let i = 0; i < hands.length && i < 2; i++) {
      const hand = hands[i];
      let target = NOTHING;
      const allowed = this.config.grabHands == null || this.config.grabHands.includes(i);
      if (allowed && hand.tracked && this.isFist(hand)) {
        const local = this.tmp2.copy(this.palm).applyMatrix4(this.inverse);
        for (const part of this.parts) {
          if (part.attached && part.spec.grabbable && near(part.box, local)) {
            target = part.index;
            break;
          }
        }
        if (target === NOTHING && this.config.grabWhole && this.health > 0 && this.hold !== SmashHold.Held && near(this.wholeBox, local)) {
          target = WHOLE;
        }
      }
      if (target !== this.grabTarget[i]) {
        this.grabTarget[i] = target;
        this.grabTime[i] = 0;
      } else if (target !== NOTHING) {
        this.grabTime[i] += dt;
        if (this.grabTime[i] >= (this.config.grabSeconds ?? 0.25)) {
          this.grabTarget[0] = this.grabTarget[1] = NOTHING;
          this.grab(hand, grips[i], target);
          return;
        }
      }
    }
  }

  private grab(hand: TrackedHand, grip: Object3D, target: number): void {
    if (target === WHOLE) {
      this.held = this.root;
      this.heldPart = null;
      this.hold = SmashHold.Held;
    } else {
      const part = this.parts[target];
      this.detach(part);
      this.held = part.pivot;
      this.heldPart = part;
    }
    this.version++;
    this.holder = hand;
    this.holderGrip = grip;
    this.lostTime = 0;
    this.histCount = 0;
    grip.updateWorldMatrix(true, false);
    this.held.updateMatrixWorld(true);
    this.offset.copy(grip.matrixWorld).invert().multiply(this.held.matrixWorld);
  }

  private updateHeld(dt: number): void {
    const hand = this.holder!;
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
    this.holderGrip!.updateWorldMatrix(true, false);
    this.desired.multiplyMatrices(this.holderGrip!.matrixWorld, this.offset);
    this.desired.decompose(held.position, held.quaternion, this.scale);
    if (held === this.root) {
      const struck = this.scanFloor(this.desired, dt);
      // The floor stops it even though the hand goes on.
      held.position.y -= this.lowest;
      held.updateMatrixWorld(true);
      if (struck >= 0) this.strike(this.lastScan, this.pointPart[struck]);
      if (this.held !== held) return;
    }
    held.updateMatrixWorld(true);
    this.record(held);
  }

  /** Opening the hand throws what it held at the speed it was moving. */
  private release(): void {
    this.throwVelocity(this.vel, this.spin);
    const part = this.heldPart;
    const held = this.held;
    this.letGo();
    if (part != null) this.launch(part, this.vel, this.spin, 0, null);
    else if (held === this.root) this.loosen(this.vel, this.spin);
  }

  /** The whole instrument comes loose, moving at v and spinning at w. */
  private loosen(v: Vector3, w: Vector3): void {
    const root = this.root;
    root.updateMatrixWorld(true);
    const c = this.tmp.copy(this.centre).applyMatrix4(root.matrixWorld);
    const q = root.quaternion;
    this.body.setPose(c.x, c.y, c.z, q.x, q.y, q.z, q.w);
    this.body.setVelocity(v.x, v.y, v.z, w.x, w.y, w.z);
    this.body.wake();
    this.cooldown = 0;
    if (this.hold !== SmashHold.Thrown) {
      this.hold = SmashHold.Thrown;
      this.version++;
    }
  }

  private updateLoose(dt: number): void {
    const body = this.body;
    if (body.asleep) return;
    body.step(dt);
    const root = this.root;
    root.quaternion.set(body.q[0], body.q[1], body.q[2], body.q[3]);
    const c = this.tmp.copy(this.centre).applyQuaternion(root.quaternion);
    root.position.set(body.p[0] - c.x, body.p[1] - c.y, body.p[2] - c.z);
    root.updateMatrixWorld(true);
    if (body.impactPoint < 0 || body.impactSpeed < 0.3 || this.cooldown > 0) return;
    this.cooldown = IMPACT_COOLDOWN;
    this.hit.fromArray(this.pointLocal, body.impactPoint * 3).applyMatrix4(root.matrixWorld);
    this.hit.y = STAGE_FLOOR;
    this.strike(body.impactSpeed, this.pointPart[body.impactPoint]);
  }

  /** A hit at `speed` m/s by `part` (-1 the instrument itself), struck at `hit`. */
  private strike(speed: number, part: number): void {
    const tap = this.config.tap ?? 1.2;
    if (speed < tap || this.health <= 0) {
      this.config.sound(speed, part, false);
      return;
    }
    this.impacts++;
    this.lastImpact = speed;
    this.health = Math.max(0, this.health - (speed - tap) * this.config.wear);
    this.version++;
    let broke = false;
    this.rootMotion(this.vel, this.spin);
    this.root.updateMatrixWorld(true);
    const centre = this.world.copy(this.centre).applyMatrix4(this.root.matrixWorld);
    for (const p of this.parts) {
      if (!p.attached || (p.spec.breakAt < this.health && this.health > 0)) continue;
      if (p.spec.vanish) this.vanish(p);
      else this.launch(p, this.vel, this.spin, speed, centre);
      broke = true;
    }
    this.config.sound(speed, part, broke);
    if (this.health > 0) return;
    // Wrecked: whatever is left comes loose, out of the hand or the system's hold.
    if (this.held === this.root) this.letGo();
    if (this.hold !== SmashHold.Thrown) this.loosen(this.vel, this.spin);
  }

  /** How the instrument is moving: from its recent poses, or from the simulation once loose. */
  private rootMotion(v: Vector3, w: Vector3): void {
    if (this.hold === SmashHold.Thrown) {
      v.set(this.body.v[0], this.body.v[1], this.body.v[2]);
      w.set(this.body.w[0], this.body.w[1], this.body.w[2]);
    } else if (this.held === this.root || this.hold === SmashHold.Worn) {
      this.throwVelocity(v, w);
    } else {
      v.set(0, 0, 0);
      w.set(0, 0, 0);
    }
  }

  /** A part that snaps and is gone. */
  private vanish(part: Part): void {
    for (const o of part.spec.objects) o.visible = false;
    part.attached = false;
    this.piecesOff++;
    this.version++;
    this.rebuildPoints();
  }

  /** Takes a part off the instrument into world space, where it simulates on its own. */
  private detach(part: Part): void {
    if (!part.attached) return;
    // Measured as it is now, in case the system has moved it since.
    this.refit();
    const root = this.root;
    const pivot = part.pivot;
    pivot.position.copy(part.centre).applyMatrix4(root.matrixWorld);
    root.getWorldQuaternion(pivot.quaternion);
    pivot.scale.set(1, 1, 1);
    this.debrisRoot.add(pivot);
    pivot.updateMatrixWorld(true);
    for (const home of part.homes) pivot.attach(home.object);
    part.body.setPose(pivot.position.x, pivot.position.y, pivot.position.z, pivot.quaternion.x, pivot.quaternion.y, pivot.quaternion.z, pivot.quaternion.w);
    part.attached = false;
    this.piecesOff++;
    this.version++;
    this.rebuildPoints();
  }

  /**
   * Sends a part off on its own, carried by the instrument's motion
   * (velocity `v` at `centre`, spinning at `w`). Knocked off by a hit of
   * `kick` m/s, it also bounces up and away from where it hit.
   */
  private launch(part: Part, v: Vector3, w: Vector3, kick: number, centre: Vector3 | null): void {
    this.detach(part);
    // From wherever it is now: a part thrown from the hand has moved since it came off.
    const p = part.pivot.position;
    const q = part.pivot.quaternion;
    part.body.setPose(p.x, p.y, p.z, q.x, q.y, q.z, q.w);
    const arm = this.tmp2.set(0, 0, 0);
    if (centre != null) arm.subVectors(p, centre);
    const u = this.tmp.copy(w).cross(arm).add(v);
    let uy = u.y;
    let ux = u.x;
    let uz = u.z;
    let wx = w.x;
    let wy = w.y;
    let wz = w.z;
    if (kick > 0) {
      let ax = p.x - this.hit.x;
      let az = p.z - this.hit.z;
      const d = Math.hypot(ax, az);
      if (d < 1e-4) {
        const angle = Math.random() * Math.PI * 2;
        ax = Math.cos(angle);
        az = Math.sin(angle);
      } else {
        ax /= d;
        az /= d;
      }
      const out = kick * (0.08 + 0.2 * Math.random());
      ux += ax * out;
      uz += az * out;
      uy = Math.abs(uy) * 0.25 + kick * (0.12 + 0.2 * Math.random());
      wx += (Math.random() - 0.5) * kick * 3;
      wy += (Math.random() - 0.5) * kick * 3;
      wz += (Math.random() - 0.5) * kick * 3;
    }
    part.body.setVelocity(ux, uy, uz, wx, wy, wz);
    part.body.wake();
    if (!this.loose.includes(part)) this.loose.push(part);
  }

  private updateDebris(dt: number): void {
    for (let i = 0; i < this.loose.length; i++) {
      const part = this.loose[i];
      const b = part.body;
      part.cooldown -= dt;
      if (b.asleep) continue;
      b.step(dt);
      part.pivot.position.set(b.p[0], b.p[1], b.p[2]);
      part.pivot.quaternion.set(b.q[0], b.q[1], b.q[2], b.q[3]);
      if (b.impactSpeed > 1 && part.cooldown <= 0 && this.clatter <= 0) {
        this.config.sound(b.impactSpeed, part.index, false);
        part.cooldown = IMPACT_COOLDOWN;
        this.clatter = CLATTER_INTERVAL;
      }
    }
  }

  /** Both hands pinched for a second, while it is out of play, puts it back together. */
  private updateReturn(dt: number, hands: readonly TrackedHand[]): void {
    const pinching =
      this.hold !== SmashHold.Worn &&
      this.held == null &&
      hands.length >= 2 &&
      hands[0].tracked &&
      hands[1].tracked &&
      hands[0].pinchDistance() < PINCH_DISTANCE &&
      hands[1].pinchDistance() < PINCH_DISTANCE;
    this.returnTime = pinching ? this.returnTime + dt : 0;
    if (this.returnTime >= RETURN_SECONDS) {
      this.returnTime = 0;
      this.repair();
    }
  }

  /**
   * A palm moving into the push box shoves the instrument there, at the
   * hand's speed: low it slides, high it tips over.
   */
  private updatePush(dt: number, hands: readonly TrackedHand[]): void {
    const box = this.config.pushBox!;
    this.root.updateMatrixWorld(true);
    this.inverse.copy(this.root.matrixWorld).invert();
    for (let i = 0; i < hands.length && i < 2; i++) {
      const hand = hands[i];
      if (!hand.tracked) {
        this.pushValid[i] = false;
        continue;
      }
      const palm = this.palmOf(hand);
      const prev = this.pushPalm[i];
      const wasValid = this.pushValid[i];
      this.vel.subVectors(palm, prev).divideScalar(dt);
      prev.copy(palm);
      this.pushValid[i] = true;
      if (!wasValid) continue;
      const l = this.tmp2.copy(palm).applyMatrix4(this.inverse);
      if (l.x < box[0] || l.y < box[1] || l.z < box[2] || l.x > box[3] || l.y > box[4] || l.z > box[5]) continue;
      // Out through the nearest face.
      let best = l.x - box[0];
      let axis = 0;
      let sign = -1;
      const faces = [box[3] - l.x, l.y - box[1], box[4] - l.y, l.z - box[2], box[5] - l.z];
      for (let f = 0; f < faces.length; f++) {
        if (faces[f] < best) {
          best = faces[f];
          axis = (f + 1) >> 1;
          sign = f % 2 === 0 ? 1 : -1;
        }
      }
      const n = this.tmp.set(0, 0, 0).setComponent(axis, sign).transformDirection(this.root.matrixWorld);
      const speed = -this.vel.dot(n);
      if (speed < PUSH_MIN_SPEED || this.vel.length() > PUSH_MAX_SPEED) continue;
      if (this.hold === SmashHold.Worn) this.loosen(this.vel.set(0, 0, 0), this.spin.set(0, 0, 0));
      if (this.hold !== SmashHold.Thrown) continue;
      this.body.push(palm.x, palm.y, palm.z, -n.x, -n.y, -n.z, speed);
    }
  }

  /** Remembers where the held or played object's centre was, to throw it at its speed. */
  private record(object: Object3D): void {
    const k = this.histHead;
    const c = this.tmp;
    if (object === this.root) c.copy(this.centre).applyMatrix4(object.matrixWorld);
    else c.copy(object.position);
    c.toArray(this.histPos, k * 3);
    object.quaternion.toArray(this.histQuat, k * 4);
    this.histTime[k] = this.clock;
    this.histHead = (k + 1) % HISTORY;
    this.histCount = Math.min(HISTORY, this.histCount + 1);
  }

  /** Linear and angular velocity over the last THROW_WINDOW of recorded poses. */
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

  /** Midway between the wrist and the middle knuckle, into `palm`. */
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
}

const meshMatrix = new Matrix4();

/**
 * 98 directions, spread round the sphere: every (x, y, z) with components
 * from -2 to 2, less those pointing the same way as another. Between two of
 * them a round coil is under-reached by under 3% of its radius.
 */
const HULL_DIRECTIONS: number[] = [];
for (let x = -2; x <= 2; x++)
  for (let y = -2; y <= 2; y++)
    for (let z = -2; z <= 2; z++) {
      if (x === 0 && y === 0 && z === 0) continue;
      // (2, 2, 0) points as (1, 1, 0) does: keep only the smallest of each.
      if (x % 2 === 0 && y % 2 === 0 && z % 2 === 0) continue;
      const len = Math.hypot(x, y, z);
      HULL_DIRECTIONS.push(x / len, y / len, z / len);
    }
const HULL_SIZE = HULL_DIRECTIONS.length / 3;

/**
 * The furthest point of a shape in each of HULL_SIZE directions: a few
 * points that hug it, so a round bell rests on its rim rather than on the
 * corner of a box drawn round it. A box keeps just its 8 corners.
 */
class Hull {
  readonly points = new Float32Array(HULL_SIZE * 3);
  count = 0;
  private readonly best = new Float64Array(HULL_SIZE);

  reset(): void {
    this.best.fill(-Infinity);
    this.count = 0;
  }

  add(x: number, y: number, z: number): void {
    for (let d = 0; d < HULL_SIZE; d++) {
      const reach = HULL_DIRECTIONS[d * 3] * x + HULL_DIRECTIONS[d * 3 + 1] * y + HULL_DIRECTIONS[d * 3 + 2] * z;
      if (reach <= this.best[d]) continue;
      this.best[d] = reach;
      this.points[d * 3] = x;
      this.points[d * 3 + 1] = y;
      this.points[d * 3 + 2] = z;
    }
  }

  /** Packs the points found, dropping repeats, and sets `box` round them. */
  finish(box: Box3): void {
    box.makeEmpty();
    let n = 0;
    const p = this.points;
    for (let d = 0; d < HULL_SIZE; d++) {
      if (this.best[d] === -Infinity) continue;
      const x = p[d * 3];
      const y = p[d * 3 + 1];
      const z = p[d * 3 + 2];
      let seen = false;
      for (let i = 0; i < n && !seen; i++) seen = p[i * 3] === x && p[i * 3 + 1] === y && p[i * 3 + 2] === z;
      if (seen) continue;
      p[n * 3] = x;
      p[n * 3 + 1] = y;
      p[n * 3 + 2] = z;
      box.expandByPoint(meshBoxPoint.set(x, y, z));
      n++;
    }
    this.count = n;
  }

  /** The corners of `box`, for something with no shape of its own. */
  fromBox(box: Box3): void {
    let i = 0;
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          this.points[i++] = x;
          this.points[i++] = y;
          this.points[i++] = z;
        }
    this.count = 8;
  }
}

const meshBoxPoint = new Vector3();

/**
 * Adds every vertex of every mesh under `object` (skipping `skip`) to
 * `hull`, in the space `toRoot` maps into. Hidden helpers under it (a glow,
 * a fingertip shadow) can be parked anywhere, so they do not count;
 * `object` itself counts hidden or not, since a put-away instrument is
 * still measured.
 */
function hullOf(object: Object3D, hull: Hull, toRoot: Matrix4, skip: Set<Object3D> | null, top = true): void {
  if (skip?.has(object) || (!top && !object.visible)) return;
  const mesh = object as Mesh;
  if (mesh.isMesh) {
    const e = meshMatrix.multiplyMatrices(toRoot, mesh.matrixWorld).elements;
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      hull.add(
        e[0] * x + e[4] * y + e[8] * z + e[12],
        e[1] * x + e[5] * y + e[9] * z + e[13],
        e[2] * x + e[6] * y + e[10] * z + e[14],
      );
    }
  }
  for (const child of object.children) hullOf(child, hull, toRoot, skip, false);
}

function onStage(body: RigidBody): RigidBody {
  body.floor = STAGE_FLOOR;
  return body;
}

function volume(box: Box3): number {
  const s = box.getSize(boxSize);
  return Math.max(1e-6, s.x * s.y * s.z);
}

const boxSize = new Vector3();

/** Gives `body` the mass, and the inertia of a solid box filling `box`, kept off zero for flat parts. */
function setMass(body: RigidBody, mass: number, box: Box3): void {
  const s = box.getSize(boxSize);
  const x = Math.max(s.x, 0.01);
  const y = Math.max(s.y, 0.01);
  const z = Math.max(s.z, 0.01);
  body.invMass = 1 / mass;
  body.invInertia[0] = 12 / (mass * (y * y + z * z));
  body.invInertia[1] = 12 / (mass * (x * x + z * z));
  body.invInertia[2] = 12 / (mass * (x * x + y * y));
}

function near(box: Box3, p: Vector3): boolean {
  return (
    p.x > box.min.x - GRAB_MARGIN &&
    p.y > box.min.y - GRAB_MARGIN &&
    p.z > box.min.z - GRAB_MARGIN &&
    p.x < box.max.x + GRAB_MARGIN &&
    p.y < box.max.y + GRAB_MARGIN &&
    p.z < box.max.z + GRAB_MARGIN
  );
}
