# Architecture Decisions

> **Architectural Decision Records (ADRs) for ASCII Camera.**
> When a key architectural decision is made, record it here with full reasoning.
> Referenced from CLAUDE.md Section 4. Never contradict a decision here without updating this doc.
> Last updated: 2026-03-23

---

## How to Read This

Each decision is recorded with:
- **What** was decided
- **Why** it was chosen over alternatives
- **Tradeoffs** accepted
- **When to revisit** — the conditions under which this decision should be reconsidered

---

## Decision Log

---

### ADR-001: Single Zustand store for all state and business logic

**Date:** 2026-01-01
**Status:** Active

**Decision:**
All application state and all business logic (ASCII conversion, webcam lifecycle, segmentation, render loop, screenshot export) live in a single Zustand store. Components are UI-only.

**Context:**
The app has a tight feedback loop: every animation frame, the store reads from DOM refs (video, canvas), runs a processing pipeline, and writes output that components re-render. This is inherently imperative and stateful. We needed a place to own this that wasn't React components.

**Options considered:**
- **Option A (chosen) — Single Zustand store with actions:** All logic in `src/store/index.ts`. Components call actions, read state, nothing else.
- **Option B — Logic split across custom hooks:** Each feature gets a `useWebcam`, `useAscii`, etc. hook. State shared via context or prop drilling.
- **Option C — Logic in components with useEffect:** Standard React pattern — effects manage webcam lifecycle, rAF loop, etc.

**Reasoning:**
Option B fragments ownership: the render loop needs the webcam stream, the canvas ref, the segmenter, and the ASCII config all at once. Spreading these across hooks creates coordination complexity and implicit ordering dependencies. Option C violates the project's useEffect policy — effects are the wrong abstraction for imperative loops that need cleanup, and they make testing and debugging harder. Option A keeps all imperative logic co-located, making it easy to trace the full data flow in one file and enforce the acquire/release resource pattern consistently.

**Tradeoffs accepted:**
- `src/store/index.ts` is large (~600+ lines). Navigated via the `NAVIGATION` comment block at the top.
- All business logic is coupled to Zustand's `get()`/`set()` API — can't unit test actions without a store instance.

**Revisit when:**
The store exceeds ~1500 lines and distinct feature areas (e.g. segmentation, worker communication) become hard to navigate even with the navigation block. At that point, consider splitting into multiple slices composed into one store.

---

### ADR-002: No useEffect for business logic

**Date:** 2026-01-01
**Status:** Active

**Decision:**
`useEffect` is banned for business logic. All side effects are triggered by user events and owned by store actions. The only permitted `useEffect` usage is subscribing to external browser event sources (resize, visibility change) at the React/browser boundary.

**Context:**
React's `useEffect` is designed for synchronizing React state with external systems. It is frequently misused to trigger side effects in response to state changes ("do X when Y changes"), which creates hidden dependency chains, double-execution in Strict Mode, and cleanup bugs.

**Options considered:**
- **Option A (chosen) — Effects banned for business logic:** Store actions own all side effects. Components call actions directly from event handlers or ref callbacks.
- **Option B — Effects permitted with strict rules:** Allow effects but require documentation and code review.
- **Option C — No restrictions:** Standard React patterns, effects wherever they make sense.

**Reasoning:**
Option B requires ongoing judgment calls and review overhead. The categories where effects are "legitimate" (subscribing to external event sources) are narrow and well-defined. Making the rule a hard ban eliminates the ambiguity and keeps the store as the single place to look for any side effect. Option C leads to logic scattered across components and hooks, which conflicts with the single-store architecture.

**Tradeoffs accepted:**
- Some patterns that feel natural in React (e.g. "start the webcam when the component mounts") require a different approach (ref callbacks or explicit user-triggered actions).
- New contributors familiar with standard React patterns will need to learn this convention.

**Revisit when:**
A legitimate use case arises that genuinely cannot be handled by a ref callback, event handler, or store action — and the `useSyncExternalStore` alternative is also impractical.

---

### ADR-003: Client-side only — no backend, no persistence

**Date:** 2026-01-01
**Status:** Active

**Decision:**
The entire application runs in the browser. No server, no database, no API calls after initial page load. All state is in-memory and lost on page refresh.

**Context:**
ASCII Camera is a side project for fun. The core value is the real-time conversion experience, not user accounts or saved outputs. Adding a backend would require auth, storage, deployment infrastructure, and ongoing maintenance — none of which adds to the core experience.

**Options considered:**
- **Option A (chosen) — Client-side only:** All processing in the browser via Canvas API and MediaPipe WASM. Deploy as static files to Vercel.
- **Option B — Backend for storage:** Save outputs to a gallery, user accounts, shareable links.
- **Option C — Serverless functions:** Offload heavy processing to edge functions or Lambda.

**Reasoning:**
MediaPipe runs as compiled WASM entirely in the browser — no server needed for segmentation. Canvas API handles all image processing. The app has no multi-user features that would require a server. Option B and C add infrastructure complexity with no benefit to the core use case. Static deployment to Vercel is trivial and has zero ongoing cost.

**Tradeoffs accepted:**
- Nothing persists across page reloads — settings, color choices, uploaded images are all lost.
- No shareable links or gallery features possible without backend.

**Revisit when:**
A feature is added that genuinely requires persistence (e.g. saved presets, gallery) or server-side processing (e.g. batch conversion of large files that would OOM the browser).

---

### ADR-004: Two separate output fields for two rendering modes (emoji removed)

**Date:** 2026-01-01
**Revised:** 2026-04-17
**Status:** Active

Each rendering mode has its own dedicated state field: `asciiOutput` (string) and `coloredAsciiOutput` (string of HTML). Modes do not share mutable state.

**Context:**
Two rendering modes produce structurally different output: monochrome is plain text, color mode is an HTML string with `<span style="color:...">` per character. A single unified output field would require either a complex discriminated union or lossy conversion between representations.

**Emoji mode was removed** (2026-04-17) as part of the V2 depth improvement — it added ~300 LOC and bundle weight with limited user value while complicating the UI. The `emojiOutput` field, `updateEmojiOutput` action, `EmojiGrid` component, `EMOJI_COLOR_PALETTE`, and `processEmoji` worker function were all deleted.

**Options considered:**
- **Option A (chosen) — Separate fields per mode:** Each mode writes to its own field. Components read the field for the active mode.
- **Option B — Single `output` field with a type discriminant:** `{ type: 'mono' | 'color'; data: ... }`
- **Option C — Always compute both modes per frame:** Keep both outputs current, switch is instant.

**Reasoning:**
Option B requires every consumer to type-narrow before use, and makes it easy to accidentally read stale data from the wrong mode branch. Option C doubles the per-frame processing cost with no user-visible benefit — users see one mode at a time. Option A is the simplest: each mode owns its field, stale fields from other modes are simply ignored.

**Tradeoffs accepted:**
- When switching modes, the previous mode's output field holds stale data until cleared (not a visible bug, but worth knowing).
- Adding another mode requires a new output field and a new render path.

**Revisit when:**
A third rendering mode is added that shares enough structure with an existing mode to make a unified field worthwhile.

---

### ADR-010: Remove emoji mode

**Date:** 2026-04-17
**Status:** Active

**Decision:**
Remove emoji mode entirely, narrowing the app to two rendering modes (monochrome and color).

**Context:**
Emoji mode introduced ~300 LOC including a 23-entry color palette, a separate `EmojiGrid` component, worker-side emoji processing, and a third output field in the store. Three modes also complicated the UI — users had to choose between monochrome/color/emoji, the charset picker needed conditional hiding, and each feature (screenshot export, mode controls) needed a third branch.

From a user-value standpoint, the emoji mode was a novelty that didn't justify the bundle weight or code maintenance cost. Two modes are enough: monochrome for stylized ASCII and color for photorealistic output.

**What was removed:**
- `src/EmojiGrid.tsx` — entire component file
- `emojiOutput` state field and `updateEmojiOutput` action from store
- `processEmoji` worker function and `emojiOutput` from worker protocol
- `EMOJI_COLOR_PALETTE` and `rgbToNearestEmoji` from `constants/character-sets.ts`
- Third mode button from `ModeControls`
- `colorMode` type narrowed from `'monochrome' | 'color' | 'emoji'`

**Tradeoffs accepted:**
- Emoji mode is gone; users who preferred it now use color mode instead (which offers richer output).
- Bundle size reduced by ~8 kB (emoji palette data + processing logic).

**Revisit when:**
User feedback consistently requests an emoji mode with significantly different behavior (unlikely — better to invest in grayscale/dithering pipeline instead).

---

### ADR-005: Off-screen canvas for screenshot export

**Date:** 2026-01-01
**Status:** Active

**Decision:**
Screenshots are rendered by creating an off-screen `<canvas>` element at 3× resolution and drawing the ASCII output programmatically, rather than using `html2canvas` or DOM screenshot APIs.

**Context:**
The ASCII output is rendered as a `<pre>` tag (monochrome) or a block of `<span>` elements (color). DOM screenshot libraries like `html2canvas` struggle with custom fonts, precise character spacing, and cross-origin resources. We need pixel-perfect, high-resolution output.

**Options considered:**
- **Option A (chosen) — Off-screen canvas, draw programmatically:** Parse the output and draw each character with `ctx.fillText` at 3× scale.
- **Option B — `html2canvas`:** Capture the rendered DOM as a canvas.
- **Option C — `window.print()` / CSS print styles:** Use browser print to PDF as a proxy for image export.

**Reasoning:**
Option B is unreliable for monospace text rendering — character alignment differences between the DOM and canvas mean the output rarely looks identical to what the user sees. Option C produces PDF, not PNG, and gives no control over resolution. Option A gives full control: exact character spacing, exact colors, exact 3× scale, works identically across both modes.

**Tradeoffs accepted:**
- Color mode requires parsing the HTML string (`coloredAsciiOutput`) with regex to extract character/color pairs — brittle if the HTML format ever changes.

**Revisit when:**
A browser API for high-resolution DOM capture becomes reliable across all targets (unlikely near-term).

---

### ADR-007: Web Worker for ASCII conversion pipeline

**Date:** 2026-03-27
**Status:** Active (scaffold in place; logic migration in progress)

**Decision:**
The ASCII conversion pipeline (monochrome, color) is being moved from the main thread into a dedicated Web Worker (`src/worker/ascii-worker.ts`). The store owns the worker lifecycle and message protocol; the worker is a pure computation engine with no state.

**Context:**
`updateAsciiOutput` / `updateColorAsciiOutput` each take ~20–40ms per frame at 720p. Running them on the main thread blocks React rendering and user input during that window. At 30fps the frame budget is 33ms — the conversion alone can consume the entire budget, leaving no time for layout, paint, or input handling.

**Options considered:**
- **Option A (chosen) — Dedicated Web Worker:** Move pixel math to a worker thread. Main thread orchestrates via postMessage + transferables.
- **Option B — OffscreenCanvas:** Offload canvas drawing to a worker. Doesn't help with the conversion math itself, only rendering.
- **Option C — WASM module:** Rewrite hot loops in Rust/C++ compiled to WASM. Maximum throughput but very high implementation cost.
- **Option D — Optimize in place:** Reduce constant factors (fewer allocations, SIMD-style tricks in JS). Bounded improvement, still on main thread.

**Reasoning:**
Option A gives the main thread full relief from the conversion cost with moderate implementation effort. The message protocol (postMessage + transferable ImageData.buffer) is standard and well-supported. Option B only helps if canvas rendering is the bottleneck, which it isn't — the math is. Option C has a much higher cost and is premature. Option D can be done in parallel but doesn't unblock the main thread.

**Tradeoffs accepted:**
- `ImageData.buffer` is transferred (not copied) to the worker — the main-thread buffer is detached after `postMessage`. The canvas must extract a fresh `ImageData` each frame rather than reusing a buffer.
- The worker adds one round-trip latency (~0ms for computation, but asynchronous) before output is written to state. The render loop must become async/callback-based rather than synchronous.
- Worker is lazy-initialized on the first processed frame (see ADR-009). The first frame incurs a one-time ~1–5ms worker spawn cost.

**Revisit when:**
Worker communication overhead becomes measurable (unlikely — `postMessage` with transferables is fast). Or if the conversion logic needs DOM access (workers have no DOM — would require a different approach).

---

### ADR-008: WebGL2 acceleration for per-pixel LAB brightness calculation

**Date:** 2026-03-29
**Status:** Active

**Decision:**
MLAB L* brightness calculation in monochrome mode uses WebGL2 fragment shaders when available (Chrome, Firefox, Edge; Safari ≥16.4). The shader applies white balance and color temperature, then converts RGB → linear sRGB → XYZ → LAB L*.CPU path remains as fallback.

**Context:**
Per-pixel LAB conversion is the dominant cost in `processMonochrome()`:
- At 720p: ~920,000 pixels per frame
- At 30fps: ~27.6 million pixels per second
- Each pixel: sRGB→linear→XYZ→LAB L* (multiple matrix multiplications, cube roots, conditionals)

This CPU cost often exceeds the 33ms frame budget on integrated graphics laptops and mid-range phones.

**Options considered:**
- **Option A (chosen) — WebGL2 shader in worker:** Create offscreen GL context, render fullscreen quad with LAB conversion shader, read pixels back via `gl.readPixels()`.
- **Option B — WebGPU compute shader:** More modern API, but lower browser support (Chrome/Edge only, behind flags in Firefox).
- **Option C — SIMD-optimized WASM:** Compile LAB conversion to WASM with SIMD intrinsics. Higher implementation cost, requires build toolchain.

**Reasoning:**
Option A gives the best balance of performance gain (10–100× faster pixel math) and browser support. WebGL2 is universally supported on desktop and most mobile browsers. The shader approach parallelizes across GPU cores natively. Option B would leave Safari and older browsers without acceleration. Option C requires Rust/C++ tooling and adds build complexity not justified by the incremental gain over WebGL2.

**Tradeoffs accepted:**
- `gl.readPixels()` is synchronous and stalls the GPU pipeline. For 720p RGBA this is ~2.8MB per frame — acceptable at 30fps on integrated GPUs, but could bottleneck on very low-end devices.
- WebGL context creation can fail silently on some hardware configurations; CPU fallback must be robust.
- Safari <16.4 lacks OffscreenCanvas webgl support — users get CPU path (no regression).

**Revisit when:**
WebGPU achieves broader support (Safari, Firefox stable) and provides significant additional benefit over WebGL2 for this use case, or if `gl.readPixels()` becomes the dominant bottleneck.

---

### ADR-006: MediaPipe selfie segmentation always-on, no UI toggle

**Date:** 2026-01-01
**Status:** Active

**Decision:**
Background removal via MediaPipe selfie segmentation runs on every webcam frame. There is no UI toggle to disable it.

**Context:**
The ASCII art effect looks significantly better with background removed — without it, complex backgrounds produce noisy, unreadable output. MediaPipe runs as WASM in a worker context and adds ~5–10ms per frame, which is acceptable at 30fps.

**Options considered:**
- **Option A (chosen) — Always-on segmentation:** No toggle, simpler UI, consistently good output.
- **Option B — Toggle in UI:** Users can enable/disable background removal.
- **Option C — Auto-detect:** Disable segmentation when background is simple (low variance).

**Reasoning:**
Option B adds UI complexity and a mode the user has to understand. Option C requires a background complexity heuristic which is non-trivial to get right. The performance cost of always-on segmentation is small relative to the quality benefit. Keeping it always-on simplifies the render loop (no conditional paths for with/without mask).

**Tradeoffs accepted:**
- Users who want to include their background have no way to do so.
- On very slow hardware, the segmentation cost (~10ms) may push the pipeline over the 33ms frame budget.

**Revisit when:**
Performance work (Phase 4) reveals that segmentation is the primary bottleneck on target hardware, or user feedback consistently requests background-on mode.

---

### ADR-008: Two independent rAF loops for video capture and segmentation

**Date:** 2026-03-29
**Status:** Active

**Decision:**
The render pipeline uses two separate `requestAnimationFrame` loops: Stage 1 (video capture) and Stage 2 (segmentation). They communicate via a single-slot closure variable (`segQueueFrame`). Stage 1 never `await`s anything.

**Context:**
Previously a single rAF loop called `await segmenter.send()` inline. Because the loop function was `async`, the `await` yielded the thread for ~20–50ms while MediaPipe processed the frame. During that yield, no new rAF could fire — video capture stalled at MediaPipe's throughput (~20fps) rather than the camera's 30fps.

**Why two rAF loops over alternatives:**
- *Single async rAF*: the original approach — segmentation blocks video capture.
- *setTimeout for Stage 2*: possible, but rAF is better for main-thread work (pause-on-hidden-tab, vsync alignment).
- *Worker for segmentation*: MediaPipe is already WASM-based and doesn't expose a worker-compatible API without major wrapping. Not worth the complexity.
- *Two rAF loops*: Stage 1 is synchronous and always runs at full 30fps. Stage 2 is async but isolated — its `await` only pauses Stage 2's own loop. Implemented with minimal new state (`segAnimationFrameId`).

**Single-slot mailbox design:**
`segQueueFrame` holds at most one `ImageData`. Stage 1 overwrites it on every capture (last-write-wins). Stage 2 reads it when ready. This means Stage 2 always processes the *most recent* frame, never an accumulated backlog. On slow hardware where segmentation takes longer than 33ms, ASCII output simply updates at a lower rate while video capture stays smooth.

**Tradeoffs:**
- Slight temporal mismatch: the mask computed in Stage 2 uses `canvasRef` (which Stage 1 may have overwritten). The delta is one Stage-1 frame interval (~33ms) at most — imperceptible at 30fps. Temporal smoothing (70/30 blend) further masks any edge flicker.
- `segAnimationFrameId` adds one more rAF handle to track in `stopRenderLoop`.

**Revisit when:**
Stage 2 is separated further into its own worker (would eliminate the temporal mismatch entirely), or if WebGPU/OffscreenCanvas makes MediaPipe worker-compatible.

---

### ADR-009: Lazy loading for MediaPipe, ASCII worker, and react-colorful

**Date:** 2026-03-30
**Status:** Active

**Decision:**
Three heavy dependencies are deferred until they are actually needed:
- `@mediapipe/selfie_segmentation` — dynamic import inside `initSegmentation()`, called only when the user starts the webcam.
- `ascii-worker` — `new Worker(new URL(...))` is called by `getWorker()` on the first ASCII frame, not at store creation.
- `react-colorful` (`HexColorPicker`) — loaded via `React.lazy()` + `Suspense`, downloaded only when the color picker is first opened.

Vite `manualChunks` names the `mediapipe` and `router` chunks for stable filenames and predictable cache behavior.

**Context:**
With eager imports the initial JS parse-and-execute cost included ~44 kB of MediaPipe JS and the worker module even before the user interacted with anything. The app's main bundle should be as small as possible since the landing experience is just a tab nav.

**Options considered:**
- **Option A (chosen) — Lazy load heavy deps:** Dynamic imports at the usage site.
- **Option B — Keep eager imports:** Simpler code, slightly higher initial load cost.

**Reasoning:**
Option A reduces the initial bundle to ~14 kB (4.7 kB gzip) — the MediaPipe and worker chunks only download when the webcam is first started. `react-colorful` (~14 kB) only downloads when the user opens the color picker. Option B is simpler but leaves the initial load heavier than needed for a page that starts as a static tab.

**Tradeoffs accepted:**
- The first webcam start has a one-time fetch for the MediaPipe chunk (~44 kB gzip: 17 kB). Subsequent starts use the browser cache.
- `getWorker()` in the store is a closure-based lazy initializer — it cannot be directly unit-tested without triggering a real Worker instantiation.
- `HexColorPicker` wrapped in `Suspense fallback={null}` means there's a single frame where the picker container renders without the picker — imperceptible at normal network speeds.

**Revisit when:**
MediaPipe or the worker chunk grow large enough that the first-start latency becomes noticeable (> 500ms on a slow connection), at which point a preload hint (`<link rel="modulepreload">`) could be added to `index.html` without reverting to eager imports.

---

### ADR-011: Dynamic `asciiWidth` derived from `fontSize` and source width

**Date:** 2026-04-25
**Status:** Active

**Decision:**
`asciiWidth` is no longer a fixed default (120). It is computed per-frame from the source image/video width and the user's chosen `fontSize`:

```
asciiWidth = floor(sourceWidth / (fontSize * 0.6))
```

The display renders at the fixed `fontSize`; the grid may be wider or narrower than the viewport depending on the source resolution.

**Context:**
Previously `asciiWidth` was hardcoded to 120 (or 80 for portrait video), and `AsciiDisplay` used a CSS `clamp()` expression to compute the largest font size that would fit those 120 columns in the viewport. Users had no control over detail level — the grid density was fixed regardless of their preference.

**Options considered:**
- **Option A (chosen) — Derive `asciiWidth` from source width and `fontSize`:** The user controls `fontSize` via a slider (6–20px). `asciiWidth` is computed before each frame is posted to the worker. Smaller fonts = more columns = finer detail. The display uses the exact `fontSize`.
- **Option B — Derive `asciiWidth` from viewport width and `fontSize`:** `asciiWidth = floor(viewportWidth / (fontSize * 0.6))`. The grid always fits the viewport, but for small source images each character would represent sub-pixel regions.
- **Option C — Keep fixed `asciiWidth` and make `fontSize` purely visual:** No change to grid density; the slider only changes display scale. Doesn't satisfy the requirement that font size affect detail.

**Reasoning:**
Option A gives the user direct control over sampling resolution. A 6px font on a 1280px source produces ~355 columns; a 20px font produces ~106. The cell size in source pixels is always `≈ fontSize * 0.6` wide, making the relationship between slider and detail predictable. Option B would create pathological cases where a small source image gets an enormous column count. Option C doesn't solve the problem.

**Tradeoffs:**
- The ASCII grid width is approximately equal to the source image width. Large sources (e.g., 4K images) at small font sizes may overflow the viewport. The user can increase font size to compensate.
- The worker receives a variable `asciiWidth` on every frame. On source resolution changes (rare for webcam), the grid dimensions shift once.
- The portrait-mode `asciiWidth: 80` override was removed; portrait video naturally produces fewer columns because `videoWidth` is smaller.

**Revisit when:**
User feedback indicates overflow is a consistent problem, at which point a max-width cap or container scaling could be added without changing the derivation formula.

---
