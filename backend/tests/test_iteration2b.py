"""Follow-up probes: attachment with gemini model, and no-empty-assistant-on-error."""
import os
import json
import uuid

import pytest
import requests
from dotenv import dotenv_values

fe = dotenv_values("/app/frontend/.env")
API = (os.environ.get("REACT_APP_BACKEND_URL") or fe["REACT_APP_BACKEND_URL"]).rstrip("/") + "/api"


@pytest.fixture(scope="module")
def h():
    email = f"test_it2b_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register",
                      json={"name": "TEST It2b", "email": email, "password": "secret123"}, timeout=60)
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _stream(h, cid, body):
    r = requests.post(f"{API}/chat/conversations/{cid}/message", headers=h, json=body,
                      stream=True, timeout=240)
    assert r.status_code == 200, r.text[:300]
    full, errors = "", []
    for line in r.iter_lines():
        if line and line.startswith(b"data: "):
            ev = json.loads(line[6:])
            if "delta" in ev:
                full += ev["delta"]
            if "error" in ev:
                errors.append(ev["error"])
    return full, errors


def test_attachment_with_gemini(h):
    content = b"Policy number GEM-9902 for term life insurance."
    att = requests.post(f"{API}/chat/upload", headers=h,
                        files={"file": ("TEST_pol.txt", content, "text/plain")}, timeout=120).json()
    cid = requests.post(f"{API}/chat/conversations", headers=h,
                        json={"title": "TEST gem"}, timeout=60).json()["conversation_id"]
    full, errors = _stream(h, cid, {
        "content": "What policy number is in the attached file? Answer briefly.",
        "model": "gemini",
        "attachments": [{"attachment_id": att["attachment_id"], "filename": att["filename"],
                         "content_type": att["content_type"]}],
    })
    print("GEMINI REPLY:", full[:300], "ERRORS:", errors)
    assert not errors, f"gemini attachment stream error: {errors}"
    assert "9902" in full, full[:300]

    msgs = requests.get(f"{API}/chat/conversations/{cid}/messages", headers=h, timeout=60).json()
    assert len(msgs) == 2
    requests.delete(f"{API}/chat/conversations/{cid}", headers=h, timeout=60)


def test_no_empty_assistant_message_on_error(h):
    """Claude + attachment currently errors -> verify nothing empty is persisted."""
    att = requests.post(f"{API}/chat/upload", headers=h,
                        files={"file": ("TEST_err.txt", b"data", "text/plain")}, timeout=120).json()
    cid = requests.post(f"{API}/chat/conversations", headers=h,
                        json={"title": "TEST err"}, timeout=60).json()["conversation_id"]
    full, errors = _stream(h, cid, {
        "content": "Read this", "model": "claude",
        "attachments": [{"attachment_id": att["attachment_id"], "filename": att["filename"],
                         "content_type": att["content_type"]}],
    })
    msgs = requests.get(f"{API}/chat/conversations/{cid}/messages", headers=h, timeout=60).json()
    print("ERRORS:", errors, "MSGS:", [(m["role"], m["content"][:40]) for m in msgs])
    assistants = [m for m in msgs if m["role"] == "assistant"]
    assert all(m["content"].strip() for m in assistants), "empty assistant message persisted"
    requests.delete(f"{API}/chat/conversations/{cid}", headers=h, timeout=60)
