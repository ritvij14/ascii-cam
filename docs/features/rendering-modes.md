# Rendering Modes

> **Feature doc for the two rendering modes: monochrome and color.**
> Covers mode switching, per-mode output pipeline, color post-processing, edge detection, and component rendering.
> Status: Stable
> Last updated: 2026-04-27 (WebGL offload for color mode — per-pixel LAB L* computed in GPU shader, same pipeline reused for monochrome and color)

---

## Index

- [Overview](#overview)
- [Data Model](#data-model)
- [Mode Switching](#mode-switching)
- [Monochrome Mode](#monochrome-mode)
- [Color Mode](#color-mode) — LAB brightness, color unsharp mask, saturation boost
- [Character Sets](#character-sets)
- [Character Sets](#character-sets)
- [Component Rendering](#component-rendering)
- [Dependencies](#dependencies)

---

## Overview

The app supports two mutually exclusive rendering modes controlled by the `colorMode` field in the store. Each mode has its own output field and update function. They share no mutable state with each other.

| Mode | Output field | Update function | Renderer |
|---|---|---|---|
| `monochrome` | `asciiOutput: string` | `updateAsciiOutput` | `<pre>` with `asciiColor` fill |
| `color` | `coloredAsciiOutput: string` | `updateColorAsciiOutput` | `<pre dangerouslySetInnerHTML>` |

The render loop (`startRenderLoop`) dispatches to the correct update function each frame based on `colorMode`. Segmentation (background removal) runs only in monochrome mode — color uses the raw unmasked frame.

---

## Data Model

Mode-related state fields in `AppState` (`src/store/index.ts:5`):

| Field | Type | Description |
|---|---|---|
| `colorMode` | `'monochrome' \| 'color'` | Active rendering mode |
| `asciiOutput` | `string` | Newline-separated ASCII chars; written by `updateAsciiOutput` |
| `coloredAsciiOutput` | `string` | HTML string of `<span style="color:#rrggbb">c</span>` per char |
| `asciiColor` | `string` | Hex color used for monochrome text; default `#00ff00` |
| `selectedCharset` | `string` | Key into `CHARACTER_SETS`; used by both modes |
| `fontSize` | `number` | Detail density (store value 2–20); default `8`. In the UI this is shown as a **DETAIL** slider with reversed scale: **20 = highest detail** (store fontSize = 2, smallest source pixels per char), **2 = lowest detail** (store fontSize = 20, largest source pixels per char). The mapping is `storeFontSize = 22 - sliderValue`. Controls grid density via `asciiWidth`. Not a display font size — the rendered text auto-fits the container with a 2px minimum. |
| `asciiWidth` | `number` | Grid columns; computed dynamically from `fontSize` and source width |
| `intensity` | `number` | Post-processing brightness multiplier (0.5–2.0); default `1.0` |
| `contrast` | `number` | Linear contrast scaling around midpoint (0.5–2.0); default `1.0`. At `1.0` it is neutral. Values > 1 stretch midtones outward; values < 1 compress toward the midpoint. |

---

## Mode Switching

`colorMode` is updated via `updateAppState({ colorMode: '...' })` from the UI. No teardown or re-initialization is needed — the render loop reads `colorMode` on every frame and calls the right update function. Switching modes takes effect on the next frame.

The color picker only affects monochrome output (color mode uses per-pixel span colors).

---

## Monochrome Mode

The full monochrome pipeline (background segmentation, white balance, color temperature correction, LAB brightness, histogram equalization, unsharp masking, character mapping) is documented in [docs/features/webcam-ascii.md](webcam-ascii.md#ascii-pipeline-monochrome).

Key differences from other modes:
- **Segmentation runs** — background pixels are zeroed before processing
- **White balance + color temp** applied before luminosity calculation
- **Output is a plain string** — `asciiColor` CSS is applied by the `<pre>` component

### Post-processing controls

After cell-averaging, the following are applied in order:

1. **Contrast** — linear scaling around the midpoint:
   ```
   adjusted = (normalized - 0.5) * contrast + 0.5
   clamped  = max(0, min(1, adjusted))
   ```
   At `contrast = 1.0`: neutral. At `contrast = 2.0`: a pixel at 75% becomes 100%, a pixel at 25% becomes 0%. Midtones are pushed toward the extremes symmetrically.
2. **Intensity** — simple brightness multiplier applied after contrast: `clamped * 100 * intensity`

---

## Color Mode

`updateColorAsciiOutput(imageData)` at `src/store/index.ts:285`.

Produces an HTML string where every character is wrapped in a `<span>` with an inline color derived from the source pixels. Background removal does not run in this mode.

### Step 1 — Grid dimensions

Same 2:1 cell aspect ratio as monochrome:

```ts
const cellWidth  = Math.floor(imgWidth / asciiWidth);
const cellHeight = Math.floor(cellWidth * 2);
const height     = Math.floor(imgHeight / cellHeight);
```

### Step 2 — First pass: per-cell RGB + LAB brightness

Four `Float32Array` buffers are allocated for the full grid (`asciiWidth × height` cells):
- `cellR`, `cellG`, `cellB` — average RGB of each cell
- `cellBrightness` — average LAB L* of each cell

**WebGL offload (preferred path)**

When `OffscreenCanvas` + WebGL2 are available, the worker renders directly to a cell-grid-sized framebuffer (`asciiWidth × height`). The fragment shader computes per-pixel RGB + LAB L* inside nested loops over each cell's source pixel region, accumulates the sums, and outputs the averages:

- Fragment shader mode uniform `uMode = 1`
- Per fragment: `cellX = gl_FragCoord.x`, `cellY = gl_FragCoord.y`
- Sample every source pixel in `[cellX·cellWidth, cellY·cellHeight)` via `texture()`
- Accumulate `sumR`, `sumG`, `sumB`, `sumL` in GLSL; divide by `count`
- Output: `vec4(avgR, avgG, avgB, avgL/100)`
- `gl.readPixels()` reads the cell grid only (~28 KB at typical detail, vs ~3.7 MB for full 720p frame)

This eliminates both the per-pixel `Math.pow` + `Math.cbrt` bottleneck **and** the CPU cell-averaging loop (~1M pixel visits per frame).

**CPU fallback**

On browsers without OffscreenCanvas WebGL support (Safari < 16.4), the nested pixel loop calls `rgbToLabL()` in JavaScript per pixel and averages per cell on CPU as before.

### Step 3 — Second pass: character selection + color post-processing

For each cell, the 3×3 neighborhood average is computed (same as monochrome unsharp mask). Two separate sharpening operations run:

**Brightness unsharp mask** (`k = 0.5`) — selects the character:
```
sharpened_L = clamp(L + 0.5 * (L - blur_L), 0, 100)
```

**Bayer 4x4 ordered dithering** — applied before character mapping in both modes to increase perceived brightness levels:
```
step = 100 / (charset.length - 1)
bayerThreshold = (BAYER_MATRIX_4X4[y % 4][x % 4] / 16 - 0.5)
dithered_L = sharpened_L + bayerThreshold * step
charIndex = clamp(floor(dithered_L / 100 * (charset.length - 1)), 0, charset.length - 1)
```

The Bayer matrix spatially distributes quantization error, creating the illusion of intermediate brightness levels by alternating between adjacent characters in a 4×4 tile pattern.

**Color unsharp mask** (`k = 0.8`) — sharpens the RGB values used for span color:
```
sR = clamp(cellR + 0.8 * (cellR - blur_R), 0, 255)
sG = clamp(cellG + 0.8 * (cellG - blur_G), 0, 255)
sB = clamp(cellB + 0.8 * (cellB - blur_B), 0, 255)
```

Color edges are sharpened more aggressively than brightness (`k = 0.8` vs `k = 0.5`) to make color boundaries pop visually.

### Contrast and intensity in color mode

Color mode applies the same contrast and intensity steps to `cellBrightness` before character selection. The per-cell RGB values (`cellR`, `cellG`, `cellB`) are **not** affected by contrast/intensity — only the brightness used to pick the character is. The span colors remain driven by the raw sharpened RGB, preserving the original color fidelity while the character choice responds to depth controls.

### Step 4 — Saturation boost

After sharpening, two transformations lift the colors from the typically muted/gray webcam output:

**Gamma lift** (`gamma = 0.55`) — brightens dark midtones without blowing out highlights. Applied via a precomputed `GAMMA_TABLE[256]` lookup instead of per-cell `Math.pow`, eliminating ~345,000 transcendental calls per frame at high detail:
```ts
cr = GAMMA_TABLE[Math.round(sR)];  // sR is in [0, 255]
```

**RGB chroma boost** (1.5×) — luminance-preserving saturation increase without the expensive HSL round-trip. Each channel is moved away from the gray midpoint by 1.5×, then clamped:
```ts
const mid = (cr + cg + cb) / 3;
const boost = 1.5;
cr = clamp(mid + (cr - mid) * boost, 0, 1);
cg = clamp(mid + (cg - mid) * boost, 0, 1);
cb = clamp(mid + (cb - mid) * boost, 0, 1);
```

This replaces the previous full HSL→RGB conversion (15+ transcendental operations per cell) with 3 subtractions, 3 multiplications, and 3 clamps — visually similar but ~5× faster.

### Step 5 — HTML span output

Each character is emitted as:
```html
<span style="color:#rrggbb">c</span>
```

Where `#rrggbb` is the hex representation of the post-processed RGB. Row boundaries are `\n`. The full output is joined into `coloredAsciiOutput`.

**Hex lookup table** — To avoid creating ~345,000 temporary strings per frame at high detail, the worker precomputes a `HEX_TABLE[256]` once at module load (e.g., `HEX_TABLE[255] = 'ff'`). Per-cell formatting becomes three array lookups: `HEX_TABLE[Math.round(cr * 255)]`, eliminating all `toString(16).padStart(2, '0')` allocations from the hot loop.

---

## Character Sets

Defined in `src/constants/character-sets.ts`. Used by both monochrome and color modes.

| Key | Name | Characters | Length |
|---|---|---|---|
| `MINIMAL` | Minimal | ` .:-=+*#%@` | 10 |
| `STANDARD` | Standard | Full ASCII gradient (space → `$`) | 70 |
| `BLOCKS` | Blocks | ` ░▒▓█` | 5 |

`DEFAULT_CHARSET` is `'STANDARD'`. The active charset is read from `CHARACTER_SETS[selectedCharset].characters` in each update function.

Character order is light → dark: the first character maps to brightness 0 (darkest/background) and the last maps to brightness 100 (brightest). Charset strings must maintain this ordering — inserting characters out of order will corrupt the brightness mapping.

### Edge Detection (Monochrome Mode)

In monochrome mode, edge detection is automatically enabled to enhance edge sharpness. The Sobel operator is applied to the brightness grid:

1. **Sobel gradient computation** — For each cell, compute 3×3 Sobel X and Y gradients from neighboring brightness values
2. **Edge magnitude** — `magnitude = sqrt(gx² + gy²)` — if > 15, considered a strong edge
3. **Edge direction** — `angle = atan2(gy, gx)` — maps to directional character:
   - Near 0° or 180° → `—` (horizontal)
   - Near ±90° → `|` (vertical)
   - Near +45° → `/` (diagonal up)
   - Near -45° → `\` (diagonal down)
4. **Fallback** — Non-edge cells use brightness-based character from the selected charset

This produces a sketch-like effect where edges are highlighted with directional characters while flat areas use the gradient from the charset.

---

## Component Rendering

### Monochrome and Color

Both are rendered in `src/components/AsciiDisplay.tsx` as a `<pre>` element. The distinction:

- **Monochrome:** `{asciiOutput}` as a text child, with `color: asciiColor` CSS
- **Color:** `dangerouslySetInnerHTML={{ __html: coloredAsciiOutput }}` to parse the span tags

The grid width is determined by `asciiWidth`, which is computed from the source image/video width and `fontSize`:

```
asciiWidth = floor(sourceWidth / fontSize)
```

Smaller values produce more columns and finer detail; larger values produce fewer columns and coarser detail. The 2:1 cell aspect ratio is preserved in the worker (`cellHeight = floor(cellWidth * 2)`).

#### Display sizing — auto-fit without CSS transform

The `<pre>` tag in `AsciiDisplay.tsx` uses `w-full h-full` so it always fills the entire available viewport area. The ASCII text is rendered inside an inner `<span>` that is **positioned absolutely** at `top: 50%; left: 50%` with `transform: translate(-50%, -50%)` — no CSS `scale()` is used.

A `ResizeObserver` watches both the container and the inner span. On every resize it computes a `displayFontSize` that makes the content fill the container:

```
scale = min(containerWidth / contentWidth, containerHeight / contentHeight)
displayFontSize = displayFontSize * scale
```

The font size is applied directly to the inner `<span>` via `style={{ fontSize: \`${displayFontSize}px\` }}`. Because the text is rendered at its natural size (no transform scaling), the visual result is crisp and centered without the drift artifacts that `transform: scale()` caused at fractional zoom levels.

**Why no CSS `scale()`?**
Previously the display used `transform: scale(N)` on the inner span. This created two problems: (1) the scaled bounding box extended asymmetrically from the layout box, causing horizontal/vertical drift at different scale factors; and (2) the `fontSize` slider conflated two concerns — detail density (how many characters sample the image) and display size (how big each character appears). By separating them, the DETAIL slider now controls only grid density, and the display auto-fits to fill the container at the correct font size.

**Font-size transition: clearing stale output**
When `fontSize` changes, the old ASCII grid (computed for a different `asciiWidth`) stays visible while the worker recalculates. During this gap, `ResizeObserver` computes a `displayFontSize` for the stale content at the new detail setting, producing a transient visual jump. To eliminate this, `updateAppState` in `src/store/index.ts` detects a `fontSize` change and immediately clears `asciiOutput` and `coloredAsciiOutput`. The placeholder text appears briefly; once the worker returns the correctly-sized new grid, it replaces the placeholder with no visual drift.

### ModeControls Layout

`ModeControls.tsx` renders as a horizontal configuration bar:
- **Always visible:** Mode toggle (`MONOCHROME` / `COLOR`), charset picker (`STANDARD` / `MINIMAL` / `BLOCKS`), and a settings (⚙️) button
- **Settings dropdown (upward):** Toggled by the ⚙️ button. Contains color swatches + `HexColorPicker` (monochrome only), `DETAIL` / `INTENSITY` / `CONTRAST` sliders
- The bar uses `flex-wrap justify-center` with `sm:` dividers so it wraps gracefully on narrow screens; the dropdown is `absolute bottom-full` with `z-30`

## Dependencies

- `src/constants/character-sets.ts` — `CHARACTER_SETS`, `DEFAULT_CHARSET`, `BAYER_MATRIX_4X4`
- `src/store/index.ts` — `updateColorAsciiOutput`, `updateAsciiOutput`, `colorMode`, `asciiColor`, `selectedCharset`
- `src/components/AsciiDisplay.tsx` — renders monochrome and color `<pre>`
- `src/components/ModeControls.tsx` — horizontal configuration bar with mode toggle, charset picker, and a settings (⚙️) button that opens an upward dropdown containing: color picker (monochrome only), detail/intensity/contrast sliders
- `src/components/WebcamPage.tsx` / `src/components/ImagePage.tsx` — host `ModeControls` and `AsciiDisplay`
