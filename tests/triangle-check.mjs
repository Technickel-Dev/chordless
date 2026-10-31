/**
 * Checks the triangle performer offline: the planned beater for the whole
 * part goes through the app's own strike detection, as the app reads a real
 * pair of hands, at steady and uneven frame rates, and every strike is
 * scored as the live performance scores it. Runs in the page (loaded
 * through Vite) without touching the headset:
 *
 *   npx iwsdk dev up --allow-browser-automation
 *   npm run check:triangle
 */

export default async function run({ frame }) {
  return frame.evaluate(async () => {
    const { WILLIAM_TELL_TRIANGLE } = await import('/tests/songs/william-tell.js');
    const { planPerformance, beaterAt, rodEnds, scoreStrikes } = await import('/tests/triangle-performer.js');
    const { StrikeDetector } = await import('/src/triangle/strike.ts');
    const { SIDE_NAMES } = await import('/src/triangle/geometry.ts');

    const plan = planPerformance(WILLIAM_TELL_TRIANGLE);
    const at = beaterAt(plan);
    let seed = 1;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const PATTERNS = {
      '90 Hz': () => 1 / 90,
      '72 Hz': () => 1 / 72,
      '60 Hz uneven': () => (random() < 0.35 ? 0.0208 : 1 / 60),
      busy: () => 1 / 60 + random() * 0.0173,
    };

    const results = {};
    for (const [name, step] of Object.entries(PATTERNS)) {
      const det = new StrikeDetector();
      const heard = [];
      const damps = [];
      let damped = false;
      for (let t = 0; t < plan.end; ) {
        const dt = step();
        t += dt;
        const { butt, tip } = rodEnds(at(t));
        det.update(butt, tip, dt);
        if (det.struck) heard.push({ t, loudness: det.loudness, side: SIDE_NAMES[det.side] });
        if (det.damping && !damped) damps.push({ t });
        damped = det.damping;
      }
      const { report, extra, extraDamps } = scoreStrikes(plan, heard, damps);
      results[name] = {
        right: report.filter((r) => r.ok).length,
        of: report.length,
        extra,
        extraDamps,
        wrong: report.filter((r) => !r.ok),
        roll: report.at(-1),
      };
    }
    return { results, strikes: plan.strikes.length, rollStrokes: plan.roll?.contacts.length };
  });
}
