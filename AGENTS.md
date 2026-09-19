# AGENTS.md — rules for humans and AI agents working in this repo

Paper Bridge: photograph school paperwork → action items in the parent's language → `.ics` + drafted English reply. SASEhack 2026, ~36h, team of 2–4.

## Read first

1. `docs/superpowers/specs/2026-09-19-paper-bridge-design.md` — what we're building and what we're deliberately NOT building.
2. `docs/superpowers/plans/2026-09-19-paper-bridge.md` — task-by-task plan with code. Claim a task before starting it (post in the team chat).

## Scope rules

- **Stay inside the spec.** No email/password auth, no image storage, no push notifications, no Google Calendar OAuth, no >8 pages. If you think the spec is wrong, say so in chat before coding — don't quietly widen it.
- **Every view is a pure function of `DecodeResult`.** Gemini is the only non-deterministic step and lives only in `server/app/decoder.py`. `urgency` is computed in Python, never asked from the model.
- **Never persist images.** Only the result JSON goes to KV (30-day TTL).
- **Auth is optional and frontend-only.** Firebase Auth (Google) + Firestore `users/{uid}/results`. FastAPI never sees a user; decoding never requires sign-in.
- **Languages are exactly `es`, `vi`, `zh`.** Adding one means adding a `messages/<code>.json` too.

## Code rules

- Simplest thing that works. No abstractions with one implementation, no config for values that never change, no "for later" scaffolding.
- **Package managers: `uv` for `server/`, `bun` for `client/`.** Commit `uv.lock` and `bun.lock`. Never add `package-lock.json` or `pnpm-lock.yaml`.
- Backend: Python 3.12, `uv`, FastAPI, Pydantic v2. Run everything from `server/`. Tests: `uv run pytest`. Anything non-trivial gets one test.
- Frontend: Next.js 16 App Router, TypeScript, Tailwind, shadcn/ui, `next-intl`. Run everything from `client/` with `bun`. `bun run tsc --noEmit && bun run build` must pass before pushing.
- Deliberate shortcuts get a `dev-note:` comment naming the ceiling (e.g. `# dev-note: sync request, add job queue if >8 pages needed`).
- Design tokens (from the Pencil mockups): bg `#FBF8F2`, ink `#1C1A17`, muted `#6B655C`, line `#E6E0D6`, accent `#1F5F4A`, accent-soft `#DDEEE6`, danger `#B3261E`, warn `#9A5B00`. Headings Fraunces, body Inter.

## Git rules

- Branch per task: `feat/t4-decoder`, `feat/t9-results`. PR to `main`, one review from a teammate, squash-merge.
- Small commits, prefixed: `feat(api):`, `feat(web):`, `test:`, `chore:`, `docs:`.
- **Never commit `.env` files.** `.env.example` only. Secrets live in Railway / Vercel env settings.
- Don't `git add -A`. Stage the files you touched.
- Don't force-push `main`.

## Env

| Var | Where | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | Railway | Gemini |
| `GEMINI_MODEL` | Railway | default `gemini-2.5-flash` |
| `CF_ACCOUNT_ID`, `CF_KV_NAMESPACE_ID`, `CF_API_TOKEN` | Railway | Cloudflare KV |
| `ALLOWED_ORIGIN` | Railway | the Vercel URL (CORS) |
| `NEXT_PUBLIC_API_URL` | Vercel | the Railway URL |
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `..._AUTH_DOMAIN`, `..._PROJECT_ID`, `..._APP_ID` | Vercel | Firebase Auth + Firestore (public config, not secrets) |

## Demo (what judges see)

Vietnamese → upload permission slip + PTA flyer + lunch letter → 4 items in ~20s → "Add to calendar" → open "Draft reply" → copy. If it can't do that end-to-end, nothing else matters.
