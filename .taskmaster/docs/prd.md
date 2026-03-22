<context>
# Overview

ASCII Camera is a client-side web app that converts live webcam feeds and uploaded images into ASCII art in real-time, entirely in the browser — no server, no backend, no account required. It supports three distinct rendering modes (monochrome, full color, emoji), background removal via MediaPipe selfie segmentation, and PNG export. A future performance phase will move the heavy processing off the main thread.

# Core Features

## Webcam ASCII (Phase 1)
Converts a live webcam feed into ASCII art at up to 30fps. MediaPipe selfie segmentation runs on every frame to strip the background. The ASCII width auto-scales to the viewport; portrait mode reduces width automatically to avoid overflow. Users can start and stop the webcam from a single button.

## Color Customization & Rendering Modes (Phase 3)
Three rendering modes controlled by a mode selector:
- **Monochrome**: single-color ASCII art; user picks the color from 7 preset swatches or a hex color wheel (react-colorful)
- **Color**: each character is individually colored to match its source pixel (HTML `<span>` output with inline color)
- **Emoji**: each cell is replaced with the nearest-color emoji from a 23-emoji palette (squared Euclidean RGB distance); cells are square (not 2:1 like ASCII chars); character set picker is hidden in this mode

## Image Conversion (Phase 3)
A second tab ("IMAGE") allows uploading a static image (JPG, PNG, GIF) via drag-and-drop or file picker, or capturing a single frame from the webcam. The image is converted to ASCII using whatever rendering mode is currently active. Users can re-process the same image after switching modes.

## Screenshot Export (Phase 3)
Exports the current ASCII output as a PNG via an off-screen canvas rendered at 3× resolution. Works across all three rendering modes. On mobile, the Web Share API is used; on desktop, a download link is triggered. The screenshot button is only visible when there is output to export.

## Cross-Browser Compatibility (Phase 3)
All three rendering modes must work correctly in Chrome, Firefox, and Safari on desktop and in Chrome and Safari on mobile. Emoji rendering must be consistent across OS/browser combinations. The responsive layout must be correct on mobile, tablet, and desktop viewports.

## Performance (Phase 4)
Move ASCII conversion off the main thread into a Web Worker. Add WebGL fragment shaders for per-pixel brightness calculation. Decouple video capture, segmentation, and ASCII conversion into independent pipeline stages. Add tile-based incremental processing to skip unchanged regions.

# User Experience

## User Persona
Anyone — no technical knowledge required. The app loads instantly, asks for camera permission, and immediately shows ASCII art. There is no onboarding, no account, no settings to configure before it works.

## Key User Flows

**Webcam flow:**
1. Open the app → WEBCAM tab is active
2. Click "Start Webcam" → browser requests camera permission
3. ASCII art appears in real-time, background removed
4. Optionally switch rendering mode, character set, or color
5. Click 📷 to export PNG

**Image flow:**
1. Click "IMAGE" tab
2. Drag-and-drop or click to upload an image (or capture from webcam)
3. ASCII output appears immediately
4. Optionally switch mode, re-process, export

## UI Layout
- Top: tab navigation (WEBCAM / IMAGE)
- Center: full-viewport ASCII output area
- Bottom-center: mode selector, charset selector, webcam start/stop, screenshot button
- Bottom-right: small mirrored webcam preview (webcam tab only)
- Top-right: performance overlay toggle (debug)
</context>

<PRD>
# Technical Architecture

## Stack
- **Language:** TypeScript 5 (strict mode)
- **Framework:** React 18 + Vite 7 (SWC)
- **State:** Zustand v5 — single store, all business logic in actions
- **Routing:** TanStack Router v1 — two routes: `/` (webcam) and `/image`
- **Styling:** Tailwind CSS v4
- **Key libraries:** `@mediapipe/selfie_segmentation` (WASM, loaded from CDN), `react-colorful` (hex color picker)
- **No backend, no persistence, no auth**

## Module Ownership
- `src/store/index.ts` — all state + all business logic (ASCII conversion, webcam lifecycle, segmentation, render loop, screenshot export)
- `src/main.tsx` — all React components and router setup; components are UI-only, zero logic
- `src/constants/character-sets.ts` — pure data: `CHARACTER_SETS`, `EMOJI_COLOR_PALETTE`, `rgbToNearestEmoji`
- `src/EmojiGrid.tsx` — rendering component for emoji mode only

## State Shape (Zustand store)
```ts
// Webcam
isWebcamActive: boolean
webcamError: string | null
videoRef: HTMLVideoElement | null
streamRef: MediaStream | null

// Canvas (DOM refs set by ref callbacks in components)
canvasRef: HTMLCanvasElement | null
maskCanvasRef: HTMLCanvasElement | null

// Segmentation
segmenter: SelfieSegmentation | null
segmentationLoading: boolean

// Render loop
animationFrameId: number | null

// ASCII output (one field per mode)
asciiOutput: string                          // monochrome: plain text
coloredAsciiOutput: string                   // color: HTML string with <span> tags
emojiOutput: { cols: number; rows: string[] } // emoji: array of emoji strings per row

// Config
asciiWidth: number          // auto-set: 120 landscape, 80 portrait
selectedCharset: string     // 'STANDARD' | 'MINIMAL' | 'BLOCKS'
asciiColor: string          // hex color, default '#00ff00'
colorMode: 'monochrome' | 'color' | 'emoji'

// Image tab
uploadedImage: string | null  // base64 data URL

// Processing
previousMaskData: Uint8ClampedArray | null  // for temporal smoothing

// Perf
perfMetrics: { fps, frameTimeMs, segTimeMs, asciiTimeMs, resolution, gridSize } | null
showPerfOverlay: boolean
```

## ASCII Conversion Pipeline (current — CPU, main thread)

### Monochrome (`updateAsciiOutput`)
1. Apply segmentation mask with temporal smoothing (0.7 current + 0.3 previous, gamma 0.8)
2. Compute per-cell average LAB L* brightness (Gray World white balance + color temperature correction)
3. Unsharp mask pass (k=0.5, 3×3 neighborhood)
4. Map sharpened L* to character index → output plain string

### Color (`updateColorAsciiOutput`)
1. Compute per-cell average RGB + LAB L* brightness (no segmentation mask)
2. Unsharp mask on both brightness (k=0.5) and color channels (k=0.8)
3. Gamma lift (0.55) + saturation boost (1.5×) via HSL
4. Output HTML string: `<span style="color:#rrggbb">char</span>` per cell

### Emoji (`updateEmojiOutput`)
1. Square cells (1:1 aspect ratio, unlike 2:1 for ASCII)
2. Gray World white balance per frame
3. Per-cell average RGB → `rgbToNearestEmoji` (squared Euclidean distance against 23-emoji palette)
4. Output `{ cols, rows: string[] }`

## Screenshot Export (`takeScreenshot`)
Off-screen canvas at 3× scale. Three render paths:
- Monochrome: plain text drawn with `fillText`, single color
- Color: parse `coloredAsciiOutput` HTML with regex → draw each char with its color
- Emoji: `[...rows[y]]` spread for multi-codepoint emoji, drawn at `EMOJI_SIZE * 0.9px serif`

Export: Web Share API if `navigator.share` + `canShare` → else `<a download>` click.

## Render Loop (`startRenderLoop`)
- `requestAnimationFrame` loop, timestamp-based 33ms frame skip (~30fps cap)
- On first frame: detect portrait → set `asciiWidth = 80`
- Each frame: capture video → optional segmentation (monochrome only) → ASCII conversion → update perf metrics
- Acquire/release: `startRenderLoop` → `stopRenderLoop` (cancels rAF)

## Resource Acquire/Release Pairs
| Acquire | Release |
|---|---|
| `startWebcam` (getUserMedia) | `stopWebcam` (stops stream tracks) |
| `initSegmentation` (creates SelfieSegmentation) | `stopWebcam` (nulls segmenter) |
| `startRenderLoop` (requestAnimationFrame) | `stopRenderLoop` (cancelAnimationFrame) |

# Development Roadmap

## Phase 1 — Webcam ASCII
- Webcam start/stop with getUserMedia
- Real-time ASCII conversion at ~30fps (rAF loop with frame skip)
- MediaPipe selfie segmentation — background removal on every frame
- Character set selection: STANDARD, MINIMAL, BLOCKS
- ASCII width auto-scales to viewport; portrait mode detection

## Phase 2 — Image Quality
- Temporal smoothing on segmentation mask (blends current + previous frame)
- Unsharp masking for edge sharpness
- Gray World white balance per frame
- Color temperature detection and correction
- LAB color space brightness (perceptually uniform, replaces naive luminance)
- Timestamp-based frame rate management (~30fps cap)
- Performance metrics dashboard (fps, frame time, seg time, ASCII time, resolution, grid size)

## Phase 3 — Rendering Modes & Image Tab
- Monochrome color picker: 7 preset swatches + HexColorPicker (react-colorful)
- Color mode: per-character colored HTML output with gamma lift + saturation boost
- Emoji mode: 23-emoji color-matched palette, square cells, EmojiGrid component
- Image tab: drag-and-drop / file upload, webcam frame capture, re-process on mode switch
- Screenshot export: off-screen canvas at 3×, all three modes, Web Share API on mobile
- Cross-browser testing: Chrome, Firefox, Safari (desktop); Chrome, Safari (mobile)

## Phase 4 — Performance
The current pipeline runs synchronously on the main thread. Phase 4 moves it off-thread and adds GPU acceleration.

- **Web Worker**: move `updateAsciiOutput`, `updateColorAsciiOutput`, `updateEmojiOutput` to a dedicated worker; communicate via `postMessage` with transferable `ImageData`
- **Worker communication budget**: round-trip overhead must stay under 5ms per frame
- **WebGL shaders**: fragment shader handles per-pixel brightness calculation (target 10–100× speedup vs CPU path)
- **Edge detection**: calculate edge direction per cell, select nearest directional character (e.g. `|`, `/`, `\`, `—`)
- **Pipeline decoupling**: video capture, segmentation, and ASCII conversion become independent stages connected by queues — each runs at its own rate
- **Tile-based incremental processing**: divide frame into tiles; only reprocess tiles where pixel diff exceeds threshold (target 60–80% CPU reduction for static/low-motion scenes)
- **Frame rate target**: smooth 30fps on mid-range hardware with no jank or dropped frames

# Logical Dependency Chain

```
Phase 1: getUserMedia → rAF loop → ASCII conversion → DOM output
    ↓
Phase 2: quality improvements on top of the Phase 1 pipeline (no structural change)
    ↓
Phase 3a: color picker + mode selector (UI + store state only)
    ↓
Phase 3b: color mode output (new render path, parallel to monochrome)
    ↓
Phase 3c: emoji mode output + EmojiGrid component (new render path, square cells)
    ↓
Phase 3d: image tab (reuses all three render paths, adds file input + webcam capture)
    ↓
Phase 3e: screenshot export (reuses all three render paths, off-screen canvas)
    ↓
Phase 3f: cross-browser testing (no code changes expected — verification only)
    ↓
Phase 4a: Web Worker scaffold (message protocol, transferable ImageData)
    ↓
Phase 4b: move CPU render paths into worker
    ↓
Phase 4c: WebGL brightness shader (replaces CPU LAB calculation)
    ↓
Phase 4d: edge detection + directional characters
    ↓
Phase 4e: pipeline decoupling (capture / seg / ASCII as independent stages)
    ↓
Phase 4f: tile-based incremental processing
```

# Risks and Mitigations

## MediaPipe WASM cold start
**Risk:** First segmentation call takes 1–3s while WASM initializes from CDN.
**Mitigation:** `initSegmentation` is called lazily on first `startWebcam` call. `segmentationLoading` state prevents processing until ready. Segmentation errors are silently skipped (frame continues without mask).

## Web Worker + transferable ImageData
**Risk:** Transferring ownership of `ImageData` via `postMessage` is fast but means the main thread loses access to the buffer after transfer. If the worker is slow, frames queue up.
**Mitigation:** Use a single-slot mailbox (drop frames if worker is busy, not a queue). Worker sends back only the output string/array, not image data.

## WebGL in an offscreen canvas
**Risk:** `OffscreenCanvas` + WebGL is not available in all browsers (notably Safari < 16.4).
**Mitigation:** Feature-detect before enabling shader path. Fall back to CPU LAB calculation if unavailable.

## Emoji rendering inconsistency
**Risk:** Emoji glyphs render differently across OS/browser combinations — same codepoint, very different visual appearance and color.
**Mitigation:** Palette entries were selected for visual consistency on major platforms (macOS, iOS, Android, Windows). Cross-browser testing (Phase 3f) must include emoji mode on all targets.

## Main thread jank (current known issue)
**Risk:** The current synchronous pipeline blocks the main thread during ASCII conversion. On slow hardware, this causes visible frame drops and UI unresponsiveness.
**Mitigation:** This is the target for Phase 4. Until then, the 33ms frame skip prevents pile-up, and the perf overlay provides visibility.

# Appendix

## Character Sets
| Key | Name | Characters |
|---|---|---|
| MINIMAL | Minimal | ` .:-=+*#%@` |
| STANDARD | Standard | ` .'^\`",:;Il!i><~+_-?][}{1)(|\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$` |
| BLOCKS | Blocks | ` ░▒▓█` |

## Emoji Palette (23 entries)
Darks: ⬛🖤 | Browns: 🤎🟫 | Warm neutrals: 🫚🍑 | Reds: 🔴❤️ | Oranges: 🟠🧡 | Yellows: 🟡💛 | Greens: 🌿💚🟩 | Blues: 💙🟦 | Purples/pinks: 💜🟣🩷🌸 | Whites: 🤍⬜

## Performance Targets (Phase 4)
| Metric | Target |
|---|---|
| ASCII conversion latency | < 50ms per frame |
| Worker round-trip overhead | < 5ms per frame |
| Frame rate | 30fps on mid-range hardware |
| CPU reduction (static scenes) | 60–80% via tile-based processing |
| Brightness calc speedup | 10–100× via WebGL vs CPU |
</PRD>
