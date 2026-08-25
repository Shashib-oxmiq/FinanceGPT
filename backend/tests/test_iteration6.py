"""Iteration 6 backend tests: multi-upload/auto-classify, doc-grounded chat with [doc:ID] +
sources SSE event, document preview/download, Investments CRUD, plain-chat regression."""
import io
import json
import os
import re

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE = base_url.rstrip("/") + "/api"

CREDS = {"email": "demo@example.com", "password": "demo123"}

PASSPORT = open("/app/test_reports/passport_qa.txt", "rb").read()
STATEMENT = open("/app/test_reports/statement_qa.csv", "rb").read()


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE}/auth/login", json=CREDS, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"Login failed {r.status_code}: {r.text[:300]}")
    token = r.json().get("token")
    assert isinstance(token, str) and token
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def uploaded(client):
    """Upload the two fixtures with auto-detect; cleaned up at module teardown."""
    ids = {}
    for key, name, blob, ctype in [
        ("passport", "TEST_passport_qa.txt", PASSPORT, "text/plain"),
        ("statement", "TEST_statement_qa.csv", STATEMENT, "text/csv"),
    ]:
        r = client.post(
            f"{BASE}/documents/upload",
            files={"file": (name, io.BytesIO(blob), ctype)},
            data={"category": "auto", "auto_classify": "true"},
            timeout=180,
        )
        assert r.status_code == 200, f"{name} upload failed {r.status_code}: {r.text[:300]}"
        ids[key] = r.json()
    yield ids
    for d in ids.values():
        client.delete(f"{BASE}/documents/{d['document_id']}", timeout=30)


class TestUploadAutoClassify:
    """POST /api/documents/upload with category=auto&auto_classify=true"""

    def test_auto_classify_metadata(self, uploaded):
        p = uploaded["passport"]
        assert p["category"] in ("identity", "immigration", "other"), p["category"]
        assert p["auto_classified"] is True
        assert "_id" not in p and "storage_path" not in p
        md = p.get("metadata") or {}
        assert isinstance(md, dict) and md, "metadata missing for passport"
        for k in ("title", "doc_type", "issuer", "summary"):
            assert k in md, f"metadata.{k} missing"
        assert md["summary"], "metadata.summary empty"

        s = uploaded["statement"]
        assert s["category"] in ("bank_statement", "credit_card_statement", "financial", "other"), s["category"]
        assert (s.get("metadata") or {}).get("summary")

    def test_both_docs_listed(self, client, uploaded):
        r = client.get(f"{BASE}/documents", timeout=30)
        assert r.status_code == 200
        listed = {d["document_id"] for d in r.json()}
        for d in uploaded.values():
            assert d["document_id"] in listed
        assert all("_id" not in d and "storage_path" not in d for d in r.json())

    def test_download_returns_content(self, client, uploaded):
        did = uploaded["passport"]["document_id"]
        r = client.get(f"{BASE}/documents/{did}/download", timeout=60)
        assert r.status_code == 200
        assert b"Z1234567" in r.content

    def test_download_unknown_doc_404(self, client):
        r = client.get(f"{BASE}/documents/does-not-exist/download", timeout=30)
        assert r.status_code == 404


def _stream_chat(client, conv_id, content, model="claude"):
    """Returns (full_text, sources) from the SSE stream."""
    full, sources = "", None
    with client.post(
        f"{BASE}/chat/conversations/{conv_id}/message",
        json={"content": content, "model": model, "attachments": []},
        stream=True, timeout=240,
    ) as r:
        assert r.status_code == 200, f"stream failed {r.status_code}: {r.text[:300]}"
        for raw in r.iter_lines(decode_unicode=True):
            if not raw or not raw.startswith("data: "):
                continue
            evt = json.loads(raw[6:])
            if "delta" in evt:
                full += evt["delta"]
            elif "sources" in evt:
                sources = evt["sources"]
            elif "error" in evt:
                pytest.fail(f"AI error event: {evt['error']}")
    return full, sources


class TestGroundedChat:
    """Doc-grounded chat: citations, line quoting, sources SSE event, persistence."""

    @pytest.fixture(scope="class")
    def conv(self, client):
        r = client.post(f"{BASE}/chat/conversations", json={"title": "TEST_grounded"}, timeout=30)
        assert r.status_code == 200
        cid = r.json()["conversation_id"]
        yield cid
        client.delete(f"{BASE}/chat/conversations/{cid}", timeout=30)

    def test_visa_query_cites_passport(self, client, uploaded, conv):
        text, sources = _stream_chat(
            client, conv, "How many visas do I have in my passport? List each with dates."
        )
        assert text.strip(), "empty assistant reply"
        assert sources, f"no sources event emitted. reply={text[:400]}"
        ids = [s["document_id"] for s in sources]
        assert uploaded["passport"]["document_id"] in ids, sources
        assert re.search(r"\[doc:[^\]]+\]", text), "no inline [doc:ID] marker in reply"
        low = text.lower()
        hits = sum(1 for k in ("us99881", "uk55221", "fr11009") if k in low)
        assert hits >= 2, f"exact visa lines not quoted (hits={hits}): {text[:600]}"
        for s in sources:
            assert set(s) >= {"document_id", "filename", "category", "content_type"}

    def test_sources_persisted_on_message(self, client, uploaded, conv):
        r = client.get(f"{BASE}/chat/conversations/{conv}/messages", timeout=30)
        assert r.status_code == 200
        msgs = r.json()
        assistant = [m for m in msgs if m["role"] == "assistant"]
        assert assistant, "assistant message not persisted"
        assert any(m.get("sources") for m in assistant), "sources not persisted on message"

    def test_statement_threshold_query(self, client, uploaded, conv):
        text, sources = _stream_chat(
            client, conv, "Show me all expenses bigger than 1500 from my bank statement"
        )
        assert text.strip()
        assert sources, f"no sources for statement query. reply={text[:400]}"
        assert uploaded["statement"]["document_id"] in [s["document_id"] for s in sources]
        low = text.lower()
        matched = sum(1 for k in ("1850", "2199", "1620", "1550") if k in low)
        assert matched >= 3, f"expected matching rows quoted (matched={matched}): {text[:600]}"
        assert "8.75" not in low, "quoted a row below the threshold"


class TestPlainChatRegression:
    """A question unrelated to vault docs must stream a reply with NO sources."""

    def test_no_sources_for_generic_question(self, client):
        r = client.post(f"{BASE}/chat/conversations", json={"title": "TEST_plain"}, timeout=30)
        cid = r.json()["conversation_id"]
        try:
            text, sources = _stream_chat(client, cid, "Briefly, what is compound interest?")
            assert text.strip(), "empty reply on plain chat"
            assert not sources, f"unexpected sources on plain chat: {sources}"
        finally:
            client.delete(f"{BASE}/chat/conversations/{cid}", timeout=30)


class TestInvestments:
    """Investments CRUD + summary math."""

    def test_meta_types(self, client):
        r = client.get(f"{BASE}/investments/meta", timeout=30)
        assert r.status_code == 200
        types = r.json()["types"]
        assert isinstance(types, list) and "stock" in types

    def test_crud_and_summary(self, client):
        base = client.get(f"{BASE}/investments/summary", timeout=30).json()
        payload = {
            "name": "TEST_Nifty Index Fund", "asset_type": "mutual_fund",
            "amount_invested": 10000, "current_value": 12500,
            "purchase_date": "2025-01-01", "notes": "TEST",
        }
        r = client.post(f"{BASE}/investments", json=payload, timeout=30)
        assert r.status_code == 200, r.text[:300]
        inv = r.json()
        assert "_id" not in inv
        iid = inv["investment_id"]
        try:
            assert inv["name"] == payload["name"]
            assert float(inv["amount_invested"]) == 10000
            lst = client.get(f"{BASE}/investments", timeout=30).json()
            assert iid in [i["investment_id"] for i in lst]

            s = client.get(f"{BASE}/investments/summary", timeout=30).json()
            assert round(s["total_invested"] - base.get("total_invested", 0), 2) == 10000
            assert round(s["total_current"] - base.get("total_current", 0), 2) == 12500
            assert "roi_pct" in s and "net_worth" in s

            u = client.put(f"{BASE}/investments/{iid}", json={"current_value": 15000}, timeout=30)
            assert u.status_code == 200
            got = [i for i in client.get(f"{BASE}/investments", timeout=30).json()
                   if i["investment_id"] == iid][0]
            assert float(got["current_value"]) == 15000
        finally:
            d = client.delete(f"{BASE}/investments/{iid}", timeout=30)
            assert d.status_code in (200, 204)
        after = client.get(f"{BASE}/investments", timeout=30).json()
        assert iid not in [i["investment_id"] for i in after]

    def test_delete_unknown_investment_404(self, client):
        r = client.delete(f"{BASE}/investments/nope-123", timeout=30)
        assert r.status_code == 404


class TestAuthGuards:
    def test_documents_requires_auth(self):
        r = requests.get(f"{BASE}/documents", timeout=30)
        assert r.status_code in (401, 403)

    def test_investments_requires_auth(self):
        r = requests.get(f"{BASE}/investments", timeout=30)
        assert r.status_code in (401, 403)
