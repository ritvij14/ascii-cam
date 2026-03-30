# Patterns

> **Living catalogue of how recurring problems are solved in this codebase.**
> This is different from `decisions.md` (which records *why* things were built a certain way)
> and different from conventions in CLAUDE.md (which are rules).
> This is *how* — with actual code examples from this codebase.
>
> **When to add a pattern:**
> - You solve the same class of problem for the second time
> - You spend more than 10 minutes figuring out the right way to do something
> - A code review surfaces "this should be done like X" — write X down here
>
> Last updated: 2026-03-27

---

## Index

- [Store Action Shape](#store-action-shape) — How to write a store action that reads state, does work, and updates state
- [DOM Ref Pattern](#dom-ref-pattern) — How components hand DOM elements to the store without useEffect
- [Acquire/Release Resource Pair](#acquirerelease-resource-pair) — How to safely manage resources (streams, rAF, segmenter) in the store
- [Timestamp-Based Frame Skip](#timestamp-based-frame-skip) — How to cap the render loop to ~30fps without setInterval
- [Two-Pass Cell Processing](#two-pass-cell-processing) — How ASCII conversion does a first pass for brightness, second pass for output
- [Off-Screen Canvas Export](#off-screen-canvas-export) — How to render ASCII output to a PNG at 3× resolution
- [Silent Error Skip](#silent-error-skip) — How to handle non-critical errors in the render loop without breaking the frame

---

## Store Action Shape

**Problem this solves:**
Actions need to read current state, do work, and write new state. Without a consistent shape, actions either take state as parameters (fragile — callers must pass the right state) or call `get()` inconsistently.

**When to use it:**
Every store action.

**When NOT to use it:**
`updateAppState` itself — that's the single low-level setter and doesn't need to call `get()`.

**Implementation:**

```ts
// ✅ Correct shape — reads via get(), writes via set() or updateAppState()
someAction: () => {
  const { relevantField, anotherField } = get();
  // do work with local variables
  const result = compute(relevantField, anotherField);
  set({ outputField: result });
},

// ✅ Also correct — async actions follow the same shape
someAsyncAction: async () => {
  const { videoRef } = get();
  if (!videoRef) return; // guard: exit early if required refs are missing
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    set({ streamRef: stream, isWebcamActive: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    set({ webcamError: message });
  }
},

// ❌ Wrong — state passed as parameter couples caller to internals
someAction: (asciiWidth: number, selectedCharset: string) => { ... }
```

**Key things to note:**
- Always destructure from `get()` at the top of the action, not inline.
- If a required ref (videoRef, canvasRef, etc.) is null, return early — don't throw.
- Errors go into state (`webcamError`), not console-only.

**Example usage in this codebase:**
`src/store/index.ts` — every action follows this shape, e.g. `startWebcam`, `updateAsciiOutput`, `takeScreenshot`.

---

## DOM Ref Pattern

**Problem this solves:**
The store needs access to DOM elements (video, canvas) that React owns. The naive approach uses `useEffect` to push refs into the store on mount, but this violates the useEffect policy and creates timing issues.

**When to use it:**
Any time a component needs to register a DOM element with the store.

**When NOT to use it:**
Elements that the store creates itself (off-screen canvas for screenshots) — those are created inline in the action, not registered via ref callback.

**Implementation:**

```tsx
// In the component — use a ref callback, not useRef + useEffect
<video
  ref={(el) => {
    if (el) updateAppState({ videoRef: el });
  }}
  autoPlay
  playsInline
  muted
/>

<canvas
  ref={(el) => {
    if (el) updateAppState({ canvasRef: el });
  }}
  className="hidden"
/>
```

```ts
// In the store — the ref fields are part of AppState, initialized to null
interface AppState {
  videoRef: HTMLVideoElement | null;
  canvasRef: HTMLCanvasElement | null;
  maskCanvasRef: HTMLCanvasElement | null;
  // ...
}
```

**Key things to note:**
- The `if (el)` guard is critical — ref callbacks fire with `null` on unmount. Without the guard, the store ref gets nulled when the component unmounts.
- The ref callback fires synchronously during the commit phase — the ref is available in the store before any user interaction.
- No cleanup needed: when the component unmounts, the guard prevents the null from being written (the store simply holds a stale ref, which is fine since the component is gone).

**Example usage in this codebase:**
`src/components/WebcamPage.tsx` — video and canvas elements use this pattern.

---

## Acquire/Release Resource Pair

**Problem this solves:**
Actions that acquire resources (streams, animation frame IDs, WASM instances) need a guaranteed cleanup path. Without a paired release action, resources leak when the user navigates away or stops the webcam.

**When to use it:**
Any action that calls `getUserMedia`, `requestAnimationFrame`, `new SelfieSegmentation()`, or any other resource that requires explicit teardown.

**When NOT to use it:**
Resources that are self-cleaning (e.g. a Promise that resolves, a one-off fetch).

**Implementation:**

```ts
// ✅ Every acquire action has a matching release action

// Acquire: startWebcam → Release: stopWebcam
startWebcam: async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  set({ streamRef: stream, isWebcamActive: true });
  get().startRenderLoop(); // also an acquire
},

stopWebcam: () => {
  get().stopRenderLoop();           // release render loop first
  const { streamRef, videoRef } = get();
  streamRef?.getTracks().forEach(track => track.stop()); // release stream
  if (videoRef) videoRef.srcObject = null;
  set({ streamRef: null, isWebcamActive: false, segmenter: null, segmentationLoading: true });
},

// Acquire: startRenderLoop → Release: stopRenderLoop
startRenderLoop: () => {
  const id = requestAnimationFrame(captureFrame);
  set({ animationFrameId: id });
},

stopRenderLoop: () => {
  const { animationFrameId } = get();
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  set({ animationFrameId: null });
},
```

**Key things to note:**
- Release order matters: `stopWebcam` calls `stopRenderLoop` first, then stops the stream. The rAF loop reads the stream, so stopping the stream while the loop is running causes errors.
- The segmenter is nulled in `stopWebcam` (not in a separate `stopSegmentation`) because it's always released together with the webcam.
- Setting the released resource to `null` in state is what prevents double-release bugs.

**Example usage in this codebase:**
`src/store/index.ts:570-716` — `startWebcam`/`stopWebcam` and `startRenderLoop`/`stopRenderLoop`.

---

## Timestamp-Based Frame Skip

**Problem this solves:**
`requestAnimationFrame` fires at the display refresh rate (60–120fps). The ASCII conversion pipeline takes ~20–40ms per frame. Without throttling, frames pile up and the UI freezes.

**When to use it:**
The rAF render loop in `startRenderLoop`.

**When NOT to use it:**
Anywhere outside the render loop — use rAF directly for animations that need to run at full refresh rate.

**Implementation:**

```ts
startRenderLoop: () => {
  let lastFrameTime = 0;
  const targetFrameMs = 33; // ~30fps

  const captureFrame = async (timestamp: number) => {
    // Skip this frame if not enough time has passed
    if (timestamp - lastFrameTime < targetFrameMs) {
      set({ animationFrameId: requestAnimationFrame(captureFrame) });
      return;
    }

    // ... do work ...

    lastFrameTime = timestamp; // only update after real work is done
    set({ animationFrameId: requestAnimationFrame(captureFrame) });
  };

  set({ animationFrameId: requestAnimationFrame(captureFrame) });
},
```

**Key things to note:**
- `lastFrameTime` is a closure variable, not store state — it doesn't need to trigger re-renders.
- `lastFrameTime` is only updated after the frame is fully processed, not at the start. This ensures the 33ms gap is between the *end* of one frame and the *start* of the next, preventing drift.
- The rAF ID is stored in state (`animationFrameId`) so `stopRenderLoop` can cancel it from outside the closure.

**Example usage in this codebase:**
`src/store/index.ts:476-560` — `startRenderLoop`.

---

## Two-Pass Cell Processing

**Problem this solves:**
ASCII conversion needs unsharp masking, which requires knowing a cell's neighbors' brightness values. You can't compute the sharpened value in a single pass because the neighbor values aren't available yet.

**When to use it:**
Any ASCII conversion that applies spatial filtering (unsharp mask, blur, edge detection) across the cell grid.

**When NOT to use it:**
Per-cell operations that don't depend on neighbors — those can be done in a single pass.

**Implementation:**

```ts
// First pass: compute per-cell values into a flat Float32Array
const cellBrightness = new Float32Array(asciiWidth * height);
for (let y = 0; y < height; y++) {
  for (let x = 0; x < asciiWidth; x++) {
    let total = 0, count = 0;
    // ... average pixels in this cell ...
    cellBrightness[y * asciiWidth + x] = total / count;
  }
}

// Second pass: apply 3×3 neighborhood filter, produce output
const parts: string[] = [];
for (let y = 0; y < height; y++) {
  for (let x = 0; x < asciiWidth; x++) {
    const idx = y * asciiWidth + x;
    const original = cellBrightness[idx];

    // 3×3 neighborhood average ("blur")
    let blurSum = 0, blurCount = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const ny = y + dy, nx = x + dx;
        if (ny >= 0 && ny < height && nx >= 0 && nx < asciiWidth) {
          blurSum += cellBrightness[ny * asciiWidth + nx];
          blurCount++;
        }
      }
    }
    const blurred = blurSum / blurCount;
    // Unsharp mask: original + k * (original - blurred)
    const sharpened = Math.max(0, Math.min(100, original + 0.5 * (original - blurred)));

    const charIndex = Math.floor((sharpened / 100) * (charset.length - 1));
    parts.push(charset[charIndex]);
  }
  parts.push('\n');
}
```

**Key things to note:**
- Use `Float32Array` for the intermediate buffer, not a JS array — it's significantly faster for large grids and avoids GC pressure.
- The flat index `y * asciiWidth + x` is faster than a 2D array.
- Boundary cells (edges of the grid) have fewer than 9 neighbors — the `if (ny >= 0 && ...)` guard handles this correctly by computing the average over however many neighbors exist.

**Example usage in this codebase:**
`src/worker/ascii-worker.ts` — `processMonochrome` (monochrome, runs in worker), `src/store/index.ts` — `updateColorAsciiOutput` (color, still on main thread).

---

## Off-Screen Canvas Export

**Problem this solves:**
Exporting the ASCII output as a PNG requires rendering it to a canvas at high resolution. The live canvas is too small (it's sized to the video frame, not the output). DOM screenshot tools are unreliable for monospace text.

**When to use it:**
`takeScreenshot` — any time ASCII output needs to be rendered to a PNG.

**When NOT to use it:**
Live rendering — that uses the DOM directly (`<pre>`, `<span>`, `EmojiGrid`).

**Implementation:**

```ts
takeScreenshot: async () => {
  const canvas = document.createElement('canvas'); // off-screen, not in DOM
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const SCALE = 3;           // 3× resolution for crisp output
  const FONT_SIZE = 14 * SCALE;
  const CHAR_W = FONT_SIZE * 0.6;
  const CHAR_H = FONT_SIZE;

  // Set canvas dimensions based on output size
  canvas.width = cols * CHAR_W;
  canvas.height = rows * CHAR_H;

  // Draw background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw characters
  ctx.font = `${FONT_SIZE}px monospace`;
  ctx.textBaseline = 'top'; // critical — 'top' aligns y position correctly
  for (let y = 0; y < lines.length; y++) {
    ctx.fillText(lines[y], 0, y * CHAR_H);
  }

  // Export — always use <a download> to trigger the browser's native Save dialog
  const filename = `ascii-cam-${Date.now()}.png`;
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url); // always revoke to avoid memory leaks
  }, 'image/png');
},
```

**Key things to note:**
- `ctx.textBaseline = 'top'` is required. The default (`'alphabetic'`) makes the y coordinate the baseline, so characters render above their row position.
- For emoji mode, spread each row with `[...rows[y]]` before iterating — emoji strings contain multi-codepoint sequences (e.g. skin tone modifiers) that split incorrectly with index access.
- Always `URL.revokeObjectURL` after the download — object URLs are not garbage collected automatically.
- Always use `<a download>` rather than `navigator.share` — the share sheet on macOS/iOS prompts to add to Photos or AirDrop, not to save a file.
- Any loading state flag (e.g. `screenshotLoading`) must be reset on **every** early-return path, not just in the happy path. `toBlob` is callback-based, so the reset belongs at the top of the callback — not after the `toBlob` call site.

**Example usage in this codebase:**
`src/store/index.ts:608-694` — `takeScreenshot`.

---

## Silent Error Skip

**Problem this solves:**
Non-critical operations in the render loop (segmentation, mask extraction) can fail for transient reasons (WASM not ready, GPU hiccup). A thrown error would crash the loop and stop all output.

**When to use it:**
Any operation inside the rAF loop that is optional — the frame can still be rendered without it.

**When NOT to use it:**
Critical operations where failure means the output would be wrong or misleading. Don't silence errors on the ASCII conversion itself.

**Implementation:**

```ts
// ✅ Correct — segmentation failure is silently skipped, frame continues
let maskData: ImageData | undefined;
try {
  await segmenter.send({ image: videoRef });
  maskData = maskCtx.getImageData(0, 0, maskCanvasRef.width, maskCanvasRef.height);
} catch (_) {
  // Skip mask on error — ASCII conversion continues without background removal
}

// maskData is undefined → updateAsciiOutput renders without mask (full background visible)
get().updateAsciiOutput(imageData, maskData);
```

**Key things to note:**
- The catch variable is named `_` to signal intentional suppression — it won't trigger the "unused variable" linter warning.
- The calling code must handle `undefined` gracefully — `updateAsciiOutput(imageData, maskData?)` treats `undefined` as "no mask".
- Don't `console.error` inside a 30fps loop — it will spam the console. Silence completely or log at most once.

**Example usage in this codebase:**
`src/store/index.ts:519-528` — segmentation inside `startRenderLoop`, and `src/store/index.ts:120-128` — segmentation inside `processImage`.
