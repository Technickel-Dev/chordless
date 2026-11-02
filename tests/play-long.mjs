#!/usr/bin/env node
/**
 * Runs a play script whose performance can outlast one browser run (IWSDK
 * allows 110 s per run): first with WT_PHASE=start, which starts the
 * performance in the page and waits as long as its run may; then with
 * WT_PHASE=wait, which picks the same performance up, until a run reports
 * the result instead of { pending: true }. Prints that result.
 *
 *   node tests/play-long.mjs tests/william-tell.mjs
 */

import { spawnSync } from 'node:child_process';

const script = process.argv[2];
if (!script) {
  console.error('usage: node tests/play-long.mjs <play script>');
  process.exit(2);
}

const run = (phase) => {
  const r = spawnSync(`iwsdk browser run "${script}" --timeout 110000`, {
    env: { ...process.env, WT_PHASE: phase },
    encoding: 'utf8',
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = r.stdout ?? '';
  try {
    return { text: out, json: JSON.parse(out) };
  } catch {
    return { text: out + (r.stderr ?? ''), json: null };
  }
};

let r = run('start');
for (let i = 0; i < 5 && r.json?.data?.result?.pending; i++) r = run('wait');
process.stdout.write(r.text);
if (!r.json?.ok) process.exitCode = 1;
