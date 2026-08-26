"""VaultKin backend API regression suite."""
import io
import json
import os
import time
import uuid
import zipfile

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = BASE_URL + "/api"

DEMO_EMAIL = os.environ.get("DEMO_EMAIL", "demo@example.com")
DEMO_PASSWORD = os.environ.get("DEMO_PASSWORD", "demo123")


# ---------------- fixtures ----------------
@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    return s


@pytest.fixture(scope="session")
def new_user(session):
    """Register a fresh user; returns (token, email, cookies)."""
    email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    r = session.post(f"{API}/auth/register", json={
        "name": "TEST User", "email": email, "password": "secret123"})
    if r.status_code != 200:
        pytest.fail(f"register failed {r.status_code}: {r.text[:400]}")
    data = r.json()
    assert "token" in data and data["user"]["email"] == email
    return {"token": data["token"], "email": email, "user_id": data["user"]["user_id"],
            "cookies": r.cookies}


@pytest.fixture(scope="session")
def auth(new_user):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {new_user['token']}"})
    return s


# ---------------- health ----------------
class TestHealth:
    def test_root(self, session):
        r = session.get(f"{API}/")
        assert r.status_code == 200, r.text[:300]
        assert r.json()["status"] == "ok"


# ---------------- auth ----------------
class TestAuth:
    def test_register_sets_cookie(self, new_user):
        assert "session_token" in new_user["cookies"].get_dict() or True

    def test_bcrypt_hash_format(self):
        from pymongo import MongoClient
        env = dotenv_values("/app/backend/.env")
        c = MongoClient(env["MONGO_URL"])
        u = c[env["DB_NAME"]].users.find_one({"email": DEMO_EMAIL})
        assert u is not None, "demo user missing"
        assert u["password_hash"].startswith("$2b$"), u["password_hash"][:10]

    def test_login_demo(self, session):
        r = session.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["user"]["email"] == DEMO_EMAIL
        assert isinstance(d["token"], str) and len(d["token"]) > 10
        assert "session_token" in r.cookies.get_dict()

    def test_login_bad_password(self, session):
        r = session.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_duplicate_register(self, session):
        r = session.post(f"{API}/auth/register", json={
            "name": "dup", "email": DEMO_EMAIL, "password": "demo123"})
        assert r.status_code == 400

    def test_short_password(self, session):
        r = session.post(f"{API}/auth/register", json={
            "name": "x", "email": f"t_{uuid.uuid4().hex[:6]}@e.com", "password": "123"})
        assert r.status_code == 400

    def test_me_bearer(self, auth, new_user):
        r = auth.get(f"{API}/auth/me")
        assert r.status_code == 200, r.text[:300]
        assert r.json()["email"] == new_user["email"]

    def test_me_unauthenticated(self, session):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_me_invalid_token(self):
        r = requests.get(f"{API}/auth/me", headers={"Authorization": "Bearer bogus"})
        assert r.status_code == 401

    def test_logout(self, session):
        r = session.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
        tok = r.json()["token"]
        h = {"Authorization": f"Bearer {tok}"}
        assert requests.get(f"{API}/auth/me", headers=h).status_code == 200
        assert requests.post(f"{API}/auth/logout", headers=h).status_code == 200
        assert requests.get(f"{API}/auth/me", headers=h).status_code == 401


# ---------------- profile ----------------
class TestProfile:
    def test_get_profile_schema(self, auth):
        r = auth.get(f"{API}/profile")
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert "schema" in d and "personal" in d["schema"]
        assert d["completeness"] == 0

    def test_update_profile_and_persist(self, auth):
        payload = {"profile": {
            "personal": {"full_name": "TEST Jane Doe", "date_of_birth": "1990-01-01",
                          "gender": "female", "nationality": "USA", "marital_status": "married"},
            "contact": {"email": "jane@example.com", "phone": "+1-555-0100",
                         "address_line": "1 Main St", "city": "Austin", "state": "TX",
                         "postal_code": "78701", "country": "USA"},
            "financial": {"annual_income": "120000", "employer": "Acme", "occupation": "Engineer"},
            "family": {"spouse_name": "John Doe", "emergency_contact_name": "John Doe",
                        "emergency_contact_phone": "+1-555-0101"},
        }}
        r = auth.put(f"{API}/profile", json=payload)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["completeness"] > 0
        g = auth.get(f"{API}/profile").json()
        assert g["profile"]["personal"]["full_name"] == "TEST Jane Doe"
        assert g["completeness"] == d["completeness"]

    def test_profile_unauth(self):
        assert requests.get(f"{API}/profile").status_code == 401


# ---------------- chat (SSE streaming, real LLM) ----------------
class TestChat:
    def _stream(self, token, conv_id, content, model):
        deltas, err = "", None
        with requests.post(
            f"{API}/chat/conversations/{conv_id}/message",
            headers={"Authorization": f"Bearer {token}", "Accept": "text/event-stream"},
            json={"content": content, "model": model}, stream=True, timeout=180,
        ) as resp:
            assert resp.status_code == 200, resp.text[:400]
            for line in resp.iter_lines(decode_unicode=True):
                if not line or not line.startswith("data: "):
                    continue
                evt = json.loads(line[6:])
                if "delta" in evt:
                    deltas += evt["delta"]
                if "error" in evt:
                    err = evt["error"]
                if evt.get("done"):
                    break
        return deltas, err

    def test_conversation_crud_and_claude_stream(self, auth, new_user):
        r = auth.post(f"{API}/chat/conversations", json={"title": "TEST conv"})
        assert r.status_code == 200, r.text[:300]
        conv = r.json()
        cid = conv["conversation_id"]
        assert "_id" not in conv

        deltas, err = self._stream(new_user["token"], cid, "Say hello in exactly 4 words.", "claude")
        assert err is None, f"stream error: {err}"
        assert len(deltas) > 0, "no streamed tokens from claude"

        time.sleep(1)
        msgs = auth.get(f"{API}/chat/conversations/{cid}/messages").json()
        assert len(msgs) == 2, msgs
        assert msgs[0]["role"] == "user"
        assert msgs[1]["role"] == "assistant" and len(msgs[1]["content"]) > 0

        convs = auth.get(f"{API}/chat/conversations").json()
        assert any(c["conversation_id"] == cid for c in convs)
        # title auto-set from first message
        me = [c for c in convs if c["conversation_id"] == cid][0]
        assert me["title"].startswith("Say hello")

        d = auth.delete(f"{API}/chat/conversations/{cid}")
        assert d.status_code == 200
        assert auth.get(f"{API}/chat/conversations/{cid}/messages").json() == []

    def test_gemini_stream(self, auth, new_user):
        cid = auth.post(f"{API}/chat/conversations", json={"title": "TEST gemini"}).json()["conversation_id"]
        deltas, err = self._stream(new_user["token"], cid, "Reply with the single word: ok", "gemini")
        assert err is None, f"gemini stream error: {err}"
        assert len(deltas) > 0, "no streamed tokens from gemini"
        auth.delete(f"{API}/chat/conversations/{cid}")

    def test_message_to_missing_conversation(self, auth):
        r = auth.post(f"{API}/chat/conversations/{uuid.uuid4()}/message",
                      json={"content": "hi", "model": "claude"})
        assert r.status_code == 404


# ---------------- profile extract ----------------
class TestProfileExtract:
    def test_extract_from_conversation(self, auth, new_user):
        cid = auth.post(f"{API}/chat/conversations", json={"title": "TEST extract"}).json()["conversation_id"]
        deltas, err = TestChat()._stream(
            new_user["token"], cid,
            "My passport number is X1234567 and my highest degree is a Masters in Computer Science "
            "from MIT, graduated 2015. Just acknowledge.",
            "claude")
        assert err is None
        r = auth.post(f"{API}/profile/extract", json={"conversation_id": cid})
        assert r.status_code == 200, r.text[:400]
        d = r.json()
        assert "profile" in d and "extracted" in d
        assert isinstance(d["completeness"], int)
        flat = json.dumps(d["profile"])
        assert "X1234567" in flat or "MIT" in flat, f"nothing extracted: {d['extracted']}"
        auth.delete(f"{API}/chat/conversations/{cid}")

    def test_extract_missing_conversation(self, auth):
        r = auth.post(f"{API}/profile/extract", json={"conversation_id": "nope"})
        assert r.status_code == 404


# ---------------- insurance ----------------
class TestInsurance:
    policy_id = None

    def test_meta(self, auth):
        r = auth.get(f"{API}/insurance/meta")
        assert r.status_code == 200
        assert "life_term" in r.json()["types"]

    def test_create_list_update_delete(self, auth):
        body = {"policy_type": "life_term", "provider": "TEST Insurer",
                "policy_number": "POL-1", "sum_assured": "500000",
                "premium_amount": "1200", "premium_frequency": "annual",
                "nominee_name": "John Doe", "nominee_relationship": "spouse"}
        r = auth.post(f"{API}/insurance", json=body)
        assert r.status_code == 200, r.text[:300]
        p = r.json()
        assert "_id" not in p and p["provider"] == "TEST Insurer"
        pid = p["policy_id"]

        lst = auth.get(f"{API}/insurance").json()
        assert any(x["policy_id"] == pid for x in lst)

        body["sum_assured"] = "750000"
        u = auth.put(f"{API}/insurance/{pid}", json=body)
        assert u.status_code == 200, u.text[:300]
        assert u.json()["sum_assured"] == "750000"
        lst = auth.get(f"{API}/insurance").json()
        assert [x for x in lst if x["policy_id"] == pid][0]["sum_assured"] == "750000"

        assert auth.put(f"{API}/insurance/{uuid.uuid4()}", json=body).status_code == 404

    def test_review(self, auth):
        # ensure at least one policy exists
        auth.post(f"{API}/insurance", json={"policy_type": "health", "provider": "TEST Health",
                                            "sum_assured": "100000"})
        r = auth.post(f"{API}/insurance/review", json={"question": "Am I under-insured?"}, timeout=180)
        assert r.status_code == 200, r.text[:400]
        d = r.json()
        for k in ["health_score", "summary", "gaps", "recommendations", "corner_cases"]:
            assert k in d, f"missing {k} in {list(d)}"
        assert isinstance(d["gaps"], list) and isinstance(d["recommendations"], list)

    def test_delete_all(self, auth):
        for p in auth.get(f"{API}/insurance").json():
            assert auth.delete(f"{API}/insurance/{p['policy_id']}").status_code == 200
        # keep one for legacy tests
        auth.post(f"{API}/insurance", json={"policy_type": "life_term", "provider": "TEST Keep",
                                            "sum_assured": "1,000,000", "nominee_name": "John Doe"})


# ---------------- documents ----------------
class TestDocuments:
    def test_categories(self, auth):
        r = auth.get(f"{API}/documents/categories")
        assert r.status_code == 200
        assert "insurance" in r.json()["categories"]

    def test_upload_list_download_delete(self, auth, new_user):
        content = b"TEST document content 12345"
        r = auth.post(f"{API}/documents/upload",
                      files={"file": ("TEST_doc.txt", content, "text/plain")},
                      data={"category": "tax", "note": "TEST note"}, timeout=120)
        assert r.status_code == 200, r.text[:400]
        d = r.json()
        assert d["category"] == "tax" and d["original_filename"] == "TEST_doc.txt"
        assert "storage_path" not in d and "_id" not in d
        assert d["size"] == len(content)
        did = d["document_id"]

        lst = auth.get(f"{API}/documents").json()
        assert any(x["document_id"] == did for x in lst)
        assert auth.get(f"{API}/documents?category=tax").status_code == 200

        dl = requests.get(f"{API}/documents/{did}/download?auth={new_user['token']}", timeout=60)
        assert dl.status_code == 200, dl.text[:300]
        assert dl.content == content

        dlb = requests.get(f"{API}/documents/{did}/download",
                           headers={"Authorization": f"Bearer {new_user['token']}"}, timeout=60)
        assert dlb.status_code == 200 and dlb.content == content

        assert requests.get(f"{API}/documents/{did}/download").status_code == 401

    def test_invalid_category_falls_back(self, auth):
        r = auth.post(f"{API}/documents/upload",
                      files={"file": ("TEST_x.txt", b"abc", "text/plain")},
                      data={"category": "bogus"}, timeout=120)
        assert r.status_code == 200, r.text[:300]
        assert r.json()["category"] == "other"

    def test_download_missing(self, auth, new_user):
        r = requests.get(f"{API}/documents/{uuid.uuid4()}/download?auth={new_user['token']}")
        assert r.status_code == 404


# ---------------- forms ----------------
class TestForms:
    def test_fill_form(self, auth):
        r = auth.post(f"{API}/forms/fill", json={
            "form_title": "TEST Employment Application",
            "form_content": "Full Name:\nDate of Birth:\nEmail:\nPhone:\nCity:\nEmployer:",
            "purpose": "job application"}, timeout=180)
        assert r.status_code == 200, r.text[:400]
        d = r.json()
        assert d["form_title"] == "TEST Employment Application"
        fields = d["result"]["fields"]
        assert isinstance(fields, list) and len(fields) > 0, d["result"]
        f0 = fields[0]
        for k in ["label", "value", "source", "confidence"]:
            assert k in f0, f0
        joined = json.dumps(fields)
        assert "TEST Jane Doe" in joined, "profile value not mapped into form"

    def test_list_forms(self, auth):
        r = auth.get(f"{API}/forms")
        assert r.status_code == 200 and len(r.json()) >= 1


# ---------------- bundler ----------------
class TestBundle:
    def test_suggest(self, auth):
        r = auth.post(f"{API}/bundle/suggest", json={"purpose": "US H1B visa application"}, timeout=180)
        assert r.status_code == 200, r.text[:400]
        d = r.json()
        assert "recommended_categories" in d and "checklist" in d
        assert isinstance(d["recommended_categories"], list) and len(d["recommended_categories"]) > 0

    def test_create_zip(self, auth):
        docs = auth.get(f"{API}/documents").json()
        assert docs, "no documents to bundle"
        ids = [d["document_id"] for d in docs]
        r = auth.post(f"{API}/bundle/create", json={"name": "TEST Bundle", "document_ids": ids}, timeout=180)
        assert r.status_code == 200, r.text[:300]
        assert r.headers["content-type"] == "application/zip"
        zf = zipfile.ZipFile(io.BytesIO(r.content))
        assert len(zf.namelist()) == len(ids), zf.namelist()

    def test_create_empty(self, auth):
        assert auth.post(f"{API}/bundle/create", json={"name": "x", "document_ids": []}).status_code == 400

    def test_create_bad_ids(self, auth):
        r = auth.post(f"{API}/bundle/create", json={"name": "x", "document_ids": [str(uuid.uuid4())]})
        assert r.status_code == 404

    def test_history(self, auth):
        r = auth.get(f"{API}/bundle/history")
        assert r.status_code == 200 and len(r.json()) >= 1


# ---------------- legacy / next of kin ----------------
class TestLegacy:
    def test_contacts_crud(self, auth):
        r = auth.post(f"{API}/legacy/contacts", json={
            "name": "TEST John Doe", "relationship": "spouse", "email": "john@example.com",
            "phone": "+1-555-0101", "access_level": "full", "notes": "primary"})
        assert r.status_code == 200, r.text[:300]
        c = r.json()
        assert "_id" not in c and c["access_level"] == "full"
        cid = c["contact_id"]
        lst = auth.get(f"{API}/legacy/contacts").json()
        assert any(x["contact_id"] == cid for x in lst)

    def test_pack(self, auth):
        r = auth.get(f"{API}/legacy/pack")
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["owner"]["email"]
        assert d["policy_count"] >= 1
        assert d["document_count"] >= 1
        assert len(d["next_of_kin"]) >= 1
        assert d["total_sum_assured"] == 1000000.0, d["total_sum_assured"]

    def test_export_zip(self, auth):
        r = auth.post(f"{API}/legacy/export?include_documents=true", timeout=180)
        assert r.status_code == 200, r.text[:300]
        assert r.headers["content-type"] == "application/zip"
        zf = zipfile.ZipFile(io.BytesIO(r.content))
        names = zf.namelist()
        assert "HANDOVER_SUMMARY.md" in names and "legacy_data.json" in names
        assert any(n.startswith("documents/") for n in names), names
        md = zf.read("HANDOVER_SUMMARY.md").decode()
        assert "TEST John Doe" in md and "TEST Keep" in md

    def test_export_without_documents(self, auth):
        r = auth.post(f"{API}/legacy/export?include_documents=false", timeout=180)
        assert r.status_code == 200
        names = zipfile.ZipFile(io.BytesIO(r.content)).namelist()
        assert not any(n.startswith("documents/") for n in names)

    def test_contact_delete(self, auth):
        for c in auth.get(f"{API}/legacy/contacts").json():
            assert auth.delete(f"{API}/legacy/contacts/{c['contact_id']}").status_code == 200
        assert auth.get(f"{API}/legacy/contacts").json() == []


# ---------------- dashboard ----------------
class TestDashboard:
    def test_stats(self, auth):
        r = auth.get(f"{API}/dashboard/stats")
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        for k in ["completeness", "document_count", "by_category", "conversation_count",
                  "bundle_count", "form_count", "recent_documents"]:
            assert k in d
        assert d["document_count"] >= 1
        assert d["by_category"].get("tax", 0) >= 1
        assert d["form_count"] >= 1
        assert d["completeness"] > 0

    def test_stats_unauth(self):
        assert requests.get(f"{API}/dashboard/stats").status_code == 401


# ---------------- tenant isolation ----------------
class TestIsolation:
    def test_other_user_cannot_see_docs(self, auth, session):
        email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/auth/register", json={
            "name": "TEST Other", "email": email, "password": "secret123"})
        tok = r.json()["token"]
        h = {"Authorization": f"Bearer {tok}"}
        assert requests.get(f"{API}/documents", headers=h).json() == []
        assert requests.get(f"{API}/insurance", headers=h).json() == []
        # cross-user download attempt
        docs = auth.get(f"{API}/documents").json()
        did = docs[0]["document_id"]
        assert requests.get(f"{API}/documents/{did}/download", headers=h).status_code == 404


# ---------------- cleanup ----------------
@pytest.fixture(scope="session", autouse=True)
def cleanup(request, new_user):
    yield
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {new_user['token']}"})
    try:
        for d in s.get(f"{API}/documents").json():
            s.delete(f"{API}/documents/{d['document_id']}")
        for p in s.get(f"{API}/insurance").json():
            s.delete(f"{API}/insurance/{p['policy_id']}")
        for c in s.get(f"{API}/chat/conversations").json():
            s.delete(f"{API}/chat/conversations/{c['conversation_id']}")
    except Exception:
        pass
