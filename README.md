# ASCII Camera

Convert your webcam feed or any image into ASCII art in real-time, entirely in the browser.

---

## What It Does

Live Webcam Feed - Converts your live webcam feed into ASCII art feed. Default mode removes background, and renders the foreground using ASCII character.

Image Conversion - Upload any image and get the ASCII converted image.

Switch between three rendering modes — monochrome (with a custom color picker), full color (per-character colored output), and emoji (nearest-color emoji grid). Export any output as a high-resolution PNG.

Everything runs client-side. No server, no account, no setup beyond opening the page.

---

## Tech Stack

- **Language:** TypeScript 5
- **Framework:** React 18 + Vite 7 (SWC)
- **State:** Zustand v5
- **Routing:** TanStack Router v1
- **Styling:** Tailwind CSS v4
- **Hosting:** Vercel

---

## Getting Started

```bash
# Install dependencies
pnpm install

# Start development server
pnpm run dev
```

**Requirements:** Node.js 18+, pnpm. No environment variables needed.

**Key scripts:**

- `pnpm run dev` — start dev server with hot reload
- `pnpm run build` — type-check + production build to `dist/`
- `pnpm run preview` — preview production build locally

---

## Project Structure

See [`docs/infra/file-tree.md`](docs/infra/file-tree.md) for the full file tree.

Core modules:

- `src/store/index.ts` — all application state and business logic
- `src/main.tsx` — all React components and router (UI-only, no logic)
- `src/constants/character-sets.ts` — character sets and emoji palette
- `src/EmojiGrid.tsx` — rendering component for emoji mode

---

## Documentation

- [`CLAUDE.md`](CLAUDE.md) — master context file: architecture, conventions, PRD
- [`docs/features/`](docs/features/) — feature-specific documentation
- [`docs/infra/`](docs/infra/) — deployment, decisions, patterns
