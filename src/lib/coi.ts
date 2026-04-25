/**
 * Cross-Origin Isolation bootstrap.
 *
 * Call registerCoiServiceWorker() as early as possible in main.ts (before any
 * heavy module loads) so the worker has the best chance of being installed and
 * activating before content loads.
 *
 * Flow:
 *   1. Register /coi-serviceworker.js at the root scope.
 *   2. The SW intercepts fetch responses and injects COOP + COEP headers.
 *   3. On first install the SW posts a {type:'coi-reload'} message; this
 *      module listens and reloads the page once so the newly-installed SW
 *      can serve the headers on the second load.
 *   4. On all subsequent loads crossOriginIsolated === true and ORT multi-
 *      threaded WASM (SharedArrayBuffer) works without browser warnings.
 *
 * The one-time-reload guard uses sessionStorage so it survives module re-
 * initialisation within the same tab session but resets if the user opens a
 * new tab.
 */

const RELOAD_DONE_KEY = 'coi-reloaded';

export async function registerCoiServiceWorker(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  // Already isolated — nothing to do.
  if (typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated) {
    return;
  }

  // Guard against reload loops: only attempt the one-time reload once per
  // session.  If this key is set we already reloaded but are still not
  // isolated (e.g. the SW didn't activate in time).  Don't loop.
  const alreadyReloaded = sessionStorage.getItem(RELOAD_DONE_KEY) === '1';

  try {
    const reg = await navigator.serviceWorker.register('/coi-serviceworker.js', {
      scope: '/',
    });

    // If there's already an active SW the current page loaded under it.
    // crossOriginIsolated should already be true in that case — handled above.
    // If the SW is newly installed, wait for it to activate then reload.
    if (!alreadyReloaded) {
      // Listen for the postMessage from the SW's activate handler.
      navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
        if ((event.data as { type?: string } | null)?.type === 'coi-reload') {
          sessionStorage.setItem(RELOAD_DONE_KEY, '1');
          location.reload();
        }
      });

      // Also handle the case where the SW was waiting and we call skipWaiting
      // via the install event — if a waiting worker exists, update it.
      if (reg.waiting) {
        sessionStorage.setItem(RELOAD_DONE_KEY, '1');
        location.reload();
      }
    }
  } catch (err) {
    // Non-fatal: COI registration failing means multi-threaded WASM won't be
    // available, but single-threaded WASM still works.
    console.warn('[coi] Service worker registration failed:', err);
  }
}
