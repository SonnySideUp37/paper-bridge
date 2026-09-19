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
