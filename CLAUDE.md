# ASCII Camera

> **Master context file. Single source of truth for this project. All docs/ files are modules that extend this. README.md is a public-facing summary derived from this. PRDs live in `.taskmaster/docs/` — run `task-master parse-prd .taskmaster/docs/prd.md` to generate tasks.**

---

## 1. Project Identity

**Name:** ASCII Camera
**Purpose:** Convert live webcam feeds and uploaded images into ASCII art in real-time, entirely in the browser.
**Type:** Client-Side Web App
**Primary Users:** Anyone can use it, this project has been made as a side-project for fun, keeping all users in mind.
**Repo:** https://github.com/ritvij14/ascii-cam

---

## 2. Tech Stack

> Do not contradict this section anywhere else. If a technology decision changes, update here first.
> Always be clear on the major release of the tech stack being used and link to that version's documentation.

**Language:** [TypeScript 5](https://www.typescriptlang.org/docs/)
**Runtime / Platform:** Browser (client-side only, no server)
**Framework:** [React 18](https://react.dev/) + [Vite 7](https://vite.dev/guide/) with SWC
**Package Manager:** pnpm

**Data:**

- Primary store: None (no persistence — all state is in-memory via Zustand)
- Search: None
- Cache: None
- File storage: None

**Infrastructure:**

- Hosting: [Vercel](https://vercel.com/docs)
- Cloud provider: None
- CI/CD: None (manual deploy via `pnpm run build`)

**Auth:** None
**Queue / Jobs:** None
**Testing:** None

**Key Libraries:**

- [Zustand v5](https://zustand.docs.pmnd.rs/) — single-store client state management
- [TanStack Router v1](https://tanstack.com/router/latest/docs/framework/react/overview) — client-side routing
- [Tailwind CSS v4](https://tailwindcss.com/docs/v4-beta) — styling (zero-config, `@import "tailwindcss"`)
- [@mediapipe/selfie_segmentation](https://google.github.io/mediapipe/solutions/selfie_segmentation) — real-time person segmentation from webcam frames
- [react-colorful v5](https://github.com/omgovich/react-colorful) — color picker for ASCII color customization

---

## 3. Repository Structure

> See [`docs/infra/file-tree.md`](docs/infra/file-tree.md) — auto-generated and kept up to date after every Claude Code session via the `Stop` hook.

---

## 4. Architecture Overview

> How this system is structured at a high level. For deep dives, see docs/features/ and docs/infra/.

**Pattern:** Single-page client-side app — no backend, no build-time rendering. All logic runs in the browser.

**Core modules and what each owns:**

- `src/store/index.ts` — entire application state + all business logic (ASCII conversion, webcam lifecycle, segmentation, rendering modes, screenshot export)
- `src/main.tsx` — all React components and TanStack Router setup; components are UI-only, no logic
- `src/constants/character-sets.ts` — pure data: character set definitions, emoji palette, `rgbToNearestEmoji` helper
- `src/EmojiGrid.tsx` — rendering component for emoji mode only
- `docs/` — project documentation (features, infra, decisions, patterns)

**Data flow (happy path — webcam to ASCII):**

1. User clicks "Start Webcam" → component calls `startWebcam()` store action
2. Store requests `getUserMedia`, initializes MediaPipe segmentation, starts `requestAnimationFrame` loop
3. Each frame: canvas captures video frame → segmentation mask computed → `updateAsciiOutput` / `updateColorAsciiOutput` / `updateEmojiOutput` called depending on `colorMode`
4. Store writes output (`asciiOutput`, `coloredAsciiOutput`, or `emojiOutput`) → subscribed components re-render
5. `AsciiDisplay` or `EmojiGrid` renders the new output to the DOM

**Key architectural decisions:**

> For full reasoning on each decision, see [`docs/infra/decisions.md`](docs/infra/decisions.md)

- Single Zustand store for all state + logic: keeps components as pure UI, all imperative logic in one place
- Client-side only (no backend): all processing happens in the browser via Canvas API and WebAssembly (MediaPipe)
- Three rendering modes (monochrome / color / emoji): each has its own output field and render path, no shared mutable state between modes
- Off-screen canvas for screenshots: avoids DOM capture limitations, gives resolution control across all modes
- No `useEffect` for business logic: all side effects owned by store actions, triggered by user events

---

## 5. Conventions

> Claude must follow these at all times. These are non-negotiable.

### Naming

- Files: kebab-case (e.g. `character-sets.ts`). Components: PascalCase (e.g. `EmojiGrid.tsx`). Hooks: camelCase with `use` prefix. Constants: UPPER_SNAKE_CASE.
- Store actions: camelCase verbs (e.g. `startWebcam`, `updateAsciiOutput`, `takeScreenshot`)

### Code Style

- Write as little code as possible to accomplish the task.
- Only do things you are more than 90% sure about. If unsure, use the AskUserQuestion tool to ask a series of MCQ questions before writing any code.

### Code Structure

- **All business logic lives in `src/store/index.ts` as actions.** Components are UI-only — no logic, no `useEffect` for side effects.
- **Single `updateAppState(partial)` for all state updates** — no individual setters.
- **Store actions access state via `get()`** — never require state as parameters.
- **`constants/` is pure data only** — no functions, no business logic.
- **Store cleanup convention:** For every action that acquires a resource, there must be a corresponding action that releases it. Acquire/release pairs: `initSegmentation`/`stopWebcam` (nulls segmenter), `startRenderLoop`/`stopRenderLoop` (cancels rAF), `startWebcam`/`stopWebcam` (stops stream).
- Before writing a `useEffect`, check the policy below. Most cases should be a ref callback, event handler, or store action instead.

### useEffect Policy

> See also: [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)

Before writing a `useEffect`, check which category it falls into:

1. **Derived state** — Use `useMemo`, a plain `const`, or CSS. Never an effect.
2. **Syncing React to external system** (pushing a ref/state to store) — Use ref callbacks or event handlers. Never an effect.
3. **"Do X when Y changes"** — Trigger from the event that *caused* the change, not from observing the change. Move to store action.
4. **Subscribing to external event sources** (resize, WebSocket, beforeunload) — Legitimate, but prefer `useSyncExternalStore` or a custom hook. If a `useEffect` is truly needed, it must only exist at the React/browser boundary.

**Self-review checklist:**
- Can this be a ref callback instead?
- Can this be triggered by the user action that caused the state change?
- Am I watching state just to call another action? (anti-pattern)
- Does this have proper cleanup for every resource it acquires?

**Code review rule:** If Claude encounters a `useEffect` while reading or reviewing code, flag it with which category (1–4) it falls into and whether it should be refactored.

### Module Boundaries

- `src/store/index.ts` is the single source of truth. Components import from `useStore` only.
- `src/constants/` exports pure data. Never import store into constants.

### Critical Paths — Confirm Before Modifying

> Do not refactor, rename, or change the interfaces of these without explicit user confirmation.

- `src/store/index.ts` — all state and business logic; interface changes affect every component
- `src/constants/character-sets.ts` — `CHARACTER_SETS` and `EMOJI_COLOR_PALETTE` are consumed by store actions directly

### File Navigation

- For files exceeding ~500 lines, add a navigation comment block at the top listing key sections with line ranges.
- Format: `// === NAVIGATION === // L1-50: Exports and types // L120-200: Core processing // L450-500: Error handling`
- **Claude: when reading a file >500 lines, read only the first 50 lines first to check for a `NAVIGATION` block. Use it to read only the relevant section.**

### Error Handling

- Webcam errors are caught in `startWebcam` and written to `webcamError` state — displayed inline in the UI.
- Segmentation errors are caught and silently skipped (frame continues without mask).
- No error boundaries exist — if a component throws, the app crashes. Keep rendering logic simple.

### Testing

- No tests currently. If added, unit tests go next to the file they test (e.g. `store/index.test.ts`).

### Git

- Commit format: conventional commits — `feat:`, `fix:`, `chore:`, `docs:`
- Work directly on `main` (solo project)

---

## 6. Environment & Configuration

**Environment files:** None — this is a fully client-side app with no secrets or server configuration.

**Key configuration files:**

- `vite.config.ts` — build config; uses `@tailwindcss/vite` and `@vitejs/plugin-react-swc`
- `tsconfig.json` — TypeScript config; strict mode, ES2020 target, ESNext modules
- `index.html` — app entry point; single `<div id="root">`

---

## 7. Development Setup

> How to get this running from scratch.

```bash
# 1. Install dependencies
pnpm install

# 2. Start development server
pnpm run dev
```

**Requirements:** Node.js 18+, pnpm. No external services, accounts, or env vars needed.

**Key scripts:**

- `pnpm run dev` — start Vite dev server (hot reload)
- `pnpm run build` — type-check + production build to `dist/`
- `pnpm run preview` — preview production build locally
- `bash scripts/generate-tree.sh` — manually regenerate `docs/infra/file-tree.md`

---

## 8. Project Requirements (PRD)

> PRDs live as standalone files in `.taskmaster/docs/`. TaskMaster parses them directly to generate tasks.
> Never embed requirements in this file — write a PRD document instead.

**How to use PRDs:**

- **Starting a project:** Write your PRD in `.taskmaster/docs/prd.md`, then run `task-master parse-prd .taskmaster/docs/prd.md`
- **Adding a feature later:** Write a focused PRD in `.taskmaster/docs/<feature-name>.md`, then run `task-master parse-prd .taskmaster/docs/<feature-name>.md --append`
- **PRD templates:** See `.taskmaster/templates/` — `example_prd.txt` (simple) and `example_prd_rpg.txt` (detailed with dependency graphs)

**Writing good PRDs:**

- Write requirements as clear functional statements: "Users can filter contacts by tag" — not "The experience should feel intuitive"
- Include explicit dependencies between features — this is what makes TaskMaster's task ordering accurate
- Keep each PRD focused on one scope (the whole project, or one feature area)

### PRD Index

| PRD | Scope | Status |
| --- | ----- | ------ |
| [.taskmaster/docs/prd.md](.taskmaster/docs/prd.md) | Full project (Phases 1–4) | Active |

---

## 9. Feature Documentation Index

> Each feature has its own doc in docs/features/. Read the relevant doc before working on a feature.
> When a feature doc exceeds ~400 lines, it is promoted to a directory (docs/features/[feature]/).

| Feature           | Doc                                                                    | Status |
| ----------------- | ---------------------------------------------------------------------- | ------ |
| Webcam ASCII      | [docs/features/webcam-ascii.md](docs/features/webcam-ascii.md)         | Stable |
| Rendering Modes   | [docs/features/rendering-modes.md](docs/features/rendering-modes.md)   | Stable |
| Image Conversion  | [docs/features/image-conversion.md](docs/features/image-conversion.md) | Stable |
| Screenshot Export | [docs/features/screenshot.md](docs/features/screenshot.md)             | Stable |

---

## 10. Infrastructure Documentation Index

> Cross-cutting infrastructure docs. Referenced by feature docs when needed.

| Topic                  | Doc                                                  |
| ---------------------- | ---------------------------------------------------- |
| File tree              | [docs/infra/file-tree.md](docs/infra/file-tree.md)   |
| Architecture decisions | [docs/infra/decisions.md](docs/infra/decisions.md)   |
| Deployment             | [docs/infra/deployment.md](docs/infra/deployment.md) |
| Patterns               | [docs/infra/patterns.md](docs/infra/patterns.md)     |

---

## 11. Working With Claude Code

> Instructions Claude must follow in every session.
> Task Master command reference is in `.taskmaster/CLAUDE.md` (auto-imported below).
> This section covers project-specific session rules only.

**At the start of every session:**

1. Read this file fully
2. Run `task-master next` to understand what to work on
3. Read the relevant feature doc from `docs/features/` for the current task
4. Read relevant infra docs only if the task touches that infra layer

**Context Loading Rules**

NEVER load all feature docs at once. Load ONLY:

1. This file (CLAUDE.md) — always
2. The ONE feature doc relevant to the current task — always
3. Infra docs ONLY if the task explicitly touches that layer

For tasks that span multiple features, load the PRIMARY feature doc (the one being modified most) fully. For secondary features, load only their Data Model and Dependencies sections.

**How to find the right feature doc for a task:**

- TaskMaster task titles use the feature name as a prefix — e.g. "Auth: implement login flow" → `docs/features/auth.md`
- Feature doc filenames match the feature area in kebab-case — e.g. "Contact Management" → `docs/features/contact-management.md`
- If a feature has been promoted to a directory, the index is at `docs/features/[feature-name]/README.md`
- Cross-reference Section 9 (Feature Documentation Index) if the mapping is unclear

If unsure which feature doc to load, ask before loading anything.

**Before starting any task:**

- Check `task-master list` for dependencies — never work on a task whose dependency is not done
- If the task is ambiguous, read the feature doc before asking for clarification

**During a session:**

- Update task status via TaskMaster as work progresses — do not leave tasks in stale states
- The moment you discover something that changes how a future task should be implemented, stop and run `task-master update --from=<id> --prompt="..."` BEFORE continuing. Do not defer this. Stale task descriptions compound.

**At the end of every session:**

- Mark completed tasks done: `task-master set-status --id=[id] --status=done`
- Update any future tasks affected by discoveries made this session
- The file tree hook will auto-update docs/infra/file-tree.md

---

## Task Master AI Instructions
**Import Task Master's command reference and guidelines. Treat as part of this file.**
@./.taskmaster/CLAUDE.md
