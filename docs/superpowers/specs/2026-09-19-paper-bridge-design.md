# Paper Bridge — Design Spec

**Date:** 2026-09-19 · **Event:** SASEhack 2026 (Education/Accessibility + Charge Up) · **Team:** 2–4, ~36h

## Problem

Immigrant parents receive stacks of English school paperwork. Buried in it are the things that actually matter: permission slips, fee deadlines, free-lunch enrollment, conference sign-ups. Missing them has real consequences. Existing tools translate whole documents; nobody extracts *what needs action*.

## Solution

Photograph the stack → get a short list of action items in your language → one tap adds the dates to your phone calendar → copy a drafted English reply for anything that needs a response.

## Scope

**In:** upload up to 8 images/PDF pages · Spanish, Vietnamese, Chinese (Simplified) · action-item extraction · `.ics` export · English reply drafts · anonymous share link (30-day TTL).

**Out (deliberately):** accounts, storing original images, push notifications, Google Calendar OAuth, PDF text-layer parsing, more than 8 pages per batch.

## Architecture

```
Browser (Next.js 15, TS, shadcn)  ──POST /decode──▶  FastAPI (Railway)  ──▶ Gemini (vision, per page)
        │                                               │
        │◀── {id, result} ──────────────────────────────┤──▶ Cloudflare KV (JSON, TTL 30d)
        │
        └── /r/{id}  ·  /r/{id}/calendar.ics
```

Synchronous request/response. No queue, no polling. Client downscales images to ≤1600px longest edge before upload to keep Gemini latency ~3–8s/page; pages run in parallel.

### Repo layout

```
paper-bridge/
  web/        Next.js app (Vercel)
  api/        FastAPI app (Railway, Dockerfile)
    app/main.py         routes
    app/decoder.py      Gemini calls → DecodeResult
    app/ics.py          DecodeResult → .ics bytes
    app/store.py        Cloudflare KV get/put (httpx)
    app/models.py       Pydantic models
    tests/fixtures/     5 real school newsletters + expected items.json
  docs/
```

## Data model

```python
class ActionItem(BaseModel):
    id: str
    type: Literal["deadline","payment","signature","event","info"]
    title: str            # target language
    title_en: str         # original English
    due_date: date | None
    due_time: time | None
    location: str | None
    amount_usd: float | None
    needs_signature: bool
    needs_reply: bool
    source_page: int      # 0-based
    source_quote: str     # verbatim English sentence(s) it came from
    urgency: Literal["overdue","this_week","later","none"]  # computed server-side from due_date

class PageSummary(BaseModel):
    index: int
    summary: str          # one line, target language
    failed: bool = False

class ReplyDraft(BaseModel):
    item_id: str
    subject: str
    body_en: str

class DecodeResult(BaseModel):
    id: str               # 10-char url-safe random
    target_language: Literal["es","vi","zh"]
    created_at: datetime
    pages: list[PageSummary]
    items: list[ActionItem]
    reply_drafts: list[ReplyDraft]
```

Invariant: every view (cards, `.ics`, reply drawer) is a pure function of `DecodeResult`. Gemini is the only non-deterministic step.

## API

| Method | Path | Body / Params | Returns |
|---|---|---|---|
| POST | `/decode` | multipart `files[]` (≤8, image/* or PDF, ≤10MB each), `target_language` | 200 `{id, result: DecodeResult}` · 400 too many/invalid files · 502 all pages failed |
| GET | `/r/{id}` | — | 200 `DecodeResult` · 404 expired/unknown |
| GET | `/r/{id}/calendar.ics` | — | 200 `text/calendar`, `Content-Disposition: attachment` |

CORS: allow the Vercel origin only. No auth — the random ID is the capability.

## Gemini pipeline (`decoder.py`)

1. **Per page** (parallel, `asyncio.gather`): one `gemini-2.5-flash` call with the image + `response_schema` for `{summary, items[]}`. System prompt instructs: extract only parent-action items; ignore boilerplate/menus/mission statements; quote source verbatim; resolve relative dates ("next Friday") against `today` passed in the prompt; translate `title`/`summary` to `target_language`, keep `title_en`.
2. **Merge** (one text-only call): input = all page items; output = deduped items (same event across a flyer + newsletter → one) + `reply_drafts` for `needs_reply` items. Skipped when only one page produced items.
3. **Post-process** (Python, deterministic): assign IDs, compute `urgency` from `due_date` vs today, sort by `due_date` nulls-last.

Retry policy: one retry per page on Gemini error; then `PageSummary.failed = True`, page contributes no items. Batch still succeeds unless *all* pages fail (502).

## `.ics` generation (`ics.py`)

`icalendar` lib. One `VEVENT` per item with `due_date`. All-day if no `due_time`. `SUMMARY` = translated title; `DESCRIPTION` = `title_en` + `source_quote` + amount if any. Payment/signature items get a `VALARM` 2 days before. `UID` = `{result.id}-{item.id}@paperbridge`.

## Storage (`store.py`)

Cloudflare KV REST API via `httpx`: `PUT .../values/{id}?expiration_ttl=2592000` with the JSON, `GET` to read. Only `DecodeResult` is stored — never the images.

## Frontend

**Stack:** Next.js 15 App Router, TypeScript, Tailwind, shadcn/ui, `next-intl` for the three UI locales (UI chrome is in the parent's language too, not just the results).

**Routes**
- `/` — Language picker (persisted in `localStorage`, also sets UI locale) → file input (`accept="image/*,application/pdf" capture="environment" multiple`) → thumbnail grid → **Decode** button. While decoding: thumbnails pulse, status line "Reading page 3 of 5…". Single page, state machine `idle → uploading → done|error`.
- `/r/[id]` — Server component fetches `GET /r/{id}`. Layout:
  - Summary strip: "2 due this week · $15 owed · 1 needs signature"
  - Items grouped by `urgency` (Overdue / This week / Later / Info), each a card: title, chips (date, amount, ✍️ signature, ✉️ reply), expandable "Original text" showing `source_quote` + page number.
  - `needs_reply` cards have a **Draft reply** button → drawer with subject/body + Copy.
  - Sticky bottom bar: **Add to calendar** (`<a href=".../calendar.ics" download>`) · **Share link** (copy URL).
  - 404 → "This link has expired. Decode again."

**Client-side image prep:** canvas downscale to 1600px longest edge, JPEG q=0.85, before `FormData` upload. PDFs pass through untouched.

## Error handling

| Failure | Behavior |
|---|---|
| Unreadable/blurry page | Gemini returns `items: []`, summary "Could not read this page clearly" (translated). Shown, doesn't block batch. |
| Gemini error on a page | Retry once → mark `failed`. Card at bottom: "Page N couldn't be read — try a clearer photo." |
| All pages fail | 502 → inline error + "Try again". |
| >8 files or >10MB | Frontend blocks with message; backend 400 as backstop. |
| KV write fails | Still return `result` to client (no `id`); share/ics buttons disabled with tooltip. |
| Expired link | 404 page. |

## Testing

- `api/tests/test_decoder.py` — 5 real public district newsletters/flyers in `tests/fixtures/*.{jpg,pdf}` with `*.expected.json` listing required `(due_date, amount_usd, needs_signature)` tuples. Assert every expected tuple appears in output (recall); allow extra items. Runs against live Gemini, skipped without `GEMINI_API_KEY`.
- `api/tests/test_ics.py` — build `DecodeResult` fixture → `ics.build()` → parse back with `icalendar` → assert event count, all-day flag, alarm presence.
- `api/tests/test_urgency.py` — `compute_urgency` boundary dates.
- Frontend: `tsc --noEmit` + `next build` in CI. No component tests.

## Deployment

| Piece | Where | Notes |
|---|---|---|
| `web/` | Vercel | `NEXT_PUBLIC_API_URL` |
| `api/` | Railway (Dockerfile, `uvicorn`) | `GEMINI_API_KEY`, `CF_ACCOUNT_ID`, `CF_KV_NAMESPACE_ID`, `CF_API_TOKEN`, `ALLOWED_ORIGIN` |
| KV | Cloudflare | one namespace `paperbridge-results` |

## Demo script (for judges)

1. Pick Vietnamese. 2. Upload 3 photos: field-trip permission slip, PTA fundraiser flyer, lunch-program letter. 3. ~20s later: 4 items — trip due Fri ($12, signature), fundraiser event, lunch enrollment deadline, conference sign-up (needs reply). 4. Tap **Add to calendar** → events land on phone. 5. Open **Draft reply** → copy English RSVP.

## Build order (suggested split)

1. **Backend A:** `models.py`, `decoder.py` against one fixture → real items in JSON. Everything else waits on this shape.
2. **Backend B:** `ics.py`, `store.py`, `main.py` routes, Dockerfile, Railway deploy.
3. **Frontend A:** `/` upload flow + image downscale + call `/decode`.
4. **Frontend B:** `/r/[id]` results page + i18n + sticky bar.
5. Fixtures + tests + demo docs.
