# Browser-Based Image Converter & Compressor — Build Plan

## Project Overview

Build a **static, privacy-focused image conversion and compression web app** where all processing happens client-side in the browser. No files are ever uploaded to a server. Inspired by imagecompressor.com in terms of simplicity and directness.

**Tagline:** *Convert and compress images in your browser. Files never leave your device.*

### Core Principles

1. **Zero backend.** Pure static site. No file uploads. No server processing.
2. **Privacy as the differentiator.** Every piece of UX copy reinforces that files stay local.
3. **Minimal/utilitarian design.** Like imagecompressor.com — no unnecessary flourishes.
4. **Self-testing.** The app ships with a full conversion matrix test suite that proves every format pair works.
5. **Ad-supported, but ads never detract from the tool.** Fixed slots, placeholder-first.

---

## Tech Stack

- **Framework:** Next.js 14+ (App Router, static export via `output: 'export'`)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS (utility-first, keeps bundle small)
- **State:** Zustand (lightweight, no Redux overkill)
- **Testing:**
  - **Vitest** + Testing Library for unit tests (components, utilities, state)
  - **Playwright** for E2E and the conversion matrix (real browser, real files)
- **Linting/Formatting:** ESLint + Prettier
- **Package manager:** pnpm (fast, disk-efficient)

### Deployment target
Static export — deployable to Vercel, Netlify, Cloudflare Pages, GitHub Pages, or any static host. No server runtime required.

---

## Formats Supported (MVP)

| Format | Decode | Encode | Library |
|--------|--------|--------|---------|
| JPEG   | ✅ native | ✅ native (Canvas) | Browser Canvas API |
| PNG    | ✅ native | ✅ native (Canvas) | Browser Canvas API + `UPNG.js` for better compression |
| WebP   | ✅ native | ✅ native (Canvas) | Browser Canvas API |
| AVIF   | ✅ native (modern browsers) | ✅ via WASM | `@jsquash/avif` |
| HEIC   | ✅ via WASM | ❌ (decode only) | `heic2any` or `@jsquash/heic` |
| GIF    | ✅ native | ✅ via lib | `gif.js` (static GIF encode; animated support is bonus) |

### Conversion Matrix (MVP)

Every source format → every supported output format (excluding HEIC as a target since we're decode-only for HEIC).

Output formats users can pick: **JPEG, PNG, WebP, AVIF, GIF**

Source formats accepted: **JPEG, PNG, WebP, AVIF, HEIC, GIF, BMP** (BMP decode comes free via Canvas)

**Total matrix:** 7 inputs × 5 outputs = **35 conversion pairs** that must be tested.

---

## Codec Loading Strategy

**Decision: Balanced hybrid — let per-codec size drive it.**

- Native browser codecs (JPEG, PNG, WebP, GIF decode) — always available, zero bundle cost
- AVIF encoder (`@jsquash/avif`) — lazy-loaded via dynamic import when user selects AVIF output
- HEIC decoder — lazy-loaded when a `.heic`/`.heif` file is dropped
- GIF encoder — lazy-loaded when user selects GIF output
- PNG optimizer (`UPNG.js`) — lazy-loaded when user selects PNG output with "optimize" enabled

All WASM and heavy encoders run inside **Web Workers** to keep the UI responsive.

---

## Feature Spec

### 1. File Input
- Drag-and-drop zone (full-page drop target when dragging)
- Click-to-browse button
- Paste from clipboard (Ctrl+V / Cmd+V)
- Accepts single file or many files at once

### 2. Per-File Conversion Settings
Each file in the queue can have its own settings, **or** the user can set global defaults that apply to all.

Settings per file:
- **Output format:** JPEG / PNG / WebP / AVIF / GIF
- **Quality:** slider 1–100 (disabled for PNG/GIF lossless)
- **Resolution/Resize:**
  - Width input (px)
  - Height input (px)
  - **Maintain aspect ratio** checkbox (on by default) — when on, editing one dimension auto-calculates the other
  - "Original" option that skips resize
- **Strip metadata** checkbox (on by default — EXIF removal)

Global defaults panel (collapsible) applies these to every new file added to the queue.

### 3. Queue Behavior
User-configurable in a settings drawer:
- **Process one at a time** (default on low-memory devices)
- **Process in parallel** with a concurrency slider (1–8, default 2)
- Queue shows per-file status: Waiting → Processing → Done / Error
- Per-file: thumbnail, filename, original size, output size, % saved, download button, remove button
- "Clear completed" and "Clear all" actions

### 4. Download
- Per-file download button once complete
- **"Download all as ZIP"** button — uses `JSZip`, only includes successfully converted files
- ZIP filename format: `converted-images-YYYY-MM-DD.zip`

### 5. Error Handling
- If a conversion fails (unsupported combo, corrupt file, OOM), mark it errored with a tooltip explaining why
- Errored files are excluded from the ZIP
- User can retry a single errored file

### 6. UX Details
- Show estimated output size *before* processing when possible (rough heuristic based on quality/dimensions)
- Progress bar per file during conversion
- Overall progress bar for the whole queue
- Toast notifications for completion, errors
- Keyboard shortcuts: `Space` to start/pause queue, `Esc` to cancel

---

## Layout & Ad Slots

```
┌────────────────────────────────────────────────────────┐
│                      HEADER                            │
│          Logo · "Convert & Compress in Browser"        │
├────────────────────────────────────────────────────────┤
│                                                        │
│              [ AD SLOT: TOP BANNER ]                   │
│              728x90 / responsive                       │
│                                                        │
├─────────────────────────────────────┬──────────────────┤
│                                     │                  │
│         MAIN CONVERTER AREA         │   [ AD SLOT:     │
│                                     │     SIDEBAR ]    │
│  ┌───────────────────────────────┐  │                  │
│  │     DROP ZONE / FILE PICKER   │  │   300x600        │
│  └───────────────────────────────┘  │   (desktop only, │
│                                     │    ≥1024px)      │
│  Settings: Format | Quality |       │                  │
│            Resize | Aspect Lock     │                  │
│                                     │                  │
│  ┌───────────────────────────────┐  │                  │
│  │     FILE QUEUE (scrollable)   │  │                  │
│  │  ☐ image1.jpg  2.1MB → 0.8MB  │  │                  │
│  │  ☐ image2.png  5.0MB → 1.2MB  │  │                  │
│  └───────────────────────────────┘  │                  │
│                                     │                  │
│   [Download All as ZIP]   [Clear]   │                  │
│                                     │                  │
├─────────────────────────────────────┴──────────────────┤
│                                                        │
│            [ AD SLOT: BOTTOM BANNER ]                  │
│              728x90 / responsive                       │
│                                                        │
├────────────────────────────────────────────────────────┤
│  FOOTER: Privacy note · About · GitHub                 │
└────────────────────────────────────────────────────────┘
```

### Ad Slot Implementation

Create a single `<AdSlot />` component that accepts `slot` and `size` props:

```tsx
<AdSlot slot="top-banner" size="728x90" />
<AdSlot slot="sidebar" size="300x600" />
<AdSlot slot="bottom-banner" size="728x90" />
```

Each renders a labeled placeholder div:
```
┌──────────────────────────┐
│      [Advertisement]     │
│         728 × 90         │
└──────────────────────────┘
```

Styling: light gray border, dashed, muted text. The component is structured so swapping in AdSense/Ezoic/Carbon later requires changing only this one component. Sidebar slot hidden below 1024px viewport (mobile gets top + bottom only).

---

## File & Folder Structure

```
/
├── public/
│   └── test-fixtures/          # real sample files for Playwright (JPG, PNG, WebP, AVIF, HEIC, GIF, BMP)
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx            # main converter page
│   │   └── globals.css
│   ├── components/
│   │   ├── AdSlot.tsx
│   │   ├── DropZone.tsx
│   │   ├── FileQueue.tsx
│   │   ├── QueueItem.tsx
│   │   ├── SettingsPanel.tsx
│   │   ├── GlobalDefaults.tsx
│   │   └── DownloadZipButton.tsx
│   ├── lib/
│   │   ├── converters/
│   │   │   ├── index.ts        # dispatcher: given input + target, routes to correct converter
│   │   │   ├── canvas.ts       # JPEG/PNG/WebP via Canvas API
│   │   │   ├── avif.ts         # @jsquash/avif
│   │   │   ├── heic.ts         # heic2any decoder
│   │   │   ├── gif.ts          # gif.js encoder
│   │   │   ├── png-optimize.ts # UPNG.js
│   │   │   └── types.ts        # shared ConversionInput, ConversionResult types
│   │   ├── workers/
│   │   │   └── converter.worker.ts  # runs heavy codecs off main thread
│   │   ├── queue/
│   │   │   ├── store.ts        # Zustand store
│   │   │   └── processor.ts    # queue runner w/ concurrency
│   │   ├── zip.ts              # JSZip bundling
│   │   └── utils/
│   │       ├── mime.ts         # MIME → format mapping
│   │       ├── resize.ts       # aspect-ratio math
│   │       └── format-bytes.ts
│   └── types/
│       └── global.d.ts
├── tests/
│   ├── unit/                   # Vitest
│   │   ├── mime.test.ts
│   │   ├── resize.test.ts
│   │   ├── queue-store.test.ts
│   │   └── zip.test.ts
│   └── e2e/                    # Playwright
│       ├── conversion-matrix.spec.ts
│       ├── queue-behavior.spec.ts
│       ├── zip-download.spec.ts
│       └── ui-smoke.spec.ts
├── scripts/
│   └── generate-matrix-report.ts  # runs matrix, writes MATRIX.md with pass/fail grid
├── next.config.js              # output: 'export'
├── playwright.config.ts
├── vitest.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

---

## Implementation Phases

Claude Code should build this incrementally, running tests after each phase. **Do not move to the next phase until the current phase's tests pass.**

### Phase 0 — Scaffold
1. Initialize Next.js project with TypeScript, Tailwind, App Router.
2. Configure `next.config.js` for static export.
3. Set up ESLint, Prettier, Vitest, Playwright.
4. Create the folder structure above.
5. Add `package.json` scripts:
   - `dev`, `build`, `export`
   - `test` (Vitest)
   - `test:e2e` (Playwright)
   - `test:matrix` (runs conversion-matrix spec only, then generates `MATRIX.md`)
   - `lint`, `format`

**Gate:** `pnpm dev` starts, blank Next.js page renders.

### Phase 1 — Layout & Ad Slots
1. Build `layout.tsx` with header, main, footer.
2. Build `<AdSlot />` component with placeholder styling.
3. Place top banner, bottom banner, and sidebar slots per the layout diagram.
4. Implement responsive behavior: sidebar hidden below 1024px.
5. Add Playwright smoke test: all three ad slots render on desktop, sidebar hidden on mobile.

**Gate:** Smoke test passes.

### Phase 2 — File Input & Queue State
1. Build `<DropZone />` with drag-drop, click-to-browse, paste.
2. Build Zustand queue store with actions: `addFiles`, `removeFile`, `updateFileSettings`, `setGlobalDefaults`, `clearCompleted`, `clearAll`.
3. Build `<FileQueue />` and `<QueueItem />` to display files with status.
4. Unit tests for store actions, MIME detection, filename handling.

**Gate:** Vitest store tests pass. Playwright: drop 3 files, all appear in queue.

### Phase 3 — Settings UI
1. Build `<SettingsPanel />` per-file (collapsible on each queue item).
2. Build `<GlobalDefaults />` panel at top of queue.
3. Wire up: format select, quality slider, width/height inputs, aspect-ratio lock, strip-metadata toggle.
4. Implement aspect-ratio math: editing width updates height (and vice versa) when lock is on.
5. Unit tests for resize math. Playwright: toggle lock, change width, verify height updates.

**Gate:** Resize math tests pass. Playwright settings interaction test passes.

### Phase 4 — Canvas-Based Converters (JPEG/PNG/WebP)
1. Implement `converters/canvas.ts` — loads image, draws to canvas, exports via `canvas.toBlob()`.
2. Implement metadata stripping (re-encoding via canvas strips EXIF by default).
3. Wire converter dispatcher in `converters/index.ts`.
4. Run a single conversion end-to-end: JPEG input → WebP output.
5. Unit tests with mocked canvas. Playwright: upload `sample.jpg`, convert to WebP, verify download.

**Gate:** One real conversion works end-to-end.

### Phase 5 — Queue Processor & Concurrency
1. Build `queue/processor.ts` — consumes queue, respects concurrency setting.
2. Add queue settings drawer with "one at a time" vs "parallel (N)" toggle.
3. Update `<QueueItem />` to show progress per file.
4. Implement cancel, retry actions.
5. Playwright: queue 5 files, verify sequential mode processes one at a time, parallel mode overlaps.

**Gate:** Concurrency behaves correctly in both modes.

### Phase 6 — Heavier Codecs (AVIF, HEIC, GIF, PNG-optimize)
1. Add `@jsquash/avif` with dynamic import + Web Worker.
2. Add `heic2any` for HEIC decode (lazy-loaded).
3. Add `gif.js` for GIF encode (lazy-loaded).
4. Add `UPNG.js` for PNG optimization (lazy-loaded).
5. Expand dispatcher to route to the right codec per input/output pair.
6. Unit tests per codec module (mocked).

**Gate:** Each codec loads and converts one known-good sample.

### Phase 7 — Conversion Matrix Test Suite
This is the self-testing requirement. Build `tests/e2e/conversion-matrix.spec.ts` that:

1. Loads real sample files from `public/test-fixtures/` (one per input format).
2. For each combination of `(input, output)` in the 7×5 matrix:
   - Uploads the sample
   - Sets output format
   - Runs conversion
   - Asserts: output blob exists, MIME type matches expected output, file size > 0, image is decodable (load it back into an `<img>` and verify `naturalWidth > 0`)
3. Builds a pass/fail grid and writes it to `MATRIX.md`.
4. Test fails the CI if any cell fails.

Run `pnpm test:matrix`, inspect `MATRIX.md`, iterate on any failing cells.

**Gate:** `MATRIX.md` shows all 35 cells ✅.

Example `MATRIX.md` output:
```markdown
# Conversion Matrix — Last run: 2026-04-23

|         | → JPEG | → PNG | → WebP | → AVIF | → GIF |
|---------|--------|-------|--------|--------|-------|
| JPEG    | ✅     | ✅    | ✅     | ✅     | ✅    |
| PNG     | ✅     | ✅    | ✅     | ✅     | ✅    |
| WebP    | ✅     | ✅    | ✅     | ✅     | ✅    |
| AVIF    | ✅     | ✅    | ✅     | ✅     | ✅    |
| HEIC    | ✅     | ✅    | ✅     | ✅     | ✅    |
| GIF     | ✅     | ✅    | ✅     | ✅     | ✅    |
| BMP     | ✅     | ✅    | ✅     | ✅     | ✅    |
```

### Phase 8 — ZIP Download
1. Implement `lib/zip.ts` using `JSZip`.
2. Build `<DownloadZipButton />` — only enables when ≥1 file is completed.
3. Filename: `converted-images-YYYY-MM-DD.zip`.
4. Only successfully converted files are included; errored files excluded.
5. Playwright: convert 3 files, download ZIP, verify it contains 3 files with correct extensions.

**Gate:** ZIP test passes.

### Phase 9 — Polish & Copy
1. Write homepage copy. Hero: "Convert & compress images in your browser." Sub: "No uploads. No accounts. Your files never leave your device."
2. Minimal footer: privacy note, GitHub link, About.
3. Favicon, meta tags, OpenGraph.
4. Accessibility pass: keyboard nav, ARIA labels, focus rings.
5. Mobile layout pass (≤768px).
6. Lighthouse audit: target 95+ on Performance, Accessibility, Best Practices, SEO.

**Gate:** Lighthouse scores met.

### Phase 10 — Production Build & Docs
1. `pnpm build && pnpm export` produces clean static output.
2. Write `README.md`:
   - What it does
   - How to run locally
   - How to run tests
   - How to swap in a real ad network (point to `<AdSlot />`)
   - Deployment notes for Vercel/Netlify/CF Pages
3. CI config (GitHub Actions): on PR, run lint + unit tests + matrix tests headless.

**Gate:** Clean production build, docs complete, CI green.

---

## Self-Testing Requirements (Critical)

The conversion matrix is the contract. Claude Code must:

1. **Generate `public/test-fixtures/`** — small, real sample images in each input format. Use a script that creates them at build time (e.g., draw a 64×64 gradient to canvas and export to each format via a Node-side tool, or commit tiny hand-made fixtures).
2. **Run the matrix after every codec change.** If a new codec is added or an existing one modified, `pnpm test:matrix` must be run and `MATRIX.md` regenerated.
3. **Never mark a phase complete with a red cell in the matrix.** If a cell fails, either fix it or explicitly document in `MATRIX.md` that it's unsupported (with reason).

---

## Acceptance Criteria

The build is done when:

- [ ] All 10 phases complete, gates passed
- [ ] `MATRIX.md` shows all 35 conversion pairs passing
- [ ] `pnpm test` green (unit)
- [ ] `pnpm test:e2e` green (E2E)
- [ ] Lighthouse: Performance ≥90, Accessibility ≥95, Best Practices ≥95, SEO ≥95
- [ ] Site works offline after first load (service worker optional but recommended)
- [ ] Three ad slots render as placeholders, all clearly labeled, none obstruct the converter
- [ ] Single-file flow: drop → convert → download works in <10 seconds for a 2MB image
- [ ] Multi-file flow: drop 10 files → convert all → download ZIP works
- [ ] Zero network requests after page load during a conversion (verify in DevTools Network tab — this is the privacy promise)

---

## Non-Goals (Explicit)

To keep scope tight, the MVP **does not** include:

- PDF, audio, video, or document conversion (future phases)
- User accounts, history, or cloud storage
- Batch resize presets beyond user-set width/height
- Image editing (crop, rotate, filters) — this is a converter, not an editor
- Server-side fallback for unsupported formats
- Real ad network integration (placeholders only)
- Internationalization (English only for MVP)

---

## Notes for Claude Code

- **Ask before deviating from this plan.** If a library is deprecated or a codec has a better alternative, flag it before swapping.
- **Keep the main bundle small.** Target <200KB gzipped for the initial JS. Heavy codecs must be lazy-loaded.
- **Privacy is the feature.** Never add analytics, telemetry, or any network request that fires during a conversion. The only network activity should be initial page load + lazy codec chunks.
- **Commit after each phase** with a descriptive message. Include the `MATRIX.md` state in commits that touch codecs.
- **When in doubt, mirror imagecompressor.com's directness.** No marketing fluff, no modals, no popups. Drop file → convert → download.
