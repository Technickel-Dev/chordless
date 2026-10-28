/**
 * Checks that the performer's hands stay anatomically plausible through a
 * whole song: bones keep their lengths, fingers do not pass through each
 * other, and joints bend only within human limits. Poses are computed in
 * the page (loaded through Vite) without touching the emulated headset.
 *
 *   npx iwsdk dev up --allow-browser-automation
 *   npm run check:hands
 */

export default async function run({ frame }) {
  return frame.evaluate(async () => {
    const { WILLIAM_TELL } = await import('/tests/songs/william-tell.js');
    const { planPerformance, handsFor } = await import('/tests/performer.js');
    const { measureHand } = await import('/tests/hand-rig.js');

    const plan = planPerformance(WILLIAM_TELL);
    const handsAt = handsFor(plan);
    const dt = 1 / 90;
    const worst = {};
    const tally = { frames: 0, overlaps: 0, badAngles: 0 };
    // Stretches of time where two fingers overlap, for finding causes.
    const episodes = [];
    const open = {};
    /** Finger centrelines closer than this overlap (fingers are ~16 mm thick). */
    const TOUCH = 0.012;
    for (let t = 0; t < plan.end; t += dt) {
      const hands = handsAt(t, dt);
      tally.frames++;
      for (const side of ['left', 'right']) {
        const m = measureHand(hands[side]);
        const w = (worst[side] ??= { boneErrorMm: 0, closestMm: Infinity, worstAngleDeg: 0 });
        w.boneErrorMm = Math.max(w.boneErrorMm, m.boneError * 1000);
        if (m.closest * 1000 < w.closestMm) {
          w.closestMm = m.closest * 1000;
          w.closestPair = m.pair;
          w.closestAt = +t.toFixed(2);
        }
        if (m.worstAngle > w.worstAngleDeg) {
          w.worstAngleDeg = m.worstAngle;
          w.worstAngleFinger = m.worstJoint;
          w.worstAngleAt = +t.toFixed(2);
        }
        if (m.closest < TOUCH) {
          tally.overlaps++;
          const key = side + ':' + m.pair;
          if (!open[key]) episodes.push((open[key] = { hand: side, pair: m.pair, from: +t.toFixed(2), to: 0, closestMm: 99 }));
          open[key].to = +t.toFixed(2);
          open[key].closestMm = Math.min(open[key].closestMm, +(m.closest * 1000).toFixed(1));
        } else {
          for (const k of Object.keys(open)) if (k.startsWith(side + ':')) delete open[k];
        }
        if (m.worstAngle > 2) tally.badAngles++;
      }
    }
    for (const w of Object.values(worst)) {
      w.boneErrorMm = +w.boneErrorMm.toFixed(2);
      w.closestMm = +w.closestMm.toFixed(1);
      w.worstAngleDeg = +w.worstAngleDeg.toFixed(1);
    }
    return { ...tally, worst, episodes: episodes.sort((a, b) => b.to - b.from - (a.to - a.from)).slice(0, 12) };
  });
}
