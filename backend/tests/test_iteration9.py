"""Iteration 9 backend tests:
- LOAN PREP: employment_type + purchase_type inputs, sectioned checklist (4 sections, 12-25 items)
- FALSE-HAVE REDUCED: single passport/identity doc must not satisfy PAN/property/photograph items
- SOURCE TRANSPARENCY: doc-referencing chat questions reliably return sources (docs actually read)
- PRIVACY: generic questions still return no sources and no private figures
- REGRESSION: auth, share create/access (wrong+right password), zip download
"""
import io
import json as _json
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
SECTIONS = ["Identity & KYC", "Income Documents", "Property Documents", "Other Requirements"]


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


def _upload(client, created, name, blob, ctype):
    r = client.post(
        f"{BASE}/documents/upload",
        files={"file": (name, io.BytesIO(blob), ctype)},
        data={"category": "auto", "auto_classify": "true"},
        timeout=240,
    )
    assert r.status_code == 200, r.text[:400]
    d = r.json()
    assert "document_id" in d and "_id" not in d, d
    created["docs"].append(d["document_id"])
    return d


@pytest.fixture(scope="module")
def passport_doc(client, created):
    return _upload(client, created, "TEST_it9_passport.txt", PASSPORT, "text/plain")


@pytest.fixture(scope="module")
def stmt_doc(client, created):
    return _upload(client, created, "TEST_it9_bank_statement.csv", STMT, "text/csv")


def ask(client, created, question):
    r = client.post(f"{BASE}/chat/conversations", json={"title": "TEST_it9"}, timeout=60)
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


# ---------- LOAN PREP: sectioned checklist ----------
class TestLoanChecklistSections:
    @pytest.fixture(scope="class")
    def checklist(self, client, passport_doc):
        r = client.post(
            f"{BASE}/loans/checklist",
            json={"bank": "HDFC Bank", "loan_type": "Home Loan",
                  "employment_type": "Salaried", "purchase_type": "New home"},
            timeout=300,
        )
        assert r.status_code == 200, r.text[:400]
        return r.json()

    def test_echoes_inputs_and_item_count(self, checklist):
        assert checklist["bank"] == "HDFC Bank"
        assert checklist["loan_type"] == "Home Loan"
        assert checklist["employment_type"] == "Salaried"
        assert checklist["purchase_type"] == "New home"
        items = checklist["items"]
        assert 12 <= len(items) <= 25, f"expected 12-25 items, got {len(items)}"

    def test_all_four_sections_present(self, checklist):
        secs = {i.get("section") for i in checklist["items"]}
        for s in SECTIONS:
            assert s in secs, f"missing section {s}; got {secs}"
        assert secs <= set(SECTIONS), f"unexpected section values: {secs - set(SECTIONS)}"

    def test_item_shape(self, checklist):
        for i in checklist["items"]:
            assert isinstance(i["name"], str) and i["name"].strip()
            assert i["status"] in ("have", "missing")
            assert isinstance(i["required"], bool)
            assert isinstance(i["matched"], list)
            if i["status"] == "have":
                assert i["matched"], f"'have' with no matched docs: {i['name']}"

    def test_salaried_income_docs_tailored(self, checklist):
        income = " ".join(i["name"].lower() for i in checklist["items"]
                          if i.get("section") == "Income Documents")
        assert any(k in income for k in ["salary", "form 16", "form-16", "payslip", "pay slip"]), income

    def test_false_have_reduced(self, checklist):
        items = checklist["items"]
        have = [i["name"] for i in items if i["status"] == "have"]
        assert len(have) <= 4, f"too many 'have' with only a passport doc: {have}"
        bad = [n for n in have if any(k in n.lower() for k in
               ["pan card", "photograph", "title deed", "sale deed", "property",
                "income tax", "aadhaar card", "salary"])]
        assert not bad, f"false 'You have this': {bad}"

    def test_self_employed_variant(self, client, passport_doc):
        r = client.post(
            f"{BASE}/loans/checklist",
            json={"bank": "HDFC Bank", "loan_type": "Home Loan",
                  "employment_type": "Self-Employed Professional", "purchase_type": "Resale home"},
            timeout=300,
        )
        assert r.status_code == 200, r.text[:400]
        data = r.json()
        income = " ".join(i["name"].lower() for i in data["items"]
                          if i.get("section") == "Income Documents")
        assert any(k in income for k in ["itr", "income tax", "balance sheet", "profit", "p&l"]), income


# ---------- SOURCE TRANSPARENCY ----------
class TestChatSources:
    def test_statement_question_has_sources(self, client, created, stmt_doc):
        res = ask(client, created, "List the expenses in my bank statement")
        srcs = res["sources"]
        assert srcs, "document question returned no sources"
        assert all("document_id" in s and "filename" in s for s in srcs), srcs
        assert "statement" in " ".join(s["filename"] for s in srcs).lower()

    def test_passport_question_has_sources(self, client, created, passport_doc):
        res = ask(client, created, "How many visas are in my passport?")
        srcs = res["sources"]
        assert srcs, "passport question returned no sources"
        assert "passport" in " ".join(s["filename"] for s in srcs).lower()


# ---------- PRIVACY ----------
class TestChatPrivacy:
    @pytest.mark.parametrize("q", [
        "Tell me a fun fact about the ocean.",
        "What is compound interest?",
    ])
    def test_generic_question_no_sources(self, client, created, stmt_doc, passport_doc, q):
        res = ask(client, created, q)
        assert res["sources"] == [], f"generic question grounded docs: {res['sources']}"
        leaked = [m for m in PRIVATE_MARKERS if m in res["content"]]
        assert not leaked, f"private figures leaked: {leaked}"


# ---------- SHARES regression ----------
class TestShares:
    def test_share_lifecycle(self, client, created, passport_doc, stmt_doc):
        ids = [passport_doc["document_id"], stmt_doc["document_id"]]
        r = client.post(f"{BASE}/shares", json={"name": "TEST_it9 share", "document_ids": ids,
                                                "expiry_days": 15}, timeout=60)
        assert r.status_code == 200, r.text[:300]
        s = r.json()
        created["shares"].append(s["share_id"])
        assert len(s["password"]) == 8 and s["password"].isdigit()
        assert s["count"] == 2 and s["path"] == f"/share/{s['token']}"

        pub = requests.Session()
        assert pub.post(f"{BASE}/shares/{s['token']}/access",
                        json={"password": "00000000"}, timeout=60).status_code == 403
        ok = pub.post(f"{BASE}/shares/{s['token']}/access",
                      json={"password": s["password"]}, timeout=60)
        assert ok.status_code == 200, ok.text[:300]
        assert len(ok.json()["documents"]) == 2

        z = pub.get(f"{BASE}/shares/{s['token']}/zip", params={"password": s["password"]}, timeout=120)
        assert z.status_code == 200 and z.content[:2] == b"PK", z.status_code

    def test_empty_share_rejected(self, client):
        r = client.post(f"{BASE}/shares", json={"name": "TEST_it9 empty", "document_ids": []}, timeout=60)
        assert r.status_code == 400


# ---------- AUTH regression ----------
class TestAuth:
    def test_me(self, client):
        r = client.get(f"{BASE}/auth/me", timeout=60)
        assert r.status_code == 200 and r.json()["email"] == CREDS["email"]

    def test_unauthorized(self):
        assert requests.get(f"{BASE}/documents", timeout=60).status_code in (401, 403)
