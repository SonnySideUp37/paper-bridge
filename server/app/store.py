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
