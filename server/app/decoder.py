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
