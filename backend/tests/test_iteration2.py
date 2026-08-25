"""Iteration-2 focused tests: chat attachments, insurance partial update, expired-token download."""
import os
import io
import json
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

fe = dotenv_values("/app/frontend/.env")
be = dotenv_values("/app/backend/.env")
API = (os.environ.get("REACT_APP_BACKEND_URL") or fe["REACT_APP_BACKEND_URL"]).rstrip("/") + "/api"
mongo = MongoClient(be["MONGO_URL"])
db = mongo[be["DB_NAME"]]

TIMEOUT = 200


@pytest.fixture(scope="module")
def user():
    email = f"test_it2_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register",
                      json={"name": "TEST It2", "email": email, "password": "secret123"}, timeout=60)
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    yield {"email": email, "token": d["token"], "user_id": d["user"]["user_id"]}
    db.users.delete_many({"email": email})


@pytest.fixture(scope="module")
def h(user):
    return {"Authorization": f"Bearer {user['token']}"}


# ---------------- NEW: chat attachments ----------------
class TestChatAttachments:
    def test_upload_and_message_with_attachment(self, h, user):
        content = b"Invoice number A-4471. Total amount due: 5200 INR. Vendor: Acme Insurance."
        up = requests.post(f"{API}/chat/upload", headers=h,
                           files={"file": ("TEST_invoice.txt", content, "text/plain")}, timeout=120)
        assert up.status_code == 200, up.text[:400]
        att = up.json()
        for k in ("attachment_id", "filename", "content_type", "size"):
            assert k in att, f"missing {k} in {att}"
        assert att["filename"] == "TEST_invoice.txt"
        assert att["size"] == len(content)

        conv = requests.post(f"{API}/chat/conversations", headers=h,
                             json={"title": "TEST attach"}, timeout=60)
        assert conv.status_code == 200, conv.text[:300]
        cid = conv.json()["conversation_id"]

        body = {
            "content": "What is the invoice number in the attached file? Answer briefly.",
            "model": "claude",
            "attachments": [{"attachment_id": att["attachment_id"],
                             "filename": att["filename"],
                             "content_type": att["content_type"]}],
        }
        r = requests.post(f"{API}/chat/conversations/{cid}/message", headers=h,
                          json=body, stream=True, timeout=TIMEOUT)
        assert r.status_code == 200, r.text[:400]
        full, errors = "", []
        for line in r.iter_lines():
            if not line or not line.startswith(b"data: "):
                continue
            ev = json.loads(line[6:])
            if "delta" in ev:
                full += ev["delta"]
            if "error" in ev:
                errors.append(ev["error"])
        assert not errors, f"stream error: {errors}"
        assert len(full.strip()) > 0, "empty assistant reply"
        assert "4471" in full or "A-4471" in full, f"model did not read the attachment: {full[:400]}"

        msgs = requests.get(f"{API}/chat/conversations/{cid}/messages", headers=h, timeout=60).json()
        assert len(msgs) == 2, msgs
        umsg = [m for m in msgs if m["role"] == "user"][0]
        assert umsg.get("attachments"), "persisted user message missing attachments"
        assert umsg["attachments"][0]["filename"] == "TEST_invoice.txt"
        assert [m for m in msgs if m["role"] == "assistant"][0]["content"].strip()

        requests.delete(f"{API}/chat/conversations/{cid}", headers=h, timeout=60)

    def test_upload_requires_auth(self):
        r = requests.post(f"{API}/chat/upload",
                          files={"file": ("x.txt", b"x", "text/plain")}, timeout=60)
        assert r.status_code in (401, 403), r.status_code

    def test_message_with_bogus_attachment_still_streams(self, h):
        cid = requests.post(f"{API}/chat/conversations", headers=h,
                            json={"title": "TEST bogus"}, timeout=60).json()["conversation_id"]
        r = requests.post(f"{API}/chat/conversations/{cid}/message", headers=h, stream=True,
                          json={"content": "Hi", "model": "claude",
                                "attachments": [{"attachment_id": "nope", "filename": "a.txt",
                                                 "content_type": "text/plain"}]},
                          timeout=TIMEOUT)
        assert r.status_code == 200
        text = r.text
        assert '"delta"' in text, text[:300]
        requests.delete(f"{API}/chat/conversations/{cid}", headers=h, timeout=60)


# ---------------- FIX: insurance partial update ----------------
class TestInsurancePartialUpdate:
    def test_partial_update_preserves_unset_fields(self, h):
        create = requests.post(f"{API}/insurance", headers=h, json={
            "policy_type": "term_life", "provider": "TEST Old Provider",
            "policy_number": "TP-1", "nominee_name": "TEST Spouse",
            "nominee_relationship": "spouse", "sum_assured": "10000000",
        }, timeout=60)
        assert create.status_code == 200, create.text[:300]
        pid = create.json()["policy_id"]

        upd = requests.put(f"{API}/insurance/{pid}", headers=h,
                           json={"provider": "TEST New Provider"}, timeout=60)
        assert upd.status_code == 200, (
            f"partial update rejected (status={upd.status_code}): {upd.text[:300]}")
        d = upd.json()
        assert d["provider"] == "TEST New Provider"
        assert d["nominee_name"] == "TEST Spouse", f"unset field wiped: {d}"
        assert d["policy_number"] == "TP-1", f"unset field wiped: {d}"
        assert d["sum_assured"] == "10000000"

        got = requests.get(f"{API}/insurance", headers=h, timeout=60).json()
        row = [p for p in got if p["policy_id"] == pid][0]
        assert row["provider"] == "TEST New Provider"
        assert row["nominee_name"] == "TEST Spouse"
        requests.delete(f"{API}/insurance/{pid}", headers=h, timeout=60)

    def test_update_missing_policy_404(self, h):
        r = requests.put(f"{API}/insurance/{uuid.uuid4()}", headers=h,
                         json={"policy_type": "term_life", "provider": "X"}, timeout=60)
        assert r.status_code == 404, r.status_code


# ---------------- REGRESSION-FIX: expired session on download ----------------
class TestExpiredSessionDownload:
    def test_expired_bearer_rejected(self):
        email = f"test_exp_{uuid.uuid4().hex[:8]}@example.com"
        reg = requests.post(f"{API}/auth/register",
                            json={"name": "TEST Exp", "email": email, "password": "secret123"}, timeout=60)
        token = reg.json()["token"]
        hh = {"Authorization": f"Bearer {token}"}
        up = requests.post(f"{API}/documents/upload", headers=hh,
                           files={"file": ("TEST_exp.txt", b"secret bytes", "text/plain")},
                           data={"category": "identity"}, timeout=120)
        assert up.status_code == 200, up.text[:300]
        doc_id = up.json()["document_id"]

        ok = requests.get(f"{API}/documents/{doc_id}/download", headers=hh, timeout=60)
        assert ok.status_code == 200 and ok.content == b"secret bytes", (ok.status_code, ok.content[:50])

        db.user_sessions.update_one({"session_token": token},
                                    {"$set": {"expires_at": datetime.now(timezone.utc) - timedelta(days=1)}})
        for label, kwargs in (("bearer", {"headers": hh}), ("query", {})):
            url = f"{API}/documents/{doc_id}/download" + ("" if label == "bearer" else f"?auth={token}")
            r = requests.get(url, timeout=60, **kwargs)
            assert r.status_code == 401, f"expired session via {label} returned {r.status_code}"
        db.users.delete_many({"email": email})


# ---------------- REGRESSION-FIX: brute force lockout ----------------
class TestLockout:
    def test_lockout_after_5_failures(self):
        email = f"test_lock_{uuid.uuid4().hex[:8]}@example.com"
        requests.post(f"{API}/auth/register",
                      json={"name": "TEST Lock", "email": email, "password": "secret123"}, timeout=60)
        codes = []
        for _ in range(6):
            codes.append(requests.post(f"{API}/auth/login",
                                       json={"email": email, "password": "wrong"}, timeout=60).status_code)
        assert 423 in codes, f"no lockout: {codes}"
        good = requests.post(f"{API}/auth/login", json={"email": email, "password": "secret123"}, timeout=60)
        assert good.status_code == 423, f"correct password while locked returned {good.status_code}"
        db.users.delete_many({"email": email})
