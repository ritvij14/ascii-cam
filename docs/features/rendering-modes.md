# Rendering Modes

> **Feature doc for the three rendering modes: monochrome, color, and emoji.**
> Covers mode switching, per-mode output pipeline, color post-processing, and component rendering.
> Status: Stable
> Last updated: 2026-03-23

---

## Index

- [Overview](#overview)
- [Data Model](#data-model)
- [Mode Switching](#mode-switching)
- [Monochrome Mode](#monochrome-mode)
- [Color Mode](#color-mode) — LAB brightness, color unsharp mask, saturation boost
- [Emoji Mode](#emoji-mode) — square cells, gray world WB, nearest-emoji lookup
- [Character Sets](#character-sets)
- [Component Rendering](#component-rendering)
- [Dependencies](#dependencies)

---

## Overview

The app supports three mutually exclusive rendering modes controlled by the `colorMode` field in the store. Each mode has its own output field, its own update function, and its own render component or path. They share no mutable state with each other.

| Mode | Output field | Update function | Renderer |
|---|---|---|---|
| `monochrome` | `asciiOutput: string` | `updateAsciiOutput` | `<pre>` with `asciiColor` fill |
| `color` | `coloredAsciiOutput: string` | `updateColorAsciiOutput` | `<pre dangerouslySetInnerHTML>` |
| `emoji` | `emojiOutput: { cols, rows }` | `updateEmojiOutput` | `EmojiGrid` component |

The render loop (`startRenderLoop`) dispatches to the correct update function each frame based on `colorMode`. Segmentation (background removal) runs only in monochrome mode — color and emoji use the raw unmasked frame.

---

## Data Model

Mode-related state fields in `AppState` (`src/store/index.ts:5`):

| Field | Type | Description |
|---|---|---|
| `colorMode` | `'monochrome' \| 'color' \| 'emoji'` | Active rendering mode |
| `asciiOutput` | `string` | Newline-separated ASCII chars; written by `updateAsciiOutput` |
| `coloredAsciiOutput` | `string` | HTML string of `<span style="color:#rrggbb">c</span>` per char |
| `emojiOutput` | `{ cols: number; rows: string[] }` | Grid of emoji strings, one string per row |
| `asciiColor` | `string` | Hex color used for monochrome text; default `#00ff00` |
| `selectedCharset` | `string` | Key into `CHARACTER_SETS`; used by monochrome and color modes |

---

## Mode Switching

`colorMode` is updated via `updateAppState({ colorMode: '...' })` from the UI. No teardown or re-initialization is needed — the render loop reads `colorMode` on every frame and calls the right update function. Switching modes takes effect on the next frame.

The charset picker is hidden in emoji mode (emojis replace characters entirely). The color picker is visible in all modes but only affects monochrome output.

---

## Monochrome Mode

The full monochrome pipeline (background segmentation, white balance, color temperature correction, LAB brightness, unsharp masking, character mapping) is documented in [docs/features/webcam-ascii.md](webcam-ascii.md#ascii-pipeline-monochrome).

Key differences from other modes:
- **Segmentation runs** — background pixels are zeroed before processing
- **White balance + color temp** applied before LAB conversion
- **Output is a plain string** — `asciiColor` CSS is applied by the `<pre>` component

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

All four values are computed in a single nested loop over cell pixels to avoid a second full-image scan.

### Step 3 — Second pass: character selection + color post-processing

For each cell, the 3×3 neighborhood average is computed (same as monochrome unsharp mask). Two separate sharpening operations run:

**Brightness unsharp mask** (`k = 0.5`) — selects the character:
```
sharpened_L = clamp(L + 0.5 * (L - blur_L), 0, 100)
charIndex = floor(sharpened_L / 100 * (charset.length - 1))
```

**Color unsharp mask** (`k = 0.8`) — sharpens the RGB values used for span color:
```
sR = clamp(cellR + 0.8 * (cellR - blur_R), 0, 255)
sG = clamp(cellG + 0.8 * (cellG - blur_G), 0, 255)
sB = clamp(cellB + 0.8 * (cellB - blur_B), 0, 255)
```

Color edges are sharpened more aggressively than brightness (`k = 0.8` vs `k = 0.5`) to make color boundaries pop visually.

### Step 4 — Saturation boost

After sharpening, two transformations lift the colors from the typically muted/gray webcam output:

**Gamma lift** (`gamma = 0.55`) — brightens dark midtones without blowing out highlights:
```ts
cr = Math.pow(cr, 0.55);  // applied to normalized [0, 1] channels
```

**HSL saturation boost** (1.5× saturation) — converts to HSL, multiplies `s` by 1.5 (clamped at 1), converts back to RGB:
```ts
const s = Math.min(1, (d / (1 - Math.abs(2 * l - 1))) * 1.5);
```

This is applied only when the cell has non-zero chroma (`d > 0`). Near-gray cells are passed through unchanged.

### Step 5 — HTML span output

Each character is emitted as:
```html
<span style="color:#rrggbb">c</span>
```

Where `#rrggbb` is the hex representation of the post-processed RGB. Row boundaries are `\n`. The full output is joined into `coloredAsciiOutput`.

---

## Emoji Mode

`updateEmojiOutput(imageData)` at `src/store/index.ts:400`.

Replaces ASCII characters with emoji chosen by nearest-color match. No charset is used.

### Cell shape — square cells

Unlike ASCII chars (which are ~2:1 height:width), emoji render as squares. Cell dimensions use 1:1 aspect ratio:

```ts
const cellSize = Math.floor(imgWidth / asciiWidth);  // square: width = height
const height   = Math.floor(imgHeight / cellSize);
```

This gives more rows than the ASCII modes for the same `asciiWidth`, since cells are shorter.

### White balance — Gray World algorithm

Emoji mode applies the same Gray World white balance as monochrome mode (sample every 4th pixel, compute mean R/G/B, normalize to gray mean) but does not apply color temperature correction. The simpler approach is sufficient since emoji selection is coarse anyway.

### Nearest-emoji lookup

Per-cell average RGB (after white balance) is passed to `rgbToNearestEmoji(r, g, b)` from `src/constants/character-sets.ts:66`:

```ts
for (const entry of EMOJI_COLOR_PALETTE) {
  const dr = r - entry.r, dg = g - entry.g, db = b - entry.b;
  const dist = dr * dr + dg * dg + db * db;
  if (dist < bestDist) { bestDist = dist; best = entry; }
}
```

Squared Euclidean distance in RGB space — fast, no square root needed. The palette has 23 emoji covering darks, browns, warm neutrals/skin tones, reds, oranges, yellows, greens, blues, purples/pinks, and whites.

### Output

```ts
set({ emojiOutput: { cols: asciiWidth, rows } });
```

`rows` is an array of strings, one per row, where each string is a concatenation of emoji characters (e.g. `"⬛🔴💛🟩"`). `cols` is `asciiWidth` — used by the renderer to compute font size.

---

## Character Sets

Defined in `src/constants/character-sets.ts`. Used by monochrome and color modes only (not emoji).

| Key | Name | Characters | Length |
|---|---|---|---|
| `MINIMAL` | Minimal | ` .:-=+*#%@` | 10 |
| `STANDARD` | Standard | Full ASCII gradient (space → `$`) | 70 |
| `BLOCKS` | Blocks | ` ░▒▓█` | 5 |
| *(emoji mode)* | — | `EMOJI_COLOR_PALETTE` (23 entries) | 23 |

`DEFAULT_CHARSET` is `'STANDARD'`. The active charset is read from `CHARACTER_SETS[selectedCharset].characters` in each update function.

Character order is light → dark: the first character maps to brightness 0 (darkest/background) and the last maps to brightness 100 (brightest). Charset strings must maintain this ordering — inserting characters out of order will corrupt the brightness mapping.

---

## Component Rendering

### Monochrome and Color

Both are rendered in `src/components/AsciiDisplay.tsx` as a `<pre>` element. The distinction:

- **Monochrome:** `{asciiOutput}` as a text child, with `color: asciiColor` CSS
- **Color:** `dangerouslySetInnerHTML={{ __html: coloredAsciiOutput }}` to parse the span tags

Font size uses a `clamp()` expression to fit the grid within the viewport:
```
clamp(4px, min(calc((100vw - 32px) / cols), calc((100dvh - 32px) / rows)), 24px)
```

### Emoji — `EmojiGrid` component

`src/EmojiGrid.tsx` renders emoji mode. Reads `emojiOutput` from the store.

```tsx
<div style={{ fontSize, lineHeight: 1 }}>
  {rows.map((row, y) => (
    <div key={y} style={{ whiteSpace: 'nowrap', height: '1em' }}>
      {row}
    </div>
  ))}
</div>
```

Each row is a `<div>` with `height: 1em` and `lineHeight: 1` so emoji cells are visually square. `whiteSpace: 'nowrap'` prevents emoji from wrapping mid-row.

Font size uses the same `clamp()`/`min()` expression as the ASCII modes but divides by `rows.length` for height. The `cols` and `rows.length` values come from `emojiOutput` directly.

The `fontSize` clamp targets square cells — `1em` height and `1em` width. Emoji in most fonts render at full em-square width, making this work without explicit `width` on each cell.

---

## Dependencies

- `src/constants/character-sets.ts` — `CHARACTER_SETS`, `DEFAULT_CHARSET`, `EMOJI_COLOR_PALETTE`, `rgbToNearestEmoji`
- `src/EmojiGrid.tsx` — renders emoji mode; reads `emojiOutput` from store
- `src/store/index.ts` — `updateColorAsciiOutput`, `updateEmojiOutput`, `colorMode`, `asciiColor`, `selectedCharset`
- `src/components/AsciiDisplay.tsx` — renders monochrome and color `<pre>`, conditionally mounts `EmojiGrid`
- `src/components/ModeControls.tsx` — exposes mode toggle, charset picker, and color picker UI
- `src/components/WebcamPage.tsx` / `src/components/ImagePage.tsx` — host `ModeControls` and `AsciiDisplay`
