"""Iteration 5 backend tests: document auto-classification + multi-upload, Investments CRUD."""
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


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE}/auth/login", json=CREDS, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"Login failed {r.status_code}: {r.text[:300]}")
    token = r.json().get("token")
    assert token
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


# ---------------- Documents: auto classification ----------------
BANK_TXT = (
    "BANK STATEMENT\nGlobal Trust Bank\nAccount Number: 1234567890\n"
    "Statement Period: 01 Jan 2026 - 31 Jan 2026\n"
    "Date        Description            Amount\n"
    "02 Jan 2026 Salary Credit         5000.00\n"
    "05 Jan 2026 Grocery Store          -82.40\n"
    "12 Jan 2026 Rent Payment         -1800.00\n"
    "Closing Balance: 3117.60\n"
)


def _upload(client, name, content, category="auto", auto=True):
    files = {"file": (name, io.BytesIO(content.encode()), "text/plain")}
    data = {"category": category, "auto_classify": "true" if auto else "false"}
    return client.post(f"{BASE}/documents/upload", files=files, data=data, timeout=180)


@pytest.fixture(scope="module")
def created_docs():
    return []


@pytest.fixture(scope="module", autouse=True)
def cleanup(client, created_docs):
    yield
    for d in created_docs:
        client.delete(f"{BASE}/documents/{d}", timeout=30)


def test_upload_auto_classify_bank_statement(client, created_docs):
    r = _upload(client, "TEST_bank_statement.txt", BANK_TXT)
    assert r.status_code == 200, r.text[:400]
    doc = r.json()
    created_docs.append(doc["document_id"])
    assert "_id" not in doc and "storage_path" not in doc
    assert doc["auto_classified"] is True
    assert doc["category"] not in (None, "", "auto")
    md = doc.get("metadata") or {}
    assert isinstance(md, dict) and md.get("summary"), f"no metadata summary: {md}"
    for k in ["title", "doc_type", "issuer", "date", "identifiers", "summary"]:
        assert k in md, f"missing metadata key {k}: {md}"
    # persistence check
    lst = client.get(f"{BASE}/documents", timeout=30).json()
    found = [x for x in lst if x["document_id"] == doc["document_id"]]
    assert found, "uploaded doc not returned by GET /documents"
    assert found[0]["category"] == doc["category"]
    assert found[0]["metadata"].get("summary") == md.get("summary")
    print("classified category:", doc["category"], "| summary:", md.get("summary"))


def test_upload_explicit_category_overrides(client, created_docs):
    r = _upload(client, "TEST_explicit.txt", BANK_TXT, category="identity", auto=False)
    assert r.status_code == 200, r.text[:400]
    doc = r.json()
    created_docs.append(doc["document_id"])
    assert doc["category"] == "identity"
    assert doc["auto_classified"] is False


def test_upload_explicit_category_with_auto_classify_true(client, created_docs):
    """Explicit category must win even if auto_classify flag is true."""
    r = _upload(client, "TEST_explicit2.txt", BANK_TXT, category="identity", auto=True)
    assert r.status_code == 200, r.text[:400]
    doc = r.json()
    created_docs.append(doc["document_id"])
    assert doc["category"] == "identity"


def test_sequential_multi_upload(client, created_docs):
    """Frontend uploads N files sequentially; each must succeed independently."""
    ids = []
    for i in range(3):
        r = _upload(client, f"TEST_multi_{i}.txt", f"INVOICE\nInvoice No: INV-{i}\nTotal: 100.00\n")
        assert r.status_code == 200, r.text[:300]
        ids.append(r.json()["document_id"])
        created_docs.append(r.json()["document_id"])
    lst = client.get(f"{BASE}/documents", timeout=30).json()
    listed = {x["document_id"] for x in lst}
    assert set(ids).issubset(listed), "not all sequentially uploaded docs persisted"


def test_documents_categories(client):
    r = client.get(f"{BASE}/documents/categories", timeout=30)
    assert r.status_code == 200
    cats = r.json()["categories"]
    assert isinstance(cats, list) and len(cats) > 5
    assert "auto" not in cats


def test_upload_requires_auth():
    r = requests.post(
        f"{BASE}/documents/upload",
        files={"file": ("x.txt", io.BytesIO(b"hi"), "text/plain")},
        data={"category": "other", "auto_classify": "false"},
        timeout=60,
    )
    assert r.status_code in (401, 403), r.status_code


# ---------------- Investments ----------------
class TestInvestments:
    def test_meta(self, client):
        r = client.get(f"{BASE}/investments/meta", timeout=30)
        assert r.status_code == 200
        types = r.json()["types"]
        assert "stock" in types and isinstance(types, list)

    def test_crud_and_summary(self, client):
        before = client.get(f"{BASE}/investments/summary", timeout=30).json()
        payload = {
            "name": "TEST_Acme Stock",
            "asset_type": "stock",
            "amount_invested": 1000,
            "current_value": 1250,
            "purchase_date": "2026-01-01",
            "notes": "qa",
        }
        r = client.post(f"{BASE}/investments", json=payload, timeout=30)
        assert r.status_code == 200, r.text[:300]
        inv = r.json()
        assert "_id" not in inv
        iid = inv["investment_id"]
        assert inv["name"] == payload["name"]
        assert inv["amount_invested"] == 1000 and inv["current_value"] == 1250

        # GET list persistence
        lst = client.get(f"{BASE}/investments", timeout=30).json()
        got = [x for x in lst if x["investment_id"] == iid]
        assert got and got[0]["asset_type"] == "stock"
        assert all("_id" not in x for x in lst)

        # summary math
        s = client.get(f"{BASE}/investments/summary", timeout=30).json()
        assert s["count"] == before["count"] + 1
        assert round(s["total_invested"] - before["total_invested"], 2) == 1000.0
        assert round(s["total_current"] - before["total_current"], 2) == 1250.0
        assert s["net_worth"] == s["total_current"]
        assert round(s["total_gain"], 2) == round(s["total_current"] - s["total_invested"], 2)

        # update
        u = client.put(f"{BASE}/investments/{iid}", json={"current_value": 1500}, timeout=30)
        assert u.status_code == 200, u.text[:300]
        assert u.json()["current_value"] == 1500
        again = [x for x in client.get(f"{BASE}/investments", timeout=30).json() if x["investment_id"] == iid]
        assert again[0]["current_value"] == 1500

        # delete
        d = client.delete(f"{BASE}/investments/{iid}", timeout=30)
        assert d.status_code == 200
        lst2 = client.get(f"{BASE}/investments", timeout=30).json()
        assert not [x for x in lst2 if x["investment_id"] == iid]

    def test_update_nonexistent_returns_404(self, client):
        r = client.put(f"{BASE}/investments/does-not-exist", json={"name": "x"}, timeout=30)
        assert r.status_code == 404

    def test_delete_nonexistent(self, client):
        """Documenting behaviour: delete of unknown id."""
        r = client.delete(f"{BASE}/investments/does-not-exist", timeout=30)
        assert r.status_code in (200, 404), r.status_code

    def test_validation_missing_name(self, client):
        r = client.post(f"{BASE}/investments", json={"asset_type": "stock"}, timeout=30)
        assert r.status_code == 422

    def test_requires_auth(self):
        for path in ["/investments", "/investments/summary", "/investments/meta"]:
            r = requests.get(f"{BASE}{path}", timeout=30)
            assert r.status_code in (401, 403), f"{path} -> {r.status_code}"
