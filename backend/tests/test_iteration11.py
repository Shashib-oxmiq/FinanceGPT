"""Iteration 11 backend tests: Voice Everywhere (TTS for chat replies + Money Insights)."""
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

CSV = (
    "Date,Description,Amount\n"
    "2026-01-02,NETFLIX SUBSCRIPTION,-499\n"
    "2026-01-03,SALARY CREDIT,50000\n"
    "2026-01-05,SPOTIFY,-119\n"
    "2026-01-09,BIG BAZAAR GROCERY,-3200\n"
    "2026-02-02,NETFLIX SUBSCRIPTION,-499\n"
    "2026-02-03,SALARY CREDIT,50000\n"
    "2026-02-05,SPOTIFY,-119\n"
    "2026-02-11,UBER RIDES,-880\n"
)


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
def cleanup(client):
    docs, convos = [], []
    yield docs, convos
    for did in docs:
        client.delete(f"{API}/documents/{did}", timeout=60)
    for cid in convos:
        client.delete(f"{API}/chat/conversations/{cid}", timeout=60)


# ---------- /api/tts (auth guard + synthesis + serving) ----------
class TestTTS:
    def test_tts_requires_auth(self):
        r = requests.post(f"{API}/tts", json={"text": "hello"}, timeout=30)
        assert r.status_code in (401, 403), r.text[:200]

    def test_tts_blank_text_400(self, client):
        r = client.post(f"{API}/tts", json={"text": "  **  "}, timeout=60)
        assert r.status_code == 400, r.text[:200]

    def test_tts_chat_reply_text_playable(self, client):
        """Simulates a chat assistant reply (markdown + doc tokens stripped by client)."""
        text = (
            "Here is one quick budgeting tip: track every expense for 30 days. "
            "Then set a 50/30/20 split across needs, wants and savings."
        )
        r = client.post(f"{API}/tts", json={"text": text}, timeout=180)
        assert r.status_code == 200, r.text[:300]
        url = r.json().get("url")
        assert url and url.startswith("/api/tts/") and url.endswith(".mp3")

        g = requests.get(f"{BASE_URL}{url}", timeout=120)
        assert g.status_code == 200, g.text[:200]
        assert g.headers.get("content-type") == "audio/mpeg"
        assert len(g.content) > 1024

        # cached: same text -> same key
        r2 = client.post(f"{API}/tts", json={"text": text}, timeout=180)
        assert r2.status_code == 200
        assert r2.json()["url"] == url

    def test_tts_markdown_is_cleaned(self, client):
        r = client.post(
            f"{API}/tts",
            json={"text": "**Bold** tip with a link https://example.com and `code`"},
            timeout=180,
        )
        assert r.status_code == 200, r.text[:300]
        assert r.json()["url"].endswith(".mp3")

    def test_tts_unknown_key_404(self):
        r = requests.get(f"{API}/tts/deadbeefdeadbeefdeadbeef.mp3", timeout=30)
        assert r.status_code == 404


# ---------- Money Insights + Listen payload ----------
class TestInsightsListen:
    def test_analyze_statement_then_tts(self, client, cleanup):
        docs, _ = cleanup
        files = {"file": ("TEST_it11_statement.csv", io.BytesIO(CSV.encode()), "text/csv")}
        up = client.post(f"{API}/documents/upload", files=files, timeout=180)
        assert up.status_code in (200, 201), up.text[:300]
        did = up.json().get("document_id")
        assert did
        docs.append(did)

        r = client.post(f"{API}/insights/statement", json={"document_id": did}, timeout=240)
        assert r.status_code == 200, r.text[:300]
        result = r.json().get("result")
        assert isinstance(result, dict), r.text[:300]
        assert "_id" not in r.json()
        assert result.get("summary")

        # exactly the string the UI builds for the Listen button
        text = ". ".join(
            [x for x in [
                "Here is your money insights summary.",
                result.get("summary"),
                "Recurring subscriptions: " + ", ".join(s.get("merchant", "") for s in (result.get("recurring") or [])),
                "Advice: " + ". ".join(result.get("advice") or []),
            ] if x]
        )
        t = client.post(f"{API}/tts", json={"text": text}, timeout=240)
        assert t.status_code == 200, t.text[:300]
        url = t.json()["url"]
        g = requests.get(f"{BASE_URL}{url}", timeout=180)
        assert g.status_code == 200 and g.headers.get("content-type") == "audio/mpeg"
        assert len(g.content) > 5000

    def test_insights_history_no_objectid(self, client):
        r = client.get(f"{API}/insights", timeout=60)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        for row in data:
            assert "_id" not in row


# ---------- Chat regression (streaming reply usable for Listen) ----------
class TestChatRegression:
    def test_chat_stream_reply_and_tts(self, client, cleanup):
        _, convos = cleanup
        c = client.post(f"{API}/chat/conversations", json={"title": "TEST_it11 voice"}, timeout=60)
        assert c.status_code in (200, 201), c.text[:300]
        cid = c.json()["conversation_id"]
        convos.append(cid)

        with client.post(
            f"{API}/chat/conversations/{cid}/message",
            json={"content": "Give me one quick budgeting tip"},
            stream=True,
            timeout=240,
        ) as resp:
            assert resp.status_code == 200, resp.text[:300]
            body = b"".join(resp.iter_content(chunk_size=1024)).decode("utf-8", "ignore")
        assert len(body.strip()) > 10, body[:300]

        msgs = client.get(f"{API}/chat/conversations/{cid}/messages", timeout=60)
        assert msgs.status_code == 200
        rows = msgs.json()
        assistant = [m for m in rows if m.get("role") == "assistant"]
        assert assistant, rows
        reply = assistant[-1].get("content") or ""
        assert reply.strip()
        assert all("_id" not in m for m in rows)

        t = client.post(f"{API}/tts", json={"text": reply}, timeout=240)
        assert t.status_code == 200, t.text[:300]
        g = requests.get(f"{BASE_URL}{t.json()['url']}", timeout=180)
        assert g.status_code == 200 and g.headers.get("content-type") == "audio/mpeg"
