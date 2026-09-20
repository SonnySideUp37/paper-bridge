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
