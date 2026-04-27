# Changelog

---


# Changelog

> **Session-by-session record of significant changes.**
> Append a new entry at the top after each session that modifies files.
> Format: date, one-line summary, changed files, motivation, implementation notes.

---

## 2026-04-26 — Remove histogram equalization and noise filter

**Changed:** `src/worker/ascii-worker.ts`, `src/store/index.ts`, `src/components/ModeControls.tsx`, `docs/features/rendering-modes.md`, `docs/features/webcam-ascii.md`, `docs/infra/decisions.md`

**Why:** Histogram equalization over-brightened most webcam scenes — aggressive CDF stretching pushed midtones too high, producing washed-out output. The manual contrast and intensity sliders already provide sufficient dynamic-range control. The noise filter added grain artifacts that broke character readability and was rarely used.

**How:**
- Deleted `applyHistogramEqualization()` from the worker and removed `histogramEqualization` from `WorkerConfig`, store state, and both worker postMessage configs.
- Deleted the noise injection loop from `processMonochrome` and removed `noise` from `WorkerConfig`, store state, and both worker postMessage configs.
- Removed the `HISTOGRAM EQ` toggle button and `NOISE` slider from `ModeControls.tsx`.
- Updated `rendering-modes.md` and `webcam-ascii.md` to remove references to both features and renumbered pipeline steps.
- Added ADR-012 documenting the removal rationale.

---

## 2026-04-26 — Reverse DETAIL slider scale and add 2px display font size floor

**Changed:** `src/components/ModeControls.tsx`, `src/components/AsciiDisplay.tsx`, `docs/features/rendering-modes.md`, `docs/infra/decisions.md`

**Why:** The initial DETAIL slider used a direct scale where lower numbers meant more detail. Users found this counterintuitive — "20 detail" should mean more detail than "2 detail". Additionally, at extreme detail settings the browser's font rendering collapsed complex characters into faint smudges, making the output look like opacity had dropped.

**How:**
- Reversed the slider mapping: `storeFontSize = 22 - sliderValue`. Slider 20 → store fontSize 2 (highest detail). Slider 2 → store fontSize 20 (lowest detail).
- Added `Math.max(2, computedSize)` floor in `AsciiDisplay` so display font size never drops below 2px. This prevents character shapes from collapsing into unreadable single-pixel artifacts while still allowing ultra-dense ASCII textures.
- Updated ADR-011 in `decisions.md` to reflect reversed scale and 2px floor.

---

## 2026-04-26 — Decouple detail density from display font size, replace FONT with DETAIL slider

**Changed:** `src/components/AsciiDisplay.tsx`, `src/components/ModeControls.tsx`, `src/store/index.ts`, `docs/features/rendering-modes.md`, `docs/infra/decisions.md`

**Why:** The `fontSize` slider conflated two concerns: (1) how many characters sampled the source image (detail density), and (2) how large each character appeared on screen. The display used `transform: scale(N)` to fit the grid into the viewport, which created drift artifacts at fractional scale factors and made the slider unintuitive — smaller font sizes produced "wider" images because more columns were generated, but the display zoomed out to compensate. Users found this confusing.

**How:**
- Renamed the slider label from `FONT` to `DETAIL` and removed the `px` suffix. The value now represents source pixels per ASCII character (range 4–20, default 8).
- Changed `computeAsciiWidth` formula from `floor(sourceWidth / (fontSize * 0.6))` to `floor(sourceWidth / fontSize)` with a 20-column minimum cap.
- Removed CSS `scale()` transform from `AsciiDisplay`. The inner span now uses only `translate(-50%, -50%)` for centering.
- Added `displayFontSize` state to `AsciiDisplay` that auto-computes from container measurements via `ResizeObserver`. The text renders at its natural size to fill the container — no transform scaling.
- Added ADR-011 in `decisions.md` documenting the rationale and tradeoffs.

---

## 2026-04-25 — Fix ASCII display centering drift by replacing flexbox with absolute positioning

**Changed:** `src/components/AsciiDisplay.tsx`, `docs/features/rendering-modes.md`

**Why:** When `fontSize` changed, the scaled ASCII output was sometimes visibly shifted left or right instead of perfectly centered. This happened because `transform: scale()` creates a visual bounding box larger than the element's layout box, and flexbox centers the layout box — not the visual content. At different scale factors the mismatch caused a persistent horizontal offset.

**How:**
- Replaced flexbox centering (`flex items-center justify-center`) on the `<pre>` with `relative` positioning.
- The inner content span is now `absolute top-1/2 left-1/2` with `transform: translate(-50%, -50%) scale(N)`. The `translate(-50%, -50%)` is mathematically exact: it centers the element by shifting it back by half its own size, regardless of the scale factor. This eliminates the drift that flexbox centering caused.
- Added `requestAnimationFrame` batching inside the `ResizeObserver` callback so rapid scale re-calculations during font size changes don't thrash the layout.

---

## 2026-04-25 — Make ASCII `<pre>` fill its container to avoid container resizing on control changes

**Changed:** `src/components/AsciiDisplay.tsx`, `src/components/WebcamPage.tsx`, `src/components/ImagePage.tsx`, `docs/features/rendering-modes.md`

**Why:** When users changed `fontSize`, `intensity`, or `contrast`, the `<pre>` tag sized itself to its content, causing the display container to resize and the layout to shift. The user wanted a fixed-size display that fills the available space regardless of the ASCII grid dimensions.

**How:**
- `AsciiDisplay.tsx` — Added `w-full h-full` to the `<pre>` tag. Removed the `--cols`/`--rows` CSS variables and the dead `asciiWidth` / `React` imports that computed them. The `<pre>` now always stretches to its parent's full dimensions.
- `WebcamPage.tsx` — Changed the ASCII wrapper from `absolute inset-0 flex items-center justify-center p-4` to `absolute inset-0 p-4`, removing the flex centering so the `<pre>` fills the space.
- `ImagePage.tsx` — Same change on the split-pane ASCII cell wrapper: removed `flex items-center justify-center` so the `<pre>` fills the cell.

---

## 2026-04-25 — Add centered zoom-to-fit scaling to ASCII display

**Changed:** `src/components/AsciiDisplay.tsx`, `docs/features/rendering-modes.md`

**Why:** Making the `<pre>` full-size left the ASCII text sitting in the top-left corner at its natural font size. The user wanted the output centered and scaled up to fill as much of the viewport as possible, like `object-fit: contain`.

**How:**
- Added a `ResizeObserver` that watches both the `<pre>` container and an inner `<span>` wrapping the ASCII text. On every resize it computes `scale = min(containerW / contentW, containerH / contentH)`.
- The inner span applies `transform: scale(N)` with `transform-origin: center` so the art is centered and fills the container without distortion.
- The `<pre>` uses `display: flex; align-items: center; justify-content: center` and `overflow: hidden` so the scaled content is centered and clipped neatly.
- Monochrome and color modes both use the same inner-span structure; color mode uses `dangerouslySetInnerHTML` on the span, monochrome renders it as a text child.

---

## 2026-04-25 — Restructure ModeControls into horizontal bar with upward settings dropdown

**Changed:** `src/components/ModeControls.tsx`, `src/components/WebcamPage.tsx`, `src/components/ImagePage.tsx`, `docs/features/rendering-modes.md`

**Why:** User requested a cleaner UI where all configuration controls are in a horizontal bar rather than a vertical stack. On responsive/mobile view, the bar should wrap gracefully while secondary controls (sliders, color picker, histogram EQ) are tucked into an upward-opening dropdown toggled by a settings button.

**How:**
- `ModeControls.tsx` — Restructured from a fragment of vertical rows into a `relative` container with two parts:
  1. **Horizontal bar** (`flex items-center gap-2 flex-wrap justify-center`): mode toggle, charset picker, and a ⚙️ settings button. Vertical dividers (`w-px h-6`) separate groups on desktop.
  2. **Upward dropdown** (`absolute bottom-full left-1/2 -translate-x-1/2 mb-2`): contains color swatches + `HexColorPicker` (monochrome only), FONT/NOISE/INTENSITY/CONTRAST sliders, and HISTOGRAM EQ toggle. Sliders use `flex-1` so they fill the dropdown width.
- Removed `showColorPicker` / `setShowColorPicker` props from `ModeControlsProps`; state is now internal. Removed the standalone color circle button from `WebcamPage.tsx` and `ImagePage.tsx` — color selection now lives inside the settings dropdown.
- The bar uses `flex-wrap` so on narrow screens it naturally wraps to multiple lines instead of overflowing horizontally.

---

## 2026-04-25 — Replace gamma with true contrast; fix segBusy race condition; apply contrast/intensity in color mode

**Changed:** `src/worker/ascii-worker.ts`, `src/store/index.ts`, `docs/features/rendering-modes.md`

**Why:** The contrast slider was labeled "CONTRAST" but implemented as `Math.pow(normalized, contrast)` — a gamma curve that crushes midtones toward black. When users increased contrast above 1.0, the background would disappear into crushed blacks and the visible ASCII mass would perceptually "shift left." This was reported as a bug where "changing contrast completely breaks the view."

**How:**
1. **True contrast formula** — Replaced gamma (`Math.pow(x, c)`) with linear scaling around the midpoint: `(normalized - 0.5) * contrast + 0.5`. Values above 1.0 push midtones symmetrically toward black and white extremes; values below 1.0 compress toward the midpoint. Clamped to `[0, 1]` before scaling back to `[0, 100]`.
2. **Applied to both modes** — The contrast and intensity post-processing block now runs in `processColor` as well as `processMonochrome`. Previously `processColor` ignored both sliders entirely.
3. **Fixed segBusy race condition** — In `startSegmentationLoop`, if `updateAsciiOutput` returned early (because `workerBusy` was still `true`), `segBusy = false` never executed, permanently stalling the monochrome segmentation queue. Wrapped the call in `try/finally` so `segBusy` always resets.
4. Updated `rendering-modes.md` Data Model table and both mode sections to document the new contrast behavior.

---

## 2026-04-25 — Add intensity and contrast sliders to ModeControls UI (Task 55)

**Changed:** `src/components/ModeControls.tsx`, `src/components/ImagePage.tsx`, `docs/features/rendering-modes.md`

**Why:** Task 55 — expose the `intensity` and `contrast` depth controls that already exist in the store and worker pipeline but had no UI. Users need a way to adjust brightness multiplier and gamma exponent in real-time to tune the ASCII output.

**How:**
- Added `intensity` and `contrast` to `ModeControls` component state reads, and two new range inputs (0.5–2.0, step 0.1) with `.toFixed(1)` readouts. Labels use the same "FONT"/"NOISE" pattern: "INTENSITY" and "CONTRAST".
- Extended `ModeControlsProps` with optional `onIntensityChange` and `onContrastChange` callbacks, mirroring the existing `onFontSizeChange` pattern. Both sliders invoke their respective callback when changed.
- Wired `onIntensityChange={handleReprocess}` and `onContrastChange={handleReprocess}` in `ImagePage` so uploaded images are reconverted when either slider changes.
- Updated `rendering-modes.md` Data Model table to include `noise`, `intensity`, `contrast`, and `histogramEqualization` fields. Updated Dependencies section to list all ModeControls UI elements.

---

## 2026-04-25 — Implement font size control with grid dimensions (Task 54)

**Changed:** `src/store/index.ts`, `src/components/AsciiDisplay.tsx`, `src/components/ModeControls.tsx`, `src/components/ImagePage.tsx`, `docs/features/rendering-modes.md`, `docs/features/webcam-ascii.md`, `docs/features/depth-improvement.md`

**Why:** Task 54 — add a font size slider so users can control ASCII grid density. Smaller fonts produce more columns and finer detail; larger fonts produce fewer columns and coarser detail. Previously `asciiWidth` was fixed at 120 (or 80 for portrait), and the display font size was auto-computed via CSS `clamp()` to fit the viewport. This gave users no control over detail level.

**How:**
- Added `computeAsciiWidth(sourceWidth, fontSize)` helper in the store: `floor(sourceWidth / (fontSize * 0.6))`. This derives the column count from the source image/video width and the user's chosen font size.
- Updated `updateAsciiOutput` and `updateColorAsciiOutput` to compute `asciiWidth` from `imageData.width` and `fontSize` before posting to the worker, and update Zustand state so `AsciiDisplay` receives the correct column count.
- Removed the one-time portrait-mode `asciiWidth: 80` override from `startRenderLoop`. Portrait video naturally produces fewer columns because `videoWidth` is smaller.
- Updated `startRenderLoop` perf metrics to compute `asciiWidth` directly from `videoWidth` and `fontSize` for accurate grid size reporting.
- Changed `AsciiDisplay` to render at the fixed `fontSize` from store (`fontSize: 'Npx'`) instead of the previous `clamp()` expression that auto-fitted to the viewport.
- Added a "FONT" slider to `ModeControls` (range 6–20px, default 12) with a numeric readout (`12px`). Added `onFontSizeChange` optional prop so `ImagePage` can trigger reprocessing when the slider changes.
- Wired `onFontSizeChange={handleReprocess}` in `ImagePage` so uploaded images are reconverted when font size changes.
- Updated `rendering-modes.md` Data Model table to include `fontSize` and `asciiWidth`, and updated Component Rendering section to document fixed font size + dynamic grid width.
- Updated `webcam-ascii.md` to replace the portrait check section with a "Grid dimension computation" section, and updated the cell dimensions docs to mention dynamic `asciiWidth`.
- Updated `depth-improvement.md` to mark Task 54 as completed.

---

## 2026-04-25 — Implement histogram equalization toggle (Task 53)

**Changed:** `src/worker/ascii-worker.ts`, `src/store/index.ts`, `src/components/ModeControls.tsx`, `docs/features/rendering-modes.md`, `docs/features/depth-improvement.md`

**Why:** Task 53 — add histogram equalization to enhance detail visibility in shadows and highlights. Webcam images often have compressed dynamic range, causing facial features to blend into the same brightness bucket and lose detail in the ASCII output.

**How:**
- Added `histogramEqualization: boolean` to `WorkerConfig` interface and destructured it in both `processMonochrome` and `processColor`.
- Implemented `applyHistogramEqualization(brightness: Float32Array)` using a 256-bin histogram + CDF approach. Maps each brightness value through the cumulative distribution to spread the full [0, 100] range evenly across the image.
- Applied equalization to `cellBrightness` after cell-averaging and before gamma/contrast adjustments in both monochrome and color pipelines. This ensures the character mapping (which depends on brightness) uses the full charset range.
- Updated `updateAsciiOutput` and `updateColorAsciiOutput` in the store to pass `histogramEqualization` through the worker config.
- Added a toggle button in `ModeControls.tsx` labeled "HISTOGRAM EQ" that switches between white active and gray inactive styling, consistent with the existing mode/charset buttons. Default is ON (`true`).
- Updated `rendering-modes.md` to include histogram equalization in the monochrome pipeline description.
- Updated `depth-improvement.md` to mark Task 53 as completed.

---

---

## 2026-04-25 — Implement ordered dithering (Bayer 4x4) (Task 52)

**Changed:** `src/constants/character-sets.ts`, `src/worker/ascii-worker.ts`, `docs/features/webcam-ascii.md`, `docs/features/rendering-modes.md`

**Why:** Task 52 — add Bayer 4x4 ordered dithering before character mapping for smoother gradients. The number of characters in any charset is limited (5–70), which creates visible banding in smooth gradient regions. Dithering spatially distributes quantization error, creating the illusion of intermediate brightness levels by alternating adjacent characters in a 4×4 tile pattern.

**How:**
- Added `BAYER_MATRIX_4X4` constant to `src/constants/character-sets.ts` with the classic 4×4 Bayer ordered dithering matrix.
- Applied dithering in `processMonochrome` (worker) after unsharp masking and before character mapping. The threshold `(bayer[y % 4][x % 4] / 16 - 0.5) * step` is centered around zero and scaled to one character step (`100 / (charset.length - 1)`).
- Applied the same dithering logic in `processColor` (worker) so both monochrome and color modes benefit from smoother gradients.
- Clamped `charIndex` to `[0, charset.length - 1]` to prevent out-of-bounds indices at the extremes.
- Updated `webcam-ascii.md` pipeline docs: inserted new Step 7 (Bayer dithering), renumbered character mapping to Step 8, updated last-updated date and dependencies.
- Updated `rendering-modes.md` Color Mode docs to include the dithering formula and explanation, updated last-updated date and dependencies.

---

## 2026-04-25 — Implement noise control (Task 51)

**Changed:** `src/worker/ascii-worker.ts`, `src/store/index.ts`, `src/components/ModeControls.tsx`, `docs/features/webcam-ascii.md`, `docs/features/depth-improvement.md`

**Why:** Task 51 — add noise/grain effect to the grayscale (monochrome) pipeline. Film grain breaks banding in smooth gradient regions and adds texture to the ASCII output.

**How:**
- Added `noise: number` to `WorkerConfig` interface and destructured it in `processMonochrome`.
- Applied `±noise` random offset to each pixel's R, G, B channels in-place on the `ImageData.data` buffer before white balance and LAB processing. `Uint8ClampedArray` auto-clamps to [0, 255].
- Updated `updateAsciiOutput` and `updateColorAsciiOutput` in the store to pass `noise` through the worker config object.
- Added a slider control in `ModeControls.tsx` labeled "NOISE" with range 0–50 and a numeric readout.
- Updated `webcam-ascii.md` pipeline docs to include the new Step 2 (noise/grain) and renumbered subsequent steps.
- Updated `depth-improvement.md` to mark Task 51 as completed.

---

## 2026-04-17 — Remove emoji mode from codebase and update all docs

**Changed:** `src/store/index.ts`, `src/worker/ascii-worker.ts`, `src/constants/character-sets.ts`, `src/components/AsciiDisplay.tsx`, `src/components/ImagePage.tsx`, `src/components/ModeControls.tsx`, `src/components/WebcamPage.tsx`, `src/EmojiGrid.tsx` (deleted), `docs/features/rendering-modes.md`, `docs/features/screenshot.md`, `docs/features/webcam-ascii.md`, `docs/infra/decisions.md`, `docs/infra/deployment.md`, `docs/infra/patterns.md`

**Why:** Emoji mode added ~300 LOC and bundle weight with limited user value while complicating every feature that needed a third branch. Two modes (monochrome + color) are sufficient.

**How:** Deleted `EmojiGrid.tsx`, `emojiOutput` state, `updateEmojiOutput` action, `EMOJI_COLOR_PALETTE`, `rgbToNearestEmoji`, `processEmoji` worker function. Narrowed `colorMode` type to `'monochrome' | 'color'`. Updated all feature and infra docs to remove emoji references. Added ADR-010 (emoji removal decision) and revised ADR-004 to reflect two modes instead of three.

---

## 2026-04-16 — Create V2 PRD and add 20 tasks for depth improvement

**Changed:** `.taskmaster/docs/v2-depth-improvement.md` (created), TaskMaster tasks 41-60 (added)

**Why:** User wants to (1) remove emoji mode completely from code and docs, and (2) enhance ASCII depth to achieve near-photorealistic webcam representation with new controls.

**How:** Created comprehensive PRD with: emoji removal requirements, grayscale pipeline improvements (luminosity conversion, dithering, histogram equalization), new controls (font size 6-20px, noise, intensity, contrast). Added 20 tasks to TaskMaster for implementation.

---

## 2026-04-16 — Update TaskMaster from CLI to MCP

**Changed:** `.taskmaster/CLAUDE.md`, `CLAUDE.md`

**Why:** TaskMaster was previously configured to use CLI commands. Updated to use MCP tools instead, matching the project template.

**How:** Replaced CLI command reference in `.taskmaster/CLAUDE.md` with MCP tools table. Updated all CLI references in main `CLAUDE.md` to use MCP tool names (e.g., `task-master next` → `mcp__task-master-ai__next_task`). Added MCP connection check at session start. Already documented in project-template as ADR-002.

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

## 2026-04-16 — Generate V2 task breakdown: Depth Improvement & Emoji Removal

**Changed:** .taskmaster/docs/v2-depth-improvement.md, docs/features/depth-improvement.md, .taskmaster/config.json, .taskmaster/state.json, docs/infra/file-tree.md

**Why:** PRD submitted for ASCII Camera V2. Requires structured task breakdown for implementation.

**How:** Analyzed codebase structure and generated 20 atomic tasks in 4 phases: (1) Emoji removal (tasks 1-14), (2) Depth infrastructure (tasks 15-16), (3) Grayscale+dithering (tasks 17-20). Each task has acceptance criteria, dependency ordering, pseudo-code, and testing strategy. Output as JSON via StructuredOutput, auto-imported into TaskMaster. Feature doc created at docs/features/depth-improvement.md.
