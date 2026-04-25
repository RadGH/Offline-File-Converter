# Code Review — Image Converter

Reviewed against commit state after M-batch (April 2026). Scope: `src/`, `tests/`, `public/`, and HTML entry points.

---

## Architecture Overview

The app is a Vite + vanilla TypeScript SPA with no runtime framework. State is managed by a hand-rolled `QueueStore` (pub/sub pattern, immutable snapshots). The `QueueProcessor` drives conversions with configurable concurrency, delegating to a codec dispatcher (`src/lib/converters/index.ts`) that lazy-loads heavy WASM codecs (AVIF, GIF, HEIC, PNG optimizer) via dynamic `import()`. This keeps the initial bundle lean (~14 KB for main entry).

Standalone pages (`privacy.html`, `about.html`) share a single bootstrapper (`main-doc.ts`) and content modules (`PrivacyContent.ts`, `AboutContent.ts`), avoiding duplication. The modal system (`Modal.ts`) renders the same content inline on the main page. Theme management is centralized in `lib/theme.ts`, propagated via a `data-theme` attribute on `<html>`, and respected by all CSS via `[data-theme="dark"]` variable overrides.

---

## Strengths

- **Strict TypeScript with zero `any`** — the entire codebase compiles under `strict: true` with no `any` escapes needed in source files.
- **Lazy codec loading** — AVIF (3.5 MB WASM), GIF, HEIC, and PNG optimizer are all dynamically imported, so users never download codecs they don't use.
- **Clean store pattern** — `createQueueStore()` returns a minimal interface; the internal state is never mutated directly. Listener cleanup functions are returned and used correctly.
- **Test coverage** — 238 unit tests covering converters, queue, resize utilities, and format routing. E2E Playwright tests cover the main user flows.
- **Accessibility foundations** — skip links, ARIA roles on dialogs, focus trapping in the new Modal, aria-live for toasts.
- **COI service worker** — the upscale entry cleanly handles `SharedArrayBuffer` requirements for GitHub Pages without requiring server-side headers.

---

## Findings

### Critical

None.

### High

| # | Title | Path:Line | Description | Suggested Fix | Fixed this batch? |
|---|-------|-----------|-------------|---------------|-------------------|
| H1 | Blob URL leak in DownloadZipButton | `src/components/DownloadZipButton.ts:56` | A `URL.createObjectURL(blob)` is created for the ZIP download but `URL.revokeObjectURL` is never called, even after a short delay. The blob URL lingers in memory for the page lifetime. | After the `click` fires on the anchor, call `setTimeout(() => URL.revokeObjectURL(url), 100)`. | No — flagged for owner. |
| H2 | Download blob URL in QueueItem not revoked | `src/components/QueueItem.ts:311` | Each download button click creates a new object URL from `item.result.blob` without revoking it. For long-running sessions with many conversions this accumulates. | Revoke the URL in a `setTimeout` after the click, identical to the standard anchor-download pattern. | No — flagged for owner. |
| H3 | Compare panel blob URLs never revoked | `src/components/QueueItem.ts:383` | `afterUrl = URL.createObjectURL(afterBlob)` in the compare panel setup has no cleanup. | Store the URL and revoke it when the compare panel is closed or the item is disposed. | No — flagged for owner. |

### Medium

| # | Title | Path:Line | Description | Suggested Fix | Fixed this batch? |
|---|-------|-----------|-------------|---------------|-------------------|
| M1 | `store.subscribe` in SimpleSettings not unsubscribed | `src/components/SimpleSettings.ts:251` | The subscription returned by `store.subscribe()` is never called to clean up. Since SimpleSettings lives for the page lifetime this is not a practical leak today, but it breaks the pattern and would matter if the component were ever unmounted. | Capture and call the returned unsubscribe function in a cleanup step. | No |
| M2 | `store.subscribe` in GlobalDefaults not unsubscribed | `src/components/GlobalDefaults.ts:255` | Same issue as M1. | Same fix. | No |
| M3 | Race condition: processor can dispatch before store `mode` is persisted | `src/lib/queue/processor.ts:~50` | On boot, `processor.start()` is called immediately after checking `store.getQueueSettings().mode === 'auto'`. If `loadPersistedQueueSettings()` fails silently (corrupted localStorage), the processor starts even when the user prefers Manual mode. | Already guarded by `try/catch` with fallback to `DEFAULT_QUEUE_SETTINGS`. Low-severity but worth a comment explaining the fallback. | No |
| M4 | No error boundary on `loadAnalytics()` failure | `src/lib/consent.ts:53–71` | If the gtag script fails to load (network error, blocked by ad-blocker), there's no error handling and the `window.gtag` function may be called later on a partially initialized state. | Wrap the `<script>` load in an `onerror` handler that sets `window.__gaLoaded = false` so the idempotency guard is reset on failure. | No |
| M5 | `arguments` object used inside arrow function | `src/lib/consent.ts:59` | `window.dataLayer!.push(arguments)` inside an arrow function captures the outer `arguments` (from `loadAnalytics`), not the `gtag()` call arguments. This is a known GA snippet pattern but it's fragile — if `loadAnalytics` is ever refactored into a non-function context the capture breaks silently. | Use a rest parameter: `const gtag = (...args: unknown[]) => window.dataLayer!.push(args)`. | No — low-risk in current context but worth noting. |
| M6 | PNG optimizer progress jumps backward | `src/lib/converters/index.ts:120` | After `convertViaCanvas` reports 100%, the PNG optimizer remaps its own progress to 80–100%, causing a visible backward jump in the progress bar. | Re-order: report the canvas encode step as only going to 75%, then let the optimizer fill 75–100%. | No |

### Low

| # | Title | Path:Line | Description | Suggested Fix | Fixed this batch? |
|---|-------|-----------|-------------|---------------|-------------------|
| L1 | `rel="noopener"` missing `noreferrer` on some links | `src/main-upscale.ts`, `privacy.html` | External links should use `rel="noopener noreferrer"` to prevent both opener access and referrer leakage. Some links had only `rel="noopener"`. | Add `noreferrer` to all `target="_blank"` links. | Yes — fixed in this batch. |
| L2 | `pngOptimize` field remained in store and components after design decision to always-on | `src/lib/queue/store.ts`, `src/components/SettingsPanel.ts`, `src/components/GlobalDefaults.ts` | The `pngOptimize` field was still a user-visible toggle despite the decision to make it always-on. | Removed field from `PerFileSettings`, `DEFAULT_SETTINGS`, and all UI components. | Yes — fixed in this batch. |
| L3 | Consent banner privacy link pointed to hard `/privacy.html` | `src/components/ConsentBanner.ts:29` | The link in the consent banner bypassed the hash-modal system and navigated away from the page. | Updated to `#privacy` so it opens the modal instead. | Yes — fixed in this batch. |
| L4 | Missing `robots.txt` and `sitemap.xml` | `public/` | No robots.txt or sitemap existed. Crawlers may miss pages. | Added both files. | Yes — fixed in this batch. |
| L5 | Missing CSP | All HTML entries | No Content-Security-Policy was set. | Added `<meta http-equiv="Content-Security-Policy">` to all four HTML pages. | Yes — fixed in this batch. |
| L6 | No structured data | `index.html` | Search engines had no machine-readable description of the app. | Added `application/ld+json` WebApplication schema. | Yes — fixed in this batch. |

### Nit

| # | Title | Path:Line | Description | Fixed? |
|---|-------|-----------|-------------|--------|
| N1 | `#app { display: contents }` breaks focus ring containment | `src/styles/main.css:70` | `display: contents` makes `#app` invisible to the accessibility tree as a container. Works fine today because focus rings are drawn by children, but something to keep in mind if ARIA landmark roles are ever added to `#app`. | No — acceptable |
| N2 | `arguments` eslint disable comment | `src/lib/consent.ts:59` | The `// eslint-disable-next-line prefer-rest-params` comment signals a known code smell. See M5. | No |
| N3 | `FORMAT_FACTOR` constants are undocumented | `src/components/QueueItem.ts:9` | The per-format compression ratio estimates have no comment explaining their origin or how to adjust them. | No — minor |
| N4 | `beforeEach` in queue-processor test resets mocks manually | Various test files | Some `beforeEach` hooks call `mockX.mockClear()` but not `mockX.mockReset()`, meaning a failed test could leave a pending resolved value for the next test. | No — acceptable |

**Finding counts: 0 Critical / 3 High / 6 Medium / 6 Low / 4 Nit. Total: 19 findings.**

---

## Recommendations for Future Work

1. **Blob URL cleanup audit** — H1/H2/H3 should be fixed together in one pass. A `useBlobUrl(blob)` helper that auto-revokes after a tick would prevent recurrence.
2. **Unsubscribe pattern** — consider a `Disposable` interface (`{ dispose(): void }`) returned by all components. `FileQueue` already does this for `disposeQueueItem`; extending the pattern to store subscriptions would close M1/M2.
3. **PNG optimizer progress smoothing** — the 100→80 progress jump (M6) is visible. A progress multiplexer that blends canvas encode and UPNG steps would produce a monotonically increasing bar.
4. **Web Worker for AVIF main-thread encode** — AVIF encode is synchronous WASM on the UI thread. For large images this blocks the main thread for several seconds. The deferral note in `converters/index.ts` is accurate; the `converter.worker.ts` stub is in place but not wired.
5. **E2E coverage for modals** — the new `#about` and `#privacy` modal flows are not yet covered by Playwright specs. A quick smoke test asserting the modal opens and closes (including ESC and backdrop click) would catch regressions.
6. **`og:image` social card** — noted as deferred in the SEO work. A 1200×630 PNG hosted at `/og-image.png` with a converter screenshot would improve link previews on social platforms.
