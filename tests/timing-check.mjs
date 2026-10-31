/**
 * Checks that the performer's hands play every note right however the
 * browser's frames fall. The app's own fret reader and pluck detector are
 * fed the posed hands at several frame patterns (steady and uneven), as the
 * app samples a real hand, and each note heard is scored against the song.
 * Runs in the page (loaded through Vite) without touching the headset.
 *
 *   npx iwsdk dev up --allow-browser-automation
 *   npm run check:timing
 */

export default async function run({ frame }) {
  return frame.evaluate(async () => {
    const { WILLIAM_TELL } = await import('/tests/songs/william-tell.js');
    const { planPerformance, handsFor } = await import('/tests/performer.js');
    const { FretReader, PRESS } = await import('/src/guitar/fretting.ts');
    const { PluckDetector } = await import('/src/guitar/pluck-detector.ts');
    const { GUITAR, OPEN_MIDI } = await import('/src/guitar/geometry.ts');
    const { midiName, recognizeChord } = await import('/src/guitar/chords.ts');

    const plan = planPerformance(WILLIAM_TELL);
    /** Frame lengths in seconds, by pattern; each is repeated (or drawn) for the whole song. */
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const PATTERNS = {
      '90 Hz': () => 1 / 90,
      '72 Hz': () => 1 / 72,
      '60 Hz': () => 1 / 60,
      // What the managed browser does: mostly 60 Hz, often a frame of 21 ms.
      '60 Hz uneven': () => (random() < 0.35 ? 0.0208 : 1 / 60),
      // A busy browser: frames of 16-34 ms.
      'busy': () => 1 / 60 + random() * 0.0173,
    };

    // The fingertip segments the app samples for fretting (see updateFretting).
    const CHAINS = ['index', 'middle', 'ring', 'pinky'].map((f) =>
      ['tip', 'phalanx-distal', 'phalanx-intermediate', 'phalanx-proximal'].map((n) => `${f}-finger-${n}`),
    );
    const PAD_FRACTION = 0.5;
    const SAMPLE_SPACING = 0.006;
    const fret = (reader, joints) => {
      reader.begin();
      for (const chain of CHAINS) {
        for (let k = 0; k < chain.length - 1; k++) {
          const a = joints[chain[k]].position;
          const b = joints[chain[k + 1]].position;
          const flat = a[2] - GUITAR.stringZ <= PRESS.above && b[2] - GUITAR.stringZ <= PRESS.above;
          if (k > 0 && !flat) break;
          const reach = flat ? 1 : PAD_FRACTION;
          const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
          const n = Math.max(1, Math.min(8, Math.ceil((len * reach) / SAMPLE_SPACING)));
          for (let i = 0; i <= n; i++) {
            const t = (i / n) * reach;
            reader.addPoint(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
          }
        }
      }
    };

    const results = {};
    for (const [name, step] of Object.entries(PATTERNS)) {
      seed = 1;
      const handsAt = handsFor(plan);
      const reader = new FretReader();
      const plucker = new PluckDetector();
      const heard = [];
      let t = 0;
      while (t < plan.end) {
        const dt = step();
        t += dt;
        const hands = handsAt(t, dt);
        fret(reader, hands.left);
        reader.commit(dt, true);
        const tip = hands.right['index-finger-tip'].position;
        const count = plucker.update(tip[0], tip[1], tip[2], dt);
        for (let i = 0; i < count; i++) {
          const e = plucker.events[i];
          heard.push({ at: t + e.delay, string: e.string, midi: OPEN_MIDI[e.string] + reader.frets[e.string] });
        }
      }
      // Score as the live performance does: each note takes the earliest
      // unclaimed pluck shortly after it.
      const claimed = new Set();
      const wrong = [];
      const late = [];
      for (const n of plan.notes) {
        if (n.chord) {
          const strum = heard.filter((h) => h.at > n.time - 0.1 && h.at < n.time + 0.3);
          strum.forEach((h) => claimed.add(heard.indexOf(h)));
          const chord = recognizeChord(strum.map((h) => h.midi));
          if (chord !== n.chord) wrong.push(`${n.beat} ${n.chord} chord: heard ${chord}`);
          continue;
        }
        const i = heard.findIndex((h, j) => !claimed.has(j) && h.at > n.time - 0.04 && h.at < n.time + 0.16);
        const want = midiName(OPEN_MIDI[n.string] + n.fret);
        if (i < 0) {
          wrong.push(`${n.beat} ${want}: missed`);
          continue;
        }
        claimed.add(i);
        late.push((heard[i].at - n.time) * 1000);
        if (midiName(heard[i].midi) !== want) wrong.push(`${n.beat} ${want}: heard ${midiName(heard[i].midi)}`);
      }
      const extra = heard.filter((_, j) => !claimed.has(j)).map((h) => `${h.at.toFixed(2)}s ${midiName(h.midi)}`);
      late.sort((a, b) => a - b);
      results[name] = {
        right: plan.notes.length - wrong.length,
        of: plan.notes.length,
        extra,
        wrong,
        lateMs: { min: Math.round(late[0]), median: Math.round(late[late.length >> 1]), max: Math.round(late.at(-1)) },
      };
    }
    return results;
  });
}
