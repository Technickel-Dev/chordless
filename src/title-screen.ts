/**
 * The 2D title screen that covers the page until the player enters VR.
 *
 * The markup and styles live in index.html so the screen paints before the
 * world (and its three.js bundle) has loaded. This module only wires it up:
 * the button waits for the world, checks that the browser can open an
 * immersive-vr session, and calls world.launchXR(). The screen hides while the
 * session is running and comes back when the player leaves VR.
 */

import { VisibilityState, type World } from '@iwsdk/core';

export function mountTitleScreen(world: World): void {
  const screen = document.getElementById('title-screen');
  const enter = document.getElementById('title-enter') as HTMLButtonElement | null;
  const enterLabel = document.getElementById('title-enter-label');
  const preview = document.getElementById('title-preview') as HTMLButtonElement | null;
  const note = document.getElementById('title-note');
  if (!screen || !enter || !enterLabel || !preview || !note) return;

  const hide = () => screen.classList.add('is-hidden');
  const show = () => screen.classList.remove('is-hidden');

  enter.addEventListener('click', () => world.launchXR());
  preview.addEventListener('click', hide);

  const ready = (supported: boolean) => {
    enter.disabled = !supported;
    enterLabel.textContent = 'Enter VR';
    note.hidden = supported;
    if (supported) enter.focus({ preventScroll: true });
  };

  const xr = navigator.xr;
  if (!xr) {
    ready(false);
  } else {
    xr.isSessionSupported('immersive-vr').then(ready, () => ready(false));
  }

  // Hide while immersive; bring the title back when the player exits VR.
  let wasImmersive = false;
  world.visibilityState.subscribe((state) => {
    const immersive = state !== VisibilityState.NonImmersive;
    if (immersive) hide();
    else if (wasImmersive) show();
    wasImmersive = immersive;
  });
}
