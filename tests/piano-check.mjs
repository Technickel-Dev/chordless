/**
 * Checks the piano performer offline: the planned fingertips for the whole
 * part go through the app's own key-press detection, as the app reads a
 * real pair of hands, at steady and uneven frame rates, and every strike is
 * scored as the live performance scores it. Runs in the page (loaded
 * through Vite) without touching the headset:
 *
 *   npx iwsdk dev up --allow-browser-automation
 *   npm run check:piano
 */

export default async function run({ frame }) {
  return frame.evaluate(async () => {
    const { WILLIAM_TELL_PIANO } = await import('/tests/songs/william-tell.js');
    const { planPerformance, tipsAt, scoreStrikes } = await import('/tests/piano-performer.js');
    const { Keyboard, TIP_COUNT } = await import('/src/piano/keys.ts');

    const plan = planPerformance(WILLIAM_TELL_PIANO);
    const at = tipsAt(plan);
    let seed = 1;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const PATTERNS = {
      '90 Hz': () => 1 / 90,
      '72 Hz': () => 1 / 72,
      '60 Hz uneven': () => (random() < 0.35 ? 0.0208 : 1 / 60),
      busy: () => 1 / 60 + random() * 0.0173,
    };
    // Only the index tips (1 and 6) play; the other fingers are curled well above the keys.
    const tips = new Float32Array(TIP_COUNT * 3);
    for (let i = 0; i < TIP_COUNT; i++) tips.set([0, 0.3, 0.1], i * 3);
    const tracked = Array(TIP_COUNT).fill(true);

    const results = {};
    for (const [name, step] of Object.entries(PATTERNS)) {
      const kb = new Keyboard();
      const heard = [];
      for (let t = 0; t < plan.end; ) {
        const dt = step();
        t += dt;
        const p = at(t);
        tips.set(p.left, 3);
        tips.set(p.right, 6 * 3);
        kb.update(tips, tracked, dt);
        for (let i = 0; i < kb.struckCount; i++) heard.push({ t, midi: kb.struck[i].midi, velocity: kb.struck[i].velocity });
      }
      const { report, extra } = scoreStrikes(plan, heard);
      results[name] = {
        right: report.filter((r) => r.ok).length,
        of: report.length,
        extra,
        stuck: Array.from(kb.down).filter(Boolean).length,
        missed: report.filter((r) => r.heard == null).length,
        offVelocity: report.filter((r) => r.heard != null && !r.ok).length,
        byDynamic: Object.fromEntries(['pp', 'p', 'mp', 'mf', 'f', 'ff'].map((d) => [d, report.filter((r) => r.dynamic === d && !r.ok).length + '/' + report.filter((r) => r.dynamic === d).length])),
        wrong: report.filter((r) => !r.ok).slice(0, 8),
      };
    }
    return { results, seconds: Math.round(plan.end * 10) / 10 };
  });
}
