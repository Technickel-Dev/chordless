#!/usr/bin/env node
/** Records the named takes one after another: node video/capture/queue.mjs wt-guitar wt-trumpet ... */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const take = fileURLToPath(new URL('./take.mjs', import.meta.url));
for (const name of process.argv.slice(2)) {
  console.log(`=== ${name} ${new Date().toISOString()}`);
  const r = spawnSync('node', [take, name], { stdio: 'inherit', timeout: 6 * 60 * 1000, killSignal: 'SIGKILL' });
  if (r.status || r.error) console.log(`=== ${name} exited ${r.status} ${r.error?.code ?? ''}`);
}
console.log('=== queue done');
