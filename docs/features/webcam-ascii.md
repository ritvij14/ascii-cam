# Webcam ASCII

> **Feature doc for real-time webcam-to-ASCII conversion.**
> Covers webcam lifecycle, segmentation, render loop, and ASCII pipeline.
> Status: Stable
> Last updated: 2026-04-25 (Added Bayer 4x4 ordered dithering)

---

## Index

- [Overview](#overview)
- [Data Model](#data-model)
- [Lifecycle](#lifecycle) — start/stop sequence, acquire/release pairs
- [Segmentation](#segmentation) — MediaPipe init, mask extraction, temporal smoothing
- [Render Loop](#render-loop) — frame capture, portrait detection, frame skip
- [ASCII Pipeline (Monochrome)](#ascii-pipeline-monochrome) — LAB brightness, white balance, unsharp mask
- [Tile-based Incremental Processing](#tile-based-incremental-processing) — removed; every cell recomputed every frame
- [Web Worker](#web-worker)
- [Dependencies](#dependencies)

---

## Overview

The webcam feature captures live video from the user's camera, extracts each frame to a canvas, runs MediaPipe selfie segmentation to remove the background, then converts the foreground to ASCII art at ~30fps.

The entire pipeline lives in `src/store/index.ts`. Components are UI-only — they call `startWebcam()` and `stopWebcam()` and render whatever is in `asciiOutput`.

**Happy path:**

1. User clicks "Start Webcam" → component calls `startWebcam()`
2. `startWebcam` lazy-inits segmentation, requests `getUserMedia`, starts `startRenderLoop()`
3. **Stage 1** (rAF, ~30fps): video drawn to canvas → mirrored → `ImageData` extracted → for color dispatched to worker directly; for monochrome written to `segQueueFrame`
4. **Stage 2** (rAF, MediaPipe throughput ~20fps): reads `segQueueFrame` → `segmenter.send()` → temporal-smoothed mask applied → masked `ImageData` posted to worker via `updateAsciiOutput`
5. **Stage 3** (worker): computes ASCII string (white balance, LAB L*, unsharp mask) → posts result back → `onmessage` writes `asciiOutput` → `AsciiDisplay` re-renders the `<pre>`

Stages 1 and 2 run in independent `requestAnimationFrame` loops. If Stage 2 (segmentation) is slow, Stage 1 continues capturing at full 30fps — frames are dropped at the queue boundary rather than blocking video capture.

---

## Data Model

Webcam-specific state fields in `AppState` (`src/store/index.ts:5`):

| Field | Type | Description |
|---|---|---|
| `isWebcamActive` | `boolean` | Whether the webcam stream is currently running |
| `webcamError` | `string \| null` | Error message shown inline in UI; set in `startWebcam` catch block |
| `videoRef` | `HTMLVideoElement \| null` | DOM ref registered via ref callback in `src/components/WebcamPage.tsx` |
| `streamRef` | `MediaStream \| null` | Active `getUserMedia` stream; stopped in `stopWebcam` |
| `canvasRef` | `HTMLCanvasElement \| null` | Hidden canvas used to extract `ImageData` each frame |
| `maskCanvasRef` | `HTMLCanvasElement \| null` | Hidden canvas that MediaPipe writes the segmentation mask to |
| `segmenter` | `SelfieSegmentation \| null` | MediaPipe instance; initialized in `initSegmentation` |
| `segmentationLoading` | `boolean` | True until segmenter is ready; skips mask during init |
| `animationFrameId` | `number \| null` | Stage 1 rAF handle; stored so `stopRenderLoop` can cancel it |
| `segAnimationFrameId` | `number \| null` | Stage 2 rAF handle; stored so `stopSegmentationLoop` can cancel it |
| `asciiWidth` | `number` | Grid width in characters; auto-reduced to 80 in portrait mode |
| `asciiOutput` | `string` | Newline-separated ASCII string; rendered by `AsciiDisplay` |
| `previousMaskData` | `Uint8ClampedArray \| null` | Last frame's mask; used for temporal smoothing |
| `asciiWorker` | `Worker \| null` | Web Worker instance for off-thread conversion; `null` at store init, set by `getWorker()` on first frame |
| `workerBusy` | `boolean` | Single-slot mailbox flag; `true` while worker is processing; frames dropped while `true` |
| `perfMetrics` | `object \| null` | FPS, frame/seg/ascii times, resolution, grid size |

---

## Lifecycle

### Acquire/release pairs

| Acquire | Release | What it owns |
|---|---|---|
| `startWebcam` | `stopWebcam` | `getUserMedia` stream, `streamRef`, `isWebcamActive` |
| `initSegmentation` | `stopWebcam` | `SelfieSegmentation` instance, `segmenter` |
| `startRenderLoop` | `stopRenderLoop` | Stage 1 rAF loop (`animationFrameId`); also calls `startSegmentationLoop` |
| `startSegmentationLoop` | `stopSegmentationLoop` | Stage 2 rAF loop (`segAnimationFrameId`), `segQueueFrame`, `segBusy` |

Release order in `stopWebcam` matters: `stopRenderLoop` is called first (cancels the rAF), then the stream is stopped. The loop reads the stream on every frame — stopping the stream while the loop is running causes errors.

### `startWebcam` (`src/store/index.ts:570`)

```
1. Guard: return early if videoRef is null
2. Clear webcamError
3. Lazy-init segmentation: if segmenter is null, call initSegmentation()
4. getUserMedia: { video: { height: { ideal: isMobile ? 480 : 720 } }, audio: false }
5. Assign stream to videoRef.srcObject
6. set({ streamRef, isWebcamActive: true })
7. Call startRenderLoop()
```

**Error handling:** any thrown error (permission denied, device not found) is caught and written to `webcamError`. The UI reads this field and displays it inline below the "Start Webcam" button.

**Mobile resolution:** `window.innerWidth < 768` triggers 480p instead of 720p to reduce per-frame processing cost.

### `stopWebcam` (`src/store/index.ts:697`)

```
1. Call stopRenderLoop() — cancels rAF immediately
2. Stop all tracks on streamRef
3. Set videoRef.srcObject = null
4. set({ streamRef: null, isWebcamActive: false, segmenter: null, segmentationLoading: true })
```

Nulling `segmenter` on stop means the next `startWebcam` will re-initialize it. `segmentationLoading: true` is reset here so the loading state is fresh for the next start.

---

## Segmentation

### `initSegmentation` (`src/store/index.ts:445`)

Loads MediaPipe selfie segmentation from CDN:

```
locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
```

Options:
- `modelSelection: 1` — landscape model (more accurate, acceptable latency)
- `selfieMode: true` — mirrors input to match front-facing camera

The `onResults` callback draws the segmentation mask bitmap directly to `maskCanvasRef`. The mask is a grayscale image where white = foreground (person), black = background.

Init errors are caught and logged — `segmentationLoading` is set to `false` regardless so the render loop proceeds without masking rather than hanging.

### Mask extraction (inside `startRenderLoop`)

```ts
await segmenter.send({ image: videoRef });
maskData = maskCtx.getImageData(0, 0, maskCanvasRef.width, maskCanvasRef.height);
```

`segmenter.send()` is async — MediaPipe processes the frame and fires `onResults` synchronously before the promise resolves. After `send()` returns, `maskCanvasRef` contains the mask for the current frame.

**Segmentation is only run in monochrome mode**. Color mode skips it — it uses the full unmasked frame.

### Temporal smoothing (`src/store/index.ts:146`)

Raw segmentation masks flicker at transitions between frames. The mask is smoothed by blending with the previous frame:

```
smoothedMask[i] = 0.7 * currentMask[i] + 0.3 * previousMask[i]
```

70/30 blend: recent frame dominates, previous frame damps noise. The previous mask (`previousMaskData`) is stored in state and updated each frame.

After smoothing, each pixel's alpha channel is multiplied by the smoothed mask value with gamma correction (`alpha^0.8`), which sharpens the foreground edge slightly:

```ts
const gammaCorrectedAlpha = Math.pow(alpha, 0.8);
masked.data[i]     = masked.data[i]     * gammaCorrectedAlpha; // R
masked.data[i + 1] = masked.data[i + 1] * gammaCorrectedAlpha; // G
masked.data[i + 2] = masked.data[i + 2] * gammaCorrectedAlpha; // B
```

---

## Render Loop

### `startRenderLoop` (`src/store/index.ts:251`)

The loop runs via `requestAnimationFrame`. It is throttled to ~30fps using a closure-local timestamp variable:

```ts
let lastFrameTime = 0;
const targetFrameMs = 33; // ~30fps

if (timestamp - lastFrameTime < targetFrameMs) {
  set({ animationFrameId: requestAnimationFrame(captureFrame) });
  return; // skip this frame
}
```

`lastFrameTime` is a closure variable (not store state) — updating it doesn't trigger re-renders. It is updated *after* processing completes, ensuring the 33ms gap is measured from end-of-frame to start-of-next rather than start-to-start.

### Grid dimension computation

`asciiWidth` is no longer a fixed default. It is computed per-frame from the video width and the user's chosen `fontSize`:

```ts
asciiWidth = Math.floor(videoWidth / (fontSize * 0.6));
```

This computation also runs inside `updateAsciiOutput` and `updateColorAsciiOutput` before posting to the worker, ensuring the worker always receives the correct column count. Portrait video naturally produces fewer columns because `videoWidth` is smaller.

### Stage 1 — per-frame sequence (`captureFrame`)

```
1. Check timestamp — skip if < 33ms since last frame
2. Check videoRef.readyState === HAVE_ENOUGH_DATA
3. Resize canvas to video dimensions
4. Mirror-draw video to canvas: ctx.scale(-1, 1) then drawImage
5. Extract imageData from canvas
6. Dispatch by colorMode (no blocking):
   - monochrome → segQueueFrame = imageData (overwrite; Stage 2 picks up newest)
   - color → updateColorAsciiOutput(imageData)
7. Compute asciiWidth from videoWidth and fontSize for perfMetrics
8. Update perfMetrics (frameTimeMs, fps, resolution, gridSize)
9. Schedule next frame: set({ animationFrameId: requestAnimationFrame(captureFrame) })
```

### Stage 2 — segmentation loop (`segLoop` in `startSegmentationLoop`)

```
1. If colorMode !== monochrome OR segQueueFrame === null OR segBusy: skip, reschedule
2. Take frame: frame = segQueueFrame; segQueueFrame = null; segBusy = true
3. await segmenter.send({ image: canvasRef })
4. Read maskData from maskCanvasRef
5. Apply temporal smoothing (70/30 blend with previousMaskData)
6. Apply gamma-corrected mask blend to frame pixels
7. Call updateAsciiOutput(maskedImageData) → posts to worker
8. segBusy = false
9. Update perfMetrics.segTimeMs
10. Schedule next iteration: set({ segAnimationFrameId: requestAnimationFrame(segLoop) })
```

Stage 2 uses `canvasRef` (which Stage 1 always keeps current) as the segmentation source. If Stage 1 draws a newer frame to `canvasRef` while Stage 2 is awaiting `segmenter.send()`, the mask reflects the newer frame — the slight mismatch is imperceptible and temporal smoothing handles any edge noise.

The video is mirrored horizontally (`ctx.scale(-1, 1)`) so it matches the natural "mirror" expectation for webcam output.

---

## ASCII Pipeline (Monochrome)

`updateAsciiOutput(imageData)` at `src/store/index.ts` (main thread portion) + `processMonochrome` in `src/worker/ascii-worker.ts` (worker portion).

The pipeline is split across two threads:
- **Stage 2 / main thread** (`startSegmentationLoop`): mask blending + temporal smoothing, then calls `updateAsciiOutput`
- **`updateAsciiOutput`** (main thread): mailbox check + transfer to worker
- **Worker thread** (`processMonochrome`): all pixel math

### Step 1 — Apply segmentation mask (Stage 2)

Stage 2 applies the temporally-smoothed mask to the queued `ImageData` before calling `updateAsciiOutput`. See [Stage 2 sequence](#stage-2--segmentation-loop-segloop-in-startsegmentationloop) above.

If segmentation errors, the unmasked frame is used. `updateAsciiOutput` now receives an already-masked `ImageData` and simply checks the mailbox and posts to the worker.

### Step 2 — White balance (Gray World algorithm, worker thread)

Sample every 4th pixel (every 16th byte) across the frame to compute mean R, G, B:

```
grayMean = (meanR + meanG + meanB) / 3
wbR = grayMean / meanR  (correction factor)
wbG = grayMean / meanG
wbB = grayMean / meanB
```

This normalizes the average color of the frame to neutral gray, compensating for cast from artificial lighting.

### Step 3 — Color temperature correction

Detect dominant color temperature from the ratio `(meanR + meanG) / (meanB + 1)`:
- Ratio > 2.5 → warm light (tungsten/sunset): reduce R by 8%, boost B by 8%
- Ratio < 1.5 → cool light (fluorescent/overcast): boost R by 8%, reduce B by 8%

### Step 4 — LAB brightness (first pass)

For each cell in the ASCII grid:
1. Average the RGB of all pixels in the cell (cellWidth × cellHeight pixels)
2. Convert average RGB → linear sRGB → CIE XYZ Y → CIE LAB L* (perceptual lightness, 0–100)
3. Store in `Float32Array cellBrightness[y * asciiWidth + x]`

LAB L* is used instead of simple luminance because it matches human perception — equal steps in L* produce equal-looking brightness differences in the output.

#### WebGL2 Acceleration (Fast Path)

**Why:** Per-pixel LAB conversion is computationally expensive (multiple matrix multiplications, cube roots, conditional logic). At 720p with 30fps, the CPU processes ~27 million pixels per second, causing frame drops on lower-end devices.

**How implemented:** When WebGL2 is available (Chrome, Firefox, Edge; Safari ≥16.4), the per-pixel LAB L* calculation is offloaded to a GPU fragment shader:

1. **Feature detection:** `initWebGL()` checks for `OffscreenCanvas` and `webgl2` context support
2. **One-time setup:** Compile vertex/fragment shaders, create fullscreen quad VAO, allocate reusable texture/framebuffer
3. **Per-frame execution:**
   - Upload `ImageData` to GPU texture
   - Render fullscreen quad with shader that computes: RGB → white balance → color temp → linear sRGB → XYZ → LAB L*
   - Read pixel brightness values back via `gl.readPixels()`
   - Average per-cell brightness on CPU (lightweight compared to per-pixel LAB)

**Fallback:** If WebGL2 is unavailable (Safari <16.4, old GPUs), the original CPU path executes—identical output, slower execution.

**Expected performance:** 10–100× faster per-pixel processing vs CPU, enabling consistent 30fps on integrated graphics laptops and mid-range phones.

**Known pitfalls (fixed):**

- **Texture value normalization:** `gl.texImage2D` with `UNSIGNED_BYTE` automatically normalizes pixel values to `[0, 1]` when sampled in a shader. The original shader mistakenly treated them as `[0, 255]` and divided by 255, producing near-zero luminance everywhere → blank monochrome output. Fix: removed the `/ 255.0` division; clamp to `1.0` instead of `255.0`.
- **Vertical inversion:** `gl.readPixels` reads the framebuffer from row 0 upward (bottom of GL framebuffer first). `ImageData` row 0 is the top of the image, but WebGL stores it at texture v=0 (bottom). The original tex coords had `(0,1)` at the bottom-left vertex — this mapped v=1 (bottom of original image) to the bottom of the framebuffer, so `readPixels` returned the image upside-down. Fix: natural tex coords `(0,0) → (1,0) → (0,1) → (1,1)` so `readPixels` row 0 = top of original image.

**Files:** `src/worker/ascii-worker.ts` — `initWebGL()`, `computeBrightnessWithWebGL()`, updated `processMonochrome()`

Cell dimensions (computed in the worker from the source image size and dynamically-derived `asciiWidth`):

```ts
const cellWidth  = Math.floor(imgWidth / asciiWidth);
const cellHeight = Math.floor(cellWidth * 2); // 2:1 aspect ratio for monospace chars
const height     = Math.floor(imgHeight / cellHeight);
```

`asciiWidth` is derived from the user's `fontSize` and the source width before each frame is posted to the worker:

```ts
asciiWidth = Math.floor(sourceWidth / (fontSize * 0.6));
```

### Step 5 — Unsharp masking (second pass)

For each cell, compute the average L* of its 3×3 neighborhood (blur), then:

```
sharpened = original + 0.5 * (original - blurred)
```

`k = 0.5` is a moderate sharpening strength — enough to make character edges crisp without amplifying noise. Clamped to [0, 100].

### Step 6 — Bayer 4x4 ordered dithering

Before character mapping, Bayer 4x4 ordered dithering is applied to increase the perceived number of brightness levels beyond the character set size:

```ts
const step = 100 / (charset.length - 1);
const bayerThreshold = (BAYER_MATRIX_4X4[y % 4][x % 4] / 16 - 0.5);
const dithered = sharpened + bayerThreshold * step;
```

The Bayer matrix spatially distributes quantization error across a 4×4 tile, creating the illusion of intermediate brightness levels by alternating between adjacent characters. The threshold is centered around zero and scaled to one character step.

### Step 7 — Character mapping

```ts
const charIndex = Math.max(0, Math.min(charset.length - 1, Math.floor((dithered / 100) * (charset.length - 1))));
parts.push(charset[charIndex]);
```

Maps dithered L* (0–100) linearly to the charset index. Darker → earlier charset character (space/dot), brighter → later character (dense block).

The active charset is `CHARACTER_SETS[selectedCharset].characters` from `src/constants/character-sets.ts`. Default charset has 10 characters from space to `@`.

### Output

`parts.join('')` is returned from `processMonochrome` and posted back to the main thread via `ctx.postMessage`. The store's `onmessage` handler writes it to `asciiOutput` and clears `workerBusy`. `AsciiDisplay` renders this in a `<pre>` tag.

---

## Tile-based Incremental Processing

> **Removed.** This optimization was implemented (Task 37) and subsequently removed due to visual artifacts.

**What it was:** The frame was divided into an 8×6 grid. Tiles where fewer than 5% of pixels changed between frames were skipped, reusing cached cell values. The intent was to reduce CPU work for static regions.

**Why it was removed:** Even with a percentage-based diff algorithm (replacing the original average-diff approach), the coarse 8×6 grid caused two visible artifacts:
1. **Ghosting** — when the subject's head partially overlapped a tile, the "vacated" half of the tile wasn't reliably detected as changed, leaving ghost characters at the old head position.
2. **Movement distortion** — slight head movements crossing tile boundaries created a torn look where one tile updated and an adjacent tile did not.

Both fixes (lowering thresholds, using max-diff, adding neighbour propagation) were evaluated but the fundamental problem — that a coarse spatial partition cannot cleanly track sub-tile motion — was deemed too costly to solve correctly.

**Current behaviour:** Every cell is recomputed every frame. No caching, no diff logic. `processMonochrome` and `processColor` return their result directly (no `tilesProcessed`/`tilesSkipped` fields). `perfMetrics` no longer includes tile stats and `PerfOverlay` no longer shows them.

---

## Web Worker

The ASCII conversion pipeline (monochrome / color) runs in `src/worker/ascii-worker.ts` on a separate OS thread. This prevents the main thread (React rendering, rAF scheduling, user events) from being blocked by the ~20–40ms per-frame pixel math.

**Current state:** Both processing modes — monochrome (`processMonochrome`) and color (`processColor`) — run fully in the worker. The `asciiWorker` is **lazily initialized** via `getWorker()` on the first processed frame (not at store load time). The `workerBusy` flag implements the single-slot mailbox. `asciiTimeMs` is measured as worker round-trip time (from `postMessage` to `onmessage` response).

**Message protocol:**

```
Main thread (store)                        Worker thread
──────────────────                         ─────────────
worker.postMessage({                  →    ctx.onmessage fires
  type: 'process',                         processMonochrome / processColor
  imageData,                               ctx.postMessage({ type: 'result',
  config: { asciiWidth, colorMode, ... }     asciiOutput | coloredAsciiOutput,
}, [imageData.buffer])                       tilesProcessed, tilesSkipped })
                                     ←    result received
store.onmessage → set({ asciiOutput, perfMetrics: { ...tilesProcessed, tilesSkipped } })
```

`imageData.buffer` is passed as a **transferable** — ownership of the pixel buffer transfers to the worker with zero copy. At 720p this avoids copying ~1.5MB per frame.

**WebGPU/WebGL in Worker:** Task 34 added WebGL2 acceleration for monochrome mode's LAB brightness calculation. The GL context is created once at worker init using `OffscreenCanvas` (where supported). Feature detection happens at initialization; unsupported browsers fall back to CPU computation.

**Worker lifecycle:** `asciiWorker` is created on the first frame via `getWorker()` (a `new Worker(new URL(...))` call inside the store factory closure). It persists for the app lifetime once created. It is not terminated on `stopWebcam` — the worker simply receives no messages while the webcam is inactive. The `?worker` Vite import was replaced with `new URL(...)` to enable lazy instantiation (see ADR-009).

**Files:**
- `src/worker/ascii-worker.ts` — worker entry point, `WorkerInput` / `WorkerOutput` / `WorkerConfig` interfaces, WebGL setup, message handler
- `vite.config.ts` — `worker: { format: 'es' }` ensures Vite bundles the worker as an ES module chunk

---

## Dependencies

- `@mediapipe/selfie_segmentation` — loaded from CDN at runtime; not bundled. First session requires network; subsequent sessions use browser cache.
- `src/constants/character-sets.ts` — provides `CHARACTER_SETS`, `DEFAULT_CHARSET`, and `BAYER_MATRIX_4X4`
- `src/components/WebcamPage.tsx` — registers `videoRef`, `canvasRef`, `maskCanvasRef` via ref callbacks; calls `startWebcam`/`stopWebcam` from event handlers
- `src/worker/ascii-worker.ts` — Web Worker; `processMonochrome` and `processColor` fully implemented
