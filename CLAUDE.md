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
5. **Selector Slicing**: Components subscribe only to the state they need
   ```typescript
   const resolution = useStore((state) => state.resolution); // Only re-renders when resolution changes
   ```

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

## Features to Implement

### Core Features (Phase 1)

1. **Live Webcam to ASCII Conversion**
   - Real-time video stream processing
   - MediaStream API integration
   - Frame capture and conversion

2. **Image Upload to ASCII Conversion**
   - File input with drag-and-drop
   - Support for jpg, png, gif formats
   - Preview before conversion

3. **Customization Controls**
   - Character set selection (dots, standard, emoji, custom)
   - Resolution adjustment (ASCII width)
   - Contrast/brightness controls
   - Font size adjustment

4. **Export/Download Capabilities**
   - Copy to clipboard
   - Download as .txt file
   - Download as .html file
   - Download as PNG image

### Technical Implementation

#### Character Sets

- **DOTS**: Just periods (`.`)
- **MINIMAL**: ` .:-=+*#%@`
- **STANDARD**: Full ASCII gradient from light to dark
- **BLOCKS**: Unicode block characters
- **EMOJI**: Various emoji sets (user selectable)
- Custom: User-provided character string

#### ASCII Conversion Algorithm

1. Sample pixels from image/video frame
2. Calculate luminance (brightness) for each sample
3. Map brightness to character from selected set
4. Apply contrast/brightness adjustments
5. Return formatted string with line breaks

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

- ⏳ **[P1-C5] Increase Default ASCII Width**
  - **Current Problem:** `asciiWidth: 80` in `src/store/index.ts:36` causes excessive detail loss
  - **Fix:** Increase to 120 characters for higher resolution output
  - **Before Implementation:** Read `src/store/index.ts` (line 36), explain the relationship between ASCII width, cell size, and information loss
  - **Effort:** 🟢 LOW (2 lines, 5 minutes) | **Impact:** 🔥🔥🔥 HIGH

- ⏳ **[P1-D1] String Builder Optimization**
  - **Current Problem:** `ascii += char` in `src/store/index.ts:106-136` creates 3200+ new strings per frame causing performance issues
  - **Fix:** Use pre-allocated array and `Array.join()` for 5-10x faster string building
  - **Before Implementation:** Read `src/store/index.ts` (lines 106-136), explain why string concatenation in tight loops is inefficient in JavaScript
  - **Effort:** 🟢 LOW (10 lines, 15 minutes) | **Impact:** 🔥🔥 MEDIUM-HIGH

- ⏳ **[P1-B3] Switch to BT.709 Luminance Formula**
  - **Current Problem:** Using BT.601 weights (0.299R, 0.587G, 0.114B) in `src/store/index.ts:123` which is outdated standard
  - **Fix:** Switch to modern BT.709: `0.2126*R + 0.7152*G + 0.0722*B` for better color perception
  - **Before Implementation:** Read `src/store/index.ts` (line 123), explain the difference between BT.601 and BT.709 and why modern displays prefer BT.709
  - **Effort:** 🟢 LOW (5 lines, 10 minutes) | **Impact:** 🔥 MEDIUM

#### 🔥 Phase 2: Core Quality (4-6 hours total) - HIGH PRIORITY

**Goal:** Google Meet-level segmentation quality, robust lighting handling

- ⏳ **[P2-A2] Temporal Smoothing (IIR Filter)**
  - **Current Problem:** Mask changes every frame independently causing edge flickering
  - **Fix:** Add previous mask state to store, blend with `0.7 * currentMask + 0.3 * previousMask` for smooth transitions
  - **Before Implementation:** Read `src/store/index.ts` (state definition at lines 4-16) and `src/main.tsx` (lines 82-138), explain why independent frame processing causes flickering and how temporal coherence helps
  - **Effort:** 🟡 MEDIUM (20 lines, 30 minutes) | **Impact:** 🔥🔥🔥 HIGH

- ⏳ **[P2-C1] Unsharp Masking**
  - **Current Problem:** Simple averaging in `src/store/index.ts:111-127` loses edge detail
  - **Fix:** Apply Gaussian blur then calculate `sharpened = original + k * (original - blurred)` before ASCII conversion
  - **Before Implementation:** Read `src/store/index.ts` (lines 97-136), explain how pixel averaging destroys high-frequency edge information and how unsharp masking recovers it
  - **Effort:** 🟡 MEDIUM (40 lines, 1 hour) | **Impact:** 🔥🔥🔥 HIGH

- ⏳ **[P2-B1] Automatic White Balance (Gray World Algorithm)**
  - **Current Problem:** No color correction causes yellow/warm lighting to skew brightness calculations
  - **Fix:** Calculate mean R,G,B per frame, normalize each channel: `R' = R * (grayMean / R_mean)`
  - **Before Implementation:** Read `src/store/index.ts` (lines 43-95), explain how color casts affect luminance calculation and why normalizing color channels fixes it
  - **Effort:** 🟡 MEDIUM (30 lines, 45 minutes) | **Impact:** 🔥🔥🔥 HIGH

- ⏳ **[P2-B2] Color Temperature Detection & Compensation**
  - **Current Problem:** Fixed luminance formula assumes neutral lighting, fails with warm/cool light
  - **Fix:** Detect color temperature using `(R+G)/(B+1)` ratio and apply correction matrix
  - **Before Implementation:** Read `src/store/index.ts` (lines 118-123), explain what color temperature is and how different lighting conditions shift RGB distributions
  - **Effort:** 🟡 MEDIUM (40 lines, 1 hour) | **Impact:** 🔥🔥 MEDIUM-HIGH

- ⏳ **[P2-B5] LAB Color Space Conversion**
  - **Current Problem:** RGB is not perceptually uniform, causing inaccurate brightness in colored lighting
  - **Fix:** Convert RGB → LAB and use L channel (lightness) directly for perceptually accurate brightness
  - **Before Implementation:** Read `src/store/index.ts` (lines 118-123), explain why RGB luminance is problematic and how LAB's L channel is perceptually linear
  - **Effort:** 🟡 MEDIUM (60 lines, 2 hours) | **Impact:** 🔥🔥 MEDIUM-HIGH

- ⏳ **[P2-D2] Frame Rate Management**
  - **Current Problem:** Processes every frame in `src/main.tsx:96-138` even when falling behind
  - **Fix:** Track last processing time, skip frames if processing took > 33ms (30fps target)
  - **Before Implementation:** Read `src/main.tsx` (lines 96-138), explain how requestAnimationFrame works and why unchecked frame processing causes performance degradation
  - **Effort:** 🟡 MEDIUM (30 lines, 45 minutes) | **Impact:** 🔥🔥🔥 HIGH

- ⏳ **[P2-E7] Performance Metrics Dashboard**
  - **Current Problem:** No visibility into performance bottlenecks
  - **Fix:** Track FPS, frame time, segmentation time, ASCII time, display in dev overlay
  - **Before Implementation:** Read `src/main.tsx` (entire component structure), identify all processing stages that need timing measurements
  - **Effort:** 🟢 LOW (40 lines, 1 hour) | **Impact:** 🔥 MEDIUM

#### 📦 Later Features (Post-Quality Improvements)

- ⏳ Image upload to ASCII conversion
- ⏳ Customization control panel (character set selection, resolution adjustment)
- ⏳ Export functionality (copy to clipboard, download as .txt/.html/.png)

### Design Decisions

- **Monochrome First**: Initial implementation focuses on monochrome ASCII. Color support planned for future.
- **Character Flexibility**: Support for multiple character sets including custom user input.
- **Client-Side Only**: All processing happens in the browser, no backend needed.
- **Responsive Design**: Mobile-first approach with Tailwind breakpoints.
- **Quality-First Approach**: Prioritize core conversion quality (segmentation, sharpness, lighting robustness) before adding features like image upload, export, or control panels.
- **Iterative Quality Improvements**: Follow phased approach (Quick Wins → Core Quality → Advanced Features) to deliver visible improvements incrementally.

### Known Issues & Solutions

#### **Issue 1: Jagged Segmentation Edges**

- **Root Cause:** Binary threshold (0.5) in mask application creates harsh cutoffs
- **Solution:** Alpha blending with gamma correction (Phase 1) + Temporal smoothing (Phase 2)
- **Status:** Addressed in P1-A1 and P2-A2

#### **Issue 2: Poor Performance in Yellow/Warm Lighting**

- **Root Cause:** No white balance correction, fixed luminance formula assumes neutral lighting
- **Solution:** Automatic white balance (P2-B1) + Color temperature compensation (P2-B2) + LAB color space (P2-B5)
- **Goal:** Work robustly in ALL lighting conditions (tungsten, fluorescent, sunset, mixed)
- **Status:** Addressed in Phase 2 lighting improvements

#### **Issue 3: Low Sharpness/Detail**

- **Root Cause:** Aggressive downsampling (80 chars wide) + simple averaging destroys edge information
- **Solution:** Increase ASCII width (P1-C5) + Unsharp masking (P2-C1) + Perceptual brightness mapping (P1-C2)
- **Status:** Addressed in Phase 1 and Phase 2

#### **Issue 4: Inconsistent Frame Rate**

- **Root Cause:** Processes every frame regardless of performance, no frame skipping
- **Solution:** Frame rate management targeting 30fps (P2-D2)
- **Status:** Addressed in P2-D2

### Browser APIs Used

- `navigator.mediaDevices.getUserMedia()` - Webcam access
- Canvas API - Image/video processing
- `requestAnimationFrame` - Smooth rendering
- `navigator.clipboard` - Copy functionality
- FileReader API - Image upload handling

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

## Testing Strategy

### Manual Testing Checklist

#### Core Functionality

- [x] Webcam permission and stream
- [x] Basic ASCII conversion
- [x] Background removal toggle
- [ ] Image upload (various formats) - Later phase
- [ ] Each character set conversion - Later phase
- [ ] Resolution/contrast adjustments - Later phase
- [ ] Export to all formats - Later phase
- [ ] Responsive layout (mobile/tablet/desktop)
- [ ] Browser compatibility (Chrome, Firefox, Safari)

#### Quality Testing (Post-Phase 1 & 2 Implementation)

- [ ] **Segmentation Edge Quality**
  - [ ] Person wearing same color as background
  - [ ] Hair/fur boundaries (fine details)
  - [ ] Transparent objects (glass, water bottle)
  - [ ] Fast motion (hand waving, head turning)

- [ ] **Lighting Conditions** (Goal: Work well in ALL lighting)
  - [ ] Yellow/warm light (tungsten bulbs)
  - [ ] Cool light (fluorescent, LED daylight)
  - [ ] Mixed lighting (window + indoor)
  - [ ] Low light (evening/dim room)
  - [ ] Sunset/red-tinted light
  - [ ] Backlit scenarios

- [ ] **Sharpness & Detail**
  - [ ] Facial features clearly visible
  - [ ] Text on clothing readable
  - [ ] Hand gestures distinguishable
  - [ ] Compare side-by-side with Google Meet background blur quality

### Performance Testing

- [x] Frame rate during webcam capture (baseline)
- [ ] Frame rate after Phase 1 optimizations (target: 30fps maintained)
- [ ] Frame rate after Phase 2 additions (ensure no degradation)
- [ ] Conversion speed with different ASCII widths (80, 120, 160)
- [ ] Memory usage over time (check for leaks)
- [ ] CPU usage (should not pin CPU at 100%)
- [ ] Performance on lower-end devices (test with throttling)

## Future Enhancements (Out of Current Scope)

### Phase 3: Advanced Features (1-2 weeks)

**Goal:** Production-ready quality for all edge cases

- **[P3-E1] Quality/Performance Presets**
  - User-selectable quality levels (Low/Medium/High/Ultra)
  - Automatic device capability detection
  - **Effort:** 🟡 MEDIUM (80 lines, 2-3 hours)

- **[P3-A5] Bilateral Filter**
  - Edge-aware smoothing that preserves sharp boundaries
  - Smooths flat regions without destroying detail
  - **Effort:** 🔴 HIGH (100 lines, 3-4 hours)

- **[P3-C4] Edge-Weighted Character Selection**
  - Calculate edge strength per cell using Sobel operator
  - High edge → angular chars (|, /, \, #)
  - Low edge → smooth chars (., :, -)
  - **Effort:** 🔴 HIGH (100 lines, 4-5 hours)

- **[P3-D5] Web Workers for Parallel Processing**
  - Offload ASCII conversion to background thread
  - Non-blocking UI updates
  - **Effort:** 🔴 HIGH (200 lines, 8-10 hours)

### Phase 4: Revolutionary Features (2-4 weeks)

**Goal:** Industry-leading performance and quality

- **[P4-D6] WebGL/GPU Acceleration**
  - Implement brightness calculation as fragment shader
  - 10-100x speedup for pixel operations
  - Enables real-time 4K processing
  - **Effort:** 🔴 VERY HIGH (500+ lines, 2-3 weeks)

- **[P4-C7] Directional Character Mapping**
  - Calculate edge direction per cell (gradient angle)
  - Match character orientation to edge direction
  - Revolutionary ASCII art quality
  - **Effort:** 🔴 HIGH (150 lines, 6-8 hours)

- **[P4-E3] Pipeline Architecture with Buffers**
  - Decouple video → segmentation → ASCII stages
  - Independent processing with queues
  - Better error isolation and maintainability
  - **Effort:** 🔴 HIGH (200 lines, 8-10 hours)

- **[P4-D3] Incremental Tile-Based Processing**
  - Only reprocess changed regions
  - 60-80% CPU reduction for static scenes
  - **Effort:** 🔴 HIGH (120 lines, 5-6 hours)

### Additional Future Features

- **[P3-B4] CLAHE** (Contrast Limited Adaptive Histogram Equalization) - Handles extreme lighting conditions
- Color ASCII support (ANSI/HTML colored characters)
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
