# Changelog

> **Session-by-session record of significant changes.**
> Append a new entry at the top after each session that modifies files.
> Format: date, one-line summary, changed files, motivation, implementation notes.

---

## 2026-03-30 — Remove tile-based incremental processing

**Changed:** `src/worker/ascii-worker.ts`, `src/store/index.ts`, `src/components/WebcamPage.tsx`, `docs/features/webcam-ascii.md`

**Why:** The percentage-based tile diff fix (previous session) still produced visible artifacts: ghosting when the subject's head partially occupied a tile, and movement distortion when motion crossed tile boundaries. The coarse 8×6 spatial partition cannot cleanly track sub-tile motion regardless of the diff algorithm. User preferred the original every-frame output.

**How:** Removed all tile infrastructure from the worker: `TILE_COLS`, `TILE_ROWS`, `PIXEL_DIFF_THRESHOLD`, `CHANGED_AREA_FRACTION`, all 8 cache variables, `computeTileDiff`, `buildTileDiffMap`, `getCellTile`, `makeConfigKey`, all cache-invalidation blocks, all tile-skip blocks in the three process functions, and the `prevFrameData` save at the end of the message handler. `processMonochrome` and `processColor` now return `string` directly; `processEmoji` returns `{ cols, rows }`. Removed `tilesProcessed`/`tilesSkipped` from `WorkerOutput`, `perfMetrics` type in the store, the store's onmessage handler, and `PerfOverlay` in WebcamPage.

---

## 2026-03-30 — Fix tile change detection to eliminate movement ghosting

**Changed:** `src/worker/ascii-worker.ts`, `docs/features/webcam-ascii.md`

**Why:** The original tile diff used a mean average of per-pixel RGB diffs across all tile pixels. When the subject's head occupied ~15% of a tile and moved, the large diffs from those pixels were diluted by the 85% static background pixels, dropping the average below the threshold. The tile was falsely marked "unchanged" → ghost of the old head position persisted in the output.

**How:** Replaced average-diff detection with percentage-based detection. `computeTileDiff` now counts pixels where the per-pixel RGB diff (`|ΔR|+|ΔG|+|ΔB|`) exceeds 25, and returns `true` (changed) if that count exceeds 5% of the tile's total pixels. Constants changed from `TILE_DIFF_THRESHOLD = 10` to `PIXEL_DIFF_THRESHOLD = 25` + `CHANGED_AREA_FRACTION = 0.05`. Return type of `computeTileDiff` changed from `number` to `boolean`. No other code paths changed.

---

## 2026-03-30 — Bundle optimization and deployment documentation (Tasks 39–40)

**Changed:** `src/store/index.ts`, `src/components/ModeControls.tsx`, `vite.config.ts`, `docs/infra/deployment.md`, `docs/infra/decisions.md`, `docs/features/webcam-ascii.md`

**Why:** Tasks 39 and 40 — the final two tasks of the project. Goal was to reduce the initial bundle size by deferring heavy dependencies until they are actually needed, then document the deployment and bundle strategy.

**How:**
- `@mediapipe/selfie_segmentation` changed from a static import to `await import(...)` inside `initSegmentation()`. The static import became type-only (`import type`). MediaPipe now downloads only when the user first starts the webcam.
- ASCII worker changed from `import AsciiWorker from '...?worker'` (eager Vite worker import) to `new Worker(new URL('../worker/ascii-worker.ts', import.meta.url), { type: 'module' })` inside a `getWorker()` closure. Worker is created on the first processed frame, not at store module load.
- `HexColorPicker` in `ModeControls.tsx` changed from a static import to `React.lazy()` + `Suspense`. The `react-colorful` chunk downloads only when the color picker is first opened.
- `vite.config.ts`: added `build.rollupOptions.output.manualChunks` to produce stable `mediapipe-*.js` and `router-*.js` chunk names.
- Result: main app bundle is ~14 kB (4.7 kB gzip), well under the 200 kB target.
- Deployment doc updated with a "Bundle Splitting" section documenting all chunks and their load triggers.
- ADR-009 added for the lazy loading decision. ADR-007 updated to reflect lazy worker init.

---

## 2026-03-30 — Implement tile-based incremental processing (Task 37)

**Changed:** `src/worker/ascii-worker.ts`, `src/store/index.ts`, `src/components/WebcamPage.tsx`, `docs/features/webcam-ascii.md`
**Why:** Each frame was fully reprocessing all pixels even for mostly-static scenes. For a user sitting still, 60–80% of tiles are unchanged — reprocessing them is wasted CPU.
**How:** Added an 8×6 pixel-level tile grid. `buildTileDiffMap` computes mean per-channel pixel diff for each tile vs the previous frame; tiles below threshold 10 are skipped. Module-level caches per mode (`prevMonoBrightness`, `prevColorR/G/B/L`, `prevEmojiChars`) store per-cell values for reuse. Cache invalidation is keyed on a config fingerprint (`asciiWidth:colorMode:selectedCharset:imgWidth:imgHeight`). The unsharp masking second pass in monochrome still runs on all cells (preserves correct boundary behaviour between changed/unchanged tiles). `WorkerOutput` extended with `tilesProcessed`/`tilesSkipped`; propagated to `perfMetrics` and displayed in `PerfOverlay` as `Tiles proc/skip: X/Y`.

---

## 2026-03-30 — Cancel task 38 (performance toggle UI) and absorb into task 37

**Changed:** `.taskmaster/tasks/tasks.json`
**Why:** Task 38 proposed a UI to toggle web worker, WebGL, and tile processing on/off. On review: the worker is always-on with no reason to disable; WebGL is already auto-detected with CPU fallback; tile processing is always a win. No user-facing value, and maintaining CPU fallback paths adds permanent complexity. Cancelled.
**How:** Set task 38 status to cancelled. Added a note to task 37 to expose tiles-processed/skipped counts in the existing perf overlay — the one useful piece from task 38.

---

## 2026-03-29 — Decouple render pipeline into independent Stage 1/2/3 loops (Task 36)

**Changed:** `src/store/index.ts`, `docs/features/webcam-ascii.md`, `docs/infra/decisions.md`
**Why:** The single async rAF loop called `await segmenter.send()` inline, stalling video capture at MediaPipe's ~20fps throughput rather than the camera's 30fps. Slow segmentation blocked everything downstream.
**How:** Split into two independent rAF loops. Stage 1 (`captureFrame`) is now fully synchronous — captures video → ImageData, then writes to `segQueueFrame` (monochrome) or dispatches to worker directly (color/emoji). Stage 2 (`segLoop` in `startSegmentationLoop`) is the async loop that picks up frames from the queue, runs `segmenter.send()`, applies temporal smoothing + mask blend, and posts to the worker. The queue is a single closure-level `ImageData | null` variable (last-write-wins); `segBusy` prevents Stage 2 re-entry. `updateAsciiOutput` simplified to mailbox-check + postMessage only. `workerPostTime` added for real worker round-trip timing in `asciiTimeMs`. Added ADR-008 to decisions.md.

---

## 2026-03-29 — Add edge detection with Sobel operator in monochrome mode (Task 35)

**Changed:** `src/worker/ascii-worker.ts`, `docs/features/rendering-modes.md`
**Why:** Task 35 — add edge detection using directional characters for enhanced edge sharpness in monochrome mode.
**How:** Added Sobel operator computation in the monochrome processing pipeline. After computing per-cell brightness, runs 3×3 Sobel X/Y gradients to detect edges. If edge magnitude > 15, selects directional character (`|`, `\`, `—`, `/`) based on gradient angle. Non-edge cells use brightness-based character from the selected charset. Edge detection is automatic in monochrome mode (no UI toggle) — it runs always when in monochrome mode.

---

## 2026-03-29 — Fix WebGL shader bugs: texture normalization and vertical inversion (Task 34)

**Changed:** `src/worker/ascii-worker.ts`, `docs/features/webcam-ascii.md`
**Why:** Monochrome mode was producing blank output when the WebGL fast path was active. Two bugs in the fragment shader / geometry setup caused it.
**How:**
1. **Texture normalization bug** — `gl.texImage2D` with `UNSIGNED_BYTE` automatically normalizes pixel values to `[0, 1]` when sampled in a GLSL shader. The `rgbToLabL` function in the fragment shader was treating them as `[0, 255]` and dividing by 255, producing values in `[0, 0.004]` → near-zero luminance everywhere → blank output. Fixed by removing the `/ 255.0` division and clamping to `1.0` instead of `255.0`.
2. **Vertical inversion** — `gl.readPixels` reads the framebuffer from row 0 (bottom) upward. The original tex coords mapped `(0,1)` to the bottom-left vertex, which rendered the bottom of the original image there; `readPixels` then returned the image upside-down. Fixed by using natural tex coords `(0,0)→(1,0)→(0,1)→(1,1)` so framebuffer row 0 = top of original image, matching what the ASCII brightness loop expects.

---

## 2026-03-29 — Move emoji ASCII conversion to Web Worker (Task 33)

**Changed:** `src/worker/ascii-worker.ts`, `src/store/index.ts`, `docs/features/webcam-ascii.md`

**Why:** Task 33 — emoji processing (`updateEmojiOutput`) was the last mode still running on the main thread, blocking React rendering for ~10–20ms per frame.

**How:** Implemented `processEmoji` in the worker by porting the logic from the store action verbatim: Gray World white balance (sample every 4th pixel), per-cell RGB averaging over square cells (1:1 aspect ratio, unlike the 2:1 monospace cells), then nearest-emoji matching via squared Euclidean RGB distance against `EMOJI_COLOR_PALETTE` (inlined rather than importing `rgbToNearestEmoji` to keep the worker self-contained). Updated `updateEmojiOutput` in the store to use the same single-slot mailbox pattern as the other modes — sets `workerBusy: true`, posts `ImageData` as a transferable with `colorMode: 'emoji'`. Extended the worker `onmessage` result handler to set `emojiOutput` when returned. Removed now-unused `rgbToNearestEmoji` from the store import. All three rendering modes (monochrome, color, emoji) now run fully off the main thread.

---

## 2026-03-29 — Move color ASCII conversion to Web Worker (Task 32)

**Changed:** `src/worker/ascii-worker.ts`, `src/store/index.ts`, `docs/features/webcam-ascii.md`

**Why:** Task 32 — color ASCII processing (`updateColorAsciiOutput`) was still running on the main thread, consuming ~20–40ms per frame for the per-cell RGB averaging, LAB brightness, unsharp masking, HSL saturation boost, gamma lift, and HTML span generation.

**How:** Implemented `processColor` in the worker by porting the logic verbatim from the store action. Updated `updateColorAsciiOutput` in the store to use the same single-slot mailbox pattern as monochrome: check `workerBusy`, set it to `true`, post `ImageData` as a transferable with `colorMode: 'color'` config. Extended the worker's `onmessage` result handler to also set `coloredAsciiOutput` when the worker returns it. Removed now-unused `CHARACTER_SETS` from the store import.

---

## 2026-03-29 — Implement monochrome ASCII processing in Web Worker; fix Stop hook enforcement

**Changed:** `src/worker/ascii-worker.ts`, `src/store/index.ts`, `scripts/on-session-stop.sh`, `docs/features/webcam-ascii.md`, `docs/infra/patterns.md`

**Why:** Task 31 — move the monochrome ASCII conversion pipeline (white balance, LAB L*, unsharp mask, character mapping) off the main thread to reduce per-frame main-thread cost. Separately, the `Stop` hook was silently failing: it used `exit 1` (non-blocking in Claude Code) instead of `exit 2` (blocking, stderr fed back to Claude), so the doc-review enforcement was never actually reaching Claude.

**How:** Implemented `processMonochrome` in the worker with the full pipeline extracted from the store's `updateAsciiOutput`. Mask blending (temporal smoothing) intentionally stays on the main thread since it needs `previousMaskData` store state — the blended `ImageData` is posted to the worker as a transferable buffer. Added `workerBusy: boolean` as a single-slot mailbox flag (drop frame if worker is still processing). The store's `create` callback was changed from implicit-return arrow to block body so the worker `onmessage` handler can be set up inline using the `set` closure before the state object is returned. Hook fix: changed `exit 1` → `exit 2` and redirected output to stderr.

---

## 2026-03-27 — Add Web Worker scaffold for ASCII conversion pipeline

**Changed:** `src/worker/ascii-worker.ts` (new), `vite.config.ts`, `src/store/index.ts`

**Why:** The ASCII conversion functions (`updateAsciiOutput`, `updateColorAsciiOutput`, `updateEmojiOutput`) run on the main thread and consume ~20–40ms per frame at 720p, leaving little budget for React rendering and input handling. Moving them off the main thread via a Web Worker unblocks the UI.

**How:** Created `src/worker/ascii-worker.ts` with `WorkerInput` / `WorkerOutput` / `WorkerConfig` interfaces and a `ctx.onmessage` handler that dispatches by `colorMode`. Processing functions are stubs for now — actual logic migration is the next task. Added `worker: { format: 'es' }` to Vite config so the worker is bundled as a separate ES module chunk. Added `asciiWorker: Worker | null` to `AppState`, initialized with `new AsciiWorker()` on store creation. See ADR-007 in `decisions.md`.
