/**
 * Cross-Origin Isolation service worker shim.
 *
 * GitHub Pages cannot send custom response headers, so we cannot set
 * Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy at the HTTP
 * layer. Instead this service worker intercepts the page's own responses and
 * injects the required headers so that crossOriginIsolated === true and
 * SharedArrayBuffer / ORT multi-threaded WASM become available.
 *
 * Behaviour:
 *   1. On install, claim all clients immediately (skipWaiting + clients.claim).
 *   2. After activation, postMessage each client telling it to reload once —
 *      the first page load happened without COI headers so crossOriginIsolated
 *      is false; after one reload the service worker intercepts the response
 *      and adds the headers.
 *   3. For every fetch:
 *      - Same-origin responses: inject COOP + COEP headers.
 *      - Cross-origin responses: inject CORP=cross-origin so that COEP
 *        require-corp mode doesn't block external assets (Hugging Face model
 *        CDN, ORT WASM if ever loaded from external).
 *
 * Versioning: bump COI_SW_VERSION when you make a breaking change — browsers
 * with a cached old version will skipWaiting and activate the new one.
 */

const COI_SW_VERSION = 'v2';

self.addEventListener('install', () => {
  /** @type {ServiceWorkerGlobalScope} */ (self).skipWaiting();
});

self.addEventListener('activate', async () => {
  const sw = /** @type {ServiceWorkerGlobalScope} */ (self);
  await sw.clients.claim();

  // Tell all controlled clients to reload once so they pick up the new headers.
  // We use a storage flag (coi-reloaded) to guarantee at most one reload per
  // client session — without this, clients could loop.
  const allClients = await sw.clients.matchAll({ type: 'window' });
  for (const client of allClients) {
    client.postMessage({ type: 'coi-reload' });
  }
});

self.addEventListener('fetch', (event) => {
  const fe = /** @type {FetchEvent} */ (event);
  const url = new URL(fe.request.url);

  // Only intercept GET/HEAD. Let mutations (POST, PUT, etc.) pass through.
  if (fe.request.method !== 'GET' && fe.request.method !== 'HEAD') return;

  // Non-http(s) schemes — skip.
  if (!url.protocol.startsWith('http')) return;

  const isSameOrigin = url.origin === self.location.origin;

  fe.respondWith(
    fetch(fe.request)
      .then((response) => {
        // Don't modify opaque responses — they're already served to the page
        // as-is (e.g. no-cors images). Modifying them would make them fail.
        if (response.type === 'opaque' || response.type === 'error') {
          return response;
        }

        const headers = new Headers(response.headers);

        if (isSameOrigin) {
          // Inject COI headers for same-origin document / script responses.
          headers.set('Cross-Origin-Opener-Policy', 'same-origin');
          headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
        } else {
          // Cross-origin: allow the resource to be embedded under COEP=require-corp.
          // This is needed for the Hugging Face CDN model download.
          headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
        }

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      })
      .catch(() => fetch(fe.request)),
  );
});
