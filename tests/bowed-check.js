/**
 * Checks a bowed instrument's performer offline (see violin-check.mjs and
 * cello-check.mjs): the posed hands for a whole song go
 * through the app's own stopping reader and bow contact, as the app reads a
 * real pair of hands, at steady and uneven frame rates, and every note is
 * scored as the live performance scores it. Runs in the page (loaded
 * through Vite) without touching the headset.
 */

/** Runs the check for one instrument: { song, performer, geometry, bow } as [module, export] (performer: its module). */
export async function runBowedCheck({ frame }, instrument) {
  return frame.evaluate(async (I) => {
    const song = (await import(I.song[0]))[I.song[1]];
    const { planPerformance, handsFor, scoreNotes } = await import(I.performer);
    const geo = (await import(I.geometry[0]))[I.geometry[1]];
    const bowSpec = (await import(I.bow[0]))[I.bow[1]];
    const { StopReader } = await import('/src/violin/stopping.ts');
    const { BowContact, bowPose, bowedAmplitude, createBowPose } = await import('/src/violin/bow.ts');
    const { OPEN_MIDI, stringZ } = geo;
    const { PRESS } = await import('/src/guitar/fretting.ts');

    const plan = planPerformance(song);
    let seed = 1;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const PATTERNS = {
      '90 Hz': () => 1 / 90,
      '72 Hz': () => 1 / 72,
      '60 Hz uneven': () => (random() < 0.35 ? 0.0208 : 1 / 60),
      busy: () => 1 / 60 + random() * 0.0173,
    };

    // The finger segments the app samples for stopping (see updateStops).
    const CHAINS = ['index', 'middle', 'ring', 'pinky'].map((f) =>
      ['tip', 'phalanx-distal', 'phalanx-intermediate', 'phalanx-proximal'].map((n) => `${f}-finger-${n}`),
    );
    const NAMES = [
      'wrist',
      ...['metacarpal', 'phalanx-proximal', 'phalanx-distal', 'tip'].map((n) => `thumb-${n}`),
      ...['index', 'middle', 'ring', 'pinky'].flatMap((f) =>
        ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'].map((n) => `${f}-finger-${n}`),
      ),
    ];
    const stopWith = (reader, joints) => {
      reader.begin();
      for (const chain of CHAINS) {
        for (let k = 0; k < chain.length - 1; k++) {
          const a = joints[chain[k]].position;
          const b = joints[chain[k + 1]].position;
          const flat = a[2] - stringZ(1, a[0]) <= PRESS.above && b[2] - stringZ(1, b[0]) <= PRESS.above;
          if (k > 0 && !flat) break;
          const reach = flat ? 1 : 0.5;
          const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
          const n = Math.max(1, Math.min(8, Math.ceil((len * reach) / 0.006)));
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
      const reader = new StopReader(geo);
      const bow = new BowContact(geo);
      const pose = createBowPose();
      const positions = new Float32Array(NAMES.length * 3);
      const frames = [];
      let t = 0;
      while (t < plan.end) {
        const dt = step();
        t += dt;
        const hands = handsAt(t);
        stopWith(reader, hands.left);
        reader.commit(dt, true, true);
        NAMES.forEach((n, i) => positions.set(hands.right[n].position, i * 3));
        bow.update(bowPose(positions, pose, bowSpec), dt);
        const speed = Math.abs(bow.velocity);
        frames.push({
          t,
          amp: [0, 1, 2, 3].map((s) => (bow.sounding[s] ? bowedAmplitude(speed, bow.press[s]) : 0)),
          midi: [0, 1, 2, 3].map((s) => OPEN_MIDI[s] + reader.semitones[s]),
        });
      }
      const report = scoreNotes(plan.notes, frames);
      const wrong = report.filter((r) => !r.ok);
      results[name] = {
        right: report.length - wrong.length,
        of: report.length,
        strokes: bow.strokes,
        wrong: wrong.slice(0, 12).map((r) => `${r.beat} ${r.want} (${r.string}${r.finger} pos ${r.position}): heard ${r.heard} at ${r.loudness}`),
      };
    }
    const fingering = plan.notes.map((n) => `${n.note ?? n.notes.join('+')}:${n.stops.map((s) => geo.STRING_NAMES[s.string] + s.finger).join('')}@${n.position}`);
    return { results, positions: [...new Set(plan.notes.map((n) => n.position))], fingering: fingering.slice(0, 40).join(' ') };
  }, instrument);
}
