# PRD: ASCII Camera V2 - Depth Improvement & Emoji Mode Removal

> Version: 1.0
> Created: 2026-04-16
> Status: Draft for TaskMaster parsing

---

## 1. Overview

**Project:** ASCII Camera V2
**Goal:** Remove emoji mode completely and enhance ASCII output depth to achieve near-photorealistic representation of webcam feed
**Type:** Feature Enhancement + Cleanup

---

## 2. Motivation

### 2.1 Remove Emoji Mode

Emoji mode adds complexity without significant value. Current implementation:
- Requires separate `EmojiGrid.tsx` component
- Maintains separate `emojiOutput` state and render path
- Increases bundle size with emoji palette
- Confusers users with 3 mode options when 2 suffices

Removing emoji simplifies codebase, reduces context, and eliminates maintenance burden.

### 2.2 Depth Improvement

Current ASCII output is a **silhouette** — facial features, skin texture, and details are lost. User wants near-photorealistic ASCII that captures:
- Skin tone gradients (not just bright/dark)
- Facial features (eyes, nose, mouth contours)
- Clothing texture
- Background detail

The goal: ASCII art that looks like a **grayscale photo**, not a shadow puppet.

---

## 3. Technical Approach

### 3.1 Grayscale Conversion Pipeline

**Primary Approach:**
```
Frame → Luminosity (0.299R + 0.587G + 0.114B) → Gamma/Contrast → Noise → Dithering → Character Mapping
```

**Fallback (if primary fails):**
- Try CIELAB L-channel conversion for perceptual accuracy
- Try different luminosity coefficients if skin tones render too dark

### 3.2 Dithering Strategy

**Primary: Ordered Dithering (Bayer 4x4)**
- Fast (no error propagation needed)
- Good visual quality for ASCII
- Implementation: Pre-computed 4x4 matrix, apply threshold per pixel

**Fallback: Floyd-Steinberg**
- Slower but smoother gradients
- Implement if ordered dithering looks too "checkerboard"

### 3.3 Histogram Equalization

**Decision:** Toggleable, default ON
- Equalizes brightness distribution across frame
- Reveals shadow/highlight details
- Toggle allows user to compare with/without

---

## 4. Requirements

### 4.1 Emoji Mode Removal

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| R1.1 | Remove EmojiGrid.tsx component | File deleted, no imports remain |
| R1.2 | Remove emoji state from store | `emojiOutput` field removed from AppState |
| R1.3 | Remove emoji render path from main.tsx | Only monochrome/color rendering paths exist |
| R1.4 | Remove EMOJI_COLOR_PALETTE from character-sets.ts | Constant removed, only CHARACTER_SETS remains |
| R1.5 | Remove rgbToNearestEmoji helper | Function removed |
| R1.6 | Update ModeControls UI | Emoji option removed from colorMode selector |
| R1.7 | Update rendering-modes.md | Emoji mode section removed |
| R1.8 | Update CLAUDE.md | Emoji references removed, colorMode type updated |
| R1.9 | Update decisions.md | Emoji decisions archived or removed |

### 4.2 Depth Improvements - Grayscale Pipeline

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| R2.1 | Implement luminosity grayscale conversion | Uses 0.299R + 0.587G + 0.114B formula |
| R2.2 | Add contrast control (gamma curve) | Range 0.5-2.0, default 1.0 |
| R2.3 | Add intensity control (brightness) | Range 0.5-2.0, default 1.0 |
| R2.4 | Add noise control | Range 0-50, default 0 |
| R2.5 | Implement ordered dithering (Bayer 4x4) | Applies dithering before character mapping |
| R2.6 | Add histogram equalization toggle | Default ON, improves detail visibility |

### 4.3 Depth Improvements - Font Size Control

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| R3.1 | Add font size slider to controls | Range 6px-20px, default 12px |
| R3.2 | Font size affects ASCII grid dimensions | Smaller font = more characters = more detail |
| R3.3 | Maintain aspect ratio when resizing | 2:1 ratio preserved (chars are ~2x taller than wide) |

### 4.4 Integration & UI

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| R4.1 | New controls appear in ModeControls | Font size, noise, intensity, contrast, histogram toggle |
| R4.2 | Controls are functional and affect output in real-time | Changes reflect immediately in ASCII output |
| R4.3 | Color mode continues to work unchanged | Emoji removal doesn't break color mode |

### 4.5 Documentation Updates

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| R5.1 | Update rendering-modes.md | Document new depth controls, remove emoji |
| R5.2 | Update webcam-ascii.md | Document grayscale pipeline changes |
| R5.3 | Update changelog.md | Document V2 changes |

---

## 5. Architecture Changes

### 5.1 Store Changes

**Remove:**
- `emojiOutput` state field
- `colorMode: 'emoji'` type value

**Add:**
```ts
// New state fields
fontSize: number;        // 6-20, default 12
noise: number;           // 0-50, default 0
intensity: number;       // 0.5-2.0, default 1.0
contrast: number;        // 0.5-2.0, default 1.0
histogramEqualization: boolean; // default true
```

### 5.2 New Store Actions

- `updateFontSize(size: number)` - Updates font size and recalculates grid dimensions
- `updateNoise(level: number)` - Applies noise before grayscale conversion
- `updateIntensity(level: number)` - Adjusts brightness
- `updateContrast(gamma: number)` - Applies gamma curve
- `toggleHistogramEqualization()` - Toggles histogram equalization

### 5.3 Character Set

No changes needed — existing STANDARD charset has enough gradient for depth with dithering.

### 5.4 New Constants

```ts
// character-sets.ts additions
export const BAYER_MATRIX_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5]
] as const;

// Character luminance values (pre-computed)
export const CHAR_LUMINOSITY = {
  ' ': 0.0,
  '.': 0.1,
  // ... mapping for all characters in STANDARD set
} as const;
```

---

## 6. Implementation Order

### Phase 1: Emoji Removal (Priority: High)
1. Remove emoji code from store
2. Remove EmojiGrid.tsx
3. Remove emoji from constants
4. Update ModeControls
5. Update all docs

### Phase 2: Depth Pipeline (Priority: High)
1. Implement luminosity conversion
2. Add contrast/intensity controls
3. Add noise control
4. Implement ordered dithering
5. Add histogram equalization

### Phase 3: Font Size (Priority: Medium)
1. Add font size state and control
2. Connect font size to grid dimension calculation
3. Ensure aspect ratio maintained

### Phase 4: Manual Testing & Polish

**Testing is manual by user.** After each implementation step, I will:
1. Ask you to test the changes
2. Wait for your feedback
3. Iterate based on your feedback

**Testing checklist for each step:**
- [ ] Run the app and verify it works
- [ ] Check the specific feature being implemented
- [ ] Provide feedback: what works, what doesn't, what needs adjustment

---

## 7. Dependencies

- All V1 features must remain functional
- No new external dependencies (dithering is custom implementation)
- MediaPipe continues to work for segmentation (if enabled)

---

## 8. Out of Scope

- Video quality beyond ASCII depth improvement
- New rendering modes (sticking to monochrome/color)
- Persistent settings (state remains in-memory)
- Mobile-specific optimizations

---

## 9. Fallback Strategies

If primary approach doesn't achieve desired depth:

1. **Grayscale formula**: Try CIELAB L-channel instead of luminosity
2. **Dithering**: Fall back to Floyd-Steinberg if ordered looks too checkerboard
3. **Character set**: Create custom high-gradient charset with more middle values

---

## 10. Success Criteria

- [ ] Emoji mode completely removed from code and docs
- [ ] Monochrome mode shows detailed facial features, skin gradients
- [ ] All 5 new controls functional (font size, noise, intensity, contrast, histogram)
- [ ] Color mode continues to work
- [ ] Performance remains smooth (30+ FPS target)
- [ ] Documentation updated