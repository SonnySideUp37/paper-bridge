import asyncio
import logging
import os
import time
from collections import defaultdict
from datetime import date
from fastapi import FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from app import store
from app.decoder import AllPagesFailed, decode
from app.ics import build_ics
from app.models import DecodeResult, Lang

log = logging.getLogger("paperbridge")
MAX_FILES, MAX_BYTES = 8, 10 * 1024 * 1024
# dev-note: in-memory per-IP window + global concurrency cap; enough for one Railway instance.
# Move to KV/redis if we ever run >1 replica.
RATE_LIMIT, RATE_WINDOW = int(os.environ.get("RATE_LIMIT", 10)), 600
MAX_CONCURRENT = int(os.environ.get("MAX_CONCURRENT", 3))
_hits: dict[str, list[float]] = defaultdict(list)
_slots = asyncio.Semaphore(MAX_CONCURRENT)


def check_rate(ip: str) -> None:
    now = time.monotonic()
    hits = _hits[ip] = [t for t in _hits[ip] if now - t < RATE_WINDOW]
    if len(hits) >= RATE_LIMIT:
        raise HTTPException(429, f"Too many stacks. Try again in {int((RATE_WINDOW - (now - hits[0])) / 60) + 1} min.")
    hits.append(now)

app = FastAPI(title="Paper Bridge API")
app.add_middleware(CORSMiddleware, allow_origins=[os.environ.get("ALLOWED_ORIGIN", "http://localhost:3000").rstrip("/"), "http://localhost:3000"],
                   allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/decode")
async def decode_route(request: Request, files: list[UploadFile] = File(...), target_language: Lang = Form(...)):
    check_rate((request.headers.get("x-forwarded-for") or request.client.host).split(",")[0].strip())
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
    if _slots.locked():
        raise HTTPException(503, "Busy right now. Try again in a minute.")
    try:
        async with _slots:
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
