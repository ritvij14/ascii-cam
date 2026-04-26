# ASCII Depth Improvement & Emoji Removal (V2)

Status: In Progress (Tasks 15–20 in .taskmaster/docs/v2-depth-improvement.md)

## Completed

### Phase 1: Emoji Mode Removal (Tasks 1–14)
- Removed `EmojiGrid.tsx` component
- Removed `emojiOutput` state field and `updateEmojiOutput` action from store
- Removed `EMOJI_COLOR_PALETTE` and `rgbToNearestEmoji` from constants
- Updated `ModeControls.tsx` to show only monochrome/color buttons
- Removed emoji handling from worker (`processEmoji`, `emojiOutput` from protocol)
- Updated feature docs: `rendering-modes.md`, `screenshot.md`, `webcam-ascii.md`
- Updated infrastructure docs: `decisions.md` (ADR-004 revised, ADR-010 added)
- Recorded session change in `docs/infra/changelog.md`

## Phase 2: Depth Control Infrastructure (Tasks 15–16)
- Add state fields: fontSize, noise, intensity, contrast, histogramEqualization
- Implement store actions to update each control with bounds checking

## Phase 3: Grayscale & Dithering Pipeline (Tasks 17–20)
- Add BAYER_MATRIX_4X4 and CHAR_LUMINOSITY constants
- Implement rgbToLuminosity() conversion function
- Implement applyGrayscaleConversion() with intensity/contrast/noise
- Implement applyOrderedDithering() with Bayer 4x4 matrix
- Integrate into monochrome worker processing

## Completed in this session
- **Task 51 — Noise control:** Added `noise` to `WorkerConfig`, applied ±N random noise to pixel values in `processMonochrome` before white balance/LAB processing, exposed slider UI in `ModeControls` (range 0–50, default 0). Updated `updateAsciiOutput`/`updateColorAsciiOutput` to pass `noise` through config.
- **Task 53 — Histogram equalization:** Added `histogramEqualization` to `WorkerConfig` and store state (default `true`). Implemented `applyHistogramEqualization()` in the worker using 256-bin CDF equalization on `cellBrightness`. Applied in both `processMonochrome` and `processColor` after cell brightness computation and before gamma/contrast adjustments. Added toggle button in `ModeControls`. Updated `rendering-modes.md`.
- **Task 54 — Font size control:** Added `fontSize` slider to `ModeControls` (range 6–20px, default 12). `asciiWidth` is now computed dynamically from `fontSize` and source width (`floor(sourceWidth / (fontSize * 0.6))`) inside `updateAsciiOutput` and `updateColorAsciiOutput`. `AsciiDisplay` renders at the fixed `fontSize` instead of using `clamp()`. Removed portrait-mode `asciiWidth: 80` override from `startRenderLoop`. Added `onFontSizeChange` prop to `ModeControls` and wired it to `handleReprocess` in `ImagePage`. Updated `rendering-modes.md` and `webcam-ascii.md`.

## Motivation

**Emoji Removal:** Complexity without value. Three modes confuse users; two suffice. Removes ~300 LOC and bundle bloat.

**Depth Improvement:** Current monochrome is a silhouette. Enhancement reveals skin gradients, facial features, texture—near-photorealistic ASCII via grayscale pipeline and ordered dithering.

## Testing

Each task includes specific acceptance criteria and testing strategies. Real-time feedback loop: implement → test with user → iterate based on feedback.

See .taskmaster/docs/v2-depth-improvement.md for complete task breakdown.
