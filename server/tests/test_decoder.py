import json
from datetime import date
from types import SimpleNamespace
import pytest
from app import decoder
from app.decoder import PageOut, RawItem, MergeOut


class FakeClient:
    """Returns canned PageOut for image calls, MergeOut for the merge call."""
    def __init__(self, page_outs, merge_out=None, fail_pages=(), merge_fail_times=0):
        self.page_outs, self.merge_out, self.fail_pages = page_outs, merge_out, set(fail_pages)
        self.merge_fail_times = merge_fail_times
        self.calls = 0
        self.merge_calls = 0
        self.aio = SimpleNamespace(models=SimpleNamespace(generate_content=self._gen))

    async def _gen(self, model, contents, config):
        self.calls += 1
        if config.response_schema is PageOut:
            idx = int(contents[0].split("PAGE_INDEX=")[1].split()[0])
            if idx in self.fail_pages:
                raise RuntimeError("gemini down")
            return SimpleNamespace(parsed=self.page_outs[idx])
        self.merge_calls += 1
        if self.merge_calls <= self.merge_fail_times:
            raise RuntimeError("gemini down")
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


async def test_merge_retries_once_then_succeeds():
    merged = MergeOut(items=[ITEM], reply_drafts=[])
    fake = FakeClient([PageOut(summary="a", items=[ITEM]), PageOut(summary="b", items=[ITEM])],
                      merged, merge_fail_times=1)
    r = await decoder.decode([(b"1", "image/jpeg"), (b"2", "image/jpeg")], "vi", TODAY, client=fake)
    assert fake.merge_calls == 2
    assert len(r.items) == 1


async def test_merge_fails_twice_raises():
    fake = FakeClient([PageOut(summary="a", items=[ITEM]), PageOut(summary="b", items=[ITEM])],
                      merge_fail_times=2)
    with pytest.raises(RuntimeError):
        await decoder.decode([(b"1", "image/jpeg"), (b"2", "image/jpeg")], "vi", TODAY, client=fake)
