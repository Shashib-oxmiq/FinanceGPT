"""Iteration 10 backend tests: Policy Guide analyze + Voice (TTS) endpoints."""
import io
import os

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
    r = s.post(f"{API}/auth/login", json=CREDS, timeout=60)
    if r.status_code != 200:
        pytest.fail(f"login failed {r.status_code}: {r.text[:300]}")
    token = r.json().get("token")
    assert token
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def created(client):
    ids = []
    yield ids
    for did in ids:
        client.delete(f"{API}/documents/{did}", timeout=60)


# ---------- auth guards ----------
class TestAuthGuards:
    def test_tts_requires_auth(self):
        r = requests.post(f"{API}/tts", json={"text": "hello"}, timeout=30)
        assert r.status_code in (401, 403), r.text[:200]

    def test_analyze_requires_auth(self):
        r = requests.post(f"{API}/insurance/analyze", json={"insurance_type": "health"}, timeout=60)
        assert r.status_code in (401, 403), r.text[:200]


# ---------- /api/tts ----------
class TestTTS:
    def test_tts_empty_text_400(self, client):
        r = client.post(f"{API}/tts", json={"text": "   "}, timeout=60)
        assert r.status_code == 400, r.text[:200]

    def test_tts_generates_and_serves_mp3(self, client):
        r = client.post(f"{API}/tts", json={"text": "This is a short policy guide test.", "voice": "sage"}, timeout=180)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert "url" in data and data["url"].startswith("/api/tts/") and data["url"].endswith(".mp3")
        g = requests.get(f"{BASE_URL}{data['url']}", timeout=120)
        assert g.status_code == 200
        assert g.headers.get("content-type", "").startswith("audio/mpeg")
        assert len(g.content) > 1000
        # idempotent cache: same text returns same key
        r2 = client.post(f"{API}/tts", json={"text": "This is a short policy guide test.", "voice": "sage"}, timeout=180)
        assert r2.json()["url"] == data["url"]

    def test_tts_unknown_key_404(self):
        r = requests.get(f"{API}/tts/deadbeefdeadbeefdeadbeef.mp3", timeout=60)
        assert r.status_code == 404


# ---------- /api/insurance/analyze ----------
EXPECTED_KEYS = ["covered", "not_covered", "corner_cases", "emergency_numbers", "dos", "donts", "claim_steps"]


class TestPolicyAnalyze:
    def test_analyze_health_general(self, client):
        r = client.post(f"{API}/insurance/analyze", json={"insurance_type": "health", "document_id": None}, timeout=180)
        assert r.status_code == 200, r.text[:400]
        d = r.json()
        for k in EXPECTED_KEYS:
            assert k in d, f"missing key {k}: {list(d.keys())}"
        assert isinstance(d.get("summary"), str) and len(d["summary"]) > 10
        assert len(d["covered"]) > 0 and "item" in d["covered"][0]
        assert len(d["not_covered"]) > 0
        assert len(d["emergency_numbers"]) > 0
        assert {"label", "number"} <= set(d["emergency_numbers"][0].keys())
        assert len(d["dos"]) > 0 and len(d["donts"]) > 0
        assert "_id" not in d

    def test_analyze_auto_type(self, client):
        r = client.post(f"{API}/insurance/analyze", json={"insurance_type": "auto"}, timeout=180)
        assert r.status_code == 200, r.text[:400]
        d = r.json()
        for k in EXPECTED_KEYS:
            assert k in d

    def test_analyze_bad_document_404(self, client):
        r = client.post(f"{API}/insurance/analyze", json={"insurance_type": "health", "document_id": "nope-123"}, timeout=120)
        assert r.status_code == 404, r.text[:200]

    def test_analyze_with_uploaded_insurance_doc(self, client, created):
        content = (
            "STAR HEALTH INSURANCE POLICY - TEST_it10\n"
            "Policy No: TEST-IT10-999. Sum insured Rs 5,00,000. Room rent capped at 1% of sum insured per day.\n"
            "Covered: hospitalisation above 24 hours, day-care procedures, pre-hospitalisation 30 days, post 60 days.\n"
            "Exclusions: cosmetic surgery, dental unless accidental, pre-existing diseases for 36 months.\n"
            "Waiting period: 30 days initial. Claim helpline 1800-425-2255. TPA cashless at network hospitals only.\n"
        )
        files = {"file": ("TEST_it10_policy.txt", io.BytesIO(content.encode()), "text/plain")}
        up = client.post(f"{API}/documents/upload", files=files, data={"category": "insurance", "auto_classify": "false"}, timeout=180)
        assert up.status_code in (200, 201), up.text[:400]
        doc = up.json()
        did = doc.get("document_id") or doc.get("id")
        assert did
        created.append(did)

        # doc appears in the insurance-category list used by guide-doc select
        lst = client.get(f"{API}/documents?category=insurance", timeout=60)
        assert lst.status_code == 200
        assert any(x.get("document_id") == did for x in lst.json())

        r = client.post(f"{API}/insurance/analyze", json={"insurance_type": "health", "document_id": did}, timeout=240)
        assert r.status_code == 200, r.text[:400]
        d = r.json()
        for k in EXPECTED_KEYS:
            assert k in d
        assert len(d["covered"]) > 0
