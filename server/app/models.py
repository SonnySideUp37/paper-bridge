import secrets
from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel

Lang = Literal["en", "es", "vi", "zh"]
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
