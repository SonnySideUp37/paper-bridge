# Paper Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A parent photographs school paperwork, gets action items in their language, downloads an `.ics`, and copies drafted English replies.

**Architecture:** Next.js frontend posts images to a FastAPI `/decode` endpoint; FastAPI calls Gemini once per page in parallel, merges, stores the JSON result in Cloudflare KV under a random ID, returns it. Results page and `.ics` are pure functions of that JSON.

**Tech Stack:** Python 3.12, FastAPI, `google-genai`, `icalendar`, `httpx`, pytest · Next.js 16 (App Router), TypeScript, Tailwind, shadcn/ui, `next-intl`, `firebase` (Auth + Firestore Lite) · Railway (API), Vercel (web), Cloudflare KV · package managers: `uv` (api), `bun` (web).

**Spec:** `docs/superpowers/specs/2026-09-19-paper-bridge-design.md`

## Global Constraints

- Max 8 files per `/decode`, ≤10 MB each, `image/*` or `application/pdf`.
- Target languages: exactly `es`, `vi`, `zh`.
- Original images are never persisted — only `DecodeResult` JSON, KV TTL 2592000 s (30 days).
- `urgency` is computed in Python, never by Gemini.
- Result ID: 10-char URL-safe random.
- Client downscales images to ≤1600 px longest edge, JPEG q=0.85, before upload.
- Gemini model is read from env `GEMINI_MODEL`, default `gemini-2.5-flash`.
- Backend package manager: `uv` (commit `server/uv.lock`). Frontend: `bun` (commit `client/bun.lock`; never add npm/pnpm lockfiles).
- Auth is optional and frontend-only: Firebase Auth (Google provider) + Firestore `users/{uid}/results/{id}`. FastAPI never sees a user.
- Python: run all commands from `server/`. TS: run all commands from `client/`.

## File Structure

```
server/
  pyproject.toml
  Dockerfile
  app/__init__.py
  app/models.py      Pydantic models + compute_urgency + new_id
  app/ics.py         build_ics(result) -> bytes
  app/store.py       KV put/get via httpx
  app/decoder.py     Gemini per-page + merge + postprocess
  app/main.py        FastAPI app, routes, CORS
  tests/conftest.py  sample DecodeResult fixture
  tests/test_models.py
  tests/test_ics.py
  tests/test_store.py
  tests/test_decoder.py
  tests/test_main.py
  tests/test_live.py       live Gemini recall test, skipped without key
  tests/fixtures/          5 real school docs + *.expected.json
client/
  app/[locale]/page.tsx          upload
  app/[locale]/r/[id]/page.tsx   results
  app/[locale]/layout.tsx
  components/upload-form.tsx
  components/results-view.tsx
  components/item-card.tsx
  components/reply-drawer.tsx
  app/[locale]/signin/page.tsx   Google sign-in
  app/[locale]/history/page.tsx  saved stacks (signed-in only)
  components/auth-button.tsx     sign in / avatar + sign out
  lib/api.ts          fetch wrappers + types
  lib/image.ts        downscale()
  lib/firebase.ts     app, auth, db singletons + saveToHistory()/listHistory()
  firestore.rules
  i18n/request.ts, i18n/routing.ts, proxy.ts
  messages/{en,es,vi,zh}.json
```

---

### Task 1: API scaffold + models + urgency

**Files:**
- Create: `server/pyproject.toml`, `server/app/__init__.py`, `server/app/models.py`, `server/tests/__init__.py`, `server/tests/test_models.py`

**Interfaces:**
- Produces: `ActionItem`, `PageSummary`, `ReplyDraft`, `DecodeResult`, `Lang = Literal["es","vi","zh"]`, `compute_urgency(due: date | None, today: date) -> Urgency`, `new_id() -> str`.

- [ ] **Step 1: Create project**

```bash
mkdir -p server/app server/tests && cd server
cat > pyproject.toml <<'EOF'
[project]
name = "paper-bridge-api"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
  "fastapi>=0.115",
  "uvicorn[standard]>=0.30",
  "python-multipart>=0.0.9",
  "pydantic>=2.7",
  "google-genai>=1.20",
  "icalendar>=6.0",
  "httpx>=0.27",
]

[dependency-groups]
dev = ["pytest>=8", "pytest-asyncio>=0.23", "respx>=0.21"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
EOF
touch app/__init__.py tests/__init__.py
uv sync
```

- [ ] **Step 2: Write failing test**

`server/tests/test_models.py`:
```python
from datetime import date
from app.models import compute_urgency, new_id

TODAY = date(2026, 9, 19)  # Saturday

def test_urgency_none():
    assert compute_urgency(None, TODAY) == "none"

def test_urgency_overdue():
    assert compute_urgency(date(2026, 9, 18), TODAY) == "overdue"

def test_urgency_this_week_boundaries():
    assert compute_urgency(TODAY, TODAY) == "this_week"
    assert compute_urgency(date(2026, 9, 26), TODAY) == "this_week"
    assert compute_urgency(date(2026, 9, 27), TODAY) == "later"

def test_new_id_shape():
    a, b = new_id(), new_id()
    assert len(a) == 10 and a != b
    assert a.replace("-", "").replace("_", "").isalnum()
```

- [ ] **Step 3: Run, expect ImportError**

Run: `uv run pytest tests/test_models.py -v` → FAIL `ModuleNotFoundError: app.models`

- [ ] **Step 4: Implement**

`server/app/models.py`:
```python
import secrets
from datetime import date, datetime, time
from typing import Literal
from pydantic import BaseModel

Lang = Literal["es", "vi", "zh"]
Urgency = Literal["overdue", "this_week", "later", "none"]
ItemType = Literal["deadline", "payment", "signature", "event", "info"]


class ActionItem(BaseModel):
    id: str = ""
    type: ItemType
    title: str
    title_en: str
    due_date: date | None = None
    due_time: time | None = None
    location: str | None = None
    amount_usd: float | None = None
    needs_signature: bool = False
    needs_reply: bool = False
    source_page: int
    source_quote: str
    urgency: Urgency = "none"


class PageSummary(BaseModel):
    index: int
    summary: str
    failed: bool = False


class ReplyDraft(BaseModel):
    item_id: str
    subject: str
    body_en: str


class DecodeResult(BaseModel):
    id: str
    target_language: Lang
    created_at: datetime
    pages: list[PageSummary]
    items: list[ActionItem]
    reply_drafts: list[ReplyDraft]


def compute_urgency(due: date | None, today: date) -> Urgency:
    if due is None:
        return "none"
    if due < today:
        return "overdue"
    if (due - today).days <= 7:
        return "this_week"
    return "later"


def new_id() -> str:
    # dev-note: 10 url-safe chars ≈ 60 bits; fine for unguessable share links
    return secrets.token_urlsafe(8)[:10]
```

- [ ] **Step 5: Run, expect pass**

Run: `uv run pytest tests/test_models.py -v` → 4 passed

- [ ] **Step 6: Commit**

```bash
git add server/pyproject.toml server/uv.lock server/app server/tests
git commit -m "feat(api): scaffold, models, urgency"
```

---

### Task 2: `.ics` builder

**Files:**
- Create: `server/app/ics.py`, `server/tests/conftest.py`, `server/tests/test_ics.py`

**Interfaces:**
- Consumes: `DecodeResult`, `ActionItem` from Task 1.
- Produces: `build_ics(result: DecodeResult) -> bytes`.

- [ ] **Step 1: Shared fixture**

`server/tests/conftest.py`:
```python
from datetime import date, datetime, time
import pytest
from app.models import ActionItem, DecodeResult, PageSummary, ReplyDraft


@pytest.fixture
def sample_result() -> DecodeResult:
    return DecodeResult(
        id="abc123XYZ_",
        target_language="vi",
        created_at=datetime(2026, 9, 19, 12, 0, 0),
        pages=[PageSummary(index=0, summary="Giấy phép đi thực địa")],
        items=[
            ActionItem(id="i1", type="signature", title="Ký giấy phép Sở thú",
                       title_en="Sign zoo permission slip", due_date=date(2026, 9, 26),
                       amount_usd=12.0, needs_signature=True, source_page=0,
                       source_quote="Permission slips and $12 are due Friday, September 26.",
                       urgency="this_week"),
            ActionItem(id="i2", type="event", title="Hội chợ mùa thu", title_en="Fall Festival",
                       due_date=date(2026, 10, 18), due_time=time(16, 0), location="School yard",
                       source_page=0, source_quote="Fall Festival Oct 18, 4-7pm", urgency="later"),
            ActionItem(id="i3", type="info", title="Thực đơn", title_en="Menu",
                       source_page=0, source_quote="Pizza on Fridays", urgency="none"),
        ],
        reply_drafts=[ReplyDraft(item_id="i1", subject="Zoo trip", body_en="Hello,")],
    )
```

- [ ] **Step 2: Failing test**

`server/tests/test_ics.py`:
```python
from icalendar import Calendar
from app.ics import build_ics


def test_ics_roundtrip(sample_result):
    cal = Calendar.from_ical(build_ics(sample_result))
    events = [c for c in cal.walk("VEVENT")]
    assert len(events) == 2  # i3 has no date
    by_uid = {str(e["UID"]): e for e in events}
    e1 = by_uid["abc123XYZ_-i1@paperbridge"]
    assert str(e1["SUMMARY"]) == "Ký giấy phép Sở thú"
    assert e1["DTSTART"].params.get("VALUE") == "DATE"
    assert "$12" in str(e1["DESCRIPTION"])
    assert len(e1.walk("VALARM")) == 1
    e2 = by_uid["abc123XYZ_-i2@paperbridge"]
    assert e2["DTSTART"].dt.hour == 16
    assert str(e2["LOCATION"]) == "School yard"
    assert len(e2.walk("VALARM")) == 0
```

- [ ] **Step 3: Run, expect ImportError**

Run: `uv run pytest tests/test_ics.py -v` → FAIL

- [ ] **Step 4: Implement**

`server/app/ics.py`:
```python
from datetime import datetime, timedelta
from icalendar import Alarm, Calendar, Event
from app.models import DecodeResult


def build_ics(result: DecodeResult) -> bytes:
    cal = Calendar()
    cal.add("prodid", "-//Paper Bridge//EN")
    cal.add("version", "2.0")
    for it in result.items:
        if it.due_date is None:
            continue
        ev = Event()
        ev.add("uid", f"{result.id}-{it.id}@paperbridge")
        ev.add("summary", it.title)
        desc = it.title_en
        if it.amount_usd is not None:
            desc += f"\n${it.amount_usd:g}"
        desc += f"\n\n“{it.source_quote}”"
        ev.add("description", desc)
        if it.due_time:
            start = datetime.combine(it.due_date, it.due_time)
            ev.add("dtstart", start)
            ev.add("dtend", start + timedelta(hours=1))
        else:
            ev.add("dtstart", it.due_date)
        if it.location:
            ev.add("location", it.location)
        if it.type in ("payment", "signature") or it.amount_usd or it.needs_signature:
            al = Alarm()
            al.add("action", "DISPLAY")
            al.add("description", it.title)
            al.add("trigger", timedelta(days=-2))
            ev.add_component(al)
        cal.add_component(ev)
    return cal.to_ical()
```

- [ ] **Step 5: Run, expect pass**

Run: `uv run pytest tests/test_ics.py -v` → 1 passed

- [ ] **Step 6: Commit**

```bash
git add server/app/ics.py server/tests/conftest.py server/tests/test_ics.py
git commit -m "feat(api): ics builder"
```

---

### Task 3: Cloudflare KV store

**Files:**
- Create: `server/app/store.py`, `server/tests/test_store.py`

**Interfaces:**
- Produces: `async put(result: DecodeResult) -> None`, `async get(id: str) -> DecodeResult | None`. Reads env `CF_ACCOUNT_ID`, `CF_KV_NAMESPACE_ID`, `CF_API_TOKEN`.

- [ ] **Step 1: Failing test**

`server/tests/test_store.py`:
```python
import httpx, respx, pytest
from app import store

BASE = "https://api.cloudflare.com/client/v4/accounts/acc/storage/kv/namespaces/ns/values"


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("CF_ACCOUNT_ID", "acc")
    monkeypatch.setenv("CF_KV_NAMESPACE_ID", "ns")
    monkeypatch.setenv("CF_API_TOKEN", "tok")


@respx.mock
async def test_put_and_get(sample_result):
    put = respx.put(f"{BASE}/abc123XYZ_", params={"expiration_ttl": "2592000"}).mock(
        return_value=httpx.Response(200, json={"success": True}))
    await store.put(sample_result)
    assert put.called
    assert put.calls[0].request.headers["authorization"] == "Bearer tok"

    respx.get(f"{BASE}/abc123XYZ_").mock(
        return_value=httpx.Response(200, content=sample_result.model_dump_json()))
    got = await store.get("abc123XYZ_")
    assert got == sample_result


@respx.mock
async def test_get_missing():
    respx.get(f"{BASE}/nope").mock(return_value=httpx.Response(404))
    assert await store.get("nope") is None
```

- [ ] **Step 2: Run, expect ImportError**

Run: `uv run pytest tests/test_store.py -v` → FAIL

- [ ] **Step 3: Implement**

`server/app/store.py`:
```python
import os
import httpx
from app.models import DecodeResult

TTL = 2592000


def _url(id: str) -> str:
    return (f"https://api.cloudflare.com/client/v4/accounts/{os.environ['CF_ACCOUNT_ID']}"
            f"/storage/kv/namespaces/{os.environ['CF_KV_NAMESPACE_ID']}/values/{id}")


def _headers() -> dict:
    return {"Authorization": f"Bearer {os.environ['CF_API_TOKEN']}"}


async def put(result: DecodeResult) -> None:
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.put(_url(result.id), params={"expiration_ttl": TTL},
                        headers=_headers(), content=result.model_dump_json())
        r.raise_for_status()


async def get(id: str) -> DecodeResult | None:
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(_url(id), headers=_headers())
    if r.status_code == 404:
        return None
    r.raise_for_status()
    return DecodeResult.model_validate_json(r.content)
```

- [ ] **Step 4: Run, expect pass**

Run: `uv run pytest tests/test_store.py -v` → 2 passed

- [ ] **Step 5: Commit**

```bash
git add server/app/store.py server/tests/test_store.py
git commit -m "feat(api): cloudflare kv store"
```

---

### Task 4: Gemini decoder

**Files:**
- Create: `server/app/decoder.py`, `server/tests/test_decoder.py`

**Interfaces:**
- Consumes: models from Task 1.
- Produces: `async decode(pages: list[tuple[bytes, str]], target_language: Lang, today: date, client=None) -> DecodeResult` where each page is `(bytes, mime_type)`. `client` is injectable for tests (anything with `.aio.models.generate_content`).

- [ ] **Step 1: Failing tests with a fake client**

`server/tests/test_decoder.py`:
```python
import json
from datetime import date
from types import SimpleNamespace
import pytest
from app import decoder
from app.decoder import PageOut, RawItem, MergeOut


class FakeClient:
    """Returns canned PageOut for image calls, MergeOut for the merge call."""
    def __init__(self, page_outs, merge_out=None, fail_pages=()):
        self.page_outs, self.merge_out, self.fail_pages = page_outs, merge_out, set(fail_pages)
        self.calls = 0
        self.aio = SimpleNamespace(models=SimpleNamespace(generate_content=self._gen))

    async def _gen(self, model, contents, config):
        self.calls += 1
        if config.response_schema is PageOut:
            idx = int(contents[0].split("PAGE_INDEX=")[1].split()[0])
            if idx in self.fail_pages:
                raise RuntimeError("gemini down")
            return SimpleNamespace(parsed=self.page_outs[idx])
        return SimpleNamespace(parsed=self.merge_out)


TODAY = date(2026, 9, 19)
ITEM = RawItem(type="signature", title="Ký giấy", title_en="Sign slip", due_date="2026-09-26",
               amount_usd=12, needs_signature=True, needs_reply=False,
               source_quote="Due Friday, September 26.")


async def test_single_page_no_merge():
    fake = FakeClient([PageOut(summary="Giấy phép", items=[ITEM])])
    r = await decoder.decode([(b"img", "image/jpeg")], "vi", TODAY, client=fake)
    assert fake.calls == 1
    assert r.target_language == "vi" and len(r.id) == 10
    assert r.items[0].urgency == "this_week"
    assert r.items[0].source_page == 0
    assert r.items[0].id
    assert r.reply_drafts == []


async def test_two_pages_merge_and_reply():
    merged = MergeOut(items=[RawItem(**{**ITEM.model_dump(), "needs_reply": True, "source_page": 1})],
                      reply_drafts=[decoder.RawReply(item_index=0, subject="Zoo", body_en="Hi")])
    fake = FakeClient([PageOut(summary="a", items=[ITEM]), PageOut(summary="b", items=[ITEM])], merged)
    r = await decoder.decode([(b"1", "image/jpeg"), (b"2", "image/jpeg")], "es", TODAY, client=fake)
    assert fake.calls == 3
    assert len(r.items) == 1 and r.items[0].source_page == 1
    assert r.reply_drafts[0].item_id == r.items[0].id


async def test_failed_page_marked_batch_survives():
    fake = FakeClient([PageOut(summary="a", items=[ITEM]), None], fail_pages=[1])
    r = await decoder.decode([(b"1", "image/jpeg"), (b"2", "image/jpeg")], "zh", TODAY, client=fake)
    assert r.pages[1].failed is True
    assert len(r.items) == 1


async def test_all_pages_failed_raises():
    fake = FakeClient([None], fail_pages=[0])
    with pytest.raises(decoder.AllPagesFailed):
        await decoder.decode([(b"1", "image/jpeg")], "vi", TODAY, client=fake)
```

- [ ] **Step 2: Run, expect ImportError**

Run: `uv run pytest tests/test_decoder.py -v` → FAIL

- [ ] **Step 3: Implement**

`server/app/decoder.py`:
```python
import asyncio
import os
from datetime import date, datetime, timezone
from google import genai
from google.genai import types
from pydantic import BaseModel
from app.models import (ActionItem, DecodeResult, ItemType, Lang, PageSummary,
                        ReplyDraft, compute_urgency, new_id)

LANG_NAME = {"es": "Spanish", "vi": "Vietnamese", "zh": "Simplified Chinese"}


class RawItem(BaseModel):
    type: ItemType
    title: str
    title_en: str
    due_date: str | None = None      # ISO YYYY-MM-DD or null
    due_time: str | None = None      # HH:MM or null
    location: str | None = None
    amount_usd: float | None = None
    needs_signature: bool = False
    needs_reply: bool = False
    source_quote: str
    source_page: int = 0


class PageOut(BaseModel):
    summary: str
    items: list[RawItem]


class RawReply(BaseModel):
    item_index: int
    subject: str
    body_en: str


class MergeOut(BaseModel):
    items: list[RawItem]
    reply_drafts: list[RawReply]


class AllPagesFailed(Exception):
    pass


PAGE_PROMPT = """You read paperwork a US school sent home. Today is {today}. PAGE_INDEX={idx}
Extract ONLY things that require a parent to act: deadlines, payments, signatures, events to attend, forms to return.
Ignore menus, mission statements, general announcements with no action.
For each item: quote the exact English sentence it came from in source_quote.
Resolve relative dates ("next Friday") to ISO dates using today. Leave due_date null if no date.
Write `title` and `summary` in {lang}. Keep `title_en` in English.
needs_reply=true only if the school asks the parent to RSVP, confirm, or respond in writing."""

MERGE_PROMPT = """These action items were extracted from {n} pages of the same stack of school papers.
1. Merge duplicates (same event/deadline mentioned on multiple pages) into one item, keeping the most complete fields and the lowest source_page.
2. For every item with needs_reply=true, draft a short polite English email a parent could send (subject + body). Reference items by their index in the list you return.
Keep titles in {lang}. Items:
{items}"""


def _client():
    return genai.Client(api_key=os.environ["GEMINI_API_KEY"])


async def _page(client, model, data: bytes, mime: str, idx: int, lang: Lang, today: date) -> PageOut | None:
    contents = [PAGE_PROMPT.format(today=today.isoformat(), idx=idx, lang=LANG_NAME[lang]),
                types.Part.from_bytes(data=data, mime_type=mime)]
    cfg = types.GenerateContentConfig(response_mime_type="application/json", response_schema=PageOut)
    for attempt in range(2):
        try:
            r = await client.aio.models.generate_content(model=model, contents=contents, config=cfg)
            out = r.parsed
            for it in out.items:
                it.source_page = idx
            return out
        except Exception:
            if attempt == 1:
                return None


async def _merge(client, model, items: list[RawItem], n: int, lang: Lang) -> MergeOut:
    prompt = MERGE_PROMPT.format(n=n, lang=LANG_NAME[lang],
                                 items="\n".join(i.model_dump_json() for i in items))
    cfg = types.GenerateContentConfig(response_mime_type="application/json", response_schema=MergeOut)
    r = await client.aio.models.generate_content(model=model, contents=[prompt], config=cfg)
    return r.parsed


def _finalize(raw: list[RawItem], today: date) -> list[ActionItem]:
    out = []
    for r in raw:
        due = date.fromisoformat(r.due_date) if r.due_date else None
        out.append(ActionItem(
            id=new_id()[:6], type=r.type, title=r.title, title_en=r.title_en,
            due_date=due, due_time=r.due_time, location=r.location, amount_usd=r.amount_usd,
            needs_signature=r.needs_signature, needs_reply=r.needs_reply,
            source_page=r.source_page, source_quote=r.source_quote,
            urgency=compute_urgency(due, today)))
    out.sort(key=lambda i: (i.due_date is None, i.due_date or date.max))
    return out


async def decode(pages: list[tuple[bytes, str]], target_language: Lang, today: date, client=None) -> DecodeResult:
    client = client or _client()
    model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
    outs = await asyncio.gather(*[_page(client, model, b, m, i, target_language, today)
                                  for i, (b, m) in enumerate(pages)])
    if all(o is None for o in outs):
        raise AllPagesFailed()
    summaries = [PageSummary(index=i, summary=o.summary if o else "", failed=o is None)
                 for i, o in enumerate(outs)]
    raw = [it for o in outs if o for it in o.items]
    drafts: list[RawReply] = []
    ok_pages = sum(o is not None for o in outs)
    if ok_pages > 1 and raw or any(i.needs_reply for i in raw):
        merged = await _merge(client, model, raw, len(pages), target_language)
        raw, drafts = merged.items, merged.reply_drafts
    items = _finalize(raw, today)
    reply_drafts = [ReplyDraft(item_id=items[d.item_index].id, subject=d.subject, body_en=d.body_en)
                    for d in drafts if 0 <= d.item_index < len(items)]
    return DecodeResult(id=new_id(), target_language=target_language,
                        created_at=datetime.now(timezone.utc), pages=summaries,
                        items=items, reply_drafts=reply_drafts)
```

- [ ] **Step 4: Run, expect pass**

Run: `uv run pytest tests/test_decoder.py -v` → 4 passed.
Note for `test_single_page_no_merge`: one page, `needs_reply=False` → no merge call → `calls == 1`. For `test_two_pages_merge_and_reply`: 2 page calls + 1 merge = 3.

- [ ] **Step 5: Commit**

```bash
git add server/app/decoder.py server/tests/test_decoder.py
git commit -m "feat(api): gemini decoder with merge + reply drafts"
```

---

### Task 5: FastAPI routes

**Files:**
- Create: `server/app/main.py`, `server/tests/test_main.py`

**Interfaces:**
- Consumes: `decoder.decode`, `store.put/get`, `ics.build_ics`.
- Produces: HTTP API per spec. Env `ALLOWED_ORIGIN`.

- [ ] **Step 1: Failing tests**

`server/tests/test_main.py`:
```python
import pytest
from fastapi.testclient import TestClient
from app import main, decoder, store


@pytest.fixture
def client(monkeypatch, sample_result):
    async def fake_decode(pages, lang, today, client=None):
        return sample_result
    saved = {}
    async def fake_put(r): saved[r.id] = r
    async def fake_get(id): return saved.get(id)
    monkeypatch.setattr(main, "decode", fake_decode)
    monkeypatch.setattr(main.store, "put", fake_put)
    monkeypatch.setattr(main.store, "get", fake_get)
    return TestClient(main.app)


def test_health(client):
    assert client.get("/health").json() == {"ok": True}


def test_decode_then_get_then_ics(client):
    r = client.post("/decode", data={"target_language": "vi"},
                    files=[("files", ("a.jpg", b"x", "image/jpeg"))])
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == "abc123XYZ_" and len(body["result"]["items"]) == 3
    assert client.get("/r/abc123XYZ_").json()["id"] == "abc123XYZ_"
    ics = client.get("/r/abc123XYZ_/calendar.ics")
    assert ics.headers["content-type"].startswith("text/calendar")
    assert b"BEGIN:VEVENT" in ics.content


def test_get_missing_404(client):
    assert client.get("/r/zzz").status_code == 404


def test_too_many_files_400(client):
    files = [("files", (f"{i}.jpg", b"x", "image/jpeg")) for i in range(9)]
    assert client.post("/decode", data={"target_language": "vi"}, files=files).status_code == 400


def test_bad_mime_400(client):
    r = client.post("/decode", data={"target_language": "vi"},
                    files=[("files", ("a.txt", b"x", "text/plain"))])
    assert r.status_code == 400


def test_all_failed_502(client, monkeypatch):
    async def boom(*a, **k): raise decoder.AllPagesFailed()
    monkeypatch.setattr(main, "decode", boom)
    r = client.post("/decode", data={"target_language": "vi"},
                    files=[("files", ("a.jpg", b"x", "image/jpeg"))])
    assert r.status_code == 502


def test_kv_failure_still_returns_result(client, monkeypatch):
    async def kv_boom(r): raise RuntimeError("kv down")
    monkeypatch.setattr(main.store, "put", kv_boom)
    r = client.post("/decode", data={"target_language": "vi"},
                    files=[("files", ("a.jpg", b"x", "image/jpeg"))])
    assert r.status_code == 200 and r.json()["id"] is None
```

- [ ] **Step 2: Run, expect ImportError**

Run: `uv run pytest tests/test_main.py -v` → FAIL

- [ ] **Step 3: Implement**

`server/app/main.py`:
```python
import logging
import os
from datetime import date
from fastapi import FastAPI, File, Form, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from app import store
from app.decoder import AllPagesFailed, decode
from app.ics import build_ics
from app.models import DecodeResult, Lang

log = logging.getLogger("paperbridge")
MAX_FILES, MAX_BYTES = 8, 10 * 1024 * 1024

app = FastAPI(title="Paper Bridge API")
app.add_middleware(CORSMiddleware, allow_origins=[os.environ.get("ALLOWED_ORIGIN", "http://localhost:3000")],
                   allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/decode")
async def decode_route(files: list[UploadFile] = File(...), target_language: Lang = Form(...)):
    if not 1 <= len(files) <= MAX_FILES:
        raise HTTPException(400, f"Upload between 1 and {MAX_FILES} pages.")
    pages = []
    for f in files:
        mime = f.content_type or ""
        if not (mime.startswith("image/") or mime == "application/pdf"):
            raise HTTPException(400, f"{f.filename}: only images or PDF.")
        data = await f.read()
        if len(data) > MAX_BYTES:
            raise HTTPException(400, f"{f.filename}: over 10 MB.")
        pages.append((data, mime))
    try:
        result = await decode(pages, target_language, date.today())
    except AllPagesFailed:
        raise HTTPException(502, "Could not read any page. Try clearer photos.")
    id: str | None = result.id
    try:
        await store.put(result)
    except Exception:
        log.exception("kv put failed")
        id = None
    return {"id": id, "result": result}


@app.get("/r/{id}", response_model=DecodeResult)
async def get_result(id: str):
    r = await store.get(id)
    if r is None:
        raise HTTPException(404, "Expired or unknown link.")
    return r


@app.get("/r/{id}/calendar.ics")
async def get_ics(id: str):
    r = await store.get(id)
    if r is None:
        raise HTTPException(404, "Expired or unknown link.")
    return Response(build_ics(r), media_type="text/calendar",
                    headers={"Content-Disposition": 'attachment; filename="paper-bridge.ics"'})
```

- [ ] **Step 4: Run all API tests**

Run: `uv run pytest -v` → all passed (models 4, ics 1, store 2, decoder 4, main 7)

- [ ] **Step 5: Commit**

```bash
git add server/app/main.py server/tests/test_main.py
git commit -m "feat(api): decode, result, ics routes"
```

---

### Task 6: Dockerfile + Railway

**Files:**
- Create: `server/Dockerfile`, `server/.dockerignore`, `server/.env.example`

- [ ] **Step 1: Files**

`server/Dockerfile`:
```dockerfile
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY app ./app
ENV PATH="/app/.venv/bin:$PATH"
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

`server/.dockerignore`:
```
.venv
tests
__pycache__
.env
```

`server/.env.example`:
```
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
CF_ACCOUNT_ID=
CF_KV_NAMESPACE_ID=
CF_API_TOKEN=
ALLOWED_ORIGIN=http://localhost:3000
```

- [ ] **Step 2: Verify build + boot**

```bash
cd server && docker build -t pb-api . && docker run --rm -p 8000:8000 -e PORT=8000 pb-api &
sleep 3 && curl -s localhost:8000/health   # {"ok":true}
```

- [ ] **Step 3: Deploy**

Railway dashboard → New project → Deploy from GitHub → root dir `server` → set the 6 env vars. `ALLOWED_ORIGIN` = the Vercel URL from Task 7 (update after that deploy). Confirm `https://<railway>.up.railway.app/health`.

Cloudflare: Dashboard → Workers & Pages → KV → create namespace `paperbridge-results`, copy its ID. API token: Create Token → template "Edit Cloudflare Workers" (includes KV write).

- [ ] **Step 4: Commit**

```bash
git add server/Dockerfile server/.dockerignore server/.env.example
git commit -m "chore(api): dockerfile + env example"
```

---

### Task 7: Web scaffold + i18n + API client

**Files:**
- Create: `client/` (Next.js), `client/lib/api.ts`, `client/lib/image.ts`, `client/i18n/routing.ts`, `client/i18n/request.ts`, `client/proxy.ts`, `client/messages/{en,es,vi,zh}.json`, `client/app/[locale]/layout.tsx`, `client/.env.example`

**Interfaces:**
- Produces: TS types mirroring Task 1 models; `decode(files, lang)`, `getResult(id)`, `icsUrl(id)`; `downscale(file) -> Promise<File>`; locales `["en","es","vi","zh"]` (`en` for dev only; UI picker shows the three).

- [ ] **Step 1: Scaffold**

```bash
bun create next-app@latest client --ts --tailwind --eslint --app --src-dir=false --import-alias "@/*" --use-bun
cd client && bunx --bun shadcn@latest init -d && bunx --bun shadcn@latest add button card badge drawer sheet
bun add next-intl
```

- [ ] **Step 2: i18n plumbing**

`client/i18n/routing.ts`:
```ts
import { defineRouting } from "next-intl/routing";
export const routing = defineRouting({ locales: ["en", "es", "vi", "zh"], defaultLocale: "en" });
```

`client/i18n/request.ts`:
```ts
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";
export default getRequestConfig(async ({ requestLocale }) => {
  const l = await requestLocale;
  const locale = routing.locales.includes(l as never) ? l! : routing.defaultLocale;
  return { locale, messages: (await import(`../messages/${locale}.json`)).default };
});
```

`client/proxy.ts` (Next 16 renamed `middleware.ts` → `proxy.ts`; next-intl's import name is unchanged):
```ts
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
export default createMiddleware(routing);
export const config = { matcher: "/((?!api|_next|_vercel|.*\\..*).*)" };
```

`client/next.config.ts`:
```ts
import createNextIntlPlugin from "next-intl/plugin";
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");
export default withNextIntl({});
```

`client/app/[locale]/layout.tsx`:
```tsx
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import "../globals.css";

export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const messages = await getMessages();
  return (
    <html lang={locale}>
      <body className="bg-[#FBF8F2] text-[#1C1A17]">
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
```

Delete `client/app/page.tsx` and `client/app/layout.tsx` (moved under `[locale]`).

- [ ] **Step 3: Messages**

`client/messages/en.json` (then translate the same keys into `es.json`, `vi.json`, `zh.json` — use the Vietnamese strings from the Pencil design for `vi`):
```json
{
  "upload": {
    "title": "Photograph the papers from school.",
    "subtitle": "We keep only what needs doing: deadlines, money, signatures.",
    "language": "Your language",
    "dropTitle": "Take a photo or choose files",
    "dropHint": "Up to 8 pages · Photos or PDF",
    "selected": "{n} pages selected",
    "clear": "Clear all",
    "decode": "Decode {n} pages",
    "decoding": "Reading {n} pages…",
    "decodingHint": "Usually 20–40 seconds. Keep this page open.",
    "privacy": "Photos are not stored. Results are kept for 30 days.",
    "errorAllFailed": "Could not read any page. Try clearer photos.",
    "errorTooMany": "Maximum 8 pages."
  },
  "results": {
    "title": "{n} things to do",
    "from": "From {n} pages",
    "thisWeek": "this week",
    "owed": "to pay",
    "toSign": "to sign",
    "groupOverdue": "OVERDUE",
    "groupThisWeek": "THIS WEEK",
    "groupLater": "LATER",
    "groupInfo": "INFO",
    "needsSignature": "Needs signature",
    "needsReply": "Needs reply",
    "showOriginal": "Show original text",
    "page": "Page {n} · original text",
    "draftReply": "Draft an English reply",
    "addToCalendar": "Add {n} dates to calendar",
    "share": "Share",
    "copied": "Link copied",
    "newStack": "New stack",
    "pageFailed": "Page {n} couldn't be read — try a clearer photo.",
    "expired": "This link has expired.",
    "replyTitle": "English reply",
    "replyFor": "Drafted for: {title}",
    "copy": "Copy",
    "edit": "Edit"
  }
}
```

- [ ] **Step 4: API client + types**

`client/lib/api.ts`:
```ts
export type Lang = "es" | "vi" | "zh";
export type Urgency = "overdue" | "this_week" | "later" | "none";
export interface ActionItem {
  id: string; type: "deadline" | "payment" | "signature" | "event" | "info";
  title: string; title_en: string; due_date: string | null; due_time: string | null;
  location: string | null; amount_usd: number | null; needs_signature: boolean;
  needs_reply: boolean; source_page: number; source_quote: string; urgency: Urgency;
}
export interface DecodeResult {
  id: string; target_language: Lang; created_at: string;
  pages: { index: number; summary: string; failed: boolean }[];
  items: ActionItem[];
  reply_drafts: { item_id: string; subject: string; body_en: string }[];
}

const API = process.env.NEXT_PUBLIC_API_URL!;

export async function decode(files: File[], lang: Lang): Promise<{ id: string | null; result: DecodeResult }> {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  fd.append("target_language", lang);
  const r = await fetch(`${API}/decode`, { method: "POST", body: fd });
  if (!r.ok) throw new Error((await r.json()).detail ?? r.statusText);
  return r.json();
}

export async function getResult(id: string): Promise<DecodeResult | null> {
  const r = await fetch(`${API}/r/${id}`, { cache: "no-store" });
  return r.ok ? r.json() : null;
}

export const icsUrl = (id: string) => `${API}/r/${id}/calendar.ics`;
```

`client/lib/image.ts`:
```ts
// dev-note: canvas downscale keeps uploads ~300KB/page; PDFs pass through untouched
export async function downscale(file: File, max = 1600): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  if (s === 1) return file;
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.85));
  return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
}
```

`client/.env.example`: `NEXT_PUBLIC_API_URL=http://localhost:8000`

- [ ] **Step 5: Verify**

Run: `bun run tsc --noEmit && bun run build` → passes (there's no page yet; `[locale]/page.tsx` comes in Task 8 — create a placeholder `export default function Page(){return null}` so build passes, Task 8 replaces it).

- [ ] **Step 6: Commit**

```bash
git add web
git commit -m "feat(web): scaffold, i18n, api client"
```

---

### Task 8: Upload page

**Files:**
- Create: `client/components/upload-form.tsx`; Replace: `client/app/[locale]/page.tsx`

**Interfaces:**
- Consumes: `decode`, `downscale`, `Lang`, messages `upload.*`.
- Produces: navigates to `/{locale}/r/{id}`; if `id` is null, stores result in `sessionStorage["pb:last"]` and navigates to `/{locale}/r/local`.

- [ ] **Step 1: Page**

`client/app/[locale]/page.tsx`:
```tsx
import UploadForm from "@/components/upload-form";
export default function Page() { return <UploadForm />; }
```

- [ ] **Step 2: Component**

`client/components/upload-form.tsx`:
```tsx
"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Camera, Plus, Sparkles, Loader2, FileCheck } from "lucide-react";
import { decode, type Lang } from "@/lib/api";
import { downscale } from "@/lib/image";

const LANGS: { code: Lang; label: string }[] = [
  { code: "es", label: "Español" }, { code: "vi", label: "Tiếng Việt" }, { code: "zh", label: "中文" },
];

export default function UploadForm() {
  const t = useTranslations("upload");
  const locale = useLocale();
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [err, setErr] = useState("");
  const lang = (LANGS.some((l) => l.code === locale) ? locale : "vi") as Lang;

  function pick(list: FileList | null) {
    if (!list) return;
    const next = [...files, ...Array.from(list)].slice(0, 8);
    if (files.length + list.length > 8) setErr(t("errorTooMany"));
    setFiles(next);
  }

  async function go() {
    setState("busy"); setErr("");
    try {
      const prepped = await Promise.all(files.map((f) => downscale(f)));
      const { id, result } = await decode(prepped, lang);
      if (id) router.push(`/${locale}/r/${id}`);
      else { sessionStorage.setItem("pb:last", JSON.stringify(result)); router.push(`/${locale}/r/local`); }
    } catch (e) {
      setErr((e as Error).message || t("errorAllFailed")); setState("error");
    }
  }

  const busy = state === "busy";
  return (
    <main className="mx-auto max-w-md px-5 pb-8 pt-4 space-y-7">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-[#1F5F4A] font-semibold text-sm"><FileCheck size={20} /> Paper Bridge</div>
        <h1 className="font-serif text-[34px] leading-tight font-semibold">{busy ? t("decoding", { n: files.length }) : t("title")}</h1>
        <p className="text-[#6B655C]">{busy ? t("decodingHint") : t("subtitle")}</p>
      </header>

      {!busy && (
        <section className="space-y-2">
          <p className="text-xs font-semibold tracking-wide text-[#6B655C]">{t("language")}</p>
          <div className="flex gap-2">
            {LANGS.map((l) => (
              <a key={l.code} href={`/${l.code}`}
                 className={`flex-1 rounded-full border py-3 text-center text-[15px] ${l.code === lang ? "bg-[#1F5F4A] border-[#1F5F4A] text-white font-semibold" : "bg-white border-[#E6E0D6]"}`}>
                {l.label}
              </a>
            ))}
          </div>
        </section>
      )}

      {!busy && (
        <label className="flex flex-col items-center gap-3 rounded-[20px] border-2 border-[#1F5F4A] bg-white px-5 py-8 cursor-pointer">
          <span className="grid size-16 place-items-center rounded-full bg-[#DDEEE6] text-[#1F5F4A]"><Camera size={30} /></span>
          <span className="text-lg font-semibold">{t("dropTitle")}</span>
          <span className="text-sm text-[#6B655C]">{t("dropHint")}</span>
          <input type="file" accept="image/*,application/pdf" capture="environment" multiple hidden onChange={(e) => pick(e.target.files)} />
        </label>
      )}

      {files.length > 0 && (
        <section className="space-y-2">
          <div className="flex justify-between text-xs font-semibold tracking-wide text-[#6B655C]">
            <span>{t("selected", { n: files.length })}</span>
            {!busy && <button className="text-[#1F5F4A]" onClick={() => setFiles([])}>{t("clear")}</button>}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {files.map((f, i) => (
              <div key={i} className={`relative h-[110px] rounded-xl overflow-hidden bg-[#E9E4DA] border border-[#E6E0D6] ${busy ? "animate-pulse" : ""}`}>
                {f.type.startsWith("image/") && <img src={URL.createObjectURL(f)} alt="" className="size-full object-cover" />}
                <span className="absolute bottom-2 left-2 rounded-full bg-black/80 px-2 py-0.5 text-[11px] font-semibold text-white">{i + 1}</span>
              </div>
            ))}
            {!busy && files.length < 8 && (
              <label className="grid h-[110px] place-items-center rounded-xl border border-[#E6E0D6] text-[#6B655C] cursor-pointer">
                <Plus size={22} /><input type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => pick(e.target.files)} />
              </label>
            )}
          </div>
        </section>
      )}

      {err && <p className="text-sm text-[#B3261E]">{err}</p>}

      <button disabled={busy || files.length === 0} onClick={go}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1F5F4A] py-[18px] text-[17px] font-semibold text-white disabled:bg-[#E6E0D6] disabled:text-[#6B655C]">
        {busy ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
        {busy ? t("decoding", { n: files.length }) : t("decode", { n: files.length })}
      </button>
      <p className="text-center text-xs text-[#6B655C]">{t("privacy")}</p>
    </main>
  );
}
```

- [ ] **Step 3: Manual verify**

Run API: `cd server && uv run uvicorn app.main:app --reload` (with real `.env`). Run web: `cd client && bun dev`. Open `http://localhost:3000/vi`, pick 2 photos, click Decode → lands on `/vi/r/<id>` (404 page for now — that's Task 9). Check Network tab: request bodies are JPEG ≤1600px.

- [ ] **Step 4: Commit**

```bash
git add client/app client/components/upload-form.tsx
git commit -m "feat(web): upload flow"
```

---

### Task 9: Results page + reply drawer

**Files:**
- Create: `client/app/[locale]/r/[id]/page.tsx`, `client/components/results-view.tsx`, `client/components/item-card.tsx`, `client/components/reply-drawer.tsx`

**Interfaces:**
- Consumes: `getResult`, `icsUrl`, `DecodeResult`, `ActionItem`, messages `results.*`.

- [ ] **Step 1: Server page**

`client/app/[locale]/r/[id]/page.tsx`:
```tsx
import { getResult } from "@/lib/api";
import ResultsView from "@/components/results-view";
import { getTranslations } from "next-intl/server";

export default async function Page({ params }: { params: Promise<{ id: string; locale: string }> }) {
  const { id } = await params;
  const t = await getTranslations("results");
  if (id === "local") return <ResultsView id={null} initial={null} />;
  const result = await getResult(id);
  if (!result) return <main className="mx-auto max-w-md p-5 pt-20 text-center text-[#6B655C]">{t("expired")}</main>;
  return <ResultsView id={id} initial={result} />;
}
```

- [ ] **Step 2: Results view**

`client/components/results-view.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, CalendarPlus, Link as LinkIcon } from "lucide-react";
import { icsUrl, type ActionItem, type DecodeResult, type Urgency } from "@/lib/api";
import ItemCard from "./item-card";
import ReplyDrawer from "./reply-drawer";

const GROUPS: { key: Urgency; label: string; dot: string }[] = [
  { key: "overdue", label: "groupOverdue", dot: "bg-[#B3261E]" },
  { key: "this_week", label: "groupThisWeek", dot: "bg-[#B3261E]" },
  { key: "later", label: "groupLater", dot: "bg-[#9A5B00]" },
  { key: "none", label: "groupInfo", dot: "bg-[#6B655C]" },
];

export default function ResultsView({ id, initial }: { id: string | null; initial: DecodeResult | null }) {
  const t = useTranslations("results");
  const locale = useLocale();
  const [result, setResult] = useState(initial);
  const [reply, setReply] = useState<ActionItem | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!initial) { const raw = sessionStorage.getItem("pb:last"); if (raw) setResult(JSON.parse(raw)); }
  }, [initial]);
  if (!result) return null;

  const items = result.items;
  const thisWeek = items.filter((i) => i.urgency === "overdue" || i.urgency === "this_week").length;
  const owed = items.reduce((s, i) => s + (i.amount_usd ?? 0), 0);
  const toSign = items.filter((i) => i.needs_signature).length;
  const dated = items.filter((i) => i.due_date).length;
  const failed = result.pages.filter((p) => p.failed);

  return (
    <main className="mx-auto max-w-md pb-28">
      <div className="px-5 pt-3 space-y-6">
        <div className="flex items-center justify-between">
          <a href={`/${locale}`} className="flex items-center gap-1.5 text-[#1F5F4A] font-medium"><ArrowLeft size={18} />{t("newStack")}</a>
          {id && (
            <button onClick={() => { navigator.clipboard.writeText(location.href); setCopied(true); }}
                    className="flex items-center gap-1.5 rounded-full border border-[#E6E0D6] bg-white px-3 py-2 text-sm font-semibold">
              <LinkIcon size={15} />{copied ? t("copied") : t("share")}
            </button>
          )}
        </div>
        <header className="space-y-1">
          <h1 className="font-serif text-[34px] leading-tight font-semibold">{t("title", { n: items.length })}</h1>
          <p className="text-sm text-[#6B655C]">{t("from", { n: result.pages.length })}</p>
        </header>
        <div className="grid grid-cols-3 gap-2">
          {[[thisWeek, t("thisWeek"), "text-[#B3261E]"], [`$${owed}`, t("owed"), "text-[#9A5B00]"], [toSign, t("toSign"), "text-[#1F5F4A]"]].map(([v, l, c]) => (
            <div key={String(l)} className="rounded-2xl border border-[#E6E0D6] bg-white px-3.5 py-3">
              <div className={`font-serif text-2xl font-semibold ${c}`}>{v}</div>
              <div className="text-xs text-[#6B655C]">{l}</div>
            </div>
          ))}
        </div>
        {GROUPS.map((g) => {
          const list = items.filter((i) => i.urgency === g.key);
          if (!list.length) return null;
          return (
            <section key={g.key} className="space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-[#6B655C]"><span className={`size-2 rounded-full ${g.dot}`} />{t(g.label)}</div>
              {list.map((i) => <ItemCard key={i.id} item={i} onReply={() => setReply(i)} />)}
            </section>
          );
        })}
        {failed.map((p) => <p key={p.index} className="text-sm text-[#B3261E]">{t("pageFailed", { n: p.index + 1 })}</p>)}
      </div>
      {id && dated > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-[#E6E0D6] bg-white px-5 pb-7 pt-3">
          <a href={icsUrl(id)} download className="mx-auto flex max-w-md items-center justify-center gap-2 rounded-2xl bg-[#1F5F4A] py-4 font-semibold text-white">
            <CalendarPlus size={18} />{t("addToCalendar", { n: dated })}
          </a>
        </div>
      )}
      <ReplyDrawer item={reply} draft={result.reply_drafts.find((d) => d.item_id === reply?.id) ?? null} onClose={() => setReply(null)} />
    </main>
  );
}
```

- [ ] **Step 3: Item card**

`client/components/item-card.tsx`:
```tsx
"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Calendar, ChevronDown, DollarSign, Mail, MapPin, PenLine } from "lucide-react";
import type { ActionItem } from "@/lib/api";

const TONE = {
  danger: "bg-[#F9E0DD] text-[#B3261E]", warn: "bg-[#FBEBD0] text-[#9A5B00]", ok: "bg-[#DDEEE6] text-[#1F5F4A]",
};
function Chip({ tone, icon, children }: { tone: keyof typeof TONE; icon: React.ReactNode; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[tone]}`}>{icon}{children}</span>;
}

export default function ItemCard({ item, onReply }: { item: ActionItem; onReply: () => void }) {
  const t = useTranslations("results");
  const [open, setOpen] = useState(false);
  const urgent = item.urgency === "overdue" || item.urgency === "this_week";
  const tone = urgent ? "danger" : item.urgency === "later" ? "warn" : "ok";
  return (
    <article className="space-y-3 rounded-2xl border border-[#E6E0D6] bg-white p-4">
      <div className="flex gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${TONE[tone]}`}>{item.needs_signature ? <PenLine size={20} /> : item.amount_usd ? <DollarSign size={20} /> : <Calendar size={20} />}</span>
        <div className="min-w-0">
          <h3 className="text-[17px] font-semibold leading-snug">{item.title}</h3>
          <p className="text-[13px] text-[#6B655C]">{item.title_en}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {item.due_date && <Chip tone={tone} icon={<Calendar size={13} />}>{item.due_date}{item.due_time ? ` ${item.due_time}` : ""}</Chip>}
        {item.amount_usd != null && <Chip tone="warn" icon={<DollarSign size={13} />}>${item.amount_usd}</Chip>}
        {item.location && <Chip tone="ok" icon={<MapPin size={13} />}>{item.location}</Chip>}
        {item.needs_signature && <Chip tone="ok" icon={<PenLine size={13} />}>{t("needsSignature")}</Chip>}
        {item.needs_reply && <Chip tone="ok" icon={<Mail size={13} />}>{t("needsReply")}</Chip>}
      </div>
      {open ? (
        <blockquote className="space-y-1 rounded-lg border-l-[3px] border-[#E6E0D6] bg-[#FBF8F2] px-3 py-2.5">
          <p className="text-[13px] italic text-[#6B655C]">“{item.source_quote}”</p>
          <p className="text-[11px] font-semibold text-[#6B655C]">{t("page", { n: item.source_page + 1 })}</p>
        </blockquote>
      ) : (
        <button onClick={() => setOpen(true)} className="flex items-center gap-1 text-[13px] font-semibold text-[#1F5F4A]">{t("showOriginal")}<ChevronDown size={14} /></button>
      )}
      {item.needs_reply && (
        <button onClick={onReply} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#DDEEE6] py-3 text-sm font-semibold text-[#1F5F4A]"><Mail size={16} />{t("draftReply")}</button>
      )}
    </article>
  );
}
```

- [ ] **Step 4: Reply drawer**

`client/components/reply-drawer.tsx`:
```tsx
"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Copy } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import type { ActionItem } from "@/lib/api";

type Draft = { subject: string; body_en: string } | null;

export default function ReplyDrawer({ item, draft, onClose }: { item: ActionItem | null; draft: Draft; onClose: () => void }) {
  const t = useTranslations("results");
  const [body, setBody] = useState<string | null>(null);
  const text = body ?? draft?.body_en ?? "";
  return (
    <Drawer open={!!item} onOpenChange={(o) => { if (!o) { setBody(null); onClose(); } }}>
      <DrawerContent className="bg-white px-5 pb-8">
        <DrawerTitle className="font-serif text-2xl font-semibold">{t("replyTitle")}</DrawerTitle>
        <p className="text-sm text-[#6B655C]">{t("replyFor", { title: item?.title ?? "" })}</p>
        <div className="mt-4 space-y-2 rounded-xl border border-[#E6E0D6] bg-[#FBF8F2] p-3.5">
          <p className="text-[13px] font-semibold"><span className="text-[#6B655C]">Subject: </span>{draft?.subject}</p>
          <hr className="border-[#E6E0D6]" />
          <textarea value={text} onChange={(e) => setBody(e.target.value)} rows={9}
                    className="w-full resize-none bg-transparent text-sm leading-relaxed outline-none" />
        </div>
        <button onClick={() => navigator.clipboard.writeText(`Subject: ${draft?.subject}\n\n${text}`)}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1F5F4A] py-3.5 font-semibold text-white"><Copy size={16} />{t("copy")}</button>
      </DrawerContent>
    </Drawer>
  );
}
```

Add to `client/app/globals.css` (after Tailwind import): `.font-serif { font-family: "Fraunces", Georgia, serif; }` and in `[locale]/layout.tsx` add `<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&display=swap" rel="stylesheet" />` inside `<head>`.

- [ ] **Step 5: Verify**

`bun run tsc --noEmit && bun run build` → passes. Manual: run through upload → results with real photos; click "Show original text"; open a reply drawer, Copy; tap "Add to calendar" downloads `paper-bridge.ics` and opens in Calendar app on phone (test via Vercel preview URL on a phone).

- [ ] **Step 6: Commit**

```bash
git add client/app client/components
git commit -m "feat(web): results page, item cards, reply drawer"
```

---

### Task 10: Fixtures, live recall test, deploy, README

**Files:**
- Create: `server/tests/fixtures/*.{jpg,pdf}` (5 files), `server/tests/fixtures/*.expected.json`, `server/tests/test_live.py`; Modify: `README.md`

- [ ] **Step 1: Collect fixtures**

Find 5 public docs (search `site:*.k12.*.us "permission slip" filetype:pdf`, district newsletter PDFs, free/reduced lunch application). Save as `tests/fixtures/01-permission-slip.pdf` … `05-newsletter.pdf`. For each, hand-write `NN-name.expected.json`:
```json
{ "today": "2026-09-19", "required": [ { "due_date": "2026-09-26", "amount_usd": 12, "needs_signature": true } ] }
```
Only include tuples a human is sure about. Omit a key from a tuple to mean "don't check it".

- [ ] **Step 2: Live test**

`server/tests/test_live.py`:
```python
import json, os
from datetime import date
from pathlib import Path
import pytest
from app.decoder import decode

FIX = Path(__file__).parent / "fixtures"
pytestmark = pytest.mark.skipif(not os.environ.get("GEMINI_API_KEY"), reason="needs GEMINI_API_KEY")
MIME = {".pdf": "application/pdf", ".jpg": "image/jpeg", ".png": "image/png"}


@pytest.mark.parametrize("exp", sorted(FIX.glob("*.expected.json")), ids=lambda p: p.stem)
async def test_recall(exp):
    spec = json.loads(exp.read_text())
    src = next(p for p in FIX.glob(exp.name.replace(".expected.json", ".*")) if p.suffix in MIME)
    r = await decode([(src.read_bytes(), MIME[src.suffix])], "es", date.fromisoformat(spec["today"]))
    got = [i.model_dump(mode="json") for i in r.items]
    for want in spec["required"]:
        assert any(all(g.get(k) == v for k, v in want.items()) for g in got), f"missing {want}\ngot {got}"
```

Run: `uv run pytest tests/test_live.py -v` → all 5 pass. If one fails, fix the prompt in `decoder.py` (not the expected file) unless the expectation was wrong.

- [ ] **Step 3: Deploy web**

```bash
cd client && vercel --prod   # set NEXT_PUBLIC_API_URL to the Railway URL in Vercel env first
```
Then set `ALLOWED_ORIGIN` on Railway to the Vercel URL and redeploy the API.

- [ ] **Step 4: README**

Replace `README.md` with: one-paragraph pitch, the demo script from the spec, local dev (`server`: `cp .env.example .env && uv sync && uv run uvicorn app.main:app --reload`; `client`: `cp .env.example .env.local && bun install && bun dev`), and env var table.

- [ ] **Step 5: Commit**

```bash
git add server/tests/fixtures server/tests/test_live.py README.md
git commit -m "test: live recall fixtures; docs: readme"
```

---

### Task 11: Google sign-in + history (Firebase)

**Files:**
- Create: `client/lib/firebase.ts`, `client/components/auth-button.tsx`, `client/app/[locale]/signin/page.tsx`, `client/app/[locale]/history/page.tsx`, `client/firestore.rules`
- Modify: `client/components/upload-form.tsx` (call `saveToHistory` after decode), `client/components/results-view.tsx` (mount `<AuthButton/>` in top bar), `client/messages/*.json` (add `auth.*` keys), `client/.env.example`

**Interfaces:**
- Consumes: `DecodeResult` from `lib/api.ts`.
- Produces: `auth`, `db`, `googleSignIn()`, `saveToHistory(result: DecodeResult)`, `listHistory(uid): Promise<HistoryRow[]>`, `type HistoryRow = {id, title, itemCount, targetLanguage, createdAt: number}`.

- [ ] **Step 1: Firebase console (5 min)**

console.firebase.google.com → Add project `paper-bridge` → Build → Authentication → Sign-in method → enable **Google** → Build → Firestore → create database (production mode). Project settings → Your apps → Web → copy config. Add the Vercel domain under Authentication → Settings → Authorized domains.

`client/.env.example` append:
```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

- [ ] **Step 2: Rules**

`client/firestore.rules` (paste into console → Firestore → Rules → Publish):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/results/{id} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

- [ ] **Step 3: Firebase module**

```bash
bun add firebase
```

`client/lib/firebase.ts`:
```ts
import { getApps, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { collection, doc, getDocs, getFirestore, orderBy, query, setDoc } from "firebase/firestore/lite";
import type { DecodeResult } from "./api";

const app = getApps()[0] ?? initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
});
export const auth = getAuth(app);
export const db = getFirestore(app);

export const googleSignIn = () => signInWithPopup(auth, new GoogleAuthProvider());

export type HistoryRow = { id: string; title: string; itemCount: number; targetLanguage: string; createdAt: number };

// dev-note: title = first item's title; good enough for a list row
export async function saveToHistory(result: DecodeResult) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const row: HistoryRow = {
    id: result.id, title: result.items[0]?.title ?? "", itemCount: result.items.length,
    targetLanguage: result.target_language, createdAt: Date.now(),
  };
  await setDoc(doc(db, "users", uid, "results", result.id), row);
}

export async function listHistory(uid: string): Promise<HistoryRow[]> {
  const q = query(collection(db, "users", uid, "results"), orderBy("createdAt", "desc"));
  return (await getDocs(q)).docs.map((d) => d.data() as HistoryRow);
}
```

- [ ] **Step 4: Auth button**

`client/components/auth-button.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { useLocale, useTranslations } from "next-intl";
import { auth } from "@/lib/firebase";

export default function AuthButton() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  if (user === undefined) return null;
  if (!user) return <a href={`/${locale}/signin`} className="text-sm font-semibold text-[#1F5F4A]">{t("signIn")}</a>;
  return (
    <div className="flex items-center gap-2">
      <a href={`/${locale}/history`} className="text-sm font-semibold text-[#1F5F4A]">{t("history")}</a>
      <button onClick={() => signOut(auth)} title={t("signOut")}>
        <img src={user.photoURL ?? ""} alt="" className="size-7 rounded-full" />
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Sign-in page**

`client/app/[locale]/signin/page.tsx`:
```tsx
"use client";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { FileCheck } from "lucide-react";
import { googleSignIn } from "@/lib/firebase";

export default function SignIn() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  return (
    <main className="mx-auto max-w-md px-5 pt-6 space-y-7">
      <div className="flex items-center gap-2 text-[#1F5F4A] font-semibold text-sm"><FileCheck size={20} /> Paper Bridge</div>
      <header className="space-y-2">
        <h1 className="font-serif text-[34px] leading-tight font-semibold">{t("title")}</h1>
        <p className="text-[#6B655C]">{t("subtitle")}</p>
      </header>
      <button onClick={async () => { await googleSignIn(); router.push(`/${locale}/history`); }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#E6E0D6] bg-white py-4 font-semibold">
        {t("google")}
      </button>
      <p className="text-center text-sm text-[#6B655C]">{t("optional")}</p>
    </main>
  );
}
```

- [ ] **Step 6: History page**

`client/app/[locale]/history/page.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useLocale, useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import { auth, listHistory, type HistoryRow } from "@/lib/firebase";

export default function History() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  useEffect(() => onAuthStateChanged(auth, async (u) => {
    if (!u) { location.href = `/${locale}/signin`; return; }
    setRows(await listHistory(u.uid));
  }), [locale]);
  return (
    <main className="mx-auto max-w-md px-5 pt-6 space-y-6">
      <h1 className="font-serif text-[34px] leading-tight font-semibold">{t("history")}</h1>
      {rows?.length === 0 && <p className="text-[#6B655C]">{t("empty")}</p>}
      <ul className="space-y-2">
        {rows?.map((r) => (
          <li key={r.id}>
            <a href={`/${locale}/r/${r.id}`} className="flex items-center justify-between rounded-2xl border border-[#E6E0D6] bg-white p-4">
              <div className="min-w-0">
                <p className="truncate font-semibold">{r.title}</p>
                <p className="text-xs text-[#6B655C]">{new Date(r.createdAt).toLocaleDateString(locale)} · {t("items", { n: r.itemCount })}</p>
              </div>
              <ChevronRight size={18} className="text-[#6B655C]" />
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 7: Wire in**

In `upload-form.tsx`, after `const { id, result } = await decode(prepped, lang);` add:
```ts
if (id) saveToHistory(result).catch(() => {});
```
and `import { saveToHistory } from "@/lib/firebase";`. In `results-view.tsx` top bar, add `<AuthButton />` next to the Share button. Add `<AuthButton />` to the upload page header row too.

Add to every `messages/*.json`:
```json
"auth": {
  "signIn": "Sign in", "signOut": "Sign out", "history": "My stacks",
  "title": "Keep every stack.", "subtitle": "Sign in to find your past results again on any device.",
  "google": "Continue with Google", "optional": "Sign-in is optional. You can decode without an account.",
  "empty": "No stacks yet. Decode one and it will show up here.", "items": "{n} items"
}
```

- [ ] **Step 8: Verify**

`bun run tsc --noEmit && bun run build` → passes. Manual: sign in with Google, decode a stack, open `/vi/history` → row appears → click → results page. Sign out → `/history` redirects to `/signin`. Firestore console shows `users/<uid>/results/<id>`.

- [ ] **Step 9: Commit**

```bash
git add client/lib/firebase.ts client/components/auth-button.tsx client/app/[locale]/signin client/app/[locale]/history client/firestore.rules client/components/upload-form.tsx client/components/results-view.tsx client/messages client/.env.example client/package.json client/bun.lock
git commit -m "feat(web): google sign-in + firestore history"
```

---

## Self-review

- **Spec coverage:** models/urgency (T1), ics + VALARM (T2), KV 30d (T3), per-page + merge + retry + AllPagesFailed (T4), all 3 routes + 400/404/502 + KV-fail fallback + CORS (T5), Docker/Railway/env (T6), i18n + downscale (T7), upload UI + 8-page cap (T8), results grouping/summary strip/source quote/reply drawer/sticky ics bar/expired page/failed page notice (T9), 5 fixtures + live test + deploy (T10), Firebase Google sign-in + Firestore history + rules (T11). Share link: copy button in T9. ✔
- **Placeholders:** none.
- **Type consistency:** `decode(pages, target_language, today, client=None)` used identically in T4/T5/T10; `store.put/get` in T3/T5; `build_ics` in T2/T5; TS `DecodeResult` mirrors Python; `/r/local` fallback in T8 handled in T9.
