import { Object3D, Vector3 } from '@iwsdk/core';

/** WebXR hand joint indices (XRHand iteration order). */
export const JOINT = {
  wrist: 0,
  thumbTip: 4,
  indexProximal: 6,
  indexIntermediate: 7,
  indexDistal: 8,
  indexTip: 9,
  middleDistal: 13,
  middleTip: 14,
  ringDistal: 18,
  ringTip: 19,
  pinkyDistal: 23,
  pinkyTip: 24,
} as const;

export const JOINT_COUNT = 25;

/** The part of IWSDK's XRHandVisualAdapter this module reads. */
export interface HandJointSource {
  readonly connected: boolean;
  jointTransforms?: Float32Array;
}

/**
 * World-space joint positions for one tracked hand. IWSDK's hand adapter
 * fills `jointTransforms` every frame relative to the hand's grip space, so
 * each joint is the grip's world matrix times the joint's matrix.
 */
export class TrackedHand {
  /** xyz per joint, world space. */
  readonly positions = new Float32Array(JOINT_COUNT * 3);
  tracked = false;

  update(source: HandJointSource | undefined, grip: Object3D): boolean {
    const transforms = source?.connected ? source.jointTransforms : undefined;
    if (transforms == null || transforms.length < JOINT_COUNT * 16) {
      this.tracked = false;
      return false;
    }
    grip.updateWorldMatrix(true, false);
    const world = grip.matrixWorld.elements;
    for (let j = 0; j < JOINT_COUNT; j++) {
      // Translation column of the joint's column-major matrix, transformed
      // by the grip matrix.
      const x = transforms[j * 16 + 12];
      const y = transforms[j * 16 + 13];
      const z = transforms[j * 16 + 14];
      this.positions[j * 3] = world[0] * x + world[4] * y + world[8] * z + world[12];
      this.positions[j * 3 + 1] = world[1] * x + world[5] * y + world[9] * z + world[13];
      this.positions[j * 3 + 2] = world[2] * x + world[6] * y + world[10] * z + world[14];
    }
    this.tracked = true;
    return true;
  }

  get(joint: number, out: Vector3): Vector3 {
    return out.fromArray(this.positions, joint * 3);
  }

  /** Thumb-to-index tip distance, in metres. */
  pinchDistance(): number {
    const p = this.positions;
    const a = JOINT.thumbTip * 3;
    const b = JOINT.indexTip * 3;
    return Math.hypot(p[a] - p[b], p[a + 1] - p[b + 1], p[a + 2] - p[b + 2]);
  }
}
