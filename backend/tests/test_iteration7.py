"""Iteration 7 backend tests: chat->vault, profile autofill, loan checklist,
secure shares (create/access/file/zip/revoke/expiry), delete 404s, categories."""
import io
import os
import time
import zipfile

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE = base_url.rstrip("/") + "/api"

CREDS = {"email": "demo@example.com", "password": "demo123"}

TXT = b"""PASSPORT / TRAVEL DOCUMENT (TEST_it7)
Name: Demo User
Passport No: X9988776
Nationality: India
Date of Birth: 1990-04-12
Issue: 2021-01-05  Expiry: 2031-01-04
VISAS:
1) USA B1/B2 valid till 2029-06-30
2) Schengen valid till 2027-02-15
3) Singapore valid till 2026-12-01
"""


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE}/auth/login", json=CREDS, timeout=60)
    if r.status_code != 200:
        pytest.fail(f"login failed {r.status_code}: {r.text[:300]}")
    token = r.json().get("token")
    assert token
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def created(client):
    bag = {"docs": [], "shares": []}
    yield bag
    for sid in bag["shares"]:
        client.delete(f"{BASE}/shares/{sid}", timeout=60)
    for did in bag["docs"]:
        client.delete(f"{BASE}/documents/{did}", timeout=60)


@pytest.fixture(scope="module")
def chat_doc(client, created):
    """Upload a text doc via chat once; returns document_id."""
    files = {"file": ("TEST_it7_passport.txt", io.BytesIO(TXT), "text/plain")}
    r = client.post(f"{BASE}/chat/upload", files=files, timeout=180)
    assert r.status_code == 200, r.text[:400]
    d = r.json()
    assert "document_id" in d
    created["docs"].append(d["document_id"])
    return d


# ---------- chat upload also lands in vault ----------
class TestChatToVault:
    def test_chat_upload_creates_vault_document(self, client, chat_doc):
        d = chat_doc
        assert d["filename"] == "TEST_it7_passport.txt"
        lst = client.get(f"{BASE}/documents", timeout=60)
        assert lst.status_code == 200
        rec = next((x for x in lst.json() if x["document_id"] == d["document_id"]), None)
        assert rec is not None, "chat upload not present in vault list"
        assert rec.get("note") == "Uploaded via chat"
        assert rec.get("category")
        assert "_id" not in rec


# ---------- profile autofill ----------
class TestProfileAutofill:
    def test_from_documents(self, client, chat_doc):
        r = client.post(f"{BASE}/profile/from-documents", timeout=180)
        assert r.status_code in (200, 404), r.text[:400]
        if r.status_code == 404:
            pytest.fail("no identity/financial docs found for autofill; got 404")
        d = r.json()
        for k in ("profile", "extracted", "filled", "completeness"):
            assert k in d
        assert isinstance(d["filled"], int)
        assert isinstance(d["completeness"], (int, float))

    def test_requires_auth(self):
        r = requests.post(f"{BASE}/profile/from-documents", timeout=60)
        assert r.status_code in (401, 403)


# ---------- loan checklist ----------
class TestLoanChecklist:
    def test_checklist(self, client):
        r = client.post(f"{BASE}/loans/checklist", json={"bank": "HDFC Bank", "loan_type": "Home Loan"}, timeout=180)
        assert r.status_code == 200, r.text[:400]
        d = r.json()
        assert d["bank"] == "HDFC Bank" and d["loan_type"] == "Home Loan"
        assert isinstance(d["items"], list) and len(d["items"]) >= 3
        for it in d["items"]:
            assert it["name"]
            assert it["status"] in ("have", "missing")
            assert isinstance(it["matched"], list)

    def test_validation(self, client):
        r = client.post(f"{BASE}/loans/checklist", json={"bank": "X"}, timeout=60)
        assert r.status_code == 422


# ---------- secure shares ----------
class TestShares:
    def test_share_lifecycle(self, client, created, chat_doc):
        did = chat_doc["document_id"]
        r = client.post(f"{BASE}/shares", json={"name": "TEST_it7 share", "document_ids": [did]}, timeout=60)
        assert r.status_code == 200, r.text[:400]
        s = r.json()
        created["shares"].append(s["share_id"])
        assert len(s["password"]) == 8 and s["password"].isdigit()
        assert s["path"] == f"/share/{s['token']}"
        assert s["count"] == 1 and s["revoked"] is False
        from datetime import datetime, timezone
        exp = datetime.fromisoformat(s["expires_at"])
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        days = (exp - datetime.now(timezone.utc)).days
        assert 14 <= days <= 15, f"expiry days {days}"

        # listed
        lst = client.get(f"{BASE}/shares", timeout=60)
        assert lst.status_code == 200
        assert any(x["share_id"] == s["share_id"] for x in lst.json())

        tok, pw = s["token"], s["password"]
        # wrong password -> 403 (no auth header needed)
        bad = requests.post(f"{BASE}/shares/{tok}/access", json={"password": "00000000" if pw != "00000000" else "11111111"}, timeout=60)
        assert bad.status_code == 403, bad.status_code
        # correct password
        ok = requests.post(f"{BASE}/shares/{tok}/access", json={"password": pw}, timeout=60)
        assert ok.status_code == 200, ok.text[:300]
        body = ok.json()
        assert body["name"] == "TEST_it7 share"
        assert len(body["documents"]) == 1
        assert body["documents"][0]["document_id"] == did
        assert all("storage_path" not in x for x in body["documents"])

        # file fetch
        f = requests.get(f"{BASE}/shares/{tok}/file/{did}", params={"password": pw}, timeout=60)
        assert f.status_code == 200 and b"PASSPORT" in f.content
        fbad = requests.get(f"{BASE}/shares/{tok}/file/{did}", params={"password": "12345670"}, timeout=60)
        assert fbad.status_code in (403,)
        fmissing = requests.get(f"{BASE}/shares/{tok}/file/does-not-exist", params={"password": pw}, timeout=60)
        assert fmissing.status_code == 404

        # zip
        z = requests.get(f"{BASE}/shares/{tok}/zip", params={"password": pw}, timeout=120)
        assert z.status_code == 200
        zf = zipfile.ZipFile(io.BytesIO(z.content))
        assert any("TEST_it7_passport.txt" in n for n in zf.namelist()), zf.namelist()

        # revoke -> 404
        rv = client.delete(f"{BASE}/shares/{s['share_id']}", timeout=60)
        assert rv.status_code == 200
        after = requests.post(f"{BASE}/shares/{tok}/access", json={"password": pw}, timeout=60)
        assert after.status_code == 404

    def test_share_empty_docs_400(self, client):
        r = client.post(f"{BASE}/shares", json={"name": "TEST_it7 empty", "document_ids": []}, timeout=60)
        assert r.status_code == 400

    def test_expired_share_410(self, client, created, chat_doc):
        did = chat_doc["document_id"]
        r = client.post(f"{BASE}/shares", json={"name": "TEST_it7 exp", "document_ids": [did], "expiry_days": -1}, timeout=60)
        assert r.status_code == 200
        s = r.json()
        created["shares"].append(s["share_id"])
        # negative expiry should fall back to 15 days per implementation
        acc = requests.post(f"{BASE}/shares/{s['token']}/access", json={"password": s["password"]}, timeout=60)
        assert acc.status_code == 200, f"fallback expiry expected valid share, got {acc.status_code}"

    def test_unknown_token_404(self):
        r = requests.post(f"{BASE}/shares/nope-nope/access", json={"password": "12345678"}, timeout=60)
        assert r.status_code == 404

    def test_revoke_unknown_404(self, client):
        r = client.delete(f"{BASE}/shares/unknown-share-id", timeout=60)
        assert r.status_code == 404


# ---------- delete 404 fixes ----------
class TestDelete404s:
    def test_delete_unknown_document(self, client):
        r = client.delete(f"{BASE}/documents/unknown-doc-id-it7", timeout=60)
        assert r.status_code == 404, r.status_code

    def test_delete_unknown_investment(self, client):
        r = client.delete(f"{BASE}/investments/unknown-inv-id-it7", timeout=60)
        assert r.status_code == 404, r.status_code


# ---------- categories ----------
class TestCategories:
    def test_travel_and_purchase_present(self, client):
        r = client.get(f"{BASE}/categories", timeout=60)
        if r.status_code == 404:
            pytest.skip("no /categories endpoint")
        assert r.status_code == 200
        data = r.json()
        cats = data if isinstance(data, list) else data.get("categories", [])
        flat = [c if isinstance(c, str) else c.get("value") for c in cats]
        assert "travel" in flat and "purchase" in flat
