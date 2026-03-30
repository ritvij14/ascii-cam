# Screenshot Export

> Status: Stable
> Last updated: 2026-03-27

---

## Overview

Users can export the current ASCII output as a PNG file. The feature works across all three rendering modes (monochrome, color, emoji) and is available on both the Webcam and Image tabs. The button label and loading state are context-aware.

---

## State

| Field | Type | Initial | Description |
|---|---|---|---|
| `screenshotLoading` | `boolean` | `false` | `true` while the off-screen canvas is being rendered and the blob is being created |

---

## Entry Points

### Webcam tab (`WebcamPage.tsx`)
- Button label: **"Take Screenshot"**
- Visible only when `hasOutput` is true (i.e. there is ASCII/color/emoji output to export)

### Image tab (`ImagePage.tsx`)
- Button label: **"Download Image"**
- Visible only when `hasOutput` is true

Both buttons are disabled and show a spinner while `screenshotLoading` is `true`.

---

## Action: `takeScreenshot`

Lives in `src/store/index.ts`. Steps:

1. Sets `screenshotLoading: true`
2. Creates an off-screen `<canvas>` (never added to the DOM)
3. Branches on `colorMode`:
   - **emoji** — draws each emoji cell at `20 × SCALE` px using `ctx.fillText`
   - **color** — parses `coloredAsciiOutput` HTML spans with a regex, draws each character in its color
   - **monochrome** — draws plain text lines in `asciiColor`
4. Calls `canvas.toBlob()` — inside the callback, sets `screenshotLoading: false`, then triggers a download via a temporary `<a download>` element
5. All early-return guards also set `screenshotLoading: false` before returning

See the [Off-Screen Canvas Export](../infra/patterns.md#off-screen-canvas-export) pattern for the full rendering technique.

---

## Loading State UX

- Button is `disabled` during export (`disabled:opacity-50 disabled:cursor-not-allowed`)
- The 📷 / ⬇️ icon is replaced with an `animate-spin` SVG spinner
- Because `canvas.toBlob` is near-instant for typical ASCII output sizes, the spinner is brief but visible on slower devices

---

## Error Handling

- If `canvas.getContext('2d')` returns null, `screenshotLoading` is reset and the action returns early — no download, no crash
- If `toBlob` produces a null blob, `screenshotLoading` is already reset (it's set at the top of the callback) and the download is skipped silently
- Empty output guards: if there are no rows/lines to render, `screenshotLoading` is reset and the action returns early
