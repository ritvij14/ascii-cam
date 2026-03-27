# Deployment

> **Deployment runbook for ASCII Camera.**
> Static site — no server, no database, no environment variables.
> Last updated: 2026-03-23

---

## Environments

| Environment | URL | Deploy trigger |
|---|---|---|
| Local | `http://localhost:5173` | `pnpm run dev` |
| Production | https://github.com/ritvij14/ascii-cam (Vercel) | `pnpm run build` + manual push |

No staging environment — this is a solo side project. Test locally before deploying.

---

## Infrastructure

**Hosting:** Vercel (static file serving)
**Build output:** `dist/` — static HTML, JS, CSS bundles
**CDN:** Vercel Edge Network (automatic)
**External dependencies loaded at runtime:**
- MediaPipe WASM + model files from `cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation`

No servers, no databases, no managed services, no environment variables.

---

## Deploying to Production

```bash
# 1. Build and type-check
pnpm run build

# 2. Preview the build locally before pushing
pnpm run preview

# 3. Push to main — Vercel auto-deploys on push
git push origin main
```

**Pre-deploy checklist:**
- `pnpm run build` completes without TypeScript errors
- `pnpm run preview` — verify the app loads and webcam works in the preview build
- MediaPipe segmentation initializes correctly (check browser console for WASM errors)
- All three rendering modes (monochrome, color, emoji) produce output
- Screenshot export works (download on desktop)

---

## Rollback

Vercel keeps a deployment history. To roll back:

1. Go to the Vercel dashboard → Deployments
2. Find the last good deployment
3. Click "Promote to Production"

No database migrations to reverse. No state to worry about. Rollback is instant.

---

## Build Notes

- **Vite config:** `@tailwindcss/vite` handles CSS, `@vitejs/plugin-react-swc` handles TSX compilation
- **MediaPipe:** loaded from CDN at runtime — not bundled. First load requires network access; subsequent loads use browser cache
- **No environment variables** — the build is identical in every environment. Nothing to configure.
- **Web Worker (Phase 4):** when added, Vite's `worker.format: 'es'` config will bundle the worker as a separate ES module chunk
