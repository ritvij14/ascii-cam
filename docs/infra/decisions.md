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

### ADR-004: Three separate output fields for three rendering modes

**Date:** 2026-01-01
**Status:** Active

**Decision:**
Each rendering mode has its own dedicated state field: `asciiOutput` (string), `coloredAsciiOutput` (string of HTML), and `emojiOutput` ({ cols, rows[] }). Modes do not share mutable state.

**Context:**
Three rendering modes produce structurally different output: monochrome is plain text, color mode is an HTML string with `<span style="color:...">` per character, and emoji mode is an array of emoji strings per row (square cells, not 2:1 character cells). A single unified output field would require either a complex discriminated union or lossy conversion between representations.

**Options considered:**
- **Option A (chosen) — Separate fields per mode:** Each mode writes to its own field. Components read the field for the active mode.
- **Option B — Single `output` field with a type discriminant:** `{ type: 'mono' | 'color' | 'emoji'; data: ... }`
- **Option C — Always compute all three modes per frame:** Keep all three outputs current, switch is instant.

**Reasoning:**
Option B requires every consumer to type-narrow before use, and makes it easy to accidentally read stale data from the wrong mode branch. Option C triples the per-frame processing cost with no user-visible benefit — users see one mode at a time. Option A is the simplest: each mode owns its field, stale fields from other modes are simply ignored.

**Tradeoffs accepted:**
- When switching modes, the previous mode's output field holds stale data until cleared (not a visible bug, but worth knowing).
- Adding a fourth mode requires a new output field and a new render path.

**Revisit when:**
A fourth rendering mode is added that shares enough structure with an existing mode to make a unified field worthwhile.

---

### ADR-005: Off-screen canvas for screenshot export

**Date:** 2026-01-01
**Status:** Active

**Decision:**
Screenshots are rendered by creating an off-screen `<canvas>` element at 3× resolution and drawing the ASCII output programmatically, rather than using `html2canvas` or DOM screenshot APIs.

**Context:**
The ASCII output is rendered as a `<pre>` tag (monochrome), a block of `<span>` elements (color), or a grid of emoji cells (emoji mode). DOM screenshot libraries like `html2canvas` struggle with custom fonts, precise character spacing, and cross-origin resources. We need pixel-perfect, high-resolution output.

**Options considered:**
- **Option A (chosen) — Off-screen canvas, draw programmatically:** Parse the output and draw each character with `ctx.fillText` at 3× scale.
- **Option B — `html2canvas`:** Capture the rendered DOM as a canvas.
- **Option C — `window.print()` / CSS print styles:** Use browser print to PDF as a proxy for image export.

**Reasoning:**
Option B is unreliable for monospace text rendering — character alignment differences between the DOM and canvas mean the output rarely looks identical to what the user sees. Option C produces PDF, not PNG, and gives no control over resolution. Option A gives full control: exact character spacing, exact colors, exact 3× scale, works identically across all three modes.

**Tradeoffs accepted:**
- Color mode requires parsing the HTML string (`coloredAsciiOutput`) with regex to extract character/color pairs — brittle if the HTML format ever changes.
- Emoji mode requires `[...row]` spread to handle multi-codepoint emoji correctly — adds complexity.

**Revisit when:**
A browser API for high-resolution DOM capture becomes reliable across all targets (unlikely near-term).

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
