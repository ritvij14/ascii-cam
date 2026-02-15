# ASCII Camera Project - Claude Reference Guide

## Project Overview

A web-based ASCII Camera application that converts live webcam feeds and uploaded images into ASCII art in real-time. Built with React + TypeScript + Vite + TanStack libraries, deployed on Vercel.

## Coding Style

Write as less code as possible to accomplish the task, and only do things you are more than 90% sure about. If you are unsure about something, use the ask question tool to ask the user a series of MCQ questions to solidify your own understanding.

## Technology Stack

- **Framework**: React 18+ with TypeScript
- **Build Tool**: Vite with SWC
- **Styling**: Tailwind CSS v4
- **Routing**: TanStack Router
- **State Management**: Zustand
- **Package Manager**: pnpm

## Configuration Details

### Tailwind CSS v4 Setup

- Uses `@tailwindcss/vite` plugin in vite.config.ts
- CSS import: `@import "tailwindcss";` in index.css
- No postcss.config.js or tailwind.config.js needed for basic setup
- V4 uses zero-runtime approach, scanning files for class names

### TypeScript Configuration

- Strict mode enabled
- Target: ES2020
- Module: ESNext

### State Management with Zustand

**Philosophy: Single Store Pattern**

Follow the recommended Zustand pattern of using **one centralized store** for all application state and business logic:

- Lightweight (~1KB) state management
- No boilerplate compared to Context API
- Simple, clean syntax with hooks
- Built-in devtools support

**Architecture Rules:**

1. **Single Store**: One `src/store/index.ts` file exports the entire store
2. **State + Actions Together**: All state and its modifying actions live in the store
3. **Business Logic in Store**: Keep components focused on UI, logic lives in store actions
4. **Component State Rule**:
   - Local UI state (hover, modal open/close) → `useState`
   - Shared state (settings, webcam status, ASCII output) → Zustand store
   - Imperative resources (rAF handles, library instances, DOM element refs shared with store) → Zustand store properties, managed by store actions with explicit cleanup in corresponding stop/destroy actions
5. **Selector Slicing**: Components subscribe only to the state they need
   ```typescript
   const resolution = useStore((state) => state.resolution); // Only re-renders when resolution changes
   ```
6. **Side Effect Ownership**: All imperative logic (DOM manipulation, rAF loops, external library init, event subscriptions) belongs in store actions, not in component `useEffect` hooks. Components trigger actions via event handlers (onClick, ref callbacks), the store owns the lifecycle.

**CRITICAL: Store as Single Source of Truth**

- **NO helper functions in business logic** - All utility business logic should be implemented as actions inside the Zustand store
- **Minimize parameters** - Store actions should access state properties directly using `get()` instead of requiring them as function parameters
- **Direct state access** - Actions can read from state using `const { property } = get()` to reduce coupling
- **Single state updater** - Use ONE `updateAppState(partial)` function instead of individual setters (e.g., `setVideoRef`, `setAsciiWidth`, etc.)
  - This reduces boilerplate and keeps the API surface area minimal
  - Components use: `updateAppState({ videoRef: ref })` instead of `setVideoRef(ref)`
  - Zustand's selector slicing ensures components only re-render when their subscribed state changes
- **constants/ folder usage**: Only use `constants/` for pure data/types (e.g., CHARACTER_SETS definition), not for business logic functions

Example:

```typescript
// ❌ BAD: Helper function with many parameters
export function convertToAscii(
  imageData: ImageData,
  width: number,
  charset: string
) {}

// ❌ BAD: Individual setter for each property
interface AppActions {
  setVideoRef: (ref: HTMLVideoElement) => void;
  setAsciiWidth: (width: number) => void;
  setCharset: (charset: string) => void;
}

// ✅ GOOD: Store action that uses internal state
convertToAscii: (imageData: ImageData) => {
  const { asciiWidth, selectedCharset } = get();
  const charset = CHARACTER_SETS[selectedCharset].characters;
  // ... conversion logic here
};

// ✅ GOOD: Single updater function
interface AppActions {
  updateAppState: (partialState: Partial<AppState>) => void;
}
```

**Store Structure:**

See the current implementation in [src/store/index.ts](src/store/index.ts).

Key patterns to follow:

- Split into `AppState` (state properties) and `AppActions` (action methods) interfaces
- Combine with `type AppStore = AppState & AppActions`
- Single `updateAppState(partialState: Partial<AppState>)` method for all state updates
- Business logic methods access state via `get()` instead of parameters

**Scaling with Slices Pattern:**

As the store grows, use the [Zustand Slices Pattern](https://zustand.docs.pmnd.rs/guides/slices-pattern) to split into multiple files while maintaining a single store:

```typescript
// src/store/slices/webcam-slice.ts
// src/store/slices/settings-slice.ts
// src/store/index.ts (combines all slices)
```

This keeps individual slice files manageable while preserving the single source of truth in the UI.

### useEffect Policy

Before writing a `useEffect`, check which category it falls into:

1. **Derived state** (computing value from other state/props) — Use `useMemo`, a plain `const`, or CSS. Never an effect.
2. **Syncing React to external system** (pushing a ref/state to store) — Use ref callbacks or event handlers. Never an effect.
3. **"Do X when Y changes"** (watching state to trigger actions) — Trigger from the event that *caused* the change, not from observing the change. Move to store action.
4. **Subscribing to external event sources** (resize, WebSocket, beforeunload) — Legitimate, but prefer `useSyncExternalStore` or a custom hook. If a `useEffect` is truly needed, it must only exist at the React/browser boundary.

**Self-review checklist for any `useEffect`:**
- Can this be a ref callback instead?
- Can this be triggered by the user action that caused the state change?
- Am I watching state just to call another action? (anti-pattern)
- Does this have proper cleanup for every resource it acquires?

**Code review rule:** If Claude encounters a `useEffect` while reading or reviewing code, flag it to the user — either inline in the response or via the AskUserQuestion tool — with which category (1-4) it falls into and whether it should be refactored.

## Features

### Core (Completed)

1. **Live Webcam to ASCII** — Real-time stream processing with MediaPipe segmentation, background removal, LAB color space, temporal smoothing, white balance
2. **Character Sets** — DOTS, MINIMAL, STANDARD, BLOCKS (defined in `src/constants/character-sets.ts`)
3. **Performance** — Frame rate management (30fps target), string builder optimization, performance metrics overlay

### Phase 3: New Features (In Progress)

See [Current Implementation Status > Phase 3](#-phase-3-new-features--modes) for detailed task breakdown with implementation notes.

1. **[P3-F1] Default Mode Color Customization** — Preset swatches + color wheel for monochrome ASCII color
2. **[P3-F2] Image Conversion Tab** — Upload/capture image, convert with any mode, new route
3. **[P3-F3] Screenshot Feature** — High-res off-screen canvas export as PNG
4. **[P3-F4] Advanced Color Mode** — Per-character coloring, no segmentation, color family presets
5. **[P3-F5] Emoji Mode** — Color square emojis or full emoji set, higher density grid
6. **[P3-F6] Cross-Browser Testing** — Verify all modes across Chrome, Firefox, Safari (desktop & mobile)

### Technical Details

#### Character Sets

- **DOTS**: Just periods (`.`)
- **MINIMAL**: ` .:-=+*#%@`
- **STANDARD**: Full ASCII gradient from light to dark
- **BLOCKS**: Unicode block characters
- **EMOJI_COLOR_SQUARES**: 🟥🟧🟨🟩🟦🟪🟫⬛⬜ (planned)
- **EMOJI_FULL_SET**: Curated brightness/hue-mapped emojis (planned)

#### ASCII Conversion Algorithm

1. Sample pixels from image/video frame
2. Apply white balance + color temperature correction
3. Convert sRGB → LAB L* (perceptually uniform brightness)
4. Unsharp mask for edge recovery
5. Map brightness to character from selected set
6. (Color mode) Map pixel hue to color family hex
7. Return formatted output (string for monochrome, colored data for other modes)

#### Performance Targets

- Frame rate: 15-30 fps for webcam
- Conversion latency: < 50ms for standard resolution
- Initial load time: < 2s

## Development Commands

```bash
# Start dev server
pnpm run dev

# Build for production
pnpm run build

# Preview production build
pnpm run preview
```

## Code Style Guidelines

### React Components

- Use functional components with hooks
- TypeScript interfaces for all props
- Proper memoization with useMemo/useCallback where needed
- Descriptive component and variable names

### File Organization

- Group related files together
- Use barrel exports (index.ts) for cleaner imports
- **constants/** folder: Only for pure data/types (e.g., CHARACTER_SETS), NO business logic functions
- **store/** folder: All business logic as actions, state management
- Keep components focused on UI only, delegate logic to store actions

### Naming Conventions

- Components: PascalCase (e.g., `WebcamCapture.tsx`)
- Hooks: camelCase with "use" prefix (e.g., `useWebcam.ts`)
- Utils/libs: kebab-case (e.g., `ascii-converter.ts`)
- Constants: UPPER_SNAKE_CASE

## Important Notes

### Current Implementation Status

#### ✅ Foundation (Completed)

- ✅ Base Vite + React + TypeScript setup
- ✅ Tailwind CSS v4 configured
- ✅ TanStack Router
- ✅ Zustand state management
- ✅ Basic ASCII conversion engine
- ✅ Webcam integration with MediaPipe Selfie Segmentation
- ✅ Background removal toggle

#### 🎯 Phase 1: Quick Wins (1-2 hours total) - PRIORITY

**Goal:** Immediate 50-60% quality improvement with minimal effort. As these tasks are completed, keep reducing their descriptions, to optimise for future context windows.

- ✅ **[P1-A1] Alpha Blending with Gamma Correction**
  - Replaced binary threshold with smooth gradient transition using `alpha^0.8` for edge feathering
  - **Result:** Smooth, anti-aliased boundaries on person edges

- ✅ **[P1-C2] Perceptual Brightness Mapping (Gamma Correction)**
  - Applied gamma curve `Math.pow(brightness/255, 1/2.2)` for perceptually accurate brightness
  - **Result:** Better character distribution and more natural-looking ASCII output

- ✅ **[P1-C5] Increase Default ASCII Width**
  - Increased `asciiWidth` from 80 to 120 in `src/store/index.ts:35` for higher resolution output
  - **Result:** 50% more horizontal detail, finer character-to-pixel mapping

- ✅ **[P1-D1] String Builder Optimization**
  - Replaced `ascii += char` string concatenation with `string[]` array + `join('')` in `src/store/index.ts:103-137`
  - **Result:** Eliminates ~4800+ intermediate string allocations per frame, 5-10x faster string building

- ✅ **[P1-B3] Switch to BT.709 Luminance Formula**
  - Switched from BT.601 (`0.299R, 0.587G, 0.114B`) to BT.709 (`0.2126R, 0.7152G, 0.0722B`) in `src/store/index.ts:119`
  - **Result:** More accurate luminance for modern sRGB displays

#### 🔥 Phase 2: Core Quality (4-6 hours total) - HIGH PRIORITY

**Goal:** Google Meet-level segmentation quality, robust lighting handling

- ✅ **[P2-A2] Temporal Smoothing (IIR Filter)**
  - Added `previousMaskData` to store, blends current mask with previous frame using `0.7/0.3` ratio in `src/store/index.ts`
  - **Result:** Reduced edge flickering, smoother mask transitions between frames

- ✅ **[P2-C1] Unsharp Masking**
  - Two-pass approach: compute per-cell LAB brightness into `Float32Array`, then sharpen using 3x3 neighborhood blur with `k=0.5` in `src/store/index.ts`
  - **Result:** Recovered edge detail lost by cell averaging, sharper ASCII output

- ✅ **[P2-B1] Automatic White Balance (Gray World Algorithm)**
  - Samples every 4th pixel to compute mean R/G/B, normalizes channels to `grayMean` in `src/store/index.ts`
  - **Result:** Consistent brightness under warm/cool/mixed lighting

- ✅ **[P2-B2] Color Temperature Detection & Compensation**
  - Detects color temp via `(R+G)/(B+1)` ratio, applies warm/cool correction factors in `src/store/index.ts`
  - **Result:** Compensates for tungsten/fluorescent lighting shifts

- ✅ **[P2-B5] LAB Color Space Conversion**
  - Converts sRGB → linear → CIE XYZ Y → LAB L\* for perceptually uniform lightness in `src/store/index.ts`
  - **Result:** Replaces BT.709 + gamma with perceptually linear brightness, better character distribution

- ✅ **[P2-D2] Frame Rate Management**
  - Timestamp-based frame skipping targeting 30fps (33ms) in `src/main.tsx`, tracks `performance.now()` for metrics
  - **Result:** Prevents frame pile-up, consistent performance

- ✅ **[P2-E7] Performance Metrics Dashboard**
  - Toggleable overlay showing FPS and frame time, hidden by default, toggle button in top-right corner in `src/main.tsx`
  - **Result:** Real-time visibility into processing performance

#### 🚀 Phase 3: New Features & Modes

**Goal:** Add multiple rendering modes, color support, screenshot/export, and image conversion. Implementation order chosen to minimize rework (simpler changes first, shared infrastructure built early for later features).

- ⏳ **[P3-F1] Default Mode Color Customization**
  - Current: ASCII output is hardcoded green (`#00ff00`) via inline style on `<pre>`
  - Add `asciiColor: string` to store (default `#00ff00`)
  - **Preset colors:** Row of circular swatches (green, amber, cyan, white, red, purple, blue) — single click to apply
  - **Color wheel (advanced):** Expandable HSL color picker using `react-colorful` (~2KB) or custom HSL slider
  - Bind `<pre>` style `color` to `asciiColor` from store
  - UI: Small collapsible panel (left side or bottom toolbar)
  - **Complexity:** Low — purely UI work, zero conversion pipeline changes

- ⏳ **[P3-F2] Image Conversion Tab**
  - Add second route via TanStack Router: `/` for webcam, `/image` for upload
  - Tab-style navigation at top of page
  - **Upload UI:** Drag-and-drop zone + file input, support jpg/png/gif
  - **Camera capture option:** Single-frame capture from webcam
  - **Conversion:** Reuse existing `updateAsciiOutput(imageData, maskData?)` — call once with image's pixel data instead of per-frame
  - **Mode selection:** Same mode picker (default/color/emoji) applies to uploaded images
  - **Segmentation:** Optional for images (MediaPipe works on static images too)
  - Store additions: `activeTab: 'webcam' | 'image'`, `uploadedImage: string | null`, `processImage()` action
  - **Complexity:** Low-Medium — mostly UI/routing, conversion logic fully reusable

- ⏳ **[P3-F3] Screenshot Feature**
  - **Approach:** Off-screen canvas rendering at high resolution (2x-4x, e.g., 3840x2160)
  - Render ASCII art character-by-character to hidden `<canvas>` with correct colors/fonts
  - Export via `canvas.toBlob('image/png')` → trigger download with `<a download>` blob URL
  - **Mobile:** Use Web Share API (`navigator.share()`) as fallback for direct save/share
  - Store addition: `takeScreenshot()` action that creates off-screen canvas, draws characters, triggers download
  - Must handle all modes (monochrome, colored, emoji) from the start
  - **Complexity:** Medium — off-screen canvas layout math for colored/emoji modes

- ⏳ **[P3-F4] Advanced Color Mode (Per-Character Coloring)**
  - **New rendering mode** — no segmentation, processes raw webcam frame
  - Pipeline change: pixels → brightness + hue → ASCII character + per-character color hex
  - **Output format refactor:** Current `asciiOutput: string` becomes either:
    - (a) HTML spans per character (`<span style="color:#hex">`) — simple, heavy DOM
    - (b) Canvas text rendering — better perf, loses text selectability
    - (c) Pre-built HTML string with `dangerouslySetInnerHTML` — good middle ground
  - **Color family mapping:** User picks preset (e.g., "Blue"), define families as HSL ranges (H=200-260). Map pixel brightness → lightness (L), keep hue within family range → light blue, royal blue, navy naturally
  - **Presets:** Main color spectrum sections (Red, Orange, Yellow, Green, Cyan, Blue, Purple, Pink)
  - Store additions: `colorMode: 'monochrome' | 'color' | 'emoji'`, `selectedColorFamily: string`
  - **Architecture:** Create dedicated child component for color mode rendering, separate from default monochrome `<pre>`. Keeps segmentation-free pipeline isolated and allows experimenting with rendering approaches (a/b/c)
  - **Complexity:** High — requires output format rethink and new render path

- ⏳ **[P3-F5] Emoji Mode**
  - **Two sub-modes:**
    - **Color emojis only:** 🟥🟧🟨🟩🟦🟪🟫⬛⬜ (9 square emojis) — map pixel color to nearest emoji by hue+brightness. Produces mosaic/pixel-art effect
    - **All emojis:** Curated set mapped by brightness/texture/hue (e.g., ☀️ bright, 🌑 dark, 🌊 blue). Needs a mapping table in constants
  - **Higher density than typical emoji use:** Break webcam feed into smaller cells and reduce emoji text size to show more emojis per frame. Keep density same as or slightly above ASCII mode to improve accuracy in edge cases and varying lighting. Target: no perceptible lag on modern hardware
  - **Rendering:** Emojis are wider than monospace chars — use CSS grid with fixed cell sizes instead of `<pre>` monospace spacing for cross-platform consistency
  - **Builds on P3-F4 infrastructure:** Reuses per-character rendering system and `colorMode` state
  - Store additions: `emojiSubMode: 'color-squares' | 'all-emojis'`
  - Constants additions: `EMOJI_COLOR_SQUARES`, `EMOJI_FULL_SET` mapping tables
  - **Complexity:** Medium — tricky part is consistent emoji sizing across platforms

- ⏳ **[P3-F6] Cross-Browser Testing & Compatibility**
  - Test all modes across Chrome, Firefox, Safari (desktop & mobile)
  - Verify emoji rendering consistency across OS/browser combinations
  - Test responsive layout on mobile/tablet/desktop
  - Performance profiling across browsers
  - Fix any browser-specific rendering issues discovered

### Design Decisions

- **Three Rendering Modes**: Default (monochrome + segmentation), Advanced Color (per-character coloring, no segmentation), and Emoji (color squares or full emoji set). Each mode has its own rendering path.
- **Advanced Color Mode as Separate Component**: Color mode gets a dedicated child component, isolated from segmentation pipeline, to allow experimenting with rendering approaches (spans vs canvas vs innerHTML).
- **Character Flexibility**: Support for multiple character sets including custom user input.
- **Client-Side Only**: All processing happens in the browser, no backend needed.
- **Responsive Design**: Mobile-first approach with Tailwind breakpoints.
- **Quality-First Approach**: Prioritize core conversion quality (segmentation, sharpness, lighting robustness) before adding features like image upload, export, or control panels.
- **Iterative Quality Improvements**: Follow phased approach (Quick Wins → Core Quality → New Features) to deliver visible improvements incrementally.
- **Store Cleanup Convention**: For every store action that acquires a resource (starts a loop, creates an instance, opens a connection), there must be a corresponding action that releases it. Acquire/release pairs: `initSegmentation`/`stopWebcam` (nulls segmenter), `startRenderLoop`/`stopRenderLoop` (cancels rAF), `startWebcam`/`stopWebcam` (stops stream).
- **Screenshot via Off-Screen Canvas**: High-res export uses programmatic canvas rendering (not DOM capture) for resolution control across all modes.

### Browser APIs Used

- `navigator.mediaDevices.getUserMedia()` - Webcam access
- Canvas API - Image/video processing, off-screen screenshot rendering
- `requestAnimationFrame` - Smooth rendering
- `navigator.clipboard` - Copy functionality
- FileReader API - Image upload handling
- `canvas.toBlob()` - PNG export for screenshots
- `navigator.share()` - Mobile share/save (screenshot feature fallback)
- Drag and Drop API - Image upload

### Deployment

- Platform: Vercel
- Build command: `pnpm run build`
- Output directory: `dist`
- Environment: Node.js (for build process)

## Dependencies to Add

All dependencies installed with pnpm:

```bash
pnpm add @tanstack/react-router zustand
```

## Future Enhancements (Out of Current Scope)

### Phase 4: Performance & Quality (Post-Phase 3)

- **[P4-D5] Web Workers for Parallel Processing**
  - Offload ASCII conversion to background thread
  - Non-blocking UI updates
  - **Effort:** 🔴 HIGH (200 lines, 8-10 hours)

- **[P4-D6] WebGL/GPU Acceleration**
  - Implement brightness calculation as fragment shader
  - 10-100x speedup for pixel operations
  - Enables real-time 4K processing
  - **Effort:** 🔴 VERY HIGH (500+ lines, 2-3 weeks)

- **[P4-C7] Directional Character Mapping**
  - Calculate edge direction per cell (gradient angle)
  - Match character orientation to edge direction
  - **Effort:** 🔴 HIGH (150 lines, 6-8 hours)

- **[P4-E3] Pipeline Architecture with Buffers**
  - Decouple video → segmentation → ASCII stages
  - Independent processing with queues
  - **Effort:** 🔴 HIGH (200 lines, 8-10 hours)

- **[P4-D3] Incremental Tile-Based Processing**
  - Only reprocess changed regions
  - 60-80% CPU reduction for static scenes
  - **Effort:** 🔴 HIGH (120 lines, 5-6 hours)

### Additional Future Features

- Video recording and export
- Social media sharing
- ASCII art gallery/presets
- GIF animation export

## Documentation Maintenance & Workflow

### CRITICAL: Claude Code Workflow Instructions

**1. Discovery & Clarification (MANDATORY)**

When the user proposes any new feature or idea:

- **ALWAYS use the AskUserQuestion tool FIRST** before writing any code
- Interview the user to gain maximum clarity on requirements
- Use multiple-choice questions (MCQ format) to explore:
  - Desired behavior and edge cases
  - UI/UX preferences
  - Technical approach options
  - Scope and priority
- Example: If user says "add export functionality", ask:
  - What formats? (txt, html, png, all of the above)
  - Where should the button be placed?
  - Should it be a single button or a menu?
  - Any specific filename conventions?

**2. Post-Implementation Documentation (MANDATORY)**

After writing code:

- **If change is ≥ 25 lines of code**: ALWAYS ask user if documentation should be updated
- **Use AskUserQuestion tool** with MCQ format offering:
  - Which sections to update (Current Implementation Status, Design Decisions, etc.)
  - Whether to add new sections
  - Skip documentation (if truly not needed)
- **If change is < 25 lines**: Skip documentation prompt, but still update if it affects critical architecture

**3. Documentation Update Rules**

When updating this file, Claude should:

- Update "Current Implementation Status" checklist immediately after completing features
  - Change ⏳ to ✅ when task is completed
  - Update effort/impact assessments if actual differs from estimate
- Document any new architectural decisions in "Design Decisions"
- Update "Known Issues & Solutions" if issues are discovered or resolved
- Update dependency list if packages are added/removed
- Add new sections to "Browser APIs Used" if new APIs are utilized
- Keep "Technology Stack" accurate
- Update "Testing Strategy" checklists when new test scenarios are identified

**4. Task Implementation Protocol**

When starting work on ANY improvement task (P1-_, P2-_, etc.):

1. **Read First:** Read all files mentioned in the task's "Before Implementation" section
2. **Explain Problem:** Provide detailed explanation of the current problem/limitation to the user
3. **Explain Solution:** Describe how the proposed fix addresses the problem and why it works
4. **Get Confirmation:** Wait for user approval before writing code
5. **Implement:** Make the changes
6. **Test:** Verify the fix works as expected
7. **Document:** Update this file's status markers

This ensures context is preserved across sessions and the user understands each change.

### User Preferences

- **MCQ Format**: User strongly prefers multiple-choice questions over open-ended questions
- **Iterative Clarity**: Always interview before implementing to avoid rework
- **Documentation Hygiene**: Keep this file as the single source of truth for project context

## Resources

- [Tailwind CSS v4 Docs](https://tailwindcss.com/docs)
- [TanStack Router](https://tanstack.com/router)
- [Zustand](https://zustand-demo.pmnd.rs/)
- [MDN MediaStream API](https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_API)
- [MDN Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
