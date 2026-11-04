/**
 * Starts the app fresh for a scripted run, waiting on what the run needs
 * rather than on fixed times: the page reloaded with `root` (the named
 * instrument model) in the scene, and, with `view`, the emulated XR session
 * presenting with hand input and the headset looking that way. `modules`
 * load in the page meanwhile, so the run's own imports are instant.
 */

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Reloads the page and waits until the app has built `root`. */
export async function reloadApp({ page, frame }, root) {
  // A window behind others renders at about 1 fps.
  await page.bringToFront();
  // Marks the old page, so its scene is not mistaken for the new one's.
  await frame.evaluate(() => {
    window.__staleForReload = true;
    window.IWER_MCP.dispatch('reload_page', {});
  });
  // The page's context is torn down mid-reload, so check by polling.
  const deadline = Date.now() + 60000;
  for (;;) {
    const ready = await frame
      .evaluate(
        (name) =>
          !window.__staleForReload &&
          window.IWER_MCP != null &&
          window.FRAMEWORK_MCP_RUNTIME?.world?.scene?.getObjectByName(name) != null,
        root,
      )
      .catch(() => false);
    if (ready) break;
    if (Date.now() > deadline) throw new Error(`app did not load ${root} within 60 s`);
    await wait(30);
  }
  // A real click lets the browser start audio if it is still suspended.
  // The app is in the managed window's runtime frame, or is the page itself.
  const box = frame.parentFrame() ? await (await frame.frameElement()).boundingBox() : { x: 0, y: 0, height: page.viewportSize()?.height ?? 600 };
  await page.mouse.click(box.x + 12, box.y + box.height / 2);
}

/** Reloads, then enters XR with hands and the headset at `view`, loading `modules` meanwhile. */
export async function startApp(ctx, { root, view, modules = [] }) {
  const { frame } = ctx;
  await reloadApp(ctx, root);
  const dispatch = (method, params = {}) =>
    frame.evaluate(([m, p]) => window.IWER_MCP.dispatch(m, p), [method, params]);
  const loading = frame.evaluate((list) => Promise.all(list.map((m) => import(m))).then(() => {}), modules);
  await dispatch('accept_session');
  await frame.waitForFunction(() => window.FRAMEWORK_MCP_RUNTIME.world.renderer?.xr?.isPresenting, null, {
    timeout: 10000,
  });
  await dispatch('set_input_mode', { mode: 'hand' });
  await dispatch('set_transform', { device: 'headset', position: { x: 0, y: 1.6, z: 0 }, orientation: view });
  // A couple of frames for the headset and hands to take effect.
  await frame.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  await loading;
}

/** A screenshot of the app: its frame in the managed window, or the whole page when the app is the page itself. */
export async function screenshotApp({ page, frame }, options) {
  return frame.parentFrame() ? (await frame.frameElement()).screenshot(options) : page.screenshot(options);
}
