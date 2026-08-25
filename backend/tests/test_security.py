"""Security-focused checks: session expiry enforcement + brute-force protection."""
import os
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


@pytest.fixture(scope="module")
def user_with_doc():
    email = f"test_sec_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={"name": "TEST Sec", "email": email, "password": "secret123"})
    assert r.status_code == 200, r.text[:300]
    token = r.json()["token"]
    h = {"Authorization": f"Bearer {token}"}
    up = requests.post(f"{API}/documents/upload", headers=h,
                       files={"file": ("TEST_sec.txt", b"secret bytes", "text/plain")},
                       data={"category": "identity"}, timeout=120)
    assert up.status_code == 200, up.text[:300]
    yield {"token": token, "email": email, "document_id": up.json()["document_id"]}
    requests.delete(f"{API}/documents/{up.json()['document_id']}", headers=h)


def test_expired_session_rejected_on_normal_endpoint(user_with_doc):
    token = user_with_doc["token"]
    db.user_sessions.update_one(
        {"session_token": token},
        {"$set": {"expires_at": datetime.now(timezone.utc) - timedelta(days=1)}},
    )
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401, "expired session should be rejected by get_current_user"


def test_expired_session_rejected_on_document_download(user_with_doc):
    """routes.user_from_token must also enforce expires_at (defence in depth)."""
    token = user_with_doc["token"]
    db.user_sessions.update_one(
        {"session_token": token},
        {"$set": {"expires_at": datetime.now(timezone.utc) - timedelta(days=1)}},
    )
    r = requests.get(f"{API}/documents/{user_with_doc['document_id']}/download?auth={token}", timeout=60)
    assert r.status_code == 401, (
        f"EXPIRED session still downloaded document (status={r.status_code}, "
        f"{len(r.content)} bytes). routes.user_from_token skips the expires_at check."
    )


def test_login_brute_force_lockout():
    email = f"test_bf_{uuid.uuid4().hex[:8]}@example.com"
    requests.post(f"{API}/auth/register", json={"name": "TEST BF", "email": email, "password": "secret123"})
    codes = []
    for _ in range(8):
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": "wrongpass"})
        codes.append(r.status_code)
    assert any(c in (423, 429) for c in codes), (
        f"No lockout/rate-limit after 8 failed logins; all responses were {codes}"
    )


def test_password_hash_never_returned(user_with_doc):
    r = requests.post(f"{API}/auth/login", json={"email": user_with_doc["email"], "password": "secret123"})
    assert r.status_code == 200
    body = r.text
    assert "password_hash" not in body and "$2b$" not in body
