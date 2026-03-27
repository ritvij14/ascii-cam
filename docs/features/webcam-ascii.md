# Webcam ASCII

> **Feature doc for real-time webcam-to-ASCII conversion.**
> Covers webcam lifecycle, segmentation, render loop, and ASCII pipeline.
> Status: Stable
> Last updated: 2026-03-23

---

## Index

- [Overview](#overview)
- [Data Model](#data-model)
- [Lifecycle](#lifecycle) — start/stop sequence, acquire/release pairs
- [Segmentation](#segmentation) — MediaPipe init, mask extraction, temporal smoothing
- [Render Loop](#render-loop) — frame capture, portrait detection, frame skip
- [ASCII Pipeline (Monochrome)](#ascii-pipeline-monochrome) — LAB brightness, white balance, unsharp mask
- [Dependencies](#dependencies)

---

## Overview

The webcam feature captures live video from the user's camera, extracts each frame to a canvas, runs MediaPipe selfie segmentation to remove the background, then converts the foreground to ASCII art at ~30fps.

The entire pipeline lives in `src/store/index.ts`. Components are UI-only — they call `startWebcam()` and `stopWebcam()` and render whatever is in `asciiOutput`.

**Happy path:**

1. User clicks "Start Webcam" → component calls `startWebcam()`
2. `startWebcam` lazy-inits segmentation, requests `getUserMedia`, starts `startRenderLoop()`
3. Each frame: video drawn to canvas → mirrored → `ImageData` extracted → segmentation mask computed → `updateAsciiOutput(imageData, maskData)` called
4. `asciiOutput` string written to store → `AsciiDisplay` component re-renders the `<pre>`

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
| `animationFrameId` | `number \| null` | Current rAF handle; stored so `stopRenderLoop` can cancel it |
| `asciiWidth` | `number` | Grid width in characters; auto-reduced to 80 in portrait mode |
| `asciiOutput` | `string` | Newline-separated ASCII string; rendered by `AsciiDisplay` |
| `previousMaskData` | `Uint8ClampedArray \| null` | Last frame's mask; used for temporal smoothing |
| `perfMetrics` | `object \| null` | FPS, frame/seg/ascii times, resolution, grid size |

---

## Lifecycle

### Acquire/release pairs

| Acquire | Release | What it owns |
|---|---|---|
| `startWebcam` | `stopWebcam` | `getUserMedia` stream, `streamRef`, `isWebcamActive` |
| `initSegmentation` | `stopWebcam` | `SelfieSegmentation` instance, `segmenter` |
| `startRenderLoop` | `stopRenderLoop` | `requestAnimationFrame` loop, `animationFrameId` |

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

**Segmentation is only run in monochrome mode** (`src/store/index.ts:519`). Color and emoji modes skip it — they use the full unmasked frame.

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

### `startRenderLoop` (`src/store/index.ts:476`)

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

### Portrait mode detection

On the first frame with `videoRef.readyState === HAVE_ENOUGH_DATA`, the loop checks the video dimensions once:

```ts
if (videoRef.videoHeight > videoRef.videoWidth) {
  set({ asciiWidth: 80 });
}
```

Portrait video (mobile, held vertically) has more rows than columns in the ASCII grid. Reducing `asciiWidth` from the default to 80 prevents the grid from being too wide for the viewport.

### Per-frame sequence

```
1. Check timestamp — skip if < 33ms since last frame
2. Check videoRef.readyState === HAVE_ENOUGH_DATA
3. One-time portrait check (aspectChecked flag)
4. Resize canvas to video dimensions
5. Mirror-draw video to canvas: ctx.scale(-1, 1) then drawImage
6. Extract imageData from canvas
7. If monochrome mode: await segmenter.send() + extract maskData (silent error skip)
8. Dispatch to update function based on colorMode:
   - monochrome → updateAsciiOutput(imageData, maskData?)
   - color → updateColorAsciiOutput(imageData)
   - emoji → updateEmojiOutput(imageData)
9. Update perfMetrics
10. Schedule next frame: set({ animationFrameId: requestAnimationFrame(captureFrame) })
```

The video is mirrored horizontally (`ctx.scale(-1, 1)`) so it matches the natural "mirror" expectation for webcam output.

---

## ASCII Pipeline (Monochrome)

`updateAsciiOutput(imageData, maskData?)` at `src/store/index.ts:133`.

### Step 1 — Apply segmentation mask

If `maskData` is provided, create a copy of the image data and zero out background pixels using the smoothed mask (see [Temporal Smoothing](#temporal-smoothing) above).

If `maskData` is `undefined` (segmenter not ready, or an error occurred), the full image is used unchanged.

### Step 2 — White balance (Gray World algorithm)

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

Cell dimensions:
```ts
const cellWidth  = Math.floor(imgWidth / asciiWidth);
const cellHeight = Math.floor(cellWidth * 2); // 2:1 aspect ratio for monospace chars
const height     = Math.floor(imgHeight / cellHeight);
```

### Step 5 — Unsharp masking (second pass)

For each cell, compute the average L* of its 3×3 neighborhood (blur), then:

```
sharpened = original + 0.5 * (original - blurred)
```

`k = 0.5` is a moderate sharpening strength — enough to make character edges crisp without amplifying noise. Clamped to [0, 100].

### Step 6 — Character mapping

```ts
const charIndex = Math.floor((sharpened / 100) * (charset.length - 1));
parts.push(charset[charIndex]);
```

Maps sharpened L* (0–100) linearly to the charset index. Darker → earlier charset character (space/dot), brighter → later character (dense block).

The active charset is `CHARACTER_SETS[selectedCharset].characters` from `src/constants/character-sets.ts`. Default charset has 10 characters from space to `@`.

### Output

`parts.join('')` produces a string of characters and `\n` newlines, written to `asciiOutput`. `AsciiDisplay` renders this in a `<pre>` tag.

---

## Dependencies

- `@mediapipe/selfie_segmentation` — loaded from CDN at runtime; not bundled. First session requires network; subsequent sessions use browser cache.
- `src/constants/character-sets.ts` — provides `CHARACTER_SETS` and the `DEFAULT_CHARSET` key
- `src/components/WebcamPage.tsx` — registers `videoRef`, `canvasRef`, `maskCanvasRef` via ref callbacks; calls `startWebcam`/`stopWebcam` from event handlers
