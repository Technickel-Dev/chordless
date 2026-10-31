/**
 * Checks the cymbal performer offline: the planned plates for the whole
 * part go through the app's own clash detector and chest damping, as the
 * app reads a real pair of hands, at steady and uneven frame rates, and
 * every clash is scored as the live performance scores it. Runs in the page
 * (loaded through Vite) without touching the headset:
 *
 *   npx iwsdk dev up --allow-browser-automation
 *   npm run check:cymbals
 */

export default async function run({ frame }) {
  return frame.evaluate(async () => {
    const { WILLIAM_TELL_CYMBALS } = await import('/tests/songs/william-tell.js');
    const { planPerformance, cymbalsAt, scoreClashes, CHEST_AT } = await import('/tests/cymbals-performer.js');
    const { CHEST, ClashDetector, createCymbalPose, touchesSphere } = await import('/src/cymbals/clash.ts');

    const plan = planPerformance(WILLIAM_TELL_CYMBALS);
    const at = cymbalsAt(plan);
    let seed = 1;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const PATTERNS = {
      '90 Hz': () => 1 / 90,
      '72 Hz': () => 1 / 72,
      '60 Hz uneven': () => (random() < 0.35 ? 0.0208 : 1 / 60),
      busy: () => 1 / 60 + random() * 0.0173,
    };
    const toPose = (src, out) => {
      out.center = [...src.c];
      out.normal = [...src.n];
      return out;
    };

    const results = {};
    for (const [name, step] of Object.entries(PATTERNS)) {
      const det = new ClashDetector();
      const left = createCymbalPose();
      const right = createCymbalPose();
      const heard = [];
      const damps = [];
      let lastDamp = -1;
      for (let t = 0; t < plan.end; ) {
        const dt = step();
        t += dt;
        const p = at(t);
        det.update(toPose(p.left, left), toPose(p.right, right), dt);
        if (det.clashed) heard.push({ t, loudness: det.loudness, flush: det.flush });
        const damping = det.damping || touchesSphere(left, CHEST_AT, CHEST.radius) || touchesSphere(right, CHEST_AT, CHEST.radius);
        if (damping) {
          if (t - lastDamp > 0.1) damps.push({ t });
          lastDamp = t;
        }
      }
      const { report, extra, extraDamps } = scoreClashes(plan, heard, damps);
      results[name] = {
        right: report.filter((r) => r.ok).length,
        of: report.length,
        extra,
        damps: damps.length,
        extraDamps,
        wrong: report.filter((r) => !r.ok),
      };
    }
    return {
      results,
      clashes: plan.clashes.map((k) => `${k.beat}:${k.dynamic}@${Math.round(k.speed * 100) / 100}m/s`).join(' '),
    };
  });
}
