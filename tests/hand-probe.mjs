export default async function run({ frame }) {
  return frame.evaluate(() => {
    const h = window.IWER_DEVICE.hands.left;
    const sym = Object.getOwnPropertySymbols(h).find((s) => h[s] && h[s].poses);
    const internal = h[sym];
    const p = internal.poses.point;
    const fmt = (m) => Array.from(m).map((v) => +v.toFixed(3));
    const rightSame = window.IWER_DEVICE.hands.right[Object.getOwnPropertySymbols(window.IWER_DEVICE.hands.right).find((s) => window.IWER_DEVICE.hands.right[s]?.poses)].poses.point === p;
    return {
      sym: String(sym),
      poseIds: Object.keys(internal.poses).length,
      joints: Object.keys(p.jointTransforms).length,
      wrist: fmt(p.jointTransforms.wrist.offsetMatrix),
      indexTip: fmt(p.jointTransforms['index-finger-tip'].offsetMatrix),
      thumbTip: fmt(p.jointTransforms['thumb-tip'].offsetMatrix),
      radiusTip: p.jointTransforms['index-finger-tip'].radius,
      grip: p.gripOffsetMatrix ? fmt(p.gripOffsetMatrix) : null,
      rightSharesPoseObject: rightSame,
    };
  });
}
