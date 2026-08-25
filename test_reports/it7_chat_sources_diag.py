"""Diag: which docs get cited for a generic (non-document) chat question."""
import json, requests
from dotenv import dotenv_values

fe = dotenv_values("/app/frontend/.env")
BASE = fe["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
s = requests.Session()
r = s.post(f"{BASE}/auth/login", json={"email": "demo@example.com", "password": "demo123"}, timeout=60)
s.headers["Authorization"] = f"Bearer {r.json()['token']}"

docs = s.get(f"{BASE}/documents", timeout=60).json()
print("docs:", [(d["original_filename"], d["category"]) for d in docs])

c = s.post(f"{BASE}/chat/conversations", json={"title": "TEST_it7 generic"}, timeout=60)
print("create conv:", c.status_code, c.text[:200])
cid = c.json()["conversation_id"]

for q in ["In one short sentence, what is compound interest?", "Tell me a fun fact about the ocean."]:
    resp = s.post(f"{BASE}/chat/conversations/{cid}/message", json={"content": q, "model": "claude"}, timeout=300)
    print("\nQ:", q, "->", resp.status_code)
    txt = resp.text
    # streaming or json?
    try:
        d = resp.json()
        print("sources:", json.dumps(d.get("sources") or d.get("source_documents"), indent=1)[:600])
    except Exception:
        print("raw tail:", txt[-800:])

s.delete(f"{BASE}/chat/conversations/{cid}", timeout=60)
print("\nconversation deleted")
