"""Iteration 12: life events, investments summary (net worth), TTS endpoint."""
import os
import time
import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"

CREDS = {"email": "demo@example.com", "password": "demo123"}


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json=CREDS, timeout=60)
    if r.status_code != 200:
        pytest.fail(f"login failed {r.status_code}: {r.text[:300]}")
    token = r.json().get("token")
    assert token
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


# ---- Life events ----
class TestLifeEvents:
    def test_list_life_events(self, client):
        r = client.get(f"{API}/life-events", timeout=60)
        assert r.status_code == 200, r.text[:300]
        events = r.json()["events"]
        assert len(events) == 7
        keys = {e["key"] for e in events}
        assert {"buy_home", "new_baby", "retirement", "marriage", "new_job",
                "bereavement", "moving_abroad"} == keys
        for e in events:
            assert e["title"] and isinstance(e["categories"], list) and e["categories"]

    def test_list_requires_auth(self):
        r = requests.get(f"{API}/life-events", timeout=60)
        assert r.status_code in (401, 403), r.status_code

    def test_guide_buy_home(self, client):
        r = client.post(f"{API}/life-events/guide", json={"event": "buy_home"}, timeout=180)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["event"] == "buy_home"
        assert d["title"] == "Buying a home"
        assert isinstance(d["checklist"], list) and len(d["checklist"]) >= 6
        for it in d["checklist"]:
            assert it.get("item")
            assert it.get("category")
        assert isinstance(d["recommended_categories"], list)
        assert isinstance(d["matched_documents"], list)
        assert isinstance(d["missing_categories"], list)
        assert isinstance(d["have_document_ids"], list)
        assert '"_id"' not in r.text

    def test_guide_unknown_event(self, client):
        r = client.post(f"{API}/life-events/guide", json={"event": "not_a_thing"}, timeout=60)
        assert r.status_code == 404, r.status_code

    def test_guide_missing_body(self, client):
        r = client.post(f"{API}/life-events/guide", json={}, timeout=60)
        assert r.status_code == 422, r.status_code


# ---- Investments -> net worth ----
class TestInvestmentsSummary:
    created = []

    def test_create_and_summary(self, client):
        before = client.get(f"{API}/investments/summary", timeout=60)
        assert before.status_code == 200, before.text[:300]
        b = before.json()

        payload = {"name": "TEST_Nifty Index Fund", "asset_type": "mutual_fund",
                   "amount_invested": 100000, "current_value": 125000}
        r = client.post(f"{API}/investments", json=payload, timeout=60)
        assert r.status_code == 200, r.text[:300]
        inv = r.json()
        assert inv["investment_id"]
        assert inv["name"] == payload["name"]
        assert "_id" not in inv
        TestInvestmentsSummary.created.append(inv["investment_id"])

        lst = client.get(f"{API}/investments", timeout=60)
        assert lst.status_code == 200
        assert any(i["investment_id"] == inv["investment_id"] for i in lst.json())

        after = client.get(f"{API}/investments/summary", timeout=60).json()
        assert after["count"] == b["count"] + 1
        assert round(after["total_invested"] - b["total_invested"], 2) == 100000.0
        assert round(after["total_current"] - b["total_current"], 2) == 125000.0
        assert after["net_worth"] == after["total_current"]
        assert round(after["total_gain"], 2) == round(after["total_current"] - after["total_invested"], 2)
        assert after["by_type"].get("mutual_fund", 0) >= 125000

    def test_update_and_delete(self, client):
        assert TestInvestmentsSummary.created, "no investment created"
        iid = TestInvestmentsSummary.created[0]
        r = client.put(f"{API}/investments/{iid}", json={"current_value": 150000}, timeout=60)
        assert r.status_code == 200, r.text[:300]
        assert r.json()["current_value"] == 150000
        lst = client.get(f"{API}/investments", timeout=60).json()
        got = [i for i in lst if i["investment_id"] == iid][0]
        assert got["current_value"] == 150000

        d = client.delete(f"{API}/investments/{iid}", timeout=60)
        assert d.status_code == 200
        lst2 = client.get(f"{API}/investments", timeout=60).json()
        assert not any(i["investment_id"] == iid for i in lst2)
        TestInvestmentsSummary.created.clear()

    def test_delete_unknown(self, client):
        r = client.delete(f"{API}/investments/does-not-exist", timeout=60)
        assert r.status_code == 404


# ---- TTS ----
class TestTts:
    def test_tts_returns_url(self, client):
        t0 = time.time()
        r = client.post(f"{API}/tts", json={"text": "Hello from Everkin test."}, timeout=180)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert "url" in d and d["url"].startswith("/")
        audio = requests.get(f"{BASE_URL}{d['url']}", timeout=120)
        assert audio.status_code == 200
        assert len(audio.content) > 1000
        print(f"tts latency {time.time()-t0:.1f}s size={len(audio.content)}")

    def test_tts_empty_text(self, client):
        r = client.post(f"{API}/tts", json={"text": ""}, timeout=60)
        assert r.status_code in (200, 400, 422), r.status_code


# ---- Nav regression endpoints ----
@pytest.mark.parametrize("path", [
    "/dashboard/stats", "/insights", "/investments", "/investments/summary",
    "/investments/meta", "/documents", "/documents/categories", "/forms",
    "/life-events", "/profile", "/bundle/history", "/chat/conversations",
])
def test_page_backing_endpoints(client, path):
    r = client.get(f"{API}{path}", timeout=90)
    assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"
