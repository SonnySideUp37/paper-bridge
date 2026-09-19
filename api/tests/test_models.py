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
