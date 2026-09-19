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
