import httpx, respx, pytest
from app import store

BASE = "https://api.cloudflare.com/client/v4/accounts/acc/storage/kv/namespaces/ns/values"


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("CF_ACCOUNT_ID", "acc")
    monkeypatch.setenv("CF_KV_NAMESPACE_ID", "ns")
    monkeypatch.setenv("CF_API_TOKEN", "tok")


@respx.mock
async def test_put_and_get(sample_result):
    put = respx.put(f"{BASE}/abc123XYZ_", params={"expiration_ttl": "2592000"}).mock(
        return_value=httpx.Response(200, json={"success": True}))
    await store.put(sample_result)
    assert put.called
    assert put.calls[0].request.headers["authorization"] == "Bearer tok"

    respx.get(f"{BASE}/abc123XYZ_").mock(
        return_value=httpx.Response(200, content=sample_result.model_dump_json()))
    got = await store.get("abc123XYZ_")
    assert got == sample_result


@respx.mock
async def test_get_missing():
    respx.get(f"{BASE}/nope").mock(return_value=httpx.Response(404))
    assert await store.get("nope") is None
