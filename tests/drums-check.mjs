/**
 * Checks the drum performer offline: the planned stick tips for the whole
 * part go through the app's own stroke detector, as the app reads a real
 * pair of hands, at steady and uneven frame rates, and every stroke is
 * scored as the live performance scores it. Runs in the page (loaded
 * through Vite) without touching the headset:
 *
 *   npx iwsdk dev up --allow-browser-automation
 *   npm run check:drums
 */

export default async function run({ frame }) {
  return frame.evaluate(async () => {
    const { WILLIAM_TELL_DRUMS } = await import('/tests/songs/william-tell.js');
    const { planPerformance, sticksAt, scoreStrokes, SNARE } = await import('/tests/drums-performer.js');
    const { StrokeDetector } = await import('/src/drums/strokes.ts');

    const plan = planPerformance(WILLIAM_TELL_DRUMS);
    const at = sticksAt(plan);
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
      const det = new StrokeDetector(SNARE);
      const heard = [];
      for (let t = 0; t < plan.end; ) {
        const dt = step();
        t += dt;
        const sticks = at(t);
        ['left', 'right'].forEach((side, i) => {
          const s = det.update(i, sticks[side].tip, dt);
          if (s) heard.push({ t, hit: s.articulation, loudness: s.loudness });
        });
      }
      const { report, extra } = scoreStrokes(plan, heard);
      results[name] = {
        right: report.filter((r) => r.ok).length,
        of: report.length,
        extra,
        wrong: report.filter((r) => !r.ok).slice(0, 8),
      };
    }
    return { tightestGap: plan.tightestGap, fastestGlide: plan.fastestGlide, results };
  });
}
