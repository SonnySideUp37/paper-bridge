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
