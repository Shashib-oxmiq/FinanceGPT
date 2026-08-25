"""Iteration 8 backend tests:
- PRIVACY: chat grounding gated on document-intent keywords (select_relevant_docs)
- Grounding still works for document-referencing queries
- Loan checklist name-token matching (no false 'have' from a single identity doc)
- Regression: auth, shares lifecycle, public share unlock (right/wrong pw)
"""
import io
import os

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE = base_url.rstrip("/") + "/api"

CREDS = {"email": "demo@example.com", "password": "demo123"}

STMT = open("/app/test_reports/statement_qa.csv", "rb").read()
PASSPORT = open("/app/test_reports/passport_qa.txt", "rb").read()

PRIVATE_MARKERS = ["5200", "1850", "1620", "2199", "1550"]


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE}/auth/login", json=CREDS, timeout=60)
    if r.status_code != 200:
        pytest.fail(f"login failed {r.status_code}: {r.text[:300]}")
    token = r.json().get("token")
    assert token and isinstance(token, str)
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def created(client):
    bag = {"docs": [], "shares": [], "convs": []}
    yield bag
    for sid in bag["shares"]:
        client.delete(f"{BASE}/shares/{sid}", timeout=60)
    for cid in bag["convs"]:
        client.delete(f"{BASE}/chat/conversations/{cid}", timeout=60)
    for did in bag["docs"]:
        client.delete(f"{BASE}/documents/{did}", timeout=60)


@pytest.fixture(scope="module")
def vault_docs(client, created):
    out = {}
    for key, name, blob, ctype in [
        ("stmt", "TEST_it8_bank_statement.csv", STMT, "text/csv"),
        ("passport", "TEST_it8_passport.txt", PASSPORT, "text/plain"),
    ]:
        r = client.post(
            f"{BASE}/documents/upload",
            files={"file": (name, io.BytesIO(blob), ctype)},
            data={"category": "auto", "auto_classify": "true"},
            timeout=240,
        )
        assert r.status_code == 200, r.text[:400]
        d = r.json()
        assert "document_id" in d, d
        out[key] = d
        created["docs"].append(d["document_id"])
    return out


def ask(client, created, question):
    """Send a chat message and consume the SSE stream -> {content, sources}."""
    r = client.post(f"{BASE}/chat/conversations", json={"title": "TEST_it8"}, timeout=60)
    assert r.status_code == 200, r.text[:300]
    cid = r.json()["conversation_id"]
    created["convs"].append(cid)
    content, sources, err = "", [], None
    with client.post(
        f"{BASE}/chat/conversations/{cid}/message",
        json={"content": question}, stream=True, timeout=240,
    ) as m:
        assert m.status_code == 200, m.text[:400]
        for line in m.iter_lines(decode_unicode=True):
            if not line or not line.startswith("data: "):
                continue
            import json as _json
            evt = _json.loads(line[6:])
            if "delta" in evt:
                content += evt["delta"]
            if "sources" in evt:
                sources = evt["sources"]
            if "error" in evt:
                err = evt["error"]
    assert not err, f"stream error: {err}"
    assert content.strip(), "empty assistant response"
    return {"content": content, "sources": sources, "conversation_id": cid}


# ---------- documents upload ----------
class TestUpload:
    def test_docs_uploaded_and_listed(self, client, vault_docs):
        lst = client.get(f"{BASE}/documents", timeout=60)
        assert lst.status_code == 200
        ids = {x["document_id"] for x in lst.json()}
        for d in vault_docs.values():
            assert d["document_id"] in ids
        assert all("_id" not in x for x in lst.json())


# ---------- PRIVACY: no grounding for generic questions ----------
class TestChatPrivacy:
    @pytest.mark.parametrize("q", [
        "Tell me a fun fact about the ocean.",
        "What is compound interest?",
        "Who wrote Hamlet?",
    ])
    def test_generic_question_has_no_sources(self, client, created, vault_docs, q):
        res = ask(client, created, q)
        srcs = res.get("sources") or []
        assert srcs == [], f"generic question grounded docs: {srcs}"
        answer = res["content"]
        leaked = [m for m in PRIVATE_MARKERS if m in answer]
        assert not leaked, f"private figures leaked into generic answer: {leaked}"


# ---------- Grounding still works ----------
class TestChatGrounding:
    def test_statement_question_grounds(self, client, created, vault_docs):
        # FLAKY: sources are only emitted when the LLM echoes the [doc:ID] marker -> retry once.
        res = ask(client, created, "List the expenses in my bank statement")
        srcs = res.get("sources") or []
        if not srcs:
            res = ask(client, created, "List the expenses in my bank statement")
            srcs = res.get("sources") or []
        assert srcs, "document question returned no sources (no [doc:ID] citation emitted twice in a row)"
        names = " ".join(s.get("filename", "") for s in srcs)
        assert "statement" in names.lower(), names
        assert all("document_id" in s for s in srcs)

    def test_passport_question_grounds(self, client, created, vault_docs):
        res = ask(client, created, "How many visas are in my passport?")
        srcs = res.get("sources") or []
        assert srcs, "passport question returned no sources"
        names = " ".join(s.get("filename", "") for s in srcs).lower()
        assert "passport" in names, names


# ---------- Loan checklist matching ----------
class TestLoanChecklist:
    def test_no_false_have_from_identity_doc(self, client, created):
        # only an identity doc in the vault for this check + the statement/passport fixtures
        r = client.post(
            f"{BASE}/loans/checklist",
            json={"bank": "HDFC Bank", "loan_type": "Home Loan"},
            timeout=240,
        )
        assert r.status_code == 200, r.text[:400]
        data = r.json()
        items = data["items"]
        assert len(items) >= 5
        have = [i["name"] for i in items if i["status"] == "have"]
        total = len(items)
        assert len(have) < total, f"all items marked have: {have}"
        # Property / photograph / income-tax items must not be satisfied by an identity doc
        bad = [i["name"] for i in items if i["status"] == "have"
               and any(k in i["name"].lower() for k in ["photograph", "title deed", "property", "pan card", "aadhaar card", "income tax"])]
        assert not bad, f"false 'have' statuses from identity/statement docs: {bad}"
        for i in items:
            if i["status"] == "have":
                assert i["matched"], f"item {i['name']} have but no matched docs"


# ---------- Share regression ----------
class TestShares:
    def test_share_create_access_and_wrong_password(self, client, created, vault_docs):
        ids = [d["document_id"] for d in vault_docs.values()]
        r = client.post(f"{BASE}/shares", json={"name": "TEST_it8 share", "document_ids": ids}, timeout=60)
        assert r.status_code == 200, r.text[:300]
        s = r.json()
        created["shares"].append(s["share_id"])
        assert len(s["password"]) == 8 and s["password"].isdigit()
        assert s["count"] == len(ids)
        assert s["path"] == f"/share/{s['token']}"

        pub = requests.Session()
        bad = pub.post(f"{BASE}/shares/{s['token']}/access", json={"password": "00000000"}, timeout=60)
        assert bad.status_code == 403, bad.status_code
        ok = pub.post(f"{BASE}/shares/{s['token']}/access", json={"password": s["password"]}, timeout=60)
        assert ok.status_code == 200, ok.text[:300]
        body = ok.json()
        assert len(body["documents"]) == len(ids)

    def test_empty_share_rejected(self, client):
        r = client.post(f"{BASE}/shares", json={"name": "TEST_it8 empty", "document_ids": []}, timeout=60)
        assert r.status_code == 400


# ---------- Profile autofill regression ----------
class TestProfile:
    def test_profile_from_documents(self, client, vault_docs):
        r = client.post(f"{BASE}/profile/from-documents", json={}, timeout=240)
        assert r.status_code == 200, r.text[:400]
        data = r.json()
        assert isinstance(data, dict)
        assert "_id" not in data


# ---------- Auth regression ----------
class TestAuth:
    def test_me(self, client):
        r = client.get(f"{BASE}/auth/me", timeout=60)
        assert r.status_code == 200
        assert r.json()["email"] == CREDS["email"]

    def test_unauthorized(self):
        r = requests.get(f"{BASE}/documents", timeout=60)
        assert r.status_code in (401, 403)
