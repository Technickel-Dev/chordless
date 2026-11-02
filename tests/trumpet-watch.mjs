/**
 * The trumpet check, slowed down to watch in the managed browser (start it
 * with `npx iwsdk dev up --headed --allow-browser-automation`):
 *
 *   npm run watch:trumpet
 */

import run from './trumpet-check.mjs';

process.env.E2E_PACE ??= '3';

export default run;
